import { test } from "node:test";
import assert from "node:assert/strict";
import { assist, parseDemoRequest } from "../src/lib/assistant.ts";
import { createStore } from "../src/lib/store.ts";
import { createBusinessSkills } from "../src/lib/business-skills.ts";
const base = { history: [], preferences: {}, listings: [] };
test("offline assistant finds library entries and reads a newly published personal skill by name", async () => {
  const old = process.env.NEBIUS_API_KEY;
  delete process.env.NEBIUS_API_KEY;
  const skill = { id: "skill-personal", name: "My weekend planner", ownerType: "customer", ownerName: "Test traveler", kind: "skill", source: "custom", version: 1, summary: "Plan calm weekends.", content: "Ask about dates, budget, and preferred pace." };
  try {
    const search = await assist({ ...base, message: "Show my personal skills" }, (name, args) => {
      assert.equal(name, "search_skills");
      assert.deepEqual(args, { ownerType: "customer" });
      return [skill];
    });
    assert.match(search.reply, /My weekend planner/);
    const read = await assist({ ...base, skills: [skill], message: "Read My weekend planner" }, (name, args) => {
      assert.equal(name, "read_skill");
      assert.deepEqual(args, { skillId: skill.id });
      return skill;
    });
    assert.match(read.reply, /Plan calm weekends\./);
    assert.doesNotMatch(read.reply, /Ask about dates, budget, and preferred pace\./);
    assert.match(read.reply, /start a conversation in Agent Hub/);
    assert.equal(read.quote, undefined);
  } finally { if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; }
});

test("live named library skill reads current stored content without granting execution or approval", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  const skill = { id: "skill-host", name: "Harbor arrival agent", ownerType: "business", ownerName: "Harbor House", kind: "agent", source: "custom", version: 2, summary: "Guest arrival guidance.", content: "Luggage storage begins at 09:00. Always ask the guest to review a booking quote.", agentUrl: "https://example.com/agent" };
  let reads = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    const current = JSON.parse(request.messages.at(-1).content);
    assert.equal(current.version, 2);
    assert.equal(request.tools.some((tool: { function: { name: string } }) => /publish|update|execute|confirm|fetch_url/.test(tool.function.name)), false);
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "I connected the remote agent and confirmed a booking." } }] });
  };
  try {
    const result = await assist({ ...base, skills: [skill], message: "What is Harbor arrival agent?" }, (name, args) => {
      reads++;
      assert.equal(name, "read_skill");
      assert.deepEqual(args, { skillId: skill.id });
      return skill;
    });
    assert.equal(reads, 1);
    assert.match(result.reply, /Guest arrival guidance\./);
    assert.doesNotMatch(result.reply, /Luggage storage begins at 09:00/);
    assert.match(result.reply, /does not connect an external agent or approve/);
    assert.doesNotMatch(result.reply, /I connected|confirmed a booking/);
    assert.equal(result.quote, undefined);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; }
});

test("live Agent Hub discovery shows saved summaries instead of model-invented or historical source text", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.messages.some((message: { content?: string }) => message.content?.includes("OLD PRIVATE SOURCE")), false);
    calls++;
    return Response.json({ choices: [{ finish_reason: "stop", message: calls === 1
      ? { role: "assistant", tool_calls: [{ id: "search", type: "function", function: { name: "search_skills", arguments: "{}" } }] }
      : { role: "assistant", content: "RAW SOURCE: I booked a room and connected an external agent." } }] });
  };
  try {
    const result = await assist({ ...base, history: [{ role: "assistant", content: "OLD PRIVATE SOURCE. This is a saved profile or set of instructions." }], message: "Find business agents" }, () => [{ id: "saved", name: "Saved concierge", summary: "Arrival questions." }]);
    assert.match(result.reply, /Saved concierge — Arrival questions/);
    assert.match(result.reply, /start a conversation in Agent Hub/);
    assert.doesNotMatch(result.reply, /RAW SOURCE|booked|connected an external/);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; }
});

