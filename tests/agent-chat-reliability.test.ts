import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";

const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const call = (name: string, args: unknown, id = "call-1") => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const response = (toolCalls?: unknown[], finish = toolCalls ? "tool_calls" : "stop") => Response.json({ choices: [{ finish_reason: finish, message: { role: "assistant", content: toolCalls ? null : "I prepared the requested quote.", ...(toolCalls ? { tool_calls: toolCalls } : {}) } }] });
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
function fixture() {
  const store = createStore(":memory:"); store.ensureTenant("alice");
  const businesses = createBusinessSkills(store, "alice"), business = businesses.list()[0], room = businesses.search({}).find(item => item.businessId === business.id)!;
  const quote = store.createQuote("alice", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  const reservation = store.confirmQuote("alice", { quoteId: quote.id, idempotencyKey: "original" });
  const args = { listingId: room.id, reservationId: reservation.id, checkIn: day(35), checkOut: day(38), guests: 2 };
  const message = `Prepare a test date-change quote for booking ${reservation.confirmation}, check-in ${day(35)}, check-out ${day(38)}, keeping 2 guests.`;
  const chat = createAgentChat(store, "alice");
  const count = () => store.db.prepare("SELECT count(*) AS count FROM quotes WHERE tenant_id=?").get("alice")!.count;
  return { store, chat, business, room, reservation, args, message, count };
}

test("required date-change inference recovers missing tools and truncation before creating exactly one quote", async () => mocked(async () => {
  for (const failure of ["text", "length", "network"] as const) {
    const { store, chat, business, reservation, args, message, count } = fixture();
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const input = JSON.parse(String(options?.body));
      assert.deepEqual(input.tool_choice, { type: "function", function: { name: "create_quote" } });
      if (calls === 1 && failure === "text") return response();
      if (calls === 1 && failure === "length") return response([call("create_quote", args)], "length");
      if (calls === 1 && failure === "network") throw new TypeError("network interrupted");
      assert.equal(calls, 2, "No narration request is needed after the quote is saved");
      return response([call("create_quote", args)]);
    };
    const result = await chat.send(business.id, { message });
    assert.equal(calls, 2); assert.equal(count(), 2);
    assert.equal(result.dateChangePending, true); assert.equal(result.quote!.checkIn, args.checkIn);
    assert.match(result.reply, /original booking is unchanged/);
    assert.deepEqual(store.listReservations("alice"), [reservation]);
    store.close();
  }
}));

test("a retry after an accepted search keeps that result without executing the search again", async () => mocked(async () => {
  const { store, chat, business, room } = fixture(); let calls = 0;
  const transcript: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body));
    if (calls === 1) return response([call("discover_stays", { checkIn: day(40), checkOut: day(42), guests: 2 })]);
    transcript.push(body.messages);
    if (calls === 2) return new Response("transient", { status: 503 });
    return response();
  };
  const result = await chat.send(business.id, { message: `Find a room for ${day(40)} to ${day(42)}, 2 guests.` });
  assert.equal(calls, 3); assert.deepEqual(transcript[0], transcript[1]);
  assert.equal(result.listings![0].id, room.id); assert.equal(result.quote, undefined);
  assert.equal(result.messages.length, 2);
  store.close();
}));

test("schema-invalid and unsupported batches cannot partially prepare a quote", async () => mocked(async () => {
  for (const invalid of [call("get_stay_details", { listingId: "saved", invented: true }, "call-2"), call("confirm_booking", {}, "call-2")]) {
    const { store, chat, business, reservation, args, message, count } = fixture();
    globalThis.fetch = async () => response([call("create_quote", args), invalid]);
    await assert.rejects(chat.send(business.id, { message }), /Unsupported|unsupported/i);
    assert.equal(count(), 1); assert.deepEqual(store.listReservations("alice"), [reservation]);
    assert.deepEqual(chat.read(business.id).messages, []);
    store.close();
  }
}));

test("exhausted retries clear superseded approval but never change the saved booking", async () => mocked(async () => {
  const { store, chat, business, reservation, args, message, count } = fixture();
  globalThis.fetch = async () => response([call("create_quote", args)]);
  await chat.send(business.id, { message });
  const before = chat.read(business.id).messages; let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  await assert.rejects(chat.send(business.id, { message: message.replace(day(38), day(39)) }), /did not prepare/);
  assert.equal(calls, 3); assert.equal(count(), 2);
  assert.equal(chat.read(business.id).quote, undefined);
  assert.deepEqual(chat.read(business.id).messages, before);
  assert.deepEqual(store.listReservations("alice"), [reservation]);
  assert.equal(store.db.prepare("SELECT lock_token FROM agent_chat_threads WHERE tenant_id=? AND skill_id=?").get("alice", business.id)!.lock_token, null);
  store.close();
}));
