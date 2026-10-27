import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";

const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const response = (name?: string, args: unknown = {}) => Response.json({ choices: [{ finish_reason: name ? "tool_calls" : "stop", message: {
  role: "assistant", content: name ? null : "The room costs $298, but I have not checked availability.",
  ...(name ? { tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }] } : {}),
} }] });
async function fixture(run: (value: ReturnType<typeof setup>) => Promise<void>) {
  const value = setup(), original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(value); } finally { value.store.close(); globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
function setup() {
  const store = createStore(":memory:"); store.ensureTenant("alice"); store.ensureTenant("bob");
  const room = store.publishListing("alice", { ...store.listListings("alice")[0], name: "Willow House Garden Room", hostName: "Willow House", type: "private", nightlyCents: 13900, cleaningCents: 2000, amenities: ["Wi-Fi", "Step-free access", "Workspace"] });
  const businesses = createBusinessSkills(store, "alice"), business = businesses.forListing(room.id), chat = createAgentChat(store, "alice");
  const snapshot = () => JSON.stringify({ reservations: store.listReservations("alice"), quotes: store.db.prepare("SELECT * FROM quotes ORDER BY id").all(), nights: store.db.prepare("SELECT * FROM occupied_nights ORDER BY reservation_id,date").all() });
  return { store, room, businesses, business, chat, snapshot };
}

test("the first month-name/two-guests availability request checks the stay and returns a card without a quote", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T12:00:00Z") });
  await fixture(async ({ room, business, chat, snapshot }) => {
    const before = snapshot(); let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++; const body = JSON.parse(String(options?.body));
      if (body.tool_choice?.function?.name === "discover_stays") {
        assert.deepEqual(body.tools.map((tool: { function: { name: string } }) => tool.function.name), ["discover_stays"]);
        return response("discover_stays", { checkIn: "2026-11-20", checkOut: "2026-11-22", guests: 2 });
      }
      return calls === 1 ? response("get_stay_details", { listingId: room.id }) : response();
    };
    const result = await chat.send(business.id, { message: "Is your garden room available for November 20–22, 2026, for two guests? Please show the room and price. Do not prepare a quote or book anything yet." });
    assert.deepEqual(result.listings?.map(item => item.id), [room.id]);
    assert.match(result.reply, /2026-11-20.*2026-11-22/); assert.match(result.reply, /2 guests/); assert.match(result.reply, /\$298\.00/);
    assert.doesNotMatch(result.reply, /not checked/); assert.equal(calls, 1);
    assert.equal(result.quote, undefined); assert.equal(result.reservation, undefined); assert.equal(snapshot(), before);
  });
});

test("missing or ambiguous availability details ask before inference and never default guests", async () => {
  for (const message of [
    "Is your room available for two guests?",
    `Is your room available from ${day(30)} to ${day(32)}?`,
    `Is your room available maybe ${day(30)} to ${day(32)} or ${day(35)} to ${day(37)}, for two guests?`,
    `Is your room available from ${day(30)} to ${day(32)} for two or three guests?`,
  ]) await fixture(async ({ business, chat, snapshot }) => {
    const before = snapshot(); globalThis.fetch = async () => { throw new Error("Missing availability details must not be inferred"); };
    const result = await chat.send(business.id, { message });
    assert.match(result.reply, /check-in|check-out|guest count/i);
    assert.equal(result.quote, undefined); assert.equal(snapshot(), before);
  });
});