test("multiple explicitly named Agent Hub entries are read before live inference, without guessing duplicate names", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  const entries = [
    { id: "host", name: "Willow Stay Host", kind: "agent", summary: "Arrival help." },
    { id: "planner", name: "Slow Sunday Planner", kind: "skill", summary: "A relaxed day." },
    { id: "ambiguous1", name: "Same Name" }, { id: "ambiguous2", name: "same name" },
  ];
  const reads: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    const references = request.messages.filter((message: { role: string }) => message.role === "tool");
    assert.deepEqual(references.map((message: { content: string }) => JSON.parse(message.content).id), ["host", "planner"]);
    assert.equal(new Set(references.map((message: { tool_call_id: string }) => message.tool_call_id)).size, 2);
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Only one result." } }] });
  };
  try {
    const result = await assist({ ...base, skills: entries, message: "Find Willow Stay Host and Slow Sunday Planner and Same Name." }, (_name, args) => {
      reads.push(String(args.skillId));
      return entries.find(entry => entry.id === args.skillId);
    });
    assert.deepEqual(reads, ["host", "planner"]);
    assert.match(result.reply, /Willow Stay Host/);
    assert.match(result.reply, /Slow Sunday Planner/);
    assert.doesNotMatch(result.reply, /Same Name|Only one result/);
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; }
});

