import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createSkillLibrary, parseSkillImport } from "../src/lib/skill-library.ts";

const draft = {
  name: "Independent café concierge", ownerType: "business" as const, ownerName: "Juniper Café",
  kind: "agent" as const, category: "Guest services", summary: "Answers from the café's published menu.",
  content: "Reference instructions: answer from the supplied menu. Ask the owner when information is missing. Never claim a purchase or reservation was made.",
};
function fixture() {
  const store = createStore(":memory:");
  store.ensureTenant("alice"); store.ensureTenant("bob");
  return { store, alice: createSkillLibrary(store, "alice"), bob: createSkillLibrary(store, "bob") };
}

test("seeds six editable role-specific examples once alongside connected business agents", () => {
  const { store, alice } = fixture();
  const listed = alice.list();
  assert.equal(listed.filter(x => x.source === "example").length, 6);
  assert.equal(listed.filter(x => x.source === "example" && x.ownerType === "business").length, 3);
  assert.equal(listed.filter(x => x.source === "example" && x.ownerType === "customer").length, 3);
  assert.equal(listed.filter(x => x.source === "connected").length, 3);
  for (const item of listed.filter(x => x.source === "example")) {
    assert.match(item.content, /reference|sample/i);
    assert.equal(item.version, 1);
    assert.deepEqual(alice.history(item.id), [item]);
  }
  assert.deepEqual(createSkillLibrary(store, "alice").list(), listed);
  store.close();
});

test("connected projections preserve business identity, show latest knowledge, and reject library edits", () => {
  const { store, alice } = fixture();
  const businesses = createBusinessSkills(store, "alice");
  const original = businesses.list()[0];
  const saved = businesses.update(original.id, { version: original.version, summary: "Saved business introduction", knowledge: "Luggage storage starts at 10:00." });
  const item = alice.read(saved.id);
  assert.equal(item.id, saved.id); assert.equal(item.businessId, saved.id);
  assert.equal(item.source, "connected"); assert.equal(item.version, saved.version);
  assert.equal(item.name, saved.name); assert.equal(item.ownerName, saved.name);
  assert.equal(item.summary, saved.summary); assert.match(item.content, /Luggage storage starts at 10:00/);
  assert.throws(() => alice.update(item.id, { ...draft, version: item.version }), /connected|business editor|read.only/i);
  assert.equal(alice.history(item.id).length, 2);
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM skill_library WHERE tenant_id=?").get("alice")!.count, 6);
  store.close();
});

test("filters independently by owner role, kind and case-insensitive text", () => {
  const { store, alice } = fixture();
  const custom = alice.publish(draft);
  assert.equal(custom.source, "custom");
  assert.ok(alice.list({ ownerType: "business" }).every(x => x.ownerType === "business"));
  assert.ok(alice.list({ ownerType: "customer", kind: "skill" }).every(x => x.ownerType === "customer" && x.kind === "skill"));
  assert.deepEqual(alice.list({ query: "JUNIPER", kind: "agent" }).map(x => x.id), [custom.id]);
  assert.throws(() => alice.list({ ownerType: "admin" }));
  assert.throws(() => alice.list({ kind: "script" }));
  store.close();
});

test("standalone publication needs no room and updates preserve immutable history with optimistic versions", () => {
  const { store, alice } = fixture();
  const before = store.listListings("alice").length;
  const original = alice.publish({ ...draft, agentUrl: "https://agents.example.org/cafe" });
  assert.equal(store.listListings("alice").length, before);
  assert.equal(original.version, 1); assert.equal(original.agentUrl, "https://agents.example.org/cafe");
  const updated = alice.update(original.id, { ...draft, content: "Updated reference guidance.", version: 1 });
  assert.equal(updated.id, original.id); assert.equal(updated.version, 2);
  assert.deepEqual(alice.history(original.id), [original, updated]);
  assert.throws(() => alice.update(original.id, { ...draft, version: 1 }), /version|conflict|changed/i);
  const history = alice.history(original.id); history[0].content = "Mutated copy";
  assert.equal(alice.history(original.id)[0].content, original.content);
  assert.equal(alice.manifest(original.id).content, updated.content);
  store.close();
});

