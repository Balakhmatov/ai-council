// Official daily exchange rates. Bank of Russia publishes USD/RUB and CNY/RUB together.
// Fail closed on missing/bad data: never silently invent an exchange rate.
const CBR_URL='https://www.cbr.ru/scripts/XML_daily.asp';
const HOUR=3600000;
export function parseCbrDaily(xml){
 if(typeof xml!=='string'||!/<ValCurs\b/.test(xml))throw Error('CBR XML missing ValCurs');
 const date=xml.match(/<ValCurs\b[^>]*\bDate="([0-9.]+)"/i)?.[1]||null;
 const values={};
 for(const match of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)){
  const block=match[1],code=block.match(/<CharCode>\s*([A-Z]+)\s*<\/CharCode>/)?.[1];
  if(!['USD','CNY'].includes(code))continue;
  const n=Number(block.match(/<Nominal>\s*(\d+)\s*<\/Nominal>/)?.[1]||0);
  const v=Number((block.match(/<Value>\s*([\d,.]+)\s*<\/Value>/)?.[1]||'').replace(',','.'));
  if(!Number.isFinite(v)||v<=0||!Number.isFinite(n)||n<=0)continue;
  values[code]=v/n;
 }
 if(!Number.isFinite(values.USD)||!Number.isFinite(values.CNY)||values.USD<1||values.USD>1000||values.CNY<1||values.CNY>1000)throw Error('Missing USD or CNY CBR rates');
 return {usdRub:values.USD,cnyRub:values.CNY,rateDate:date};
}
export function createFxUpdater({fetchImpl=globalThis.fetch,now=Date.now,load,save}){
 let inFlight=null,lastAttempt=0;
 async function refresh({force=false}={}){
  const old=load();
  if(!force&&old?.fetchedAt&&now()-Date.parse(old.fetchedAt)<6*HOUR)return old;
  if(!force&&now()-lastAttempt<15*60000)return old;
  if(inFlight)return inFlight;
  lastAttempt=now();
  inFlight=(async()=>{
   try{
    const response=await fetchImpl(CBR_URL,{signal:AbortSignal.timeout(8000),headers:{Accept:'text/xml'}});
    if(!response.ok)throw Error('CBR HTTP '+response.status);
    const xml=await response.text();
    if(xml.length>200000)throw Error('CBR response oversized');
    const rates=parseCbrDaily(xml);
    const latest={...rates,fetchedAt:new Date(now()).toISOString(),source:'Банк России'};
    save(latest);
    return latest;
   }catch(e){
    // Keep the last successfully downloaded rate, if available, but signal its age.
    return old||null;
   }finally{inFlight=null;}
  })();
  return inFlight;
 }
 return {refresh};
}
