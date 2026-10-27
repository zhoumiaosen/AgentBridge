import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";
import * as storeApi from "../src/lib/store.ts";

function day(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function fixture() {
  const store = createStore(":memory:");
  store.ensureTenant("alice");
  store.ensureTenant("bob");
  const room = store
    .listListings("alice")
    .find((x) => x.cancellation === "flexible")!;
  return { store, room };
}
function input(listingId: string, start = 10, end = 12) {
  return { listingId, checkIn: day(start), checkOut: day(end), guests: 1 };
}

test("seed once and isolate tenant listings", () => {
  const { store } = fixture();
  assert.equal(store.listListings("alice").length, 3);
  store.ensureTenant("alice");
  assert.equal(store.listListings("alice").length, 3);
  assert.notEqual(
    store.listListings("alice")[0].id,
    store.listListings("bob")[0].id,
  );
  store.close();
});
test("quotes calculate authoritative total and expiry", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  assert.equal(q.nights, 2);
  assert.equal(q.totalCents, room.nightlyCents * 2 + room.cleaningCents);
  assert.ok(Date.parse(q.expiresAt) > Date.now());
  assert.throws(() => store.createQuote("bob", input(room.id)), /not found/i);
  store.close();
});
test("reject invalid dates, guests, unavailable and excessively long stays", () => {
  const { store, room } = fixture();
  for (const p of [
    { checkIn: "2026-02-30" },
    { checkOut: day(10) },
    { checkIn: "2020-01-01" },
    { checkOut: day(45) },
    { guests: 99 },
    { guests: 1.5 },
    { checkOut: day(190) },
  ])
    assert.throws(() =>
      store.createQuote("alice", { ...input(room.id), ...p }),
    );
  store.close();
});
test("booking prevents overlaps, permits adjacent nights, and idempotently returns same reservation", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  const q2 = store.createQuote("alice", input(room.id));
  const r = store.confirmQuote("alice", {
    quoteId: q.id,
    idempotencyKey: "book-one",
  });
  assert.equal(r.status, "confirmed");
  assert.equal(
    store.confirmQuote("alice", { quoteId: q.id, idempotencyKey: "book-one" })
      .id,
    r.id,
  );
  assert.throws(
    () =>
      store.confirmQuote("alice", {
        quoteId: q2.id,
        idempotencyKey: "book-two",
      }),
    /available/i,
  );
  assert.throws(
    () =>
      store.confirmQuote("alice", {
        quoteId: q2.id,
        idempotencyKey: "book-one",
      }),
    /idempotency/i,
  );
  const adjacent = store.createQuote("alice", input(room.id, 12, 13));
  assert.equal(
    store.confirmQuote("alice", {
      quoteId: adjacent.id,
      idempotencyKey: "adjacent",
    }).status,
    "confirmed",
  );
  assert.ok(
    !store.listListings("alice", input(room.id)).find((x) => x.id === room.id),
  );
  store.close();
});
test("quote cannot be confirmed twice with different keys or by a different tenant", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  assert.throws(
    () => store.confirmQuote("bob", { quoteId: q.id, idempotencyKey: "x" }),
    /not found/i,
  );
  const r = store.confirmQuote("alice", {
    quoteId: q.id,
    idempotencyKey: "first",
  });
  assert.equal(
    store.confirmQuote("alice", { quoteId: q.id, idempotencyKey: "second" }).id,
    r.id,
  );
  assert.equal(store.listReservations("alice").length, 1);
  store.close();
});
test("expired quotes and changed listing prices require a new quote", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  store.db
    .prepare("UPDATE quotes SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", q.id);
  assert.throws(
    () =>
      store.confirmQuote("alice", { quoteId: q.id, idempotencyKey: "expired" }),
    /expired/i,
  );
  const q2 = store.createQuote("alice", input(room.id));
  store.db
    .prepare("UPDATE listings SET data=? WHERE id=?")
    .run(
      JSON.stringify({ ...room, nightlyCents: room.nightlyCents + 100 }),
      room.id,
    );
  assert.throws(
    () =>
      store.confirmQuote("alice", {
        quoteId: q2.id,
        idempotencyKey: "changed",
      }),
    /changed/i,
  );
  store.close();
});
test("cancel releases inventory and disallows cross-tenant access", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  const r = store.confirmQuote("alice", {
    quoteId: q.id,
    idempotencyKey: "cancel",
  });
  assert.throws(() => store.cancelReservation("bob", r.id), /not found/i);
  assert.equal(store.cancelReservation("alice", r.id).status, "canceled");
  assert.ok(
    store.listListings("alice", input(room.id)).some((x) => x.id === room.id),
  );
  assert.equal(store.cancelReservation("alice", r.id).status, "canceled");
  store.close();
});
test("restricted policy prevents cancellation and date changes", () => {
  const { store } = fixture();
  const room = store
    .listListings("alice")
    .find((x) => x.cancellation === "restricted")!;
  const q = store.createQuote("alice", input(room.id));
  const r = store.confirmQuote("alice", {
    quoteId: q.id,
    idempotencyKey: "restricted",
  });
  assert.throws(() => store.cancelReservation("alice", r.id), /policy/i);
  assert.throws(
    () =>
      store.createQuote("alice", {
        ...input(room.id, 14, 16),
        reservationId: r.id,
      }),
    /policy/i,
  );
  store.close();
});
test("date changes preserve confirmation and release original dates atomically", () => {
  const { store, room } = fixture();
  const q = store.createQuote("alice", input(room.id));
  const r = store.confirmQuote("alice", {
    quoteId: q.id,
    idempotencyKey: "original",
  });
  const change = store.createQuote("alice", {
    ...input(room.id, 11, 14),
    reservationId: r.id,
  });
  const changed = store.confirmQuote("alice", {
    quoteId: change.id,
    idempotencyKey: "change",
  });
  assert.equal(changed.id, r.id);
  assert.equal(changed.confirmation, r.confirmation);
  assert.equal(changed.checkOut, day(14));
  assert.equal(store.listReservations("alice").length, 1);
  assert.ok(
    store
      .listListings("alice", input(room.id, 10, 11))
      .some((x) => x.id === room.id),
  );
  store.close();
});
test("failed date change preserves original booking", () => {
  const { store, room } = fixture();
  const first = store.confirmQuote("alice", {
    quoteId: store.createQuote("alice", input(room.id)).id,
    idempotencyKey: "first",
  });
  const change = store.createQuote("alice", {
    ...input(room.id, 14, 16),
    reservationId: first.id,
  });
  store.confirmQuote("alice", {
    quoteId: store.createQuote("alice", input(room.id, 14, 16)).id,
    idempotencyKey: "other",
  });
  assert.throws(
    () =>
      store.confirmQuote("alice", {
        quoteId: change.id,
        idempotencyKey: "failed-change",
      }),
    /available/i,
  );
  assert.equal(
    store.listReservations("alice").find((x) => x.id === first.id)!.checkIn,
    day(10),
  );
  assert.ok(
    !store.listListings("alice", input(room.id)).some((x) => x.id === room.id),
  );
  store.close();
});
test("host publication validates data and expands capability search", () => {
  const { store, room } = fixture();
  assert.equal(
    store.listListings("alice", { amenities: ["Step-free access"] }).length,
    0,
  );
  const listing = store.publishListing("alice", {
    ...room,
    name: "New host room",
    amenities: ["Wi-Fi", "Step-free access"],
  });
  assert.ok(
    store
      .listListings("alice", { amenities: ["Step-free access"] })
      .some((x) => x.id === listing.id),
  );
  assert.throws(() =>
    store.publishListing("alice", { ...room, nightlyCents: 12.5 }),
  );
  assert.throws(() => store.publishListing("alice", { ...room, name: "" }));
  assert.throws(() =>
    store.publishListing("alice", { ...room, availableFrom: "2026-02-30" }),
  );
  assert.throws(() =>
    store.publishListing("alice", { ...room, availableTo: day(400) }),
  );
  assert.throws(() =>
    store.publishListing("alice", { ...room, image: "javascript:alert(1)" }),
  );
  store.close();
});
test("preferences and conversation memory are isolated and bounded", () => {
  const { store } = fixture();
  store.savePreferences("alice", {
    budget: 150,
    roomType: "private",
    amenities: ["Wi-Fi"],
  });
  assert.equal(store.getPreferences("alice").budget, 150);
  assert.notEqual(store.getPreferences("bob").budget, 150);
  assert.throws(() =>
    store.savePreferences("alice", {
      budget: -1,
      roomType: "private",
      amenities: [],
    }),
  );
  for (let i = 0; i < 25; i++)
    store.addMessage("alice", "user", `message ${i}`);
  assert.equal(store.getMessages("alice").length, 20);
  assert.equal(store.getMessages("bob").length, 0);
  store.close();
});

