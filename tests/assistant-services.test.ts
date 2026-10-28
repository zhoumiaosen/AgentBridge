import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assist, selectDiscoveredAgents } from '../src/lib/assistant.ts';
import { createStore } from '../src/lib/store.ts';
import { createSkillLibrary } from '../src/lib/skill-library.ts';

const tool = (args: Record<string, unknown>) => ({id: 'search', type: 'function', function: {name: 'search_skills', arguments: JSON.stringify(args)}});
const response = (args?: Record<string, unknown>) => Response.json({choices: [{finish_reason: args ? 'tool_calls' : 'stop', message: {role: 'assistant', content: args ? null : 'No matching businesses are saved.', ...(args ? {tool_calls: [tool(args)]} : {})}}]});
async function check(message: string, queries: Record<string, unknown>[], verify: (result: Awaited<ReturnType<typeof assist>>, calls: Record<string, unknown>[], library: ReturnType<typeof createSkillLibrary>, requests: Record<string, any>[]) => void, history: {role: string; content: string}[] = []) {
  const store = createStore(':memory:');
  store.ensureTenant('service-test');
  const library = createSkillLibrary(store, 'service-test');
  const originalFetch = globalThis.fetch, key = process.env.NEBIUS_API_KEY;
  const calls: Record<string, unknown>[] = [], requests: Record<string, any>[] = [];
  process.env.NEBIUS_API_KEY = 'test-only';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body)); requests.push(request);
    return response(queries[requests.length - 1]);
  };
  try {
    const result = await assist({message, history, preferences: {budget: 80}, listings: [], skills: library.list().map(({content, ...metadata}) => metadata)}, (name, args) => {
      assert.equal(name, 'search_skills', 'service discovery must not invoke room or transaction actions');
      calls.push(args);
      return library.list(args).map(({content, ...metadata}) => metadata);
    });
    assert.equal(store.listReservations('service-test').length, 0);
    assert.equal(result.quote, undefined);
    assert.equal(result.listingIds, undefined);
    verify(result, calls, library, requests);
  } finally {
    store.close(); globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = key;
  }
}

test('a plain bike service request requires database discovery and returns its current saved card', () => check(
  'Find a bike repair service I can chat with. Test only; do not book or pay.',
  [{query: 'bike repair', ownerType: 'business'}],
  (result, _calls, library, requests) => {
    assert.equal(requests[0].tool_choice?.function?.name, 'search_skills');
    const cycle = library.list({query: 'bicycle'})[0];
    assert.deepEqual(result.agentIds, [cycle.id, "catalog_bike-repair"]);
    assert.match(result.reply, /Cycle shop service desk/);
    assert.doesNotMatch(result.reply, /check-in|dates|No matching businesses/);
  },
));

test('one concise retry recovers an over-specific service search without using prior hotel or cafe context', () => check(
  'I need someone to fix a flat bicycle tire. Find a bike repair service I can chat with.',
  [{query: 'bicycle wheel alignment repair'}, {query: 'bicycle repair'}],
  (result, calls, library, requests) => {
    assert.equal(requests[0].tool_choice?.function?.name, 'search_skills');
    assert.equal(requests[1].tool_choice?.function?.name, 'search_skills');
    assert.equal(calls.length, 2);
    assert.deepEqual(new Set(result.agentIds), new Set(library.list({query: 'bicycle repair'}).map(skill => skill.id)));
    assert.doesNotMatch(result.reply, /Café|Harbor|hotel|2026-11/);
  },
  [{role: 'user', content: 'Find a hotel for November 20–22, 2026, for 2 guests under $100.'}, {role: 'user', content: 'Find the Café guest services skill.'}],
));

test('a service can be registered as a skill; inferred agent kind must not hide the cafe', () => check(
  'Find a coffee shop business agent I can talk to.',
  [{query: 'coffee shop', ownerType: 'business', kind: 'agent'}],
  (result, calls, library) => {
    assert.equal(calls[0].kind, undefined);
    assert.deepEqual(result.agentIds, library.list({query: 'cafe'}).map(skill => skill.id));
    assert.match(result.reply, /Café guest services/);
  },
));

test('unsupported services stay empty after one bounded retry, rather than returning another repair category', () => check(
  'Find a car repair service.',
  [{query: 'car repair near me'}, {query: 'repair'}],
  (result, calls, _library, requests) => {
    assert.equal(calls.length, 2); assert.equal(requests.length, 3);
    assert.equal(calls[1].query, 'car repair near me');
    assert.deepEqual(result.agentIds, []);
    assert.match(result.reply, /No saved/); assert.doesNotMatch(result.reply, /Cycle shop|Café/);
  },
));

test('personal trainer is a business service, not an implicit customer ownership filter', () => check(
  'Find a personal trainer business.', [{ownerType: 'business'}, {query: 'personal trainer', ownerType: 'business'}],
  (_result, calls) => { for (const args of calls) assert.equal(args.ownerType, 'business'); assert.match(String(calls[0].query), /personal trainer/); },
));

test('an ordinary question containing need does not force a discovery tool', () => check(
  'What information do you need from me?', [],
  (_result, calls, _library, requests) => { assert.equal(calls.length, 0); assert.equal(requests[0].tool_choice, 'auto'); },
));

test('explicit personal ownership and only-skills filters survive both attempts', () => check(
  'Find only skills for personal bicycle repair planning.',
  [{query: 'bicycle repair', ownerType: 'business', kind: 'agent'}, {query: 'bicycle', ownerType: 'business', kind: 'agent'}],
  (result, calls) => {
    assert.equal(calls.length, 2);
    for (const args of calls) { assert.equal(args.ownerType, 'customer'); assert.equal(args.kind, 'skill'); }
    assert.deepEqual(result.agentIds, []);
  },
));

test('an unfiltered model search cannot expose the whole catalog for a specific service request', () => check(
  'Find a bike repair service.', [{}, {query: 'bike repair'}],
  (result, calls, library) => {
    assert.ok(calls[0].query);
    const cards = selectDiscoveredAgents(library.list(), result.agentIds);
    assert.deepEqual(cards.map(card => card.name), ['Cycle shop service desk', 'Lantern Cycle Desk']);
  },
));

for (const initial of [{query: 'flat tire bicycle repair'}, {}]) {
  test(`a concise retry keeps the bicycle domain after ${initial.query || 'an omitted query'}`, () => check(
    'I need someone to fix a flat bicycle tire. Find a bike repair service I can chat with.',
    [initial, {query: 'bicycle repair'}],
    (result, calls, library) => {
      assert.equal(calls[1].query, 'bicycle repair');
      assert.deepEqual(new Set(result.agentIds), new Set(library.list({query: 'bicycle repair'}).map(skill => skill.id)));
    },
  ));
}
