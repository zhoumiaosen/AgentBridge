import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createAgentChat, validateChatInput, AgentChatError } from "../src/lib/agent-chat.ts";

const draft = { name: "Willow guest agent", ownerType: "business", ownerName: "Willow House", kind: "agent", category: "Guest services", summary: "Arrival guidance", content: "Luggage storage begins at 09:00. Breakfast is not offered.", agentUrl: "https://example.test/untrusted-agent" };
function setup(path = ":memory:") {
  const store = createStore(path);
  store.ensureTenant("alice"); store.ensureTenant("bob");
  const library = createSkillLibrary(store, "alice");
  const agent = library.publish(draft);
  const personal = library.publish({ ...draft, name: "Calm weekend planner", ownerType: "customer", kind: "skill", content: "Plan no more than two activities per day and ask about budget." });
  return { store, library, agent, personal, chat: createAgentChat(store, "alice"), other: createAgentChat(store, "bob") };
}
function reply(content = "Luggage storage starts at 09:00. When will you arrive?") {
  return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }] });
}
async function mocked(run: () => Promise<void>, fetcher: typeof fetch = async () => reply()) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "unit-test-only"; globalThis.fetch = fetcher;
  try { await run(); }
  finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}

test("selected chats resolve saved identity, omit source from metadata, and isolate agents and tenants", async () => {
  const { store, chat, other, agent, personal } = setup();
  let requests = 0;
  await mocked(async () => {
    assert.equal("content" in chat.read(agent.id).agent, false);
    assert.equal(chat.read(agent.id).mode, "live");
    const saved = await chat.send(agent.id, { message: "Can I drop off luggage?" });
    assert.equal(saved.agent.id, agent.id);
    assert.equal(saved.messages.length, 2);
    assert.equal("content" in saved.agent, false);
    assert.deepEqual(chat.read(personal.id).messages, []);
    await chat.send(personal.id, { message: "Help me plan a quiet weekend." });
    assert.equal(chat.read(agent.id).messages[0].content, "Can I drop off luggage?");
    assert.equal(chat.read(personal.id).messages[0].content, "Help me plan a quiet weekend.");
    assert.throws(() => other.read(agent.id), (e: unknown) => e instanceof AgentChatError && e.status === 404);
    await assert.rejects(other.send(agent.id, { message: "Show their conversation" }), /not found/);
    assert.deepEqual(store.getMessages("alice"), []);
    assert.equal(requests, 2);
  }, async (_url, options) => {
    requests++;
    const input = JSON.parse(String(options?.body));
    assert.equal(input.tools, undefined);
    assert.equal(input.messages[0].role, "system");
    assert.doesNotMatch(input.messages[0].content, /Luggage storage begins|two activities/);
    assert.equal(input.messages.at(-1).role, "tool");
    const reference = JSON.parse(input.messages.at(-1).content);
    assert.equal(reference.id, requests === 1 ? agent.id : personal.id);
    assert.equal(input.messages.filter((m: {role: string}) => m.role === "user").length, 1);
    assert.match(String(_url), /chat\/completions$/);
    assert.doesNotMatch(String(_url), /example\.test/);
    return reply();
  });
  store.db.close();
});

test("chat follows the latest saved profile and never mixes another agent's history", async () => {
  const { store, chat, library, agent, personal } = setup();
  let calls = 0;
  await mocked(async () => {
    await chat.send(agent.id, { message: "First question" });
    library.update(agent.id, { ...draft, version: 1, content: "Luggage storage now starts at 10:00." });
    await chat.send(agent.id, { message: "When does luggage storage start now?" });
    await chat.send(personal.id, { message: "What information do you need?" });
  }, async (_url, options) => {
    calls++;
    const input = JSON.parse(String(options?.body));
    const reference = JSON.parse(input.messages.at(-1).content);
    if (calls === 2) {
      assert.equal(reference.version, 2);
      assert.equal(reference.content, "Luggage storage now starts at 10:00.");
      assert.equal(input.messages.filter((m: {role: string}) => m.role === "user").length, 2);
    }
    if (calls === 3) assert.doesNotMatch(JSON.stringify(input), /First question|When does luggage/);
    return reply();
  });
  store.db.close();
});