test("library tools reject extra fields and invalid identity before dispatch", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  try {
    for (const [name, args] of [["read_skill", {}], ["read_skill", { skillId: "skill1", execute: true }], ["search_skills", { ownerType: "admin" }], ["search_skills", { query: "x".repeat(201) }]] as const) {
      let calls = 0;
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", tool_calls: [{ id: "library", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
      await assert.rejects(assist({ ...base, message: "Help with my request" }, () => { calls++; return []; }), /skill|field|identifier/i);
      assert.equal(calls, 0);
    }
  } finally { globalThis.fetch = original; if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; }
});
test("the live model receives current persisted business knowledge through the shared dispatcher", async () => {
  const original = globalThis.fetch, previousKey = process.env.NEBIUS_API_KEY;
  const store = createStore(":memory:");
  store.ensureTenant("skill-reader");
  const skills = createBusinessSkills(store, "skill-reader");
  const business = skills.list()[0];
  skills.update(business.id, { version: business.version, summary: "A quiet home.", knowledge: "Luggage storage starts at 10:00." });
  process.env.NEBIUS_API_KEY = "test";
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    if (requests++ === 0) return Response.json({ choices: [{ finish_reason: "stop", message: {
      role: "assistant", tool_calls: [{ id: "profile", type: "function", function: {
        name: "business_profile", arguments: JSON.stringify({ businessId: business.id }),
      } }],
    } }] });
    const profile = JSON.parse(request.messages.findLast((item: { role: string }) => item.role === "tool").content);
    assert.equal(profile.version, 2);
    assert.equal(profile.knowledge, "Luggage storage starts at 10:00.");
    assert.equal(profile.requiresApproval, true);
    assert.equal(request.tools.some((tool: { function: { name: string } }) => /confirm|cancel|save/.test(tool.function.name)), false);
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "The host offers luggage storage from 10:00." } }] });
  };
  try {
    const result = await assist({ ...base, message: "When can I leave my luggage?" }, (name, args) => {
      assert.equal(name, "business_profile");
      return skills.invoke(args.businessId as string, "profile", {});
    });
    assert.match(result.reply, /10:00/);
    assert.equal(result.quote, undefined);
    assert.equal(store.listReservations("skill-reader").length, 0);
  } finally {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = previousKey;
    store.close();
  }
});
test("demo extracts explicit dates, budget, guests and amenities", () => {
  const parsed = parseDemoRequest(
    "Find a room Nov 6-8, 2026 under $150 for 2 guests with wifi and step-free access",
    {},
    new Date("2026-10-25T12:00:00Z"),
  );
  assert.deepEqual(parsed, {
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    guests: 2,
    maxNightlyCents: 15000,
    amenities: ["Wi-Fi", "Step-free access"],
  });
});
test("explicit budget overrides remembered budget", () => {
  assert.equal(
    parseDemoRequest("2026-11-06 to 2026-11-08 under $120", { budget: 200 })
      .maxNightlyCents,
    12000,
  );
});
test("missing dates asks before searching", async () => {
  delete process.env.NEBIUS_API_KEY;
  let calls = 0;
  const result = await assist({ ...base, message: "Find a nice room" }, () => {
    calls++;
    return [];
  });
  assert.match(result.reply, /check.in.*check.out/i);
  assert.equal(calls, 0);
  assert.equal(result.mode, "demo");
});
test("demo searches real tools and never claims a booking", async () => {
  delete process.env.NEBIUS_API_KEY;
  const calls: string[] = [];
  const result = await assist(
    { ...base, message: "2026-11-06 to 2026-11-08 under $150" },
    (name) => {
      calls.push(name);
      return [
        {
          id: "room1",
          name: "Garden Room",
          nightlyCents: 11500,
          cleaningCents: 2500,
        },
      ];
    },
  );
  assert.deepEqual(calls, ["search_stays"]);
  assert.match(result.reply, /Garden Room/);
  assert.match(result.reply, /approval|review/i);
  assert.doesNotMatch(result.reply, /booked|confirmed reservation/i);
});
test("invalid message is rejected", async () => {
  await assert.rejects(
    assist({ ...base, message: "" }, () => []),
    /message/i,
  );
});
test("demo property questions use published details", async () => {
  delete process.env.NEBIUS_API_KEY;
  const result = await assist(
    {
      ...base,
      listings: [{ id: "room1", name: "Garden Room" }],
      message: "Does Garden Room allow late check-in?",
    },
    () => ({ id: "room1", name: "Garden Room", checkInTime: "After 15:00" }),
  );
  assert.match(result.reply, /not provided|not specified/i);
});
test("live errors do not fall back to demo success", async () => {
  const old = process.env.NEBIUS_API_KEY,
    original = globalThis.fetch;
  process.env.NEBIUS_API_KEY = "test";
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  try {
    await assert.rejects(
      assist({ ...base, message: "Find a room" }, () => []),
      /unavailable|503/i,
    );
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
});
test("live tools cannot call booking mutations and loop is bounded", async () => {
  const old = process.env.NEBIUS_API_KEY,
    original = globalThis.fetch;
  process.env.NEBIUS_API_KEY = "test";
  let executions = 0;
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop", message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "a",
                type: "function",
                function: { name: "confirmBooking", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });
  try {
    await assert.rejects(
      assist({ ...base, message: "Book a room" }, () => {
        executions++;
        return [];
      }),
      /unsupported|not allowed/i,
    );
    assert.equal(executions, 0);
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
});
test("live tool loop stops after eight executions", async () => {
  const old = process.env.NEBIUS_API_KEY,
    original = globalThis.fetch;
  process.env.NEBIUS_API_KEY = "test";
  let executions = 0;
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop", message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "a",
                type: "function",
                function: { name: "search_stays", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });
  try {
    await assert.rejects(
      assist({ ...base, message: "Find a room" }, () => {
        executions++;
        return [];
      }),
      /limit|too many/i,
    );
    assert.equal(executions, 8);
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
});
test("demo follow-ups keep established guest count, budget and amenities", async () => {
  delete process.env.NEBIUS_API_KEY;
  let args: Record<string, unknown> = {};
  await assist(
    {
      ...base,
      preferences: { budget: 200 },
      history: [
        {
          role: "user",
          content: "Nov 6-8, 2026 for 2 guests under $130 with a kitchenette",
        },
      ],
      message: "It also needs Wi-Fi",
    },
    (_name, input) => {
      args = input;
      return [];
    },
  );
  assert.deepEqual(args, {
    checkIn: "2026-11-06",
    checkOut: "2026-11-08",
    guests: 2,
    maxNightlyCents: 13000,
    amenities: ["Kitchenette", "Wi-Fi"],
  });
});
test("demo follow-ups override only explicitly changed filters", async () => {
  delete process.env.NEBIUS_API_KEY;
  let args: Record<string, unknown> = {};
  await assist(
    {
      ...base,
      history: [
        {
          role: "user",
          content: "Nov 6-8, 2026 for 2 guests under $130 with wifi",
        },
        { role: "assistant", content: "Some results" },
        { role: "user", content: "Make that 3 guests" },
      ],
      message: "Raise the budget to $180",
    },
    (_name, input) => {
      args = input;
      return [];
    },
  );
  assert.equal(args.guests, 3);
  assert.equal(args.maxNightlyCents, 18000);
  assert.deepEqual(args.amenities, ["Wi-Fi"]);
});
test("partial new dates ask for clarification rather than reusing old dates", async () => {
  delete process.env.NEBIUS_API_KEY;
  for (const message of [
    "Change to 2026-11-10",
    "Try November 10",
    "What about Friday?",
  ]) {
    let calls = 0;
    const result = await assist(
      {
        ...base,
        history: [
          { role: "user", content: "2026-11-06 to 2026-11-08 for 2 guests" },
        ],
        message,
      },
      () => {
        calls++;
        return [];
      },
    );
    assert.equal(calls, 0, message);
    assert.match(result.reply, /check.in.*check.out/i);
  }
});
test("room type defaults and explicit overrides reach search", async () => {
  delete process.env.NEBIUS_API_KEY;
  let args: Record<string, unknown> = {};
  await assist(
    {
      ...base,
      preferences: { roomType: "private" },
      message: "Find a hotel Nov 6-8, 2026",
    },
    (_name, input) => {
      args = input;
      return [];
    },
  );
  assert.equal(args.type, "hotel");
  assert.equal(
    parseDemoRequest("Nov 6-8, 2026", { roomType: "private" }).type,
    "private",
  );
  assert.equal(
    parseDemoRequest("Nov 6-8, 2026", { roomType: "any" }).type,
    undefined,
  );
});

test('business profile tool validates required business identity before dispatch', async () => {
  const original=globalThis.fetch, old=process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY='test';
  try {
    for (const args of [{},{businessId:42},{businessId:'bridge',listingId:'foreign'}]) {
      let calls=0;
      globalThis.fetch=async()=>Response.json({choices:[{finish_reason: "stop", message:{role:'assistant',tool_calls:[{id:'profile',type:'function',function:{name:'business_profile',arguments:JSON.stringify(args)}}]}}]});
      await assert.rejects(assist({...base,message:'What can Bridge House do?'},()=>{calls++;return {}}),/business|field|identifier/i);
      assert.equal(calls,0);
    }
  } finally { globalThis.fetch=original;if(old===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=old; }
});

test('business profile returns scoped capabilities with a named agent trace',async()=>{
  const original=globalThis.fetch, old=process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY='test';
  let requests=0;
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason: "stop", message:requests++===0?{role:'assistant',tool_calls:[{id:'profile',type:'function',function:{name:'business_profile',arguments:'{"businessId":"bridge-house"}'}}]}:{role:'assistant',content:'Bridge House can provide room information and quotes. Booking requires your approval.'}}]});
  try {
    const result=await assist({...base,message:'What can Bridge House do?'},(name,args)=>{
      assert.equal(name,'business_profile');assert.deepEqual(args,{businessId:'bridge-house'});
      return {id:'bridge-house',name:'Bridge House',category:'accommodation',listingIds:['room1'],capabilities:['stay_details','create_quote'],requiresApproval:true};
    });
    assert.match(result.trace[0].detail,/Bridge House agent.*capabilities/i);
    assert.equal(result.quote,undefined);
  } finally {globalThis.fetch=original;if(old===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=old;}
});

