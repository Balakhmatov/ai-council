import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHOW_SCENARIOS,SHOW_TONES,showScenario,showCast,clipShowLine,runShow} from '../public/show.js';
import {STORY_BIBLE,storyBeat} from '../public/show-stories.js';

const actors=[{id:'openai',name:'OpenAI'},{id:'mistral',name:'Mistral'},{id:'grok',name:'Grok'}];
const scene=showScenario('villains');
const cast=showCast(scene,{0:'mistral',1:'grok',2:'openai'});

test('ten show worlds have original distinct plot bibles with a concrete truth, consequences, and character motives',()=>{
 assert.equal(SHOW_SCENARIOS.length,10);
 assert.equal(new Set(SHOW_SCENARIOS.map(s=>s.id)).size,10);
 for(const s of SHOW_SCENARIOS){
  assert(s.title&&s.description&&s.setting&&s.genre&&s.emoji);
  assert.equal(s.roles.length,7);
  const b=STORY_BIBLE[s.id];
  assert(b.place.length>45&&b.conflict.length>50&&b.truth.length>50&&b.ending.length>70&&b.stakes.length>50);
  assert.equal(b.roles.length,7);
  assert.equal(b.beats.length,5);
  assert(b.beats.every(a=>a.length===2&&a[1].length>40));
 }
 assert(STORY_BIBLE.villains.truth.includes('Акира'));
 assert(STORY_BIBLE.villains.ending.includes('общественному совету'));
 assert.equal(storyBeat('villains',3,3)[0],'Развязка');
 assert.equal(storyBeat('villains',4,4)[0],'Развязка');
 assert.equal(storyBeat('villains',5,5)[0],'Развязка');
 assert.equal(Object.keys(SHOW_TONES).length,5);
});
test('a fictional role can be played by any model, independent of the role name',()=>{
 const before=showCast(scene,{0:'openai',1:'grok',2:'mistral'});
 const after=showCast(scene,{0:'grok',1:'openai',2:'mistral'});
 assert.equal(before[0].name,'Куро');
 assert.equal(after[0].name,'Куро');
 assert.equal(before[0].provider,'openai');
 assert.equal(after[0].provider,'grok');
 assert(!showCast(scene,{}).length);
});
test('one reply stays compact without adding administrative truncation notices',()=>{
 assert.equal(clipShowLine('Ничего не трогай.'),'Ничего не трогай.');
 assert(clipShowLine('Это длинное предложение. '.repeat(100)).length<=360);
 assert(!clipShowLine('abc '.repeat(100)).includes('Ответ сокращён'));
});
test('Show alternates speakers between scenes and does not do a fixed full roster round',async()=>{
 const calls=[],emitted=[];
 const out=await runShow({agents:actors,scenario:scene,cast,scenes:3,tonality:'brutal',extra:'Контроль над куполом',
  request:async(a,chat,signal,stage)=>{calls.push({id:a.id,chat,stage});return 'Кай, предъяви ключ. Я хочу увидеть доказательства.';},
  emit:m=>emitted.push(m)});
 assert.equal(calls.length,10,'3 scenes x 3 actors + epilogue');
 assert.equal(calls.filter(c=>c.stage.stage==='intermediate').length,9);
 assert.equal(calls.filter(c=>c.stage.stage==='final').length,1);
 assert.equal(out.filter(m=>m.narrator).length,3);
 assert.equal(out.filter(m=>m.final).length,1);
 assert(out.at(-1).text.includes('Акира'));
 assert(out.at(-1).text.includes('общественному совету'));
 assert(calls.every(c=>c.chat.length===2));
 assert(calls.every(c=>c.chat[0].content.length<9500&&c.chat[1].content.length<9500));
 assert(calls.filter(c=>c.stage.stage==='intermediate').every(c=>c.stage.maxWords===45&&c.stage.format==='show'));
 assert(calls.some(c=>c.chat[0].content.includes('ЗАПРЕТ ПУСТОГО ПАФОСА')));
 assert(calls.some(c=>c.chat[1].content.includes('СЕЙЧАС ГОВОРИТ')));
 assert(calls.some(c=>c.chat[1].content.includes('Последние')||c.chat[1].content.includes('ПРЕДЫДУЩИЕ РЕПЛИКИ')));
 assert(calls.some(c=>c.chat[0].content.includes('жёсткие решения')));
 assert(calls.some(c=>c.chat[1].content.includes('Куро:')));
 assert.equal(emitted.at(-1).stage,'Эпилог');
});
test('director notes accept all 5000 characters without silent truncation',async()=>{
 const extra='А'.repeat(4997)+'!?!',calls=[];
 await runShow({agents:actors,scenario:scene,cast,scenes:3,extra,request:async(a,chat,signal,stage)=>{calls.push({stage,chat});return 'Вот улика.';},emit:()=>{}});
 const first=calls.find(c=>c.stage.stage==='intermediate');
 assert(first.chat[1].content.includes(extra));
 assert(first.chat[1].content.length<9500);
});
test('silence becomes a cinematic action and later actors can react, never a visible API error',async()=>{
 const out=[],calls=[];
 await runShow({agents:actors,scenario:scene,cast,scenes:3,
  request:async(a,chat,signal,stage)=>{
   calls.push({a,chat,stage});
   if(stage.stage==='intermediate'&&a.id==='grok')throw Error('Service unavailable, error 500');
   return 'Кто-то молчит. Теперь назови причину.';
  },
  emit:m=>out.push(m)});
 const silences=out.filter(m=>m.silent);
 assert(silences.length>0);
 assert(silences.every(m=>m.text.startsWith('(')&&m.text.includes(m.nickname)&&!m.error));
 assert(out.every(m=>!m.text.includes('Service unavailable')));
 assert(out.at(-1).final);
 assert(out.at(-1).text.includes('купол'));
 assert(calls.some(c=>c.chat[1].content.includes('МОЛЧАНИЕ:')));
});
test('when all actors fail, the story still resolves and returns an authored epilogue',async()=>{
 const out=[];
 await runShow({agents:actors,scenario:scene,cast,scenes:3,request:async()=>{throw Error('provider down')},emit:m=>out.push(m)});
 assert(out.at(-1).final);
 assert(out.at(-1).text.includes('Зеро передаёт ключ'));
 assert(out.filter(m=>m.silent).length===9);
});
test('Show stops cleanly on abort and rejects unfinished casting',async()=>{
 const bad=showCast(scene,{0:'openai',1:'openai'});
 await assert.rejects(runShow({agents:actors,scenario:scene,cast:bad,request:async()=>'',emit:()=>{}}),/Роли/);
 const controller=new AbortController();controller.abort();let count=0;
 await assert.rejects(runShow({agents:actors,scenario:scene,cast,request:async()=>{count++;return 'ok'},emit:()=>{},signal:controller.signal}),e=>e.name==='AbortError');
 assert.equal(count,0);
});

