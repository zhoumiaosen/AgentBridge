import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, reservationRevision, todaySF, type Reservation } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";
import { createApproval } from "../src/lib/security.ts";

const secret = "test-date-change-secret-at-least-thirty-two-characters";
const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
function answer(content = "I changed your booking and charged the difference.") {
  return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }] });
}
function call(name: string, args: unknown) {
  return Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
}
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = original; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
function fixture(path = ":memory:") {
  const store = createStore(path); store.ensureTenant("alice"); store.ensureTenant("bob");
  const businesses = createBusinessSkills(store, "alice"), [business, otherBusiness] = businesses.list();
  const room = businesses.search({}).find(item => item.businessId === business.id)!;
  const otherRoom = businesses.search({}).find(item => item.businessId === otherBusiness.id)!;
  const quote = store.createQuote("alice", { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 });
  const reservation = store.confirmQuote("alice", { quoteId: quote.id, idempotencyKey: "initial-booking" });
  return { store, businesses, business, otherBusiness, room, otherRoom, reservation, chat: createAgentChat(store, "alice") };
}
function prompt(r: Reservation, checkIn = day(30), checkOut = day(33)) {
  return `Prepare a test date-change quote for booking ${r.confirmation}: check-in ${checkIn}, check-out ${checkOut}, 2 guests. Do not apply it yet.`;
}
function prepareMock(r: Reservation, checkIn = day(30), checkOut = day(33)) {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    assert.deepEqual(request.tools.map((tool: {function: {name: string}}) => tool.function.name), ["discover_stays", "get_stay_details", "create_quote"]);
    assert.equal(JSON.stringify(request).includes(secret), false);
    return ++calls === 1 ? call("create_quote", { listingId: r.listingId, reservationId: r.id, checkIn, checkOut, guests: 2 }) : answer();
  };
}
function approval(skillId: string, quoteId: string, purpose = "agent-change") {
  return { quoteId, approved: true, idempotencyKey: `change-${quoteId}`, approval: createApproval("alice", purpose, `${skillId}:${quoteId}`, secret) };
}

test("date-change quotes preserve the original until signed approval and retain confirmation without duplicates", async () => mocked(async () => {
  const { store, chat, business, reservation, room } = fixture();
  prepareMock(reservation);
  const prepared = await chat.send(business.id, { message: prompt(reservation) });
  assert.equal(prepared.dateChangePending, true);
  assert.equal(prepared.quote!.reservationId, reservation.id);
  assert.deepEqual(prepared.reservation, reservation);
  assert.equal(prepared.quote!.totalCents, room.nightlyCents * 3 + room.cleaningCents);
  assert.match(prepared.reply, /Confirm test date change/);
  assert.ok(prepared.reply.includes(reservation.confirmation));
  assert.ok(prepared.reply.includes(reservation.checkOut));
  assert.doesNotMatch(prepared.reply, /charged the difference/);
  assert.deepEqual(store.listReservations("alice"), [reservation]);
  globalThis.fetch = async () => { throw new Error("Typed approval is not a model action"); };
  const yes = await chat.send(business.id, { message: "Yes, approve it" });
  assert.match(yes.reply, /Confirm test date change/);
  assert.deepEqual(yes.reservation, reservation);
  const typedButton = await chat.send(business.id, { message: "Confirm test date change" });
  assert.match(typedButton.reply, /A chat message is not approval/);
  assert.equal(typedButton.quote!.id, prepared.quote!.id);
  assert.deepEqual(typedButton.reservation, reservation);
  assert.throws(() => chat.confirm(business.id, approval(business.id, prepared.quote!.id, "agent-book"), secret), /approve/);
  assert.throws(() => chat.confirm(business.id, { ...approval(business.id, prepared.quote!.id), approved: false }, secret), /approve/);
  const result = chat.confirm(business.id, approval(business.id, prepared.quote!.id), secret);
  assert.equal(result.dateChangePending, false);
  assert.equal(result.reservation!.id, reservation.id);
  assert.equal(result.reservation!.confirmation, reservation.confirmation);
  assert.equal(result.reservation!.checkOut, day(33));
  assert.equal(result.reservation!.totalCents, prepared.quote!.totalCents);
  assert.equal(chat.confirm(business.id, approval(business.id, prepared.quote!.id), secret).reservation!.id, reservation.id);
  assert.equal(store.listReservations("alice").length, 1);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM occupied_nights WHERE reservation_id=?").get(reservation.id)!.n, 3);
  store.close();
}));

