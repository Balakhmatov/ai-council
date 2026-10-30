import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';

export function verifyTelegramInitData(raw,botToken,{now=Date.now(),maxAgeSeconds=3600}={}) {
 if(!botToken||typeof raw!=='string'||!raw||raw.length>20000)throw Error('Некорректные данные Telegram');
 const fields=new URLSearchParams(raw);const entries=[...fields];
 if(new Set(entries.map(([key])=>key)).size!==entries.length)throw Error('Повторяющиеся поля Telegram');
 const hash=fields.get('hash')||'';if(!/^[a-f0-9]{64}$/i.test(hash))throw Error('Нет подписи Telegram');
 const date=Number(fields.get('auth_date'));const age=Math.floor(now/1000)-date;
 if(!Number.isSafeInteger(date)||age< -30||age>maxAgeSeconds)throw Error('Срок входа Telegram истёк. Откройте приложение заново.');
 fields.delete('hash');const check=[...fields].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
 const expected=crypto.createHmac('sha256',secret).update(check).digest();
 if(!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex')))throw Error('Подпись Telegram неверна');
 let user;try{user=JSON.parse(fields.get('user'));}catch{throw Error('Нет пользователя Telegram');}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot)throw Error('Некорректный пользователь Telegram');
 return {id:user.id,firstName:typeof user.first_name==='string'?user.first_name.slice(0,100):'',username:typeof user.username==='string'?user.username.slice(0,100):''};
}
export function telegramAdminIds(env){return new Set(String(env.TELEGRAM_ADMIN_IDS||'').split(/[\s,]+/).filter(id=>/^\d+$/.test(id)));}
export async function telegramApi(token,method,payload={},fetchImpl=fetch){
 let response;try{response=await fetchImpl(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});}catch{throw Error(`Telegram ${method}: соединение недоступно`);}
 let data;try{data=await response.json();}catch{throw Error(`Telegram ${method}: некорректный ответ`);}
 if(!response.ok||!data.ok)throw Error(`Telegram ${method}: ошибка ${response.status}${data.error_code?' / '+data.error_code:''}`);
 return data.result;
}
export function createTelegramWebhook({env,fetchImpl=fetch}){
 const processed=new Set();const stateFile=env.TELEGRAM_STATE_FILE;
 if(stateFile){try{for(const id of JSON.parse(readFileSync(stateFile,'utf8')))processed.add(id);}catch(e){if(e.code!=='ENOENT')throw Error('Telegram state unreadable');}}
 const inFlight=new Map();
 async function handle(update){
  if(!Number.isSafeInteger(update?.update_id))throw Error('Invalid update');
  if(processed.has(update.update_id))return;
  if(inFlight.has(update.update_id))return inFlight.get(update.update_id);
  const work=(async()=>{
   const message=update.message;
   if(message?.chat?.type==='private'&&typeof message.text==='string'&&Number.isSafeInteger(message.from?.id)){
    const cmd=message.text.trim().split(/\s/)[0].split('@')[0];const admin=telegramAdminIds(env).has(String(message.from.id));
    const url=new URL(env.TELEGRAM_APP_URL);if(url.protocol!=='https:')throw Error('Mini App requires HTTPS');
    let text='Откройте «Кворум», выберите модели и задайте тему. Нейросети обсудят задачу и подготовят итог.';
    if(cmd==='/admin'){
     if(admin){text='Вход администратора «Кворума». В Mini App ваш Telegram-аккаунт будет распознан автоматически.';url.searchParams.set('admin','1');}
     else{text='Раздел администратора доступен только владельцу приложения.';}
    }else if(cmd==='/help')text='Кворум — совет нейросетей.\n\n1. Откройте приложение.\n2. Выберите минимум две модели и формат.\n3. Опишите задачу и запустите обсуждение.\n\n/start — открыть приложение\n/help — помощь';
    const buttons=[[{text:cmd==='/admin'&&admin?'Администрирование':'Открыть Кворум',web_app:{url:url.href}}]];
    if(admin&&cmd!=='/admin'){const adminURL=new URL(env.TELEGRAM_APP_URL);adminURL.searchParams.set('admin','1');buttons.push([{text:'Администрирование',web_app:{url:adminURL.href}}]);}
    await telegramApi(env.TELEGRAM_BOT_TOKEN,'sendMessage',{chat_id:message.chat.id,text,reply_markup:{inline_keyboard:buttons}},fetchImpl);
   }
   processed.add(update.update_id);while(processed.size>500)processed.delete(processed.values().next().value);
   if(stateFile){writeFileSync(stateFile+'.tmp',JSON.stringify([...processed]),{mode:0o600});renameSync(stateFile+'.tmp',stateFile);}
  })();inFlight.set(update.update_id,work);try{await work;}finally{inFlight.delete(update.update_id);}
 }
 return handle;
}
