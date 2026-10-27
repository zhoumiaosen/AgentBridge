import { createHash } from "node:crypto";
import type { createStore, Listing, Quote, QuoteInput, SearchFilters } from "./store.ts";

export type BusinessSkill = {
  id: string;
  name: string;
  category: "accommodation";
  listingIds: string[];
  capabilities: string[];
  requiresApproval: true;
  version: number;
  summary: string;
  knowledge: string;
  updatedAt: string;
  schemaVersion: "1.0";
};
export type BusinessListing = Listing & { businessId: string; businessName: string };
export type BusinessDetails = BusinessListing & {
  businessSkill: Pick<BusinessSkill, "version" | "summary" | "knowledge">;
};
export type BusinessQuote = Quote & { businessId: string; businessName: string; skillVersion: number };
export type SkillUpdate = { version: number; summary: string; knowledge: string };
type Row = { data: string; version: number };
type PropertySchema = { type: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; maxItems?: number; enum?: readonly string[]; pattern?: string; items?: PropertySchema };
type InputSchema = { type: "object"; properties: Record<string, PropertySchema>; required: readonly string[]; additionalProperties: false };
type Operation = { description: string; inputSchema: InputSchema };

const idSchema = { type: "string", minLength: 1, maxLength: 100 };
const dateSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const guestsSchema = { type: "integer", minimum: 1, maximum: 12 };
const schema = (properties: Record<string, PropertySchema>, required: readonly string[] = []): InputSchema => ({ type: "object", properties, required, additionalProperties: false });
const operations = {
  profile: { description: "Read this business's saved skill and current revision.", inputSchema: schema({}) },
  discover_stays: {
    description: "Discover only this business's published rooms. Provide both dates to check availability.",
    inputSchema: schema({
      checkIn: dateSchema, checkOut: dateSchema, guests: guestsSchema,
      maxNightlyCents: { type: "integer", minimum: 0, maximum: 1_000_000 },
      amenities: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 60 } },
      type: { type: "string", enum: ["hotel", "private", "any"] },
    }),
  },
  get_stay_details: { description: "Read a room owned by this business, including saved business knowledge.", inputSchema: schema({ listingId: idSchema }, ["listingId"]) },
  create_quote: {
    description: "Prepare a quote for an owned room. This cannot confirm a booking or take payment.",
    inputSchema: schema({ listingId: idSchema, checkIn: dateSchema, checkOut: dateSchema, guests: guestsSchema, reservationId: idSchema }, ["listingId", "checkIn", "checkOut", "guests"]),
  },
} satisfies Record<string, Operation>;
export type BusinessManifest = BusinessSkill & {
  protocol: "agentbridge.skill.v1";
  endpoint: string;
  operations: typeof operations;
};

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error("Skill input must be a JSON object.");
  }
  return input as Record<string, unknown>;
}
function validateValue(value: unknown, rule: PropertySchema, key: string) {
  if (rule.type === "string") {
    if (typeof value !== "string" || (rule.minLength !== undefined && value.trim().length < rule.minLength) || (rule.maxLength !== undefined && value.length > rule.maxLength) || (rule.enum && !rule.enum.includes(value)) || (rule.pattern && !new RegExp(rule.pattern).test(value))) {
      throw new Error(`Invalid skill input: ${key}.`);
    }
  } else if (rule.type === "integer") {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || (rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum)) throw new Error(`Invalid skill input: ${key}.`);
  } else if (rule.type === "array") {
    if (!Array.isArray(value) || (rule.maxItems !== undefined && value.length > rule.maxItems)) throw new Error(`Invalid skill input: ${key}.`);
    if (rule.items) for (const item of value) validateValue(item, rule.items, key);
  }
}
function validateInput(input: unknown, rule: InputSchema) {
  const args = object(input);
  if (Object.keys(args).some(key => !Object.hasOwn(rule.properties, key))) throw new Error("Unsupported skill input field.");
  for (const key of rule.required) if (!Object.hasOwn(args, key)) throw new Error(`Missing skill input: ${key}.`);
  for (const [key, value] of Object.entries(args)) validateValue(value, rule.properties[key], key);
  return args;
}

function displayBusinessName(listing: Listing): string {
  const aliases = [
    ["AgentBridge demo host", "The Pacific House", "A fictional boutique hotel with warm interiors, a quiet courtyard, and a dedicated workspace.", "Pacific House"],
    ["Maya · demo host", "A little room in the Sunset", "A fictional private room in a shared home near Golden Gate Park.", "Maya"],
    ["Alex · demo host", "The Mission Studio", "A fictional self-contained studio with a kitchenette.", "Alex"],
  ];
  const alias = aliases.find(([hostName, name, prefix]) => listing.hostName === hostName && listing.name === name && listing.description.startsWith(prefix));
  return alias ? alias[3] : listing.hostName;
}