test("broad availability returns all matching owned cards and enforces budget and access constraints", async () => fixture(async ({ store, room, business, chat, snapshot }) => {
  const second = store.publishListing("alice", { ...room, name: "Willow Courtyard Room", nightlyCents: 14900 });
  store.publishListing("alice", { ...room, name: "Willow Premium Room", nightlyCents: 17900 });
  store.publishListing("alice", { ...room, name: "Willow Upstairs Room", amenities: ["Wi-Fi"] });
  store.publishListing("alice", { ...room, name: "Willow Simple Room", amenities: ["Wi-Fi", "Step-free access"] });
  const before = snapshot();
  globalThis.fetch = async () => response("discover_stays", { checkIn: day(30), checkOut: day(32), guests: 2, amenities: ["Workspace"] });
  const result = await chat.send(business.id, { message: `Which private rooms are available from ${day(30)} to ${day(32)} for two guests, under $160 per night with step-free access and a workspace? Do not prepare a quote.` });
  assert.deepEqual(result.listings?.map(item => item.id), [room.id, second.id]);
  assert.match(result.reply, /Willow House Garden Room/); assert.match(result.reply, /Willow Courtyard Room/);
  assert.match(result.reply, /\$298\.00/); assert.match(result.reply, /\$318\.00/);
  assert.doesNotMatch(result.reply, /Which room|Premium|Upstairs/);
  assert.equal(snapshot(), before);
}));

test("a first availability check counts occupied nights and reports no matching room without quotes", async () => fixture(async ({ store, room, business, chat, snapshot }) => {
  const quote = store.createQuote("alice", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  store.confirmQuote("alice", { quoteId: quote.id, idempotencyKey: "fixture" });
  const before = snapshot();
  globalThis.fetch = async () => response("discover_stays", { checkIn: day(30), checkOut: day(32), guests: 2 });
  const result = await chat.send(business.id, { message: `Is your room available from ${day(30)} to ${day(32)} for two guests? Do not prepare a quote or book.` });
  assert.deepEqual(result.listings, []); assert.match(result.reply, /unavailable/);
  assert.equal(result.quote, undefined); assert.equal(snapshot(), before);
}));

test("availability preserves ordinary quotes, confirmed bookings and pending date changes", async () => {
  for (const mode of ["quote", "confirmed", "change"] as const) await fixture(async ({ store, room, business, chat, snapshot }) => {
    globalThis.fetch = async () => response("create_quote", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
    let prepared = await chat.send(business.id, { message: "Prepare a quote" });
    if (mode !== "quote") {
      const original = store.confirmQuote("alice", { quoteId: prepared.quote!.id, idempotencyKey: "fixture" });
      if (mode === "change") {
        globalThis.fetch = async () => response("create_quote", { listingId: room.id, reservationId: original.id, checkIn: day(40), checkOut: day(42), guests: 2 });
        prepared = await chat.send(business.id, { message: `Prepare a date-change quote for ${original.confirmation}, ${day(40)} to ${day(42)}, 2 guests.` });
      } else prepared = { ...chat.read(business.id), reply: "" };
    }
    const before = snapshot();
    globalThis.fetch = async () => response("discover_stays", { checkIn: day(50), checkOut: day(52), guests: 2 });
    const result = await chat.send(business.id, { message: `Is your room available from ${day(50)} to ${day(52)} for two guests? Do not prepare a quote or change my booking.` });
    assert.equal(result.quote?.id, prepared.quote?.id); assert.equal(result.dateChangePending, prepared.dateChangePending);
    assert.deepEqual(result.reservation, prepared.reservation); assert.equal(snapshot(), before);
    assert.deepEqual(result.listings?.map(item => item.id), [room.id]);
  });
});

test("property questions and explicit quote requests retain their own tool path", async () => fixture(async ({ room, business, chat }) => {
  for (const message of ["Is Wi-Fi available?", "Is Wi-Fi available in the room?"]) {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body)); assert.equal(body.tool_choice, "auto");
      return ++calls === 1 ? response("get_stay_details", { listingId: room.id }) : response();
    };
    await chat.send(business.id, { message });
    assert.equal(calls, 2);
  }
  globalThis.fetch = async () => response("create_quote", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  const quote = await chat.send(business.id, { message: `Is your room available from ${day(30)} to ${day(32)} for 2 guests? Please prepare a fresh quote for review.` });
  assert.equal(quote.quote?.listingId, room.id); assert.equal(quote.reservation, undefined);
}));
