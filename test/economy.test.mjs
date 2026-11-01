import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
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
  const env={ACCOUNTING_FILE:join(dir,'ledger.json'),ACCOUNT_MONTHLY_TASKS:'6'};
  const econ=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:00Z')});
  econ.updateExchangeRates(fx);
  assert.equal(econ.access('visitor').remainingFreeTasks,6);
  const t=task(econ);assert.equal(t.remainingFreeTasks,3);
  assert.equal(econ.checkCall(t.taskId,'visitor','openai'),true);
  econ.success(t.taskId);econ.finish(t.taskId,'visitor');
  assert.equal(econ.access('visitor').remainingFreeTasks,3);
  const t2=task(econ);assert.equal(econ.finish(t2.taskId,'visitor').refunded,true);
  const restored=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:01Z')});
  assert.equal(restored.access('visitor').remainingFreeTasks,3);
  assert.equal(restored.exchangeRates().usdRub,82.5);
  assert.equal(restored.summary().discussions.length,2);
 }finally{rmSync(dir,{force:true,recursive:true});}
});
test('cannot call unselected providers or retry the same final model; distinct fallback is allowed',()=>{
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'2'}});
 const t=econ.start('one',false,{participants:['openai','mistral'],mode:'judge',rounds:2},['openai','mistral','grok']);
 assert.equal(econ.checkCall(t.taskId,'another','openai'),false);
 assert.equal(econ.checkCall(t.taskId,'one','grok'),false);
 assert.equal(econ.checkCall(t.taskId,'one','openai','final'),true);
 assert.equal(econ.checkCall(t.taskId,'one','openai','final'),false);
  assert.equal(econ.checkCall(t.taskId,'one','mistral','final'),true);
  assert.equal(econ.checkCall(t.taskId,'one','mistral','final'),false);
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

