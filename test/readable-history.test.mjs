import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHistoryStore} from '../history.mjs';
import {LENGTH_PRESETS,wordsForPreset,limitIntermediate} from '../public/response-length.js';
import {renderMarkdown} from '../public/markdown-render.js';

test('compact defaults are actual word caps and final text is never modified by limiter',()=>{
 assert.deepEqual(Object.keys(LENGTH_PRESETS),['short','medium','detailed']);
 assert.equal(wordsForPreset('short'),300);
 assert.equal(wordsForPreset('medium'),600);
 assert.equal(wordsForPreset('detailed'),1000);
 assert.equal(wordsForPreset('500'),300);
 const long=Array.from({length:1200},(_,i)=>'слово'+i).join(' ');
 for(const limit of [300,600,1000]){
  const clipped=limitIntermediate(long,limit);
  assert.match(clipped,/Ответ сокращён/);
  assert.ok(clipped.includes('слово'+(limit-1)));
  assert.ok(!clipped.includes('слово'+limit+' '));
 }
 assert.equal(limitIntermediate('Один краткий ответ',120),'Один краткий ответ');
});
test('history search covers all 90 past tasks including full model answers before pagination',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-search-'));
 try{
  const file=join(dir,'history.json');
  const store=createHistoryStore({file,now:(()=>{let i=0;return ()=>Date.parse('2026-01-01T00:00:00Z')+(i++)*1000})()});
  const user='account:'+'a'.repeat(32);
  const other='account:'+'b'.repeat(32);
  for(let i=0;i<80;i++)store.record(user,i.toString(16).padStart(48,'0'),{prompt:'Задача '+i,
   profile:'Маркетинг',specialization:'Стратегия',messages:[{name:'Claude',stage:'Первый раунд',text:i===79?'Особый секретный термин ретеншн':'Обычный ответ '+i}]});
  store.record(other,'f'.repeat(48),{prompt:'Задача конкурента',messages:[{name:'Gemini',stage:'Первый раунд',text:'Особый секретный термин ретеншн'}]});
  const results=store.list(user,{search:'РЕТЕНШН',limit:20,offset:0});
  assert.equal(results.total,1);
  assert.equal(results.items[0].title,'Задача 79');
  assert.equal(store.list(other,{search:'Задача 79'}).total,0);
  assert.equal(store.list(user,{search:'Маркетинг',limit:20}).total,80);
  assert.equal(store.list(user,{search:'Задача',limit:20}).nextOffset,20);
  const restored=createHistoryStore({file});
  assert.equal(restored.list(user,{search:'секретный'}).total,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Markdown renders headings, emphasis, bullet lists and GFM tables as safe DOM nodes',()=>{
 const original=globalThis.document;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.text='';}
  append(...els){this.children.push(...els);}
  set textContent(v){this.text=String(v);}
  get textContent(){return this.text+this.children.map(x=>x.textContent??'').join('');}
  set className(v){this.attributes.className=v;}
  set href(v){this.attributes.href=v;}
  set rel(v){this.attributes.rel=v;}
  set target(v){this.attributes.target=v;}
 }
 globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
 try{
  const dom=renderMarkdown('## Заголовок\n\n**Жирный** и *курсив*\n\n- первый\n- второй\n\n| Метрика | Значение |\n|---|---|\n| CAC | **100 ₽** |\n\n[опасно](javascript:alert)\n\n<script>alert(1)</script>');
  const walk=node=>[node,...(node.children||[]).flatMap(walk)];
  const elements=walk(dom),tags=elements.map(x=>x.tagName);
  for(const tag of ['h2','strong','em','ul','li','table','th','td'])assert.ok(tags.includes(tag),'Missing '+tag);
  assert.equal(tags.includes('script'),false);
  assert.equal(tags.includes('a'),false);
  assert.match(dom.textContent,/Метрика/);
  assert.match(dom.textContent,/<script>/);
 }finally{globalThis.document=original;}
});

test('search excerpts highlight mentions inside full historic model answers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-suggest-'));
 try{
  const store=createHistoryStore({file:join(dir,'suggest.json')});
  const user='account:'+'d'.repeat(32);
  store.record(user,'1'.repeat(48),{prompt:'Сформировать маркетинговый план',messages:[
   {name:'Claude',stage:'Раунд 2',text:'Компания работает в Великом Новгороде, но официальной статистики нет.'}]});
  const found=store.list(user,{search:'НОВГОРОД',limit:7});
  assert.equal(found.total,1);
  assert.equal(found.items[0].matchLabel,'Claude · Раунд 2');
  assert.match(found.items[0].excerpt,/Новгороде/);
  assert.ok(found.items[0].excerpt.length<180);
  assert.equal(store.list(user,{search:'Зеленоград'}).total,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
