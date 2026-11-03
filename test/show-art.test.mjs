import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {SHOW_SCENARIOS} from '../public/show.js';
import {scenePoster,characterPortrait} from '../public/show-art.js';

test('every story and every casting role has its own local illustration cell',()=>{
 const posters=SHOW_SCENARIOS.map(s=>scenePoster(s.id));
 assert.equal(new Set(posters).size,10);
 const portraits=SHOW_SCENARIOS.flatMap(s=>s.roles.map((_,i)=>characterPortrait(s.id,i)));
 assert.equal(portraits.length,70);
 assert.equal(new Set(portraits).size,70);
 assert.equal(scenePoster('unknown'),scenePoster('diner'));
 assert.equal(characterPortrait('unknown',0),characterPortrait('diner',0));
 for(const art of [...posters,...portraits])assert.ok(!art.includes('http')&&!art.includes('undefined'));
 for(const file of ['show-posters.webp','show-cast-crime.webp','show-cast-worlds.webp','show-cast-stories.webp']){
  const stat=statSync(new URL('../public/assets/'+file,import.meta.url));
  assert.ok(stat.size>10000&&stat.size<700000,file+' should be a compressed local illustration atlas');
 }
});