export function createBusinessSkills(store: ReturnType<typeof createStore>, tenantId: string) {
  const db = store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_skills (
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS business_skill_history (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id, version),
      FOREIGN KEY (tenant_id, id) REFERENCES business_skills(tenant_id, id)
    );
  `);
  function atomic<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function businessId(hostName: string) {
    const normalized = hostName.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    return `business_${createHash("sha256").update(JSON.stringify([tenantId, normalized])).digest("hex").slice(0, 24)}`;
  }
  function current(id: string): BusinessSkill | undefined {
    const row = db.prepare("SELECT data,version FROM business_skills WHERE tenant_id=? AND id=?").get(tenantId, id) as Row | undefined;
    return row ? JSON.parse(row.data) as BusinessSkill : undefined;
  }
  function save(skill: BusinessSkill) {
    const data = JSON.stringify(skill);
    db.prepare("INSERT INTO business_skills (tenant_id,id,version,data) VALUES (?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET version=excluded.version,data=excluded.data").run(tenantId, skill.id, skill.version, data);
    db.prepare("INSERT INTO business_skill_history (tenant_id,id,version,data) VALUES (?,?,?,?)").run(tenantId, skill.id, skill.version, data);
  }
  // Backfill old listings and save a new snapshot when publishing changes a business's offers.
  function sync(): string[] {
    return atomic(() => {
      const groups = new Map<string, { name: string; listingIds: string[] }>();
      for (const listing of store.listListings(tenantId)) {
        const id = businessId(listing.hostName);
        const group = groups.get(id);
        if (group) group.listingIds.push(listing.id);
        else groups.set(id, { name: displayBusinessName(listing), listingIds: [listing.id] });
      }
      for (const [id, group] of groups) {
        const saved = current(id);
        if (!saved) {
          save({ id, name: group.name, category: "accommodation", listingIds: group.listingIds,
            capabilities: ["discover_stays", "get_stay_details", "create_quote"], requiresApproval: true,
            version: 1, summary: "", knowledge: "", updatedAt: new Date().toISOString(), schemaVersion: "1.0" });
        } else if (saved.name !== group.name || JSON.stringify(saved.listingIds) !== JSON.stringify(group.listingIds)) {
          save({ ...saved, name: group.name, listingIds: group.listingIds, version: saved.version + 1, updatedAt: new Date().toISOString() });
        }
      }
      return [...groups.keys()];
    });
  }
  function list(): BusinessSkill[] {
    return sync().map(id => current(id)!);
  }
  function profile(id: string): BusinessSkill {
    const skill = list().find(candidate => candidate.id === id);
    if (!skill) throw new Error("Business not found.");
    return skill;
  }
  function forListing(listingId: string): BusinessSkill {
    const skill = list().find(candidate => candidate.listingIds.includes(listingId));
    if (!skill) throw new Error("Business listing not found.");
    return skill;
  }
  function details(id: string, listingId: string): BusinessDetails {
    const skill = profile(id);
    if (!skill.listingIds.includes(listingId)) throw new Error("Listing does not belong to this business.");
    const listing = store.listListings(tenantId).find(candidate => candidate.id === listingId);
    if (!listing) throw new Error("Business listing not found.");
    return { ...listing, businessId: skill.id, businessName: skill.name, businessSkill: { version: skill.version, summary: skill.summary, knowledge: skill.knowledge } };
  }
  function search(filters: SearchFilters): BusinessListing[] {
    const skills = new Map(list().map(skill => [skill.id, skill]));
    return store.listListings(tenantId, filters).map(listing => {
      const id = businessId(listing.hostName);
      return { ...listing, businessId: id, businessName: skills.get(id)!.name };
    });
  }
  function quote(id: string, input: QuoteInput): BusinessQuote {
    const listing = details(id, input.listingId);
    return { ...store.createQuote(tenantId, input), businessId: listing.businessId, businessName: listing.businessName, skillVersion: listing.businessSkill.version };
  }
  function update(id: string, input: SkillUpdate): BusinessSkill {
    profile(id);
    const args = validateInput(input, schema({ version: { type: "integer", minimum: 1 }, summary: { type: "string", maxLength: 240 }, knowledge: { type: "string", maxLength: 4000 } }, ["version", "summary", "knowledge"]));
    return atomic(() => {
      const previous = current(id);
      if (!previous) throw new Error("Business not found.");
      if (previous.version !== args.version) throw new Error("Business skill version conflict. Reload the latest skill before saving.");
      const saved: BusinessSkill = { ...previous, summary: (args.summary as string).trim(), knowledge: (args.knowledge as string).trim(), version: previous.version + 1, updatedAt: new Date().toISOString() };
      save(saved);
      return saved;
    });
  }
  function history(id: string): BusinessSkill[] {
    profile(id);
    return db.prepare("SELECT data,version FROM business_skill_history WHERE tenant_id=? AND id=? ORDER BY version").all(tenantId, id).map(row => JSON.parse(row.data as string) as BusinessSkill);
  }
  function manifest(id: string): BusinessManifest {
    return { ...profile(id), protocol: "agentbridge.skill.v1", endpoint: `/api/businesses/${id}`, operations: structuredClone(operations) };
  }
  function validate(action: string, input: unknown) {
    if (!Object.hasOwn(operations, action)) throw new Error("Unsupported business skill action. No transaction was performed.");
    return validateInput(input, operations[action as keyof typeof operations].inputSchema);
  }
  function invoke(id: string, action: string, input: unknown) {
    const skill = profile(id);
    const args = validate(action, input);
    switch (action) {
      case "profile": return skill;
      case "discover_stays": return search(args as SearchFilters).filter(listing => skill.listingIds.includes(listing.id));
      case "get_stay_details": return details(id, args.listingId as string);
      case "create_quote": return quote(id, args as unknown as QuoteInput);
      default: throw new Error("Unsupported business skill action.");
    }
  }
  return { list, forListing, profile, search, details, quote, update, history, manifest, validate, invoke };
}
