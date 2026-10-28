import { randomUUID } from "node:crypto";
import { validateServiceOffer, type LibrarySkill, type ServiceOffer } from "./skill-library.ts";
import { verifyApproval } from "./security.ts";
import type { Store } from "./store.ts";

export type ServiceQuote = ServiceOffer & {
  id: string; skillId: string; profileVersion: number; totalCents: number;
  currency: "USD"; testOnly: true; status: "pending" | "approved";
  createdAt: string; expiresAt: string; approvedAt?: string;
};
export class ServiceQuoteError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function createServiceQuotes(store: Store, tenantId: string) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS agent_service_quotes (
    tenant_id TEXT NOT NULL REFERENCES tenants(id), skill_id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (tenant_id, skill_id)
  )`);
  function read(skillId: string): ServiceQuote | undefined {
    const row = db.prepare("SELECT data FROM agent_service_quotes WHERE tenant_id=? AND skill_id=?").get(tenantId, skillId);
    return row ? JSON.parse(row.data as string) as ServiceQuote : undefined;
  }
  function draft(agent: LibrarySkill): ServiceQuote {
    if (agent.ownerType !== "business" || agent.kind !== "agent" || !agent.serviceOffer)
      throw new ServiceQuoteError("This business agent has no saved service offer. Add test pricing before preparing a quote.");
    const offer = validateServiceOffer(agent.serviceOffer);
    const now = Date.now();
    return { ...offer, id: `service_${randomUUID()}`, skillId: agent.id, profileVersion: agent.version,
      totalCents: offer.items.reduce((sum, item) => sum + item.amountCents, 0), currency: "USD", testOnly: true,
      status: "pending", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString() };
  }
  function save(quote: ServiceQuote) {
    // The chat caller saves this together with its reply inside one transaction.
    db.prepare("INSERT INTO agent_service_quotes (tenant_id,skill_id,data) VALUES (?,?,?) ON CONFLICT(tenant_id,skill_id) DO UPDATE SET data=excluded.data")
      .run(tenantId, quote.skillId, JSON.stringify(quote));
  }
  function approve(skillId: string, input: unknown, approvalKey: string): ServiceQuote {
    const value = input as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["quoteId", "approval", "approved"].includes(key)) || value.approved !== true || typeof value.quoteId !== "string" || !value.quoteId || value.quoteId.length > 200 || typeof value.approval !== "string" || value.approval.length > 2048 || !verifyApproval(value.approval, tenantId, "agent-service", `${skillId}:${value.quoteId}`, approvalKey))
      throw new ServiceQuoteError("Please review and explicitly approve this test service quote.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const quote = read(skillId);
      if (!quote || quote.id !== value.quoteId || quote.skillId !== skillId || quote.testOnly !== true)
        throw new ServiceQuoteError("This is not the current service quote. Review a new quote.", 409);
      const hasThreads = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_chat_threads'").get();
      const current = hasThreads && db.prepare("SELECT locked_until FROM agent_chat_threads WHERE tenant_id=? AND skill_id=?").get(tenantId, skillId);
      if (current && Number(current.locked_until) > Date.now())
        throw new ServiceQuoteError("This agent is still replying. Please wait before approving.", 409);
      if (quote.status === "approved") { db.exec("COMMIT"); return quote; }
      if (quote.status !== "pending" || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now())
        throw new ServiceQuoteError("This service quote has expired. Request a new quote.", 409);
      const row = db.prepare("SELECT data FROM skill_library WHERE tenant_id=? AND id=?").get(tenantId, skillId);
      const agent = row ? JSON.parse(row.data as string) as LibrarySkill : undefined;
      if (!agent || agent.ownerType !== "business" || agent.kind !== "agent" || !agent.serviceOffer || agent.version !== quote.profileVersion || JSON.stringify(validateServiceOffer(agent.serviceOffer)) !== JSON.stringify({ title: quote.title, items: quote.items }))
        throw new ServiceQuoteError("The business profile or service prices changed. Request a new quote.", 409);
      const accepted: ServiceQuote = { ...quote, status: "approved", approvedAt: new Date().toISOString() };
      save(accepted);
      db.exec("COMMIT");
      return accepted;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  return { read, draft, save, approve };
}
