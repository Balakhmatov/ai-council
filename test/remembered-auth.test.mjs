import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../server.mjs';
import {createSessionStore,createTelegramBrowserLogin,SESSION_LIFETIME} from '../auth-sessions.mjs';
import {loadRememberedSession,rememberSession,forgetSession} from '../public/auth-state.js';

async function setup(env){
 let code;const messages=[];
 const server=createServer({env,emailFetchImpl:async(url,options)=>{code=JSON.parse(options.body).text.match(/\d{6}/)[0];return Response.json({id:'ok'});},fetchImpl:async(url,options)=>{
  if(url.endsWith('/getMe'))return Response.json({ok:true,result:{username:'QuorumTestBot'}});
  messages.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:1}});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const send=async(path,body,headers={})=>{
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
 };
 return {send,messages,code:()=>code,close:()=>new Promise(resolve=>server.close(resolve))};
}
const env={PROXY_TOKEN:'private-auth-test',RESEND_API_KEY:'mail-test',EMAIL_FROM:'login@example.com',TELEGRAM_BOT_TOKEN:'12345:fake-test',TELEGRAM_WEBHOOK_SECRET:'test-webhook',TELEGRAM_APP_URL:'https://cityai.site/quorum/'};

test('email confirmation survives refresh and server restart; logout remains revoked after another restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-auth-'));const config={...env,SESSION_FILE:join(dir,'sessions.enc')};
 let t=await setup(config);
 try{
  await t.send('/api/email/request',{email:'user@example.com'});
  const login=await t.send('/api/email/verify',{email:'user@example.com',code:t.code()});
  assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/Secure/);assert.match(login.cookie,/SameSite=Lax/);
  assert.ok(login.data.expires>Date.now()+SESSION_LIFETIME-10000);
  const cookie=login.cookie.split(';')[0];
  assert.equal((await t.send('/api/auth/session',undefined,{Cookie:cookie})).status,200);
  const disk=readFileSync(config.SESSION_FILE,'utf8');assert(!disk.includes(login.data.token));assert(!disk.includes('user@example.com'));
  assert.equal(statSync(config.SESSION_FILE).mode&0o777,0o600);
  await t.close();t=await setup(config);
  const restored=await t.send('/api/auth/session',undefined,{Cookie:cookie});
  assert.equal(restored.status,200);assert.equal(restored.data.user.email,'user@example.com');assert.equal(restored.data.isAdmin,false);
  assert.equal((await t.send('/api/auth/session',undefined,{Authorization:'Bearer '+login.data.token})).status,200);
  assert.equal((await t.send('/api/logout',{}, {Cookie:cookie,Origin:'https://evil.example'})).status,403);
  const logout=await t.send('/api/logout',{}, {Cookie:cookie});assert.equal(logout.status,200);assert.match(logout.cookie,/Max-Age=0/);
  await t.close();t=await setup(config);
  assert.equal((await t.send('/api/auth/session',undefined,{Cookie:cookie})).status,401);
 }finally{await t.close();rmSync(dir,{recursive:true,force:true});}
});

test('browser Telegram login needs explicit private bot confirmation and browser secret; consume is single use',async()=>{
 const t=await setup(env);const secretHeaders={'X-Telegram-Bot-Api-Secret-Token':'test-webhook'};
 const update=(id,user,text)=>({update_id:id,message:{from:{id:user,first_name:'User'},chat:{type:'private',id:user},text}});
 try{
  const start=await t.send('/api/telegram/login/start',{});assert.equal(start.status,200);assert.match(start.data.url,/^https:\/\/t.me\/QuorumTestBot\?start=login_/);
  const {id,secret,code}=start.data;
  assert.equal((await t.send('/api/telegram/login/poll',{id,secret})).data.pending,true);
  assert.equal((await t.send('/api/telegram/login/poll',{id,secret:'wrong'})).status,410);
  assert.equal((await t.send('/api/telegram/webhook',update(1,100,'/start login_'+id))).status,403);
  await t.send('/api/telegram/webhook',update(1,100,'/start login_'+id),secretHeaders);
  assert.match(t.messages.at(-1).text,new RegExp(code));
  assert.equal((await t.send('/api/telegram/login/poll',{id,secret})).data.pending,true);
  await t.send('/api/telegram/webhook',update(2,200,'Подтвердить вход: '+code),secretHeaders);
  assert.equal((await t.send('/api/telegram/login/poll',{id,secret})).data.pending,true);
  await t.send('/api/telegram/webhook',update(3,100,'Подтвердить вход: '+code),secretHeaders);
  const login=await t.send('/api/telegram/login/poll',{id,secret});assert.equal(login.status,200);assert.equal(login.data.user.id,100);assert.equal(login.data.isAdmin,false);assert.match(login.cookie,/HttpOnly/);
  assert.equal((await t.send('/api/telegram/login/poll',{id,secret})).status,410);
  assert.equal((await t.send('/api/auth/session',undefined,{Authorization:'Bearer '+login.data.token})).data.user.id,100);
 }finally{await t.close();}
});

test('Telegram login requests expire and cannot be rebound to a different user',()=>{
 let now=0;const login=createTelegramBrowserLogin({now:()=>now});const item=login.start();
 assert.equal(login.begin(item.id,{id:1}),item.code);assert.equal(login.begin(item.id,{id:2}),null);
 assert.equal(login.approve(item.code,{id:2}),false);
 now=300001;assert.throws(()=>login.inspect(item.id,item.secret),/истёк/);
});

test('session disk tampering fails closed; expiry removes authentication',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-auth-expiry-'));const config={PROXY_TOKEN:'test',SESSION_FILE:join(dir,'sessions.enc')};let now=0;
 try{
  let store=createSessionStore({env:config,now:()=>now});store.set('a'.repeat(64),{emailUser:{id:'test',email:'test@example.com'},expires:100});
  assert.throws(()=>createSessionStore({env:{...config,PROXY_TOKEN:'different'}}),/unreadable/);
  now=101;store=createSessionStore({env:config,now:()=>now});assert.equal(store.size,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('browser restores both email and Telegram identities and clears legacy data on logout',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 for(const user of [{email:'user@example.com'},{id:123,firstName:'Telegram user'}]){
  const identity={token:'remembered',expires:1000,user};rememberSession(storage,identity);
  assert.deepEqual(loadRememberedSession(storage,100),identity);assert.equal(loadRememberedSession(storage,1001),null);
  forgetSession(storage);assert.equal(loadRememberedSession(storage,100),null);
 }
 storage.setItem('quorum-email-session',JSON.stringify({token:'old',expires:1000,user:{email:'old@example.com'}}));
 assert.equal(loadRememberedSession(storage,100).token,'old');forgetSession(storage);assert.equal(values.size,0);
});
