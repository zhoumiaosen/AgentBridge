import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary, parseSkillImport } from "../src/lib/skill-library.ts";

const profile = { name: "Lantern test agent", ownerType: "business", ownerName: "Fictional workshop", kind: "agent", category: "Bicycle repair", summary: "Test repair quotes", content: "Fictional business. No appointments or payments." };
const offer = { title: "Inner tube replacement", items: [{ label: "Labor", amountCents: 3500 }, { label: "Inner tube", amountCents: 1200 }] };
function fixture() {
  const store = createStore(":memory:"); store.ensureTenant("alice");
  return { store, library: createSkillLibrary(store, "alice") };
}

test("business agents publish and import structured service prices without a room", () => {
  const { store, library } = fixture();
  const entry = library.publish({ ...profile, serviceOffer: offer });
  assert.deepEqual(entry.serviceOffer, offer);
  assert.deepEqual(createSkillLibrary(store, "alice").read(entry.id).serviceOffer, offer);
  assert.deepEqual(parseSkillImport(JSON.stringify(entry), "agent.json").serviceOffer, offer);
  assert.equal(store.listReservations("alice").length, 0);
  store.close();
});

test("service prices require business agents and bounded whole cents, not executable or extra fields", () => {
  const { store, library } = fixture();
  const invalid = [null, {}, { ...offer, currency: "EUR" }, { ...offer, title: " " }, { ...offer, title: "x".repeat(121) },
    { ...offer, items: [] }, { ...offer, items: Array(9).fill(offer.items[0]) },
    ...[-1, 1.5, NaN, Infinity, "3500", Number.MAX_SAFE_INTEGER, 1000001].map(amountCents => ({ ...offer, items: [{ label: "Labor", amountCents }] })),
    { ...offer, items: [{ label: " ", amountCents: 3500 }] }, { ...offer, items: [{ label: "x".repeat(121), amountCents: 3500 }] },
    { ...offer, items: [{ label: "Labor", amountCents: 0 }] }, { ...offer, items: [{ label: "Labor", amountCents: 3500, paymentUrl: "https://example.com/pay" }] },
    { ...offer, items: [{ label: "Labor", amountCents: 600000 }, { label: "Parts", amountCents: 600000 }] }];
  for (const serviceOffer of invalid) assert.throws(() => library.publish({ ...profile, serviceOffer }));
  assert.throws(() => library.publish({ ...profile, ownerType: "customer", serviceOffer: offer }), /business agent/i);
  assert.throws(() => library.publish({ ...profile, kind: "skill", serviceOffer: offer }), /business agent/i);
  assert.throws(() => parseSkillImport(JSON.stringify({ ownerType: "customer", serviceOffer: offer }), "agent.json"), /business agent/i);
  assert.equal(library.list().filter(item => item.source === "custom").length, 0);
  store.close();
});

test("full profile updates can remove service pricing and retain prior price history", () => {
  const { store, library } = fixture();
  const original = library.publish({ ...profile, serviceOffer: offer });
  const updated = library.update(original.id, { ...profile, version: original.version });
  assert.equal(updated.serviceOffer, undefined);
  assert.deepEqual(library.history(original.id)[0].serviceOffer, offer);
  assert.equal(library.publish(profile).serviceOffer, undefined);
  store.close();
});