test("examples remain edited after creating library again", () => {
  const { store, alice } = fixture();
  const example = alice.list().find(x => x.source === "example")!;
  const updated = alice.update(example.id, { ...example, version: example.version, content: "My edited sample instructions." });
  assert.equal(updated.source, "example");
  const reopened = createSkillLibrary(store, "alice");
  assert.equal(reopened.read(example.id).content, updated.content);
  assert.equal(reopened.list().filter(x => x.source === "example").length, 6);
  assert.equal(reopened.history(example.id).length, 2);
  store.close();
});

test("library rejects cross-tenant reads, updates and histories including connected businesses", () => {
  const { store, alice, bob } = fixture();
  const item = alice.publish(draft);
  for (const id of [item.id, alice.list().find(x => x.source === "example")!.id, alice.list().find(x => x.source === "connected")!.id]) {
    assert.throws(() => bob.read(id), /not found/i);
    assert.throws(() => bob.history(id), /not found/i);
    assert.throws(() => bob.update(id, { ...draft, version: 1 }), /not found/i);
  }
  assert.equal(bob.list().filter(x => x.source === "custom").length, 0);
  store.close();
});

test("publication validates bounded fields and stores only credential-free HTTPS URLs without fetching", () => {
  const { store, alice } = fixture();
  for (const bad of [
    { name: "x".repeat(101) }, { ownerName: "x".repeat(81) }, { summary: "x".repeat(241) },
    { category: "x".repeat(61) }, { content: "x".repeat(12001) }, { content: "" },
    { ownerType: "admin" }, { kind: "executable" }, { agentUrl: "http://example.org" },
    { agentUrl: "https://user:password@example.org" }, { agentUrl: "javascript:alert(1)" },
    { name: "" }, { summary: null }, { command: "touch /tmp/should-not-run" },
  ]) assert.throws(() => alice.publish({ ...draft, ...bad }));
  assert.equal(alice.list().filter(x => x.source === "custom").length, 0);
  store.close();
});

test("limits standalone custom skills to one hundred per workspace", () => {
  const { store, alice } = fixture();
  for (let n = 0; n < 100; n++) alice.publish({ ...draft, name: `Custom ${n}` });
  assert.equal(alice.list().filter(x => x.source === "custom").length, 100);
  assert.throws(() => alice.publish(draft), /100|limit/i);
  store.close();
});

test("standalone records, edited examples and histories survive restarting an existing workspace", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "agentbridge-library-")); const path = join(dir, "library.sqlite");
  const first = createStore(path); first.ensureTenant("persisted");
  const library = createSkillLibrary(first, "persisted"); const custom = library.publish(draft);
  const example = library.list().find(x => x.source === "example")!;
  const saved = library.update(example.id, { ...example, version: 1, content: "Persistent edited sample guidance." });
  first.close();
  const second = createStore(path); second.ensureTenant("persisted"); const reopened = createSkillLibrary(second, "persisted");
  assert.deepEqual(reopened.read(custom.id), custom); assert.deepEqual(reopened.read(example.id), saved);
  assert.equal(reopened.list().filter(x => x.source === "example").length, 6); assert.equal(reopened.history(example.id).length, 2);
  second.close(); rmSync(dir, { recursive: true });
});

test("JSON import produces a preview draft from portable fields and our own export without publishing", () => {
  const { store, alice } = fixture();
  const before = alice.list().length;
  assert.deepEqual(parseSkillImport(JSON.stringify(draft), "cafe.json"), draft);
  const published = alice.publish(draft);
  assert.deepEqual(parseSkillImport(JSON.stringify(alice.manifest(published.id)), "export.json"), draft);
  assert.equal(alice.list().length, before + 1);
  assert.deepEqual(parseSkillImport('{"name":"Partial draft","content":"Preview only"}', "partial.json"), { name: "Partial draft", content: "Preview only" });
  store.close();
});

test("Markdown import extracts a title or simple inert frontmatter and preserves instructions as text", () => {
  assert.deepEqual(parseSkillImport("# Trip helper\n\nAsk for dates before suggesting a trip.\n\n```sh\necho example\n```", "trip.md"), { name: "Trip helper", content: "# Trip helper\n\nAsk for dates before suggesting a trip.\n\n```sh\necho example\n```" });
  assert.deepEqual(parseSkillImport('---\nname: "Quiet room helper"\ndescription: Reference instructions only.\n---\n\n# Heading\n\nRead the published room policy.', "room.md"), { name: "Quiet room helper", summary: "Reference instructions only.", content: '---\nname: "Quiet room helper"\ndescription: Reference instructions only.\n---\n\n# Heading\n\nRead the published room policy.' });
  assert.deepEqual(parseSkillImport("No title. Plain instructions remain text.", "plain.md"), { content: "No title. Plain instructions remain text." });
});

