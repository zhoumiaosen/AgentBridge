import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createAgentChat, withAgentChatApproval } from "../src/lib/agent-chat.ts";

const key = "service-approval-test-secret-at-least-32-characters";
const profile = { name: "Lantern test repair", ownerName: "Fictional repair business", ownerType: "business", kind: "agent", category: "Bicycle repair", summary: "Test puncture repair", content: "Fictional test only. No scheduling or payment.", serviceOffer: { title: "Rear tire puncture repair", items: [{ label: "Labor", amountCents: 3500 }, { label: "Inner tube", amountCents: 1200 }] } };
function setup() {
  const store = createStore(":memory:"); store.ensureTenant("alice");
  const library = createSkillLibrary(store, "alice");
  const agent = library.publish(profile);
  return { store, library, agent, chat: createAgentChat(store, "alice") };
}
async function withModel(run: () => Promise<void>, fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "A made-up quote costs $1." } }] })) {
  const previous = globalThis.fetch, oldKey = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test-only"; globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = previous; if (oldKey === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = oldKey; }
}

test("a repair quote request saves itemized owner prices and asks for approval without creating a reservation", async () => {
  const { store, agent, chat } = setup();
  try { await withModel(async () => {
    const result = await chat.send(agent.id, { message: "Prepare a bike repair quote and ask for my approval. Test only, no appointment or payment." });
    assert.equal(result.canBook, false); assert.equal(result.canQuoteService, true);
    assert.equal(result.serviceQuote?.totalCents, 4700);
    assert.deepEqual(result.serviceQuote?.items, [{ label: "Labor", amountCents: 3500 }, { label: "Inner tube", amountCents: 1200 }]);
    assert.equal(result.serviceQuote?.status, "pending");
    assert.match(result.reply, /47\.00/); assert.match(result.reply, /approval|approve/i);
    assert.deepEqual(chat.read(agent.id).serviceQuote, result.serviceQuote);
    assert.equal(store.listReservations("alice").length, 0);
    const review = withAgentChatApproval(result, "alice", agent.id, key);
    assert.ok(review.serviceApproval); assert.equal(review.approval, undefined);
  }); } finally { store.close(); }
});

test("chat approval words cannot approve a service quote and a refreshed quote requires new consent", async () => {
  const { store, agent, chat } = setup();
  try { await withModel(async () => {
    const prepared = await chat.send(agent.id, { message: "Prepare a test quote" });
    const yes = await chat.send(agent.id, { message: "Yes, approve it" });
    assert.equal(yes.serviceQuote?.id, prepared.serviceQuote?.id);
    assert.equal(yes.serviceQuote?.status, "pending");
    assert.match(yes.reply, /checkbox|approval control|button/i);
    const reviewed = await chat.send(agent.id, { message: "Please show my existing quote." });
    assert.equal(reviewed.serviceQuote?.id, prepared.serviceQuote?.id);
    assert.equal(reviewed.serviceQuote?.status, "pending");
    const refreshed = await chat.send(agent.id, { message: "Refresh test quote" });
    assert.notEqual(refreshed.serviceQuote?.id, prepared.serviceQuote?.id);
    assert.equal(refreshed.serviceQuote?.status, "pending");
    assert.equal(store.listReservations("alice").length, 0);
  }); } finally { store.close(); }
});

test("negative quote requests and ordinary repair questions do not prepare a quote", async () => {
  const { store, agent, chat } = setup();
  try { await withModel(async () => {
    for (const message of ["Do not prepare a quote yet; what details do you need?", "Don't quote me; explain tire valves.", "What does approving a quote mean?", "What details do you need before preparing a quote?", "Can you explain how to prepare a quote?", "I would like to know what your quote includes."]) {
      const result = await chat.send(agent.id, { message });
      assert.equal(result.serviceQuote, undefined);
    }
  }, async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "I can discuss the repair without preparing a quote." } }] })); } finally { store.close(); }
});

test("repricing the profile removes approval for an old quote and current pricing is used on refresh", async () => {
  const { store, library, agent, chat } = setup();
  try { await withModel(async () => {
    await chat.send(agent.id, { message: "Prepare a test quote" });
    library.update(agent.id, { ...profile, version: agent.version, serviceOffer: { ...profile.serviceOffer, items: [{ label: "Labor", amountCents: 4000 }, { label: "Inner tube", amountCents: 1200 }] } });
    assert.equal(withAgentChatApproval(chat.read(agent.id), "alice", agent.id, key).serviceApproval, undefined);
    const fresh = await chat.send(agent.id, { message: "Refresh test quote" });
    assert.equal(fresh.serviceQuote?.totalCents, 5200);
    assert.ok(withAgentChatApproval(fresh, "alice", agent.id, key).serviceApproval);
  }); } finally { store.close(); }
});
