import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runShow,showScenario,showCast} from '../public/show.js';
import {DINER_INCIDENTS,parseLiveReply} from '../public/show-live.js';
import {STORY_BIBLE} from '../public/show-stories.js';
const agents=[{id:'openai',name:'OpenAI'},{id:'mistral',name:'Mistral'},{id:'grok',name:'Grok'}];
const reply=()=>JSON.stringify({speech:'Объясни, почему я должен тебе верить.',action:null});
async function simulate(id,options={}){
 const scenario=showScenario(id),calls=[],events=[];
 const parts=showCast(scenario,{0:'openai',1:'mistral',2:'grok'});
 const request=options.request||reply;
 await runShow({agents,scenario,cast:parts,scenes:3,random:()=>0,emit:e=>events.push(e),...options,request:async(a,m,s,stage)=>{calls.push({a,m,stage});return request(a,m,s,stage);}});
 return {calls,events,parts};
}
test('diner chooses each of three incidents; heist has no mandatory plot, secret or ending',async()=>{
 const chosen=[];
 for(const random of [()=>0,()=>.4,()=>.8]){
  const {events}=await simulate('diner',{random});
  const incidents=events.filter(e=>e.incident);assert.equal(incidents.length,1);chosen.push(incidents[0].incident);
 }
 assert.deepEqual(chosen,DINER_INCIDENTS.map(e=>e.id));
 for(const id of ['diner','heist']){
  const {calls,events,parts}=await simulate(id);
  for(const {a,m}of calls){
   const prompt=m.map(e=>e.content).join('\n');
   assert.ok(!prompt.includes(STORY_BIBLE[id].truth));assert.ok(!prompt.includes(STORY_BIBLE[id].ending));
   assert.ok(!prompt.includes('ОБЯЗАТЕЛЬНЫЙ ПОВОРОТ'));
   if(m[0].content.includes('ТЫ — ТОЛЬКО')){
    const own=parts.find(p=>p.provider===a.id);
    for(let i=0;i<7;i++)if(i!==own.slot)assert.ok(!prompt.includes(STORY_BIBLE[id].roles[i]));
   }
  }
  if(id==='heist')assert.equal(events.filter(e=>e.incident).length,0);
 }
});
test('mixed line lengths keep a larger turn available and dialogue does not leak service JSON',async()=>{
 const speech='Это ещё не признание. '.repeat(30);
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>stage.stage==='final'?'Никто не согласился уступить.':JSON.stringify({speech,action:null})});
 const intermediate=calls.filter(c=>c.stage.stage==='intermediate');
 assert.deepEqual([...new Set(intermediate.map(c=>c.stage.maxWords))].sort((a,b)=>a-b),[45,90,160]);
 assert.ok(events.some(e=>!e.narrator&&!e.final&&e.text.length>360));
 assert.ok(events.every(e=>!e.text.includes('"speech"')));
});
test('confirmed death persists, removes the victim from speaking order and reaches epilogue',async()=>{
 let first=true;let victim;
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>{
  if(stage.stage==='final')return 'Выжившие остаются рядом с телом. Доверия больше нет.';
  if(first){first=false;victim='Мисс Белая';return JSON.stringify({speech:'Ты доигралась.',action:{kind:'kill',target:victim}});}
  return reply();
 }});
 assert.ok(events.some(e=>e.action&&e.text.includes(victim+' погибает')));
 assert.ok(!events.some(e=>e.nickname===victim&&!e.narrator));
 const final=calls.at(-1);assert.ok(final.m[1].content.includes(victim+': погибла; больше не говорит'));
 assert.ok(final.m[0].content.includes('Не воскрешай погибших'));
});
test('injury and binding survive later turns; a bound actor cannot attack',async()=>{
 let turn=0;
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>{
  if(stage.stage==='final')return 'Связанная участница остаётся за столом; никто не доверяет организатору.';
  turn++;
  if(turn===1)return JSON.stringify({speech:'Сначала послушай меня.',action:{kind:'hit',target:'Мисс Белая'}});
  if(turn===3)return JSON.stringify({speech:'Теперь не дёргайся.',action:{kind:'bind',target:'Мисс Белая'}});
  if(turn===4)return JSON.stringify({speech:'Я тебе это припомню.',action:{kind:'hit',target:'Мистер Чёрный'}});
  return reply();
 }});
 assert.ok(events.some(e=>e.action&&e.text.includes('связывает Мисс Белую')));
 assert.ok(events.some(e=>e.action&&e.text.includes('связанные руки мешают')));
 assert.ok(calls.at(-1).m[1].content.includes('Мисс Белая: ранена, связана'));
});
test('long director notes and long dialogue stay inside server input limits',async()=>{
 const {calls}=await simulate('diner',{scenes:5,extra:'А'.repeat(5000),request:(a,m,s,stage)=>stage.stage==='final'?'Они разошлись без соглашения.':JSON.stringify({speech:'Объясни свою версию. '.repeat(80),action:null})});
 assert.ok(calls.every(c=>c.m.every(m=>m.content.length<=9500)));
 assert.ok(calls[0].m[1].content.includes('А'.repeat(5000)));
});
test('an API credit notice becomes silence rather than a character line',async()=>{
 assert.throws(()=>parseLiveReply('[]({type:"points_insufficient"})'));
 const {events}=await simulate('heist',{request:()=>{throw Error('API failure')}});
 assert.ok(events.filter(e=>e.silent).length>0);
 assert.ok(!events.some(e=>e.text.includes('API failure')));
 assert.ok(events.at(-1).text.includes('Разговор не состоялся'));
});

test('every story has varied API-failure directions without injecting raw errors',async()=>{
 const {SHOW_SCENARIOS}=await import('../public/show.js');
 for(const scenario of SHOW_SCENARIOS){
  const crew=agents.slice(0,2),events=[];
  await runShow({agents:crew,scenario,cast:showCast(scenario,{0:crew[0].id,1:crew[1].id}),scenes:5,random:()=>0,emit:e=>events.push(e),request:async()=>{throw Error('provider offline')}});
  for(const a of crew){const silent=events.filter(e=>e.id===a.id&&e.silent);assert.equal(new Set(silent.map(e=>e.text)).size,5,scenario.id);}
  assert.ok(!events.some(e=>e.text.includes('provider offline')));
 }
});