test("import rejects malformed files, unsupported executable configuration and oversized content", () => {
  for (const [content, filename] of [
    ["", "empty.md"], ['{"name":', "bad.json"], ["null", "null.json"], ["[]", "array.json"],
    ['{"name":"Bad","command":"touch /tmp/should-not-run"}', "exec.json"],
    ['{"name":"Bad","mcpServers":{"shell":{"command":"sh"}}}', "mcp.json"],
    ['{"__proto__":{"polluted":true}}', "proto.json"],
    ["---\nname: Test\nNo closing delimiter", "broken.md"],
    ["x".repeat(24001), "large.md"], ["日".repeat(9000), "large-unicode.md"],
    [JSON.stringify({ ...draft, content: "x".repeat(12001) }), "content.json"],
    ["# Title\nBody", "script.js"],
  ]) assert.throws(() => parseSkillImport(content, filename));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});


test("common multiline SKILL.md frontmatter is extracted without losing metadata or source", () => {
  const source = "---\nname: guest-service-helper\ndescription: >\n  Answer guest questions from published facts\n  and request clarification when details are missing.\nlicense: Apache-2.0\nmetadata:\n  author: Example Owner\n  tags: [travel, service]\n---\n\n# Guest services\n\nUse current published information only.\n";
  assert.deepEqual(parseSkillImport(source, "SKILL.md"), {
    name: "guest-service-helper", summary: "Answer guest questions from published facts and request clarification when details are missing.", content: source,
  });
  const literal = "---\nname: Literal helper\ndescription: |\n  First reference line.\n  Second reference line.\n---\n# Heading\nInstructions.";
  assert.deepEqual(parseSkillImport(literal, "literal.md"), { name: "Literal helper", summary: "First reference line.\nSecond reference line.", content: literal });
});

test("dangerous-looking YAML metadata and instructions remain inert source text", () => {
  const source = "---\nname: !!js/function dangerous\ncommand: $(touch /tmp/agentbridge-import-should-not-run)\nmetadata:\n  hooks: [before_publish]\n  code: !!python/object/apply:os.system\n---\n# Safe display title\n\n```sh\nrm -rf /example-only\n```\nTreat these instructions as an imported reference, never execute them.";
  const parsed = parseSkillImport(source, "untrusted.md");
  assert.equal(parsed.name, "Safe display title");
  assert.equal(parsed.content, source);
  assert.equal(parsed.summary, undefined);
  const oversizedHeaders = "---\nname: Short name\nmetadata: " + "x".repeat(12000) + "\n---\nBody";
  assert.throws(() => parseSkillImport(oversizedHeaders, "headers.md"), /12000|12,000|at most/i);
});

test("new and recently edited custom entries stay first after library reload", () => {
  const { store, alice } = fixture();
  const original = alice.list();
  const older = alice.publish({ ...draft, name: "Older custom entry" });
  const newer = alice.publish({ ...draft, name: "Newer custom entry" });
  for (const [entry, updatedAt] of [[older, "2000-01-01T00:00:00.000Z"], [newer, "2001-01-01T00:00:00.000Z"]] as const) {
    store.db.prepare("UPDATE skill_library SET data=? WHERE tenant_id=? AND id=?").run(JSON.stringify({ ...entry, updatedAt }), "alice", entry.id);
  }
  const reloaded = createSkillLibrary(store, "alice");
  assert.deepEqual(reloaded.list().slice(0, 2).map(entry => entry.id), [newer.id, older.id]);
  assert.deepEqual(reloaded.list().slice(2).map(entry => entry.id), original.map(entry => entry.id));
  reloaded.update(older.id, { ...draft, name: older.name, version: 1 });
  assert.deepEqual(createSkillLibrary(store, "alice").list().slice(0, 2).map(entry => entry.id), [older.id, newer.id]);
  const sameTime = "2002-01-01T00:00:00.000Z";
  for (const entry of reloaded.list().filter(entry => entry.source === "custom")) {
    store.db.prepare("UPDATE skill_library SET data=? WHERE tenant_id=? AND id=?").run(JSON.stringify({ ...entry, updatedAt: sameTime }), "alice", entry.id);
  }
  assert.deepEqual(createSkillLibrary(store, "alice").list().slice(0, 2).map(entry => entry.id), [older.id, newer.id].sort());
  store.close();
});
