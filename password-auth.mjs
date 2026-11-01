import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';

const scrypt=promisify(crypto.scrypt);
const error=(message,status=400)=>Object.assign(Error(message),{status});
export function createPasswordAuth({env,now=Date.now}={}){
 const file=env.PASSWORD_FILE||'';
 const secret=env.PROXY_TOKEN||'';
 if(!secret)throw Error('Missing private auth secret');
 const key=email=>crypto.createHmac('sha256',secret).update(email).digest('hex');
 const entries=Object.create(null);
 if(file){
  try{
   const disk=JSON.parse(readFileSync(file,'utf8'));
   if(disk.version!==1||!disk.entries||typeof disk.entries!=='object')throw Error('Password store invalid');
   for(const [id,entry] of Object.entries(disk.entries)){
    if(!/^[0-9a-f]{64}$/.test(id)||!/^[0-9a-f]{32}$/.test(entry.salt)||!/^[0-9a-f]{128}$/.test(entry.digest))throw Error('Password store invalid');
    entries[id]=entry;
   }
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const limits=new Map();
 function limit(id){
  const time=now(),v=limits.get(id);
  if(limits.size>20000)for(const [k,value] of limits)if(value.until<time)limits.delete(k);
  if(limits.size>20000&&!limits.has(id))throw error('Повторите позже.',429);
  const record=v&&v.until>time?v:{count:0,until:time+3600000};
  if(record.count>=10)throw error('Слишком много попыток. Попробуйте через час.',429);
  record.count++;limits.set(id,record);
 }
 function normalize(raw){
  const email=typeof raw==='string'?raw.trim().toLowerCase():'';
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw error('Введите корректный email.');
  return email;
 }
 function validatePassword(pass){
  if(typeof pass!=='string'||pass.length<10||pass.length>128||Buffer.byteLength(pass,'utf8')>256||!pass.trim()||/[\x00-\x1f]/.test(pass))throw error('Пароль должен содержать от 10 до 128 символов.');
 }
 function persist(){
  if(!file)return;
  const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify({version:1,entries}),{mode:0o600,flag:'wx'});
   renameSync(tmp,file);
  }catch(e){try{unlinkSync(tmp);}catch{}throw error('Не удалось сохранить пароль.',503);}
 }
 async function hash(pass,salt){
  return (await scrypt(pass,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1,maxmem:32*1024*1024})).toString('hex');
 }
 return {
  has(raw){return !!entries[key(normalize(raw))];},
  async set(raw,pass){
   const email=normalize(raw);validatePassword(pass);
   const id=key(email),salt=crypto.randomBytes(16).toString('hex');
   const previous=entries[id];entries[id]={salt,digest:await hash(pass,salt)};
   try{persist();}catch(e){if(previous)entries[id]=previous;else delete entries[id];throw e;}
   return {ok:true};
  },
  async login(raw,pass){
   const email=normalize(raw),id=key(email);limit(id);
   const v=entries[id];
   const digest=await hash(typeof pass==='string'&&pass.length<=128?pass:'',v?.salt||'00'.repeat(16));
   const actual=Buffer.from(digest,'hex'),expected=Buffer.from(v?.digest||'00'.repeat(64),'hex');
   if(!v||!crypto.timingSafeEqual(actual,expected))throw error('Неверный email или пароль.',401);
   limits.delete(id);return {id,email};
  }
 };
}
