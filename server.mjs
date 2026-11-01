import http from 'node:http';
import {createEmailAuth} from './email-auth.mjs';
import {createPasswordAuth} from './password-auth.mjs';
import {createSessionStore,createTelegramBrowserLogin,SESSION_LIFETIME} from './auth-sessions.mjs';
import {verifyTelegramInitData,telegramAdminIds,createTelegramWebhook,telegramApi} from './telegram.mjs';
import crypto from 'node:crypto';
import {createEconomy} from './economy.mjs';
import {createHistoryStore} from './history.mjs';
import {createFxUpdater} from './fx.mjs';
import {readFile} from 'node:fs/promises';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const providers={openai:['https://api.openai.com/v1/chat/completions','OPENAI_API_KEY'],grok:['https://api.x.ai/v1/chat/completions','XAI_API_KEY'],mistral:['https://api.mistral.ai/v1/chat/completions','MISTRAL_API_KEY'],qwen:['https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions','QWEN_API_KEY'],deepseek:['https://api.deepseek.com/chat/completions','DEEPSEEK_API_KEY'],gemini:['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions','GEMINI_API_KEY'],claude:['https://api.anthropic.com/v1/messages','CLAUDE_API_KEY']};
export function createServer({env=process.env,fetchImpl=globalThis.fetch,fxFetchImpl=globalThis.fetch,emailFetchImpl=globalThis.fetch,now=Date.now}={}){
 const adminToken=env.PROXY_TOKEN||'';
 const emailAuth=createEmailAuth({env,now,fetchImpl:emailFetchImpl});
 const economy=createEconomy({env,now});
 const history=createHistoryStore({file:env.HISTORY_FILE||'',now});
 const fx=createFxUpdater({fetchImpl:fxFetchImpl,now,load:economy.exchangeRates,save:economy.updateExchangeRates});
 const grokBase=(env.XAI_BASE_URL||'https://api.x.ai/v1').replace(/\/$/,'');
 if(!['https://api.x.ai/v1','https://ddtnew.com/v1'].includes(grokBase))throw Error('Invalid Grok base URL');
 const routes={...providers,grok:[grokBase+'/chat/completions','XAI_API_KEY']};
 for(const [id,official] of [['claude','https://api.anthropic.com/v1'],['gemini','https://generativelanguage.googleapis.com/v1beta/openai']]){
  const base=(env[id.toUpperCase()+'_BASE_URL']||official).replace(/\/$/,'');
  if(![official,'https://ddtnew.com/v1'].includes(base))throw Error(`Invalid ${id} base URL`);
  routes[id]=[base+(id==='claude'?'/messages':'/chat/completions'),providers[id][1]];
 }
 const passwordAuth=createPasswordAuth({env,now});
 const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const keyFor=id=>env[routes[id]?.[1]]||(id==='grok'?env.GROK_API_KEY:'');
 const models=Object.fromEntries(Object.keys(routes).filter(id=>keyFor(id)&&env[id.toUpperCase()+'_MODEL']).map(id=>[id,env[id.toUpperCase()+'_MODEL']]));
 const sessions=createSessionStore({env,now}),browserLogin=createTelegramBrowserLogin({now});
 // Owner privileges are granted only for a server-configured identity that
 // successfully authenticated through Telegram or a verified email account.
 const adminTelegramIds=telegramAdminIds(env);
 // Use the existing verified owner address even if the VPS env file was
 // created before QUORUM_ADMIN_EMAILS was introduced. Only a real, authenticated
 // email session can match this; a client-supplied header cannot grant ownership.
 const adminEmails=new Set([...String(env.QUORUM_ADMIN_EMAILS||'').split(/[\s,;]+/),
   'ilya.balahmatov@gmail.com']
  .map(x=>x.trim().toLowerCase())
  // Revoke the mistyped address provisioned by an earlier release.
  .filter(x=>x!=='ilya.balakhmatov@gmail.com'&&/^\S+@[^\s@]+\.[^\s@]+$/.test(x)));
 const isOwnerAccount=value=>!!(value&&(
  (value.telegramUser&&adminTelegramIds.has(String(value.telegramUser.id)))||
  (value.emailUser&&adminEmails.has(String(value.emailUser.email||'').trim().toLowerCase()))
 ));
 const handleTelegram=createTelegramWebhook({env,fetchImpl,browserLogin});
 const issuance=new Map(),accountActive=new Map();let active=0,authFailures=new Map();
 let botUsername='';
 const botName=async()=>{if(!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)){const me=await telegramApi(env.TELEGRAM_BOT_TOKEN,'getMe',{},fetchImpl);if(!/^[A-Za-z0-9_]{5,32}$/.test(me?.username))throw Error('Telegram bot unavailable');botUsername=me.username;}return botUsername;};
 const dailyLimit=Number(env.PUBLIC_DAILY_LIMIT||3000),accountLimit=Number(env.ACCOUNT_DAILY_CALL_LIMIT||60),paidAccountLimit=Number(env.PAID_DAILY_CALL_LIMIT||700);
 let ledger={day:'',total:0,accounts:{}};
 if(env.QUOTA_FILE){try{ledger=JSON.parse(readFileSync(env.QUOTA_FILE,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Quota state unreadable');}}
 ledger.accounts=ledger.accounts||{};delete ledger.ips;
 const save=()=>{if(env.QUOTA_FILE){writeFileSync(env.QUOTA_FILE+'.tmp',JSON.stringify(ledger),{mode:0o600});renameSync(env.QUOTA_FILE+'.tmp',env.QUOTA_FILE);}};
 const resetDay=()=>{const day=new Date(now()).toISOString().slice(0,10);if(ledger.day!==day)ledger={day,total:0,accounts:{}};};
 const tokenEquals=value=>{const a=Buffer.from(value),b=Buffer.from(adminToken);return !!b.length&&a.length===b.length&&crypto.timingSafeEqual(a,b);};
 return http.createServer(async(req,res)=>{
  const path=req.url?.split('?')[0];const origin=req.headers.origin;
  const originOK=!origin||origin===`http://${req.headers.host}`||allowed.includes(origin);
  if(origin&&originOK){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const fail=(code,message)=>json(code,{error:{message}});
  const readBody=async(limit=150000)=>{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>limit)throw Error('body too large');}return JSON.parse(raw||'{}');};
  if(path==='/healthz'&&req.method==='GET'){
   let revision=null;
   try{
    const value=readFileSync('/var/lib/quorum/deployed-revision','utf8').trim();
    if(/^[0-9a-f]{40}$/.test(value))revision=value;
   }catch{}
   return json(200,{ok:true,revision});
  }
  if(path==='/api/telegram/webhook'){
   if(req.method!=='POST')return fail(405,'Нужен POST');
   const provided=Buffer.from(String(req.headers['x-telegram-bot-api-secret-token']||'')),expected=Buffer.from(env.TELEGRAM_WEBHOOK_SECRET||'');
   if(!env.TELEGRAM_BOT_TOKEN||!expected.length||provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return fail(403,'Доступ запрещён');
   let update;try{update=await readBody(64000);}catch{return fail(400,'Некорректное обновление');}
   try{await handleTelegram(update);return json(200,{ok:true});}catch{return fail(502,'Telegram временно недоступен');}
  }
  if(path?.startsWith('/api/')){
   if(!originOK)return fail(403,'Origin запрещён');
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST'});return res.end();}
   if(!adminToken)return fail(503,'Сервис временно не настроен');
   const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('quorum_session='))?.slice(15)||'';
   const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'')||cookie;
   const session=sessions.get(bearer);const validSession=session&&session.expires>now()&&!!(session.telegramUser||session.emailUser);
   const isAdmin=tokenEquals(bearer)||(validSession&&isOwnerAccount(session));
   const sessionCookie=(token,expires)=>res.setHeader('Set-Cookie','quorum_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+Math.max(0,Math.floor((expires-now())/1000))+(String(env.TELEGRAM_APP_URL||'').startsWith('https:')?'; Secure':''));
   const sessionIdentity=(value,token)=>({...(token?{token}:{}),expires:value.expires,user:value.emailUser?{email:value.emailUser.email}:value.telegramUser,isAdmin:isOwnerAccount(value)});
   const issueSession=value=>{sessions.prune();if(sessions.size>=10000)throw Object.assign(Error('Слишком много подключений. Повторите позже.'),{status:429});const token=crypto.randomBytes(32).toString('hex');value.expires=now()+SESSION_LIFETIME;sessions.set(token,value);sessionCookie(token,value.expires);return sessionIdentity(value,token);};
   const visitorHash=validSession&&(session.telegramUser||session.emailUser)?'account:'+crypto.createHmac('sha256',adminToken).update(session.telegramUser?'telegram:'+session.telegramUser.id:'email:'+session.emailUser.id).digest('hex').slice(0,32):null;
   if(path==='/api/auth/session'&&req.method==='GET'){
    if(!validSession)return fail(401,'Войдите в аккаунт.');
    return json(200,sessionIdentity(session));
   }
   if(path==='/api/telegram/login/start'&&req.method==='POST'){
    if(!env.TELEGRAM_BOT_TOKEN)return fail(503,'Вход через Telegram пока не настроен.');
    try{const username=await botName(),login=browserLogin.start();return json(200,{...login,url:'https://t.me/'+username+'?start=login_'+login.id});}
    catch(error){return fail(error.status||503,error.status?error.message:'Telegram временно недоступен. Попробуйте позже.');}
   }
   if(path==='/api/telegram/login/poll'&&req.method==='POST'){
    try{const body=await readBody(1000),user=browserLogin.inspect(body.id,body.secret);if(!user)return json(200,{pending:true});const identity=issueSession({telegramUser:user});browserLogin.consume(body.id);return json(200,identity);}
    catch(error){return fail(error.status||400,error.status?error.message:'Не удалось завершить вход. Попробуйте заново.');}
   }
   if(path==='/api/email/config'&&req.method==='GET')return json(200,{enabled:emailAuth.enabled,passwordLogin:true});
   if(path==='/api/email/password/login'&&req.method==='POST'){
    try{const body=await readBody(3000),user=await passwordAuth.login(body.email,body.password);
     return json(200,issueSession({emailUser:user}));
    }catch(e){return fail(e.status||400,e.status?e.message:'Не удалось выполнить вход.');}
   }
   if(path==='/api/email/password/set'&&req.method==='POST'){
    if(!validSession||!session.emailUser||!session.emailVerifiedAt||now()-session.emailVerifiedAt>600000)return fail(403,'Для установки или восстановления пароля подтвердите email кодом.');
    try{const body=await readBody(3000);
     const result=await passwordAuth.set(session.emailUser.email,body.password);
     session.emailVerifiedAt=0;sessions.set(bearer,session);
     return json(200,result);
    }catch(e){return fail(e.status||400,e.status?e.message:'Не удалось установить пароль.');}
   }
   if(['/api/email/request','/api/email/verify'].includes(path)&&req.method==='POST'){
    try{
     const body=await readBody(2000);
     if(path.endsWith('/request'))return json(200,await emailAuth.request(body.email));
     const user=emailAuth.verify(body.email,body.code);
     return json(200,issueSession({emailUser:user,emailVerifiedAt:now()}));
    }catch(e){return fail(e.status||400,e.status?e.message:'Некорректный запрос');}
   }
   if(path==='/api/telegram/auth'&&req.method==='POST'){
    if(!env.TELEGRAM_BOT_TOKEN)return fail(503,'Telegram-бот пока не подключён');
    let user;try{const body=await readBody(24000);user=verifyTelegramInitData(body.initData,env.TELEGRAM_BOT_TOKEN,{now:now()});}catch{return fail(401,'Не удалось подтвердить Telegram-аккаунт. Откройте приложение из бота заново.');}
    const loginId='telegram:'+user.id;
    const issued=issuance.get(loginId);if(issued&&issued.until>now()&&issued.count>=20)return fail(429,'Слишком много подключений. Повторите позже.');
    issuance.set(loginId,{count:issued&&issued.until>now()?issued.count+1:1,until:issued&&issued.until>now()?issued.until:now()+3600000});
    try{return json(200,issueSession({telegramUser:user}));}catch(error){return fail(error.status||503,error.message);}
   }
   if(path==='/api/logout'&&req.method==='POST'){try{sessions.delete(bearer);sessionCookie('',now());return json(200,{ok:true});}catch{return fail(503,'Не удалось завершить выход. Попробуйте ещё раз.');}}
   if(path==='/api/config'&&req.method==='GET')return json(200,{providers:Object.keys(models),authRequired:true,catalog:economy.catalog(),telegramUrl:/^[A-Za-z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME||'')?'https://t.me/'+env.TELEGRAM_BOT_USERNAME+'?startapp':null});
   if(path==='/api/admin'&&req.method==='GET'){
    const entry=authFailures.get('admin');if(entry&&entry.until>now()&&entry.count>=10)return fail(429,'Слишком много попыток входа. Повторите через 15 минут.');
    if(!isAdmin){authFailures.set('admin',{count:entry?.until>now()?entry.count+1:1,until:entry?.until>now()?entry.until:now()+900000});return fail(401,'Неверный код администратора');}
    authFailures.delete('admin');
    await fx.refresh();
    resetDay();
    return json(200,{providers:Object.keys(routes).map(id=>({id,configured:!!models[id],model:models[id]||null})),
      usage:{requestsToday:ledger.total,dailyLimit,perAccountDailyLimit:accountLimit,paidAccountDailyLimit:paidAccountLimit},accounting:economy.summary(models)});

   }
   if(path==='/api/session')return fail(401,'Войдите через Telegram или email.');

   if(path==='/api/access'&&req.method==='GET'){
    if(!isAdmin&&!validSession)return fail(401,'Сессия истекла.');
    return json(200,economy.access(visitorHash,isAdmin));
   }
   if(path==='/api/history'&&req.method==='GET'){
    if(!validSession||!visitorHash)return fail(401,'Войдите в аккаунт.');
    const q=new URL(req.url,'http://localhost').searchParams;
    return json(200,history.list(visitorHash,{offset:q.get('offset')||0,limit:q.get('limit')||20}));
   }
   if(path?.startsWith('/api/history/')&&req.method==='GET'){
    if(!validSession||!visitorHash)return fail(401,'Войдите в аккаунт.');
    const id=path.slice('/api/history/'.length);
    if(!/^[0-9a-f]{48}$/.test(id))return fail(400,'Некорректный идентификатор');
    const item=history.get(visitorHash,id);
    return item?json(200,item):fail(404,'Задача не найдена');
   }
   if(path==='/api/admin/billing/grant'&&req.method==='POST'){
    if(!isAdmin)return fail(403,'Доступ запрещён');
    let body;try{body=await readBody(2000);}catch{return fail(400,'Некорректные параметры');}
    try{return json(200,{access:economy.grant(body.accountRef,body.sku)});}
    catch(e){return fail(400,e.message);}
   }
   if(path==='/api/task/start'&&req.method==='POST'){
    if(!isAdmin&&!validSession)return fail(401,'Сессия истекла.');
    let info;try{info=await readBody(15000);}catch{return fail(400,'Некорректная задача');}
    await fx.refresh();
    const task=economy.start(visitorHash,isAdmin,info,Object.keys(models));
    if(!task)return fail(400,'Некорректные параметры задачи');
    if(task.upgradeRequired)return fail(403,'Больше трёх моделей доступны по подписке.');
    if(task.insufficient)return fail(402,'Лимит задач исчерпан. Дождитесь обновления бесплатного лимита или пополните пакет задач.');
    return json(200,task);
   }
   if(path==='/api/task/finish'&&req.method==='POST'){
    if(!isAdmin&&!validSession)return fail(401,'Сессия истекла.');
    let info;try{info=await readBody(800000);}catch{return fail(400,'Некорректная задача');}
    const entitlement=economy.activeTaskAccess(info.taskId,visitorHash);
    if(!entitlement)return fail(404,'Задача не найдена');
    let historySaved=false;
    if(entitlement.historyEnabled&&entitlement.successful>0&&info.history){
     try{historySaved=!!history.record(visitorHash,info.taskId,info.history);}
     catch(e){return fail(400,e.message);}
    }
    const closed=economy.finish(info.taskId,visitorHash);
    return closed?json(200,{...closed,historySaved}):fail(404,'Задача не найдена');
   }
   if(path==='/api/admin/logs'&&req.method==='GET'){
    if(!isAdmin)return fail(403,'Доступ запрещён');
    const q=new URL(req.url,'http://localhost').searchParams;
    const provider=q.get('provider')||'';
    const taskId=q.get('taskId')||'';
    if(provider&&!Object.hasOwn(routes,provider))return fail(400,'Некорректная модель');
    if(taskId&&!/^[0-9a-f]{48}$/.test(taskId))return fail(400,'Некорректный номер обсуждения');
    return json(200,economy.listCalls({
     limit:q.get('limit')||50,offset:q.get('offset')||0,provider,taskId
    }));
   }
   if(path==='/api/admin/exchange-rate'&&req.method==='POST'){
    if(!isAdmin)return fail(403,'Доступ запрещён');
    const rates=await fx.refresh({force:true});
    return json(200,{fx:rates,accounting:economy.summary(models)});
   }
   if(path!=='/api/chat')return fail(404,'Не найдено');
   if(req.method!=='POST')return fail(405,'Нужен POST');
   if(!isAdmin&&!validSession)return fail(401,'Сессия истекла. Запустите обсуждение заново.');
   if(active>=10||(!isAdmin&&(accountActive.get(visitorHash)||0)>=7))return fail(429,'Сервер занят. Повторите позже.');
   let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>150000)return fail(413,'Слишком большой запрос');}}catch{return fail(400,'Ошибка чтения запроса');}
   let body;try{body=JSON.parse(raw);}catch{return fail(400,'Неверный JSON');}
   if(!body||typeof body!=='object'||!Object.hasOwn(models,body.provider)||!Array.isArray(body.messages)||!body.messages.length||body.messages.length>30||body.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))return fail(400,'Модель недоступна или запрос некорректен');
   if(!isAdmin&&!economy.checkCall(body.taskId,visitorHash,body.provider,body.stage))return fail(403,'Запрос не принадлежит активной задаче либо лимит исчерпан');
   if(!isAdmin){resetDay();if(ledger.total>=dailyLimit||(ledger.accounts[visitorHash]||0)>=(economy.access(visitorHash).subscriptionActive?paidAccountLimit:accountLimit))return fail(429,'Лимит API-вызовов на сегодня исчерпан. Попробуйте завтра.');ledger.total++;ledger.accounts[visitorHash]=(ledger.accounts[visitorHash]||0)+1;try{save();}catch{return fail(503,'Сервис временно недоступен');}}
   active++;accountActive.set(visitorHash,(accountActive.get(visitorHash)||0)+1);const controller=new AbortController();res.on('close',()=>controller.abort());
   const callStarted=now();let upstreamLogged=false;
   const log=(model,status,usage=null,httpStatus=null)=>{if(upstreamLogged)return;upstreamLogged=true;try{economy.logCall({taskId:body.taskId,provider:body.provider,model,stage:body.stage,step:body.step,status,usage,httpStatus,durationMs:now()-callStarted});}catch(e){console.error('Quorum accounting failed',e);}};
   try{
    const model=models[body.provider],key=keyFor(body.provider);
    await fx.refresh();
    // The server clock, not the browser or the model's training cutoff, is authoritative.
    const currentUtc=new Date(now()).toISOString();
    const timeContext=`Текущие дата и время: ${currentUtc} (UTC). Это реальное время запроса, а не дата окончания обучения. Не принимай события прошлых лет за текущие. У тебя нет автоматического доступа к свежим новостям: отделяй проверенные факты от предположений и прямо указывай, если актуальность сведений не подтверждена.`;
    const messages=body.messages[0].role==='system'
      ?[{...body.messages[0],content:timeContext+'\n\n'+body.messages[0].content},...body.messages.slice(1)]
      :[{role:'system',content:timeContext},...body.messages];
    // GPT-6 reasoning tokens count towards the completion limit.
    const longFinal=body.stage==='final';
    let payload=body.provider==='openai'&&model.startsWith('gpt-6')
      ?{model,messages,max_completion_tokens:longFinal?10000:4096,reasoning_effort:'medium'}
      :{model,messages,max_tokens:longFinal?7000:1800};
    const headers={'Content-Type':'application/json',Authorization:`Bearer ${key}`};
    if(body.provider==='grok'&&model==='grok-4.7')payload.reasoning_effort='low';
    if(body.provider==='claude'){delete headers.Authorization;headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';payload={model,max_tokens:longFinal?7000:1800,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:messages.filter(m=>m.role!=='system')};}
    const upstream=await fetchImpl(routes[body.provider][0],{method:'POST',redirect:'error',headers,body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(110000)])});
    if(!upstream.ok){log(model,'error',null,upstream.status);await upstream.body?.cancel();return fail(upstream.status,`Модель ${body.provider} сейчас недоступна (HTTP ${upstream.status}). Попробуйте позже или выберите другую.`);}
    const data=await upstream.json();const text=body.provider==='claude'?data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):data.choices?.[0]?.message?.content;
    if(typeof text!=='string'||!text.trim()){log(model,'error',data.usage,502);return fail(502,'Модель вернула пустой ответ');}
    log(model,'ok',data.usage,200);
    economy.success(body.taskId);
    json(200,{text});
   }catch{if(!upstreamLogged)log(models[body.provider],'error',null,502);if(!res.destroyed)fail(502,'Модель не ответила вовремя. Попробуйте позже.');}finally{active--;accountActive.set(visitorHash,Math.max(0,(accountActive.get(visitorHash)||1)-1));}return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const assetFiles=['quorum-logo-v1.png','quorum-icon-192-v1.png','quorum-icon-512-v1.png','apple-touch-icon-v1.png','favicon-32-v1.png','quorum-logo-v2.png','quorum-icon-192-v2.png','quorum-icon-512-v2.png','apple-touch-icon-v2.png','favicon-32-v2.png'];
  const asset=assetFiles.find(name=>path==='/assets/'+name);
  const providerAsset=['openai','grok','mistral','qwen','deepseek','gemini','claude'].find(id=>path==='/assets/models/'+id+'.svg');
  const special=providerAsset?'assets/models/'+providerAsset+'.svg':asset?'assets/'+asset:path==='/favicon.ico'?'favicon.ico':path==='/site.webmanifest'?'site.webmanifest':null;
  const file=special||{'/auth-state.js':'auth-state.js','/telegram-bridge.js':'telegram-bridge.js','/':'index.html','/index.html':'index.html','/style.css':'style.css','/uiux32.css':'uiux32.css','/app.js':'app.js','/engine.js':'engine.js','/profiles.js':'profiles.js','/examples.js':'examples.js'}[path];if(!file){res.writeHead(404);return res.end('Not found');}
  try{const data=await readFile(new URL(`./public/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.ico')?'image/x-icon':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':file.endsWith('.html')||file.endsWith('.js')?'no-store':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(500);res.end('Read error');}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||8787);createServer().listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Кворум: http://localhost:${port}`));}

