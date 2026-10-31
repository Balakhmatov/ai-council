import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEconomy} from '../economy.mjs';
const fx={usdRub:82.50,cnyRub:11.75,rateDate:'31.10.2026',fetchedAt:'2026-10-31T06:00:00Z',source:'Банк России'};
function task(economy){
 return economy.start('visitor',false,{participants:['openai','mistral','grok'],mode:'consensus',rounds:3},['openai','mistral','grok']);
}
test('free tasks persist; completed task costs one, empty task refunds',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-cost-'));
 try{
  const env={ACCOUNTING_FILE:join(dir,'ledger.json'),FREE_START_TASKS:'3'};
  const econ=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:00Z')});
  econ.updateExchangeRates(fx);
  assert.equal(econ.access('visitor').remainingFreeTasks,3);
  const t=task(econ);assert.equal(t.remainingFreeTasks,2);
  assert.equal(econ.checkCall(t.taskId,'visitor','openai'),true);
  econ.success(t.taskId);econ.finish(t.taskId,'visitor');
  assert.equal(econ.access('visitor').remainingFreeTasks,2);
  const t2=task(econ);assert.equal(econ.finish(t2.taskId,'visitor').refunded,true);
  const restored=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:01Z')});
  assert.equal(restored.access('visitor').remainingFreeTasks,2);
  assert.equal(restored.exchangeRates().usdRub,82.5);
  assert.equal(restored.summary().discussions.length,2);
 }finally{rmSync(dir,{force:true,recursive:true});}
});
test('cannot call unselected providers or invoke multiple long finals',()=>{
 const econ=createEconomy({env:{FREE_START_TASKS:'1'}});
 const t=econ.start('one',false,{participants:['openai','mistral'],mode:'judge',rounds:2},['openai','mistral','grok']);
 assert.equal(econ.checkCall(t.taskId,'another','openai'),false);
 assert.equal(econ.checkCall(t.taskId,'one','grok'),false);
 assert.equal(econ.checkCall(t.taskId,'one','openai','final'),true);
 assert.equal(econ.checkCall(t.taskId,'one','openai','final'),false);
 assert.equal(econ.start('one',false,{participants:['openai','mistral'],mode:'judge',rounds:2},['openai','mistral']).insufficient,true);
});
test('all three model prices and token costs are in RUB with CBR rate snapshot',()=>{
 const econ=createEconomy({env:{XAI_BASE_URL:'https://ddtnew.com/v1'},now:()=>Date.parse('2026-10-31T06:15:00Z')});
 econ.updateExchangeRates(fx);
 const t=task(econ);
 const usage={prompt_tokens:10000,completion_tokens:2000,prompt_tokens_details:{cached_tokens:3000},completion_tokens_details:{reasoning_tokens:400}};
 for(const provider of ['openai','mistral','grok'])econ.logCall({taskId:t.taskId,provider,model:({openai:'gpt-6-luna',mistral:'mistral-large-2512',grok:'grok-4.7'})[provider],step:'Раунд 1',usage,durationMs:2500});
 econ.success(t.taskId);econ.finish(t.taskId,'visitor');
 const summary=econ.summary({openai:'gpt-6-luna',mistral:'mistral-large-2512',grok:'grok-4.7'});
 const expectCost={
  openai:(7000*.10+3000*.01+2000*.5)*82.5/1000000,
  mistral:(7000*.50+3000*.05+2000*1.5)*82.5/1000000,
  grok:(7000*.60+3000*.15+2000*1.8)*11.75/1000000
 };
 for(const p of summary.prices){assert.equal(p.currency,'RUB');assert.ok(p.input>0);}
 for(const e of summary.recent){
  assert.equal(e.rateDate,'31.10.2026');
  assert.equal(e.input,10000);assert.equal(e.cached,3000);assert.equal(e.output,2000);assert.equal(e.reasoning,400);
  assert.ok(Math.abs(e.costRub-expectCost[e.provider])<1e-9);
  assert.equal(e.durationMs,2500);assert.equal(e.step,'Раунд 1');
 }
 const total=Object.values(expectCost).reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(summary.totals.costRub-total)<1e-9);
 assert.ok(Math.abs(summary.discussions[0].costRub-total)<1e-9);
 assert.equal(summary.discussions[0].requests,3);
 assert.equal(summary.discussions[0].byModel['grok/grok-4.7'].requests,1);
 assert.equal(summary.totals.unknownCostCalls,0);
});
test('failed calls and missing usage are logged without fabricating prices',()=>{
 const econ=createEconomy({env:{XAI_BASE_URL:'https://ddtnew.com/v1'}});
 econ.logCall({provider:'grok',model:'grok-4.7',status:'error',httpStatus:429,durationMs:9000});
 const s=econ.summary();
 assert.equal(s.recent[0].costRub,null);
 assert.equal(s.recent[0].httpStatus,429);
 assert.equal(s.totals.unknownCostCalls,1);
 assert.equal(s.totals.errors,1);
 assert.equal(s.prices[2].input,null);
});
test('legacy USD and estimated RUB entries remain visible as approximate RUB totals',()=>{
 const econ=createEconomy({env:{XAI_BASE_URL:'https://ddtnew.com/v1'}});
 econ.updateExchangeRates(fx);
 // Historical data conversion is only for legacy rows; new calls store their own fx snapshot.
 econ.record('openai','gpt-6-luna',{prompt_tokens:1000,completion_tokens:1000});
 const before=econ.summary().totals.costRub;
 econ.updateExchangeRates({...fx,usdRub:100,cnyRub:14,fetchedAt:'2026-11-01T00:00:00Z'});
 assert.equal(econ.summary().totals.costRub,before);
});
