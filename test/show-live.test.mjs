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
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>stage.stage==='final'?JSON.stringify({epilogue:'Никто не согласился уступить.'}):JSON.stringify({speech,action:null})});
 const intermediate=calls.filter(c=>c.stage.stage==='intermediate');
 assert.deepEqual([...new Set(intermediate.map(c=>c.stage.maxWords))].sort((a,b)=>a-b),[45,90,160]);
 assert.ok(events.some(e=>!e.narrator&&!e.final&&e.text.length>360));
 assert.ok(events.every(e=>!e.text.includes('"speech"')));
});
test('confirmed death persists, removes the victim from speaking order and reaches epilogue',async()=>{
 let first=true;let victim;
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>{
  if(stage.stage==='final')return JSON.stringify({epilogue:'Выжившие остаются рядом с телом. Доверия больше нет.'});
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
  if(stage.stage==='final')return JSON.stringify({epilogue:'Связанная участница остаётся за столом; никто не доверяет организатору.'});
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
 const {calls}=await simulate('diner',{scenes:5,extra:'А'.repeat(5000),request:(a,m,s,stage)=>stage.stage==='final'?JSON.stringify({epilogue:'Они разошлись без соглашения.'}):JSON.stringify({speech:'Объясни свою версию. '.repeat(80),action:null})});
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

test('all stories explicitly frame actor dialogue as fictional without applying actor rules to the epilogue',async()=>{
 const {SHOW_SCENARIOS}=await import('../public/show.js');
 const {ACTOR_FICTION_CONTEXT}=await import('../public/show-live.js');
 for(const scenario of SHOW_SCENARIOS){
  const calls=[];
  await runShow({agents,scenario,cast:showCast(scenario,{0:'openai',1:'mistral',2:'grok'}),scenes:3,random:()=>0,emit:()=>{},request:async(a,m,s,stage)=>{calls.push({m,stage});return stage.stage==='final'?JSON.stringify({epilogue:'Разговор завершён без общего решения.'}):reply();}});
  assert.ok(calls.filter(c=>c.stage.stage==='intermediate').every(c=>c.m[0].content.includes(ACTOR_FICTION_CONTEXT)));
  assert.ok(!calls.at(-1).m[0].content.includes(ACTOR_FICTION_CONTEXT));
 }
});

test('mutual name-dropping cannot exclude the other five selected actors',async()=>{
 const crew=Array.from({length:7},(_,i)=>({id:'model'+i,name:'Model '+i}));
 const scenario=showScenario('diner'),events=[];
 await runShow({agents:crew,scenario,cast:showCast(scenario,Object.fromEntries(crew.map((a,i)=>[i,a.id]))),scenes:3,random:()=>0,emit:e=>events.push(e),request:async(a,m,s,stage)=>stage.stage==='final'?JSON.stringify({epilogue:'Разговор остался незавершённым.'}):JSON.stringify({speech:'Тони, ответь Джимми. Джимми, отвечай Тони.',action:null})});
 const speaking=events.filter(e=>!e.narrator&&!e.final&&!e.silent);
 const counts=crew.map(a=>speaking.filter(e=>e.id===a.id).length);
 assert.ok(counts.every(n=>n>=1),JSON.stringify(counts));
 assert.ok(Math.max(...counts)-Math.min(...counts)<=1,JSON.stringify(counts));
});

test('epilogue accepts only the final Russian field and rejects service analysis',async()=>{
 const {parseShowEpilogue,parseLiveReply}=await import('../public/show-live.js');
 const final='У двери остаётся пустой чемодан. Разговор оборвался без соглашения.';
 assert.equal(parseShowEpilogue('<think>internal planning</think>'+JSON.stringify({epilogue:final})),final);
 assert.equal(parseShowEpilogue(JSON.stringify({analysis:'internal planning',epilogue:final})),final);
 for(const raw of ['We need answer the request in Russian. Need to write the ending.',JSON.stringify({epilogue:'We need to write the ending.'}),'<think>unfinished analysis',JSON.stringify({speech:final})])assert.throws(()=>parseShowEpilogue(raw));
 assert.throws(()=>parseLiveReply('We need answer the request in Russian.'));
 const {events}=await simulate('diner',{request:(a,m,s,stage)=>stage.stage==='final'?'We need answer the request in Russian.':reply()});
 assert.ok(!events.at(-1).text.includes('We need'));
 assert.ok(/[А-Яа-яЁё]/.test(events.at(-1).text));
});

test('crime stakes include life and prison without revealing the heist mastermind',async()=>{
 for(const id of ['diner','heist']){
  assert.ok(/жизн|убийств|убить|смерт/i.test(STORY_BIBLE[id].stakes));
  assert.ok(/тюрьм/.test(STORY_BIBLE[id].stakes));
 }
 assert.ok(!STORY_BIBLE.heist.stakes.includes('Мистер Розовый'));
 const {calls}=await simulate('heist');
 assert.ok(calls[0].m[0].content.includes(STORY_BIBLE.heist.stakes));
});

test('surrender causes lasting detention, removes the actor from dialogue and reaches epilogue',async()=>{
 let first=true;
 const {calls,events}=await simulate('heist',{request:(a,m,s,stage)=>{
  if(stage.stage==='final')return JSON.stringify({epilogue:'Мистер Чёрный остаётся в полиции. Судьба остальных ещё не решена.'});
  if(first){first=false;return JSON.stringify({speech:'Я ухожу сдаваться полиции.',action:{kind:'surrender',target:''}});}
  return reply();
 }});
 assert.ok(events.some(e=>e.action&&e.text.includes('Мистер Чёрный задержан')));
 assert.equal(events.filter(e=>e.id==='openai'&&!e.narrator&&!e.final).length,1);
 assert.ok(calls.at(-1).m[1].content.includes('Мистер Чёрный: задержан полицией; вне сцены'));
 assert.ok(calls.at(-1).m[0].content.includes('Не выдумывай судебный приговор'));
});

test('live prompts omit removed instructions and display actions in italics',async()=>{
 for(const id of ['diner','heist']){
  let first=true;
  const {calls,events}=await simulate(id,{request:(a,m,s,stage)=>{
   if(stage.stage==='final')return JSON.stringify({epilogue:'Ссора оставила участников без доверия.'});
   const action=first?{kind:'hit',target:showCast(showScenario(id),{0:'openai',1:'mistral',2:'grok'}).find(p=>p.provider!==a.id).name}:null;first=false;
   return JSON.stringify({speech:'(Отодвигает чашку.) Ответь мне. *(Смотрит на дверь.)*',action});
  }});
  for(const {m,stage} of calls.filter(c=>c.stage.stage!=='final')){
   for(const phrase of ['Не обязан применять насилие','Связанный может говорить','Это возможные исходы, не обязательный финал','Не объявляй, что твоя атака уже удалась'])assert.ok(!m[0].content.includes(phrase));
   assert.ok(m[0].content.includes('оформляй курсивом'));
  }
  assert.ok(events.some(e=>e.action&&e.text.startsWith('*(')&&e.text.endsWith(')*')));
  assert.ok(events.some(e=>e.text==='*(Отодвигает чашку.)* Ответь мне. *(Смотрит на дверь.)*'));
 }
});

test('actor parser extracts repeated fenced JSON and refuses truncated protocol or English inserts',()=>{
 const speech='(Смотрит на дверь.) Кто забрал деньги?';
 assert.equal(parseLiveReply(speech+'\n```json\n'+JSON.stringify({speech,action:{kind:'hit',target:'Тони'}})+'\n```').speech,speech);
 assert.equal(parseLiveReply('Вводная '+JSON.stringify({speech:'Ответь мне.',action:null})+' служебный хвост').speech,'Ответь мне.');
 for(const raw of ['Речь. ```json\n{"speech":"Оборвано', '{"speech":"I know the answer","action":null}', JSON.stringify({speech:'Мы едем в trunk к Хозяину.',action:null}), JSON.stringify({speech:'Я не accountant, ясно?',action:null})])assert.throws(()=>parseLiveReply(raw));
});

test('only parenthetical directions are italic after malformed model emphasis',async()=>{
 const {formatShowSpeech}=await import('../public/show-live.js');
 assert.equal(formatShowSpeech('(Смотрит в окно) *Отвечай сейчас. (Тихо)* И без фокусов.'),'*(Смотрит в окно)* Отвечай сейчас. *(Тихо)* И без фокусов.');
 assert.equal(formatShowSpeech('*(Отодвигает чашку.)* Ответь мне.'),'*(Отодвигает чашку.)* Ответь мне.');
});
