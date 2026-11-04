import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHARACTER_QUOTE_BANK,CHARACTER_VOICE_PROFILES} from '../public/show-stories.js';

export function quoteCatalogLines(){
 const owners=new Map();
 for(const profiles of Object.values(CHARACTER_VOICE_PROFILES))for(const profile of profiles)for(const id of profile.quoteIds){
  if(!CHARACTER_QUOTE_BANK[id])throw Error('Неизвестная цитата: '+id);
  if(!owners.has(id))owners.set(id,[]);
  owners.get(id).push(profile.name);
 }
 const lines=['## Цитатный реестр','',
  'Здесь приведены короткие проверенные фрагменты реплик, а не авторские примеры из десяти предложений. Иноязычные фрагменты переведены для Кворума: это не заявление о точном тексте конкретного русского дубляжа. Указаны говорящий, версия произведения и место реплики. У Клеопатры и Чингисхана источник передаёт историческую традицию, а не запись живого голоса. У Михаила цитатная опора библейская, отдельно от экранного прототипа манеры.','',
  'Как применять: сохранить ритм, конструкцию, лексику и эмоциональный поворот, заменить предмет, адресата и обстоятельства на установленные в текущем диалоге. Подходящий короткий оборот можно сохранить дословно. Не переносить факты, способности и отношения из исходного произведения; не повторять одну реплику по кругу и не говорить зрителю, откуда она взята.',''];
 for(const quote of Object.values(CHARACTER_QUOTE_BANK)){
  lines.push('### '+quote.id,'',
   '**Для персонажей:** '+owners.get(quote.id).join(', '),'',
   '> '+quote.text,'',
   '**Говорящий:** '+quote.speaker,'',
   '**Произведение / источник:** '+quote.work,'',
   '**Место:** '+quote.locator,'',
   '**Речевой приём:** '+quote.pattern,'',
   '**Текст:** '+quote.translation,'',
   ...(quote.attributionNote?['**Атрибуция:** '+quote.attributionNote,'']:[]),
   '**Проверка:** ['+quote.source.title+'](<'+quote.source.url+'>)','');
 }
 return lines;
}
export function exportCharacterQuotes(target){
 const file=resolve(target||'docs/character-quote-anchors.md');
 const lines=['# Кворум — цитатные опоры','',
  Object.keys(CHARACTER_QUOTE_BANK).length+' коротких фрагментов для 98 персонажей · 4 ноября 2026 года','',...quoteCatalogLines()];
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file,lines.join('\n'),'utf8');return file;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(exportCharacterQuotes(process.argv[2]));