test('business quote trace identifies its owner without creating a reservation',async()=>{
  const original=globalThis.fetch, old=process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY='test';let requests=0;
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason: "stop", message:requests++===0?{role:'assistant',tool_calls:[{id:'quote',type:'function',function:{name:'create_quote',arguments:'{"listingId":"room1","checkIn":"2026-11-06","checkOut":"2026-11-08","guests":1}'}}]}:{role:'assistant',content:'Review this quote and approve it to reserve.'}}]});
  const quote={id:'quote1',listingId:'room1',businessId:'bridge-house',businessName:'Bridge House',totalCents:26500};
  try {
    const result=await assist({...base,message:'Prepare a quote'},name=>{assert.equal(name,'create_quote');return quote;});
    assert.deepEqual(result.quote,quote);
    assert.match(result.trace[0].detail,/Bridge House agent.*quote.*review/i);
    assert.equal('approval' in result,false);
    assert.equal('reservation' in result,false);
  } finally {globalThis.fetch=original;if(old===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=old;}
});

test('offline property inquiries use owning agent identity in the trace',async()=>{
  delete process.env.NEBIUS_API_KEY;
  const listing={id:'room1',name:'Garden Room',businessId:'bridge-house',businessName:'Bridge House',checkInTime:'15:00',checkOutTime:'11:00'};
  const result=await assist({...base,listings:[listing],message:'What is check-in at Garden Room?'},()=>listing);
  assert.match(result.trace[0].detail,/Bridge House agent/);
});

