import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";
import { createApproval } from "../src/lib/security.ts";

const secret = "fresh-quote-test-secret-at-least-thirty-two-characters";
const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const dates = { checkIn: day(30), checkOut: day(32), guests: 2 };
const text = () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "I already used the latest quote. Approve the booking below." } }] });
const quoteCall = (args: unknown) => Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name: "create_quote", arguments: JSON.stringify(args) } }] } }] });
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
async function fixture() {
  const store = createStore(":memory:"); store.ensureTenant("alice");
  const businesses = createBusinessSkills(store, "alice"), business = businesses.list()[0], room = businesses.search({}).find(item => item.businessId === business.id)!;
  const chat = createAgentChat(store, "alice");
  globalThis.fetch = async () => quoteCall({ listingId: room.id, ...dates });
  const quote = (await chat.send(business.id, { message: "Prepare a quote" })).quote!;
  const reservation = chat.confirm(business.id, { quoteId: quote.id, approved: true, idempotencyKey: "initial",
    approval: createApproval("alice", "agent-book", `${business.id}:${quote.id}`, secret) }, secret).reservation!;
  store.cancelReservation("alice", reservation.id);
  const message = `Check current availability for ${room.name} for 2 guests from ${dates.checkIn} to ${dates.checkOut}, and prepare a fresh test quote for a new stay. Do not book or confirm anything.`;
  return { store, chat, business, room, quote, message, canceled: store.listReservations("alice")[0] };
}

test("a fresh quote after cancellation requires a new stored quote and never reuses the canceled booking", async () => mocked(async () => {
  const { store, chat, business, room, quote, message, canceled } = await fixture(); let calls = 0; const choices: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    calls++;
    choices.push(JSON.parse(String(options?.body)).tool_choice);
    return calls === 1 ? text() : quoteCall({ listingId: room.id, ...dates });
  };
  const result = await chat.send(business.id, { message });
  assert.equal(calls, 2);
  assert.ok(choices.every(choice => JSON.stringify(choice) === JSON.stringify({ type: "function", function: { name: "create_quote" } })));
  assert.ok(result.quote); assert.notEqual(result.quote.id, quote.id);
  assert.equal(result.quote.reservationId, undefined); assert.equal(result.reservation, undefined);
  assert.equal(result.quote.checkIn, dates.checkIn); assert.equal(result.quote.guests, 2);
  assert.match(result.reply, /No room has been reserved/);
  assert.deepEqual(store.listReservations("alice"), [canceled]);
  store.close();
}));

test("new stays after cancellation ask for missing dates or guests and honor negation", async () => mocked(async () => {
  for (const message of [`Prepare a fresh quote for ${dates.checkIn} to ${dates.checkOut}.`, "Prepare a new quote for 2 guests.", "Do not prepare a fresh quote for a new stay."]) {
    const { store, chat, business, room, canceled } = await fixture();
    globalThis.fetch = async () => { throw new Error("Missing or negated details must not call inference"); };
    const result = await chat.send(business.id, { message });
    assert.match(result.reply, message.startsWith("Do not") ? /No new quote/ : /check-in.*check-out.*guest/i);
    assert.deepEqual(store.listReservations("alice"), [canceled]);
    if (!message.startsWith("Do not")) {
      assert.equal(result.quote, undefined);
      globalThis.fetch = async () => quoteCall({ listingId: room.id, ...dates });
      const completed = await chat.send(business.id, { message: `${dates.checkIn} to ${dates.checkOut}, 2 guests.` });
      assert.ok(completed.quote); assert.equal(completed.quote.reservationId, undefined);
    }
    store.close();
  }
}));

test("failed fresh requests remove the old quote and reject invented stay details", async () => mocked(async () => {
  for (const failure of ["text", "dates", "guests"] as const) {
    const { store, chat, business, room, message, canceled } = await fixture();
    globalThis.fetch = async () => failure === "text" ? text() : quoteCall({ listingId: room.id, ...dates, ...(failure === "dates" ? { checkOut: day(33) } : { guests: 1 }) });
    if (failure === "text") await assert.rejects(chat.send(business.id, { message }), /did not prepare/);
    else assert.match((await chat.send(business.id, { message })).reply, /requested dates and guest count/);
    assert.equal(chat.read(business.id).quote, undefined);
    assert.deepEqual(store.listReservations("alice"), [canceled]);
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM quotes WHERE tenant_id=?").get("alice")!.count, 1);
    store.close();
  }
}));
