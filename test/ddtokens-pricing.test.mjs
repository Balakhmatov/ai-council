import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy} from '../economy.mjs';
const env={GEMINI_BASE_URL:'https://ddtnew.com/v1',CLAUDE_BASE_URL:'https://ddtnew.com/v1'};
const models={gemini:'gemini-4-argon-high',claude:'claude-sonnet-5-5'};
test('Gemini receipt estimates match all four group ×0.6 charges within displayed dynamic-rate precision',()=>{
 const economy=createEconomy({env});
 for(const [input,output,charged]of [[3754,68,.062186],[7532,3379,.371090],[4946,1791,.211194],[2869,1546,.161010]]){
  const entry=economy.logCall({provider:'gemini',model:models.gemini,usage:{prompt_tokens:input,completion_tokens:output}});
  assert.ok(Math.abs(entry.costRub-charged)<.00002);
  assert.equal(entry.rateCurrency,'RUB');assert.equal(entry.rateUsed,1);
 }
 assert.equal(economy.prices(models).find(p=>p.provider==='gemini').cached,null);
});
test('Claude native usage excludes cache from ordinary input and reconciles both receipts',()=>{
 const economy=createEconomy({env});
 for(const [input,output,cached,write,charged]of [[58,1905,8798,70,.255985],[76,2412,11452,92,.324704]]){
  const entry=economy.logCall({provider:'claude',model:models.claude,usage:{input_tokens:input,output_tokens:output,cache_read_input_tokens:cached,cache_creation_input_tokens:write}});
  assert.ok(Math.abs(entry.costRub-charged)<.00002);
  assert.equal(entry.input,input+cached+write);assert.equal(entry.cached,cached);
  assert.equal(entry.costBreakdownRub.input,input*25.32/1e6);
 }
});
test('hour cache writes are separate; unknown Gemini cache and direct-provider rates remain unknown',()=>{
 const economy=createEconomy({env});
 const entry=economy.logCall({provider:'claude',model:models.claude,usage:{input_tokens:0,output_tokens:0,cache_creation_input_tokens:30,cache_creation:{ephemeral_5m_input_tokens:10,ephemeral_1h_input_tokens:20}}});
 assert.ok(Math.abs(entry.costRub-(10*31.65+20*50.64)/1e6)<1e-12);
 assert.equal(economy.logCall({provider:'gemini',model:models.gemini,usage:{prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:5}}}).costRub,null);
 assert.equal(createEconomy({env:{}}).logCall({provider:'claude',model:models.claude,usage:{input_tokens:58,output_tokens:1905}}).costRub,null);
});
test('discussion cost is the sum of metered calls with growing contexts and cache writes',()=>{
 const economy=createEconomy({env});
 const task=economy.start('owner',true,{participants:['gemini','claude'],rounds:2,mode:'consensus'},['gemini','claude']);
 let total=0;
 for(const [provider,usage]of [['gemini',{prompt_tokens:3754,completion_tokens:68}],['claude',{input_tokens:58,output_tokens:1905,cache_read_input_tokens:8798,cache_creation_input_tokens:70}],['gemini',{prompt_tokens:7532,completion_tokens:3379}]]){
  total+=economy.logCall({taskId:task.taskId,provider,model:models[provider],usage}).costRub;
 }
 assert.equal(economy.summary(models).discussions[0].costRub,total);
});
