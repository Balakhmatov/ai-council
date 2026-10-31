import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCbrDaily,createFxUpdater} from '../fx.mjs';
const xml='<?xml version="1.0"?><ValCurs Date="31.10.2026" name="Foreign Currency Market">'+
 '<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Value>82,5000</Value></Valute>'+
 '<Valute ID="R01375"><NumCode>156</NumCode><CharCode>CNY</CharCode><Nominal>10</Nominal><Value>117,5000</Value></Valute></ValCurs>';
test('CBR XML parses USD and nominal-adjusted CNY to RUB',()=>{
 const f=parseCbrDaily(xml);
 assert.deepEqual(f,{usdRub:82.5,cnyRub:11.75,rateDate:'31.10.2026'});
 assert.throws(()=>parseCbrDaily('<ValCurs></ValCurs>'),/Missing USD or CNY/);
});
test('CBR FX retrieval is cached and rate date retained; errors preserve last known quote',async()=>{
 let calls=0,store=null,time=Date.parse('2026-10-31T10:00:00Z'),fail=false;
 const updater=createFxUpdater({now:()=>time,load:()=>store,save:v=>{store=v;},fetchImpl:async()=>{
  calls++;return fail?new Response('unavailable',{status:502}):new Response(xml,{status:200});
 }});
 const one=await updater.refresh();assert.equal(one.usdRub,82.5);assert.equal(calls,1);
 const two=await updater.refresh();assert.equal(two.cnyRub,11.75);assert.equal(calls,1);
 time+=7*3600000;fail=true;
 const three=await updater.refresh();assert.equal(three.usdRub,82.5);assert.equal(calls,2);
});
test('a failed first fetch never returns a made-up rate',async()=>{
 const u=createFxUpdater({load:()=>null,save:()=>{},fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(await u.refresh(),null);
});
