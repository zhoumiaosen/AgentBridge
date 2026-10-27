import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assist, selectDiscoveredAgents } from '../src/lib/assistant.ts';
import { createStore } from '../src/lib/store.ts';
import { createBusinessSkills } from '../src/lib/business-skills.ts';
import { createSkillLibrary } from '../src/lib/skill-library.ts';

const base = {history: [], preferences: {}};
const tool = (name: string,args: unknown) => ({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const response = (calls?: ReturnType<typeof tool>[]) => Response.json({choices:[{finish_reason:calls?'tool_calls':'stop',message:{role:'assistant',content:calls?null:'No saved skills match yet.',...(calls?{tool_calls:calls}:{})}}]});
async function live(run:()=>Promise<void>) {
 const original=globalThis.fetch, key=process.env.NEBIUS_API_KEY;
 process.env.NEBIUS_API_KEY='test-only';
 try {await run();} finally {globalThis.fetch=original;if(key===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=key;}
}
function workspace() {
 const store=createStore(':memory:');store.ensureTenant('traveler');store.ensureTenant('other');
 const makeRoom=(tenant:string,hostName:string)=>store.publishListing(tenant,{
  name:'Step-free Garden Room',hostName,type:'private',neighborhood:'Inner Sunset',description:'Published step-free guest room.',
  nightlyCents:13500,cleaningCents:2000,maxGuests:2,amenities:['Wi-Fi','Step-free access'],checkInTime:'15:00',checkOutTime:'11:00',cancellation:'flexible',image:'/rooms/private.svg',availableFrom:'2026-11-01',availableTo:'2027-01-01',
 });
 const room=makeRoom('traveler','Willow House');const foreignRoom=makeRoom('other','Hidden House');
 const skills=createBusinessSkills(store,'traveler'),library=createSkillLibrary(store,'traveler');
 const business=skills.forListing(room.id); const foreignBusiness=createBusinessSkills(store,'other').forListing(foreignRoom.id);
 const calls:{name:string,args:Record<string,unknown>}[]=[];
 const execute=(name:string,args:Record<string,unknown>):unknown=>{
  calls.push({name,args});
  if(name==='business_profile')return skills.profile(String(args.businessId));
  if(name==='search_skills')return library.list(args);
  if(name==='read_skill')return library.read(String(args.skillId));
  if(name==='search_stays')return skills.search(args);
  throw new Error(`Unexpected action ${name}`);
 };
 return {store,room,business,foreignBusiness,skills,library,calls,execute};
}
const criteria={checkIn:'2026-11-20',checkOut:'2026-11-22',guests:2,maxNightlyCents:16000};

test('natural named business plus room requirements produces its saved agent despite an empty skill search',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async()=>++requests===1?response([
  tool('search_skills',{query:'Willow House step-free garden room San Francisco'}),tool('search_stays',criteria),
 ]):response();
 try{
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find the business agent for Willow House and its step-free garden room in San Francisco for 2026-11-20 to 2026-11-22, for 2 guests under $160 per night. Show its saved agent.'},w.execute);
  assert.match(result.reply,/Willow House/);assert.doesNotMatch(result.reply,/No saved skills match/);
  assert.ok(w.calls.some(call=>call.name==='read_skill'&&call.args.skillId===w.business.id));
  assert.deepEqual(w.calls.find(call=>call.name==='search_stays')?.args.amenities,['Step-free access']);
  assert.deepEqual((result as {agentIds?:string[]}).agentIds,[w.business.id]);
  assert.equal(result.quote,undefined);assert.equal(w.store.listReservations('traveler').length,0);
 }finally{w.store.close();}
}));

test('unnamed room-based discovery maps only businesses whose rooms satisfy explicit requirements',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async()=>++requests===1?response([tool('search_skills',{query:'step-free room'}),tool('search_stays',criteria)]):response();
 try{
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent with a step-free room for 2026-11-20 to 2026-11-22, for 2 guests under $160 per night.'},w.execute);
  assert.match(result.reply,/Willow House/);assert.doesNotMatch(result.reply,/Maya|Alex|No saved skills match/);
  assert.deepEqual((result as {agentIds?:string[]}).agentIds,[w.business.id]);
  assert.ok(w.calls.some(call=>call.name==='read_skill'&&call.args.skillId===w.business.id));
  assert.equal(result.quote,undefined);assert.equal(w.store.listReservations('traveler').length,0);
 }finally{w.store.close();}
}));

test('business profile discovery survives empty skills and supplies the actual connected card',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async()=>++requests===1?response([tool('search_skills',{query:'no exact text matches'}),tool('business_profile',{businessId:w.business.id})]):response();
 try{
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent to help me.'},w.execute);
  assert.match(result.reply,/Willow House/);assert.doesNotMatch(result.reply,/No saved skills match/);
  assert.deepEqual((result as {agentIds?:string[]}).agentIds,[w.business.id]);
 }finally{w.store.close();}
}));

