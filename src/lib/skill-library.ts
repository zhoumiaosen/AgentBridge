import { createHash, randomUUID } from "node:crypto";
import { createBusinessSkills, type BusinessSkill } from "./business-skills.ts";
import type { createStore } from "./store.ts";
import { createAgentPublications, validateVisibility, type AgentVisibility } from "./agent-publications.ts";

export type ServiceOffer = { title: string; items: Array<{ label: string; amountCents: number }> };
export type LibrarySkill = {
  id: string;
  name: string;
  ownerType: "business" | "customer";
  ownerName: string;
  kind: "agent" | "skill";
  category: string;
  summary: string;
  content: string;
  source: "example" | "custom" | "connected";
  version: number;
  updatedAt: string;
  businessId?: string;
  agentUrl?: string;
  serviceOffer?: ServiceOffer;
  visibility?: AgentVisibility;
  canEdit?: boolean;
};
export type LibraryDraft = Pick<LibrarySkill, "name" | "ownerType" | "ownerName" | "kind" | "category" | "summary" | "content" | "agentUrl" | "serviceOffer" | "visibility">;
type Query = { query?: string; ownerType?: string; kind?: string };
const portableFields = ["name", "ownerType", "ownerName", "kind", "category", "summary", "content", "agentUrl", "serviceOffer", "visibility"];
const generatedFields = ["id", "source", "version", "updatedAt", "businessId", "canEdit"];
const limits: Record<string, number> = { name: 100, ownerName: 80, category: 60, summary: 240, content: 12000 };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Skill data must be a JSON object.");
  return value as Record<string, unknown>;
}
export function validateServiceOffer(input: unknown): ServiceOffer {
  const value = object(input);
  if (Object.keys(value).some(key => !["title", "items"].includes(key)) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 120)
    throw new Error("Use a service title under 121 characters and a list of prices in USD.");
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 8)
    throw new Error("A test service offer needs 1 to 8 price items.");
  const items = value.items.map(raw => {
    const item = object(raw);
    if (Object.keys(item).some(key => !["label", "amountCents"].includes(key)) || typeof item.label !== "string" || !item.label.trim() || item.label.length > 120 || typeof item.amountCents !== "number" || !Number.isSafeInteger(item.amountCents) || item.amountCents < 0 || item.amountCents > 1000000)
      throw new Error("Each service price needs a label under 121 characters and a nonnegative amount in whole cents.");
    return { label: item.label.trim(), amountCents: item.amountCents };
  });
  const total = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (total <= 0 || total > 1000000) throw new Error("The test service total must be greater than $0 and at most $10,000 USD.");
  return { title: value.title.trim(), items };
}
function draft(input: unknown, partial = false, allowGenerated = false): Partial<LibraryDraft> {
  const raw = object(input);
  if (Object.keys(raw).some(key => !portableFields.includes(key) && !(allowGenerated && generatedFields.includes(key)))) throw new Error("Unsupported skill field. Executable configuration is not imported.");
  const result: Record<string, unknown> = {};
  for (const key of portableFields) {
    if (!Object.hasOwn(raw, key)) {
      if (!partial && key !== "agentUrl" && key !== "serviceOffer" && key !== "visibility") throw new Error(`${key} is required.`);
      continue;
    }
    const value = raw[key];
    if (key === "visibility") { result[key] = validateVisibility(value); continue; }
    if (key === "serviceOffer") {
      result[key] = validateServiceOffer(value);
      continue;
    }
    if (typeof value !== "string") throw new Error(`${key} must be text.`);
    if (key === "ownerType") {
      if (value !== "business" && value !== "customer") throw new Error("Choose business or customer.");
    } else if (key === "kind") {
      if (value !== "agent" && value !== "skill") throw new Error("Choose agent or skill.");
    } else if (key === "agentUrl") {
      if (!value.trim()) continue;
      if (value.length > 2048) throw new Error("Agent URL must be at most 2,048 characters.");
      let url: URL;
      try { url = new URL(value); } catch { throw new Error("Use a valid HTTPS agent URL."); }
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Agent URL must use HTTPS without embedded credentials.");
      result[key] = url.href;
      continue;
    } else {
      if (value.length > limits[key]) throw new Error(`${key} must be at most ${limits[key]} characters.`);
      if (!partial && key !== "summary" && !value.trim()) throw new Error(`${key} is required.`);
    }
    result[key] = key === "content" ? value : value.trim();
  }
  if (result.serviceOffer && ((result.ownerType !== undefined && result.ownerType !== "business") || (result.kind !== undefined && result.kind !== "agent")))
    throw new Error("Only a business agent can publish a test service offer.");
  if (result.visibility === "public" && ((result.ownerType !== undefined && result.ownerType !== "business") || (result.kind !== undefined && result.kind !== "agent"))) throw new Error("Only business agents can be public. Personal entries stay private.");
  if (partial && !Object.keys(result).length) throw new Error("The file contains no editable skill fields.");
  return result as Partial<LibraryDraft>;
}