test('offline business inquiries read business capabilities rather than another listing',async()=>{
  delete process.env.NEBIUS_API_KEY;
  const result=await assist({...base,listings:[{id:'room1',name:'Garden Room',businessId:'bridge-house',businessName:'Bridge House'}],message:'What can the Bridge House business agent do?'},(name,args)=>{
    assert.equal(name,'business_profile');assert.deepEqual(args,{businessId:'bridge-house'});
    return {id:'bridge-house',name:'Bridge House',capabilities:['stay_details','create_quote'],requiresApproval:true};
  });
  assert.match(result.reply,/Bridge House/);assert.match(result.reply,/approval/i);assert.match(result.trace[0].detail,/Bridge House agent/);
});

test('discovery trace names the business agents that returned matching stays',async()=>{
  delete process.env.NEBIUS_API_KEY;
  const result=await assist({...base,message:'Find a stay Nov 6-8, 2026'},()=>[
    {id:'room1',name:'Garden Room',nightlyCents:11500,businessName:'Bridge House'},
    {id:'room2',name:'Pacific Suite',nightlyCents:16900,businessName:'Pacific Hotel'}
  ]);
  assert.match(result.trace[0].detail,/Bridge House agent/);
  assert.match(result.trace[0].detail,/Pacific Hotel agent/);
});

async function mockedEvidenceReply(calls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>, finalContent: string, history: Array<{ role: string; content: string }> = []) {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  let requestCount = 0, executionCount = 0;
  let initialMessages: Array<{ role: string; content: string }> = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    if (requestCount++ === 0) {
      initialMessages = request.messages;
      return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", tool_calls: calls.map((call, index) => ({ id: `evidence-${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })) } }] });
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: finalContent } }] });
  };
  try {
    const result = await assist({ ...base, history, message: "What does that business provide?" }, (name, args) => {
      const call = calls[executionCount++];
      assert.equal(name, call.name);
      assert.deepEqual(args, call.args);
      return call.result;
    });
    assert.equal(requestCount, calls.some(call => call.name === "create_quote") ? 1 : 2);
    return { result, initialMessages };
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
}

test("published business guidance replaces invented model services while history remains usable for references", async () => {
  const falseEarlierReply = "The first business provides free parking and self-served meals.";
  const { result, initialMessages } = await mockedEvidenceReply([
    { name: "business_profile", args: { businessId: "bridge-house" }, result: {
      id: "bridge-house", name: "Bridge House", version: 3,
      summary: "A quiet place to stay.", knowledge: "Breakfast is not provided. Luggage storage starts at 10:00.",
      capabilities: ["discover_stays", "get_stay_details", "create_quote"], requiresApproval: true,
    } },
  ], "Bridge House provides complimentary valet parking, self-served meals and a rooftop spa.", [{ role: "assistant", content: falseEarlierReply }]);
  assert.ok(initialMessages.some(message => message.role === "assistant" && message.content === falseEarlierReply));
  assert.match(result.reply, /Published information/i);
  assert.match(result.reply, /A quiet place to stay\./);
  assert.match(result.reply, /Breakfast is not provided\. Luggage storage starts at 10:00\./);
  assert.match(result.reply, /confirm only the published information/i);
  assert.doesNotMatch(result.reply, /valet|self-served|rooftop|spa|free parking/i);
});

