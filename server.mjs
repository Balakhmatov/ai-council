import http from 'node:http';
import {verifyTelegramInitData,telegramAdminIds,createTelegramWebhook} from './telegram.mjs';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const providers={openai:['https://api.openai.com/v1/chat/completions','OPENAI_API_KEY'],grok:['https://api.x.ai/v1/chat/completions','XAI_API_KEY'],mistral:['https://api.mistral.ai/v1/chat/completions','MISTRAL_API_KEY'],qwen:['https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions','QWEN_API_KEY'],deepseek:['https://api.deepseek.com/chat/completions','DEEPSEEK_API_KEY'],gemini:['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions','GEMINI_API_KEY'],claude:['https://api.anthropic.com/v1/messages','CLAUDE_API_KEY']};
export function createServer({env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}){
 const adminToken=env.PROXY_TOKEN||'';
 const grokBase=(env.XAI_BASE_URL||'https://api.x.ai/v1').replace(/\/$/,'');
 if(!['https://api.x.ai/v1','https://ddtnew.com/v1'].includes(grokBase))throw Error('Invalid Grok base URL');
 const routes={...providers,grok:[grokBase+'/chat/completions','XAI_API_KEY']};
 const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const keyFor=id=>env[routes[id]?.[1]]||(id==='grok'?env.GROK_API_KEY:'');
 const models=Object.fromEntries(Object.keys(routes).filter(id=>keyFor(id)&&env[id.toUpperCase()+'_MODEL']).map(id=>[id,env[id.toUpperCase()+'_MODEL']]));
 const handleTelegram=createTelegramWebhook({env,fetchImpl});
 const sessions=new Map(),issuance=new Map(),ipActive=new Map();let active=0,authFailures=new Map();
 const dailyLimit=Number(env.PUBLIC_DAILY_LIMIT||300),ipLimit=Number(env.PUBLIC_IP_DAILY_LIMIT||60);
 let ledger={day:'',total:0,ips:{}};
 if(env.QUOTA_FILE){try{ledger=JSON.parse(readFileSync(env.QUOTA_FILE,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Quota state unreadable');}}
 const save=()=>{if(env.QUOTA_FILE){writeFileSync(env.QUOTA_FILE+'.tmp',JSON.stringify(ledger),{mode:0o600});renameSync(env.QUOTA_FILE+'.tmp',env.QUOTA_FILE);}};
 const resetDay=()=>{const day=new Date(now()).toISOString().slice(0,10);if(ledger.day!==day)ledger={day,total:0,ips:{}};};
 const tokenEquals=value=>{const a=Buffer.from(value),b=Buffer.from(adminToken);return !!b.length&&a.length===b.length&&crypto.timingSafeEqual(a,b);};
 return http.createServer(async(req,res)=>{
  const path=req.url?.split('?')[0];const origin=req.headers.origin;
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const ip=env.TRUST_PROXY==='true'&&local?String(req.headers['x-real-ip']||req.socket.remoteAddress):String(req.socket.remoteAddress);
  const ipHash=crypto.createHmac('sha256',adminToken||'quorum').update(ip).digest('hex').slice(0,32);
  const originOK=!origin||origin===`http://${req.headers.host}`||allowed.includes(origin);
  if(origin&&originOK){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const fail=(code,message)=>json(code,{error:{message}});
  const readBody=async(limit=150000)=>{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>limit)throw Error('body too large');}return JSON.parse(raw||'{}');};
  if(path==='/healthz'&&req.method==='GET')return json(200,{ok:true});
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
   const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'');
   const session=sessions.get(bearer);const validSession=session&&session.expires>now()&&(session.telegramUser||session.ipHash===ipHash);
   const isAdmin=tokenEquals(bearer)||(validSession&&session.isAdmin===true);
   const visitorHash=validSession&&session.telegramUser?crypto.createHmac('sha256',adminToken).update('telegram:'+session.telegramUser.id).digest('hex').slice(0,32):ipHash;
   if(path==='/api/telegram/auth'&&req.method==='POST'){
    if(!env.TELEGRAM_BOT_TOKEN)return fail(503,'Telegram-бот пока не подключён');
    let user;try{const body=await readBody(24000);user=verifyTelegramInitData(body.initData,env.TELEGRAM_BOT_TOKEN,{now:now()});}catch{return fail(401,'Не удалось подтвердить Telegram-аккаунт. Откройте приложение из бота заново.');}
    for(const [key,value]of sessions)if(value.expires<=now())sessions.delete(key);
    if(sessions.size>=10000)return fail(429,'Слишком много подключений. Повторите позже.');
    const issued=issuance.get(ipHash);if(issued&&issued.until>now()&&issued.count>=20)return fail(429,'Слишком много подключений. Повторите позже.');
    issuance.set(ipHash,{count:issued&&issued.until>now()?issued.count+1:1,until:issued&&issued.until>now()?issued.until:now()+3600000});
    const token=crypto.randomBytes(32).toString('hex'),expires=now()+7200000,isAdmin=telegramAdminIds(env).has(String(user.id));
    sessions.set(token,{ipHash,telegramUser:user,isAdmin,expires});return json(200,{token,expires,user,isAdmin});
   }
   if(path==='/api/logout'&&req.method==='POST'){sessions.delete(bearer);return json(200,{ok:true});}
   if(path==='/api/config'&&req.method==='GET')return json(200,{providers:Object.keys(models)});
   if(path==='/api/admin'&&req.method==='GET'){
    const entry=authFailures.get(ipHash);if(entry&&entry.until>now()&&entry.count>=10)return fail(429,'Слишком много попыток входа. Повторите через 15 минут.');
    if(!isAdmin){authFailures.set(ipHash,{count:entry?.until>now()?entry.count+1:1,until:entry?.until>now()?entry.until:now()+900000});return fail(401,'Неверный код администратора');}
    authFailures.delete(ipHash);resetDay();return json(200,{providers:Object.keys(routes).map(id=>({id,configured:!!models[id],model:models[id]||null})),usage:{requestsToday:ledger.total,dailyLimit,perIpDailyLimit:ipLimit}});
   }
   if(path==='/api/session'&&req.method==='POST'){
    if(!Object.keys(models).length)return fail(503,'Нет доступных моделей');
    resetDay();if(ledger.total>=dailyLimit||(ledger.ips[ipHash]||0)>=ipLimit)return fail(429,'Лимит обсуждений на сегодня исчерпан. Попробуйте завтра.');
    for(const [key,value]of sessions)if(value.expires<=now())sessions.delete(key);
    for(const [key,value]of issuance)if(value.until<=now())issuance.delete(key);
    for(const [key,value]of authFailures)if(value.until<=now())authFailures.delete(key);
    const issued=issuance.get(ipHash)||{count:0,until:now()+3600000};
    if(issued.count>=20||sessions.size>=10000)return fail(429,'Слишком много подключений. Повторите позже.');
    issued.count++;issuance.set(ipHash,issued);const token=crypto.randomBytes(32).toString('hex'),expires=now()+7200000;sessions.set(token,{ipHash,expires});return json(200,{token,expires});
   }
   if(path!=='/api/chat')return fail(404,'Не найдено');
   if(req.method!=='POST')return fail(405,'Нужен POST');
   if(!isAdmin&&!validSession)return fail(401,'Сессия истекла. Запустите обсуждение заново.');
   if(active>=10||(!isAdmin&&(ipActive.get(visitorHash)||0)>=7))return fail(429,'Сервер занят. Повторите позже.');
   let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>150000)return fail(413,'Слишком большой запрос');}}catch{return fail(400,'Ошибка чтения запроса');}
   let body;try{body=JSON.parse(raw);}catch{return fail(400,'Неверный JSON');}
   if(!body||typeof body!=='object'||!Object.hasOwn(models,body.provider)||!Array.isArray(body.messages)||!body.messages.length||body.messages.length>30||body.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))return fail(400,'Модель недоступна или запрос некорректен');
   if(!isAdmin){resetDay();if(ledger.total>=dailyLimit||(ledger.ips[visitorHash]||0)>=ipLimit)return fail(429,'Лимит обсуждений на сегодня исчерпан. Попробуйте завтра.');ledger.total++;ledger.ips[visitorHash]=(ledger.ips[visitorHash]||0)+1;try{save();}catch{return fail(503,'Сервис временно недоступен');}}
   active++;ipActive.set(visitorHash,(ipActive.get(visitorHash)||0)+1);const controller=new AbortController();res.on('close',()=>controller.abort());
   try{
    const model=models[body.provider],key=keyFor(body.provider);let payload={model,messages:body.messages,max_tokens:1600};const headers={'Content-Type':'application/json',Authorization:`Bearer ${key}`};
    if(body.provider==='grok'&&model==='grok-4.7')payload.reasoning_effort='low';
    if(body.provider==='claude'){delete headers.Authorization;headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';payload={model,max_tokens:1600,system:body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:body.messages.filter(m=>m.role!=='system')};}
    const upstream=await fetchImpl(routes[body.provider][0],{method:'POST',redirect:'error',headers,body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(110000)])});
    if(!upstream.ok){await upstream.body?.cancel();return fail(upstream.status,`Модель ${body.provider} сейчас недоступна (HTTP ${upstream.status}). Попробуйте позже или выберите другую.`);}
    const data=await upstream.json();const text=body.provider==='claude'?data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):data.choices?.[0]?.message?.content;
    if(typeof text!=='string'||!text.trim())return fail(502,'Модель вернула пустой ответ');json(200,{text});
   }catch{if(!res.destroyed)fail(502,'Модель не ответила вовремя. Попробуйте позже.');}finally{active--;ipActive.set(visitorHash,Math.max(0,(ipActive.get(visitorHash)||1)-1));}return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const assetFiles=['quorum-logo-v1.png','quorum-icon-192-v1.png','quorum-icon-512-v1.png','apple-touch-icon-v1.png','favicon-32-v1.png'];
  const asset=assetFiles.find(name=>path==='/assets/'+name);
  const special=asset?'assets/'+asset:path==='/favicon.ico'?'favicon.ico':path==='/site.webmanifest'?'site.webmanifest':null;
  const file=special||{'/telegram-bridge.js':'telegram-bridge.js','/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/engine.js':'engine.js'}[path];if(!file){res.writeHead(404);return res.end('Not found');}
  try{const data=await readFile(new URL(`./public/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.ico')?'image/x-icon':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(500);res.end('Read error');}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||8787);createServer().listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Кворум: http://localhost:${port}`));}
