import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEconomy} from '../economy.mjs';

test('free task allowance persists, successful task costs once, empty task is refunded',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-free-tasks-'));
 try{
  const env={ACCOUNTING_FILE:join(dir,'accounting.json'),FREE_START_TASKS:'3'};
  const economy=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:00Z')});
  assert.equal(economy.access('visitor').remainingFreeTasks,3);
  const first=economy.start('visitor',false,{participants:['openai','mistral'],mode:'consensus',rounds:3},['openai','mistral']);
  assert.equal(first.remainingFreeTasks,2);
  assert.equal(economy.checkCall(first.taskId,'visitor','openai'),true);
  economy.success(first.taskId);
  assert.equal(economy.finish(first.taskId,'visitor').refunded,false);
  assert.equal(economy.access('visitor').remainingFreeTasks,2);
  const second=economy.start('visitor',false,{participants:['openai','mistral'],mode:'consensus',rounds:3},['openai','mistral']);
  assert.equal(economy.finish(second.taskId,'visitor').refunded,true);
  assert.equal(economy.access('visitor').remainingFreeTasks,2);
  const restored=createEconomy({env,now:()=>Date.parse('2026-10-31T06:00:01Z')});
  assert.equal(restored.access('visitor').remainingFreeTasks,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('task cannot call unselected providers or create multiple final generations',()=>{
 const economy=createEconomy({env:{FREE_START_TASKS:'1'}});
 const t=economy.start('one',false,{participants:['openai','mistral'],mode:'judge',rounds:2},['openai','mistral','grok']);
 assert.equal(economy.checkCall(t.taskId,'someone-else','openai'),false);
 assert.equal(economy.checkCall(t.taskId,'one','grok'),false);
 assert.equal(economy.checkCall(t.taskId,'one','openai','final'),true);
 assert.equal(economy.checkCall(t.taskId,'one','openai','final'),false);
 assert.equal(economy.start('one',false,{participants:['openai','mistral'],mode:'judge',rounds:2},['openai','mistral']).insufficient,true);
});
test('official direct API rates yield detailed tokens and unknown proxy costs stay unknown',()=>{
 const economy=createEconomy({env:{}});
 economy.record('openai','gpt-6-luna',{prompt_tokens:10000,completion_tokens:5000,prompt_tokens_details:{cached_tokens:4000},completion_tokens_details:{reasoning_tokens:1000}});
 economy.record('mistral','mistral-large-2512',{prompt_tokens:10000,completion_tokens:4000});
 economy.record('grok','proxy-model',{prompt_tokens:10000,completion_tokens:2000});
 const info=economy.summary();
 const openai=info.recent.find(e=>e.provider==='openai');
 assert.equal(openai.cached,4000);assert.equal(openai.reasoning,1000);
 assert.equal(openai.costUsd,(6000*.1+4000*.01+5000*.5)/1e6);
 assert.equal(info.totals.unknownCostCalls,1);
 assert.equal(info.totals.requests,3);
 assert.equal(info.byModel['grok/proxy-model'].unknownCostCalls,1);
});
