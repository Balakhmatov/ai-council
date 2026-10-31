import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server.mjs';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
async function setup(overrides={},options={}){let calls=[];const env={PROXY_TOKEN:'admin-test-only',OPENAI_API_KEY:'private-test-key',OPENAI_MODEL:'server-pinned-model',PUBLIC_IP_DAILY_LIMIT:'2',PUBLIC_DAILY_LIMIT:'10',...overrides};const s=createServer({env,now:options.now||Date.now,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({choices:[{message:{content:'OK'}}]});}});await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${s.address().port}`;return {calls,env,send:async(path,body,token,extra={})=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};},close:()=>new Promise(r=>s.close(r))};}
const body={provider:'openai',model:'client-expensive-model',messages:[{role:'user',content:'hello'}]};
test('public config omits secrets; admin requires real authentication',async()=>{const t=await setup();try{const c=await t.send('/api/config');assert.deepEqual(c.data,{providers:['openai']});assert.equal((await t.send('/api/admin')).status,401);const admin=await t.send('/api/admin',undefined,'admin-test-only');assert.equal(admin.status,200);assert.equal(admin.data.providers[0].model,'server-pinned-model');assert(!JSON.stringify(admin.data).includes('private-test-key'));assert.equal((await t.send('/api/chat',body)).status,401);assert.equal((await t.send('/api/session',{},undefined,{Origin:'https://evil.example'})).status,403);}finally{await t.close();}});
test('visitor gets an automatic session, pinned model, quota shared across sessions',async()=>{const t=await setup();try{const a=await t.send('/api/session',{}),b=await t.send('/api/session',{});assert.equal(a.status,200);assert.notEqual(a.data.token,b.data.token);assert.equal((await t.send('/api/chat',body,a.data.token)).status,200);assert.equal((await t.send('/api/chat',body,b.data.token)).status,200);assert.equal(JSON.parse(t.calls[0].options.body).model,'server-pinned-model');assert.equal((await t.send('/api/chat',body,a.data.token)).status,429);assert.equal((await t.send('/api/session',{})).status,429);assert.equal(t.calls.length,2);}finally{await t.close();}});
test('unavailable providers and malformed bodies never call upstream',async()=>{const t=await setup();try{for(const b of [null,{...body,provider:'qwen'},{...body,provider:'__proto__'},{...body,messages:[null]}])assert.equal((await t.send('/api/chat',b,'admin-test-only')).status,400);assert.equal(t.calls.length,0);}finally{await t.close();}});
test('public quota survives server restart',async()=>{const dir=mkdtempSync(join(tmpdir(),'quorum-test-'));const options={QUOTA_FILE:join(dir,'usage.json'),PUBLIC_IP_DAILY_LIMIT:'1'};let t=await setup(options);try{const session=await t.send('/api/session',{});assert.equal((await t.send('/api/chat',body,session.data.token)).status,200);await t.close();t=await setup(options);assert.equal((await t.send('/api/session',{})).status,429);}finally{await t.close();rmSync(dir,{recursive:true,force:true});}});

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