test("property answers show exact current guidance and structured facts rather than model embellishment", async () => {
  const details = {
    id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House",
    checkInTime: "15:00", checkOutTime: "11:00", maxGuests: 2, amenities: ["Wi-Fi", "Workspace"],
    nightlyCents: 12025, cleaningCents: 2500, cancellation: "restricted",
    businessSkill: { version: 4, summary: "Garden accommodation.", knowledge: "Luggage storage is unavailable today." },
  };
  const { result } = await mockedEvidenceReply([
    { name: "stay_details", args: { listingId: "room1" }, result: details },
  ], "You can arrive at midnight and leave bags all day. Parking is complimentary.", [{ role: "assistant", content: "Luggage storage starts at 10:00." }]);
  for (const text of [details.businessSkill.summary, details.businessSkill.knowledge, "15:00", "11:00", "$120.25", "Wi-Fi", "Workspace"]) assert.ok(result.reply.includes(text));
  assert.match(result.reply, /cancellation.*not available|not allow.*cancel/i);
  assert.doesNotMatch(result.reply, /midnight|all day|complimentary|10:00/);
});

test("quotes render authoritative cents, dates, policy and matching business guidance without claims of execution", async () => {
  const quote = {
    id: "quote1", listingId: "room1", listingName: "Garden Room", businessId: "bridge-house", businessName: "Bridge House", skillVersion: 3,
    checkIn: "2026-11-06", checkOut: "2026-11-08", guests: 2, nights: 2,
    nightlyCents: 12025, cleaningCents: 2550, totalCents: 26600, cancellation: "flexible",
  };
  const { result } = await mockedEvidenceReply([
    { name: "business_profile", args: { businessId: "other-house" }, result: { id: "other-house", name: "Other House", version: 1, summary: "Other host summary", knowledge: "An unrelated shuttle is provided." } },
    { name: "business_profile", args: { businessId: "bridge-house" }, result: { id: "bridge-house", name: "Bridge House", version: 3, summary: "A quiet home.", knowledge: "Breakfast is not provided." } },
    { name: "create_quote", args: { listingId: "room1", checkIn: "2026-11-06", checkOut: "2026-11-08", guests: 2 }, result: quote },
  ], "Your reservation is confirmed for December 10, your card has been charged $1, and a private shuttle is included.");
  for (const text of ["2026-11-06", "2026-11-08", "$120.25", "$25.50", "$266", "Breakfast is not provided."]) assert.ok(result.reply.includes(text));
  assert.match(result.reply, /approval|approve/i);
  assert.match(result.reply, /no payment.*taken|no payment.*collected/i);
  assert.match(result.reply, /not.*booked|not.*confirmed|not a reservation/i);
  assert.match(result.reply, /free cancellation before check-in/i);
  assert.doesNotMatch(result.reply, /December|card has been charged|shuttle|reservation is confirmed|Other House|Other host/);
  assert.deepEqual(result.quote, quote);
});

test("published reply uses the latest current-turn knowledge for each business", async () => {
  const { result } = await mockedEvidenceReply([
    { name: "business_profile", args: { businessId: "bridge-house" }, result: { id: "bridge-house", name: "Bridge House", version: 2, summary: "", knowledge: "Luggage storage starts at 10:00." } },
    { name: "stay_details", args: { listingId: "room1" }, result: { id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House", checkInTime: "15:00", businessSkill: { version: 3, summary: "", knowledge: "Luggage storage is unavailable today." } } },
  ], "Earlier luggage guidance is still valid.");
  assert.match(result.reply, /Luggage storage is unavailable today\./);
  assert.doesNotMatch(result.reply, /10:00|Earlier luggage/);
});

test("published replies retain complete guidance blocks within the persisted message limit", async () => {
  const calls = [1, 2, 3].map(n => ({ name: "business_profile", args: { businessId: `house-${n}` }, result: {
    id: `house-${n}`, name: `House ${n}`, version: 1, summary: `Summary ${n}`,
    knowledge: `${String(n).repeat(3950)} End of complete guidance ${n}.`,
  } }));
  const { result } = await mockedEvidenceReply(calls, "Some unsupported added benefits.");
  assert.ok(result.reply.length <= 12000);
  assert.match(result.reply, /End of complete guidance 1\./);
  assert.match(result.reply, /End of complete guidance 2\./);
  assert.match(result.reply, /omitted|more published information/i);
  assert.doesNotMatch(result.reply, /unsupported added benefits/);
});

async function mockedNamedBusinessReply(message: string, listings: unknown[], prefetchResult: unknown = {
  id: "bridge-house", name: "Bridge House", version: 5, summary: "A quiet home.", knowledge: "Breakfast is not provided. Luggage storage starts at 10:00.",
}) {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let messages: Array<Record<string, unknown>> = [];
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    messages = JSON.parse(String(options?.body)).messages;
    // The model deliberately refuses to retrieve current facts and repeats an old invention.
    return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "The business offers complimentary parking and self-served meals." } }] });
  };
  try {
    const result = await assist({ ...base, message, listings, history: [{ role: "assistant", content: "The first business offers complimentary parking and self-served meals." }] }, (name, args) => {
      calls.push({ name, args });
      return prefetchResult;
    });
    assert.equal(requests, 1);
    return { result, calls, messages };
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
}

