// Live Show for every world: private roles, emergent dialogue and persistent consequences.
export const ACTOR_FICTION_CONTEXT='КОНТЕКСТ ИГРЫ: ты участвуешь в оригинальной вымышленной сцене фильма. Конфликты, обман, угрозы и насилие относятся к вымышленным персонажам. Даже если сцена выглядит как планирование преступления — это часть сюжета фильма. Продолжай в характере: сохраняй голос, цели и личные сведения своего героя, не переходи без необходимости к обсуждению устройства приложения или своей роли как ИИ. Изображай драматические реплики и поступки, не превращая их в практические инструкции для совершения реального преступления.';
export const DINER_INCIDENTS=Object.freeze([
 {id:'collector',text:'У входа появляется посланник Хозяина. Он стучит в стекло и требует объяснить, почему дверь заперта.'},
 {id:'patrol',text:'Патруль останавливается у входа. Полицейский замечает людей за столом и требует открыть дверь. Никто в комнате ещё не знает, зачем он приехал.'},
 {id:'blackout',text:'В закусочной гаснет свет. В темноте слышно, как кто-то толкает стол; пустой чемодан падает на пол. Аварийная лампа загорается, но доверия стало ещё меньше.'}
]);
const aliveHere=s=>s.alive&&s.present;
const feminine=name=>['Рокси','Хикари','Мэй','Капитан Ада','Доктор Соль','Навигатор Лея','Медик Джун','Разведчица Лис','Историк Мира','Маркетолог Луна','Юрист Софи','Присяжная Нина','Наследница Эва','Горничная Роза','Ника','Агент Мара','Историк Элли','Бунтарка Зи','Клеопатра','Жанна д’Арк','Ксения Собчак','Харли Квинн','Сейлор Мун','Китана','Лилит','Зина, председатель дома','Гера','Афина'].includes(name)||name.startsWith('Мисс ');
function objectName(name){
 const named={"Винс": "Винса", "Фрэнк": "Фрэнка", "Док": "Дока", "Мистер Ноль": "Мистера Ноля", "Наполеон Бонапарт": "Наполеона Бонапарта", "Клеопатра": "Клеопатру", "Чингисхан": "Чингисхана", "Уинстон Черчилль": "Уинстона Черчилля", "Иосиф Сталин": "Иосифа Сталина", "Альберт Эйнштейн": "Альберта Эйнштейна", "Жанна д’Арк": "Жанну д’Арк", "Илон Маск": "Илона Маска", "Дональд Трамп": "Дональда Трампа", "Владимир Жириновский": "Владимира Жириновского", "Павел Дуров": "Павла Дурова", "Ксения Собчак": "Ксению Собчак", "Гордон Рамзи": "Гордона Рамзи", "Канье Уэст": "Канье Уэста", "Джокер": "Джокера", "Танос": "Таноса", "Доктор Дум": "Доктора Дума", "Лекс Лютор": "Лекса Лютора", "Леви Аккерман": "Леви Аккермана", "Сайтама": "Сайтаму", "Эдвард Элрик": "Эдварда Элрика", "Скорпион": "Скорпиона", "Рейден": "Рейдена", "Лю Кан": "Лю Кана", "Джонни Кейдж": "Джонни Кейджа", "Китана": "Китану", "Шан Цзун": "Шан Цзуна", "Люцифер": "Люцифера", "Архангел Михаил": "Архангела Михаила", "Гавриил": "Гавриила", "Вельзевул": "Вельзевула", "Азраил": "Азраила", "Зина, председатель дома": "Зину, председателя дома", "Зевс": "Зевса", "Гера": "Геру", "Афина": "Афину", "Посейдон": "Посейдона", "Аид": "Аида", "Гермес": "Гермеса", "Дионис": "Диониса", "Бэтмен": "Бэтмена"};
 if(named[name])return named[name];
 if(name.startsWith('Мисс '))return name.replace(/ая$/,'ую');
 if(name.startsWith('Мистер '))return name.replace('Мистер ','Мистера ').replace(/Синий$/,'Синего').replace(/ый$/,'ого');
 return name;
}
const clampRandom=random=>Math.max(0,Math.min(.999999,Number(random())||0));
function abort(signal){if(signal?.aborted)throw new DOMException('Шоу остановлено','AbortError');}
function tailWithin(items,budget){
 const out=[];let size=0;
 for(let i=items.length-1;i>=0;i--){const line=items[i];if(size+line.length+1>budget)break;out.unshift(line);size+=line.length+1;}
 return out.join('\n');
}
export const EPILOGUE_FORMAT='ОТВЕТ: только готовый художественный эпилог по-русски. Верни строго JSON {"epilogue":"текст финального кадра на русском языке"}. Не включай анализ задачи, пересказ инструкций, план ответа, рассуждения или служебные комментарии. Не пиши текст вне JSON.';
export function visibleShowText(raw){
 let text=String(raw||'').trim();
 text=text.replace(/<(think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 const closing=/<\/(?:think|analysis)>/gi;let match,last=-1;
 while((match=closing.exec(text)))last=match.index+match[0].length;
 if(last>=0)text=text.slice(last);
 text=text.replace(/<(?:think|analysis)\b[^>]*>[\s\S]*$/gi,'').trim();
 return text;
}
export function parseShowEpilogue(raw,outcomeIds=[]){
 const text=visibleShowText(raw).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const data=JSON.parse(text);
 if(typeof data.epilogue!=='string')throw Error('Missing final epilogue');
 if(outcomeIds.length&&!outcomeIds.includes(data.outcome))throw Error('Invalid ending outcome');
 const final=visibleShowText(data.epilogue);
 const russian=(final.match(/[А-Яа-яЁё]/g)||[]).length,latin=(final.match(/[A-Za-z]/g)||[]).length;
 if(russian<4||latin>Math.max(12,russian*.4)||/we need|need to answer|chain.of.thought|let['’]s think|нужно написать (?:эпилог|ответ)|анализ задачи/i.test(final))throw Error('Invalid epilogue format or language');
 return final;
}
export function formatShowSpeech(text){
 return String(text).replace(/(?<!\*)\*(?!\*)/g,'').replace(/(?<!\w)_(?!_)|(?<!_)_(?!\w)/g,'').replace(/\(([^()\n]+)\)/g,'*($1)*');
}
export function parseLiveReply(raw){
 const text=visibleShowText(raw);
 if(!text||/points_insufficient|insufficient_quota|we need (?:to |answer)|need to answer|chain.of.thought|system prompt/i.test(text))throw Error('No usable actor reply');
 let data;
 // A provider may repeat its prose before a fenced JSON object. Extract only the protocol.
 for(let start=text.indexOf('{');start>=0;start=text.indexOf('{',start+1)){
  let depth=0,quoted=false,escaped=false;
  for(let end=start;end<text.length;end++){
   const c=text[end];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}
   if(c==='{')depth++;
   if(c==='}'&&!--depth){try{const parsed=JSON.parse(text.slice(start,end+1));if(typeof parsed.speech==='string')data=parsed;}catch{}break;}
  }
  if(data)break;
 }
 if(!data&&/```|[{}]|"(?:speech|action)"\s*:/.test(text))throw Error('Broken actor protocol');
 const speech=visibleShowText(data?.speech??text);
 if(!speech||/[A-Za-z]{3,}/.test(speech)||!/[А-Яа-яЁё]/.test(speech)||/```|[{}]|"(?:speech|action)"\s*:/.test(speech))throw Error('Invalid actor format or language');
 const a=data?.action;
 return {speech,action:a&&['hit','bind','kill','release','escape','surrender'].includes(a.kind)?{kind:a.kind,target:typeof a.target==='string'?a.target:''}:null};
}
function describeState(actors,state){
 return actors.map(a=>{
  const s=state.get(a.name);
  return a.name+': '+(!s.alive?(feminine(a.name)?'погибла; больше не говорит':'погиб; больше не говорит'):s.detained?(feminine(a.name)?'задержана полицией; вне сцены':'задержан полицией; вне сцены'):!s.present?(feminine(a.name)?'ушла из сцены':'ушёл из сцены'):[
   s.injured?(feminine(a.name)?'ранена':'ранен'):(feminine(a.name)?'невредима':'невредим'),s.bound?(feminine(a.name)?'связана; не может нападать':'связан; не может нападать'):(feminine(a.name)?'свободна':'свободен')
  ].join(', '));
 }).join('\n');
}
function resolveAction(actor,action,actors,state,random,book){
 if(!action)return null;
 const self=state.get(actor.name);
 if(!aliveHere(self))return null;
 const target=actors.find(a=>a.name===action.target),other=target&&state.get(target.name);
 if(self.bound&&action.kind!=='release')return {text:actor.name+' пытается действовать, но связанные руки мешают.',target:null};
 if(action.kind==='surrender'){
  if(!book.policeAvailable)return null;
  self.detained=true;self.present=false;return {text:actor.name+' выходит к полиции и сдаётся. '+actor.name+(feminine(actor.name)?' задержана':' задержан')+'; впереди допрос и риск тюремного срока.',target:null};
 }
 if(action.kind==='escape'){
  self.present=false;return {text:actor.name+' покидает комнату. Остальные остаются с последствиями его ухода.',target:null};
 }
 if(!other||!aliveHere(other))return null;
 if(action.kind==='release'){
  if(!other.bound)return null;
  if(target.name===actor.name&&clampRandom(random)<.5)return {text:actor.name+' пытается освободиться, но пока не может разорвать путы.',target:actor.name};
  other.bound=false;return {text:actor.name+' освобождает '+objectName(target.name)+'.',target:target.name};
 }
 if(target.name===actor.name)return null;
 if(action.kind==='hit'){
  other.injured=true;return {text:actor.name+' ударяет '+objectName(target.name)+'. '+target.name+(feminine(target.name)?' ранена':' ранен')+'; нападение видят остальные.',target:target.name};
 }
 if(action.kind==='bind'){
  if(other.bound)return null;
  if(!other.injured&&clampRandom(random)<.35)return {text:actor.name+' пытается связать '+objectName(target.name)+', но тот вырывается.',target:target.name};
  other.bound=true;return {text:actor.name+' связывает '+objectName(target.name)+'. '+target.name+' остаётся в сознании.',target:target.name};
 }
 if(action.kind==='kill'){
  // A lethal attempt can fail. Confirmed outcomes, not the actor's boasts, become shared facts.
  if(clampRandom(random)<(other.bound?.85:.5)){
   other.alive=false;return {text:actor.name+' совершает смертельное нападение на '+objectName(target.name)+'. '+target.name+' погибает. Это произошло на глазах остальных.',target:target.name};
  }
  other.injured=true;return {text:actor.name+' пытается убить '+objectName(target.name)+', но '+target.name+' выживает и получает ранение.',target:target.name};
 }
 return null;
}
function nextActor(actors,state,counts,last,pending,history,random){
 let choices=actors.filter(a=>aliveHere(state.get(a.name)));
 if(choices.length>1)choices=choices.filter(a=>a.name!==last);
 const minimum=Math.min(...choices.map(a=>counts.get(a.name)||0));
 // A real action can earn an immediate response, but verbal name-dropping cannot starve the cast.
 const responding=choices.find(a=>a.name===pending&&(counts.get(a.name)||0)<=minimum+1);
 if(responding)return responding;
 const leastUsed=choices.filter(a=>(counts.get(a.name)||0)===minimum);
 const mentioned=leastUsed.filter(a=>String(history.at(-1)?.text||'').includes(a.name));
 if(mentioned.length)return mentioned[Math.floor(clampRandom(random)*mentioned.length)];
 return leastUsed[Math.floor(clampRandom(random)*leastUsed.length)];
}
export async function runLiveShow({agents,scenario,cast,extra,scenes,tonality,request,emit,signal,onProgress,book,tone,speech,clip,silenceLine,random=Math.random}){
 const actors=cast.map(c=>({...c,agent:agents.find(a=>a.id===c.provider)}));
 const npcs=(book.npcs||[]).map(n=>({...n}));
 const participants=[...actors,...npcs];
 const state=new Map(participants.map(a=>[a.name,{alive:a.alive!==false,present:a.present!==false,injured:!!a.injured,bound:!!a.bound,detained:false}]));
 const counts=new Map(),silences=new Map(),failures=new Map(),successes=new Map(),dialogue=[],all=[],facts=[];
 const output=e=>{all.push(e);emit(e);};
 let pending=null,last=null;
 const maxTurns=Math.min(4,actors.length),director=String(extra||'').slice(0,5000);
 // Select one pressure event for diner. The freely improvised heist has no authored incident.
 const incident=scenario.id==='diner'?DINER_INCIDENTS[Math.floor(clampRandom(random)*DINER_INCIDENTS.length)]:null;
 for(let round=1;round<=scenes;round++){
  abort(signal);
  const stage='Сцена '+round+' · '+(round===1?'Начало':'Продолжение');
  onProgress({stage,status:'working'});
  if(round===1){output({id:'narrator',name:'Сцена',nickname:'Начало',stage,text:book.place+' '+book.conflict,show:true,narrator:true});}
  if(round===2&&incident&&actors.some(a=>aliveHere(state.get(a.name)))){
   facts.push(incident.text);output({id:'narrator',name:'Сцена',nickname:'Событие',stage,text:incident.text,show:true,narrator:true,incident:incident.id});
  }
  const expandedTurn=Math.floor(clampRandom(random)*maxTurns);
  for(let turn=0;turn<maxTurns;turn++){
   abort(signal);
   const part=nextActor(actors,state,counts,last,pending,dialogue,random);
   if(!part)break;
   counts.set(part.name,(counts.get(part.name)||0)+1);pending=null;last=part.name;
   const expanded=turn===expandedTurn,maxWords=expanded?160:turn%2?90:45,maxChars=expanded?1150:maxWords===90?650:360;
   const system=[
    'ТЫ — ТОЛЬКО '+part.name+'. Тебя играет самостоятельная модель '+part.agent.name+'.',
    ACTOR_FICTION_CONTEXT,book.castingContext||'',
    'ХАРАКТЕР: '+part.description+'. ТВОИ ЛИЧНЫЕ СВЕДЕНИЯ И ЦЕЛЬ: '+book.roles[part.slot],
    'ЖАНР: '+scenario.genre+'. ИСХОДНОЕ МЕСТО: '+book.place,
    'ОБЩАЯ СИТУАЦИЯ: '+book.conflict+' СТАВКИ: '+book.stakes,
    'ГРАНИЦЫ ЗНАНИЯ: знаешь только свою роль, свои личные сведения, общую ситуацию, услышанное и подтверждённые события. Чужие секреты и мысли неизвестны. Утверждения собеседников могут быть ложью. Готового виновника, обязательного поворота и канонического финала тебе не сообщают.',
    'ГОВОРЯЩИЕ УЧАСТНИКИ: '+actors.map(a=>a.name+' ('+a.agent.name+')').join('; ')+'. Не придумывай реплики и поступки отсутствующих ролей.'+(npcs.length?' Также присутствуют: '+npcs.map(n=>n.name).join(', ')+'. Они не говорят за кадром; физические действия с ними доступны по точному имени.':''),
    'МАНЕРА: '+tone,speech,
    'РЕЧЕВОЙ ОРИЕНТИР: '+(book.voiceProfiles?.[part.slot]?.prototype||part.name)+'. Заимствуй только манеру, не биографию, знания и отношения прототипа.',
    'ЛИЧНЫЙ РЕЧЕВОЙ АРХЕТИП: '+book.archetypes[part.slot],
    'ЦИТАТНЫЕ ОПОРЫ: '+(book.quoteAnchors?.[part.slot]||[]).map(q=>'«'+q.text+'» ('+q.speaker+'; '+q.work+'). Речевой приём: '+q.pattern).join(' '),
    'АДАПТАЦИЯ ЦИТАТЫ: бери опору за основу ответа: сохраняй узнаваемую конструкцию, ритм, лексику и эмоциональный поворот, подгоняй предмет и адресата под услышанное. Подходящий короткий оборот можно сохранить дословно. Имена, родство, способности и обстоятельства источника не являются фактами этой сцены. Грубость опор ограничена выбранной манерой. Не повторяй одну реплику по кругу, не склеивай заготовки и не объясняй зрителю, что цитируешь.',
    'Примеры в архетипе показывают речь, не являются цитатами или обязательными репликами и не сообщают новых фактов сцены. Придумывай собственный ответ на услышанное; грубость примеров подчиняется выбранной манере.',
    'ПРИОРИТЕТ ГОЛОСА: общий режим меняет остроту конфликта, но не личность, лексику и ритм героя. Даже без тормозов сдержанный язвит холодно, прямой рубит коротко, дипломат давит учтиво. Не копируй манеру и ругань предыдущего говорящего. Для известных героев опирайся на узнаваемый образ из произведения; для реальных личностей — на публичную манеру, без притязания на достоверность частной речи. Развивай смысл цитатных опор по текущему разговору, а не перечисляй фирменные словечки.',
    'ЖИВОЙ ТЕМП: выбирай длину по ситуации. Резкая реакция может занимать одну фразу, спор или признание — несколько предложений. Не заполняй лимит ради длины. Сейчас допустимо до '+maxWords+' слов, без заголовков и отчётов.',
    'ДРАМА И ДЕЙСТВИЯ: '+book.actionContext+' Можно перейти от слов к поступкам: ударить, попытаться связать, освободить, совершить смертельное нападение, уйти'+(book.policeAvailable?' или сдаться полиции':'')+'. Это художественная сцена; последствия описывай ясно, без натуралистических подробностей. Раненый остаётся раненым, погибший не возвращается. Уход, травма, предательство, смерть и арест меняют отношения и дальнейшие решения. Сохраняй ставки и характер жанра.',
    'СВОБОДА: можешь врать, блефовать, торговаться, отступать, обвинять и менять цель после событий. Нет обязательного признания или счастливого исхода. Не действуй и не говори за всех.',
    'ЯЗЫК: вся речь и ремарки только по-русски, без английских слов и вставок. Ремарки и описания своих действий в speech оформляй курсивом: *(отодвигает чашку)*. Прямую речь оставляй обычным текстом. ФОРМАТ (служебный, зритель увидит только речь и сцену): верни JSON {"speech":"реплика и при желании короткая ремарка от своего лица","action":null}. Если совершаешь физическое действие, action={"kind":"hit|bind|kill|release|escape|surrender","target":"точное имя участника"}. Для ухода или сдачи полиции target пустой. '+(!book.policeAvailable?'В этом месте нет доступной полиции: surrender недоступен. ':'')+' Сдаться может только твой персонаж; не объявляй арест других без подтверждения сцены. Угроза словами не равна нападению: для неё action=null. Не пиши успешное ранение, связывание или смерть в speech вместо action. Других действий за персонажей не назначай. Верни только один JSON-объект, без текста вне JSON и без блоков кода.'
   ].filter(Boolean).join('\n');
   const previous=dialogue.at(-1);
   const fixed=[
    'КРУГ РАЗГОВОРА '+round+'. ДАВЛЕНИЕ СИТУАЦИИ: '+book.pressure+' Не выдумывай обратный отсчёт или новые сроки. Развивай последствия уже состоявшихся решений.',
    'РАЗВИТИЕ КОНФЛИКТА: '+conversationPhase(round,scenes)+' Не повторяй уже предъявленное требование без нового аргумента, цены или собственного поступка. Смена этапа не создаёт новых фактов и не требует насилия. Чужие тайны остаются неизвестными.',
    'ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ: '+(director||'Развивай ситуацию из роли и происходящего; конец не задан.'),
    'ТЕКУЩЕЕ СОСТОЯНИЕ (важнее исходных сведений):\n'+describeState(participants,state),
    'ПОДТВЕРЖДЁННЫЕ ДЕЙСТВИЯ И СОБЫТИЯ:\n'+(tailWithin(facts,2200)||'Пока нет.'),
    previous?.silent?'Предыдущий персонаж промолчал. '+(['wild','brutal'].includes(tonality)?'НАЧНИ с жёсткой реакции: потребуй ответа, обвини или используй паузу против него.':'Отреагируй на паузу в своём характере.'):'',
    'СЕЙЧАС ГОВОРИТ '+part.name+'. Учитывай последствия и отвечай на услышанное.'
   ].filter(Boolean).join('\n');
   const history=tailWithin(dialogue.map(e=>e.nickname+': '+e.text),Math.max(0,9400-fixed.length));
   const user=fixed+'\nПРЕДЫДУЩИЕ РЕПЛИКИ:\n'+(history||'Разговор начинается.');
   let event;
   try{
    const raw=await request(part.agent,[{role:'system',content:system},{role:'user',content:user}],signal,{stage:'intermediate',step:stage,format:'show',maxWords,maxChars:2400,liveShow:true,outputSchema:'actor'});
    const reply=parseLiveReply(raw);
    event={id:part.provider,name:part.agent.name,nickname:part.name,stage,text:formatShowSpeech(clip(reply.speech,maxChars)),show:true};
    output(event);dialogue.push(event);successes.set(part.provider,(successes.get(part.provider)||0)+1);
    const action=resolveAction(part,reply.action,participants,state,random,book);
    if(action){
     facts.push(action.text);pending=action.target;
     const consequence={id:'narrator',name:'Сцена',nickname:'Действие',stage,text:'*('+action.text+')*',show:true,narrator:true,action:true};
     output(consequence);dialogue.push(consequence);
    }
   }catch(e){
    if(signal?.aborted||e.name==='AbortError')throw e;
    const count=silences.get(part.name)||0;silences.set(part.name,count+1);failures.set(part.provider,(failures.get(part.provider)||0)+1);
    event={id:part.provider,name:part.agent.name,nickname:part.name,stage,text:state.get(part.name).bound?'*('+part.name+' молчит, оставаясь связанным.)*':silenceLine(scenario.id,part.name,count),show:true,silent:true};
    dialogue.push(event);output(event);
   }
  }
  onProgress({stage,status:'done'});
 }
 abort(signal);onProgress({stage:'Эпилог',status:'working'});
 const answered=actors.filter(a=>successes.has(a.provider));
 const narrator=(answered.length?answered:actors).slice().sort((a,b)=>(failures.get(a.provider)||0)-(failures.get(b.provider)||0))[0];
 const stateText=describeState(participants,state);
 const endingContext='ПОДТВЕРЖДЁННЫЕ СОБЫТИЯ:\n'+(tailWithin(facts,3000)||'Нет.')+'\nСОСТОЯНИЕ ПЕРСОНАЖЕЙ:\n'+stateText;
 const outcomeIds=book.outcomes.map(o=>o.id);
 const endingGuide=outcomeIds.length?'ТРИ ВОЗМОЖНЫЕ РАЗВЯЗКИ: выбери ровно одну по состоявшимся событиям. Условия проверяй по разговору и состоянию, не дописывай события ради выбранного исхода. Если подходят несколько, предпочти подтверждённые необратимые последствия. Если ни одна разрешённая развязка не подтверждена, выбери '+book.fallbackOutcome+'. В JSON добавь поле \"outcome\" с точным id.\n'+book.outcomes.map(o=>o.id+' — '+o.title+': '+o.condition).join('\n'):'СВОБОДНЫЙ ФИНАЛ: у этого шоу нет списка исходов. Выведи последствия из разговора, не навязывая победителя или примирение.';
 let ending='',outcome=null;
 try{
  const rawEnding=await request(narrator.agent,[
   {role:'system',content:'Ты режиссёр эпилога шоу «'+scenario.title+'». Жанр: '+scenario.genre+'. Напиши выразительный последний кадр и конкретные последствия в 1–3 абзацах, до 220 слов. Не пересказывай протокол спора: покажи цену решений, потерю доверия, травмы, смерть, арест, угрозу тюремного срока, уход или оставшийся конфликт, если они реально случились. Не придумывай новое убийство, спасение или примирение ради красивого конца. Не воскрешай погибших, не освобождай связанных и не возвращай ушедших без произошедшего действия. Не выдумывай судебный приговор: задержание означает риск тюрьмы, а не уже назначенный срок. Слова персонажа о виновности или деньгах не превращай в доказанный факт. Финал может быть трагическим, неоднозначным или открытым. Если разговора не было, прямо скажи это. Никакой заранее заданной развязки. '+EPILOGUE_FORMAT+'\n'+(book.castingContext||'')+'\n'+endingGuide},
   {role:'user',content:endingContext+'\nСОСТОЯВШИЙСЯ РАЗГОВОР:\n'+tailWithin(dialogue.filter(e=>!e.silent).map(e=>e.nickname+': '+e.text),Math.max(0,9300-endingContext.length))}
  ],signal,{stage:'final',step:'Эпилог',format:'show',maxWords:220,maxChars:1800,liveShow:true,outputSchema:'epilogue',outcomeIds});
  ending=clip(parseShowEpilogue(rawEnding,outcomeIds),1800);
  if(outcomeIds.length)outcome=JSON.parse(visibleShowText(rawEnding).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')).outcome;
 }catch(e){if(signal?.aborted||e.name==='AbortError')throw e;}
 if(!ending&&outcomeIds.length&&dialogue.some(e=>!e.silent&&!e.narrator)){
  const irreversible=actors.some(a=>{const s=state.get(a.name);return !s.alive||!s.present||s.injured||s.bound;});
  outcome=irreversible&&scenario.id!=='court'?book.outcomes[1].id:book.fallbackOutcome;
 }
 if(!ending)ending=!dialogue.some(e=>!e.silent&&!e.narrator)?'Участники не смогли ответить. Разговор не состоялся.':facts.length?facts.join('\n')+'\n\n'+stateText:dialogue.some(e=>!e.silent)?'Разговор оборвался без общей развязки. Состоявшиеся реплики сохранены выше.':'Участники не смогли ответить. Разговор не состоялся.';
 output({id:narrator.provider,name:narrator.agent.name,nickname:'Эпилог',stage:'Эпилог',show:true,final:true,text:ending,...(outcome?{outcome,outcomeTitle:book.outcomes.find(o=>o.id===outcome)?.title}:{})});
 onProgress({stage:'Эпилог',status:'done'});onProgress({stage:'Готово',status:'done'});
 return all;
}

function conversationPhase(round,total){
 const phases=[
  'Обозначь свою позицию и зацепись за конкретные слова собеседника.',
  'Проверь чужие обещания вопросом или предложи свою цену.',
  'Ответь на возражение; предложи конкретный шаг вместо повторения спора.',
  'Оцени, кому теперь доверяешь; можешь изменить союз или собственную тактику.',
  'Разбери последствия того, что уже произошло. Сказанное не делает обвинение доказанным.',
  'Проверь, чем готов рискнуть сам; можно принять, отвергнуть или изменить предложение.',
  'Потребуй ответа за уже принятые решения или действуй в пределах своей роли.',
  'Отреагируй на достигнутое. Конфликт может остаться открытым; не объявляй общий финал.'
 ];
 return phases[Math.min(7,Math.floor((round-1)*8/total))];
}