test("persisted bookings survive restart and shared connections enforce inventory", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "agentbridge-test-"));
  const path = join(dir, "bookings.sqlite");
  const first = createStore(path);
  first.ensureTenant("shared");
  const room = first.listListings("shared")[0];
  const quote1 = first.createQuote("shared", input(room.id));
  const quote2 = first.createQuote("shared", input(room.id));
  const { Worker } = await import("node:worker_threads");
  const moduleUrl = new URL("../src/lib/store.ts", import.meta.url).href;
  function confirm(quoteId: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        `const {parentPort,workerData}=require('node:worker_threads');(async()=>{let store;try{const {createStore}=await import(workerData.moduleUrl);store=createStore(workerData.path);store.confirmQuote('shared',{quoteId:workerData.quoteId,idempotencyKey:workerData.key});parentPort.postMessage('confirmed');}catch(e){parentPort.postMessage(e.message);}finally{store?.close();}})();`,
        { eval: true, workerData: { moduleUrl, path, quoteId, key } },
      );
      worker.once("message", resolve);
      worker.once("error", reject);
    });
  }
  const results = await Promise.all([
    confirm(quote1.id, "worker-1"),
    confirm(quote2.id, "worker-2"),
  ]);
  assert.equal(results.filter((x) => x === "confirmed").length, 1);
  assert.ok(results.some((x) => /available/i.test(x)));
  first.close();
  const reopened = createStore(path);
  reopened.ensureTenant("shared");
  assert.equal(reopened.listReservations("shared").length, 1);
  assert.equal(reopened.listListings("shared").length, 3);
  reopened.close();
  rmSync(dir, { recursive: true });
});

test("stale cancellation approval cannot cancel a changed reservation", () => {
  const { store, room } = fixture();
  const original = store.confirmQuote("alice", {
    quoteId: store.createQuote("alice", input(room.id)).id,
    idempotencyKey: "before-change",
  });
  const originalRevision = storeApi.reservationRevision(original);
  const change = store.createQuote("alice", {
    ...input(room.id, 15, 17),
    reservationId: original.id,
  });
  const changed = store.confirmQuote("alice", {
    quoteId: change.id,
    idempotencyKey: "after-change",
  });
  assert.throws(
    () => store.cancelReservation("alice", original.id, originalRevision),
    /Reservation changed. Review cancellation again./,
  );
  assert.equal(store.listReservations("alice")[0].status, "confirmed");
  assert.notEqual(storeApi.reservationRevision(changed), originalRevision);
  assert.equal(
    store.cancelReservation(
      "alice",
      changed.id,
      storeApi.reservationRevision(changed),
    ).status,
    "canceled",
  );
  store.close();
});
