import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
export function createEmailAuth({env,now=Date.now,fetchImpl=fetch,createTransport=nodemailer.createTransport}){
 const pending=new Map(),limits=new Map();
 const smtpConfigured=!!(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASSWORD&&env.EMAIL_FROM);
 const enabled=smtpConfigured||!!(env.RESEND_API_KEY&&env.EMAIL_FROM);
 const port=Number(env.SMTP_PORT||465);
 if(smtpConfigured&&![465,587].includes(port))throw Error('SMTP_PORT must be 465 or 587');
 const smtp=smtpConfigured?createTransport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,
  auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
  connectionTimeout:15000,greetingTimeout:10000,socketTimeout:15000,
  disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false}):null;
 const hash=s=>crypto.createHmac('sha256',env.PROXY_TOKEN||'').update(s).digest('hex');
 const normalize=s=>typeof s==='string'?s.trim().toLowerCase():'';
 function throttle(key,max){
  for(const [k,v]of limits)if(v.until<=now())limits.delete(k);
  if(limits.size>=20000&&!limits.has(key))throw Object.assign(Error('Повторите позже.'),{status:429});
  const entry=limits.get(key)||{count:0,until:now()+3600000};
  if(entry.until<=now()){entry.count=0;entry.until=now()+3600000;}
  if(entry.count>=max)throw Object.assign(Error('Слишком много попыток. Повторите через час.'),{status:429});
  entry.count++;limits.set(key,entry);
 }
 return {enabled,async request(raw){
  if(!enabled)throw Object.assign(Error('Вход по email пока не настроен.'),{status:503});
  const email=normalize(raw);
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(Error('Введите корректный email.'),{status:400});
  for(const [k,v]of pending)if(v.expires<=now())pending.delete(k);
  for(const [k,v]of limits)if(v.until<=now())limits.delete(k);
  if(limits.size>20000||pending.size>=10000)throw Object.assign(Error('Повторите позже.'),{status:429});
  const id=hash(email);throttle('delivery',100);throttle('email:'+id,5);
  const code=String(crypto.randomInt(100000,1000000));
  const entry={digest:hash(id+':'+code),expires:now()+600000,attempts:0};pending.set(id,entry);
  try{
   const message={from:env.EMAIL_FROM,to:[email],subject:'Код входа в Кворум',text:`Ваш код входа: ${code}\nДействует 10 минут. Если вы не запрашивали вход, проигнорируйте письмо.`};
   if(smtp){
    const result=await smtp.sendMail(message);
    if(!result.accepted?.length||result.rejected?.length)throw Error();
   }else{
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error();
   }
  }catch{if(pending.get(id)===entry)pending.delete(id);throw Object.assign(Error('Не удалось отправить письмо. Попробуйте позже.'),{status:502});}
  return {ok:true};
 },verify(raw,code){
  const email=normalize(raw),id=hash(email),entry=pending.get(id);
  throttle('verify:'+id,30);
  if(!entry||entry.expires<=now()||entry.attempts>=5)throw Object.assign(Error('Код неверен или истёк.'),{status:400});
  entry.attempts++;
  if(typeof code!=='string'||!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(entry.digest),Buffer.from(hash(id+':'+code))))throw Object.assign(Error('Код неверен или истёк.'),{status:400});
  pending.delete(id);return {id,email};
 }};
}
