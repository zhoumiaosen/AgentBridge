import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, todaySF } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
import { createAgentChat } from "../src/lib/agent-chat.ts";

const day = (offset: number) => new Date(Date.parse(todaySF()) + offset * 86400000).toISOString().slice(0, 10);
const dates = { checkIn: day(30), checkOut: day(32), guests: 2 };
const call = (name: string, args: unknown) => Response.json({ choices: [{ finish_reason: "tool_calls", message: {
  role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name, arguments: JSON.stringify(args) } }],
} }] });

for (const discovered of [false, true]) {
  test(`a fresh quote receives current owned room IDs ${discovered ? "after a previous discovery" : "in a new conversation"}`, async () => {
    const store = createStore(":memory:"); store.ensureTenant("alice");
    const room = store.publishListing("alice", { ...store.listListings("alice")[0], name: "Cedar House Garden Room", hostName: "Cedar House", nightlyCents: 13900, cleaningCents: 2000 });
    const business = createBusinessSkills(store, "alice").forListing(room.id), chat = createAgentChat(store, "alice");
    const original = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
    process.env.NEBIUS_API_KEY = "test-only";
    try {
      if (discovered) {
        let calls = 0;
        globalThis.fetch = async () => ++calls === 1 ? call("discover_stays", dates)
          : Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Here is the matching room." } }] });
        const found = await chat.send(business.id, { message: `Find a room from ${dates.checkIn} to ${dates.checkOut} for 2 guests.` });
        assert.deepEqual(found.listings?.map(item => item.id), [room.id]);
      }
      let publishedRooms: unknown, allowedIds: unknown;
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(String(options?.body));
        const reference = JSON.parse(request.messages.find((item: { role: string; tool_call_id?: string }) => item.role === "tool" && item.tool_call_id === "selected-agent-reference").content);
        publishedRooms = reference.publishedRooms;
        allowedIds = request.tools.find((tool: { function: { name: string } }) => tool.function.name === "create_quote").function.parameters.properties.listingId.enum;
        // The provider can only quote an exact room ID when the request supplies it.
        const known = reference.publishedRooms?.find((item: { name: string }) => item.name === "Cedar House Garden Room");
        return call("create_quote", { listingId: known?.id ?? "cedar-house-garden-room", ...dates });
      };
      const result = await chat.send(business.id, { message: `Prepare a fresh test quote for Cedar House Garden Room from ${dates.checkIn} to ${dates.checkOut} for 2 guests. Only prepare the quote for review; do not book.` });
      assert.equal(result.quote?.listingId, room.id);
      assert.equal(result.quote?.totalCents, 29800);
      assert.deepEqual(publishedRooms, [{ id: room.id, name: "Cedar House Garden Room" }]);
      assert.deepEqual(allowedIds, [room.id]);
      assert.equal(result.reservation, undefined);
      assert.deepEqual(store.listReservations("alice"), []);
      assert.equal(store.db.prepare("SELECT count(*) AS count FROM quotes WHERE tenant_id=?").get("alice")!.count, 1);
      assert.equal(store.db.prepare("SELECT count(*) AS count FROM occupied_nights WHERE tenant_id=?").get("alice")!.count, 0);
    } finally {
      store.close(); globalThis.fetch = original;
      if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key;
    }
  });
}
