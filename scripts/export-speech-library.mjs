import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SHOW_SCENARIOS} from '../public/show.js';
import {CHARACTER_VOICE_PROFILES} from '../public/show-stories.js';

export function speechLibraryLines(){
 const lines=['# Кворум — развёрнутая речевая база','',
 '98 персонажей · 294 разбора и авторских адаптации · 4 ноября 2026 года','',
 'В каждом профиле три разных речевых ситуации. Сначала описана опора в произведении или публичном выступлении, затем разобран приём, приведён рабочий словарь и написан новый ответ для нашего шоу. **Все блоки «Адаптация для шоу» — авторские примеры, не дословные цитаты.** Короткие цитаты хранятся отдельно в [цитатном реестре](character-quote-anchors.md).','',
 'Тип опоры указан отдельно. Разбор сцены — её сжатый пересказ и интерпретация речи, не полная расшифровка. Реконструкция по образу опирается на справочный профиль и известные черты персонажа; она не выдаётся за найденный диалог. Для исторических лиц это художественная реконструкция по опубликованным источникам, а не достоверная запись частного разговора.','',
 '## Как использовать в модели','',
 'Услышать конкретную реплику и выбрать подходящий приём: бытовой заход, уточнение, личный отпор, паузу, признание или шутку. Перенести ритм и конструкцию на текущий смысл. Примеры не устанавливают факты и не предписывают, что должно случиться. Имена и события источников не переносятся в шоу. Не нужно перечислять все три образца, повторять их по порядку или завершать каждый ответ одним и тем же типом вопроса. Грубость подчиняется выбранной манере, личность персонажа сохраняется.','',
 'Полный файл содержит всю базу для проверки человеком. В актёрский промпт идут только собственные приёмы, словарь и адаптации персонажа; пересказы чужих сюжетов и чужие роли туда не отправляются.','',
 '## Сценарии',''];
 for(const scenario of SHOW_SCENARIOS)lines.push('- '+scenario.title);
 lines.push('');let count=0;
 for(const scenario of SHOW_SCENARIOS){
  lines.push('## '+scenario.title,'');
  CHARACTER_VOICE_PROFILES[scenario.id].forEach((profile,slot)=>{
   if(profile.name!==scenario.roles[slot][0]||profile.speechSamples?.length!==3)throw Error('Неполный профиль: '+profile.name);
   lines.push('### '+profile.name,'','**Речевой прототип / версия:** '+profile.prototype,'','**Темп и синтаксис:** '+profile.sentences[1],'','**Базовый словарь:** '+profile.sentences[2],'');
   profile.speechSamples.forEach((sample,i)=>{
    lines.push('#### Образец '+(i+1),'','**Опора в источнике:** '+sample.sourceContext,'','**Тип опоры:** '+sample.evidenceKind,'','**Речевой ход:** '+sample.speechMove,'','**Рабочий словарь:** '+sample.lexicon.join(', '),'','**Адаптация для шоу — авторский пример, не цитата:**','', '> '+sample.adaptation,'','**Источник:** ['+sample.source.title+'](<'+sample.source.url+'>)','');count++;
   });
  });
 }
 if(count!==294)throw Error('Неполная речевая база');return lines;
}
export function exportSpeechLibrary(target){
 const file=resolve(target||'docs/character-speech-library.md');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,speechLibraryLines().join('\n'),'utf8');return file;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(exportSpeechLibrary(process.argv[2]));
