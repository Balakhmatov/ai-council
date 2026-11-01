import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('all imported Quorum server modules are copied by the VPS installer',()=>{
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const deploy=readFileSync(new URL('../deploy/install-vps.py',import.meta.url),'utf8');
 const copied=deploy.match(/for name in \['server\.mjs',[^\n]+\]:/)?.[0]||'';
 assert.ok(copied,'VPS server module list missing');
 for(const match of server.matchAll(/from ['"]\.\/([^'"]+)['"]/g)){
  const path=match[1];
  if(path.startsWith('public/')){
   assert.match(deploy,/\['public','scripts'\]/);
   assert.ok(readFileSync(new URL('../'+path,import.meta.url),'utf8').length>0);
  }else assert.ok(copied.includes("'"+path+"'"),path+' is not included in VPS deployment');
 }
});
