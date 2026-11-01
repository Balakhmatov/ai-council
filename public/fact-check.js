// Conservative fact gate: agreement between models is never evidence.
const RESEARCH=/https?:\/\/|(?:\b[\w-]+\.)+(?:ru|com|org|net)\b|(?:анализ|аудит|конкурент|рынок|компани|бренд|статистик|доставк|выручк|продаж|рейтинг|стоимост|ценах|исследован|отраслев)/iu;
export function needsSources(task){
 const t=String(task||'').slice(0,2000);
 return RESEARCH.test(t)&&!/(?:придумай|выдумай|фантастическ|вымышленн|художественн|сказк|фэнтези)/iu.test(t);
}
export function numericClaims(messages,max=12){
 const seen=new Set(),result=[];
 for(const m of messages||[]){
  if(m.error||m.final)continue;
  const body=String(m.text||'').replace(/\r/g,'');
  for(const sentence of body.split(/(?<=[.!?])\s+|\n+/u)){
   const claim=sentence.replace(/^[-*]\s+|^\d+[.)]\s+/,'').replace(/\s+/g,' ').trim();
   if(claim.length<16||claim.length>600)continue;
   if(!/\b\d[\d\s.,–—-]*\s*(?:%|₽|руб|тыс|млн|час|мин|дн|заказ|клиент|год|недел|чек|сек|км)/iu.test(claim))continue;
   const key=claim.toLowerCase().slice(0,140);
   if(seen.has(key))continue;seen.add(key);
   result.push({by:m.name||'Модель',claim:claim.slice(0,360),status:'unverified'});
   if(result.length>=max)return result;
  }
 }
 return result;
}
export function factBrief(research,claims=[]){
 if(!research||research.status!=='grounded'){
  return 'Внешние источники недоступны или не дали подтверждений. НЕТ подтверждённых внешних фактов. Все конкретные числа о компаниях, рынках и конкурентах из ответов моделей — неподтверждённые утверждения, если пользователь не предоставил данные. Не превращай их в исходные факты.';
 }
 const evidence=(research.facts||[]).filter(f=>f.sourceIds?.length).slice(0,9);
 const sources=(research.sources||[]).slice(0,10);
 return [
  'ОПОРНЫЙ КОНТЕКСТ ИЗ ПОИСКА — выдержки с привязкой к ссылкам, НЕ независимый аудит. Проверяй применимость источника, период, географию и компанию.',
  ...evidence.map((f,i)=>(i+1)+'. '+f.text+' [источники '+f.sourceIds.map(id=>'S'+id).join(', ')+']'),
  ...sources.map(s=>'S'+s.id+': '+s.title+' — '+s.url),
  claims.length?'НЕПРОВЕРЕННЫЕ ЧИСЛОВЫЕ УТВЕРЖДЕНИЯ ИЗ ДИСКУССИИ (НЕ воспроизводить как факты):':'',
  ...claims.map(c=>'— '+c.by+': '+c.claim),
  'Используй число как факт о конкретном бизнесе только при явной привязке к релевантному источнику либо прямом указании пользователя. Иначе обозначай как гипотезу и объясняй способ проверки.'
 ].filter(Boolean).join('\n').slice(0,13000);
}
export function factSummary(research,claims=[]){
 const grounded=research?.status==='grounded'&&(research.facts||[]).length>0;
 return {status:grounded?'sources_found':'unavailable',sourceCount:grounded?research.sources.length:0,unverified:claims.length};
}
