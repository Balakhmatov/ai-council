import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHOW_SCENARIOS,SHOW_TONES,showScenario,showCast,clipShowLine,runShow} from '../public/show.js';
import {STORY_BIBLE,CHARACTER_ARCHETYPES,CHARACTER_VOICE_PROFILES,CHARACTER_QUOTE_BANK} from '../public/show-stories.js';

const actors=[{id:'openai',name:'OpenAI'},{id:'mistral',name:'Mistral'},{id:'grok',name:'Grok'}];
const scene=showScenario('villains');
const cast=showCast(scene,{0:'mistral',1:'grok',2:'openai'});

test('fourteen show worlds have private motives and seven free versus seven three-way endings',()=>{
 assert.equal(SHOW_SCENARIOS.length,14);
 assert.equal(new Set(SHOW_SCENARIOS.map(s=>s.id)).size,14);
 for(const s of SHOW_SCENARIOS){
  const b=STORY_BIBLE[s.id];
  assert(s.title&&s.description&&s.setting&&s.genre&&s.emoji);
  assert.equal(s.roles.length,7);assert.equal(b.roles.length,7);
  assert(b.place.length>45&&b.conflict.length>50&&b.stakes.length>50);
  assert(b.roles.every(r=>r.length>35));assert(b.pressure.length>50&&!('clock' in b));
  assert(!('truth'in b)&&!('ending'in b)&&!('beats'in b));
  assert.equal(b.outcomes.length,b.endingMode==='three'?3:0);
  assert.equal(new Set(b.outcomes.map(o=>o.id)).size,b.outcomes.length);
  if(b.endingMode==='three')assert(b.outcomes.some(o=>o.id===b.fallbackOutcome));
 }
 assert.equal(Object.values(STORY_BIBLE).filter(b=>b.endingMode==='three').length,7);
 assert.equal(Object.values(STORY_BIBLE).filter(b=>b.endingMode==='free').length,7);
 assert.equal(Object.keys(SHOW_TONES).length,5);
});
test('a fictional role can be played by any model, independent of the role name',()=>{
 const before=showCast(scene,{0:'openai',1:'grok',2:'mistral'});
 const after=showCast(scene,{0:'grok',1:'openai',2:'mistral'});
 assert.equal(before[0].name,'Джокер');
 assert.equal(after[0].name,'Джокер');
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
 const out=await runShow({agents:actors,scenario:scene,cast,scenes:3,tonality:'brutal',extra:'Судьба пленного Бэтмена',
  request:async(a,chat,signal,stage)=>{calls.push({id:a.id,chat,stage});return 'Кай, предъяви ключ. Я хочу увидеть доказательства.';},
  emit:m=>emitted.push(m)});
 assert.equal(calls.length,10,'3 scenes x 3 actors + epilogue');
 assert.equal(calls.filter(c=>c.stage.stage==='intermediate').length,9);
 assert.equal(calls.filter(c=>c.stage.stage==='final').length,1);
 assert.equal(out.filter(m=>m.narrator).length,1);
 assert.equal(out.filter(m=>m.final).length,1);
 assert(out.at(-1).text.includes('без общей развязки'));
 assert(calls.every(c=>c.chat.length===2));
 assert(calls.every(c=>c.chat[0].content.length<9500&&c.chat[1].content.length<9500));
 assert(calls.filter(c=>c.stage.stage==='intermediate').every(c=>[45,90,160].includes(c.stage.maxWords)&&c.stage.format==='show'));
 assert(calls.some(c=>c.chat[0].content.includes('ГРАНИЦЫ ЗНАНИЯ')));
 assert(calls.some(c=>c.chat[1].content.includes('СЕЙЧАС ГОВОРИТ')));
 assert(calls.some(c=>c.chat[1].content.includes('Последние')||c.chat[1].content.includes('ПРЕДЫДУЩИЕ РЕПЛИКИ')));
 assert(calls.some(c=>c.chat[0].content.includes('жёсткие решения')));
 assert(calls.some(c=>c.chat[1].content.includes('Джокер:')));
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
 assert(silences.every(m=>m.text.startsWith('*(')&&m.text.endsWith(')*')&&m.text.includes(m.nickname)&&!m.error));
 assert(out.every(m=>!m.text.includes('Service unavailable')));
 assert(out.at(-1).final);
 assert(!out.at(-1).text.includes('ключ общественному совету'));
 assert(calls.some(c=>c.chat[1].content.includes('Предыдущий персонаж промолчал')));
});
test('when all actors fail, no story resolution is invented',async()=>{
 const out=[];
 await runShow({agents:actors,scenario:scene,cast,scenes:3,request:async()=>{throw Error('provider down')},emit:m=>out.push(m)});
 assert(out.at(-1).final);
 assert(out.at(-1).text.includes('Разговор не состоялся'));
 assert(out.filter(m=>m.silent).length===9);
});
test('Show stops cleanly on abort and rejects unfinished casting',async()=>{
 const bad=showCast(scene,{0:'openai',1:'openai'});
 await assert.rejects(runShow({agents:actors,scenario:scene,cast:bad,request:async()=>'',emit:()=>{}}),/Роли/);
 const controller=new AbortController();controller.abort();let count=0;
 await assert.rejects(runShow({agents:actors,scenario:scene,cast,request:async()=>{count++;return 'ok'},emit:()=>{},signal:controller.signal}),e=>e.name==='AbortError');
 assert.equal(count,0);
});

