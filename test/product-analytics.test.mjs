import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAnalytics} from '../analytics.mjs';

const a='account:'+'a'.repeat(32),b='account:'+'b'.repeat(32);
const owner='account:'+'f'.repeat(32);
const id1='1'.repeat(48),id2='2'.repeat(48);
const vid1='11111111-1111-4111-8111-111111111111';
const vid2='22222222-2222-4222-8222-222222222222';
test('product analytics survives restart, deduplicates visits and excludes owner activity',()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-analytics-')),file=join(dir,'analytics.json');
 let timestamp=Date.parse('2026-11-02T10:00:00Z');
 try{
  let analytics=createAnalytics({file,secret:'test-secret',now:()=>timestamp});
  analytics.visit(vid1);
  analytics.visit(vid1);
  analytics.login(a,{method:'email'});
  analytics.visit(vid1,a);
  analytics.login(owner,{method:'telegram',owner:true});
  analytics.visit(vid2,owner,{owner:true});
  assert.equal(analytics.start(id1,a,{profile:'smm',subtask:'posts',participants:['openai','mistral']}),true);
  assert.equal(analytics.start(id1,a,{profile:'smm'}),false);
  assert.equal(analytics.finish(id1,'done'),true);
  assert.equal(analytics.finish(id1,'done'),false);
  analytics.start(id2,a,{profile:'marketing',subtask:'strategy'});
  analytics.finish(id2,'cancelled');
  const orders=[{identity:a,status:'succeeded',applied:true,sku:'subscription',amountRub:1200,createdAt:timestamp,
    capturedAt:'2026-11-02T10:00:00Z'},
   {identity:a,status:'pending',applied:false,sku:'pack5',amountRub:25,createdAt:timestamp}];
  let report=analytics.report({days:7,orders});
  assert.equal(report.audience.visitors,1);
  assert.equal(report.audience.observedAccounts,1);
  assert.equal(report.audience.newAccounts,1);
  assert.equal(report.audience.active,1);
  assert.equal(report.tasks.started,2);
  assert.equal(report.tasks.completed,1);
  assert.equal(report.tasks.cancelled,1);
  assert.equal(report.tasks.repeatedAccounts,1);
  assert.deepEqual(report.tasks.byProfile.map(x=>x.name).sort(),['marketing','smm']);
  assert.equal(report.billing.revenueRub,1200);
  assert.equal(report.billing.payingAccounts,1);
  assert.equal(report.billing.successfulPayments,1);
  assert.equal(report.funnel.visitors,1);
  assert.equal(report.funnel.authenticated,1);
  assert.equal(report.funnel.taskUsers,1);
  assert.equal(report.funnel.buyers,1);
  timestamp+=86400000;
  analytics=createAnalytics({file,secret:'test-secret',now:()=>timestamp});
  report=analytics.report({days:7,orders});
  assert.equal(report.tasks.started,2);
  assert.equal(report.billing.revenueRub,1200);
  assert.equal(report.audience.visitors,1);
  assert.equal(report.audience.retentionD1.eligible,1);
  assert.equal(report.audience.retentionD1.returned,0);
  analytics.visit(vid1,a);
  assert.equal(analytics.report({days:7,orders}).audience.retentionD1.returned,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('linked Telegram and email identities are not double-counted in unique user metrics',()=>{
 const analytics=createAnalytics({now:()=>Date.parse('2026-11-02T12:00:00Z')});
 analytics.login(a,{method:'telegram'});
 analytics.login(b,{method:'email'});
 analytics.start(id1,a,{profile:'smm'});
 analytics.start(id2,b,{profile:'copywriting'});
 const linkedMembers=id=>id===a?[b]:id===b?[a]:[];
 const report=analytics.report({days:30,linkedMembers});
 assert.equal(report.audience.observedAccounts,1);
 assert.equal(report.tasks.uniqueAccounts,1);
 assert.equal(report.tasks.repeatedAccounts,1);
});
