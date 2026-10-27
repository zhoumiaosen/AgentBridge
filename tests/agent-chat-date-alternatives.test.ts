import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat, withAgentChatApproval } from "../src/lib/agent-chat.ts";
import { createApproval } from "../src/lib/security.ts";

const secret = "test-alternatives-secret-at-least-thirty-two-characters";
const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
function call(name: string, args: unknown) {
  return Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
}
function answer(content = "I changed the booking without approval.") {
  return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }] });
}
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
function fixture(path = ":memory:", blockedStart = 50, blockedEnd = 52) {
  const store = createStore(path); store.ensureTenant("alice"); store.ensureTenant("bob");
  const businesses = createBusinessSkills(store, "alice"), [business, otherBusiness] = businesses.list();
  const room = businesses.search({}).find(item => item.businessId === business.id)!;
  const original = store.createQuote("alice", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  const reservation = store.confirmQuote("alice", { quoteId: original.id, idempotencyKey: "original" });
  const blocked = store.createQuote("alice", { listingId: room.id, checkIn: day(blockedStart), checkOut: day(blockedEnd), guests: 2 });
  store.confirmQuote("alice", { quoteId: blocked.id, idempotencyKey: "blocked" });
  const chat = createAgentChat(store, "alice");
  const request = async (start = 50, end = 52) => {
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? call("create_quote", { listingId: room.id, reservationId: reservation.id, checkIn: day(start), checkOut: day(end), guests: 2 }) : answer();
    return chat.send(business.id, { message: `Prepare a test date-change quote for ${reservation.confirmation}: check-in ${day(start)}, check-out ${day(end)}, keeping 2 guests.` });
  };
  return { store, businesses, business, otherBusiness, room, reservation, chat, request };
}
const approve = (skillId: string, quoteId: string) => ({ quoteId, approved: true, idempotencyKey: `alt-${quoteId}`, approval: createApproval("alice", "agent-change", `${skillId}:${quoteId}`, secret) });

test("unavailable dates suggest the nearest same-room stays without booking and selection requires fresh approval", async () => mocked(async () => {
  const { store, chat, business, room, reservation, request } = fixture();
  const before = store.listReservations("alice");
  const result = await request();
  assert.equal(result.quote, undefined);
  assert.deepEqual(result.reservation, reservation);
  assert.deepEqual(result.dateAlternatives?.map(item => item.checkIn), [day(48), day(52), day(47)]);
  for (const item of result.dateAlternatives!) {
    assert.equal(item.listingId, room.id); assert.equal(item.reservationId, reservation.id);
    assert.equal(item.nights, 2); assert.equal(item.guests, 2);
    assert.equal(item.totalCents, room.nightlyCents * 2 + room.cleaningCents);
    assert.throws(() => chat.confirm(business.id, approve(business.id, item.id), secret), /current quote/);
  }
  assert.match(result.reply, /same room|nearby/i);
  assert.doesNotMatch(result.reply, /changed the booking without/);
  assert.equal("approval" in withAgentChatApproval(result, "alice", business.id, secret), false);
  assert.deepEqual(store.listReservations("alice"), before);
  const selected = chat.selectAlternative(business.id, { quoteId: result.dateAlternatives![0].id });
  assert.notEqual(selected.quote!.id, result.dateAlternatives![0].id);
  assert.equal(selected.dateChangePending, true);
  assert.equal(selected.dateAlternatives?.length || 0, 0);
  assert.deepEqual(store.listReservations("alice"), before);
  const signed = withAgentChatApproval(selected, "alice", business.id, secret);
  assert.ok(signed.approval);
  const confirmed = chat.confirm(business.id, { quoteId: selected.quote!.id, approved: true, idempotencyKey: "selected", approval: signed.approval }, secret);
  assert.equal(confirmed.reservation!.id, reservation.id);
  assert.equal(confirmed.reservation!.confirmation, reservation.confirmation);
  assert.equal(confirmed.reservation!.checkIn, day(48));
  assert.equal(store.listReservations("alice").length, before.length);
  store.close();
}));

test("selection rechecks availability and current price even when the suggestion quote has expired", async () => mocked(async () => {
  const { store, chat, business, room, request } = fixture();
  const result = await request(), choice = result.dateAlternatives![0];
  const listing = store.listListings("alice").find(item => item.id === room.id)!;
  store.db.prepare("UPDATE listings SET data=? WHERE id=?").run(JSON.stringify({ ...listing, nightlyCents: listing.nightlyCents + 1200 }), listing.id);
  store.db.prepare("UPDATE quotes SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1).toISOString(), choice.id);
  const selected = chat.selectAlternative(business.id, { quoteId: choice.id });
  assert.equal(selected.quote!.totalCents, choice.totalCents + 2400);
  assert.ok(Date.parse(selected.quote!.expiresAt) > Date.now());
  assert.equal(selected.reservation!.checkIn, day(30));
  store.close();
}));

test("an unavailable date request ends the tool turn before the model can select different dates", async () => mocked(async () => {
  const { store, chat, business, room, reservation } = fixture();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [50, 70].map((start, index) => ({
      id: `call-${index}`, type: "function", function: { name: "create_quote", arguments: JSON.stringify({ listingId: room.id, reservationId: reservation.id, checkIn: day(start), checkOut: day(start + 2), guests: 2 }) },
    })) } }] });
  };
  const result = await chat.send(business.id, { message: `Change booking ${reservation.confirmation} to ${day(50)} through ${day(52)} for 2 guests.` });
  assert.equal(calls, 1);
  assert.equal(result.quote, undefined);
  assert.equal(result.dateAlternatives!.length, 3);
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM quotes WHERE tenant_id=? AND json_extract(data, '$.checkIn')=?").get("alice", day(70))!.count, 0);
  assert.deepEqual(result.reservation, reservation);
  store.close();
}));

