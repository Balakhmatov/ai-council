import {test} from 'node:test';import assert from 'node:assert/strict';import {discuss,parseBallot} from '../public/engine.js';
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