test("explicit known business name fetches current source before a no-tool model reply", async () => {
  const { result, calls, messages } = await mockedNamedBusinessReply("Read Bridge House’s current saved guidance again.", [
    { id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House" },
    { id: "room2", name: "Second Room", businessId: "bridge-house", businessName: "Bridge House" },
  ]);
  assert.deepEqual(calls, [{ name: "business_profile", args: { businessId: "bridge-house" } }]);
  assert.match(result.reply, /Breakfast is not provided\. Luggage storage starts at 10:00\./);
  assert.doesNotMatch(result.reply, /complimentary parking|self-served meals/);
  assert.match(result.trace[0].detail, /Bridge House agent/);
  assert.ok(messages.some(message => message.role === "assistant" && typeof message.content === "string" && message.content.includes("The first business")));
  const lastAssistant = messages.findLast(message => message.role === "assistant")!;
  const syntheticCalls = lastAssistant.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>;
  assert.equal(syntheticCalls[0].function.name, "business_profile");
  assert.deepEqual(JSON.parse(syntheticCalls[0].function.arguments), { businessId: "bridge-house" });
  assert.equal(messages.at(-1)!.role, "tool");
  assert.equal(messages.at(-1)!.tool_call_id, syntheticCalls[0].id);
  assert.equal(JSON.parse(messages.at(-1)!.content as string).version, 5);
});

test("known room name routes to its business using normalized token boundaries", async () => {
  const listings = [{ id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House" }];
  const { result, calls } = await mockedNamedBusinessReply("What does the ＧＡＲＤＥＮ   ROOM provide?", listings);
  assert.deepEqual(calls, [{ name: "business_profile", args: { businessId: "bridge-house" } }]);
  assert.match(result.reply, /Luggage storage starts at 10:00/);
});

test("business-name substrings and ambiguous names do not prefetch unrelated businesses", async () => {
  const listings = [{ id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House" }];
  for (const message of ["What does Bridge Houseboat offer?", "What does Garden Roommates provide?", "Explain Cambridge Houses."]) {
    const { calls, result } = await mockedNamedBusinessReply(message, listings);
    assert.deepEqual(calls, []);
    assert.equal(result.trace.length, 0);
  }
  const ambiguous = await mockedNamedBusinessReply("Read Bridge House guidance.", [
    ...listings, { id: "other-room", name: "Other Room", businessId: "another-business", businessName: "Bridge House" },
  ]);
  assert.deepEqual(ambiguous.calls, []);
});

test("named-business prefetch counts toward the eight-action budget", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  let executions = 0;
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", tool_calls: [
    { id: "search", type: "function", function: { name: "search_stays", arguments: "{}" } },
  ] } }] });
  try {
    await assert.rejects(assist({ ...base, message: "Find a stay at Bridge House.", listings: [
      { id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House" },
    ] }, name => {
      executions++;
      return name === "business_profile" ? { id: "bridge-house", name: "Bridge House", version: 1, knowledge: "Breakfast is not provided." } : [];
    }), /action limit/i);
    assert.equal(executions, 8);
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
});

test("failed named-business source lookup never substitutes old conversation claims", async () => {
  const original = globalThis.fetch, old = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = "test";
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Parking is included." } }] }); };
  try {
    await assert.rejects(assist({ ...base, message: "Read Bridge House again.", listings: [
      { id: "room1", name: "Garden Room", businessId: "bridge-house", businessName: "Bridge House" },
    ], history: [{ role: "assistant", content: "Parking is included." }] }, () => ({ error: "Profile unavailable" })), /current published business information is unavailable/i);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
    if (old === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = old;
  }
});