test('crime Show prompts use individual speech cases without overriding restrained tone',async()=>{
 for(const tonality of ['brutal','restrained']){
  const scenario=showScenario('heist'),prompts=[];
  await runShow({agents:actors,scenario,cast:showCast(scenario,{0:'openai',1:'mistral',2:'grok'}),scenes:3,tonality,emit:()=>{},request:async(a,m)=>{prompts.push(m[0].content);return 'Сначала объясни, почему планы не совпадают.';}});
  const dialogue=prompts.filter(p=>p.includes('ТЫ — ТОЛЬКО'));
  assert.ok(dialogue.length>0);
  assert.ok(dialogue.every(p=>p.includes('РАЗВЁРНУТЫЕ РЕЧЕВЫЕ ОБРАЗЦЫ')&&!p.includes('РЕЧЕВАЯ ПАЛИТРА:')));
  if(tonality==='restrained')assert.ok(dialogue.every(p=>!p.includes('полная хуйня')&&p.includes('Грубость ограничена выбранной манерой')));
 }
});

test('diner improvisation keeps other roles private and never sends authored plot or ending',async()=>{
 const scenario=showScenario('diner');
 const crew=Array.from({length:7},(_,i)=>({id:'actor'+i,name:'Model '+i}));
 const parts=showCast(scenario,Object.fromEntries(crew.map((a,i)=>[i,a.id])));
 const calls=[],events=[],book=STORY_BIBLE.diner;
 await runShow({agents:crew,scenario,cast:parts,scenes:3,emit:m=>events.push(m),request:async(a,m,s,stage)=>{calls.push({a,m,stage});return stage.stage==='final'?JSON.stringify({epilogue:'Участники спорят, но общего решения не приняли.',outcome:'standoff'}):'Я пока не верю твоей версии. Объясни ещё раз.';}});
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
  assert.ok(!prompt.includes('Канонический результат'));
  if(call.stage.stage!=='final')for(const option of book.outcomes)assert.ok(!prompt.includes(option.condition),'ending leaked to actor');
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
 assert.ok(!events.at(-1).text.includes('Джимми вскрывает тайник'));
 assert.ok(events.at(-1).text.includes('Участники не смогли ответить'));
});

test('requested first four shows are ordered heroes, Mortal Kombat, toxic broadcast, comic villains',()=>{
 assert.deepEqual(SHOW_SCENARIOS.slice(0,4).map(s=>s.id),['anime','kombat','reality','villains']);
 const court=showScenario('court');assert.ok(court.description.includes('самостоятельные искусственные интеллекты'));
 assert.ok(court.roles.every(([,description])=>description.includes('ИИ')));
 assert.ok(STORY_BIBLE.court.roles.every(r=>r.includes('ИИ')));
 assert.ok(STORY_BIBLE.olympus.conflict.includes('Афганистана'));assert.ok(STORY_BIBLE.olympus.conflict.includes('без божественных сил'));
});