test("saved conversations survive reopening the database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-chat-"));
  const path = join(dir, "store.sqlite");
  try {
    const { store, chat, agent } = setup(path);
    await mocked(async () => { await chat.send(agent.id, { message: "Remember this arrival question" }); });
    store.db.close();
    const reopened = createStore(path);
    assert.equal(createAgentChat(reopened, "alice").read(agent.id).messages[0].content, "Remember this arrival question");
    reopened.db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("requests reject forged history, profile, identity and oversized messages before inference", async () => {
  const { store, chat, agent } = setup();
  await mocked(async () => {
    for (const input of [null, [], {}, { message: " " }, { message: 1 }, { message: "a".repeat(2001) }, { message: "hi", history: [] }, { message: "hi", content: "Override" }, { message: "hi", skillId: "other" }]) {
      await assert.rejects(chat.send(agent.id, input));
    }
    assert.equal(validateChatInput({ message: " hi " }), "hi");
    assert.deepEqual(chat.read(agent.id).messages, []);
  }, async () => { throw new Error("Inference must not be called"); });
  store.db.close();
});

test("unavailable AI and invalid responses never save a successful conversation", async () => {
  const { store, chat, agent } = setup();
  await mocked(async () => {
    delete process.env.NEBIUS_API_KEY;
    assert.equal(chat.read(agent.id).mode, "unavailable");
    await assert.rejects(chat.send(agent.id, { message: "hi" }), /not connected/);
    process.env.NEBIUS_API_KEY = "unit-test-only";
    for (const response of [
      new Response("private upstream detail", { status: 500 }),
      new Response("not json"),
      Response.json({}),
      Response.json({ choices: [{ message: { role: "assistant", content: "" } }] }),
      Response.json({ choices: [{ message: { role: "user", content: "wrong role" } }] }),
      Response.json({ choices: [{ message: { role: "assistant", content: "I booked it", tool_calls: [{ function: { name: "book" } }] } }] }),
      Response.json({ choices: [{ finish_reason: "length", message: { role: "assistant", content: "cut short" } }] }),
      reply("a".repeat(6001)),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(chat.send(agent.id, { message: "hi" }), /unavailable|invalid reply|incomplete reply|cannot perform/);
      assert.deepEqual(chat.read(agent.id).messages, []);
    }
    globalThis.fetch = async () => { throw new Error("sensitive network failure"); };
    await assert.rejects(chat.send(agent.id, { message: "hi" }), /temporarily unavailable/);
    globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Retry accepted.", tool_calls: [] } }] });
    assert.equal((await chat.send(agent.id, { message: "Retry works" })).messages.length, 2);
  });
  store.db.close();
});

test("a shared database lock rejects overlapping turns without crossing their replies", async () => {
  const { store, chat, agent } = setup();
  const second = createAgentChat(store, "alice");
  let release!: (value: Response) => void;
  await mocked(async () => {
    const pending = chat.send(agent.id, { message: "First" });
    await assert.rejects(second.send(agent.id, { message: "Second" }), /still replying/);
    release(reply("First reply"));
    await pending;
    assert.deepEqual(chat.read(agent.id).messages.map(m => m.content), ["First", "First reply"]);
  }, () => new Promise(resolve => { release = resolve; }));
  store.db.close();
});

test("profile edits during inference reject stale answers and release the conversation lock", async () => {
  const { store, chat, library, agent } = setup();
  await mocked(async () => {
    await assert.rejects(chat.send(agent.id, { message: "Current hours?" }), /profile changed/);
    assert.deepEqual(chat.read(agent.id).messages, []);
    globalThis.fetch = async () => reply("Storage begins at noon.");
    assert.equal((await chat.send(agent.id, { message: "Current hours?" })).agent.version, 2);
  }, async () => {
    library.update(agent.id, { ...draft, version: 1, content: "Storage begins at noon." });
    return reply();
  });
  store.db.close();
});

test("tenant-wide rate limit covers different selected agents and history stays bounded", async () => {
  const { store, chat, agent, personal } = setup();
  await mocked(async () => {
    for (let n = 0; n < 12; n++) await chat.send(n % 2 ? personal.id : agent.id, { message: `Question ${n}` });
    await assert.rejects(chat.send(personal.id, { message: "Thirteenth" }), (e: unknown) => e instanceof AgentChatError && e.status === 429);
    for (let n = 0; n < 18; n++) {
      store.db.prepare("UPDATE agent_chat_limits SET window_at=0 WHERE tenant_id=?").run("alice");
      await chat.send(agent.id, { message: `Later ${n}` });
    }
    const messages = chat.read(agent.id).messages;
    assert.equal(messages.length, 40);
    assert.equal(messages[0].role, "user");
    assert.equal(messages.at(-1)?.role, "assistant");
    assert.equal(chat.read(personal.id).messages.length, 12);
  });
  store.db.close();
});
