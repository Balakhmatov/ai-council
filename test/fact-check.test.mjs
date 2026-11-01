import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsSources,numericClaims,factBrief} from '../public/fact-check.js';
import {groundTask} from '../fact-grounding.mjs';

test('selective research only for market/company questions and URLs, not creative tasks',()=>{
 assert.equal(needsSources('Анализ доставки Бушими в Великом Новгороде https://busimisushi.ru/'),true);
 assert.equal(needsSources('Сравни рынок стоматологий в Москве и реальные цены'),true);
 assert.equal(needsSources('Напиши смешной пост для SMM'),false);
 assert.equal(needsSources('Придумай вымышленный бренд и сказку'),false);
});
test('numeric claim registry treats metrics as unverified, never as confirmed by agreement',()=>{
 const messages=[
  {name:'Mistral',text:'Средний чек компании составляет 1200–1500 руб. при доставке за 60–90 мин.'},
  {name:'Gemini',text:'До 70% клиентов возвращаются за повторным заказом.'},
  {name:'Claude',text:'Нужно изучить реальные заказы и структуру маржи.'}
 ];
 const claims=numericClaims(messages);
 assert.ok(claims.length>=2);
 assert.ok(claims.every(c=>c.status==='unverified'));
 const text=factBrief(null,claims);
 assert.match(text,/НЕТ подтверждённых внешних фактов/);
});
test('grounding only accepts claims explicitly supported by search metadata links',async()=>{
 const response={candidates:[{content:{parts:[{text:'Выдержка из публичного отчёта о рынке.'}]},groundingMetadata:{
  groundingChunks:[{web:{title:'Industry report',uri:'https://industry.example/research'}}],
  groundingSupports:[{segment:{text:'Выдержка из публичного отчёта о рынке.'},groundingChunkIndices:[0]}],
  searchEntryPoint:{renderedContent:'<div>Google Search</div>'}
 }}]};
 let seen;
 const result=await groundTask({task:'Анализ рынка суши',key:'api-secret',fetchImpl:async(url,opts)=>{
  seen={url,opts};return Response.json(response);
 }});
 assert.equal(result.status,'grounded');assert.equal(result.facts.length,1);
 assert.equal(result.facts[0].sourceIds[0],1);
 assert.equal(result.sources[0].url,'https://industry.example/research');
 assert.match(result.searchWidget,/Google Search/);
 assert.equal(seen.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
 assert.equal(seen.opts.headers['x-goog-api-key'],'api-secret');
 assert.deepEqual(JSON.parse(seen.opts.body).tools,[{googleSearch:{}}]);
});
test('no source metadata, unsafe source links or failed provider never produce certified evidence',async()=>{
 const unsupported=await groundTask({task:'market',key:'key',fetchImpl:async()=>Response.json({
  candidates:[{content:{parts:[{text:'Показатель составляет 80%.'}]},groundingMetadata:{
   groundingChunks:[{web:{uri:'javascript:alert(1)',title:'Bad'}}],
   groundingSupports:[{segment:{text:'Показатель составляет 80%.'},groundingChunkIndices:[0]}]
  }}]
 })});
 assert.equal(unsupported.status,'unavailable');assert.equal(unsupported.facts.length,0);
 const failed=await groundTask({task:'market',key:'key',fetchImpl:async()=>new Response('error',{status:429})});
 assert.equal(failed.status,'unavailable');assert.match(failed.reason,/429/);
 const unconfigured=await groundTask({task:'market'});
 assert.equal(unconfigured.status,'unavailable');
});