test('all fourteen stories sustain eight scenes with changing guidance and private role knowledge',async()=>{
 for(const scenario of SHOW_SCENARIOS){
  const calls=[];
  await runShow({agents:actors,scenario,cast:showCast(scenario,{0:'openai',1:'mistral',2:'grok'}),scenes:8,emit:()=>{},request:async(a,m,s,stage)=>{
   calls.push({m,stage});
   return stage.stage==='final'?JSON.stringify({epilogue:'Они остались при своих решениях. Соглашения пока нет.',...(STORY_BIBLE[scenario.id].outcomes?{outcome:STORY_BIBLE[scenario.id].outcomes[0].id}:{})}):JSON.stringify({speech:'Я услышал твой ответ. Теперь объясни, что ты предлагаешь взамен.',action:null});
  }});
  const actorsCalls=calls.filter(c=>c.stage.stage!=='final');
  assert.equal(actorsCalls.length,24,scenario.id);
  const guidance=new Set(actorsCalls.map(c=>c.m[1].content.match(/РАЗВИТИЕ КОНФЛИКТА: ([^\n]+)/)?.[1]));
  assert.equal(guidance.size,8,scenario.id);
  assert.equal(calls.filter(c=>c.stage.stage==='final').length,1);
 }
});


test('all 98 characters have researched ten-sentence archetypes passed only to their own actor',async()=>{
 let total=0;
 for(const scenario of SHOW_SCENARIOS){
  const voices=CHARACTER_ARCHETYPES[scenario.id];
  assert.equal(voices.length,scenario.roles.length);
  assert.equal(new Set(voices).size,7);
  for(const voice of voices){assert(voice.length>500&&voice.length<1300);total++;}
  const parts=showCast(scenario,{0:'openai',1:'mistral',2:'grok'});
  await runShow({agents:actors,scenario,cast:parts,scenes:3,emit:()=>{},request:async(agent,m,signal,stage)=>{
   if(stage.stage!=='final'){
    const own=parts.find(p=>p.provider===agent.id);
    assert(m[0].content.includes('ЛИЧНЫЙ РЕЧЕВОЙ АРХЕТИП: '+CHARACTER_VOICE_PROFILES[scenario.id][own.slot].sentences.filter(line=>!line.startsWith('Пример ')).join(' ')));
    assert(m[0].content.includes('ПРИОРИТЕТ ГОЛОСА:'));
    for(const [slot,voice] of voices.entries())if(slot!==own.slot)assert(!m[0].content.includes(voice));
    assert(m.every(message=>message.content.length<=9500),'actor context fits server limit');
   }
   return stage.stage==='final'?JSON.stringify({epilogue:'Они не пришли к соглашению.'}):JSON.stringify({speech:'Объясни, что ты предлагаешь взамен.',action:null});
  }});
 }
 assert.equal(total,98);
});


test('each researched voice specifies a source version and exactly ten sentences with two original examples',()=>{
 let sentenceCount=0,exampleCount=0;
 for(const scenario of SHOW_SCENARIOS){
  const profiles=CHARACTER_VOICE_PROFILES[scenario.id];
  assert.equal(profiles.length,7);
  profiles.forEach((profile,slot)=>{
   assert.equal(profile.name,scenario.roles[slot][0]);assert(profile.prototype.length>5);
   assert.equal(profile.sentences.length,10);sentenceCount+=profile.sentences.length;
   assert.equal(profile.sentences.filter(line=>line.startsWith('Пример ')).length,2);exampleCount+=2;
   assert.equal(CHARACTER_ARCHETYPES[scenario.id][slot],profile.sentences.join(' '));
   assert(profile.sources.length>=1);
   for(const source of profile.sources){assert.equal(new URL(source.url).protocol,'https:');assert(source.title.length>3);}
  });
 }
 assert.equal(sentenceCount,980);assert.equal(exampleCount,196);
 assert(CHARACTER_VOICE_PROFILES.kombat[0].prototype.includes('Ханзо'));
 assert(CHARACTER_VOICE_PROFILES.kombat[1].prototype.includes('Куай'));
 assert(CHARACTER_VOICE_PROFILES.time[1].sentences.join(' ').includes('реконструирована'));
});


