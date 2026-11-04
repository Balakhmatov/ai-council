import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {SHOW_SCENARIOS} from '../public/show.js';
import {CHARACTER_VOICE_PROFILES} from '../public/show-stories.js';
import {quoteCatalogLines} from './export-character-quotes.mjs';

const target=resolve(process.argv[2]||'docs/character-voices-researched.md');
const lines=[
 '# Кворум — речевые портреты персонажей','',
 '98 персонажей · 14 сценариев · ровно 10 предложений на персонажа','',
 'Версия от 4 ноября 2026 года','',
 'Для существующих персонажей указана выбранная версия образа, для оригинальных — конкретный речевой прототип. Прототип передаёт только манеру: его биография, отношения, знания и поступки не становятся фактами нашей истории. Источники помогают восстановить образ; подробные речевые инструкции являются авторской интерпретацией, а не документальной экспертизой голоса.','',
 'Предложения 8 и 9 — новые авторские примеры, а не цитаты из источников и не обязательные реплики. Лексикон приведён в русской адаптации. Официальные профили, справочные статьи, сборники реплик и исторические первоисточники имеют разный вес; полная расшифровка интервью доступна не для каждого публичного человека. Для Клеопатры и Чингисхана прямо отмечена историческая реконструкция.',''
];
let characters=0,sentences=0;const sources=new Set();
for(const scenario of SHOW_SCENARIOS){
 const profiles=CHARACTER_VOICE_PROFILES[scenario.id];
 if(profiles?.length!==scenario.roles.length)throw Error('Несовпадение ролей: '+scenario.id);
 lines.push('## '+scenario.title,'');
 profiles.forEach((profile,slot)=>{
  if(profile.name!==scenario.roles[slot][0]||profile.sentences.length!==10)throw Error('Неверный портрет: '+profile.name);
  lines.push('### '+profile.name,'','**Основа:** '+profile.prototype,'','**Цитатные опоры:** '+profile.quoteIds.map(id=>'['+id+'](#'+id+')').join(', '),'');
  lines.push(...profile.sentences.map((line,i)=>(i+1)+'. '+line),'','**Источники:**','');
  for(const source of profile.sources){lines.push('- ['+source.title+'](<'+source.url+'>)');sources.add(source.url);}
  lines.push('');characters++;sentences+=profile.sentences.length;
 });
}
lines.push(...quoteCatalogLines());
if(characters!==98||sentences!==980)throw Error('Неполный каталог');
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,lines.join('\n'),'utf8');
console.log(JSON.stringify({file:target,characters,sentences,sources:sources.size}));
