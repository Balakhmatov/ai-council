import {test} from 'node:test';import assert from 'node:assert/strict';import {discuss,parseBallot,parseBallotDetail} from '../public/engine.js';
const agents=[{id:'a',name:'A'},{id:'b',name:'B'}];
const base={agents,judge:agents[0],rounds:2,words:150,task:'Задача'};
test('first round is independent; later rounds share a complete snapshot',async()=>{const calls=[];await discuss({...base,mode:'judge',emit:()=>{},request:async(a,m)=>{calls.push(m[1].content);return `answer-${a.id}`;}});assert(!calls[0].includes('answer-b'));assert(!calls[1].includes('answer-a'));assert(calls[2].includes('answer-a')&&calls[2].includes('answer-b'));});
test('consensus is not claimed when a participant disagrees',async()=>{const out=[];await discuss({...base,mode:'consensus',emit:m=>out.push(m),request:async(a,m)=>m[1].content.includes('"agree" или')?JSON.stringify({vote:a.id==='a'?'agree':'disagree'}):'решение'});assert.equal(out.at(-1).stage,'Консенсус не достигнут');});
test('consensus requires every approval',async()=>{const out=[];await discuss({...base,mode:'consensus',emit:m=>out.push(m),request:async(a,m)=>m[1].content.includes('"agree" или')?'```json\n{"vote":"agree"}\n```':'решение'});assert.equal(out.at(-1).stage,'Консенсус по решению');});
test('invalid votes and ties do not produce a winner',async()=>{const out=[];await discuss({...base,mode:'vote',emit:m=>out.push(m),request:async(a,m)=>m[1].content.includes('Допустимые идентификаторы:')?JSON.stringify({vote:a.id}):'решение'});assert(out.find(x=>x.stage==='Подсчёт голосов').text.includes('Единственного победителя нет'));assert.equal(parseBallot('{"vote":"unknown"}',['a']),null);});
test('one failed provider does not erase successful answers',async()=>{const out=[];await discuss({...base,mode:'judge',emit:m=>out.push(m),request:async a=>{if(a.id==='b')throw Error('quota');return 'OK';}});assert(out.some(x=>x.error));assert(out.at(-1).final);});
test('abort prevents final result',async()=>{const c=new AbortController();c.abort();await assert.rejects(discuss({...base,mode:'judge',signal:c.signal,emit:()=>{},request:async()=>''}),{name:'AbortError'});});

test('grounding happens before any model, and findings are shared with every participant',async()=>{
 const order=[],out=[],research={status:'grounded',sources:[{id:1,title:'Official source',url:'https://official.example/report'}],
 facts:[{text:'Official report dated 2026',sourceIds:[1]}]};
 await discuss({...base,mode:'judge',researchProvider:async()=>{order.push('research');return research;},
 onResearch:r=>order.push('sources:'+r.status),emit:m=>out.push(m),request:async(a,m)=>{
  order.push(a.id);
  assert.match(m[1].content,/Official report dated 2026/);
  assert.match(m[1].content,/https:\/\/official.example\/report/);
  return 'Предположительно число заказов увеличилось на 70% в этом городе';
 }});
 assert.deepEqual(order.slice(0,2),['research','sources:grounded']);
 assert.equal(order[2],'a');
 assert.ok(out.some(m=>m.stage==='Открытые источники'));
 assert.ok(out.some(m=>m.stage==='Реестр неподтверждённых утверждений'));
 assert.ok(out.at(-1).final);
});
test('source failure never upgrades unverified model numbers to facts',async()=>{
 const out=[],calls=[];
 await discuss({...base,mode:'judge',researchProvider:async()=>({status:'unavailable',reason:'Не настроено'}),
  emit:m=>out.push(m),request:async(a,m)=>{
   calls.push(m[1].content);
   return 'Согласно данным, до 70% заказов приходят через сайт';
  }});
 assert.ok(calls[0].includes('НЕТ подтверждённых внешних фактов'));
 assert.ok(calls.at(-1).includes('НЕПРОВЕРЕННЫЕ ЧИСЛОВЫЕ УТВЕРЖДЕНИЯ'));
 assert.match(out.find(m=>m.stage==='Открытые источники').text,/Не использовать цифры/);
});
test('consensus reflects current approvals and explicitly separates decision agreement from evidence',async()=>{
 const out=[];
 await discuss({...base,mode:'consensus',emit:m=>out.push(m),request:async(a,m)=>{
  const v=m[1].content;
  if(v.includes('Раунд 2')&&a.id==='b')throw Error('Earlier unavailable provider');
  return v.includes('"agree" или')?'{"vote":"agree"}':'Практический план';
 }});
 const final=out.at(-1);
 assert.equal(final.stage,'Консенсус по решению');
 assert.match(final.text,/Поддержка проекта: 2 из 2/);
 assert.match(final.text,/не проверка достоверности фактов/);
});