const examples: Array<{ key: string } & LibraryDraft> = [
  {
    key: "room-concierge", name: "Room concierge", ownerType: "business", ownerName: "Harbor House", kind: "agent", category: "Accommodation",
    summary: "Answer guest questions from a property's published information.",
    content: "Reference agent for an accommodation business. Ask for the property and dates. Read the host's current published rooms, prices, availability and policies before answering. Identify unknown details instead of inventing services. Prepare a quote only through an authorized connected service. Never claim a real booking, payment or inventory hold from these reference instructions alone; the customer must review and approve a supported transaction.",
  },
  {
    key: "cafe-guest-services", name: "Café guest services", ownerType: "business", ownerName: "Juniper Café", kind: "skill", category: "Food & hospitality",
    summary: "Explain a supplied menu and prepare questions for the café.",
    content: "Sample skill for a café. Use only the menu, hours, accessibility details and policies supplied by the owner. Ask about dietary requirements, but do not guarantee allergen safety or suitability without the café's explicit published information. When information is missing, prepare a question for staff. This sample has no live ordering, table inventory, payment or messaging connection; do not say an order or reservation was completed.",
  },
  {
    key: "cycle-guest-services", name: "Cycle shop service desk", ownerType: "business", ownerName: "Neighborhood Cycles", kind: "agent", category: "Repairs & services",
    summary: "Gather repair details and explain the shop's published service process.",
    content: "Reference agent for a bicycle service desk. Ask which bicycle and symptoms the customer wants the shop to inspect. Explain the owner's supplied service menu and distinguish fixed listed prices from estimates that require inspection. Record requested dates as preferences until an authorized scheduling service confirms a slot. Never invent parts inventory, diagnose a safety-critical fault as resolved, promise a final quote, or claim a real appointment or payment from this sample.",
  },
  {
    key: "trip-planner", name: "Personal trip planner", ownerType: "customer", ownerName: "Your personal AI", kind: "agent", category: "Travel planning",
    summary: "Turn travel preferences into a draft stay and itinerary plan.",
    content: "Reference personal travel agent. Ask for destination, dates, guests, budget and must-have preferences. Compare only accommodation facts returned by authorized business sources. Separate suggested activities from confirmed reservations and avoid invented opening hours or travel times. Present an itinerary draft and ask for approval before any supported transaction. This reference agent has no connected transport booking or payment service and cannot make real reservations by itself.",
  },
  {
    key: "accessibility-checklist", name: "Accessibility inquiry checklist", ownerType: "customer", ownerName: "Your personal AI", kind: "skill", category: "Accessible travel",
    summary: "Help a traveler ask specific questions about access requirements.",
    content: "Sample personal skill. Ask the traveler which access features matter to them without assuming a disability or sharing sensitive information. Compare requested features with published property facts, keeping each feature separate: step-free entry, doorway width, bathroom layout and lift access are different questions. Mark absent information as unconfirmed and prepare questions for the host. Do not certify accessibility or claim the host has answered, reserved a room, or accepted a request without an authorized result.",
  },
  {
    key: "work-trip", name: "Work trip preferences", ownerType: "customer", ownerName: "Your personal AI", kind: "skill", category: "Business travel",
    summary: "Apply a traveler's work-stay budget and practical preferences.",
    content: "Reference personal skill for work trips. Ask about nightly and total budget, meeting location, dates, workspace, Wi-Fi and preferred check-in time. Treat saved preferences as defaults that the current request may override. Compare published room facts and authoritative totals; do not assume a quiet room, internet speed, cancellation flexibility or walking distance. Show tradeoffs and prepare a plan. This sample does not book inventory, spend money or send requests to a host.",
  },
];

