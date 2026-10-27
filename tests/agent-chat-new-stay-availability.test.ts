import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";
import { createApproval } from "../src/lib/security.ts";

const secret = "availability-test-secret-at-least-thirty-two-characters";
const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const response = (name: string, args: unknown) => Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
  tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
async function fixture() {
  const store = createStore(":memory:"); store.ensureTenant("alice");
  const businesses = createBusinessSkills(store, "alice"), business = businesses.list()[0], room = businesses.search({}).find(item => item.businessId === business.id)!;
  const chat = createAgentChat(store, "alice");
  globalThis.fetch = async () => response("create_quote", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  const quote = (await chat.send(business.id, { message: "Prepare a quote" })).quote!;
  const reservation = chat.confirm(business.id, { quoteId: quote.id, approved: true, idempotencyKey: "original",
    approval: createApproval("alice", "agent-book", `${business.id}:${quote.id}`, secret) }, secret).reservation!;
  const prompt = (start = 30, end = 32) => `Check ${room.name} for a new stay for 2 guests from ${day(start)} to ${day(end)}. If those dates are unavailable, explain the conflict and suggest nearby available two-night stays with their total prices in this chat. Keep my confirmed booking ${reservation.confirmation} unchanged; do not exclude it from availability. Do not book, change, cancel, or approve anything. Test only.`;
  const snapshot = () => JSON.stringify({ reservations: store.listReservations("alice"), quotes: store.db.prepare("SELECT * FROM quotes ORDER BY id").all(), nights: store.db.prepare("SELECT * FROM occupied_nights ORDER BY reservation_id,date").all() });
  return { store, chat, business, room, quote, reservation, prompt, snapshot };
}

test("new-stay availability counts the existing booking and suggests priced nearby ranges without mutations", async () => mocked(async () => {
  const { store, chat, business, room, quote, reservation, prompt, snapshot } = await fixture();
  const before = snapshot(); let requests = 0; let advertised: unknown;
  globalThis.fetch = async (_url, options) => {
    requests++; const body = JSON.parse(String(options?.body)); advertised = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
    return response("discover_stays", { checkIn: day(30), checkOut: day(32), guests: 2 });
  };
  const result = await chat.send(business.id, { message: prompt() });
  assert.notEqual(result.cancellationRequested, true);
  assert.match(result.reply, /unavailable|occupied/i);
  for (const date of [day(28), day(30), day(32), day(34), day(27), day(29)]) assert.ok(result.reply.includes(date));
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((room.nightlyCents * 2 + room.cleaningCents) / 100);
  assert.ok(result.reply.includes(total));
  assert.equal(result.quote!.id, quote.id); assert.deepEqual(result.reservation, reservation);
  assert.equal(result.dateAlternatives, undefined); assert.equal(requests, 1);
  assert.deepEqual(advertised, ["discover_stays"]); assert.equal(snapshot(), before);
  store.close();
}));

test("available new-stay dates and a negated action list keep the current confirmed booking", async () => mocked(async () => {
  const { store, chat, business, quote, reservation, prompt, snapshot } = await fixture();
  const before = snapshot();
  globalThis.fetch = async () => response("discover_stays", { checkIn: day(40), checkOut: day(42), guests: 2 });
  const result = await chat.send(business.id, { message: prompt(40, 42) });
  assert.match(result.reply, /is available/i); assert.ok(result.reply.includes(day(40)));
  assert.notEqual(result.cancellationRequested, true); assert.equal(result.quote!.id, quote.id);
  globalThis.fetch = async () => { throw new Error("The prohibited action list should use saved state"); };
  const keep = await chat.send(business.id, { message: "Do not book, change, cancel, or approve anything." });
  assert.notEqual(keep.cancellationRequested, true); assert.deepEqual(keep.reservation, reservation);
  assert.equal(snapshot(), before); store.close();
}));

test("read-only new-stay checks reject wrong tools and altered dates, guests or reservation exclusions", async () => mocked(async () => {
  for (const invalid of ["quote", "dates", "guests", "exclude"]) {
    const { store, chat, business, room, reservation, prompt, snapshot } = await fixture(); const before = snapshot();
    globalThis.fetch = async () => response(invalid === "quote" ? "create_quote" : "discover_stays", {
      checkIn: invalid === "dates" ? day(40) : day(30), checkOut: day(32), guests: invalid === "guests" ? 1 : 2,
      ...(invalid === "quote" ? { listingId: room.id } : invalid === "exclude" ? { reservationId: reservation.id } : {}),
    });
    if (invalid === "quote" || invalid === "exclude") await assert.rejects(chat.send(business.id, { message: prompt() }), /Unsupported|unsupported/);
    else assert.match((await chat.send(business.id, { message: prompt() })).reply, /requested dates and guest count/);
    assert.equal(snapshot(), before); assert.equal(chat.read(business.id).reservation!.id, reservation.id);
    store.close();
  }
}));
