import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {BILLING_CATALOG} from './economy.mjs';

const problem=(message,status=400)=>Object.assign(Error(message),{status});
function trustedURL(value){
 let url;
 try{url=new URL(String(value));}catch{throw problem('Некорректная ссылка оплаты.',502);}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
   !['yookassa.ru','yoomoney.ru'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw problem('Недопустимый платёжный адрес.',502);
 return url.href;
}
export function createPayments({env=process.env,economy,fetchImpl=globalThis.fetch,now=Date.now}){
 const shopId=env.YOOKASSA_SHOP_ID||'',secretKey=env.YOOKASSA_SECRET_KEY||'';
 const ready=Boolean(shopId&&secretKey);
 const filename=env.QUORUM_PAYMENTS_FILE||(env.ACCOUNTING_FILE?env.ACCOUNTING_FILE+'.payments.json':'');
 let state={orders:{}};
 if(filename){
  try{
   const data=JSON.parse(readFileSync(filename,'utf8'));
   if(data&&data.orders&&typeof data.orders==='object')state=data;
  }catch(error){if(error.code!=='ENOENT')throw Error('Payment state unreadable');}
 }
 const locks=new Map();
 const save=()=>{if(filename){writeFileSync(filename+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(filename+'.tmp',filename);}};
 const view=o=>({id:o.id,sku:o.sku,amountRub:o.amountRub,status:o.status,
  paymentUrl:['pending','creating'].includes(o.status)?o.paymentUrl||null:null,applied:!!o.applied});
 const lock=(key,fn)=>{
  if(locks.has(key))return locks.get(key);
  const promise=Promise.resolve().then(fn).finally(()=>locks.delete(key));
  locks.set(key,promise);return promise;
 };
 async function request(path,payload,idempotenceKey){
  if(!ready)throw problem('Оплата СБП пока не настроена.',503);
  let response;
  try{
   response=await fetchImpl('https://api.yookassa.ru/v3/payments'+path,{
    method:payload?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Basic '+Buffer.from(shopId+':'+secretKey).toString('base64'),
      'Content-Type':'application/json',...(idempotenceKey?{'Idempotence-Key':idempotenceKey}:{})},
    body:payload?JSON.stringify(payload):undefined
   });
  }catch{throw problem('Не удалось связаться с ЮKassa. Повторите проверку платежа.',502);}
  if(!response.ok)throw problem('ЮKassa временно не принимает запросы. Повторите попытку.',502);
  try{return await response.json();}catch{throw problem('Некорректный ответ ЮKassa.',502);}
 }
 function verify(o,p){
  if(p.id!==o.providerId||p.amount?.value!==o.amountRub.toFixed(2)||p.amount?.currency!=='RUB'||
    p.metadata?.product!=='quorum'||p.metadata?.order_id!==o.id||
    p.metadata?.account_id!==o.identity||p.metadata?.sku!==o.sku||
    String(p.recipient?.account_id)!==String(shopId)||!['pending','waiting_for_capture','canceled','succeeded'].includes(p.status))
    throw problem('Платёж не прошёл серверную проверку.',502);
  if(p.status==='succeeded'){
   const when=Date.parse(p.captured_at||'');
   if(p.paid!==true||p.test===true||!Number.isFinite(when)||when<o.createdAt-60000||when>now()+60000)
    throw problem('Платёж не подтверждён.',502);
   economy.grantPayment(o.identity,o.sku,'quorum:'+o.id);
   o.applied=true;
  }
  o.status=p.status;
  o.paymentUrl=['pending','waiting_for_capture'].includes(p.status)?o.paymentUrl:null;
  save();return view(o);
 }
 async function sync(o){
  if(!o.providerId){
   if(now()-o.createdAt>=23*3600000)throw problem('Статус платежа уточняется. Напишите в поддержку.',409);
   const payment=await request('',{
    amount:{value:o.amountRub.toFixed(2),currency:'RUB'},capture:true,
    payment_method_data:{type:'sbp'},confirmation:{type:'redirect',return_url:'https://cityai.site/quorum/?payment=return'},
    description:'Кворум: '+BILLING_CATALOG[o.sku].label,
    metadata:{product:'quorum',order_id:o.id,account_id:o.identity,sku:o.sku}
   },o.id);
   if(!payment.id||typeof payment.id!=='string')throw problem('Не получен ID платежа ЮKassa.',502);
   o.providerId=payment.id;
   if(payment.confirmation?.confirmation_url)o.paymentUrl=trustedURL(payment.confirmation.confirmation_url);
   save();return verify(o,payment);
  }
  return verify(o,await request('/'+encodeURIComponent(o.providerId)));
 }
 async function create(identity,sku){
  if(!ready)throw problem('СБП пока не подключена.',503);
  if(!/^account:[a-f0-9]{32}$/.test(identity||''))throw problem('Войдите в аккаунт.',401);
  if(!Object.hasOwn(BILLING_CATALOG,sku))throw problem('Тариф не найден.');
  return lock(identity,async()=>{
   let order=Object.values(state.orders).filter(o=>o.identity===identity&&['creating','pending','waiting_for_capture'].includes(o.status)).sort((a,b)=>b.createdAt-a.createdAt)[0];
   if(order){
    const current=await sync(order);
    if(['creating','pending','waiting_for_capture'].includes(current.status)){
     if(order.sku!==sku)throw problem('Сначала завершите предыдущий платёж или дождитесь его отмены.',409);
     return current;
    }
    if(current.applied&&order.sku===sku)return current;
   }
   const offer=BILLING_CATALOG[sku],id=randomUUID();
   order={id,identity,sku,amountRub:offer.priceRub,createdAt:now(),providerId:null,paymentUrl:null,status:'creating',applied:false};
   state.orders[id]=order;save();
   return sync(order);
  });
 }
 async function refresh(identity){
  if(!ready)return {ready:false,orders:[]};
  return lock(identity,async()=>{
   const orders=Object.values(state.orders).filter(o=>o.identity===identity).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
   for(const o of orders)if(['creating','pending','waiting_for_capture'].includes(o.status)){
    try{await sync(o);}catch(error){if(error.status!==502)throw error;}
   }
   return {ready:true,orders:orders.map(view)};
  });
 }
 return {ready,create,refresh};
}
