import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat, withAgentChatApproval } from "../src/lib/agent-chat.ts";

const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const dates = { checkIn: day(30), checkOut: day(32), guests: 2 };
const secret = "isolated-quote-approval-test-key-at-least-32-characters";
const answer = () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Would you like me to create the quote?" } }] });
const call = (name: string, args: unknown) => Response.json({ choices: [{ finish_reason: "tool_calls", message: {
  role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }],
} }] });
async function fixture(run: (value: ReturnType<typeof setup>) => Promise<void>) {
  const value = setup(), original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  globalThis.fetch = async () => answer();
  try { await run(value); } finally { value.store.close(); globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
function setup() {
  const store = createStore(":memory:"); store.ensureTenant("alice"); store.ensureTenant("bob");
  const source = store.listListings("alice")[0];
  const room = store.publishListing("alice", { ...source, name: "Willow House Garden Room", hostName: "Willow House", nightlyCents: 13900, cleaningCents: 2000 });
  const businesses = createBusinessSkills(store, "alice"), business = businesses.forListing(room.id), chat = createAgentChat(store, "alice");
  const request = { message: `Please prepare a test quote for ${room.name} using the dates and guest count we discussed. Ask me for any missing details.`, quoteListingId: room.id };
  const quotes = () => store.db.prepare("SELECT count(*) AS count FROM quotes WHERE tenant_id=?").get("alice")!.count;
  return { store, room, businesses, business, chat, request, quotes };
}

test("Prepare quote uses the previous discovery's user dates and guests and stops before approval", async () => fixture(async ({ store, room, business, chat, request, quotes }) => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? call("discover_stays", dates) : answer();
  const found = await chat.send(business.id, { message: `Is the garden room available from ${dates.checkIn} to ${dates.checkOut} for 2 guests?` });
  assert.deepEqual(found.listings?.map(item => item.id), [room.id]);
  globalThis.fetch = async () => { throw new Error("The explicit quote button must not depend on model prose"); };
  const prepared = await chat.send(business.id, request);
  assert.equal(prepared.quote?.listingId, room.id);
  assert.equal(prepared.quote?.checkIn, dates.checkIn); assert.equal(prepared.quote?.checkOut, dates.checkOut);
  assert.equal(prepared.quote?.guests, 2); assert.equal(prepared.quote?.totalCents, 29800);
  assert.equal(prepared.quote?.reservationId, undefined); assert.equal(prepared.reservation, undefined);
  assert.ok(withAgentChatApproval(prepared, "alice", business.id, secret).approval);
  assert.match(prepared.reply, /explicitly approve/);
  assert.equal(quotes(), 1); assert.deepEqual(store.listReservations("alice"), []);
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM occupied_nights").get()!.count, 0);
  await chat.send(business.id, { message: "yes" });
  assert.deepEqual(store.listReservations("alice"), []);
}));

test("latest explicit dates and guest corrections override the earlier stay", async () => fixture(async ({ business, chat, request }) => {
  await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for two guests.` });
  await chat.send(business.id, { message: `Actually change the dates to ${day(40)} to ${day(43)} instead.` });
  await chat.send(business.id, { message: "Actually it will be one guest." });
  const prepared = await chat.send(business.id, request);
  assert.equal(prepared.quote?.checkIn, day(40)); assert.equal(prepared.quote?.checkOut, day(43));
  assert.equal(prepared.quote?.guests, 1); assert.equal(prepared.quote?.totalCents, 43700);
}));

test("Prepare quote remembers an explicit month-name range without defaulting the guest count", async () => fixture(async ({ business, chat, request }) => {
  const checkIn = `${day(40).slice(0, 8)}20`, checkOut = `${day(40).slice(0, 8)}22`;
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(checkIn));
  await chat.send(business.id, { message: `Find a room for ${month} 20–22, ${checkIn.slice(0, 4)}.` });
  assert.equal((await chat.send(business.id, request)).quote, undefined);
  await chat.send(business.id, { message: "For two guests." });
  const prepared = await chat.send(business.id, request);
  assert.equal(prepared.quote?.checkIn, checkIn); assert.equal(prepared.quote?.checkOut, checkOut);
  assert.equal(prepared.quote?.guests, 2); assert.equal(prepared.quote?.totalCents, 29800);
}));

test("owner-supplied room names in repeated quote button messages cannot override the user's stay", async () => fixture(async ({ store, room, business, chat, request }) => {
  const named = store.publishListing("alice", { ...room, name: `Garden ${day(40)} to ${day(42)} for 4 guests`, maxGuests: 4 });
  await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.` });
  const click = { ...request, quoteListingId: named.id, message: `Please prepare a test quote for ${named.name} using the dates and guest count we discussed. Ask me for any missing details.` };
  for (let attempt = 0; attempt < 2; attempt++) {
    const prepared = await chat.send(business.id, click);
    assert.equal(prepared.quote?.listingId, named.id);
    assert.equal(prepared.quote?.checkIn, dates.checkIn); assert.equal(prepared.quote?.checkOut, dates.checkOut);
    assert.equal(prepared.quote?.guests, 2);
  }
  assert.deepEqual(store.listReservations("alice"), []);
}));

