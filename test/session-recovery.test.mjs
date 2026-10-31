import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withSessionRecovery} from '../public/session-request.js';
import {createServer} from '../server.mjs';

test('task start recovers a server-rejected session once, without duplicate tasks',async()=>{
 const server=createServer({env:{PROXY_TOKEN:'test-owner',OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model',MISTRAL_API_KEY:'test-key',MISTRAL_MODEL:'test-model'},fxFetchImpl:async()=>{throw Error('offline');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const api=async(path,token,body)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{})});
  const data=await response.json();if(!response.ok){const error=Error(data.error?.message);error.status=response.status;throw error;}return data;
 };
 try{
  let token=(await api('/api/session')).token;
  await api('/api/logout',token);
  let attempts=0,renewals=0;
  const task=await withSessionRecovery(()=>{attempts++;return api('/api/task/start',token,{participants:['openai','mistral'],rounds:2,mode:'consensus'});},async()=>{renewals++;token=(await api('/api/session')).token;});
  assert.equal(attempts,2);assert.equal(renewals,1);
  assert.equal(typeof task.taskId,'string');assert.equal(task.remainingFreeTasks,2);
  const asset=await fetch(base+'/session-request.js');assert.equal(asset.status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('session recovery is bounded and does not replay other failures',async()=>{
 for(const status of [401,403,429,503]){
  let calls=0,renewals=0;const error=Object.assign(Error('failure'),{status});
  await assert.rejects(withSessionRecovery(async()=>{calls++;throw error;},async()=>{renewals++;}),e=>e===error);
  assert.equal(calls,status===401?2:1);assert.equal(renewals,status===401?1:0);
 }
});
