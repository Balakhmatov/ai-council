import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profiles} from '../public/profiles.js';
import {getTaskHint,taskHints} from '../public/examples.js';

test('five directions and all 30 specializations explain their purpose without fictional client briefs',()=>{
 const hints=new Set();
 assert.equal(profiles.length,5);
 for(const profile of profiles){
  assert.equal(profile.tasks.length,6);
  const keys=['',...profile.tasks.map(t=>t[0])];
  assert.deepEqual(Object.keys(taskHints[profile.id]).sort(),keys.sort());
  for(const key of keys){
   const hint=getTaskHint(profile.id,key);
   assert.equal(typeof hint,'string');
   assert.ok(hint.length>=85&&hint.length<=210,`${profile.id}/${key} hint length ${hint.length}`);
   assert.ok(!/[\[\]{}]/.test(hint),`${profile.id}/${key} has technical placeholders`);
   assert.ok(!/(пекарн|стоматолог|магазин|кофейн|свадеб|керамик|пиццери)/i.test(hint),`${profile.id}/${key} invented specific business`);
   assert.ok(!hints.has(hint),`${profile.id}/${key} duplicated`);
   hints.add(hint);
  }
 }
 assert.equal(hints.size,35);
});
test('unselected specialization uses the correct section purpose',()=>{
 assert.equal(getTaskHint('smm'),taskHints.smm['']);
 assert.equal(getTaskHint('marketing','unknown'),taskHints.marketing['']);
 assert.equal(getTaskHint('unknown','unknown'),taskHints.smm['']);
 assert.notEqual(getTaskHint('marketing','competitors'),getTaskHint('smm','community'));
});
