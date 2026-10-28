import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";

const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
function fixture() {
  const store = createStore(":memory:");
  for (const id of ["owner", "customer", "other", "unrelated"]) store.ensureTenant(id);
  const businesses = createBusinessSkills(store, "owner");
  const business = businesses.list()[0];
  const room = store.listListings("owner").find(item => business.listingIds.includes(item.id))!;
  const input = { listingId: room.id, checkIn: day(30), checkOut: day(32), guests: 2 };
  const publish = () => businesses.update(business.id, { version: business.version, summary: "Fictional shared hotel", knowledge: "Test only", visibility: "public" });
  return { store, businesses, business, room, input, publish };
}
test("a public room has one inventory across customers and separate owner/customer reservation views", () => {
  const { store, input, room, publish } = fixture();
  try {
    assert.throws(() => store.createQuote("customer", input, "owner"), /not found|published|available/i);
    publish();
    const quote = store.createQuote("customer", input, "owner");
    const rival = store.createQuote("other", input, "owner");
    const reservation = store.confirmQuote("customer", { quoteId: quote.id, idempotencyKey: "approved" });
    assert.equal(reservation.status, "confirmed");
    assert.throws(() => store.confirmQuote("other", { quoteId: rival.id, idempotencyKey: "rival" }), /available/i);
    assert.equal(store.listListings("owner", input).some(item => item.id === room.id), false);
    assert.deepEqual(store.listReservations("customer"), [reservation]);
    assert.deepEqual(store.listReservations("owner"), []);
    assert.deepEqual(store.listReservations("other"), []);
    assert.deepEqual(store.listBusinessReservations("owner"), [reservation]);
    assert.deepEqual(store.listBusinessReservations("unrelated"), []);
    assert.throws(() => store.cancelReservation("owner", reservation.id), /not found/i);
  } finally { store.close(); }
});
test("shared date changes and cancellation release the original owner inventory", () => {
  const { store, input, room, publish } = fixture();
  try {
    publish();
    const quote = store.createQuote("customer", input, "owner");
    const original = store.confirmQuote("customer", { quoteId: quote.id, idempotencyKey: "first" });
    const next = { ...input, checkIn: day(35), checkOut: day(38), reservationId: original.id };
    const revised = store.createQuote("customer", next, "owner");
    assert.equal(store.listReservations("customer")[0].checkIn, input.checkIn);
    const changed = store.confirmQuote("customer", { quoteId: revised.id, idempotencyKey: "change" });
    assert.equal(changed.confirmation, original.confirmation);
    assert.equal(changed.totalCents, room.nightlyCents * 3 + room.cleaningCents);
    assert.equal(store.listListings("owner", input).some(item => item.id === room.id), true);
    assert.equal(store.listListings("owner", next).some(item => item.id === room.id), false);
    const canceled = store.cancelReservation("customer", original.id);
    assert.deepEqual(store.listBusinessReservations("owner"), [canceled]);
    assert.equal(store.listListings("owner", next).some(item => item.id === room.id), true);
  } finally { store.close(); }
});
test("unpublishing blocks pending new bookings but retains customer management of an existing booking", () => {
  const { store, businesses, business, input, publish } = fixture();
  try {
    const publicBusiness = publish();
    const quote = store.createQuote("customer", input, "owner");
    const original = store.confirmQuote("customer", { quoteId: quote.id, idempotencyKey: "first" });
    const pending = store.createQuote("other", { ...input, checkIn: day(40), checkOut: day(42) }, "owner");
    businesses.update(business.id, { version: publicBusiness.version, summary: "Fictional shared hotel", knowledge: "Test only", visibility: "private" });
    assert.throws(() => store.confirmQuote("other", { quoteId: pending.id, idempotencyKey: "after-unpublish" }), /published|available|not found/i);
    const change = store.createQuote("customer", { ...input, checkIn: day(35), checkOut: day(36), reservationId: original.id }, "owner");
    assert.equal(store.confirmQuote("customer", { quoteId: change.id, idempotencyKey: "change" }).id, original.id);
    assert.equal(store.cancelReservation("customer", original.id).status, "canceled");
  } finally { store.close(); }
});
