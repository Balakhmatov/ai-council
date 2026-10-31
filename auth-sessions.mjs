import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';

export const SESSION_LIFETIME=365*86400000;
// Authenticated sessions survive process restarts. The store contains personal
// identity and bearer tokens, so encrypt it with the server's private auth secret.
export function createSessionStore({env,now=Date.now}){
 const file=env.SESSION_FILE;
 const key=crypto.createHash('sha256').update('quorum-sessions-v1\0'+(env.PROXY_TOKEN||'')).digest();
 const sessions=new Map();
 if(file){
  try{
   const saved=JSON.parse(readFileSync(file,'utf8'));
   if(saved.version!==1)throw Error();
   const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(saved.iv,'base64'));
   decipher.setAuthTag(Buffer.from(saved.tag,'base64'));
   const records=JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data,'base64')),decipher.final()]).toString());
   if(!Array.isArray(records)||records.length>10000)throw Error();
   for(const [token,session]of records){
    if(!/^[a-f0-9]{64}$/.test(token)||!Number.isFinite(session?.expires)||!(session.emailUser||session.telegramUser))throw Error();
    if(session.expires>now())sessions.set(token,session);
   }
  }catch(error){if(error.code!=='ENOENT')throw Error('Session store unreadable');}
 }
 function save(){
  if(!file)return;
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify([...sessions])),cipher.final()]);
  const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(temporary,JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600,flag:'wx'});
   renameSync(temporary,file);
  }catch(error){try{unlinkSync(temporary);}catch{}throw Object.assign(Error('Не удалось сохранить вход. Попробуйте позже.'),{status:503});}
 }
 return {
  get size(){return sessions.size;},
  get:token=>sessions.get(token),
  set(token,value){const previous=sessions.get(token);sessions.set(token,value);try{save();}catch(error){if(previous)sessions.set(token,previous);else sessions.delete(token);throw error;}},
  delete(token){const previous=sessions.get(token);if(!previous)return false;sessions.delete(token);try{save();}catch(error){sessions.set(token,previous);throw error;}return true;},
  prune(){let changed=false;for(const [token,session]of sessions)if(session.expires<=now()){sessions.delete(token);changed=true;}if(changed)save();},
 };
}

export function createTelegramBrowserLogin({now=Date.now}={}){
 const pending=new Map();let windowEnd=0,issued=0;
 const prune=()=>{for(const [id,item]of pending)if(item.expires<=now())pending.delete(id);};
 const matches=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
 return {
  start(){
   prune();if(now()>=windowEnd){issued=0;windowEnd=now()+60000;}
   if(pending.size>=1000||issued>=60)throw Object.assign(Error('Слишком много запросов входа. Попробуйте через минуту.'),{status:429});
   issued++;
   const id=crypto.randomBytes(24).toString('base64url'),secret=crypto.randomBytes(32).toString('base64url');
   let code;do{code=String(crypto.randomInt(100000,1000000));}while([...pending.values()].some(p=>p.code===code));
   const item={id,secret,code,expires:now()+300000,user:null,approved:false};pending.set(id,item);
   return {id,secret,code,expires:item.expires};
  },
  begin(id,user){prune();const item=pending.get(id);if(!item||item.user&&item.user.id!==user.id)return null;item.user=user;return item.code;},
  approve(code,user){prune();const item=[...pending.values()].find(p=>p.code===code&&p.user?.id===user.id);if(!item)return false;item.approved=true;return true;},
  inspect(id,secret){prune();const item=pending.get(id);if(!item||!matches(item.secret,secret))throw Object.assign(Error('Запрос входа истёк. Начните заново.'),{status:410});return item.approved?item.user:null;},
  consume(id){pending.delete(id);},
 };
}