test('append-only request audit keeps all calls through more than rolling preview and restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-audit-'));
 try{
  const env={ACCOUNTING_FILE:join(dir,'accounting.json'),XAI_BASE_URL:'https://ddtnew.com/v1'};
  let economy=createEconomy({env,now:()=>Date.parse('2026-10-31T10:00:00Z')});
  economy.updateExchangeRates(fx);
  const group=task(economy);
  const usage={prompt_tokens:7835,completion_tokens:828};
  let last;
  for(let i=0;i<350;i++){
   last=economy.logCall({provider:'grok',model:'grok-4.7',taskId:group.taskId,step:'Раунд '+i,usage,durationMs:13000});
  }
  assert.equal(economy.summary().totals.requests,350);
  assert.equal(economy.summary().recent.length,200);
  assert.equal(economy.listCalls({limit:200,offset:0}).calls.length,200);
  assert.equal(economy.listCalls({limit:200,offset:200}).calls.length,150);
  assert.equal(economy.listCalls({limit:10,offset:345}).calls.length,5);
  assert.equal(economy.listCalls({provider:'mistral'}).total,0);
  assert.equal(economy.listCalls({provider:'grok',taskId:group.taskId}).total,350);
  assert.equal(last.modelAccumulatedRub,last.discussionAccumulatedRub);
  assert.ok(Math.abs(last.discussionAccumulatedRub-economy.summary().totals.costRub)<1e-8);
  assert.ok(Math.abs(last.costBreakdownRub.input+last.costBreakdownRub.cached+last.costBreakdownRub.output-last.costRub)<1e-12);
  economy=createEconomy({env,now:()=>Date.parse('2026-10-31T10:01:00Z')});
  assert.equal(economy.listCalls({limit:200,offset:200}).total,350);
  assert.equal(economy.listCalls({limit:200,offset:200}).nextOffset,null);
  const audit=readFileSync(env.ACCOUNTING_FILE+'.requests.jsonl','utf8');
  assert.equal(audit.trim().split('\n').length,350);
  assert.ok(!audit.includes('example prompt content'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('old rolling records are copied into first audit file on upgrade',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-audit-migration-'));
 try{
  const filename=join(dir,'accounting.json');
  const baseline=createEconomy({env:{ACCOUNTING_FILE:filename}});
  baseline.logCall({provider:'grok',model:'grok-4.7',usage:{prompt_tokens:1000,completion_tokens:200}});
  const auditFile=filename+'.requests.jsonl';
  rmSync(auditFile,{force:true});
  const reloaded=createEconomy({env:{ACCOUNTING_FILE:filename}});
  assert.equal(reloaded.listCalls().total,1);
  assert.equal(readFileSync(auditFile,'utf8').trim().split('\n').length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('free 10 tokens are granted once and never renewed at month boundary',()=>{
 let time=Date.parse('2026-10-30T20:59:00Z');
 const econ=createEconomy({env:{},now:()=>time}),identity='account:email-user';
 const params={participants:['openai','mistral'],rounds:2,mode:'judge'};
 for(let i=0;i<5;i++){const task=econ.start(identity,false,params,params.participants);econ.success(task.taskId);econ.finish(task.taskId,identity);}
 assert.equal(econ.access(identity).remainingFreeTasks,0);
 time=Date.parse('2026-11-30T21:00:00Z');
 assert.equal(econ.access(identity).remainingFreeTasks,0);
 assert.equal(econ.access(identity).period,'lifetime');
 assert.equal(econ.start(identity,false,params,params.participants).insufficient,true);
});
test('stopping a task before any model responds never refunds free task allocation',()=>{
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'3'}});
 const started=task(econ);assert.equal(econ.access('visitor').remainingFreeTasks,0);
 const closed=econ.finish(started.taskId,'visitor',{cancelled:true});
 assert.equal(closed.ok,true);
 assert.equal(closed.cancelled,true);
 assert.equal(closed.refunded,false);
 assert.equal(closed.remainingFreeTasks,0);
 assert.equal(econ.access('visitor').remainingFreeTasks,0);
 assert.equal(econ.summary().discussions.find(x=>x.taskId===started.taskId).status,'cancelled');
 assert.equal(econ.finish(started.taskId,'visitor',{cancelled:true}),null);
});
test('stopping with zero answers consumes a subscription task and a purchased pack task',()=>{
 const identity='account:'+'c'.repeat(32);
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'0'}});
 econ.grant(identity,'subscription');
 const args={participants:['openai','grok'],mode:'judge',rounds:2};
 const t=econ.start(identity,false,args,args.participants);
 assert.equal(econ.access(identity).subscriptionRemaining,298);
 const ended=econ.finish(t.taskId,identity,{cancelled:true});
 assert.equal(ended.refunded,false);
 assert.equal(econ.access(identity).subscriptionRemaining,298);
 const second='account:'+'d'.repeat(32);
 econ.grant(second,'pack5');
 const t2=econ.start(second,false,args,args.participants);
 assert.equal(econ.access(second).purchasedTasks,3);
 assert.equal(econ.finish(t2.taskId,second,{cancelled:true}).refunded,false);
 assert.equal(econ.access(second).purchasedTasks,3);
});
test('non-user failure before any success continues to return allocation',()=>{
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'3'}});
 const started=task(econ);
 const closed=econ.finish(started.taskId,'visitor');
 assert.equal(closed.cancelled,false);
 assert.equal(closed.refunded,true);
 assert.equal(econ.access('visitor').remainingFreeTasks,3);
});