const catalogTenant = "agentbridge-example-catalog-v1";
const catalogOffers = [
  ["bike-repair", "Lantern Cycle Desk", "Repairs & services", "Bicycle bike repair: flat tire and inner tube replacement.", "Bicycle flat tire repair", [["Repair labor", 3500], ["Inner tube", 1200]]],
  ["home-cleaning", "Clover Home Care", "Home services", "Home house cleaning for kitchens, bathrooms and living rooms.", "Two-hour starter home clean", [["Cleaning labor", 7500], ["Cleaning supplies", 1000]]],
  ["pet-grooming", "Poppy Pet Studio", "Pet care", "Dog pet grooming, washing and brushing for small dogs.", "Small dog wash and brush", [["Wash and brush", 4000], ["Shampoo", 500]]],
  ["hair-salon", "Willow Hair Studio", "Beauty & grooming", "Hair salon haircuts, wash and simple styling.", "Haircut and wash", [["Haircut", 3000], ["Hair wash", 500]]],
  ["tutoring", "Maple Learning Desk", "Education", "Math mathematics tutoring, homework help and introductory lessons.", "Thirty-minute introductory math lesson", [["Tutoring session", 3000]]],
  ["cafe", "Morning Lantern Café", "Food & drink", "Café coffee, pastries and breakfast bundles for pickup inquiries.", "Coffee and pastry bundle for two", [["Two coffees", 1000], ["Two pastries", 800]]],
  ["tech-support", "Beacon Tech Help", "Technology support", "Computer laptop tech support, setup and software troubleshooting.", "Thirty-minute computer setup help", [["Technical support session", 4000]]],
  ["creative", "Paper Kite Creative", "Creative services", "Graphic design for posters, event flyers and social media artwork.", "Single-page event flyer draft", [["Design draft", 5000], ["One revision", 1000]]],
] as const;

function connected(business: BusinessSkill): LibrarySkill {
  return {
    id: business.id, businessId: business.id, name: business.name, ownerType: "business", ownerName: business.name,
    kind: "agent", category: "Accommodation", summary: business.summary,
    content: [business.summary, business.knowledge, "Connected capabilities: discover published stays, read owned room details, and prepare quotes. Customer approval is required for booking; this profile does not grant payment or transaction authority."].filter(Boolean).join("\n\n"),
    visibility: business.visibility || "private", canEdit: business.canEdit ?? true, source: "connected", version: business.version, updatedAt: business.updatedAt,
  };
}

const searchFillers = new Set(["a", "an", "and", "for", "of", "the", "to", "with", "agent", "skill", "service", "business", "shop"]);
const searchAliases: Record<string, string> = { bike: "bicycle", cycle: "bicycle", coffee: "cafe", coffeeshop: "cafe" };
const searchText = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function searchTokens(text: string): string[] {
  return text.split(" ").filter(Boolean).map(word => {
    const singular = word.length > 3 && word.endsWith("ies") ? word.slice(0, -3) + "y"
      : /(?:s|x|z|ch|sh)es$/.test(word) ? word.slice(0, -2)
      : word.length > 3 && /s$/.test(word) && !/(?:ss|us|is)$/.test(word) ? word.slice(0, -1) : word;
    return searchAliases[singular] || singular;
  });
}
export function skillSearchTerms(query: string): string[] {
  return searchTokens(searchText(query)).filter(word => !searchFillers.has(word));
}

