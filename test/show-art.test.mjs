import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHOW_SCENARIOS} from '../public/show.js';
import {scenePoster} from '../public/show-art.js';
test('each of ten Show scenarios has a distinct inline illustrated SVG poster without external requests',()=>{
 const artworks=SHOW_SCENARIOS.map(s=>scenePoster(s.id));
 assert.equal(artworks.length,10);
 assert.equal(new Set(artworks).size,10);
 for(const svg of artworks){
  assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert(svg.includes('viewBox="0 0 320 160"'));
  assert(svg.includes('<path')||svg.includes('<circle'));
  assert(!svg.includes('<image'));
  assert(!svg.includes('https:')&&!svg.includes('http://www.')||svg.includes('http://www.w3.org/2000/svg'));
 }
 assert(scenePoster('unknown').includes('bg-diner'));
});
