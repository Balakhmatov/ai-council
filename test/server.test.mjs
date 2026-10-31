import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server.mjs';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
async function setup(overrides={},options={}){let calls=[];const env={PROXY_TOKEN:'admin-test-only',OPENAI_API_KEY:'private-test-key',OPENAI_MODEL:'server-pinned-model',PUBLIC_IP_DAILY_LIMIT:'2',PUBLIC_DAILY_LIMIT:'10',...overrides};const s=createServer({env,now:options.now||Date.now,
 fxFetchImpl:options.fxFetchImpl||(async()=>new Response("<ValCurs Date=\"31.10.2026\"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>82,5000</Value></Valute><Valute><CharCode>CNY</CharCode><Nominal>10</Nominal><Value>117,5000</Value></Valute></ValCurs>")),
 fetchImpl:async(url,requestOptions)=>{calls.push({url,options:requestOptions});return options.upstream?options.upstream(url,requestOptions):Response.json({choices:[{message:{content:'OK'}}]});}});await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${s.address().port}`;return {calls,env,send:async(path,body,token,extra={})=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};},close:()=>new Promise(r=>s.close(r))};}
const body={provider:'openai',model:'client-expensive-model',messages:[{role:'user',content:'hello'}]};
test('public config omits secrets; admin requires real authentication',async()=>{const t=await setup();try{const c=await t.send('/api/config');assert.deepEqual(c.data,{providers:['openai']});assert.equal((await t.send('/api/admin')).status,401);const admin=await t.send('/api/admin',undefined,'admin-test-only');assert.equal(admin.status,200);assert.equal(admin.data.providers[0].model,'server-pinned-model');assert(!JSON.stringify(admin.data).includes('private-test-key'));assert.equal((await t.send('/api/chat',body)).status,401);assert.equal((await t.send('/api/session',{},undefined,{Origin:'https://evil.example'})).status,403);}finally{await t.close();}});
test('visitor gets an automatic session, pinned model, quota shared across sessions',async()=>{const t=await setup({MISTRAL_API_KEY:'mistral-test',MISTRAL_MODEL:'mistral-large-2512'});try{const a=await t.send('/api/session',{}),b=await t.send('/api/session',{});assert.equal(a.status,200);assert.notEqual(a.data.token,b.data.token);const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},a.data.token)).data;assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},a.data.token)).status,200);assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},b.data.token)).status,200);assert.equal(JSON.parse(t.calls[0].options.body).model,'server-pinned-model');assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},a.data.token)).status,429);assert.equal((await t.send('/api/session',{})).status,429);assert.equal(t.calls.length,2);}finally{await t.close();}});
test('unavailable providers and malformed bodies never call upstream',async()=>{const t=await setup();try{for(const b of [null,{...body,provider:'qwen'},{...body,provider:'__proto__'},{...body,messages:[null]}])assert.equal((await t.send('/api/chat',b,'admin-test-only')).status,400);assert.equal(t.calls.length,0);}finally{await t.close();}});
test('public quota survives server restart',async()=>{const dir=mkdtempSync(join(tmpdir(),'quorum-test-'));const options={QUOTA_FILE:join(dir,'usage.json'),ACCOUNTING_FILE:join(dir,'accounting.json'),MISTRAL_API_KEY:'test-mistral',MISTRAL_MODEL:'mistral-large-2512',PUBLIC_IP_DAILY_LIMIT:'1'};let t=await setup(options);try{const session=await t.send('/api/session',{});const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},session.data.token)).data;assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},session.data.token)).status,200);await t.close();t=await setup(options);assert.equal((await t.send('/api/session',{})).status,429);}finally{await t.close();rmSync(dir,{recursive:true,force:true});}});

test('current UTC time is injected server-side into every model request',async()=>{
 const t=await setup({MISTRAL_API_KEY:'mistral-test-key',MISTRAL_MODEL:'mistral-large-4'},{now:()=>Date.parse('2026-10-31T05:34:20Z')});
 try{
  for(const provider of ['openai','mistral']){
   const result=await t.send('/api/chat',{provider,messages:[{role:'system',content:'Existing instructions'},{role:'user',content:'today?'}]},'admin-test-only');
   assert.equal(result.status,200);
  }
  for(const call of t.calls){
   const messages=JSON.parse(call.options.body).messages;
   assert.equal(messages[0].role,'system');
   assert.match(messages[0].content,/2026-10-31T05:34:20\.000Z/);
   assert.match(messages[0].content,/Existing instructions/);
   assert.equal(messages[1].content,'today?');
  }
  await t.send('/api/chat',body,'admin-test-only');
  const messages=JSON.parse(t.calls.at(-1).options.body).messages;
  assert.equal(messages[0].role,'system');
  assert.match(messages[0].content,/2026-10-31T05:34:20\.000Z/);
  assert.equal(messages[1].content,'hello');
 }finally{await t.close();}
});
test('Luna uses Chat Completions reasoning-compatible parameters',async()=>{
 const t=await setup({OPENAI_MODEL:'gpt-6-luna'});
 try{
  assert.equal((await t.send('/api/chat',body,'admin-test-only')).status,200);
  const payload=JSON.parse(t.calls[0].options.body);
  assert.equal(payload.model,'gpt-6-luna');
  assert.equal(payload.reasoning_effort,'medium');
  assert.equal(payload.max_completion_tokens,4096);
  assert.equal(payload.max_tokens,undefined);
 }finally{await t.close();}
});

test('public users require a tracked task before provider calls; failed task is refunded',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512',FREE_START_TASKS:'2'});
 try{
  const session=(await t.send('/api/session',{})).data;
  assert.equal((await t.send('/api/chat',body,session.token)).status,403);
  assert.equal((await t.send('/api/access',undefined,session.token)).data.remainingFreeTasks,2);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},session.token)).data;
  assert.equal(task.remainingFreeTasks,1);
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},session.token)).data.refunded,true);
  assert.equal((await t.send('/api/access',undefined,session.token)).data.remainingFreeTasks,2);
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},session.token)).status,403);
 }finally{await t.close();}
});
test('no more than one long final per task',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512'});
 try{
  const session=(await t.send('/api/session',{})).data;
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},session.token)).data;
  const first=await t.send('/api/chat',{...body,taskId:task.taskId,stage:'final'},session.token);
  assert.equal(first.status,200);
  assert.equal(JSON.parse(t.calls[0].options.body).max_tokens,7000);
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId,stage:'final'},session.token)).status,403);
 }finally{await t.close();}
});

test('three model API logs and whole discussion costs are reported in RUB only',async()=>{
 const models={OPENAI_MODEL:'gpt-6-luna',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512',XAI_API_KEY:'g',XAI_BASE_URL:'https://ddtnew.com/v1',GROK_MODEL:'grok-4.7'};
 const t=await setup(models,{upstream:async()=>Response.json({choices:[{message:{content:'Model answer'}}],usage:{prompt_tokens:7835,completion_tokens:828,prompt_tokens_details:{cached_tokens:0}}})});
 try{
  const token='admin-test-only';
  const task=(await t.send('/api/task/start',{participants:['openai','mistral','grok'],rounds:3,mode:'consensus'},token)).data;
  assert.equal(typeof task.taskId,'string');
  for(const provider of ['openai','mistral','grok']){
   const b={provider,messages:[{role:'user',content:'test'}],taskId:task.taskId,step:'Раунд 1'};
   assert.equal((await t.send('/api/chat',b,token)).status,200);
  }
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},token)).status,200);
  const summary=(await t.send('/api/admin',undefined,token)).data.accounting;
  assert.equal(summary.fx.usdRub,82.5);assert.equal(summary.fx.cnyRub,11.75);
  assert.equal(summary.prices.length,3);
  assert.ok(summary.prices.every(p=>p.currency==='RUB'&&p.input>0));
  assert.equal(summary.discussions[0].requests,3);
  assert.equal(summary.recent.length,3);
  assert.ok(summary.recent.every(c=>c.costRub>0&&c.rateUsed>0&&c.step==='Раунд 1'));
  assert.equal(summary.totals.unknownCostCalls,0);
  assert.equal(t.calls.length,3);
 }finally{await t.close();}
});
test('forced CBR rate update requires owner authentication',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512'});
 try{
  const session=(await t.send('/api/session',{})).data;
  assert.equal((await t.send('/api/admin/exchange-rate',{},session.token)).status,403);
  assert.equal((await t.send('/api/admin/exchange-rate',{},'admin-test-only')).status,200);
 }finally{await t.close();}
});

test('health check exposes an installed revision identifier for diagnosing VPS auto-deploy',async()=>{
 const t=await setup();try{
  const health=await t.send('/healthz');
  assert.equal(health.status,200);
  assert.equal(health.data.ok,true);
  assert.ok(Object.hasOwn(health.data,'revision'));
  assert.ok(health.data.revision===null||/^[a-f0-9]{40}$/.test(health.data.revision));
 }finally{await t.close();}
});

test('only the owner can page through every model request and its RUB price',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-admin-logs-'));
 const t=await setup({ACCOUNTING_FILE:join(dir,'accounting.json'),OPENAI_MODEL:'gpt-6-luna',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512',XAI_API_KEY:'g',GROK_MODEL:'grok-4.7',XAI_BASE_URL:'https://ddtnew.com/v1'},{
  upstream:async()=>Response.json({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:7835,completion_tokens:828}})
 });
 try{
  const session=(await t.send('/api/session',{})).data;
  assert.equal((await t.send('/api/admin/logs?limit=10',undefined,session.token)).status,403);
  assert.equal((await t.send('/api/admin/logs?limit=10')).status,403);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral','grok'],rounds:2,mode:'judge'},'admin-test-only')).data;
  for(const provider of ['openai','mistral','grok']){
   const result=await t.send('/api/chat',{provider,taskId:task.taskId,stage:'intermediate',step:'Независимая идея',messages:[{role:'user',content:'test'}]},'admin-test-only');
   assert.equal(result.status,200);
  }
  const a=await t.send('/api/admin/logs?limit=2&offset=0',undefined,'admin-test-only');
  assert.equal(a.status,200);assert.equal(a.data.total,3);
  assert.equal(a.data.calls.length,2);
  assert.equal(a.data.nextOffset,2);
  assert.ok(a.data.calls.every(x=>x.costRub>0&&x.costBreakdownRub&&x.discussionAccumulatedRub>0));
  const b=await t.send('/api/admin/logs?limit=2&offset=2',undefined,'admin-test-only');
  assert.equal(b.data.calls.length,1);assert.equal(b.data.nextOffset,null);
  const grok=await t.send('/api/admin/logs?provider=grok&taskId='+task.taskId,undefined,'admin-test-only');
  assert.equal(grok.data.total,1);
  assert.equal(grok.data.calls[0].model,'grok-4.7');
  assert.equal((await t.send('/api/admin/logs?taskId=invalid',undefined,'admin-test-only')).status,400);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});
