import crypto from 'node:crypto';
import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server.mjs';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
async function setup(overrides={},options={}){
 let calls=[],emailCode;
 const env={PROXY_TOKEN:'admin-test-only',OPENAI_API_KEY:'private-test-key',OPENAI_MODEL:'server-pinned-model',ACCOUNT_DAILY_CALL_LIMIT:'2',PUBLIC_DAILY_LIMIT:'10',RESEND_API_KEY:'test-mail',EMAIL_FROM:'login@example.com',...overrides};
 const s=createServer({env,now:options.now||Date.now,
  emailFetchImpl:options.emailFetchImpl||(async(url,opts)=>{emailCode=JSON.parse(opts.body).text.match(/\d{6}/)[0];return Response.json({id:'test'});}),
  fxFetchImpl:options.fxFetchImpl||(async()=>new Response('<ValCurs Date="31.10.2026"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>82,5000</Value></Valute><Valute><CharCode>CNY</CharCode><Nominal>10</Nominal><Value>117,5000</Value></Valute></ValCurs>')),
  fetchImpl:async(url,opts)=>{calls.push({url,options:opts});return options.upstream?options.upstream(url,opts):Response.json({choices:[{message:{content:'OK'}}]});}});
 await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${s.address().port}`;
 const send=async(path,body,token,extra={})=>{
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 return {calls,env,send,asset:async path=>{const response=await fetch(base+path);return {status:response.status,type:response.headers.get('content-type'),body:await response.text()};},login:async(email='user@example.com')=>{await send('/api/email/request',{email});return send('/api/email/verify',{email,code:emailCode});},close:()=>new Promise(r=>s.close(r))};
}
const body={provider:'openai',model:'client-expensive-model',messages:[{role:'user',content:'hello'}]};
test('public config omits secrets; admin requires real authentication',async()=>{const t=await setup();try{const c=await t.send('/api/config');assert.deepEqual(c.data.providers,['openai']);assert.equal(c.data.authRequired,true);assert.equal(c.data.catalog.subscription.tasks,300);assert.equal(c.data.catalog.pack100.priceRub,425);assert.equal(c.data.telegramUrl,null);assert.equal((await t.send('/api/admin')).status,401);const admin=await t.send('/api/admin',undefined,'admin-test-only');assert.equal(admin.status,200);assert.equal(admin.data.providers[0].model,'server-pinned-model');assert(!JSON.stringify(admin.data).includes('private-test-key'));assert.equal((await t.send('/api/chat',body)).status,401);assert.equal((await t.send('/api/session',{},undefined,{Origin:'https://evil.example'})).status,403);}finally{await t.close();}});
test('authenticated account has shared pinned model and call limit across sessions',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const a=await t.login(),b=await t.login();assert.notEqual(a.data.token,b.data.token);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},a.data.token)).data;
  for(const token of [a.data.token,b.data.token])assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},token)).status,200);
  assert.equal(JSON.parse(t.calls[0].options.body).model,'server-pinned-model');
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},a.data.token)).status,429);
  assert.equal((await t.send('/api/access',undefined,b.data.token)).data.remainingFreeTasks,8);
 }finally{await t.close();}
});
test('unavailable providers and malformed bodies never call upstream',async()=>{const t=await setup();try{for(const b of [null,{...body,provider:'qwen'},{...body,provider:'__proto__'},{...body,messages:[null]}])assert.equal((await t.send('/api/chat',b,'admin-test-only')).status,400);assert.equal(t.calls.length,0);}finally{await t.close();}});
test('monthly account quota survives server restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-test-'));
 const env={ACCOUNTING_FILE:join(dir,'accounting.json'),MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'};
 let t=await setup(env);
 try{
  const login=await t.login();
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},login.data.token)).data;
  await t.send('/api/chat',{...body,taskId:task.taskId},login.data.token);
  await t.send('/api/task/finish',{taskId:task.taskId},login.data.token);
  await t.close();t=await setup(env);
  const again=await t.login();assert.equal((await t.send('/api/access',undefined,again.data.token)).data.remainingFreeTasks,8);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});

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
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512',ACCOUNT_MONTHLY_TASKS:'2'});
 try{
  const session=(await t.login()).data;
  assert.equal((await t.send('/api/chat',body,session.token)).status,403);
  assert.equal((await t.send('/api/access',undefined,session.token)).data.remainingFreeTasks,2);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},session.token)).data;
  assert.equal(task.remainingFreeTasks,0);
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},session.token)).data.refunded,true);
  assert.equal((await t.send('/api/access',undefined,session.token)).data.remainingFreeTasks,2);
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},session.token)).status,403);
 }finally{await t.close();}
});
test('no more than one long final per task',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-large-2512'});
 try{
  const session=(await t.login()).data;
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
  const session=(await t.login()).data;
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
  const session=(await t.login()).data;
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

test('DDTokens Claude and Gemini use their respective wire formats and pinned models',async()=>{
 for(const provider of ['claude','gemini']){
  const prefix=provider.toUpperCase(),model=provider==='claude'?'claude-sonnet-5-5':'gemini-4-argon-high';
  const t=await setup({[prefix+'_API_KEY']:'proxy-test-key',[prefix+'_MODEL']:model,[prefix+'_BASE_URL']:'https://ddtnew.com/v1/'},{upstream:async()=>Response.json(provider==='claude'?{content:[{type:'text',text:'OK'}]}:{choices:[{message:{content:'OK'}}]})});
  try{
   const result=await t.send('/api/chat',{...body,provider},'admin-test-only');
   assert.equal(result.status,200);assert.equal(result.data.text,'OK');
   const {url,options}=t.calls[0],payload=JSON.parse(options.body);
   assert.equal(url,'https://ddtnew.com/v1/'+(provider==='claude'?'messages':'chat/completions'));
   assert.equal(options.redirect,'error');assert.equal(payload.model,model);
   if(provider==='claude'){
    assert.equal(options.headers['x-api-key'],'proxy-test-key');assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.headers['anthropic-version'],'2023-06-01');assert.equal(typeof payload.system,'string');assert(payload.messages.every(m=>m.role!=='system'));
   }else assert.equal(options.headers.Authorization,'Bearer proxy-test-key');
  }finally{await t.close();}
 }
});
test('Claude and Gemini reject untrusted proxy addresses',()=>{
 for(const provider of ['CLAUDE','GEMINI'])assert.throws(()=>createServer({env:{[provider+'_BASE_URL']:'https://untrusted.example/v1'}}),/Invalid .* base URL/);
});

test('email verification creates non-admin monthly identity; re-login does not reset quota and logout revokes token',async()=>{
 let code;
 const t=await setup({RESEND_API_KEY:'mail-test',EMAIL_FROM:'login@example.com',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'},{emailFetchImpl:async(url,options)=>{code=JSON.parse(options.body).text.match(/\d{6}/)[0];return Response.json({id:'ok'});}});
 try{
  assert.equal((await t.send('/api/email/verify',{email:'a@example.com',code:'123456'})).status,400);
  await t.send('/api/email/request',{email:'a@example.com'});
  const login=(await t.send('/api/email/verify',{email:'a@example.com',code})).data;
  assert.equal(login.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,login.token)).data.remainingFreeTasks,10);
  assert.equal((await t.send('/api/admin',undefined,login.token)).status,401);
  const started=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},login.token)).data;
  assert.equal(started.remainingFreeTasks,8);
  await t.send('/api/email/request',{email:'A@example.com'});
  const again=(await t.send('/api/email/verify',{email:'A@example.com',code})).data;
  assert.equal((await t.send('/api/access',undefined,again.token)).data.remainingFreeTasks,8);
  await t.send('/api/logout',{},again.token);
  assert.equal((await t.send('/api/access',undefined,again.token)).status,401);
  assert.equal((await t.send('/api/email/verify',{email:'A@example.com',code})).status,400);
 }finally{await t.close();}
});

test('anonymous access cannot create sessions, tasks or provider calls and stores no quota',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-anon-'));
 const file=join(dir,'accounting.json');const t=await setup({ACCOUNTING_FILE:file});
 try{
  for(const [path,payload]of [['/api/session',{}],['/api/access',undefined],['/api/task/start',{}],['/api/chat',body],['/api/task/finish',{}]])assert.equal((await t.send(path,payload)).status,401);
  assert.equal(t.calls.length,0);
  const fs=await import('node:fs');assert.equal(fs.existsSync(file),false);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});
test('account sessions and tasks work across networks',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const login=await t.login();const token=login.data.token;
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},token,{'X-Real-IP':'192.0.2.1'})).data;
  assert.equal(task.remainingFreeTasks,8);
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},token,{'X-Real-IP':'192.0.2.2'})).status,200);
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},token)).status,200);
 }finally{await t.close();}
});

test('subscription-only history is isolated, retained after expiry and requires authenticated owner',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-history-api-'));
 let tick=Date.parse('2026-11-01T10:00:00Z');
 const t=await setup({
  ACCOUNTING_FILE:join(dir,'accounting.json'),HISTORY_FILE:join(dir,'history.json'),
  ACCOUNT_MONTHLY_TASKS:'10',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test',GROK_API_KEY:'g',GROK_MODEL:'test',GEMINI_API_KEY:'ge',GEMINI_MODEL:'test'
 },{now:()=>tick});
 try{
  const a=(await t.login('a@example.com')).data,b=(await t.login('b@example.com')).data;
  const aAccess=(await t.send('/api/access',undefined,a.token)).data;
  assert.equal(aAccess.maxModels,3);
  assert.equal(aAccess.historyEnabled,false);
  const tooMany=await t.send('/api/task/start',{participants:['openai','mistral','grok','gemini'],rounds:2,mode:'judge'},a.token);
  assert.equal(tooMany.status,403);
  const free=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},a.token)).data;
  assert.equal(free.historyEnabled,false);
  const freeEnd=await t.send('/api/task/finish',{taskId:free.taskId,history:{prompt:'free prompt',messages:[{name:'OpenAI',stage:'Раунд 1',text:'hidden'}]}},a.token);
  assert.equal(freeEnd.data.historySaved,false);
  assert.equal((await t.send('/api/history',undefined,a.token)).data.total,0);
  assert.equal((await t.send('/api/admin/billing/grant',{accountRef:aAccess.accountRef,sku:'subscription'},a.token)).status,403);
  const grant=await t.send('/api/admin/billing/grant',{accountRef:aAccess.accountRef,sku:'subscription'},'admin-test-only');
  assert.equal(grant.status,200);
  assert.equal(grant.data.access.subscriptionRemaining,300);
  const subStart=(await t.send('/api/task/start',{participants:['openai','mistral','grok','gemini'],rounds:2,mode:'judge'},a.token)).data;
  assert.equal(subStart.historyEnabled,true);
  const call=await t.send('/api/chat',{provider:'openai',taskId:subStart.taskId,messages:[{role:'user',content:'test'}]},a.token);
  assert.equal(call.status,200);
  const saved=await t.send('/api/task/finish',{taskId:subStart.taskId,history:{prompt:'Paid saved prompt',profile:'SMM',specialization:'Посты',messages:[{name:'OpenAI',stage:'Раунд 1',text:'Draft'},{name:'Итог',stage:'Готово',text:'Answer',final:true}]}},a.token);
  assert.equal(saved.status,200);assert.equal(saved.data.historySaved,true);
  const owned=(await t.send('/api/history',undefined,a.token)).data;
  assert.equal(owned.total,1);assert.equal(owned.items[0].title,'Paid saved prompt');
  assert.equal((await t.send('/api/history/'+subStart.taskId,undefined,b.token)).status,404);
  assert.equal((await t.send('/api/history',undefined,b.token)).data.total,0);
  assert.equal((await t.send('/api/history',undefined)).status,401);
  tick+=31*86400000;
  const afterExpiry=(await t.login('a@example.com')).data;
  const expiredToken=afterExpiry.token;
  assert.equal((await t.send('/api/access',undefined,expiredToken)).data.historyEnabled,false);
  assert.equal((await t.send('/api/history',undefined,expiredToken)).data.total,1);
  assert.equal((await t.send('/api/history/'+subStart.taskId,undefined,expiredToken)).data.messages[1].text,'Answer');
  const noSub=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},expiredToken)).data;
  assert.equal(noSub.historyEnabled,false);
  const ended=await t.send('/api/task/finish',{taskId:noSub.taskId,history:{prompt:'new free',messages:[{name:'x',stage:'y',text:'free'}]}},expiredToken);
  assert.equal(ended.data.historySaved,false);
  assert.equal((await t.send('/api/history',undefined,expiredToken)).data.total,1);
  const pack=await t.send('/api/admin/billing/grant',{accountRef:aAccess.accountRef,sku:'pack100'},'admin-test-only');
  assert.equal(pack.data.access.purchasedTasks,100);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});

test('public Quorum serves its enhanced UI stylesheet rather than returning 404',async()=>{
 const t=await setup();
 try{
  const css=await t.asset('/uiux32.css?v=pricing-fix37');
  assert.equal(css.status,200);
  assert.equal(css.type,'text/css');
  assert.match(css.body,/\.pricing-dialog \.pricing-offers/);
  assert.match(css.body,/\.pricing-offer-sub/);
  const html=await t.asset('/');
  assert.equal(html.status,200);
  assert.match(html.body,/uiux32\.css\?v=qwen-deepseek46/);
  assert.match(html.body,/id="pricingDialog"/);
 }finally{await t.close();}
});

test('first email verification creates password; subsequent login needs no code and preserves user quota',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-persistent-password-'));
 const env={
  PASSWORD_FILE:join(dir,'passwords.json'),SESSION_FILE:join(dir,'sessions.enc'),ACCOUNTING_FILE:join(dir,'accounting.json'),
  MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'
 };
 let t=await setup(env);
 try{
  const old=(await t.login('member@example.com')).data,token=old.token;
  assert.equal((await t.send('/api/email/password/set',{password:'safe-password-2026'},token)).status,200);
  assert.equal((await t.send('/api/email/password/set',{password:'another-password-2026'},token)).status,403);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},token)).data;
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},token)).status,200);
  const wrong=await t.send('/api/email/password/login',{email:'member@example.com',password:'wrong-password'});
  assert.equal(wrong.status,401);
  const login=await t.send('/api/email/password/login',{email:'MEMBER@example.com',password:'safe-password-2026'});
  assert.equal(login.status,200);
  assert.equal(login.data.user.email,'member@example.com');
  assert.equal((await t.send('/api/access',undefined,login.data.token)).data.remainingFreeTasks,10);
  // Quota is charged only if a model returns a successful answer.
  assert.equal((await t.send('/api/email/password/set',{password:'compromised-password'},login.data.token)).status,403);
  await t.close();t=await setup(env);
  assert.equal((await t.send('/api/auth/session',undefined,login.data.token)).status,200);
  assert.equal((await t.send('/api/email/password/login',{email:'member@example.com',password:'safe-password-2026'})).status,200);
  const verified=(await t.login('member@example.com')).data;
  assert.equal((await t.send('/api/email/password/set',{password:'new-password-2026'},verified.token)).status,200);
  assert.equal((await t.send('/api/email/password/login',{email:'member@example.com',password:'safe-password-2026'})).status,401);
  assert.equal((await t.send('/api/email/password/login',{email:'member@example.com',password:'new-password-2026'})).status,200);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});

test('configured, verified owner email gets admin UI/session, 7 models and billing access; other emails stay free',async()=>{
 const env={
  QUORUM_ADMIN_EMAILS:' owner@example.com; another-owner@example.com ',
  MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test',
  GROK_API_KEY:'g',GROK_MODEL:'test',
  GEMINI_API_KEY:'ge',GEMINI_MODEL:'test'
 };
 const t=await setup(env);
 try{
  const normal=(await t.login('other@example.com')).data;
  assert.equal(normal.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,normal.token)).data.maxModels,3);
  assert.equal((await t.send('/api/admin',undefined,normal.token)).status,401);
  const owner=(await t.login('Owner@Example.com')).data;
  assert.equal(owner.isAdmin,true);
  assert.equal(owner.user.email,'owner@example.com');
  const ownerSession=(await t.send('/api/auth/session',undefined,owner.token)).data;
  assert.equal(ownerSession.isAdmin,true);
  const access=(await t.send('/api/access',undefined,owner.token)).data;
  assert.equal(access.plan,'admin');
  assert.equal(access.admin,true);
  assert.equal(access.maxModels,7);
  assert.equal(access.historyEnabled,true);
  assert.equal(access.remainingFreeTasks,null);
  assert.equal((await t.send('/api/admin',undefined,owner.token)).status,200);
  assert.equal((await t.send('/api/admin/billing/grant',{accountRef:'account:'+'a'.repeat(32),sku:'pack5'},owner.token)).status,200);
  const members=['openai','mistral','grok','gemini'];
  assert.equal((await t.send('/api/task/start',{participants:members,rounds:2,mode:'judge'},normal.token)).status,403);
  const advanced=(await t.send('/api/task/start',{participants:members,rounds:2,mode:'judge'},owner.token));
  assert.equal(advanced.status,200);
  assert.equal(advanced.data.historyEnabled,true);
  assert.equal((await t.send('/api/task/finish',{taskId:advanced.data.taskId},owner.token)).status,200);
  assert.equal((await t.send('/api/access',undefined,normal.token)).data.admin,false);
  assert.equal((await t.send('/api/config')).data.catalog.subscription.priceRub,1200);
 }finally{await t.close();}
});
test('an email account is never admin without private allowlist even when password authenticated',async()=>{
 const t=await setup({QUORUM_ADMIN_EMAILS:'',TELEGRAM_ADMIN_IDS:'1296951270'});
 try{
  const email=(await t.login('owner@example.com')).data;
  assert.equal(email.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,email.token)).data.plan,'free');
  assert.equal((await t.send('/api/admin',undefined,email.token)).status,401);
  assert.equal((await t.send('/api/admin',undefined,'admin-test-only')).status,200);
 }finally{await t.close();}
});

test('existing email cookie session gains owner privileges after server restart with allowlist',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-owner-upgrade-'));
 const base={SESSION_FILE:join(dir,'sessions.enc'),QUORUM_ADMIN_EMAILS:''};
 let t=await setup(base);
 try{
  const login=(await t.login('owner@example.com')).data;
  assert.equal(login.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,login.token)).data.maxModels,3);
  await t.close();
  t=await setup({...base,QUORUM_ADMIN_EMAILS:'owner@example.com'});
  const identity=await t.send('/api/auth/session',undefined,login.token);
  assert.equal(identity.status,200);
  assert.equal(identity.data.isAdmin,true);
  const access=await t.send('/api/access',undefined,login.token);
  assert.equal(access.status,200);
  assert.equal(access.data.plan,'admin');
  assert.equal(access.data.maxModels,7);
  assert.equal((await t.send('/api/admin',undefined,login.token)).status,200);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});

test('verified owner email remains administrator without newer VPS admin email env setting',async()=>{
 const t=await setup({QUORUM_ADMIN_EMAILS:''});
 try{
  const owner=(await t.login('ILYA.BALAHMATOV@gmail.com')).data;
  assert.equal(owner.user.email,'ilya.balahmatov@gmail.com');
  assert.equal(owner.isAdmin,true);
  const session=(await t.send('/api/auth/session',undefined,owner.token)).data;
  assert.equal(session.isAdmin,true);
  const access=(await t.send('/api/access',undefined,owner.token)).data;
  assert.equal(access.admin,true);
  assert.equal(access.plan,'admin');
  assert.equal(access.maxModels,7);
  assert.equal(access.remainingFreeTasks,null);
  assert.equal((await t.send('/api/admin',undefined,owner.token)).status,200);
  const mistyped=(await t.login('ilya.balakhmatov@gmail.com')).data;
  assert.equal(mistyped.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,mistyped.token)).data.maxModels,3);
  const ordinary=(await t.login('ordinary-user@example.com')).data;
  assert.equal(ordinary.isAdmin,false);
  assert.equal((await t.send('/api/access',undefined,ordinary.token)).data.maxModels,3);
 }finally{await t.close();}
});

test('obsolete owner email in old VPS environment is not an administrator',async()=>{
 const t=await setup({QUORUM_ADMIN_EMAILS:'ilya.balakhmatov@gmail.com'});
 try{
  const incorrect=(await t.login('ilya.balakhmatov@gmail.com')).data;
  assert.equal(incorrect.isAdmin,false);
  assert.equal((await t.send('/api/admin',undefined,incorrect.token)).status,401);
  const correct=(await t.login('ilya.balahmatov@gmail.com')).data;
  assert.equal(correct.isAdmin,true);
  assert.equal((await t.send('/api/access',undefined,correct.token)).data.maxModels,7);
 }finally{await t.close();}
});

test('explicit stop via API does not refund a free task without any successful model answer',async()=>{
 const t=await setup({ACCOUNT_MONTHLY_TASKS:'2',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const session=(await t.login('stopper@example.com')).data;
  const original=(await t.send('/api/access',undefined,session.token)).data;
  assert.equal(original.remainingFreeTasks,2);
  const start=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},session.token)).data;
  assert.equal(start.remainingFreeTasks,0);
  const done=await t.send('/api/task/finish',{taskId:start.taskId,cancelled:true},session.token);
  assert.equal(done.status,200);
  assert.equal(done.data.cancelled,true);
  assert.equal(done.data.refunded,false);
  assert.equal(done.data.remainingFreeTasks,0);
  assert.equal((await t.send('/api/access',undefined,session.token)).data.remainingFreeTasks,0);
  assert.equal((await t.send('/api/task/finish',{taskId:start.taskId,cancelled:true},session.token)).status,404);
  const log=(await t.send('/api/admin',undefined,'admin-test-only')).data;
  assert.equal(log.accounting.discussions.find(x=>x.taskId===start.taskId).status,'cancelled');
 }finally{await t.close();}
});
test('stop with partial successful result remains charged; a non-stopped empty task still refunds',async()=>{
 const t=await setup({ACCOUNT_MONTHLY_TASKS:'4',MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const user=(await t.login('interrupted@example.com')).data;
  const args={participants:['openai','mistral'],rounds:2,mode:'judge'};
  const started=(await t.send('/api/task/start',args,user.token)).data;
  assert.equal((await t.send('/api/chat',{...body,taskId:started.taskId},user.token)).status,200);
  const stopped=(await t.send('/api/task/finish',{taskId:started.taskId,cancelled:true},user.token)).data;
  assert.equal(stopped.cancelled,true);assert.equal(stopped.refunded,false);
  const next=(await t.send('/api/task/start',args,user.token)).data;
  const failed=(await t.send('/api/task/finish',{taskId:next.taskId},user.token)).data;
  assert.equal(failed.refunded,true);
  assert.equal((await t.send('/api/access',undefined,user.token)).data.remainingFreeTasks,2);
 }finally{await t.close();}
});
test('transcript export formatter module is served publicly as JavaScript',async()=>{
 const t=await setup();
 try{
  const result=await t.asset('/transcript.js');
  assert.equal(result.status,200);
  assert.match(result.type,/javascript/);
  assert.match(result.body,/export function formatTranscript/);
 }finally{await t.close();}
});

test('model-priority module is served to real browser, preserving Claude-first defaults',async()=>{
 const t=await setup();
 try{
  const result=await t.asset('/model-priority.js');
  assert.equal(result.status,200);
  assert.match(result.type,/javascript/);
  assert.match(result.body,/\['claude','openai'/);
  assert.match(result.body,/'grok'\]/);
  assert.match(result.body,/export function chooseModerator/);
  const html=await t.asset('/');
  assert.match(html.body,/app\.js\?v=refund-mobile-pay-20261101/);
 }finally{await t.close();}
});

test('full-history search is server-side, scoped to authenticated account and supports later pages',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-history-search-'));
 const t=await setup({HISTORY_FILE:join(dir,'history.json'),MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const user=(await t.login('searcher@example.com')).data;
  const access=(await t.send('/api/access',undefined,user.token)).data;
  assert.equal((await t.send('/api/admin/billing/grant',{accountRef:access.accountRef,sku:'subscription'},'admin-test-only')).status,200);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},user.token)).data;
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},user.token)).status,200);
  const end=await t.send('/api/task/finish',{taskId:task.taskId,history:{
   prompt:'Маркетинговый аудит',profile:'Маркетинг',specialization:'Конкуренты',
   messages:[{name:'Claude',stage:'Первый раунд',text:'Особенный текст о возвращении клиентов'}]
  }},user.token);
  assert.equal(end.status,200);
  assert.equal(end.data.historySaved,true);
  const search=(await t.send('/api/history?limit=20&offset=0&search='+encodeURIComponent('ВОЗВРАЩЕНИИ'),undefined,user.token)).data;
  assert.equal(search.total,1);
  assert.equal(search.items[0].title,'Маркетинговый аудит');
  const others=(await t.login('other@example.com')).data;
  assert.equal((await t.send('/api/history?search=возвращении',undefined,others.token)).data.total,0);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});
test('selected intermediate length reduces the actual model token budget, not final tokens',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-test',ACCOUNT_DAILY_CALL_LIMIT:'8'});
 try{
  const user=(await t.login('length@example.com')).data;
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'judge'},user.token)).data;
  const call=async(stage,maxWords)=>t.send('/api/chat',{provider:'mistral',messages:[{role:'user',content:'test'}],taskId:task.taskId,stage,maxWords},user.token);
  assert.equal((await call('intermediate',120)).status,200);
  assert.equal((await call('intermediate',500)).status,200);
  assert.equal((await call('final',120)).status,200);
  const opts=t.calls.filter(c=>c.url.includes('mistral')).map(c=>JSON.parse(c.options.body));
  assert.equal(opts[0].max_tokens,900);
  assert.equal(opts[1].max_tokens,2300);
  assert.equal(opts[2].max_tokens,7000);
 }finally{await t.close();}
});

test('grounded task search requires account ownership, cites sources and runs only once per task',async()=>{
 let groundingCalls=0;
 const t=await setup({GEMINI_API_KEY:'test-gemini-key',GEMINI_MODEL:'gemini-2.5-flash'},{
  upstream:async(url,opts)=>{
   if(url.includes(':generateContent')){
    groundingCalls++;
    assert.equal(opts.headers['x-goog-api-key'],'test-gemini-key');
    return Response.json({candidates:[{content:{parts:[{text:'Публичные данные.'}]},
      groundingMetadata:{groundingChunks:[{web:{uri:'https://source.example/report',title:'Report'}}],
      groundingSupports:[{segment:{text:'Публичные данные.'},groundingChunkIndices:[0]}]}}]});
   }
   return Response.json({choices:[{message:{content:'OK'}}]});
  }
 });
 try{
  const owner=(await t.login('fact-owner@example.com')).data;
  const stranger=(await t.login('fact-stranger@example.com')).data;
  const task=(await t.send('/api/task/start',{participants:['openai','gemini'],rounds:2,mode:'judge'},owner.token)).data;
  const input={taskId:task.taskId,prompt:'Анализ бизнеса доставки суши в Великом Новгороде'};
  assert.equal((await t.send('/api/research',input,stranger.token)).status,403);
  assert.equal((await t.send('/api/research',input)).status,401);
  const first=await t.send('/api/research',input,owner.token);
  assert.equal(first.status,200);
  assert.equal(first.data.status,'grounded');
  assert.equal(first.data.sources[0].url,'https://source.example/report');
  assert.equal((await t.send('/api/research',input,owner.token)).status,200);
  assert.equal(groundingCalls,1);
 }finally{await t.close();}
});
test('fact search never calls a Gemini provider proxy and returns an honest unavailable state',async()=>{
 let groundingCalls=0;
 const t=await setup({GEMINI_API_KEY:'proxy-key',GEMINI_MODEL:'gemini-2.5-flash',GEMINI_BASE_URL:'https://ddtnew.com/v1'},{
  upstream:async()=>{groundingCalls++;return Response.json({choices:[{message:{content:'OK'}}]});}
 });
 try{
  const owner=(await t.login('research-proxy@example.com')).data;
  const task=(await t.send('/api/task/start',{participants:['openai','gemini'],rounds:2,mode:'judge'},owner.token)).data;
  const r=await t.send('/api/research',{taskId:task.taskId,prompt:'Рынок стоматологий Москвы'},owner.token);
  assert.equal(r.status,200);assert.equal(r.data.status,'unavailable');
  assert.equal(r.data.sources.length,0);assert.equal(groundingCalls,0);
 }finally{await t.close();}
});
test('fact-check module is served to mobile Quorum webview',async()=>{
 const t=await setup();try{
  const asset=await t.asset('/fact-check.js');
  assert.equal(asset.status,200);assert.match(asset.type,/javascript/);
  assert.match(asset.body,/export function numericClaims/);
 }finally{await t.close();}
});

test('premium 1000-word intermediary is rejected for free users, then allowed after subscription',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'mistral-test',ACCOUNT_DAILY_CALL_LIMIT:'12'});
 try{
  const user=(await t.login('detailed-test@example.com')).data;
  const access=(await t.send('/api/access',undefined,user.token)).data;
  const args={participants:['openai','mistral'],rounds:2,mode:'judge'};
  const started=(await t.send('/api/task/start',args,user.token)).data;
  const ask=async(maxWords,stage='intermediate',step='Первый раунд')=>
   t.send('/api/chat',{...body,provider:'mistral',taskId:started.taskId,maxWords,stage,step},user.token);
  assert.equal((await ask(1000)).status,403);
  assert.equal(t.calls.filter(c=>c.url.includes('mistral')).length,0);
  assert.equal((await ask(300)).status,200);
  assert.equal((await ask(600)).status,200);
  assert.equal((await t.send('/api/admin/billing/grant',{accountRef:access.accountRef,sku:'subscription'},'admin-test-only')).status,200);
  assert.equal((await ask(1000)).status,200);
  const payloads=t.calls.filter(c=>c.url.includes('mistral')).map(c=>JSON.parse(c.options.body));
  assert.deepEqual(payloads.map(p=>p.max_tokens),[1650,2900,4600]);
  assert.equal((await t.send('/api/task/finish',{taskId:started.taskId},user.token)).status,200);
 }finally{await t.close();}
});
test('unavailable source verification never exposes private proxy routing to the end user',async()=>{
 const t=await setup({GEMINI_API_KEY:'proxy-key',GEMINI_MODEL:'gemini-2.5-flash',GEMINI_BASE_URL:'https://ddtnew.com/v1'});
 try{
  const user=(await t.login('hidden-proxy@example.com')).data;
  const started=(await t.send('/api/task/start',{participants:['openai','gemini'],rounds:2,mode:'judge'},user.token)).data;
  const answer=await t.send('/api/research',{taskId:started.taskId,prompt:'Анализ рынка недвижимости в городе'},user.token);
  assert.equal(answer.status,200);
  assert.equal(answer.data.status,'unavailable');
  assert.doesNotMatch(JSON.stringify(answer.data),/прокси|ddtnew|api[-_ ]key/i);
 }finally{await t.close();}
});

test('Qwen 3.8 Flash and DeepSeek use separate DDT keys and routes safely',async()=>{
 const t=await setup({
  NEW_API_KEY:'ddt-deepseek-secret',QWEN_CHINESE_API_KEY:'ddt-chinese-secret',
  QWEN_MODEL:'qwen3.8-flash',DEEPSEEK_MODEL:'deepseek-v4.1-flash',
  QWEN_BASE_URL:'https://ddtnew.com/v1',DEEPSEEK_BASE_URL:'https://ddtnew.com/v1',
  ACCOUNT_DAILY_CALL_LIMIT:'10'
 });
 try{
  const config=(await t.send('/api/config')).data;
  assert.deepEqual(config.providers,['openai','qwen','deepseek']);
  assert.ok(!JSON.stringify(config).includes('ddt-shared-secret'));
  const user=(await t.login('both-new-models@example.com')).data;
  const task=(await t.send('/api/task/start',{
   participants:['openai','qwen','deepseek'],rounds:2,mode:'judge'
  },user.token)).data;
  for(const provider of ['qwen','deepseek']){
   const result=await t.send('/api/chat',{provider,taskId:task.taskId,stage:'intermediate',step:'Первый раунд',
    maxWords:300,messages:[{role:'user',content:'Explain briefly'}]},user.token);
   assert.equal(result.status,200);
   assert.equal(result.data.text,'OK');
  }
  assert.equal(t.calls.length,2);
  assert.ok(t.calls.every(c=>c.url==='https://ddtnew.com/v1/chat/completions'));
  assert.deepEqual(t.calls.map(c=>c.options.headers.Authorization),['Bearer ddt-chinese-secret','Bearer ddt-deepseek-secret']);
  assert.deepEqual(t.calls.map(c=>JSON.parse(c.options.body).model),['qwen3.8-flash','deepseek-v4.1-flash']);
  assert.equal((await t.send('/api/task/finish',{taskId:task.taskId},user.token)).status,200);
  const prices=(await t.send('/api/admin',undefined,'admin-test-only')).data;
  assert.ok(JSON.stringify(prices).includes('qwen3.8-flash'));
  assert.ok(JSON.stringify(prices).includes('deepseek-v4.1-flash'));
 }finally{await t.close();}
});
test('shared DDT key is never forwarded to an official provider endpoint, nor enabled without model config',async()=>{
 const t=await setup({
  NEW_API_KEY:'ddt-only-secret',
  QWEN_MODEL:'qwen3.7-plus',DEEPSEEK_MODEL:'deepseek-v4.1-flash'
 });
 try{
  const config=(await t.send('/api/config')).data;
  assert.deepEqual(config.providers,['openai']);
 }finally{await t.close();}
 const t2=await setup({NEW_API_KEY:'ddt-only-secret',QWEN_BASE_URL:'https://ddtnew.com/v1',DEEPSEEK_BASE_URL:'https://ddtnew.com/v1'});
 try{assert.deepEqual((await t2.send('/api/config')).data.providers,['openai']);}
 finally{await t2.close();}
});
test('reject unapproved URLs for new providers rather than leaking shared keys',()=>{
 assert.throws(()=>createServer({env:{QWEN_BASE_URL:'https://evil.invalid/v1'}}),/Invalid qwen base URL/);
 assert.throws(()=>createServer({env:{DEEPSEEK_BASE_URL:'https://evil.invalid/v1'}}),/Invalid deepseek base URL/);
});

test('Qwen Chinese-group key is mandatory; NEW_API_KEY alone does not enable Qwen',async()=>{
 const t=await setup({NEW_API_KEY:'deepseek-only',QWEN_MODEL:'qwen3.8-flash',DEEPSEEK_MODEL:'deepseek-v4.1-flash',QWEN_BASE_URL:'https://ddtnew.com/v1',DEEPSEEK_BASE_URL:'https://ddtnew.com/v1'});
 try{assert.deepEqual((await t.send('/api/config')).data.providers,['openai','deepseek']);}finally{await t.close();}
});

test('Telegram and email histories merge only after proving both accounts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-linked-history-api-'));
 const botToken='test-bot-token';
 const t=await setup({HISTORY_FILE:join(dir,'history.json'),ACCOUNTING_FILE:join(dir,'accounting.json'),
  TELEGRAM_BOT_TOKEN:botToken,TELEGRAM_APP_URL:'https://cityai.site/quorum/',MISTRAL_API_KEY:'test-mistral',MISTRAL_MODEL:'test'});
 const signTelegram=(userId)=>{
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:userId,first_name:'Test'})});
  const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  params.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
  return params.toString();
 };
 try{
  const email=(await t.login('link@example.com')).data;
  assert.equal((await t.send('/api/email/password/set',{password:'Some-very-strong-password-123'},email.token)).status,200);
  const telegram=(await t.send('/api/telegram/auth',{initData:signTelegram(123456)})).data;
  const outsider=(await t.login('outsider@example.com')).data;
  for(const token of [telegram.token,email.token]){
   const account=(await t.send('/api/access',undefined,token)).data;
   assert.equal((await t.send('/api/admin/billing/grant',{accountRef:account.accountRef,sku:'subscription'},'admin-test-only')).status,200);
  }
  async function record(token,prompt){
   const start=await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},token);
   assert.equal(start.status,200);
   const taskId=start.data.taskId;
   assert.equal((await t.send('/api/chat',{provider:'openai',taskId,messages:[{role:'user',content:prompt}]},token)).status,200);
   const end=await t.send('/api/task/finish',{taskId,history:{prompt,messages:[{name:'ИИ',stage:'Итог',text:'Ответ'}]}},token);
   assert.equal(end.status,200);assert.equal(end.data.historySaved,true);
   return taskId;
  }
  const tgTask=await record(telegram.token,'Задача Telegram');
  await record(email.token,'Задача Email');
  assert.equal((await t.send('/api/history',undefined,email.token)).data.total,1);
  assert.equal((await t.send('/api/history',undefined,telegram.token)).data.total,1);
  assert.equal((await t.send('/api/history/link',undefined,email.token)).data.linked,false);
  assert.equal((await t.send('/api/history/link',{email:'link@example.com',password:'wrong-password'},telegram.token)).status,401);
  assert.equal((await t.send('/api/history/link',{email:'link@example.com',password:'Some-very-strong-password-123'},telegram.token)).status,200);
  assert.equal((await t.send('/api/history/link',undefined,email.token)).data.linked,true);
  assert.equal((await t.send('/api/history',undefined,email.token)).data.total,2);
  assert.equal((await t.send('/api/history',undefined,telegram.token)).data.total,2);
  assert.equal((await t.send('/api/history/'+tgTask,undefined,email.token)).status,200);
  assert.equal((await t.send('/api/history',undefined,outsider.token)).data.total,0);
  assert.equal((await t.send('/api/history/link',{initData:'forged'},outsider.token)).status,400);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});
