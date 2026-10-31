import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';

for(const base of [undefined,'https://ddtnew.com/v1','https://ddtnew.com/v1/']){
 test(`Gemini routes to ${base||'Google by default'} with the pinned model`,async()=>{
  const calls=[];
  const server=createServer({
   env:{PROXY_TOKEN:'test-admin',GEMINI_API_KEY:'test-gemini-key',GEMINI_MODEL:'gemini-4-argon-high',...(base?{GEMINI_BASE_URL:base}:{})},
   fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({choices:[{message:{content:'Gemini answer'}}]});},
   fxFetchImpl:async()=>{throw Error('offline test');},
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/chat`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-admin'},
    body:JSON.stringify({provider:'gemini',model:'client-override',messages:[{role:'user',content:'hello'}]}),
   });
   assert.equal(response.status,200);
   assert.equal((await response.json()).text,'Gemini answer');
   assert.equal(calls.length,1);
   assert.equal(calls[0].url,(base?'https://ddtnew.com/v1':'https://generativelanguage.googleapis.com/v1beta/openai')+'/chat/completions');
   assert.equal(calls[0].options.headers.Authorization,'Bearer test-gemini-key');
   assert.equal(JSON.parse(calls[0].options.body).model,'gemini-4-argon-high');
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
}

test('Gemini rejects unsupported destinations before sending credentials',()=>{
 for(const base of ['https://example.com/v1','http://ddtnew.com/v1','https://ddtnew.com.evil.example/v1','https://user:password@ddtnew.com/v1']){
  assert.throws(()=>createServer({env:{GEMINI_BASE_URL:base}}),/Invalid Gemini base URL/);
 }
});