test("canceling the original after alternatives still requires approval and clears only its suggestions", async () => mocked(async () => {
  const { store, chat, business, reservation, request } = fixture();
  const result = await request(), choice = result.dateAlternatives![0];
  const before = store.listReservations("alice"), other = before.find(item => item.id !== reservation.id)!;
  globalThis.fetch = async () => { throw new Error("Cancellation review must not call the model."); };
  const review = await chat.send(business.id, { message: `Cancel booking ${reservation.confirmation}.` });
  assert.equal(review.cancellationRequested, true);
  assert.deepEqual(store.listReservations("alice"), before);
  const signed = withAgentChatApproval(review, "alice", business.id, secret);
  assert.ok(signed.cancellation);
  const input = { ...signed.cancellation, approved: true };
  const canceled = chat.cancel(business.id, input, secret);
  assert.equal(canceled.reservation!.id, reservation.id);
  assert.equal(canceled.reservation!.status, "canceled");
  assert.deepEqual(canceled.dateAlternatives, []);
  assert.equal(canceled.quote, undefined);
  assert.deepEqual(store.listReservations("alice").find(item => item.id === other.id), other);
  assert.throws(() => chat.selectAlternative(business.id, { quoteId: choice.id }), /alternative|suggestion/);
  assert.equal(chat.cancel(business.id, input, secret).reservation!.status, "canceled");
  store.close();
}));

test("alternative selection rejects unowned, stale, forged and overlapping requests without mutation", async () => mocked(async () => {
  for (const changed of ["profile", "reservation", "busy", "foreign", "invalid"] as const) {
    const { store, chat, business, otherBusiness, businesses, reservation, request } = fixture();
    const result = await request(), quoteId = result.dateAlternatives![0].id;
    if (changed === "profile") businesses.update(business.id, { version: businesses.profile(business.id).version, summary: "Updated", knowledge: "Updated" });
    if (changed === "reservation") store.db.prepare("UPDATE reservations SET data=? WHERE id=?").run(JSON.stringify({ ...reservation, guests: 1 }), reservation.id);
    if (changed === "busy") store.db.prepare("UPDATE agent_chat_threads SET locked_until=? WHERE tenant_id=? AND skill_id=?").run(Date.now() + 70000, "alice", business.id);
    const before = store.listReservations("alice");
    if (changed === "foreign") {
      assert.throws(() => chat.selectAlternative(otherBusiness.id, { quoteId }), /alternative|suggestion/);
      assert.throws(() => createAgentChat(store, "bob").selectAlternative(business.id, { quoteId }), /not found/);
    } else if (changed === "invalid") {
      for (const input of [null, {}, { quoteId, approved: true }, { quoteId: "not-saved" }]) assert.throws(() => chat.selectAlternative(business.id, input), /alternative|suggestion/);
    } else assert.throws(() => chat.selectAlternative(business.id, { quoteId }), /changed|replying/);
    assert.deepEqual(store.listReservations("alice"), before);
    store.close();
  }
}));

test("newly occupied alternatives cannot be selected and fresh searches clear stale suggestions", async () => mocked(async () => {
  const { store, chat, business, room, request } = fixture();
  const result = await request(), choice = result.dateAlternatives![0];
  const taken = store.createQuote("alice", { listingId: room.id, checkIn: choice.checkIn, checkOut: choice.checkOut, guests: 1 });
  store.confirmQuote("alice", { quoteId: taken.id, idempotencyKey: "take-alternative" });
  const before = store.listReservations("alice");
  assert.throws(() => chat.selectAlternative(business.id, { quoteId: choice.id }), /available/);
  assert.equal(chat.read(business.id).quote, undefined);
  assert.deepEqual(store.listReservations("alice"), before);
  await request();
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? call("discover_stays", { checkIn: day(70), checkOut: day(72), guests: 2 }) : answer();
  const searched = await chat.send(business.id, { message: `Find a new stay from ${day(70)} to ${day(72)} for 2 guests.` });
  assert.equal(searched.dateAlternatives?.length || 0, 0);
  assert.throws(() => chat.selectAlternative(business.id, { quoteId: choice.id }), /alternative|suggestion/);
  store.close();
}));

test("alternatives stay within seven days, skip past dates and survive database reopen", async () => mocked(async () => {
  const nearToday = fixture(":memory:", 1, 3);
  const soon = await nearToday.request(1, 3);
  assert.ok(soon.dateAlternatives!.length > 0);
  for (const item of soon.dateAlternatives!) {
    assert.ok(item.checkIn >= todaySF());
    assert.ok(Math.abs(Date.parse(item.checkIn) - Date.parse(day(1))) <= 7 * 86400000);
  }
  nearToday.store.close();
  const full = fixture(":memory:", 42, 60);
  const none = await full.request();
  assert.deepEqual(none.dateAlternatives, []);
  assert.match(none.reply, /within 7 days/);
  assert.equal(none.reservation!.checkIn, day(30));
  full.store.close();
  const dir = mkdtempSync(join(tmpdir(), "agent-date-alts-")), path = join(dir, "store.sqlite");
  try {
    const { store, chat, business, request } = fixture(path);
    const result = await request(), quoteId = result.dateAlternatives![0].id;
    assert.equal(chat.read(business.id).dateAlternatives!.length, 3); store.close();
    const reopened = createStore(path), next = createAgentChat(reopened, "alice");
    assert.equal(next.read(business.id).dateAlternatives![0].id, quoteId);
    assert.equal(next.selectAlternative(business.id, { quoteId }).dateChangePending, true);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}));
