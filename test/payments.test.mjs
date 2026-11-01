import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEconomy} from '../economy.mjs';
import {createPayments} from '../payments.mjs';

test('YooKassa SBP verifies identity, amount and recipient before idempotent credit grant',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-sbp-'));
 try{
  const at=Date.parse('2026-11-01T18:00:00Z');
  const env={ACCOUNTING_FILE:join(dir,'billing.json'),QUORUM_PAYMENTS_FILE:join(dir,'payments.json'),YOOKASSA_SHOP_ID:'test-shop',YOOKASSA_SECRET_KEY:'test-secret'};
  const economy=createEconomy({env,now:()=>at}),identity='account:'+'a'.repeat(32);
  let postCount=0,getCount=0,initial=null;
  const fetchImpl=async(url,options)=>{
   const auth=options.headers.Authorization;
   assert.equal(auth,'Basic '+Buffer.from('test-shop:test-secret').toString('base64'));
   if(options.method==='POST'){
    postCount++;initial=JSON.parse(options.body);
    assert.equal(initial.payment_method_data.type,'sbp');
    assert.equal(initial.capture,true);
    assert.equal(initial.metadata.account_id,identity);
    assert.equal(initial.amount.value,'25.00');
    return Response.json({id:'provider-order-1',status:'pending',paid:false,test:false,recipient:{account_id:'test-shop'},
     amount:initial.amount,metadata:initial.metadata,
     confirmation:{confirmation_url:'https://yoomoney.ru/checkout/payments/sbp?order=123'}});
   }
   getCount++;
   return Response.json({id:'provider-order-1',status:'succeeded',paid:true,test:false,
    captured_at:new Date(at).toISOString(),recipient:{account_id:'test-shop'},
    amount:initial.amount,metadata:initial.metadata});
  };
  const payments=createPayments({env,economy,fetchImpl,now:()=>at});
  const created=await payments.create(identity,'pack5');
  assert.equal(created.status,'pending');
  assert.match(created.paymentUrl,/^https:\/\/yoomoney.ru\//);
  assert.equal(economy.access(identity).purchasedTasks,0);
  const checked=await payments.refresh(identity);
  assert.equal(checked.orders[0].status,'succeeded');
  assert.equal(economy.access(identity).purchasedTasks,5);
  await payments.refresh(identity);
  assert.equal(economy.access(identity).purchasedTasks,5);
  assert.equal(postCount,1);assert.equal(getCount,1);
  const reloaded=createEconomy({env,now:()=>at});
  assert.equal(reloaded.access(identity).purchasedTasks,5);
  reloaded.grantPayment(identity,'pack5','quorum:'+created.id);
  assert.equal(reloaded.access(identity).purchasedTasks,5);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('SBP cannot grant credits from wrong amount or wrong merchant account',async()=>{
 const env={YOOKASSA_SHOP_ID:'shop',YOOKASSA_SECRET_KEY:'key'};
 const economy=createEconomy({env:{}});
 const identity='account:'+'b'.repeat(32);
 const payments=createPayments({env,economy,fetchImpl:async(url,{body})=>{
  const data=JSON.parse(body);
  return Response.json({id:'provider-2',status:'succeeded',paid:true,test:false,
   captured_at:new Date().toISOString(),recipient:{account_id:'wrong-shop'},
   amount:{value:'0.01',currency:'RUB'},metadata:data.metadata});
 }});
 await assert.rejects(payments.create(identity,'pack5'),/Платёж не прошёл/);
 assert.equal(economy.access(identity).purchasedTasks,0);
});
