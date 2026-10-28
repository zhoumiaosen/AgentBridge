import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary, type LibraryDraft } from "../src/lib/skill-library.ts";

function workspace() {
  const store = createStore(":memory:");
  store.ensureTenant("alice");
  store.ensureTenant("bob");
  return { store, alice: createSkillLibrary(store, "alice"), bob: createSkillLibrary(store, "bob") };
}
const service: LibraryDraft = {
  name: "North Bench", ownerType: "business", ownerName: "North Bench", kind: "agent",
  category: "Computer services", summary: "Laptop hardware diagnostics and screen repair.",
  content: "Discuss the published service process. No real appointment or payment is available.",
};

test("service discovery matches bicycle aliases and separated repair terms without a business name", () => {
  const { store, alice } = workspace();
  try {
    for (const query of ["bike repair", "bicycle repairs", "bikes repair service", "cycle repair", "bike-repair", "bike repair businesses"]) {
      assert.deepEqual(alice.list({ query }).map(item => item.name), ["Cycle shop service desk"], query);
    }
  } finally { store.close(); }
});

test("service matching covers coffee shops and arbitrary custom categories", () => {
  const { store, alice } = workspace();
  try {
    const laptop = alice.publish(service);
    const grooming = alice.publish({ ...service, name: "Paw House", ownerName: "Paw House", category: "Pet care", summary: "Bathing, nail trims and grooming for dogs." });
    assert.deepEqual(alice.list({ query: "coffee shop" }).map(item => item.name), ["Café guest services"]);
    assert.deepEqual(alice.list({ query: "CAFE SERVICES" }).map(item => item.name), ["Café guest services"]);
    assert.deepEqual(alice.list({ query: "laptop repairs" }).map(item => item.id), [laptop.id]);
    assert.deepEqual(alice.list({ query: "dog grooming" }).map(item => item.id), [grooming.id]);
  } finally { store.close(); }
});

test("meaningful domain constraints and unsupported services are not broadened away", () => {
  const { store, alice } = workspace();
  try {
    for (const query of ["car repair", "motorcycle repair", "bike dentist", "dentist", "unicorn repair", "!!!"]) {
      assert.deepEqual(alice.list({ query }), [], query);
    }
  } finally { store.close(); }
});

test("exact names and partial names keep working with normalized accents and punctuation", () => {
  const { store, alice } = workspace();
  try {
    assert.deepEqual(alice.list({ query: "  CYCLE SHOP SERVICE DESK  " }).map(item => item.name), ["Cycle shop service desk"]);
    assert.deepEqual(alice.list({ query: "Cycle shop" }).map(item => item.name), ["Cycle shop service desk"]);
    assert.deepEqual(alice.list({ query: "JUNI" }).map(item => item.ownerName), ["Juniper Café"]);
    assert.deepEqual(alice.list({ query: "cafe guest-services" }).map(item => item.name), ["Café guest services"]);
    assert.equal(alice.list({ query: "  " }).length, alice.list().length);
  } finally { store.close(); }
});

test("service matching preserves owner, kind and tenant boundaries", () => {
  const { store, alice, bob } = workspace();
  try {
    const personal = alice.publish({ ...service, name: "My laptop checklist", ownerType: "customer", ownerName: "Me", kind: "skill" });
    const business = alice.publish(service);
    const foreign = bob.publish({ ...service, name: "Hidden bench" });
    assert.deepEqual(alice.list({ query: "laptop repair", ownerType: "business", kind: "agent" }).map(item => item.id), [business.id]);
    assert.deepEqual(alice.list({ query: "laptop repair", ownerType: "customer", kind: "skill" }).map(item => item.id), [personal.id]);
    assert.deepEqual(alice.list({ query: "laptop repair", ownerType: "business", kind: "skill" }), []);
    assert.deepEqual(bob.list({ query: "laptop repair" }).map(item => item.id), [foreign.id]);
    assert.deepEqual(alice.list({ query: "Hidden bench" }), []);
  } finally { store.close(); }
});
