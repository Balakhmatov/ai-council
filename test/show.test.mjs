import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHOW_SCENARIOS,showScenario,showCast,clipShowLine,runShow} from '../public/show.js';

test('Show ships ten different scenes with visual identifiers and seven individually described castable roles',()=>{
 assert.equal(SHOW_SCENARIOS.length,10);
 assert.equal(new Set(SHOW_SCENARIOS.map(s=>s.id)).size,10);
 for(const scene of SHOW_SCENARIOS){
  assert(scene.emoji&&scene.title&&scene.genre&&scene.description&&scene.setting&&scene.twist);
  assert.equal(scene.roles.length,7);
  assert.equal(new Set(scene.roles.map(r=>r[0])).size,7);
  for(const [name,description] of scene.roles)assert(name.length>2&&description.length>20);
 }
 assert.equal(showScenario('missing').id,SHOW_SCENARIOS[0].id);
});
test('one scene can be cast with different models independently of character identity',()=>{
 const s=showScenario('diner');
 const a=showCast(s,{0:'openai',1:'grok',3:'mistral'});
 const b=showCast(s,{0:'grok',1:'openai',3:'mistral'});
 assert.equal(a.length,3);
 assert.equal(a[0].name,'Винс');
 assert.equal(a[0].provider,'openai');
 assert.equal(b[0].name,'Винс');
 assert.equal(b[0].provider,'grok');
 assert(!showCast(s,{}).length);
});
test('short dialogue clip keeps one reply concise even when an AI ignores the scene instruction',()=>{
 assert.equal(clipShowLine('Привет!'),'Привет!');
 const veryLong='Это очень длинное предложение, которое не останавливается. '.repeat(30);
 assert(clipShowLine(veryLong).length<=360);
 assert(!clipShowLine(veryLong).includes('Ответ сокращён до'));
});
const actors=[{id:'openai',name:'OpenAI'},{id:'mistral',name:'Mistral'},{id:'grok',name:'Grok'}];
const cast=showCast(showScenario('diner'),{0:'mistral',1:'grok',2:'openai'});
test('Show runs exactly two sequential turns for every selected real model, sharing only last four short replies',async()=>{
 const calls=[],emitted=[];
 const request=async(a,chat,signal,stage)=>{
  calls.push({provider:a.id,chat,stage});
  return 'Я '+a.name+'. Это моя короткая реакция на предыдущую реплику!';
 };
 const out=await runShow({agents:actors,scenario:showScenario('diner'),cast,turns:2,extra:'Пустой чемодан',request,emit:x=>emitted.push(x)});
 assert.equal(calls.length,6);
 assert.deepEqual(calls.map(c=>c.provider),['mistral','grok','openai','mistral','grok','openai']);
 assert(calls.every(c=>c.stage.format==='show'&&c.stage.maxWords===45));
 assert(calls.every(c=>c.chat.length===2));
 assert(calls.every(c=>c.chat[0].content.includes('не более 45 слов')));
 assert(calls.every(c=>c.chat[1].content.length<3000));
 assert(calls[1].chat[1].content.includes('Винс: Я Mistral'));
 assert(calls[5].chat[1].content.includes('Последние реплики:'));
 assert(!calls[0].chat[1].content.includes('Я Mistral'));
 assert.equal(out.length,6);
 assert.equal(emitted.filter(x=>x.final).length,1);
 assert.equal(emitted.at(-1).nickname,'Фрэнк');
 assert.equal(emitted.at(-1).name,'OpenAI');
});
test('Show rejects duplicate model casting and allows an abort without calling providers',async()=>{
 await assert.rejects(runShow({agents:actors,scenario:showScenario('diner'),cast:showCast(showScenario('diner'),{0:'openai',1:'openai'}),request:async()=>'',emit:()=>{}}),/Роли/);
 const ctrl=new AbortController();ctrl.abort();let count=0;
 await assert.rejects(runShow({agents:actors,scenario:showScenario('diner'),cast,request:async()=>{count++;return 'ok';},emit:()=>{},signal:ctrl.signal}),e=>e.name==='AbortError');
 assert.equal(count,0);
});
test('Show continues when one model fails but does not turn errors into fictional dialogue',async()=>{
 const out=[];
 await runShow({agents:actors,scenario:showScenario('diner'),cast,turns:2,
  request:async(a)=>{if(a.id==='grok')throw Error('Провайдер не ответил');return 'Есть другая версия';},
  emit:x=>out.push(x)});
 assert.equal(out.filter(x=>x.error).length,2);
 assert(out.some(x=>x.final));
 assert(out.every(x=>x.text.length<361));
});
