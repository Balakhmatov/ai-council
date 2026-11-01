// Intermediate turns are deliberately shorter than the final deliverable.
export const LENGTH_PRESETS=Object.freeze({
 short:{label:'Коротко',words:120},
 medium:{label:'Средне',words:250},
 detailed:{label:'Подробно',words:500}
});
export function wordsForPreset(value){
 return LENGTH_PRESETS[value]?.words||LENGTH_PRESETS.short.words;
}
export function limitIntermediate(text,maxWords){
 const limit=Math.max(40,Math.min(500,Number(maxWords)||120));
 const source=String(text||'');
 const words=[...source.matchAll(/[^\s]+/gu)];
 if(words.length<=limit)return source;
 const boundary=words[limit-1].index+words[limit-1][0].length;
 const prefix=source.slice(0,boundary);
 // Do not pretend we received a full answer when a model ignored the configured limit.
 return prefix.replace(/[\s,;:]+$/u,'').trimEnd()+'…\n\n_Ответ сокращён до '+limit+' слов. Настройка длины влияет только на обсуждение, не на итог._';
}
