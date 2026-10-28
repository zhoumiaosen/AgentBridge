import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createServiceQuotes } from "../src/lib/service-quotes.ts";
import { createApproval } from "../src/lib/security.ts";

const key = "test-only-service-approval-secret";
const offer = { title: "Inner tube replacement", items: [{ label: "Labor", amountCents: 3500 }, { label: "Inner tube", amountCents: 1200 }] };
const profile = { name: "Lantern test agent", ownerType: "business", ownerName: "Fictional workshop", kind: "agent", category: "Bicycle repair", summary: "Test repair quotes", content: "Fictional business. No appointments or payments.", serviceOffer: offer };
function fixture() {
  const store = createStore(":memory:"); store.ensureTenant("alice"); store.ensureTenant("bob");
  const library = createSkillLibrary(store, "alice"), agent = library.publish(profile), other = library.publish({ ...profile, name: "Other test business" });
  return { store, library, agent, other, quotes: createServiceQuotes(store, "alice") };
}
function approval(skillId: string, quoteId: string, tenant = "alice", action = "agent-service") {
  return { quoteId, approved: true, approval: createApproval(tenant, action, `${skillId}:${quoteId}`, key) };
}

test("service quote drafts use saved item prices and stay pending after durable save without creating reservations", () => {
  const { store, agent, quotes } = fixture();
  const quote = quotes.draft(agent);
  assert.equal(quote.totalCents, 4700); assert.equal(quote.currency, "USD");
  assert.equal(quote.status, "pending"); assert.equal(quote.testOnly, true);
  assert.equal(quote.skillId, agent.id); assert.equal(quote.profileVersion, agent.version);
  assert.deepEqual(quote.items, offer.items); assert.ok(Date.parse(quote.expiresAt) > Date.now());
  assert.equal(quotes.read(agent.id), undefined);
  quotes.save(quote);
  assert.deepEqual(createServiceQuotes(store, "alice").read(agent.id), quote);
  agent.serviceOffer!.items[0].amountCents = 1;
  assert.equal(quotes.read(agent.id)!.totalCents, 4700);
  assert.equal(store.listReservations("alice").length, 0);
  store.close();
});

test("service acceptance needs an explicit true approval and the signed token for this quote", () => {
  const { store, agent, quotes } = fixture();
  const quote = quotes.draft(agent); quotes.save(quote);
  const good = approval(agent.id, quote.id);
  for (const input of [null, {}, { ...good, approved: false }, { ...good, approved: "true" }, { quoteId: quote.id, approval: good.approval }, { ...good, approval: "forged" }, { ...good, totalCents: 1 }, approval(agent.id, quote.id, "bob"), approval(agent.id, quote.id, "alice", "agent-book")])
    assert.throws(() => quotes.approve(agent.id, input, key), /review|approve|approval/i);
  assert.equal(quotes.read(agent.id)!.status, "pending");
  assert.equal(store.listReservations("alice").length, 0);
  store.close();
});

test("approved test quote acceptance is durable and idempotent without making a room reservation", () => {
  const { store, agent, quotes } = fixture();
  const quote = quotes.draft(agent); quotes.save(quote);
  const input = approval(agent.id, quote.id);
  const accepted = quotes.approve(agent.id, input, key);
  assert.equal(accepted.status, "approved"); assert.equal(accepted.totalCents, 4700);
  assert.equal(accepted.testOnly, true); assert.ok(accepted.approvedAt);
  assert.deepEqual(quotes.approve(agent.id, input, key), accepted);
  assert.deepEqual(createServiceQuotes(store, "alice").read(agent.id), accepted);
  assert.equal(store.listReservations("alice").length, 0);
  store.close();
});

test("service quotes are isolated by tenant and selected business agent", () => {
  const { store, agent, other, quotes } = fixture();
  const quote = quotes.draft(agent); quotes.save(quote);
  assert.equal(quotes.read(other.id), undefined);
  assert.throws(() => quotes.approve(other.id, approval(agent.id, quote.id), key));
  const bob = createServiceQuotes(store, "bob");
  assert.equal(bob.read(agent.id), undefined);
  assert.throws(() => bob.approve(agent.id, approval(agent.id, quote.id), key));
  assert.throws(() => bob.approve(agent.id, approval(agent.id, quote.id, "bob"), key));
  assert.equal(quotes.read(agent.id)!.status, "pending");
  store.close();
});

test("replaced quotes and changed or removed business prices cannot be approved", () => {
  const { store, agent, library, quotes } = fixture();
  const old = quotes.draft(agent); quotes.save(old);
  const current = quotes.draft(agent); quotes.save(current);
  assert.throws(() => quotes.approve(agent.id, approval(agent.id, old.id), key), /current|changed|new/i);
  const updated = library.update(agent.id, { ...profile, serviceOffer: { ...offer, items: [{ label: "Labor", amountCents: 6000 }] }, version: agent.version });
  assert.throws(() => quotes.approve(agent.id, approval(agent.id, current.id), key), /changed|new/i);
  const fresh = quotes.draft(updated); quotes.save(fresh);
  const { serviceOffer: _offer, ...withoutOffer } = profile;
  const removed = library.update(agent.id, { ...withoutOffer, version: updated.version });
  assert.throws(() => quotes.approve(agent.id, approval(agent.id, fresh.id), key), /changed|offer|new/i);
  assert.throws(() => quotes.draft(removed), /offer|pricing/i);
  assert.equal(quotes.read(agent.id)!.status, "pending");
  store.close();
});

test("an expired service quote or approval token cannot be accepted", () => {
  const { store, agent, quotes } = fixture();
  const quote = quotes.draft(agent); quotes.save(quote);
  assert.throws(() => quotes.approve(agent.id, { ...approval(agent.id, quote.id), approval: createApproval("alice", "agent-service", `${agent.id}:${quote.id}`, key, Date.now() - 700000) }, key), /approval|review/i);
  quotes.save({ ...quote, expiresAt: new Date(Date.now() - 1).toISOString() });
  assert.throws(() => quotes.approve(agent.id, approval(agent.id, quote.id), key), /expired/i);
  assert.equal(quotes.read(agent.id)!.status, "pending");
  store.close();
});

test("service acceptance waits while the selected agent is replying, without affecting other agent locks", () => {
  const { store, agent, other, quotes } = fixture();
  store.db.exec("CREATE TABLE agent_chat_threads (tenant_id TEXT, skill_id TEXT, locked_until INTEGER)");
  store.db.prepare("INSERT INTO agent_chat_threads VALUES (?,?,?)").run("alice", agent.id, Date.now() + 60000);
  const quote = quotes.draft(agent); quotes.save(quote);
  assert.throws(() => quotes.approve(agent.id, approval(agent.id, quote.id), key), /replying|wait/i);
  assert.equal(quotes.read(agent.id)!.status, "pending");
  const otherQuote = quotes.draft(other); quotes.save(otherQuote);
  assert.equal(quotes.approve(other.id, approval(other.id, otherQuote.id), key).status, "approved");
  store.close();
});
