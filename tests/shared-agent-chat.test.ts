import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat, withAgentChatApproval } from "../src/lib/agent-chat.ts";

const secret = "shared-test-only-approval-secret-long-enough";
const offer = { name: "Lantern shared test repair", ownerName: "Fictional bike business", ownerType: "business", kind: "agent", category: "Bicycle repair", summary: "Fictional puncture repair", content: "Owner instructions are private reference. Test only.", visibility: "public", serviceOffer: { title: "Puncture repair", items: [{ label: "Labor", amountCents: 3500 }, { label: "Tube", amountCents: 1200 }] } };
function setup() {
  const store = createStore(":memory:");
  for (const id of ["owner", "alice", "bob"]) store.ensureTenant(id);
  return { store, library: createSkillLibrary(store, "owner"), alice: createAgentChat(store, "alice"), bob: createAgentChat(store, "bob") };
}
async function mockModel(run: () => Promise<void>, fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Please use the test approval control." } }] })) {
  const previous = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  globalThis.fetch = fetcher; process.env.NEBIUS_API_KEY = "test-only";
  try { await run(); } finally { globalThis.fetch = previous; if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key; }
}
test("customers find one public service agent with isolated chats, quotes, and explicit approvals", async () => {
  const { store, library, alice, bob } = setup();
  try { await mockModel(async () => {
    const agent = library.publish(offer);
    assert.ok(createSkillLibrary(store, "alice").list({ query: "bike repair" }).some(item => item.id === agent.id));
    const result = await alice.send(agent.id, { message: "Prepare a test quote" });
    assert.equal(result.serviceQuote?.totalCents, 4700);
    assert.equal(result.serviceQuote?.status, "pending");
    assert.deepEqual(bob.read(agent.id).messages, []);
    assert.equal(bob.read(agent.id).serviceQuote, undefined);
    const review = withAgentChatApproval(result, "alice", agent.id, secret);
    const input = { quoteId: result.serviceQuote!.id, approval: review.serviceApproval, approved: true };
    assert.throws(() => bob.confirmService(agent.id, input, secret), /approve|review/i);
    assert.equal((await alice.send(agent.id, { message: "Yes approve it" })).serviceQuote?.status, "pending");
    const accepted = alice.confirmService(agent.id, input, secret);
    assert.equal(accepted.serviceQuote?.status, "approved");
    assert.equal(createAgentChat(store, "alice").read(agent.id).serviceQuote?.status, "approved");
    assert.equal(createAgentChat(store, "owner").read(agent.id).serviceQuote, undefined);
    assert.equal(store.listReservations("alice").length, 0);
  }); } finally { store.close(); }
});
test("another business's reprice or unpublish invalidates pending service approvals", async () => {
  const { store, library, alice } = setup();
  try { await mockModel(async () => {
    const agent = library.publish(offer);
    const first = await alice.send(agent.id, { message: "Prepare a test quote" });
    const approval = withAgentChatApproval(first, "alice", agent.id, secret).serviceApproval;
    const updated = library.update(agent.id, { ...offer, version: agent.version, serviceOffer: { ...offer.serviceOffer, items: [{ label: "Labor", amountCents: 5000 }] } });
    assert.throws(() => alice.confirmService(agent.id, { quoteId: first.serviceQuote!.id, approval, approved: true }, secret), /changed/i);
    const next = await alice.send(agent.id, { message: "Refresh test quote" });
    const consent = withAgentChatApproval(next, "alice", agent.id, secret).serviceApproval;
    library.update(agent.id, { ...offer, version: updated.version, visibility: "private" });
    assert.throws(() => alice.confirmService(agent.id, { quoteId: next.serviceQuote!.id, approval: consent, approved: true }, secret), /changed|not found|published/i);
  }); } finally { store.close(); }
});
test("public hotel chat uses owner's room, records customer approval, and allows cancellation after unpublish", async () => {
  const { store, alice, bob } = setup();
  const businessApi = createBusinessSkills(store, "owner");
  const business = businessApi.list()[0];
  const published = businessApi.update(business.id, { version: business.version, summary: "Fictional hotel", knowledge: "Test only", visibility: "public" });
  const room = store.listListings("owner").find(item => business.listingIds.includes(item.id))!;
  const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
  const dates = { checkIn: day(50), checkOut: day(52), guests: 2 };
  let calls = 0;
  try { await mockModel(async () => {
    const result = await alice.send(business.id, { message: `Prepare a test quote for ${dates.checkIn} to ${dates.checkOut}, 2 guests.` });
    assert.equal(result.quote?.listingId, room.id);
    const consent = withAgentChatApproval(result, "alice", business.id, secret);
    const accepted = alice.confirm(business.id, { quoteId: result.quote!.id, approval: consent.approval, approved: true, idempotencyKey: "shared-room" }, secret);
    assert.equal(accepted.reservation?.status, "confirmed");
    assert.deepEqual(bob.read(business.id).messages, []);
    assert.deepEqual(bob.read(business.id).reservations, []);
    assert.equal(store.listBusinessReservations("owner")[0].id, accepted.reservation!.id);
    businessApi.update(business.id, { version: published.version, summary: "Fictional hotel", knowledge: "Test only", visibility: "private" });
    const cancellation = withAgentChatApproval(alice.read(business.id), "alice", business.id, secret).cancellation!;
    const canceled = alice.cancel(business.id, { ...cancellation, approved: true }, secret);
    assert.equal(canceled.reservation?.status, "canceled");
    assert.equal(store.listBusinessReservations("owner")[0].status, "canceled");
  }, async () => ++calls === 1 ? Response.json({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "quote", type: "function", function: { name: "create_quote", arguments: JSON.stringify({ ...dates, listingId: room.id }) } }] } }] }) : Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Review your quote." } }] })); } finally { store.close(); }
});
