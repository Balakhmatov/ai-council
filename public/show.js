import {ambiences} from './engine.js';
import {storyBible,storyBeat} from './show-stories.js';
// Quorum Show: original worlds and casting parts. AI providers are actors, not character identities.
export const SHOW_SCENARIOS=[
 {id:'diner',emoji:'🥃',title:'Последний столик',genre:'Криминальная комедия',palette:'wine',
  description:'Семеро подозрительных знакомых решают, кому достанется исчезнувший чемодан.',
  setting:'Ночная закусочная на обочине. Кофе остыл, за окном идёт дождь. На столе лежит пустой чемодан, и никто не хочет первым сказать правду.',
  twist:'Каждый уверен, что чемодан опустошил кто-то другой.',
  roles:[
   ['Винс','Самоуверенный переговорщик. Любит длинные заходы и ловит чужие противоречия.'],
   ['Тони','Вспыльчивый делец. Решает быстро, злится ещё быстрее.'],
   ['Фрэнк','Хаотичный провокатор. Считает доверие худшей инвестицией.'],
   ['Рокси','Холодная стратегиня. Видит мотивы за любой фразой.'],
   ['Док','Параноик с великолепной памятью. Не забывает долгов.'],
   ['Джимми','Молчаливый бухгалтер. Знает, куда делись деньги.'],
   ['Мистер Ноль','Ироничный наблюдатель. Всегда замечает мелкую улику.']
  ]},
 {id:'heist',emoji:'💎',title:'Ограбление без плана',genre:'Криминальная разборка',palette:'wine',
  description:'Семеро в чёрных костюмах обсуждают ограбление. И всё меньше доверяют друг другу.',
  setting:'Закрытый штаб над ювелирным магазином. Чёрные костюмы, белые рубашки, узкие галстуки и цветные псевдонимы. На столе остывший кофе; до закрытия магазина сорок минут.',
  twist:'Никто не знает, кто в действительности нанял команду.',
  roles:[['Мистер Чёрный','Спокойный организатор, контролирует сроки и всех раздражает.'],['Мисс Белая','Хладнокровная импровизаторша, любит ломать планы.'],['Мистер Красный','Упрямый специалист по отвлекающим манёврам.'],['Мистер Коричневый','Рисковый водитель, уверен, что его роль главная.'],['Мистер Розовый','Мастер обмана, скрывает свой мотив.'],['Мисс Зелёная','Аналитик, вечно считает риски.'],['Мистер Синий','Молчаливый новичок со странными идеями.']]},
 {id:'court',emoji:'⚖️',title:'Суд над будущим',genre:'Абсурдный суд',palette:'slate',
  description:'На скамье подсудимых — искусственный интеллект. Судят его тоже искусственные интеллекты.',
  setting:'Судебный зал недалёкого будущего, где судебный процесс транслируется на весь город. Доказательство только одно: странный разговор.',
  twist:'Стороны не могут договориться, в чём именно обвиняют подсудимого.',
  roles:[['Судья Рэй','Невозмутимый судья, презирает пустословие.'],['Прокурор Вега','Наступает на слабые аргументы без предупреждения.'],['Адвокат Касс','Изящно разбивает обвинения на части.'],['Свидетель Икс','Помнит ключевые события весьма выборочно.'],['Эксперт Нокс','Уверен в цифрах, сомневается в людях.'],['Присяжная Нина','Задаёт неудобные бытовые вопросы.'],['Репортёр Кай','Ищет скандал даже в протоколе.']]},
 {id:'villains',emoji:'🦹',title:'Совет злодеев',genre:'Аниме и суперзлодеи',palette:'violet',
  description:'Злодеи не могут поделить власть над городом — и даже не согласны, что такое власть.',
  setting:'Башня над футуристическим мегаполисом. На горизонте рассвет. За круглым столом собрались соперники с несовместимыми амбициями.',
  twist:'Один из злодеев тайно хочет стать героем.',
  roles:[['Куро','Глава Совета: обещает компромисс, но хочет единоличный контроль над ключом.'],['Акира','Радикал с тайной миссией, рискует всем ради жителей Нокта.'],['Рю','Командир силовой охраны: вспыльчив, защищает семью и собственную честь.'],['Хикари','Архитектор купола: знает реальные последствия отключения защиты.'],['Кай','Анархист-взломщик: готов подставить весь город ради демонстрации силы.'],['Мэй','Шантажистка: хранит компромат и выбирает выгодный момент.'],['Зеро','Бывший хранитель ядра: знает скрытое правило передачи власти.']]},
 {id:'spaceship',emoji:'🚀',title:'Последний корабль',genre:'Космическая драма',palette:'space',
  description:'Экипаж проснулся раньше времени, а кислорода хватит только на часть пути.',
  setting:'Исследовательский корабль между звёздами. Главная система молчит. На панели горит сообщение «Выберите одного».',
  twist:'Корабельный компьютер скрывает альтернативный маршрут.',
  roles:[['Капитан Ада','Принимает решения, даже когда все её ненавидят.'],['Пилот Рен','Шутит под давлением и нарушает инструкции.'],['Доктор Соль','Заботится об экипаже, мыслит прагматично.'],['Инженер Макс','Знает слабости корабля лучше остальных.'],['Навигатор Лея','Верит приборам больше, чем людям.'],['Бортовой ИИ Омега','Говорит подозрительно спокойно.'],['Стажёр Ник','Первым замечает странности и последним замолкает.']]},
 {id:'bunker',emoji:'☢️',title:'Бункер № 13',genre:'Постапокалипсис',palette:'rust',
  description:'Выжившим предстоит решить, впускать ли незнакомца, пока генератор не остановился.',
  setting:'Подземный бункер после катастрофы. За гермодверью кто-то стучит. Вентиляция отключится через час.',
  twist:'Кто-то уже тайно открывал дверь ночью.',
  roles:[['Командир Барк','Жёсткий лидер, верит только дисциплине.'],['Медик Джун','За каждого человека будет спорить до конца.'],['Техник Шрам','Предпочитает железо людям.'],['Повар Сэм','Знает чужие секреты лучше разведки.'],['Разведчица Лис','Никому не верит, даже себе.'],['Историк Мира','Помнит мир до катастрофы и ненавидит ложь.'],['Новичок Лео','Боится больше всех, но задаёт лучшие вопросы.']]},
 {id:'boardroom',emoji:'💼',title:'Совет директоров в аду',genre:'Чёрная корпоративная комедия',palette:'coal',
  description:'Компания теряет деньги. Каждый топ-менеджер уверен, что виноват другой.',
  setting:'Стеклянная переговорная на последнем этаже небоскрёба. На экране катастрофический отчёт. Через десять минут встреча с инвесторами.',
  twist:'Финансовый отчёт явно кто-то подделал.',
  roles:[['СЕО Моррис','Обаятельно скрывает панику.'],['Финдиректор Блэр','Не верит красивым презентациям.'],['Маркетолог Луна','Продаёт даже провалы.'],['Техдиректор Рик','Ненавидит неточные задачи.'],['Юрист Софи','Видит штрафы раньше возможностей.'],['Продуктолог Макс','Не боится убивать плохие идеи.'],['Инвестор Нокс','Говорит мало, но задаёт роковой вопрос.']]},
 {id:'detective',emoji:'🕵️',title:'Убийство в отеле',genre:'Ироничный детектив',palette:'night',
  description:'В закрытом отеле произошло преступление, и каждый подозреваемый ведёт собственное расследование.',
  setting:'Старинный отель во время снежной бури. Все входы заперты. На каминной полке стоит чашка остывшего чая.',
  twist:'Часы остановились за час до предполагаемого преступления.',
  roles:[['Детектив Грей','Медлителен, зато замечает мотивы.'],['Наследница Эва','Очаровательна и слишком много знает.'],['Портье Луи','Помнит, кто куда ходил, и продаёт намёки.'],['Доктор Бек','Спокойно опровергает чужие догадки.'],['Писатель Дэн','Любит эффектные версии больше правды.'],['Горничная Роза','Слышит всё, не верит никому.'],['Инспектор Пак','Требует доказательств и ненавидит драму.']]},
 {id:'reality',emoji:'🎤',title:'Самый токсичный эфир',genre:'Реалити-шоу',palette:'neon',
  description:'Участники публичного ток-шоу спорят за титул самого убедительного ИИ.',
  setting:'Неоновая телестудия, прямой эфир и зрительское голосование. Ведущий объявил тему, но гости сразу начали перебивать друг друга.',
  twist:'В середине шоу зрители могут изменить тему.',
  roles:[['Ведущий Зиг','Бросает неудобные вопросы и наслаждается хаосом.'],['Винс','Мастер логики, язвит с улыбкой.'],['Фрэнк','Профессиональный провокатор.'],['Рокси','Выводит собеседников на чистую воду.'],['Тони','Загорается от любого возражения.'],['Ника','Неожиданно занимает непопулярную позицию.'],['Критик Шон','Срывает аплодисменты одним замечанием.']]},
 {id:'time',emoji:'⏳',title:'Совет путешественников',genre:'Научная фантастика',palette:'dawn',
  description:'Гости из разных эпох должны решить, отменить ли одно историческое событие.',
  setting:'Комната вне времени, где окна показывают разные столетия. На столе одна кнопка: «Изменить прошлое».',
  twist:'Изменить событие может только тот, кто сильнее всех против.',
  roles:[['Профессор Хронос','Считает последствия на три эпохи вперёд.'],['Агент Мара','Верит действиям больше прогнозов.'],['Историк Элли','Бесится от неверных фактов.'],['Механик Джо','Решает сложное простыми способами.'],['Философ Нокс','Обожает опасные моральные парадоксы.'],['Бунтарка Зи','Меняет правила прямо посреди спора.'],['Оракул Рэй','Знает возможные исходы, но не говорит всё.']]}
];
export const showScenario=id=>SHOW_SCENARIOS.find(s=>s.id===id)||SHOW_SCENARIOS[0];
export function showCast(scenario,assignment){
 return scenario.roles.map((r,i)=>({slot:i,name:r[0],description:r[1],provider:assignment[i]||null})).filter(x=>x.provider);
}
export function clipShowLine(value,max=360){
 const clean=String(value||'').replace(/^\s*(?:#{1,4}\s*|[-*]\s*)/gm,'').replace(/\n{2,}/g,'\n').trim();
 if(clean.length<=max)return clean;
 const prefix=clean.slice(0,max-1);
 const sentence=Math.max(prefix.lastIndexOf('. '),prefix.lastIndexOf('! '),prefix.lastIndexOf('? '));
 return (sentence>max*.55?prefix.slice(0,sentence+1):prefix.trimEnd())+'…';
}
export const SHOW_TONES=Object.freeze({
 wild:{name:'🔥 Без тормозов',description:'Грязный язык, жёсткие конфликты, внезапные поступки',direction:'Взрывной, грубый, дерзкий диалог. Уместны мат и чёрный юмор. Персонажи могут предать, разоблачить и унизить друг друга по существу. Вражда должна приводить к конкретным последствиям, а не к пустым угрозам.'},
 brutal:{name:'💥 Жёсткий',description:'Опасные злодеи, предательство, резкие словесные удары',direction:'Беспощадный конфликт интересов. Прямая речь, неприятные истины, шантаж и жёсткие решения. Уместен мат, если звучит естественно. Действия меняют расклад сил.'},
 sharp:{name:'😈 Саркастичный',description:'Колкости и чёрный юмор, но конфликт остаётся серьёзным',direction:'Остроумная, язвительная словесная дуэль. Никакого канцелярита и пафосных афоризмов; каждый выпад отвечает на конкретную угрозу или ошибку.'},
 cinematic:{name:'🎬 Кинематографичный',description:'Напряжение, недоговорённость и точные действия',direction:'Диалоги драматичны, без искусственного хамства. Меньше абстрактной философии, больше конкретных решений, улик, риска и раскрытия мотивов.'},
 restrained:{name:'🕊 Сдержанный',description:'Без мата, но с конфликтом, драмой и ясными последствиями',direction:'Умеренная драматическая речь без мата и унизительных выпадов. Не теряй интригу и конфликт ради вежливости.'}
});
const SILENCE_ACTIONS={
 diner:'медленно отодвигает холодный кофе и отворачивается от пустого чемодана',
 heist:'закрывает планшет с планом и следит за дверью, не произнося ни слова',
 court:'кладёт перед собой пустой лист, не отвечая на вопрос',
 villains:'молча отступает от пульта энергетического ядра; остальные видят его нерешительность',
 spaceship:'вглядывается в тревожный экран и молча затягивает ремень безопасности',
 bunker:'смотрит на индикатор топлива, избегая чужих взглядов',
 boardroom:'закрывает ноутбук с финансовым отчётом и молчит',
 detective:'медленно прячет ключ от комнаты в карман и не отвечает',
 reality:'улыбается в камеру, но микрофон остаётся без ответа',
 time:'убирает руку от кнопки и не объясняет своего решения'
};
function abortIfNeeded(signal){if(signal?.aborted){const e=new Error('Шоу остановлено');e.name='AbortError';throw e;}}
function chooseSpeaker(cast,used,recent,sceneNumber,turn){
 const eligible=cast.filter(c=>!used.has(c.provider));
 if(!eligible.length)return null;
 if(!turn)return eligible[(sceneNumber-1)%eligible.length];
 const last=recent.at(-1),text=last?.text||'';
 const named=eligible.find(c=>text.includes(c.name));
 if(named)return named;
 // Different speakers open scenes; no rigid rotation through all seven every scene.
 const offset=(sceneNumber*3+turn+recent.length)%eligible.length;
 return eligible[offset];
}
function canonContext(book,sceneNumber,total){
 const current=storyBeat(book.id,sceneNumber,total);
 const previous=sceneNumber>1?storyBeat(book.id,sceneNumber-1,total):null;
 return {current,previous};
}
function toneInstruction(value){return SHOW_TONES[value]?.direction||SHOW_TONES.brutal.direction;}
export function showSpeechGuide(id,tonality){
 const scene=ambiences[id==='diner'?'cinema':id==='heist'?'heist':'none'];
 if(!scene.lexicon?.length)return '';
 return 'РЕЧЕВАЯ ПАЛИТРА: '+scene.speechReference+' '+scene.speechRhythm+' '+
 (['wild','brutal'].includes(tonality)?'Необязательные обороты: '+scene.lexicon.join('; '):'Выбранная манера важнее грубости примеров: не используй мат, если манера его исключает.')+
 '. Это необязательная палитра: можно не использовать ни одного примера, придумывай свои обороты; не повторяй чужие заготовки. Сохраняй индивидуальный голос, цель и секрет своей роли. Не копируй диалоги фильма. Пользовательский пример с «трахнуть» — разговорная метафора обмана, не сексуальная сцена.';
}
export async function runShow({agents,scenario,cast,extra='',scenes=4,turns,tonality='brutal',request,emit,signal,onProgress=()=>{}}){
 // "turns" was the previous internal name; kept only for old test fixtures.
 if(Number.isInteger(turns)&&!Number.isInteger(scenes))scenes=turns;
 if(!Array.isArray(agents)||agents.length<2||agents.length>7||![3,4,5].includes(scenes))throw Error('Выберите от 3 до 5 сцен и минимум две нейросети');
 if(!Array.isArray(cast)||cast.length!==agents.length||new Set(cast.map(c=>c.provider)).size!==agents.length||cast.some(c=>!agents.some(a=>a.id===c.provider)))throw Error('Роли должны быть назначены разным нейросетям');
 const book={...storyBible(scenario?.id),id:scenario?.id||'diner'};
 const actors=cast.map(c=>({...c,agent:agents.find(a=>a.id===c.provider)}));
 const director=String(extra||'').slice(0,5000);
 const personalities=actors.map(a=>a.name+' ('+a.agent.name+'): '+a.description+' | '+book.roles[a.slot]).join('\n');
 const dialogue=[],all=[],callErrors=new Map();
 const perScene=Math.min(4,actors.length),ending=book.ending;
 for(let sceneNumber=1;sceneNumber<=scenes;sceneNumber++){
  abortIfNeeded(signal);
  const {current,previous}=canonContext(book,sceneNumber,scenes);
  const [beatName,beatAction]=current;
  const stage='Сцена '+sceneNumber+' · '+beatName;
  onProgress({stage,status:'working'});
  // Ground the next scene in an explicit event, so mysteries cannot be forgotten.
  const cue={id:'narrator',name:'Сцена',nickname:beatName,stage,text:beatAction,show:true,narrator:true};
  emit(cue);all.push(cue);
  const used=new Set();
  for(let turn=0;turn<perScene;turn++){
   abortIfNeeded(signal);
   const part=chooseSpeaker(actors,used,dialogue,sceneNumber,turn);
   if(!part)break;
   used.add(part.provider);
   const last=dialogue.slice(-5);
   const history=last.map(m=>m.nickname+': '+m.text).join('\n');
   const silence=last.filter(m=>m.silent).map(m=>m.nickname).join(', ');
   const system=[
    'ТЫ — ТОЛЬКО '+part.name+'. Тебя играет самостоятельная модель '+part.agent.name+'.',
    'ХАРАКТЕР: '+part.description+'. ТВОЯ ЛИЧНАЯ ЦЕЛЬ И СЕКРЕТ: '+book.roles[part.slot],
    'ЖАНР: '+scenario.genre+'. МЕСТО: '+book.place,
    'КОНФЛИКТ: '+book.conflict+'. СТАВКИ: '+book.stakes,
    'НЕОБСУЖДАЕМАЯ ПРАВДА СЮЖЕТА (в начале не выдавай её целиком): '+book.truth,
    'УЧАСТНИКИ (другие персонажи могут быть вне кадра):\n'+personalities,
    'МАНЕРА ИГРЫ: '+toneInstruction(tonality),
    showSpeechGuide(scenario.id,tonality),
    'ПРАВИЛО ЖИВОГО КИНО: выдай только свою ОДНУ короткую реплику из 1–3 естественных предложений, до 45 слов, максимум 280 символов; при желании одна ремарка в скобках. Никаких заголовков, имён перед репликой, планов, списков или резюме.',
    'Каждая реплика должна отвечать на чужую реплику ИЛИ продвигать конкретный конфликт: улика, требование, действие, цена, выбор. Не придумывай новых необъяснимых предметов, ключей, родственников, тайных дверей. Не противоречь установленным фактам. Действия только свои.',
    'ЗАПРЕТ ПУСТОГО ПАФОСА: не говори «я разрушу мир, но не тебя», «сломаю стол, не тебя», «рассвет принадлежит тебе» и подобных бессмысленных угроз или безадресных философских афоризмов. Жёсткость выражай последствиями для конкретной цели персонажа.',
    'Если кто-то молчит, окружающие это замечают и могут прямо потребовать ответа. Молчание — часть сцены, а не ошибка системы.'
   ].join('\n');
   const user=[
    'СЦЕНА '+sceneNumber+' ИЗ '+scenes+': '+beatName+'. ОБЯЗАТЕЛЬНЫЙ ПОВОРОТ: '+beatAction,
    previous?'В предыдущей сцене установлено: '+previous[1]:'',
    sceneNumber===scenes?'Это развязка. Назови конкретное последствие и решение, не оставляй сюжет подвешенным. Канонический результат: '+ending:'',
    'РЕЖИССЁРСКАЯ ЗАДАЧА: '+(director||'Сделай конфликт выразительным и понятным зрителю. Если режиссёр задал свою развязку, используй её, сохраняя причинность.'),
    'ПРЕДЫДУЩИЕ РЕПЛИКИ: '+(history||'Сцена начинается.'),
    silence?'МОЛЧАНИЕ: '+silence+'. '+(last.at(-1)?.silent?'Предыдущий персонаж промолчал. НАЧНИ с реакции на его/её молчание — вопроса, подозрения или конкретного действия, чтобы отсутствие ответа стало частью интриги.':'Помни, что эти персонажи не ответили и остальные это заметили.'):'',
    'СЕЙЧАС ГОВОРИТ '+part.name+'. Ответь ОДНОЙ репликой. Не говори за других.'
   ].filter(Boolean).join('\n');
   let line,silent=false;
   try{
    const raw=await request(part.agent,[{role:'system',content:system},{role:'user',content:user}],signal,{stage:'intermediate',step:stage,format:'show',maxWords:45});
    if(!String(raw||'').trim())throw Error('empty reply');
    line=clipShowLine(raw,320);
   }catch(e){
    if(signal?.aborted||e.name==='AbortError')throw e;
    silent=true;callErrors.set(part.provider,(callErrors.get(part.provider)||0)+1);
    line='('+part.name+' '+(SILENCE_ACTIONS[scenario.id]||SILENCE_ACTIONS.diner)+'.)';
   }
   const event={id:part.provider,name:part.agent.name,nickname:part.name,stage,text:line,show:true,...(silent?{silent:true}:{})};
   dialogue.push(event);all.push(event);emit(event);
  }
  onProgress({stage,status:'done'});
 }
 abortIfNeeded(signal);
 const stage='Эпилог';
 onProgress({stage,status:'working'});
 let epilogue='';
 // Prefer a model that actually responded during the story.
 const healthy=actors.slice().sort((a,b)=>(callErrors.get(a.provider)||0)-(callErrors.get(b.provider)||0));
 const narrator=healthy[0],context=dialogue.slice(-8).map(m=>m.nickname+': '+m.text).join('\n');
 if(narrator){
  try{
   const answer=await request(narrator.agent,[
    {role:'system',content:'Ты сценарист-эпилогист. Напиши ОДИН конкретный последний кадр в 1–3 предложениях (до 75 слов). Не говори от имени персонажей, не меняй виновного и победителя, не вводи новых загадок. Покажи последствие поступков. Без предисловий и пустого философствования.'},
    {role:'user',content:'История: '+book.place+'. Правда: '+book.truth+'. Итог, который ДОЛЖЕН остаться каноном: '+ending+'. Последние реплики:\n'+context+'\nУказания режиссёра: '+director.slice(0,1300)+'\nДобавь только последний видимый кадр после развязки.'}
   ],signal,{stage:'final',step:'Эпилог',format:'show',maxWords:75});
   epilogue=clipShowLine(answer,480);
  }catch(e){if(signal?.aborted||e.name==='AbortError')throw e;}
 }
 // The deterministic resolution is always shown, even if every provider fails.
 const final={id:narrator?.provider||'narrator',name:narrator?.agent.name||'Рассказчик',nickname:'Эпилог',stage:'Эпилог',show:true,final:true,
  text:ending+(epilogue?'\n\nПоследний кадр: '+epilogue:'')};
 emit(final);all.push(final);
 onProgress({stage,status:'done'});
 onProgress({stage:'Готово',status:'done'});
 return all;
}
