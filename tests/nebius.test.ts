import { test } from "node:test";
import assert from "node:assert/strict";
import { createNebiusTurn, NebiusError } from "../src/lib/nebius.ts";

const messages = [{ role: "user", content: "Read the saved listing." }];
const tools = ["read_listing", "create_quote"].map(name => ({ type: "function", function: { name, parameters: { type: "object" } } }));
const tool = (name = "read_listing", args = '{"listingId":"saved"}') => ({ id: "call-1", type: "function", function: { name, arguments: args } });
const reply = (content: unknown = "The saved listing has Wi-Fi.", toolCalls?: unknown, finish = toolCalls ? "tool_calls" : "stop") => Response.json({ choices: [{ finish_reason: finish, message: { role: "assistant", content, ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }) } }] });
async function mocked(run: () => Promise<void>) {
  const original = globalThis.fetch, env = { NEBIUS_API_KEY: process.env.NEBIUS_API_KEY, NEBIUS_MODEL: process.env.NEBIUS_MODEL, NEBIUS_BASE_URL: process.env.NEBIUS_BASE_URL };
  process.env.NEBIUS_API_KEY = "private-test-key"; delete process.env.NEBIUS_MODEL; delete process.env.NEBIUS_BASE_URL;
  try { await run(); } finally {
    globalThis.fetch = original;
    for (const [name, value] of Object.entries(env)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}

test("Nemotron requests use documented nonreasoning settings without exposing server credentials", async () => mocked(async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++; const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "nvidia/nemotron-3-super-120b-a12b");
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.temperature, 1); assert.equal(body.top_p, .95); assert.equal(body.max_tokens, 1200);
    assert.equal(body.store, false);
    assert.equal(JSON.stringify(body).includes("private-test-key"), false);
    return reply();
  };
  const result = await createNebiusTurn()({ messages });
  assert.equal(result.content, "The saved listing has Wi-Fi.");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes("private-test-key"), false);
  process.env.NEBIUS_MODEL = "another/model";
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.chat_template_kwargs, undefined); assert.equal(body.top_p, undefined); assert.equal(body.temperature, .2);
    return reply();
  };
  await createNebiusTurn()({ messages });
}));

test("transient inference retries preserve the transcript and share a two-retry budget across steps", async () => mocked(async () => {
  const infer = createNebiusTurn(); let calls = 0; const sent: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    calls++; sent.push(JSON.parse(String(options?.body)).messages);
    if (calls === 1) throw new TypeError("network private-test-key");
    if (calls === 3) return new Response("temporary private-test-key", { status: 503 });
    if (calls === 5) return new Response("temporary private-test-key", { status: 500 });
    return reply();
  };
  await infer({ messages });
  const next = [...messages, { role: "tool", content: "Already executed exactly once" }];
  await infer({ messages: next });
  await assert.rejects(infer({ messages: next }), (error: unknown) => error instanceof NebiusError && error.code === "unavailable" && !error.message.includes("private-test-key"));
  assert.equal(calls, 5); assert.deepEqual(sent, [messages, messages, next, next, next]);
}));

test("invalid, truncated and missing-required-tool replies are discarded before any caller action", async () => mocked(async () => {
  for (const bad of [() => new Response("not JSON"), () => reply("partial", [tool()], "length"), () => reply(""), () => reply(null, [{}]), () => reply(null, [tool("read_listing", "{")]), () => reply("I prepared it.")]) {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      assert.deepEqual(JSON.parse(String(options?.body)).tool_choice, { type: "function", function: { name: "create_quote" } });
      return calls === 1 ? bad() : reply(null, [tool("create_quote")]);
    };
    const result = await createNebiusTurn()({ messages, tools, requiredTool: "create_quote" });
    assert.equal(calls, 2); assert.equal(result.tool_calls![0].function.name, "create_quote");
  }
  let calls = 0; globalThis.fetch = async () => { calls++; return reply("I prepared it."); };
  await assert.rejects(createNebiusTurn()({ messages, tools, requiredTool: "create_quote" }), (error: unknown) => error instanceof NebiusError && error.code === "required_tool");
  assert.equal(calls, 3);
}));

test("unsupported or malformed batches never return a partially valid tool list", async () => mocked(async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return reply(null, [tool(), { ...tool("confirm_booking"), id: "call-2" }]); };
  await assert.rejects(createNebiusTurn()({ messages, tools }), (error: unknown) => error instanceof NebiusError && error.code === "unsupported_tool");
  assert.equal(calls, 1);
  calls = 0; globalThis.fetch = async () => { calls++; return reply(null, [tool(), { ...tool(), id: "call-2", function: { name: "read_listing", arguments: "[]" } }]); };
  await assert.rejects(createNebiusTurn()({ messages, tools }), (error: unknown) => error instanceof NebiusError && error.code === "invalid_response");
  assert.equal(calls, 3);
}));

test("authentication, billing, quota and request errors fail once with sanitized messages", async () => mocked(async () => {
  for (const [status, code] of [[400, "bad_request"], [401, "invalid_api_key"], [403, "forbidden"], [402, "payment_required"], [429, "insufficient_quota"]] as const) {
    let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ error: { code, message: "private-test-key" } }, { status }); };
    await assert.rejects(createNebiusTurn()({ messages }), (error: unknown) => error instanceof NebiusError && !error.message.includes("private-test-key"));
    assert.equal(calls, 1);
  }
}));

test("rate-limit delays respect Retry-After and the shared deadline", async () => mocked(async () => {
  let calls = 0, firstAt = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) { firstAt = Date.now(); return new Response("rate limited", { status: 429, headers: { "Retry-After": ".05" } }); }
    assert.ok(Date.now() - firstAt >= 45);
    return reply();
  };
  await createNebiusTurn()({ messages }); assert.equal(calls, 2);
  calls = 0; globalThis.fetch = async () => { calls++; return new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } }); };
  await assert.rejects(createNebiusTurn({ deadline: Date.now() + 1000 })({ messages }), (error: unknown) => error instanceof NebiusError && error.code === "rate_limit");
  assert.equal(calls, 1);
  const infer = createNebiusTurn({ deadline: Date.now() - 1 });
  await assert.rejects(infer({ messages }), (error: unknown) => error instanceof NebiusError && error.code === "timeout");
  assert.equal(calls, 1);
}));