test("active bookings and date-change tools remain scoped to the selected business and workspace", async () => mocked(async () => {
  const { store, chat, business, otherBusiness, otherRoom, reservation } = fixture();
  const foreignQuote = store.createQuote("alice", { listingId: otherRoom.id, checkIn: day(35), checkOut: day(37), guests: 2 });
  const foreign = store.confirmQuote("alice", { quoteId: foreignQuote.id, idempotencyKey: "foreign" });
  assert.deepEqual(chat.read(business.id).reservations?.map(r => r.id), [reservation.id]);
  assert.deepEqual(chat.read(otherBusiness.id).reservations?.map(r => r.id), [foreign.id]);
  const bobBusiness = createBusinessSkills(store, "bob").list()[0];
  assert.deepEqual(createAgentChat(store, "bob").read(bobBusiness.id).reservations, []);
  assert.throws(() => createAgentChat(store, "bob").read(business.id), /not found/);
  const personal = createSkillLibrary(store, "alice").list().find(skill => skill.ownerType === "customer")!;
  assert.equal(chat.read(personal.id).reservations, undefined);
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? call("create_quote", { listingId: foreign.listingId, reservationId: foreign.id, checkIn: day(35), checkOut: day(38), guests: 2 }) : answer();
  const rejected = await chat.send(business.id, { message: prompt(reservation) });
  assert.equal(rejected.quote, undefined);
  assert.match(rejected.reply, /not.*selected|does not belong|Unsupported/);
  assert.deepEqual(store.listReservations("alice"), [foreign, reservation]);
  store.close();
}));

test("ambiguous bookings and missing dates ask for clarification instead of creating a quote", async () => mocked(async () => {
  const { store, chat, business, room, reservation } = fixture();
  const extra = store.createQuote("alice", { listingId: room.id, checkIn: day(40), checkOut: day(42), guests: 2 });
  store.confirmQuote("alice", { quoteId: extra.id, idempotencyKey: "second" });
  globalThis.fetch = async () => { throw new Error("Missing selection should not require inference"); };
  const choose = await chat.send(business.id, { message: `Change my booking dates to ${day(30)} through ${day(33)}` });
  assert.match(choose.reply, /choose|which/i);
  assert.equal(choose.quote, undefined);
  const dates = await chat.send(business.id, { message: `Change dates for ${reservation.confirmation}` });
  assert.match(dates.reply, /check-in.*check-out/i);
  assert.equal(dates.quote, undefined);
  const partial = await chat.send(business.id, { message: `Change ${reservation.confirmation} booking to November` });
  assert.match(partial.reply, /both as YYYY-MM-DD/);
  assert.equal(partial.quote, undefined);
  assert.equal(store.listReservations("alice").length, 2);
  store.close();
}));