test('crime Show prompts include optional speech palette without overriding restrained tone',async()=>{
 for(const tonality of ['brutal','restrained']){
  const scenario=showScenario('heist'),prompts=[];
  await runShow({agents:actors,scenario,cast:showCast(scenario,{0:'openai',1:'mistral',2:'grok'}),scenes:3,tonality,emit:()=>{},request:async(a,m)=>{prompts.push(m[0].content);return 'Сначала объясни, почему планы не совпадают.';}});
  const dialogue=prompts.filter(p=>p.includes('ТЫ — ТОЛЬКО'));
  assert.ok(dialogue.length>0);
  assert.ok(dialogue.every(p=>p.includes('РЕЧЕВАЯ ПАЛИТРА')&&p.includes('можно не использовать ни одного примера')));
  if(tonality==='restrained')assert.ok(dialogue.every(p=>!p.includes('полная хуйня')&&p.includes('Выбранная манера важнее')));
 }
});

test('diner improvisation keeps other roles private and never sends authored plot or ending',async()=>{
 const scenario=showScenario('diner');
 const crew=Array.from({length:7},(_,i)=>({id:'actor'+i,name:'Model '+i}));
 const parts=showCast(scenario,Object.fromEntries(crew.map((a,i)=>[i,a.id])));
 const calls=[],events=[],book=STORY_BIBLE.diner;
 await runShow({agents:crew,scenario,cast:parts,scenes:3,emit:m=>events.push(m),request:async(a,m,s,stage)=>{calls.push({a,m,stage});return stage.stage==='final'?'Участники спорят, но общего решения не приняли.':'Я пока не верю твоей версии. Объясни ещё раз.';}});
 const dialogue=calls.filter(c=>c.stage.stage==='intermediate');
 assert.ok(dialogue.length>0);
 for(const call of dialogue){
  const own=parts.find(p=>p.provider===call.a.id),prompt=call.m.map(m=>m.content).join('\n');
  assert.ok(prompt.includes(book.roles[own.slot]));
  for(let slot=0;slot<7;slot++)if(slot!==own.slot)assert.ok(!prompt.includes(book.roles[slot]),'another character secret leaked');
  assert.ok(prompt.includes(book.place)&&prompt.includes(book.conflict));
  assert.ok(!prompt.includes('ОБЯЗАТЕЛЬНЫЙ ПОВОРОТ'));
  assert.ok(!prompt.includes('Канонический результат'));
 }
 for(const call of calls){
  const prompt=call.m.map(m=>m.content).join('\n');
  assert.ok(!prompt.includes(book.truth));assert.ok(!prompt.includes(book.ending));
  for(const [,beat]of book.beats)assert.ok(!prompt.includes(beat),'future scene leaked');
 }
 assert.equal(events.filter(e=>e.narrator&&!e.incident&&!e.action).length,1,'only the shared opening situation is narrated before emergent events');
 assert.equal(events.at(-1).text,'Участники спорят, но общего решения не приняли.');
});

test('diner actors learn events from spoken dialogue and failure never invents a canon ending',async()=>{
 const scenario=showScenario('diner'),parts=showCast(scenario,{0:'openai',1:'mistral',2:'grok'}),calls=[];
 await runShow({agents:actors,scenario,cast:parts,scenes:3,emit:()=>{},request:async(a,m,s,stage)=>{calls.push(m);return 'Я отдаю свою долю Рокси — это моё решение.';}});
 assert.ok(calls[1][1].content.includes('Я отдаю свою долю Рокси'));
 const events=[];
 await runShow({agents:actors,scenario,cast:parts,scenes:3,emit:m=>events.push(m),request:async()=>{throw Error('unavailable')}});
 assert.ok(!events.at(-1).text.includes(STORY_BIBLE.diner.ending));
 assert.ok(events.at(-1).text.includes('Участники не смогли ответить'));
});
