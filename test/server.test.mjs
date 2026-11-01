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
test('public config omits secrets; admin requires real authentication',async()=>{const t=await setup();try{const c=await t.send('/api/config');assert.deepEqual(c.data.providers,['openai']);assert.equal(c.data.authRequired,true);assert.equal(c.data.catalog.subscription.tasks,500);assert.equal(c.data.catalog.pack100.priceRub,255);assert.equal(c.data.telegramUrl,null);assert.equal((await t.send('/api/admin')).status,401);const admin=await t.send('/api/admin',undefined,'admin-test-only');assert.equal(admin.status,200);assert.equal(admin.data.providers[0].model,'server-pinned-model');assert(!JSON.stringify(admin.data).includes('private-test-key'));assert.equal((await t.send('/api/chat',body)).status,401);assert.equal((await t.send('/api/session',{},undefined,{Origin:'https://evil.example'})).status,403);}finally{await t.close();}});
test('authenticated account has shared pinned model and call limit across sessions',async()=>{
 const t=await setup({MISTRAL_API_KEY:'m',MISTRAL_MODEL:'test'});
 try{
  const a=await t.login(),b=await t.login();assert.notEqual(a.data.token,b.data.token);
  const task=(await t.send('/api/task/start',{participants:['openai','mistral'],rounds:2,mode:'consensus'},a.data.token)).data;
  for(const token of [a.data.token,b.data.token])assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},token)).status,200);
  assert.equal(JSON.parse(t.calls[0].options.body).model,'server-pinned-model');
  assert.equal((await t.send('/api/chat',{...body,taskId:task.taskId},a.data.token)).status,429);
  assert.equal((await t.send('/api/access',undefined,b.data.token)).data.remainingFreeTasks,9);
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
  const again=await t.login();assert.equal((await t.send('/api/access',undefined,again.data.token)).data.remainingFreeTasks,9);
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
  assert.equal(task.remainingFreeTasks,1);
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
  assert.equal(started.remainingFreeTasks,9);
  await t.send('/api/email/request',{email:'A@example.com'});
  const again=(await t.send('/api/email/verify',{email:'A@example.com',code})).data;
  assert.equal((await t.send('/api/access',undefined,again.token)).data.remainingFreeTasks,9);
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
  assert.equal(task.remainingFreeTasks,9);
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
  assert.equal(grant.data.access.subscriptionRemaining,500);
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
  assert.match(html.body,/uiux32\.css\?v=pricing-fix37/);
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
