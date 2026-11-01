import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordAuth} from '../password-auth.mjs';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const env={PROXY_TOKEN:'private-login-test-secret'};
test('email passwords are salted, never stored in plaintext and survive restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quorum-password-'));
 try{
  const cfg={...env,PASSWORD_FILE:join(dir,'passwords.json')};
  let auth=createPasswordAuth({env:cfg});
  await auth.set(' User@Example.COM ','первая надёжная фраза');
  assert.equal(auth.has('user@example.com'),true);
  let raw=readFileSync(cfg.PASSWORD_FILE,'utf8');
  assert.ok(!raw.includes('user@example.com'));
  assert.ok(!raw.includes('первая надёжная фраза'));
  const entry=Object.values(JSON.parse(raw).entries)[0];
  assert.match(entry.salt,/^[0-9a-f]{32}$/);
  assert.match(entry.digest,/^[0-9a-f]{128}$/);
  await assert.rejects(auth.login('user@example.com','неверный пароль'),{status:401});
  assert.equal((await auth.login('USER@example.com','первая надёжная фраза')).email,'user@example.com');
  auth=createPasswordAuth({env:cfg});
  assert.equal((await auth.login('user@example.com','первая надёжная фраза')).email,'user@example.com');
  await auth.set('user@example.com','новая надёжная фраза');
  await assert.rejects(auth.login('user@example.com','первая надёжная фраза'),{status:401});
  assert.equal((await auth.login('user@example.com','новая надёжная фраза')).email,'user@example.com');
  raw=readFileSync(cfg.PASSWORD_FILE,'utf8');
  assert.ok(!raw.includes('новая надёжная фраза'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('password policy rejects weak passwords and throttles repeated wrong attempts',async()=>{
 let time=Date.parse('2026-11-01T00:00:00Z');
 const auth=createPasswordAuth({env,now:()=>time});
 for(const bad of ['short','abc','\n'.repeat(15),' ' .repeat(12)])await assert.rejects(auth.set('a@example.com',bad),{status:400});
 await auth.set('a@example.com','strong-password-2026');
 for(let i=0;i<10;i++)await assert.rejects(auth.login('a@example.com','wrong-password'),{status:401});
 await assert.rejects(auth.login('a@example.com','strong-password-2026'),{status:429});
 time+=3600001;
 assert.equal((await auth.login('a@example.com','strong-password-2026')).email,'a@example.com');
});