test('untrusted model claims remain in user data and are never elevated into system instructions',async()=>{
 const inputs=[];
 await discuss({...base,mode:'judge',researchProvider:async()=>({status:'unavailable',reason:'No sources'}),
  emit:()=>{},request:async(a,m)=>{
   inputs.push(m);
   assert.doesNotMatch(m[0].content,/external_evidence_untrusted/);
   if(m[1].content.includes('Раунд 2'))assert.match(m[1].content,/external_evidence_untrusted/);
   return 'Рынок вырос на 78% по оценке модели';
  }});
 assert.ok(inputs.length>2);
});

test('JSON ballots remain machine-readable while the user sees plain-language votes',async()=>{
 const out=[];
 await discuss({...base,mode:'consensus',emit:m=>out.push(m),request:async(a,m)=>{
  return m[1].content.includes('"agree" или')
   ?'```json\n'+JSON.stringify({vote:a.id==='a'?'agree':'disagree',reason:'Проверить исходные данные'})+'\n```'
   :'Деловая рекомендация';
 }});
 const votes=out.filter(x=>x.stage==='Проверка согласия');
 assert.equal(votes.length,2);
 assert.match(votes[0].text,/Согласна с итогом/);
 assert.match(votes[1].text,/Не согласна с итогом/);
 assert.match(votes[0].text,/Проверить исходные данные/);
 assert.doesNotMatch(votes[0].text,/"vote"/);
 assert.equal(out.at(-1).stage,'Консенсус не достигнут');
 assert.equal(parseBallotDetail('Текст до {"vote":"agree","reason":"Причина"} текст после',['agree']).reason,'Причина');
});
test('malformed or truncated ballot is never displayed as broken JSON or counted as agreement',async()=>{
 const out=[];
 await discuss({...base,mode:'consensus',emit:m=>out.push(m),request:async(a,m)=>{
  if(m[1].content.includes('"agree" или'))return a.id==='a'?'{"vote":"agree",':'{"vote":"agree"}';
  return 'Рекомендация';
 }});
 const invalid=out.find(x=>x.stage==='Проверка согласия'&&x.name==='A');
 assert.match(invalid.text,/не смогла дать корректную оценку/);
 assert.doesNotMatch(invalid.text,/"vote"/);
 assert.equal(out.at(-1).stage,'Консенсус не достигнут');
});
test('research/business Mistral receives stricter unsupported statistics instructions',async()=>{
 const logs=[];
 await discuss({...base,agents:[{id:'mistral',name:'Mistral'},agents[1]],judge:agents[1],
  mode:'judge',emit:()=>{},request:async(a,m)=>{logs.push({id:a.id,system:m[0].content});return 'OK';}});
 assert.match(logs.find(x=>x.id==='mistral').system,/НЕ называй цифру фактом/);
});

 test('final answer falls back to next selected model without rerunning discussion',async()=>{
  const emitted=[],finalCalls=[];
  await discuss({...base,mode:'judge',judge:base.agents[0],emit:m=>emitted.push(m),request:async(a,m,signal,metadata)=>{
   if(metadata?.stage==='final'){finalCalls.push(a.id);if(a.id==='a')throw Error('provider unavailable');return 'Fallback final result';}
   return 'Intermediate '+a.id;
  }});
  assert.deepEqual(finalCalls,['a','b']);
  const final=emitted.find(x=>x.final);
  assert.equal(final.id,'b');
  assert.equal(final.text,'Fallback final result');
  assert.equal(emitted.filter(x=>x.stage==='Первый раунд').length,2);
 });