test("every actor has quote anchors without other actors anchors in its prompt",async()=>{
 const budgets=new Map();
 const crew=['openai','mistral','grok','claude','gemini','qwen','deepseek'].map(id=>({id,name:id}));
 for(const quote of Object.values(CHARACTER_QUOTE_BANK)){
  assert(quote.text.length>0&&quote.text.length<=90);
  assert(quote.speaker&&quote.locator&&quote.pattern&&quote.translation);
  assert.equal(new URL(quote.source.url).protocol,'https:');
  budgets.set(quote.workId,(budgets.get(quote.workId)||0)+quote.text.length);
 }
 for(const count of budgets.values())assert(count<=90,'keep each source extract short');
 for(const scenario of SHOW_SCENARIOS){
  const profiles=CHARACTER_VOICE_PROFILES[scenario.id];
  for(const profile of profiles){assert(profile.quoteIds.length>0);for(const id of profile.quoteIds)assert(CHARACTER_QUOTE_BANK[id]);}
  const parts=showCast(scenario,Object.fromEntries(crew.map((agent,slot)=>[slot,agent.id]))),seen=new Set();
  await runShow({agents:crew,scenario,cast:parts,scenes:3,emit:()=>{},request:async(agent,m,signal,stage)=>{
   if(stage.stage!=='final'){
    seen.add(agent.id);
    const own=parts.find(p=>p.provider===agent.id),ids=profiles[own.slot].quoteIds;
    assert(m[0].content.includes('АДАПТАЦИЯ ЦИТАТЫ:'));
    for(const id of ids)assert(m[0].content.includes('«'+CHARACTER_QUOTE_BANK[id].text+'»'));
    for(const other of profiles)for(const id of other.quoteIds)if(!ids.includes(id))assert(!m[0].content.includes('«'+CHARACTER_QUOTE_BANK[id].text+'»'));
    assert(m.every(message=>message.content.length<=9500));
   }
   return stage.stage==='final'?JSON.stringify({epilogue:'Спор остался открытым.'}):JSON.stringify({speech:'Я услышал условие, теперь назови свою цену.',action:null});
  }});
  assert.equal(seen.size,7,'all seven voices exercised in '+scenario.id);
 }
});


test('all 98 voices have three substantial source-labelled speech cases and distinct adaptations',()=>{
 const ids=new Set(),adaptations=new Set();let count=0;
 for(const profiles of Object.values(CHARACTER_VOICE_PROFILES))for(const profile of profiles){
  assert.equal(profile.speechSamples.length,3,profile.name);
  for(const sample of profile.speechSamples){
   assert(!ids.has(sample.id));ids.add(sample.id);
   assert(sample.sourceContext.length>=70);assert(sample.speechMove.length>=40);
   assert(sample.lexicon.length>=3);assert(sample.adaptation.length>=100);
   assert(!adaptations.has(sample.adaptation));adaptations.add(sample.adaptation);
   assert(sample.evidenceKind);assert.equal(new URL(sample.source.url).protocol,'https:');count++;
  }
 }
 assert.equal(count,294);
});

test('all speech cases reach only their actor without source plots or shared genre templates over eight scenes',async()=>{
 const crew=['openai','mistral','grok','claude','gemini','qwen','deepseek'].map(id=>({id,name:id}));
 let seen=0;
 for(const scenario of SHOW_SCENARIOS){
  const profiles=CHARACTER_VOICE_PROFILES[scenario.id],parts=showCast(scenario,Object.fromEntries(crew.map((agent,slot)=>[slot,agent.id]))),speakers=new Set();
  await runShow({agents:crew,scenario,cast:parts,scenes:8,extra:'пожелание '.repeat(500),emit:()=>{},request:async(agent,m,signal,stage)=>{
   if(stage.stage!=='final'){
    const own=parts.find(p=>p.provider===agent.id),profile=profiles[own.slot];speakers.add(own.slot);
    assert(m[0].content.includes('РАЗВЁРНУТЫЕ РЕЧЕВЫЕ ОБРАЗЦЫ'));
    assert(!m[0].content.includes('РЕЧЕВАЯ ПАЛИТРА:'));
    for(const sample of profile.speechSamples){
     assert(m[0].content.includes(sample.adaptation));
     assert(m[0].content.includes(sample.speechMove));
     assert(!m[0].content.includes(sample.sourceContext),'do not feed outside plot as facts');
    }
    for(const other of profiles)if(other!==profile)for(const sample of other.speechSamples)assert(!m[0].content.includes(sample.adaptation));
    assert(m.every(message=>message.content.length<=9500),scenario.id+' context limit');
   }
   return stage.stage==='final'?JSON.stringify({epilogue:'Участники остались при своих решениях.'}):JSON.stringify({speech:'Я услышал возражение, теперь назови свою цену.',action:null});
  }});
  assert.equal(speakers.size,7);seen+=speakers.size;
 }
 assert.equal(seen,98);
});