test("Prepare quote replaces an expired quote without approving either quote", async () => fixture(async ({ store, business, chat, request, quotes }) => {
  await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.` });
  const first = await chat.send(business.id, request);
  store.db.prepare("UPDATE quotes SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), first.quote!.id);
  const fresh = await chat.send(business.id, request);
  assert.notEqual(fresh.quote?.id, first.quote?.id); assert.equal(fresh.quote?.totalCents, 29800);
  assert.ok(Date.parse(fresh.quote!.expiresAt) > Date.now());
  assert.equal(quotes(), 2); assert.deepEqual(store.listReservations("alice"), []);
}));

test("a confirmed booking stays unchanged and needs an explicit new-stay request before another quote", async () => fixture(async ({ store, business, chat, request, quotes }) => {
  await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.` });
  const prepared = withAgentChatApproval(await chat.send(business.id, request), "alice", business.id, secret);
  const confirmed = chat.confirm(business.id, { quoteId: prepared.quote!.id, approved: true, approval: prepared.approval, idempotencyKey: "fixture" }, secret).reservation!;
  const repeated = await chat.send(business.id, request);
  assert.match(repeated.reply, /already confirmed/); assert.equal(quotes(), 1);
  globalThis.fetch = async () => call("discover_stays", { checkIn: day(40), checkOut: day(42), guests: 2 });
  await chat.send(business.id, { message: `Check availability for a new stay from ${day(40)} to ${day(42)} for 2 guests.` });
  const next = await chat.send(business.id, request);
  assert.equal(next.quote?.checkIn, day(40)); assert.equal(next.quote?.reservationId, undefined);
  assert.equal(next.reservation, undefined); assert.equal(quotes(), 2);
  assert.deepEqual(store.listReservations("alice"), [confirmed]);
  assert.deepEqual(store.db.prepare("SELECT date FROM occupied_nights ORDER BY date").all().map(row => row.date), [dates.checkIn, day(31)]);
}));

test("missing, ambiguous, and partially corrected stay details ask rather than reuse stale values", async () => {
  for (const history of [
    ["What rooms do you have?"],
    [`Find a room from ${dates.checkIn} to ${dates.checkOut}.`],
    [`Find a room for 2 guests.`],
    [`Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.`, `Actually check out on ${day(35)}.`],
    [`Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.`, `Maybe ${day(40)} to ${day(42)} or ${day(45)} to ${day(47)}.`],
    [`Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.`, "Actually next weekend instead."],
    [`Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.`, "It may be 2 or 3 guests."],
  ]) await fixture(async ({ store, business, chat, request, quotes }) => {
    for (const message of history) await chat.send(business.id, { message });
    globalThis.fetch = async () => { throw new Error("Missing details must not be inferred"); };
    const result = await chat.send(business.id, request);
    assert.equal(result.quote, undefined); assert.equal(quotes(), 0);
    assert.match(result.reply, /check-in|check-out|guest count/i);
    assert.deepEqual(store.listReservations("alice"), []);
  });
});

test("Prepare quote uses the clicked room ID and rejects other business and tenant inventory", async () => fixture(async ({ store, room, businesses, business, chat, request, quotes }) => {
  const second = store.publishListing("alice", { ...room, nightlyCents: 15500 });
  const otherBusinessRoom = store.listListings("alice").find(item => item.hostName !== room.hostName)!;
  const foreignRoom = store.listListings("bob")[0];
  businesses.list();
  await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.` });
  globalThis.fetch = async () => { throw new Error("Room identity must come from the clicked card"); };
  for (const listingId of [otherBusinessRoom.id, foreignRoom.id]) {
    await assert.rejects(chat.send(business.id, { ...request, quoteListingId: listingId }), /does not belong/);
    assert.equal(quotes(), 0);
  }
  const prepared = await chat.send(business.id, { ...request, quoteListingId: second.id });
  assert.equal(prepared.quote?.listingId, second.id); assert.equal(prepared.quote?.totalCents, 33000);
  assert.deepEqual(store.listReservations("alice"), []);
}));

test("Prepare quote cannot reinterpret a pending date change as a new booking", async () => fixture(async ({ store, room, business, chat, request, quotes }) => {
  const originalQuote = store.createQuote("alice", { listingId: room.id, ...dates });
  const reservation = store.confirmQuote("alice", { quoteId: originalQuote.id, idempotencyKey: "fixture" });
  globalThis.fetch = async () => call("create_quote", { listingId: room.id, reservationId: reservation.id, checkIn: day(40), checkOut: day(42), guests: 2 });
  const change = await chat.send(business.id, { message: `Prepare a test date-change quote for ${reservation.confirmation}, ${day(40)} to ${day(42)}, 2 guests.` });
  globalThis.fetch = async () => { throw new Error("A pending date change cannot become a new booking quote"); };
  const result = await chat.send(business.id, request);
  assert.equal(result.quote?.id, change.quote?.id); assert.equal(result.dateChangePending, true);
  assert.match(result.reply, /date change|date-change/i);
  assert.equal(quotes(), 2); assert.deepEqual(store.listReservations("alice"), [reservation]);
}));
