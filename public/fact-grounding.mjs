// Optional first-party Gemini search grounding. No arbitrary URL fetching / SSRF.
// If the configured Gemini route is a third-party proxy, do not send this request.
export async function groundTask({task,key,model='gemini-2.5-flash',fetchImpl=fetch,signal}={}){
 if(!key)return {status:'unavailable',reason:'Gemini Search не настроен',sources:[],facts:[]};
 if(!/^gemini-(?:2\.5|3|4)[-a-z0-9.]*$/i.test(model))model='gemini-2.5-flash';
 const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
 const prompt=[
  'Исследовательская справка по публичным данным. Используй поиск Google. Не выдумывай данные.',
  'Проверь компанию/сайт/рынок из задачи. Дай 5–8 лаконичных утверждений, только если сведения действительно найдены в открытых источниках.',
  'Ни в коем случае не подставляй рыночные ориентиры как показатели этой компании.',
  'Для каждого утверждения укажи актуальность по дате, регион и названия компаний.',
  'Если проверить нельзя — скажи, что информация не найдена.',
  'ЗАДАЧА: '+String(task||'').slice(0,1400)
 ].join('\n');
 let result;
 try{
  const r=await fetchImpl(endpoint,{
   method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},
   body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{googleSearch:{}}],generationConfig:{temperature:0.1,maxOutputTokens:1800}}),
   signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(75000)])
  });
  if(!r.ok){await r.body?.cancel();return {status:'unavailable',reason:'Поиск Google недоступен (HTTP '+r.status+')',sources:[],facts:[]};}
  result=await r.json();
 }catch{return {status:'unavailable',reason:'Не удалось проверить открытые источники',sources:[],facts:[]};}
 const candidate=result?.candidates?.[0],metadata=candidate?.groundingMetadata;
 const raw=(candidate?.content?.parts||[]).filter(p=>typeof p.text==='string').map(p=>p.text).join('\n');
 const all=(metadata?.groundingChunks||[]).map((chunk,index)=>{
  const url=chunk?.web?.uri||'';
  let safe=false;try{const parsed=new URL(url);safe=parsed.protocol==='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname);}catch{}
  return safe?{id:index+1,title:String(chunk.web.title||'Источник').slice(0,140),url:url.slice(0,1500)}:null;
 });
 const sources=all.filter(Boolean).slice(0,12);
 const facts=[];
 for(const item of metadata?.groundingSupports||[]){
  const text=String(item?.segment?.text||raw.slice(item?.segment?.startIndex||0,item?.segment?.endIndex||0)).replace(/\s+/g,' ').trim();
  const sourceIds=[...new Set((item?.groundingChunkIndices||[]).map(x=>all[x]?.id).filter(Boolean))];
  if(text.length<15||!sourceIds.length)continue;
  facts.push({text:text.slice(0,400),sourceIds});
  if(facts.length>=10)break;
 }
 if(!sources.length||!facts.length)return {status:'unavailable',reason:'Поиск не предоставил ссылок на конкретные утверждения',sources:[],facts:[]};
 // Search suggestions are rendered in a sandboxed frame by the client if returned.
 const searchWidget=String(metadata?.searchEntryPoint?.renderedContent||'').slice(0,25000);
 return {status:'grounded',sources,facts,searchWidget};
}
