import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profiles} from '../public/profiles.js';
import {getTaskExample,taskExamples} from '../public/examples.js';

test('every profession and specialization has an original practical placeholder',()=>{
 const texts=new Set();
 assert.equal(profiles.length,5);
 for(const profile of profiles){
  assert.equal(profile.tasks.length,6);
  const keys=['',...profile.tasks.map(t=>t[0])];
  assert.deepEqual(Object.keys(taskExamples[profile.id]).sort(),keys.sort());
  for(const key of keys){
   const prompt=getTaskExample(profile.id,key);
   assert.equal(typeof prompt,'string');
   assert.ok(prompt.length>=100,`${profile.id}/${key} too short`);
   assert.ok(prompt.length<=900,`${profile.id}/${key} too long`);
   assert.ok(!texts.has(prompt),`${profile.id}/${key} duplicated`);
   texts.add(prompt);
  }
 }
 assert.equal(texts.size,35);
});
test('general profile and unknown specialization fall back to selected profession',()=>{
 assert.equal(getTaskExample('smm'),taskExamples.smm['']);
 assert.equal(getTaskExample('marketing','unknown'),taskExamples.marketing['']);
 assert.equal(getTaskExample('unknown','unknown'),taskExamples.smm['']);
 assert.notEqual(getTaskExample('smm','posts'),getTaskExample('smm','video'));
});
