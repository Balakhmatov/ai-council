import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTranscript} from '../public/transcript.js';

test('full task copy includes user prompt, rounds from every model and the final',()=>{
 const payload={
  prompt:'Сделай стратегию запуска',profile:'Маркетинг',specialization:'Стратегия',
  messages:[
   {name:'Grok',stage:'Независимая идея',text:'Идея Grok'},
   {name:'Mistral',stage:'Независимая идея',text:'Идея Mistral'},
   {name:'Grok',stage:'Раунд 2',text:'Пересмотр Grok'},
   {name:'Mistral',stage:'Раунд 2',text:'Пересмотр Mistral'},
   {name:'Итог',stage:'Готовое решение',text:'Окончательная стратегия',final:true}
  ]
 };
 const copy=formatTranscript(payload);
 for(const piece of ['## Задача','Сделай стратегию запуска','Идея Grok','Идея Mistral','Раунд 2','Пересмотр Grok','Пересмотр Mistral','## Готовый результат','Окончательная стратегия'])
  assert.ok(copy.includes(piece),'Expected full transcript to include '+piece);
 assert.ok(copy.indexOf('## Задача')<copy.indexOf('## Обсуждение'));
 assert.ok(copy.indexOf('## Обсуждение')<copy.indexOf('## Готовый результат'));
 assert.equal(copy.match(/Окончательная стратегия/g).length,1);
});
test('partial cancelled task is still copyable including model responses but no fabricated final',()=>{
 const output=formatTranscript({prompt:'Моя задача',messages:[{name:'Claude',stage:'Раунд 1',text:'Частичный ответ'}]});
 assert.match(output,/Моя задача/);
 assert.match(output,/Частичный ответ/);
 assert.doesNotMatch(output,/Готовый результат/);
});
test('saved task copy correctly includes voting protocols, errors and consensus checks',()=>{
 const s=formatTranscript({prompt:'Проверь рекламу',messages:[
  {name:'Протокол',stage:'Подсчёт голосов',text:'2 голоса'},
  {name:'Gemini',stage:'Раунд 2',text:'HTTP 500',error:true},
  {name:'Итог',stage:'Готовое решение',text:'Правки',final:true}
 ]});
 assert.match(s,/Подсчёт голосов/);
 assert.match(s,/HTTP 500/);
 assert.match(s,/ошибка/);
 assert.match(s,/Правки/);
});
