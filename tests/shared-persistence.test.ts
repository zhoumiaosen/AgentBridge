import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createSkillLibrary } from "../src/lib/skill-library.ts";
import { createAgentChat, withAgentChatApproval } from "../src/lib/agent-chat.ts";

test("reopening the database preserves shared agents, private chat approvals and both reservation views", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentbridge-shared-persistence-"));
  const path = join(dir, "records.sqlite");
  let store = createStore(path);
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.NEBIUS_API_KEY;
  const secret = "test-only-stable-session-approval-secret";
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Review the test quote before approving." } }] });
  process.env.NEBIUS_API_KEY = "test-only";
  try {
    for (const id of ["owner", "customer", "other"]) store.ensureTenant(id);
    const service = createSkillLibrary(store, "owner").publish({
      name: "Durable Bicycle Workshop", ownerName: "Fictional workshop", ownerType: "business", kind: "agent", category: "Bicycle repair",
      summary: "Fictional flat tire repair", content: "Prepare test-only offers. Never perform real appointments or payments.", visibility: "public",
      serviceOffer: { title: "Flat tire repair", items: [{ label: "Labor", amountCents: 3500 }, { label: "Tube", amountCents: 1200 }] },
    });
    const chat = createAgentChat(store, "customer");
    const pending = await chat.send(service.id, { message: "Prepare a test repair quote." });
    assert.equal(pending.serviceQuote?.status, "pending");
    const review = withAgentChatApproval(pending, "customer", service.id, secret);
    const approval = { quoteId: pending.serviceQuote!.id, approval: review.serviceApproval, approved: true };
    const approved = chat.confirmService(service.id, approval, secret).serviceQuote!;
    assert.equal(approved.status, "approved");
    assert.equal(store.listReservations("customer").length, 0);

    const businesses = createBusinessSkills(store, "owner");
    const business = businesses.list()[0];
    businesses.update(business.id, { version: business.version, summary: "Fictional persistent stay", knowledge: "Test-only room booking.", visibility: "public" });
    const room = store.listListings("owner").find(item => business.listingIds.includes(item.id))!;
    const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
    const dates = { listingId: room.id, checkIn: day(70), checkOut: day(72), guests: 2 };
    const quote = store.createQuote("customer", dates, "owner");
    const reservation = store.confirmQuote("customer", { quoteId: quote.id, idempotencyKey: "approved-test-room" });
    const catalogIds = createSkillLibrary(store, "customer").list().filter(item => item.id.startsWith("catalog_")).map(item => item.id).sort();

    store.close();
    store = createStore(path);
    for (const id of ["owner", "customer", "other"]) store.ensureTenant(id);
    const reopenedLibrary = createSkillLibrary(store, "customer");
    assert.ok(reopenedLibrary.list({ query: "bike repair" }).some(item => item.id === service.id));
    assert.ok(reopenedLibrary.list().some(item => item.id === business.id));
    assert.deepEqual(reopenedLibrary.list().filter(item => item.id.startsWith("catalog_")).map(item => item.id).sort(), catalogIds);
    const reopenedChat = createAgentChat(store, "customer");
    const savedChat = reopenedChat.read(service.id);
    assert.deepEqual(savedChat.serviceQuote, approved);
    assert.ok(savedChat.messages.some(message => message.role === "user" && message.content === "Prepare a test repair quote."));
    assert.equal(reopenedChat.confirmService(service.id, approval, secret).serviceQuote?.id, approved.id);
    assert.deepEqual(createAgentChat(store, "other").read(service.id).messages, []);
    assert.equal(createAgentChat(store, "other").read(service.id).serviceQuote, undefined);
    assert.deepEqual(store.listReservations("customer"), [reservation]);
    assert.deepEqual(store.listBusinessReservations("owner"), [reservation]);
    assert.deepEqual(store.listReservations("other"), []);
    assert.throws(() => store.createQuote("other", dates, "owner"), /not available/i);
    assert.equal(store.confirmQuote("customer", { quoteId: quote.id, idempotencyKey: "approved-test-room" }).id, reservation.id);
  } finally {
    store.close();
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = previousKey;
    rmSync(dir, { recursive: true, force: true });
  }
});