test('connected discovery never maps a business from a different tenant or invents an agent identifier',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async()=>++requests===1?response([tool('search_skills',{query:'Hidden House'}),tool('search_stays',{...criteria,amenities:['Step-free access']})]):response();
 try{
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent with a step-free room for 2026-11-20 to 2026-11-22 for 2 guests under $160.'},w.execute);
  assert.doesNotMatch(result.reply,/Hidden House/);
  assert.equal(w.calls.some(call=>call.args.skillId===w.foreignBusiness.id||call.args.businessId===w.foreignBusiness.id),false);
  assert.deepEqual((result as {agentIds?:string[]}).agentIds,[w.business.id]);
  assert.equal(w.store.listReservations('traveler').length,0);
  assert.equal(w.store.listReservations('other').length,0);
 }finally{w.store.close();}
}));

test('offline named and room-based discovery returns the same connected cards with hard filters',async()=>{
 const key=process.env.NEBIUS_API_KEY;delete process.env.NEBIUS_API_KEY;
 try {
  for(const named of [false,true]) {
   const w=workspace();
   try {
    const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:`Find a business agent ${named?'for Willow House ':''}with a step-free room for 2026-11-20 to 2026-11-22 for 2 guests under $160.`},w.execute);
    assert.deepEqual((result as {agentIds?:string[]}).agentIds,[w.business.id]);
    assert.deepEqual(w.calls.find(call=>call.name==='search_stays')?.args.amenities,['Step-free access']);
    assert.ok(w.calls.some(call=>call.name==='read_skill'&&call.args.skillId===w.business.id));
    assert.equal(result.quote,undefined);assert.equal(w.store.listReservations('traveler').length,0);
   } finally {w.store.close();}
  }
 } finally {if(key===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=key;}
});


test('response cards keep only verified selected IDs, while absent selection retains normal library results',()=>{
 const cards=[{id:'willow',name:'Willow House'},{id:'other',name:'Other House'}];
 assert.deepEqual(selectDiscoveredAgents(cards,['willow','invented']),[cards[0]]);
 assert.deepEqual(selectDiscoveredAgents(cards,[]),[]);
 assert.deepEqual(selectDiscoveredAgents(cards,undefined),cards);
});

test('broad intermediate library results are filtered to the matched room owner in the returned cards',()=>live(async()=>{
 const w=workspace();let requests=0;const cards=new Map<string,Record<string,unknown>>();
 globalThis.fetch=async()=>++requests===1?response([tool('search_skills',{ownerType:'business'}),tool('search_stays',criteria)]):response();
 const discover=(entry:Record<string,unknown>)=>{const {content:_content,...metadata}=entry;cards.set(String(entry.id),metadata);return metadata;};
 try {
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent with a step-free room for 2026-11-20 to 2026-11-22 for 2 guests under $160.'},(name,args)=>{
   const value=w.execute(name,args);
   if(name==='search_skills')return (value as Record<string,unknown>[]).map(discover);
   if(name==='read_skill')return discover(value as Record<string,unknown>);
   return value;
  });
  const returned=selectDiscoveredAgents([...cards.values()],result.agentIds);
  assert.equal(returned.length,1);assert.equal(returned[0].id,w.business.id);
  assert.equal(returned[0].ownerName,'Willow House');assert.equal('content' in returned[0],false);
  assert.equal(result.quote,undefined);
 }finally{w.store.close();}
}));

test('budget-only room discovery checks published inventory after an empty skill search without inventing dates',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async(_url,options)=>{const request=JSON.parse(String(options?.body));if(++requests===1)return response([tool('search_skills',{query:'business agent room under 160'})]);return request.tool_choice?.function?.name==='search_stays'?response([tool('search_stays',{})]):response();};
 try {
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent with a room under $160 per night.'},w.execute);
  const search=w.calls.find(call=>call.name==='search_stays');assert.ok(search);
  assert.equal(search.args.maxNightlyCents,16000);assert.equal(search.args.checkIn,undefined);assert.equal(search.args.checkOut,undefined);
  assert.match(result.reply,/Willow House/);assert.doesNotMatch(result.reply,/No saved skills match|Pacific House/);
  assert.match(result.reply,/dates.{0,30}(?:not|haven.t).{0,15}checked/i);
  assert.ok(result.agentIds?.includes(w.business.id));assert.equal(result.quote,undefined);
 }finally{w.store.close();}
}));

test('named business discovery returns room IDs only for the requested owner even when the search returns other businesses',()=>live(async()=>{
 const w=workspace();let requests=0;
 globalThis.fetch=async()=>++requests===1?response([tool('search_skills',{ownerType:'business'}),tool('search_stays',criteria)]):response();
 try {
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find Willow House and its room for 2026-11-20 to 2026-11-22 for 2 guests under $160.'},w.execute);
  assert.deepEqual((result as {listingIds?:string[]}).listingIds,[w.room.id]);
  assert.deepEqual(result.agentIds,[w.business.id]);
  assert.doesNotMatch(result.reply,/Maya|Alex|Café|Cycle shop/);
 }finally{w.store.close();}
}));

test('an empty no-date room search does not claim that availability dates were checked',async()=>{
 const key=process.env.NEBIUS_API_KEY;delete process.env.NEBIUS_API_KEY;const w=workspace();
 try {
  const result=await assist({...base,listings:w.skills.search({}),skills:w.library.list(),message:'Find a business agent with a room under $10 per night.'},w.execute);
  assert.match(result.reply,/dates.{0,30}not.{0,15}checked/i);
  assert.deepEqual(result.agentIds,[]);assert.deepEqual(result.listingIds,[]);
 }finally{w.store.close();if(key===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=key;}
});