test("stale, expired, canceled and newly unavailable date-change quotes cannot alter the original", async () => mocked(async () => {
  for (const failure of ["stale", "expired", "canceled", "price", "unavailable", "policy"] as const) {
    const { store, chat, business, reservation, room } = fixture();
    prepareMock(reservation, day(34), day(37));
    const prepared = await chat.send(business.id, { message: prompt(reservation, day(34), day(37)) });
    if (failure === "stale") store.db.prepare("UPDATE reservations SET data=? WHERE id=?").run(JSON.stringify({ ...reservation, guests: 1 }), reservation.id);
    if (failure === "expired") store.db.prepare("UPDATE quotes SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1).toISOString(), prepared.quote!.id);
    if (failure === "canceled") store.cancelReservation("alice", reservation.id);
    if (failure === "policy") store.db.prepare("UPDATE reservations SET data=? WHERE id=?").run(JSON.stringify({ ...reservation, cancellation: "restricted" }), reservation.id);
    if (failure === "price") store.db.prepare("UPDATE listings SET data=? WHERE id=?").run(JSON.stringify({ ...room, nightlyCents: room.nightlyCents + 100 }), room.id);
    if (failure === "unavailable") {
      const taken = store.createQuote("alice", { listingId: room.id, checkIn: day(34), checkOut: day(37), guests: 2 });
      store.confirmQuote("alice", { quoteId: taken.id, idempotencyKey: "taken" });
    }
    const before = store.listReservations("alice");
    assert.throws(() => chat.confirm(business.id, approval(business.id, prepared.quote!.id), secret), /changed|expired|active|available|policy/);
    assert.deepEqual(store.listReservations("alice"), before);
    store.close();
  }
}));

test("failed replacement and model-only success remove the old approval target without changing bookings", async () => mocked(async () => {
  const { store, chat, business, reservation } = fixture();
  prepareMock(reservation);
  const prepared = await chat.send(business.id, { message: prompt(reservation) });
  for (const detailsFirst of [false, true]) {
    let calls = 0;
    globalThis.fetch = async () => detailsFirst && ++calls === 1 ? call("get_stay_details", { listingId: reservation.listingId }) : answer("I prepared a new date-change quote.");
    await assert.rejects(chat.send(business.id, { message: prompt(reservation, day(30), day(34)) }), /did not prepare/);
    assert.equal(chat.read(business.id).quote, undefined);
    assert.throws(() => chat.confirm(business.id, approval(business.id, prepared.quote!.id), secret), /current quote/);
    assert.deepEqual(store.listReservations("alice"), [reservation]);
  }
  store.close();
}));

test("date-change proposals survive database reopen and retain approval purpose", async () => mocked(async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-change-")), path = join(dir, "store.sqlite");
  try {
    const { store, chat, business, reservation } = fixture(path);
    prepareMock(reservation);
    const prepared = await chat.send(business.id, { message: prompt(reservation) });
    store.close();
    const reopened = createStore(path), next = createAgentChat(reopened, "alice");
    assert.equal(next.read(business.id).dateChangePending, true);
    assert.equal(next.read(business.id).reservation!.id, reservation.id);
    const result = next.confirm(business.id, approval(business.id, prepared.quote!.id), secret);
    assert.equal(result.reservation!.confirmation, reservation.confirmation);
    assert.equal(result.reservation!.checkOut, day(33));
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}));

test("date-change signatures reject foreign purpose, workspace, agent, expiry and extra fields", async () => mocked(async () => {
  const { store, chat, business, otherBusiness, reservation } = fixture();
  prepareMock(reservation);
  const prepared = await chat.send(business.id, { message: prompt(reservation) });
  const input = approval(business.id, prepared.quote!.id);
  for (const invalid of [
    { ...input, approval: "forged" }, { ...input, totalCents: 1 }, { ...input, approved: false },
    { ...input, approval: createApproval("bob", "agent-change", `${business.id}:${input.quoteId}`, secret) },
    { ...input, approval: createApproval("alice", "change", input.quoteId, secret) },
    { ...input, approval: createApproval("alice", "agent-change", `${business.id}:${input.quoteId}`, secret, Date.now() - 600001) },
  ]) assert.throws(() => chat.confirm(business.id, invalid, secret), /approve/);
  assert.throws(() => chat.confirm(otherBusiness.id, approval(otherBusiness.id, input.quoteId), secret), /current quote/);
  assert.throws(() => createAgentChat(store, "bob").confirm(business.id, input, secret), /approve/);
  const personal = createSkillLibrary(store, "alice").list().find(skill => skill.ownerType === "customer")!;
  assert.throws(() => chat.confirm(personal.id, approval(personal.id, input.quoteId), secret), /connected/);
  assert.deepEqual(store.listReservations("alice"), [reservation]);
  store.close();
}));

test("canceling the original during a pending date change removes change approval and preserves other bookings", async () => mocked(async () => {
  const { store, chat, business, room, reservation } = fixture();
  const extraQuote = store.createQuote("alice", { listingId: room.id, checkIn: day(40), checkOut: day(42), guests: 2 });
  const other = store.confirmQuote("alice", { quoteId: extraQuote.id, idempotencyKey: "other" });
  prepareMock(reservation);
  const proposed = await chat.send(business.id, { message: prompt(reservation) });
  const revision = reservationRevision(reservation);
  const canceled = chat.cancel(business.id, { reservationId: reservation.id, revision, approved: true,
    approval: createApproval("alice", "agent-cancel", `${business.id}:${reservation.id}:${revision}`, secret) }, secret);
  assert.equal(canceled.dateChangePending, false);
  assert.equal(canceled.reservation!.status, "canceled");
  assert.throws(() => chat.confirm(business.id, approval(business.id, proposed.quote!.id), secret), /active/);
  assert.deepEqual(store.listReservations("alice").find(item => item.id === other.id), other);
  assert.deepEqual(canceled.reservations?.map(item => item.id), [other.id]);
  store.close();
}));