test('token billing charges one credit per selected model, not per round',()=>{
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'10'}});
 const identity='account:'+'e'.repeat(32);
 const available=['openai','mistral','grok','claude','gemini','deepseek','qwen'];
 const first=econ.start(identity,false,{participants:available.slice(0,3),rounds:5,mode:'judge'},available);
 assert.equal(first.chargedTokens,3);
 assert.equal(econ.access(identity).remainingFreeTasks,7);
 econ.success(first.taskId);econ.finish(first.taskId,identity);
 assert.equal(econ.access(identity).remainingFreeTasks,7);
 const second=econ.start(identity,false,{participants:available.slice(0,3),rounds:2,mode:'judge'},available);
 assert.equal(second.chargedTokens,3);
 assert.equal(econ.access(identity).remainingFreeTasks,4);
 assert.equal(econ.finish(second.taskId,identity).refunded,true);
 assert.equal(econ.access(identity).remainingFreeTasks,7);
});
test('subscription bills seven models as seven tokens and can combine pack remainder',()=>{
 const econ=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'0'}});
 const identity='account:'+'f'.repeat(32);
 const available=['openai','mistral','grok','claude','gemini','deepseek','qwen'];
 econ.grant(identity,'subscription');
 assert.equal(econ.access(identity).subscriptionRemaining,300);
 const first=econ.start(identity,false,{participants:available,rounds:5,mode:'judge'},available);
 assert.equal(first.chargedTokens,7);
 assert.equal(econ.access(identity).subscriptionRemaining,293);
 econ.success(first.taskId);econ.finish(first.taskId,identity);
 econ.grant(identity,'pack5');
 // Simulate 2 subscription tokens left, combine them with 5 purchased tokens.
 econ.grant(identity,'subscription');
 for(let i=0;i<42;i++){
  const t=econ.start(identity,false,{participants:available,rounds:2,mode:'judge'},available);
  econ.success(t.taskId);econ.finish(t.taskId,identity);
 }
 assert.equal(econ.access(identity).subscriptionRemaining,6);
 const small=econ.start(identity,false,{participants:available.slice(0,4),rounds:2,mode:'judge'},available);
 econ.success(small.taskId);econ.finish(small.taskId,identity);
 assert.equal(econ.access(identity).subscriptionRemaining,2);
 const mixed=econ.start(identity,false,{participants:available,rounds:3,mode:'judge'},available);
 assert.equal(mixed.chargedTokens,7);
 assert.equal(econ.access(identity).subscriptionRemaining,0);
 assert.equal(econ.access(identity).purchasedTasks,0);
 assert.equal(econ.finish(mixed.taskId,identity).refunded,true);
 assert.equal(econ.access(identity).subscriptionRemaining,2);
 assert.equal(econ.access(identity).purchasedTasks,5);
});

test('failed majority of real discussion rounds refunds exactly one credit for that AI',()=>{
 for(const [rounds,failedRounds,refundExpected] of [[2,1,false],[2,2,true],[3,1,false],[3,2,true],[4,2,false],[4,3,true],[5,2,false],[5,3,true]]){
  const economy=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'10'}});
  const identity='account:'+'a'.repeat(32),models=['openai','mistral'];
  const task=economy.start(identity,false,{participants:models,mode:'judge',rounds},models);
  for(let round=1;round<=rounds;round++){
   const step=round===1?'Первый раунд':'Раунд '+round;
   economy.logCall({taskId:task.taskId,provider:'openai',model:'gpt-6-luna',
    step,status:round<=failedRounds?'error':'ok',httpStatus:round<=failedRounds?503:200});
   if(round>failedRounds)economy.success(task.taskId);
   economy.logCall({taskId:task.taskId,provider:'mistral',model:'mistral-large-2512',step,status:'ok',httpStatus:200});
   economy.success(task.taskId);
  }
  // A failed consensus/final call must not change round-based refunds.
  economy.logCall({taskId:task.taskId,provider:'mistral',model:'mistral-large-2512',step:'Проверка согласия',status:'error'});
  const result=economy.finish(task.taskId,identity);
  assert.equal(result.refundedTokens,refundExpected?1:0,'rounds='+rounds+' failed='+failedRounds);
  assert.deepEqual(result.refundedModels,refundExpected?['openai']:[]);
  assert.equal(economy.access(identity).remainingFreeTasks,8+(refundExpected?1:0));
 }
});
test('paid model refund restores the same paid balance and cannot run twice',()=>{
 const economy=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'0'}}),id='account:'+'b'.repeat(32);
 economy.grant(id,'pack5');
 const models=['openai','mistral'],task=economy.start(id,false,{participants:models,rounds:3,mode:'judge'},models);
 for(const step of ['Первый раунд','Раунд 2','Раунд 3']){
  economy.logCall({taskId:task.taskId,provider:'openai',model:'gpt-6-luna',step,status:'error'});
  economy.logCall({taskId:task.taskId,provider:'mistral',model:'mistral-large-2512',step,status:'ok'});
  economy.success(task.taskId);
 }
 assert.equal(economy.access(id).purchasedTasks,3);
 assert.equal(economy.finish(task.taskId,id).refundedTokens,1);
 assert.equal(economy.access(id).purchasedTasks,4);
 assert.equal(economy.finish(task.taskId,id),null);
});
