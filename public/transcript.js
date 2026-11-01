// Pure formatter shared by the live discussion and saved history.
export function formatTranscript({prompt='',profile='',specialization='',messages=[]}={}){
 const sections=[];
 if(profile||specialization)sections.push('# Кворум — '+[profile,specialization].filter(Boolean).join(' / '));
 sections.push('## Задача\n'+String(prompt).trim());
 const discussion=messages.filter(m=>!m.final);
 if(discussion.length){
  sections.push('## Обсуждение\n'+discussion.map(m=>{
   const title=[m.name||'Участник',m.stage||'Ответ'].join(' — ');
   return '### '+title+(m.error?' (ошибка)':'')+'\n'+String(m.text||'');
  }).join('\n\n'));
 }
 const results=messages.filter(m=>m.final);
 if(results.length)sections.push('## Готовый результат\n'+results.map(m=>String(m.text||'')).join('\n\n'));
 return sections.join('\n\n').trim();
}
