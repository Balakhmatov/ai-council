import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmailAuth} from '../email-auth.mjs';
const env={PROXY_TOKEN:'test-secret',RESEND_API_KEY:'mail-secret',EMAIL_FROM:'Quorum <login@example.com>'};
test('email code proves ownership, is single use, expires and never returns in API response',async()=>{
 let time=0,sent;
 const auth=createEmailAuth({env,now:()=>time,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent=JSON.parse(options.body);return Response.json({id:'mail'});}});
 assert.deepEqual(await auth.request(' User@Example.com ','ip'),{ok:true});
 assert.deepEqual(sent.to,['user@example.com']);const code=sent.text.match(/\d{6}/)[0];
 assert.throws(()=>auth.verify('user@example.com','000000','ip'));
 const user=auth.verify('USER@example.com',code,'ip');assert.equal(user.email,'user@example.com');
 assert.throws(()=>auth.verify('user@example.com',code,'ip'));
 await auth.request('user@example.com','ip');time=600001;
 assert.throws(()=>auth.verify('user@example.com',sent.text.match(/\d{6}/)[0],'ip'));
});
test('email login fails closed without delivery, limits attempts and handles mail failures',async()=>{
 await assert.rejects(createEmailAuth({env:{}}).request('a@example.com','ip'),{status:503});
 const auth=createEmailAuth({env,fetchImpl:async()=>Response.json({},{status:500})});
 await assert.rejects(auth.request('a@example.com','ip'),{status:502});
 assert.throws(()=>auth.verify('a@example.com','123456','ip'));
 const limited=createEmailAuth({env,fetchImpl:async()=>Response.json({id:'ok'})});
 for(let i=0;i<5;i++)await limited.request('a@example.com','ip');
 await assert.rejects(limited.request('a@example.com','ip'),{status:429});
 for(let i=0;i<5;i++)assert.throws(()=>limited.verify('a@example.com','000000','ip'));
 assert.throws(()=>limited.verify('a@example.com','123456','ip'));
});

test('Timeweb SMTP sends code with TLS and mailbox credentials; rejected delivery invalidates code',async()=>{
 let options,message,reject=false;
 const auth=createEmailAuth({env:{...env,SMTP_HOST:'smtp.timeweb.ru',SMTP_PORT:'465',SMTP_USER:'businesspulse@cityai.site',SMTP_PASSWORD:'test-password'},
 createTransport:config=>{options=config;return {sendMail:async mail=>{message=mail;return reject?{accepted:[],rejected:mail.to}:{accepted:mail.to,rejected:[]};}};},
 fetchImpl:()=>{throw Error('SMTP must be used');}});
 assert.equal(auth.enabled,true);assert.equal(options.secure,true);assert.equal(options.port,465);
 assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.requireTLS,true);
 assert.equal(options.auth.user,'businesspulse@cityai.site');assert.equal(options.auth.pass,'test-password');
 await auth.request('user@example.com','ip');
 assert.equal(auth.verify('user@example.com',message.text.match(/\d{6}/)[0],'ip').email,'user@example.com');
 reject=true;await assert.rejects(auth.request('user@example.com','ip'),{status:502});
 assert.throws(()=>auth.verify('user@example.com',message.text.match(/\d{6}/)[0],'ip'));
});
