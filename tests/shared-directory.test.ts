import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary, parseSkillImport } from "../src/lib/skill-library.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";

const draft = {
  name: "Fictional Copper Wheel", ownerType: "business", ownerName: "Copper Wheel", kind: "agent",
  category: "Bicycle repair", summary: "Bicycle puncture repair and tire replacement.", content: "Private editor phrase: saffronquartz. Fictional service; no real appointments or payments.",
  serviceOffer: { title: "Flat tire repair", items: [{ label: "Labor", amountCents: 3500 }, { label: "Tube", amountCents: 1200 }] },
};
function fixture() {
  const store = createStore(":memory:");
  for (const id of ["owner", "customer", "other"]) store.ensureTenant(id);
  return { store, owner: createSkillLibrary(store, "owner"), customer: createSkillLibrary(store, "customer"), other: createSkillLibrary(store, "other") };
}

test("publication is explicit, shared profiles retain one identity, and owner sources stay private", () => {
  const { store, owner, customer, other } = fixture();
  try {
    const agent = owner.publish(draft);
    assert.equal(agent.visibility, "private");
    assert.equal(agent.canEdit, true);
    assert.throws(() => customer.resolve(agent.id), /not found/i);
    const published = owner.setVisibility(agent.id, "public", agent.version);
    assert.equal(published.version, 2);
    for (const visitor of [customer, other]) {
      const found = visitor.list({ query: "bike repair" }).find(item => item.id === agent.id)!;
      assert.ok(found);
      assert.equal(found.visibility, "public");
      assert.equal(found.canEdit, false);
      assert.equal(visitor.resolve(agent.id).ownerTenantId, "owner");
      assert.equal(visitor.resolve(agent.id).skill.serviceOffer?.items.reduce((sum, item) => sum + item.amountCents, 0), 4700);
      assert.throws(() => visitor.read(agent.id), /not found/i);
      assert.throws(() => visitor.manifest(agent.id), /not found/i);
      assert.throws(() => visitor.history(agent.id), /not found/i);
      assert.throws(() => visitor.update(agent.id, { ...draft, version: 2 }), /not found/i);
      assert.throws(() => visitor.setVisibility(agent.id, "private", 2), /not found/i);
      assert.equal(visitor.list({ query: "saffronquartz" }).length, 0);
    }
    assert.equal(owner.list({ query: "saffronquartz" })[0].id, agent.id);
    assert.throws(() => owner.setVisibility(agent.id, "private", 1), /version/i);
    owner.setVisibility(agent.id, "private", published.version);
    assert.throws(() => customer.resolve(agent.id), /not found/i);
    assert.equal(customer.list().some(item => item.id === agent.id), false);
  } finally { store.close(); }
});

test("personal entries cannot be public and imported files cannot supply publication consent", () => {
  const { store, owner, customer } = fixture();
  try {
    const { serviceOffer: _offer, ...personal } = draft;
    assert.throws(() => owner.publish({ ...personal, ownerType: "customer", visibility: "public" }), /business|public|service/i);
    const saved = owner.publish({ ...personal, ownerType: "customer" });
    assert.throws(() => owner.setVisibility(saved.id, "public", saved.version), /private|business/i);
    assert.throws(() => customer.resolve(saved.id), /not found/i);
    const publicAgent = owner.publish({ ...draft, visibility: "public" });
    const imported = parseSkillImport(JSON.stringify(publicAgent), "agent.json");
    assert.equal(imported.visibility, undefined);
    const copy = customer.publish(imported);
    assert.equal(copy.visibility, "private");
    assert.notEqual(copy.id, publicAgent.id);
    const privatePersonal = owner.update(publicAgent.id, { ...personal, ownerType: "customer", visibility: "private", version: publicAgent.version });
    assert.equal(privatePersonal.visibility, "private");
    assert.throws(() => customer.resolve(publicAgent.id), /not found/i);
  } finally { store.close(); }
});

test("shared examples are seeded once, span eight businesses, and always use fixed test prices", () => {
  const { store, customer, other } = fixture();
  try {
    const examples = customer.list().filter(skill => skill.source === "example" && !skill.canEdit);
    assert.equal(examples.length, 8);
    assert.deepEqual(examples.map(skill => skill.id), other.list().filter(skill => skill.source === "example" && !skill.canEdit).map(skill => skill.id));
    assert.equal(new Set(examples.map(skill => skill.category)).size, 8);
    for (const skill of examples) {
      assert.equal(skill.ownerType, "business");
      assert.equal(skill.kind, "agent");
      assert.equal(skill.visibility, "public");
      assert.ok(skill.serviceOffer?.items.length);
      assert.ok(skill.serviceOffer!.items.every(item => Number.isSafeInteger(item.amountCents) && item.amountCents > 0));
      assert.match(skill.summary, /fictional example/i);
      assert.throws(() => customer.update(skill.id, { ...draft, version: 1 }), /not found/i);
    }
    createSkillLibrary(store, "customer");
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM skill_library WHERE id LIKE 'catalog_%'").get()!.count, 8);
    for (const query of ["bike repair", "home cleaning", "pet grooming", "hair salon", "math tutoring", "coffee", "computer support", "graphic design"]) {
      assert.ok(customer.list({ query }).some(skill => skill.id.startsWith("catalog_")), query);
    }
  } finally { store.close(); }
});

test("connected public room agents preserve the owner's listings and current reads work inside a transaction", () => {
  const { store, owner, customer } = fixture();
  try {
    const ownerBusiness = createBusinessSkills(store, "owner");
    const consumerBusiness = createBusinessSkills(store, "customer");
    const original = ownerBusiness.list()[0];
    const published = owner.setVisibility(original.id, "public", original.version);
    const resolved = customer.resolve(original.id);
    assert.equal(resolved.ownerTenantId, "owner");
    assert.equal(resolved.skill.canEdit, false);
    assert.equal(resolved.skill.businessId, original.id);
    assert.deepEqual(consumerBusiness.resolve(original.id).business.listingIds, original.listingIds);
    assert.equal(consumerBusiness.forListing(original.listingIds[0]).id, original.id);
    assert.ok(consumerBusiness.search({}).some(listing => listing.id === original.listingIds[0]));
    assert.equal(consumerBusiness.list().some(business => business.id === original.id), false);
    assert.throws(() => consumerBusiness.update(original.id, { version: published.version, summary: "stolen", knowledge: "stolen" }), /not found/i);
    store.db.exec("BEGIN IMMEDIATE");
    try {
      assert.equal(customer.current(original.id).skill.version, published.version);
      assert.equal(consumerBusiness.resolve(original.id).business.version, published.version);
      assert.equal(ownerBusiness.current(original.id)?.version, published.version);
    } finally { store.db.exec("ROLLBACK"); }
  } finally { store.close(); }
});
