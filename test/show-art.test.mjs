import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync,readFileSync} from 'node:fs';
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
  const poster=scenePoster(id);assert.ok(poster.includes('show-'+id+'-poster-vertical.webp'));
  for(let i=0;i<7;i++){const portrait=characterPortrait(id,i);assert.ok(portrait.includes('show-'+id+'-cast.webp'));assert.notEqual(portrait,poster);}
 }
 const comics=['joker','thanos','doom','loki','harley','luthor','magneto'];
 for(let i=0;i<7;i++)assert.ok(characterPortrait('villains',i).includes('show-comic-'+comics[i]+(i===5?'-generated':'')+'.webp'));
 for(const id of ['time','reality','villains','anime','kombat']){
  for(const markup of [scenePoster(id),...Array.from({length:7},(_,i)=>characterPortrait(id,i))]){
   const file=/href="\.\/assets\/([^?]+)\?/.exec(markup)[1];assert.ok(statSync(new URL('../public/assets/'+file,import.meta.url)).size>1000,file);
  }
 }
});

test('old scene posters are restored and new posters are single complete illustrations, never portrait collages',()=>{
 const originalOrder=['diner','heist','court','villains','spaceship','bunker','boardroom','detective','reality','time'];
 for(const id of ['diner','court','spaceship','bunker','boardroom','detective']){
  const i=originalOrder.indexOf(id),poster=scenePoster(id);
  assert.ok(poster.includes('show-posters.webp'));
  assert.ok(poster.includes([(i%5)*307.2,Math.floor(i/5)*512,307.2,512].join(' ')));
 }
 assert.ok(scenePoster('heist').includes('show-heist-poster.webp'));
 for(const id of ['time','reality','anime','kombat','afterlife','olympus'])assert.ok(scenePoster(id).includes('show-'+id+'-poster-vertical.webp'));
 for(const s of SHOW_SCENARIOS){
  const poster=scenePoster(s.id);assert.equal((poster.match(/<image /g)||[]).length,1,s.id);assert.ok(!poster.includes('data-poster-slot'));
 }
});

function webpDimensions(bytes){
 for(let offset=12;offset+8<bytes.length;){
  const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  if(kind==='VP8 ')return {width:bytes.readUInt16LE(start+6)&0x3fff,height:bytes.readUInt16LE(start+8)&0x3fff};
  if(kind==='VP8X')return {width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1};
  if(kind==='VP8L'){const bits=bytes.readUInt32LE(start+1);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  offset=start+size+(size%2);
 }
 throw Error('Missing WebP image dimensions');
}
test('new scene files are genuinely vertical and their full composition is fitted without clipping',()=>{
 for(const id of ['time','reality','anime','kombat','afterlife','olympus']){
  const poster=scenePoster(id),file=/href="\.\/assets\/([^?]+)\?/.exec(poster)[1];
  const size=webpDimensions(readFileSync(new URL('../public/assets/'+file,import.meta.url)));
  assert.equal(size.width,1024,id);assert.equal(size.height,1536,id);
  assert.ok(poster.includes('viewBox="0 0 '+size.width+' '+size.height+'"'));
  assert.ok(poster.includes('preserveAspectRatio="xMidYMid meet"'),id+' must show the whole scene');
 }
});
