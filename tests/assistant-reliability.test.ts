import { test } from "node:test";
import assert from "node:assert/strict";
import { assist } from "../src/lib/assistant.ts";
import { createStore } from "../src/lib/store.ts";

const base = { history: [], preferences: {}, listings: [] };
const textReply = (content: string, finish_reason = "stop") => Response.json({ choices: [{ finish_reason, message: { role: "assistant", content } }] });
const toolReply = (name: string, args: unknown, finish_reason = "tool_calls") => Response.json({ choices: [{ finish_reason, message: { role: "assistant", content: null, tool_calls: [{ id: "step", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
const quoteArgs = { listingId: "room-1", checkIn: "2026-12-10", checkOut: "2026-12-12", guests: 2 };
const quote = { ...quoteArgs, id: "quote-1", listingName: "Garden Room", businessName: "Garden House", nights: 2, nightlyCents: 14900, cleaningCents: 3000, totalCents: 32800, cancellation: "flexible" };
async function mocked(run: () => Promise<void>) {
  const fetchBefore = globalThis.fetch, keyBefore = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = fetchBefore; if (keyBefore === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = keyBefore; }
}

test("personal AI recovers from transient and incomplete inference without a manual retry", async () => mocked(async () => {
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? new Response("private provider detail", { status: 503 }) : requests === 2 ? textReply("", "length") : textReply("Tell me which business or skill you need.");
  const result = await assist({ ...base, message: "How can you help?" }, () => { throw new Error("No tools expected"); });
  assert.equal(requests, 3);
  assert.equal(result.mode, "live");
  assert.match(result.reply, /business or skill/);
}));

test("a truncated tool response executes nothing and a complete quote returns without another model call", async () => mocked(async () => {
  let requests = 0, executions = 0;
  globalThis.fetch = async () => toolReply("create_quote", quoteArgs, ++requests === 1 ? "length" : "tool_calls");
  const result = await assist({ ...base, message: "Prepare this test quote." }, name => { assert.equal(name, "create_quote"); executions++; return quote; });
  assert.equal(requests, 2);
  assert.equal(executions, 1);
  assert.deepEqual(result.quote, quote);
  assert.match(result.reply, /\$328/);
  assert.match(result.reply, /not a reservation/);
}));

test("retrying inference after a successful read does not replay that tool", async () => mocked(async () => {
  let requests = 0, reads = 0;
  globalThis.fetch = async () => ++requests === 1 ? toolReply("business_profile", { businessId: "cafe" }) : requests === 2 ? new Response("", { status: 502 }) : textReply("Invented opening hours");
  const result = await assist({ ...base, message: "What services does that business provide?" }, () => { reads++; return { id: "cafe", name: "Juniper Cafe", summary: "Coffee and pastries", knowledge: "Open 08:00–16:00." }; });
  assert.equal(reads, 1);
  assert.equal(requests, 3);
  assert.match(result.reply, /08:00–16:00/);
  assert.doesNotMatch(result.reply, /Invented/);
}));

test("failed business actions return the actual conflict without a quote or a false success", async () => mocked(async () => {
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? toolReply("create_quote", quoteArgs) : textReply("Your booking is confirmed and payment was taken.");
  const result = await assist({ ...base, message: "Prepare a test quote." }, () => { throw new Error("This room is not available for those dates."); });
  assert.equal(requests, 1);
  assert.equal(result.quote, undefined);
  assert.match(result.reply, /not available/);
  assert.doesNotMatch(result.reply, /booking is confirmed|payment was taken/);
}));

test("the entire model batch is validated before any tool executes", async () => mocked(async () => {
  let executions = 0;
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", tool_calls: [
    { id: "one", type: "function", function: { name: "create_quote", arguments: JSON.stringify(quoteArgs) } },
    { id: "two", type: "function", function: { name: "read_skill", arguments: JSON.stringify({ skillId: "profile", execute: true }) } },
  ] } }] });
  await assert.rejects(assist({ ...base, message: "Help with my request." }, () => { executions++; return quote; }), /unsupported action field/);
  assert.equal(executions, 0);
}));

test("conversation pairs save together only after both messages pass validation", () => {
  const store = createStore(":memory:"); store.ensureTenant("chat");
  assert.throws(() => store.addConversationTurn("chat", "Find a business", "x".repeat(12001)), /Message/);
  assert.deepEqual(store.getMessages("chat"), []);
  store.addConversationTurn("chat", "Find a business", "Choose a saved agent.");
  assert.deepEqual(store.getMessages("chat").map(message => ({ ...message })), [{ role: "user", content: "Find a business" }, { role: "assistant", content: "Choose a saved agent." }]);
  store.close();
});

test("explicit Agent Hub discovery requires a real search and plain text cannot claim an action", async () => mocked(async () => {
  let requests = 0, searches = 0;
  globalThis.fetch = async () => ++requests === 1 ? textReply("I found several agents.") : requests === 2 ? toolReply("search_skills", { ownerType: "business" }) : textReply("I booked everything.");
  const result = await assist({ ...base, message: "Find business agents" }, name => { assert.equal(name, "search_skills"); searches++; return [{ id: "cafe", name: "Juniper Cafe", summary: "Menu questions" }]; });
  assert.equal(searches, 1);
  assert.match(result.reply, /Juniper Cafe/);
  assert.doesNotMatch(result.reply, /booked everything/);
  globalThis.fetch = async () => textReply("I confirmed your reservation and charged your card.");
  const plain = await assist({ ...base, message: "What can you do?" }, () => undefined);
  assert.doesNotMatch(plain.reply, /I confirmed|charged your card/);
  assert.match(plain.reply, /approval/);
  for (const claim of ["Your booking is now confirmed.", "Your payment was processed successfully."]) {
    globalThis.fetch = async () => textReply(claim);
    const guarded = await assist({ ...base, message: "What can you do?" }, () => undefined);
    assert.notEqual(guarded.reply, claim);
    assert.match(guarded.reply, /approval/);
  }
}));
