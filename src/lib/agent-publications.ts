import type { createStore } from "./store.ts";

export type AgentVisibility = "private" | "public";
type Database = ReturnType<typeof createStore>["db"];
type Publication = { owner_tenant_id: string; source: "library" | "business" };

export function createAgentPublications(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_publications (
    skill_id TEXT PRIMARY KEY,
    owner_tenant_id TEXT NOT NULL REFERENCES tenants(id),
    source TEXT NOT NULL CHECK(source IN ('library','business'))
  )`);
  function get(id: string) {
    return db.prepare("SELECT owner_tenant_id,source FROM agent_publications WHERE skill_id=?").get(id) as Publication | undefined;
  }
  function set(ownerTenantId: string, id: string, source: Publication["source"], visibility: AgentVisibility) {
    const previous = get(id);
    if (previous && (previous.owner_tenant_id !== ownerTenantId || previous.source !== source)) throw new Error("Agent ownership conflict.");
    if (visibility === "public") db.prepare("INSERT INTO agent_publications(skill_id,owner_tenant_id,source) VALUES (?,?,?) ON CONFLICT(skill_id) DO NOTHING").run(id, ownerTenantId, source);
    else db.prepare("DELETE FROM agent_publications WHERE skill_id=? AND owner_tenant_id=?").run(id, ownerTenantId);
  }
  return { get, set };
}

export function validateVisibility(value: unknown): AgentVisibility {
  if (value !== "private" && value !== "public") throw new Error("Choose private or public visibility.");
  return value;
}
