import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHistoryStore} from '../history.mjs';
import {createEconomy,BILLING_CATALOG} from '../economy.mjs';

const identity='account:'+'a'.repeat(32);
const id=n=>n.toString(16).padStart(48,'0');
const params=participants=>({participants,rounds:2,mode:'judge'});
test('pricing catalog matches packs, volume discounts and monthly subscription',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(BILLING_CATALOG).map(([k,p])=>[k,[p.tasks,p.priceRub,p.discount]])),{
  subscription:[300,1200,20],pack5:[5,25,0],pack50:[50,225,10],pack100:[100,425,15]
 });
});
test('free members cannot use more than three models or save history',()=>{
 const economy=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'10'}});
 const names=['openai','mistral','grok','gemini'];
 assert.equal(economy.access(identity).maxModels,3);
 assert.equal(economy.access(identity).historyEnabled,false);
 const rejected=economy.start(identity,false,params(names),names);
 assert.equal(rejected.upgradeRequired,true);
 assert.equal(economy.access(identity).remainingFreeTasks,10);
 const accepted=economy.start(identity,false,params(names.slice(0,3)),names);
 assert.equal(accepted.historyEnabled,false);
 economy.success(accepted.taskId);
 economy.finish(accepted.taskId,identity);
 assert.equal(economy.access(identity).freeRemaining,7);
});
test('subscriber has 300 tokens, all models and unlimited retained history after expiry',()=>{
 let clock=Date.parse('2026-11-01T12:00:00Z');
 const economy=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'10'},now:()=>clock});
 const names=['openai','mistral','grok','gemini','claude','qwen','deepseek'];
 const subscription=economy.grant(identity,'subscription');
 assert.equal(subscription.subscriptionRemaining,300);
 assert.equal(subscription.historyEnabled,true);
 assert.equal(subscription.maxModels,7);
 const task=economy.start(identity,false,params(names),names);
 assert.equal(task.historyEnabled,true);
 assert.equal(task.remainingFreeTasks,293);
 economy.success(task.taskId);
 economy.finish(task.taskId,identity);
 assert.equal(economy.access(identity).subscriptionRemaining,293);
 clock+=31*86400000;
 assert.equal(economy.access(identity).historyEnabled,false);
 assert.equal(economy.access(identity).maxModels,3);
 assert.equal(economy.access(identity).freeRemaining,10);
 assert.equal(economy.access(identity).subscriptionRemaining,0);
});
test('prepaid packs survive monthly reset but do not grant 7 models or history',()=>{
 let clock=Date.parse('2026-11-01T12:00:00Z');
 const economy=createEconomy({env:{ACCOUNT_MONTHLY_TASKS:'10'},now:()=>clock});
 economy.grant(identity,'pack5');economy.grant(identity,'pack50');economy.grant(identity,'pack100');
 assert.equal(economy.access(identity).purchasedTasks,155);
 for(let i=0;i<5;i++){
  const task=economy.start(identity,false,params(['grok','mistral']),['grok','mistral']);
  economy.success(task.taskId);economy.finish(task.taskId,identity);
 }
 assert.equal(economy.access(identity).freeRemaining,0);
 const purchased=economy.start(identity,false,params(['grok','mistral']),['grok','mistral']);
 assert.equal(purchased.historyEnabled,false);
 assert.equal(economy.access(identity).purchasedTasks,153);
 assert.equal(economy.finish(purchased.taskId,identity).refunded,true);
 assert.equal(economy.access(identity).purchasedTasks,155);
 clock+=31*86400000;
 assert.equal(economy.access(identity).purchasedTasks,155);
 assert.equal(economy.access(identity).historyEnabled,false);
});
test('saved discussions are private per account, permanent, paginated, and separate from metering',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-history-'));
 try{
  const file=join(dir,'history.json');
  let history=createHistoryStore({file,now:()=>Date.parse('2026-11-01T12:00:00Z')});
  for(let i=0;i<23;i++)history.record(identity,id(i),{
   prompt:'Подготовить контент-план номер '+i,profile:'SMM',specialization:'Контент-план',
   messages:[{name:'Mistral',stage:'Раунд 1',text:'Черновик '+i},{name:'Итог',stage:'Результат',text:'Готовый вариант '+i,final:true}]
  });
  assert.equal(history.list(identity).total,23);
  assert.equal(history.list(identity).items.length,20);
  assert.equal(history.list(identity).nextOffset,20);
  assert.equal(history.list(identity,{offset:20}).items.length,3);
  assert.equal(history.get('account:'+'b'.repeat(32),id(0)),null);
  assert.equal(history.list('account:'+'b'.repeat(32)).total,0);
  const before=history.get(identity,id(0));
  history.record(identity,id(0),{prompt:'Заменить старую историю',messages:[{name:'x',stage:'y',text:'z'}]});
  assert.deepEqual(history.get(identity,id(0)),before);
  history=createHistoryStore({file});
  assert.equal(history.list(identity).total,23);
  assert.equal(history.get(identity,id(22)).messages[1].text,'Готовый вариант 22');
  assert.ok(!readFileSync(file,'utf8').includes('TOKEN_SECRET'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('history input validation rejects malformed and oversized conversation dumps',()=>{
 const history=createHistoryStore();
 assert.throws(()=>history.record(identity,id(0),{prompt:'x',messages:[{name:'x',stage:'y',text:'x'.repeat(80001)}]}),/Некорректные сообщения/);
 assert.throws(()=>history.record(identity,id(0),{prompt:'x',messages:new Array(91).fill({name:'x',stage:'y',text:'ok'})}),/Некорректная история/);
 assert.throws(()=>history.record(identity,id(0),{prompt:'',messages:[]}),/Некорректная задача/);
});