export function createSkillLibrary(store: ReturnType<typeof createStore>, tenantId: string) {
  store.getPreferences(tenantId);
  const db = store.db;
  const publications = createAgentPublications(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_library (
      tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, source TEXT NOT NULL,
      version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS skill_library_history (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (tenant_id,id,version), FOREIGN KEY (tenant_id,id) REFERENCES skill_library(tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS skill_library_initialized (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id));
  `);
  function atomic<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function current(id: string): LibrarySkill | undefined {
    const row = db.prepare("SELECT data FROM skill_library WHERE tenant_id=? AND id=?").get(tenantId, id);
    return row ? decorate(JSON.parse(row.data as string) as LibrarySkill, tenantId) : undefined;
  }
  function decorate(skill: LibrarySkill, ownerTenantId: string): LibrarySkill {
    return { ...skill, visibility: publications.get(skill.id)?.owner_tenant_id === ownerTenantId ? "public" : "private", canEdit: ownerTenantId === tenantId };
  }
  function save(skill: LibrarySkill) {
    const { canEdit: _canEdit, ...saved } = skill;
    const data = JSON.stringify(saved);
    db.prepare("INSERT INTO skill_library (tenant_id,id,source,version,data) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET source=excluded.source,version=excluded.version,data=excluded.data").run(tenantId, skill.id, skill.source, skill.version, data);
    db.prepare("INSERT INTO skill_library_history (tenant_id,id,version,data) VALUES (?,?,?,?)").run(tenantId, skill.id, skill.version, data);
  }
  function insertExamples(ownerId: string, skills: LibrarySkill[]) {
    if (!skills.length) return;
    const rows = skills.map(skill => ({ ...skill, data: JSON.stringify(skill) }));
    db.prepare(`INSERT INTO skill_library(tenant_id,id,source,version,data) VALUES ${rows.map(() => "(?,?,?,?,?)").join(",")}`)
      .run(...rows.flatMap(row => [ownerId, row.id, row.source, row.version, row.data]));
    db.prepare(`INSERT INTO skill_library_history(tenant_id,id,version,data) VALUES ${rows.map(() => "(?,?,?,?)").join(",")}`)
      .run(...rows.flatMap(row => [ownerId, row.id, row.version, row.data]));
  }
  const initialized = () => db.prepare("SELECT tenant_id FROM skill_library_initialized WHERE tenant_id=?").get(tenantId);
  if (!initialized()) atomic(() => {
    if (initialized()) return;
    const skills = examples.map(({ key, ...example }): LibrarySkill => {
      const id = `library_${createHash("sha256").update(JSON.stringify([tenantId, key])).digest("hex").slice(0, 24)}`;
      return { ...example, id, source: "example", version: 1, updatedAt: new Date().toISOString() };
    });
    insertExamples(tenantId, skills);
    db.prepare("INSERT INTO skill_library_initialized VALUES (?)").run(tenantId);
  });
  const catalogIds = () => new Set(db.prepare("SELECT id FROM skill_library WHERE tenant_id=?").all(catalogTenant).map(row => row.id));
  const savedCatalogIds = catalogIds();
  if (catalogOffers.some(([key]) => !savedCatalogIds.has(`catalog_${key}`))) atomic(() => {
    const existing = catalogIds();
    db.prepare("INSERT OR IGNORE INTO tenants(id,created_at) VALUES (?,?)").run(catalogTenant, new Date().toISOString());
    const skills = catalogOffers.filter(([key]) => !existing.has(`catalog_${key}`)).map(([key, name, category, summary, title, prices]): LibrarySkill => {
      const id = `catalog_${key}`;
      return { id, name, ownerName: name, ownerType: "business", kind: "agent", category,
        summary: `Fictional example. ${summary}`, content: `Fictional example business for test conversations only. ${summary} Offer only the saved service scope and itemized prices. Ask for useful details before preparing the test quote. No real order, appointment, work, booking or payment is performed. The customer must review and explicitly approve the test quote; do not treat a chat message as approval. Never invent availability, stock, health or safety guarantees, extra fees or completed work.`,
        serviceOffer: { title, items: prices.map(([label, amountCents]) => ({ label, amountCents })) },
        source: "example", version: 1, updatedAt: new Date().toISOString(), visibility: "public" };
    });
    insertExamples(catalogTenant, skills);
    if (skills.length) db.prepare(`INSERT INTO agent_publications(skill_id,owner_tenant_id,source) VALUES ${skills.map(() => "(?,?,?)").join(",")}`)
      .run(...skills.flatMap(skill => [skill.id, catalogTenant, "library"]));
  });
  const businesses = createBusinessSkills(store, tenantId);
  function list(query: Query = {}): LibrarySkill[] {
    const raw = object(query);
    if (Object.keys(raw).some(key => !["query", "ownerType", "kind"].includes(key))) throw new Error("Unsupported Agent Hub filter.");
    if (query.query !== undefined && (typeof query.query !== "string" || query.query.length > 200)) throw new Error("Search must be at most 200 characters.");
    if (query.ownerType !== undefined && !["business", "customer", "all", ""].includes(query.ownerType)) throw new Error("Choose business or customer.");
    if (query.kind !== undefined && !["agent", "skill", "all", ""].includes(query.kind)) throw new Error("Choose agent or skill.");
    const rawText = (query.query || "").trim();
    const text = searchText(rawText);
    const tokens = skillSearchTerms(rawText);
    const matches = (skill: LibrarySkill) => {
      if (!rawText) return true;
      if (!text) return false;
      const haystack = searchText([skill.name, skill.ownerName, skill.category, skill.summary, skill.canEdit ? skill.content : "", skill.serviceOffer?.title || "", ...(skill.serviceOffer?.items.map(item => item.label) || [])].join(" "));
      if (haystack.includes(text)) return true;
      const words = new Set(searchTokens(haystack));
      // Require every service term, so a broader phrase cannot silently drop its business domain.
      return tokens.length > 0 && tokens.every(word => words.has(word));
    };
    const standalone = db.prepare("SELECT data FROM skill_library WHERE tenant_id=? ORDER BY rowid").all(tenantId).map(row => decorate(JSON.parse(row.data as string) as LibrarySkill, tenantId));
    const shared = db.prepare("SELECT s.data,s.tenant_id FROM skill_library s JOIN agent_publications p ON p.skill_id=s.id AND p.owner_tenant_id=s.tenant_id AND p.source='library' WHERE s.tenant_id!=?").all(tenantId).map(row => decorate(JSON.parse(row.data as string) as LibrarySkill, row.tenant_id as string));
    const custom = standalone.filter(skill => skill.source === "custom").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return [...custom, ...standalone.filter(skill => skill.source !== "custom"), ...shared, ...businesses.discover().map(connected)].filter(skill =>
      (!query.ownerType || query.ownerType === "all" || skill.ownerType === query.ownerType) &&
      (!query.kind || query.kind === "all" || skill.kind === query.kind) &&
      matches(skill)
    );
  }
  function read(id: string): LibrarySkill {
    if (typeof id !== "string" || !id || id.length > 200) throw new Error("Agent Hub entry not found.");
    const saved = current(id);
    if (saved) return saved;
    const business = businesses.current(id);
    if (business) return connected(business);
    throw new Error("Agent Hub entry not found.");
  }
  function resolve(id: string, options: { allowExistingBooking?: boolean } = {}): { skill: LibrarySkill; ownerTenantId: string } {
    if (typeof id !== "string" || !id || id.length > 200) throw new Error("Agent Hub entry not found.");
    const owned = current(id);
    if (owned) return { skill: owned, ownerTenantId: tenantId };
    const publication = publications.get(id);
    if (publication?.source === "library") {
      const row = db.prepare("SELECT data FROM skill_library WHERE tenant_id=? AND id=?").get(publication.owner_tenant_id, id);
      if (row) {
        const skill = JSON.parse(row.data as string) as LibrarySkill;
        if (skill.ownerType === "business" && skill.kind === "agent") return { skill: decorate(skill, publication.owner_tenant_id), ownerTenantId: publication.owner_tenant_id };
      }
    }
    try { const resolved = businesses.resolve(id, options); return { skill: connected(resolved.business), ownerTenantId: resolved.ownerTenantId }; }
    catch { throw new Error("Agent Hub entry not found."); }
  }
  function publish(input: unknown): LibrarySkill {
    const portable = draft(input) as LibraryDraft;
    return atomic(() => {
      const count = db.prepare("SELECT count(*) AS count FROM skill_library WHERE tenant_id=? AND source='custom'").get(tenantId)!.count as number;
      if (count >= 100) throw new Error("This workspace supports up to 100 custom Agent Hub entries.");
      const saved: LibrarySkill = { ...portable, id: `library_${randomUUID()}`, source: "custom", version: 1, updatedAt: new Date().toISOString(), visibility: portable.visibility || "private", canEdit: true };
      publications.set(tenantId, saved.id, "library", saved.visibility!);
      save(saved); return saved;
    });
  }
  function update(id: string, input: unknown): LibrarySkill {
    const existing = read(id);
    if (existing.source === "connected") throw new Error("Connected agents are read-only in Agent Hub. Use the business editor to update their saved knowledge.");
    const raw = object(input);
    if (typeof raw.version !== "number" || !Number.isSafeInteger(raw.version) || raw.version < 1) throw new Error("A valid expected version is required.");
    const portable = draft(raw, false, true) as LibraryDraft;
    return atomic(() => {
      const previous = current(id);
      if (!previous) throw new Error("Agent Hub entry not found.");
      if (previous.version !== raw.version) throw new Error("Agent Hub entry version conflict. Reload before saving.");
      const saved: LibrarySkill = { ...portable, id: previous.id, source: previous.source, version: previous.version + 1, updatedAt: new Date().toISOString(), visibility: portable.ownerType === "business" && portable.kind === "agent" ? portable.visibility || previous.visibility || "private" : "private", canEdit: true };
      publications.set(tenantId, saved.id, "library", saved.visibility!);
      save(saved); return saved;
    });
  }
  function setVisibility(id: string, visibility: unknown, version: number): LibrarySkill {
    const nextVisibility = validateVisibility(visibility);
    const saved = read(id);
    if (saved.source === "connected") return connected(businesses.setVisibility(id, nextVisibility, version));
    return update(id, { ...saved, visibility: nextVisibility, version });
  }
  function history(id: string): LibrarySkill[] {
    const saved = read(id);
    if (saved.source === "connected") return businesses.history(id).map(connected);
    return db.prepare("SELECT data FROM skill_library_history WHERE tenant_id=? AND id=? ORDER BY version").all(tenantId, id).map(row => ({ ...JSON.parse(row.data as string) as LibrarySkill, canEdit: true, visibility: (JSON.parse(row.data as string) as LibrarySkill).visibility || "private" }));
  }
  function manifest(id: string): LibrarySkill { return read(id); }
  return { list, read, resolve, current: resolve, publish, update, setVisibility, history, manifest };
}

function frontmatterValue(raw: string): string | undefined {
  const value = raw.trim();
  if (/^[!&*|>{[]/.test(value)) return undefined;
  if (value.startsWith('"')) {
    try { const decoded: unknown = JSON.parse(value); return typeof decoded === "string" ? decoded : undefined; } catch { return undefined; }
  }
  if (value.startsWith("'")) return /^'(?:[^']|'')*'$/.test(value) ? value.slice(1, -1).replaceAll("''", "'") : undefined;
  return value;
}

export function parseSkillImport(text: string, filename: string): Partial<LibraryDraft> {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 24000) throw new Error("Import files must be at most 24,000 bytes.");
  if (typeof filename !== "string" || !/\.(md|json)$/i.test(filename)) throw new Error("Import a Markdown (.md) or JSON (.json) file.");
  const content = text.replace(/^\uFEFF/, "");
  if (!content.trim()) throw new Error("The import file is empty.");
  if (/\.json$/i.test(filename)) {
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("The JSON file is malformed."); }
    const imported = draft(parsed, true, true);
    delete imported.visibility; // A file cannot grant permission to publish to other customers.
    return imported;
  }
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const imported: Record<string, unknown> = { content };
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closing < 0) throw new Error("Markdown frontmatter is missing its closing delimiter.");
    bodyStart = closing + 1;
    for (let index = 1; index < closing; index++) {
      const match = lines[index].match(/^(name|description):[ \t]*(.*)$/);
      if (!match) continue; // Unknown metadata remains inert in the complete source.
      const key = match[1] === "name" ? "name" : "summary";
      let value: string | undefined;
      if (key === "summary" && /^[>|][+-]?$/.test(match[2].trim())) {
        const block: string[] = [];
        while (index + 1 < closing && (!lines[index + 1].trim() || /^[ \t]/.test(lines[index + 1]))) block.push(lines[++index]);
        const indents = block.filter(line => line.trim()).map(line => line.match(/^[ \t]*/)![0].length);
        const indent = indents.length ? Math.min(...indents) : 0;
        value = block.map(line => line.slice(indent)).join("\n").trim();
        if (match[2].trim().startsWith(">")) value = value.replace(/([^\n])\n(?=[^\n])/g, "$1 ");
      } else value = frontmatterValue(match[2]);
      if (value !== undefined && value.length <= limits[key] && !Object.hasOwn(imported, key)) imported[key] = value;
    }
  }
  if (!imported.name) {
    const title = lines.slice(bodyStart).map(line => line.match(/^#\s+(.+?)\s*$/)).find(Boolean)?.[1];
    if (title && title.length <= limits.name) imported.name = title;
  }
  return draft(imported, true);
}
