import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {SHOW_SCENARIOS} from '../public/show.js';
import {scenePoster,characterPortrait} from '../public/show-art.js';

test('every story and every casting role has its own local illustration cell',()=>{
 const posters=SHOW_SCENARIOS.map(s=>scenePoster(s.id));
 assert.equal(new Set(posters).size,14);
 const portraits=SHOW_SCENARIOS.flatMap(s=>s.roles.map((_,i)=>characterPortrait(s.id,i)));
 assert.equal(portraits.length,98);
 assert.equal(new Set(portraits).size,98);
 assert.equal(scenePoster('unknown'),scenePoster('diner'));
 assert.equal(characterPortrait('unknown',0),characterPortrait('diner',0));
 for(const art of [...posters,...portraits])assert.ok(!art.includes('href="https:')&&!art.includes('undefined'));
 for(const file of ['show-posters.webp','show-cast-crime.webp','show-cast-worlds.webp','show-cast-stories.webp']){
  const stat=statSync(new URL('../public/assets/'+file,import.meta.url));
  assert.ok(stat.size>10000&&stat.size<700000,file+' should be a compressed local illustration atlas');
 }
});

test('heist uses an independent crime-film poster and seven independent suited portraits',()=>{
 assert.ok(scenePoster('heist').includes('cinema-poster-heist'));
 const portraits=Array.from({length:7},(_,i)=>characterPortrait('heist',i));
 assert.equal(new Set(portraits).size,7);
 assert.ok(portraits.every(p=>p.includes('cinema-character-heist')));
 assert.ok(!characterPortrait('diner',0).includes('cinema-character-heist'));
});

test('new casts use new local artwork and correct named comic portraits instead of old fictional faces',()=>{
 for(const id of ['time','reality','anime','kombat']){
  const poster=scenePoster(id);assert.ok(poster.includes('show-'+id+'-cast.webp'));
  for(let i=0;i<7;i++){const portrait=characterPortrait(id,i);assert.ok(portrait.includes('show-'+id+'-cast.webp'));assert.notEqual(portrait,poster);}
 }
 const comics=['joker','thanos','doom','loki','harley','luthor','magneto'];
 for(let i=0;i<7;i++)assert.ok(characterPortrait('villains',i).includes('show-comic-'+comics[i]+'.webp'));
 for(const id of ['time','reality','villains','anime','kombat']){
  for(const markup of [scenePoster(id),...Array.from({length:7},(_,i)=>characterPortrait(id,i))]){
   const file=/href="\.\/assets\/([^?]+)\?/.exec(markup)[1];assert.ok(statSync(new URL('../public/assets/'+file,import.meta.url)).size>1000,file);
  }
 }
});

test('every landscape poster contains the actual seven participants, including the two comedies',()=>{
 for(const scene of SHOW_SCENARIOS){
  const poster=scenePoster(scene.id);
  assert.ok(poster.includes('0 0 900 540'));
  assert.equal((poster.match(/data-poster-slot=/g)||[]).length,7,scene.id);
  for(let slot=0;slot<7;slot++)assert.ok(poster.includes(characterPortrait(scene.id,slot)),scene.id+' missing cast '+slot);
 }
});
