// Copy existing YooKassa credentials from Business Pulse / CityAI without displaying secrets.
// Run once as root; Quorum deployment preserves unknown variables in its private env file.
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';

const sources=['/etc/business-pulse/yookassa.env','/var/byvshaya/shared/cityai.env'];
let keys=null;
for(const file of sources){
 try{
  const source=parseEnv(fs.readFileSync(file,'utf8'));
  if(source.YOOKASSA_SHOP_ID?.trim()&&source.YOOKASSA_SECRET_KEY?.trim()){
   keys={YOOKASSA_SHOP_ID:source.YOOKASSA_SHOP_ID.trim(),YOOKASSA_SECRET_KEY:source.YOOKASSA_SECRET_KEY.trim()};break;
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
if(!keys)throw Error('Working YooKassa credentials were not found in the existing projects.');
for(const value of Object.values(keys))if(/[\r\n\0]/.test(value))throw Error('Malformed payment credentials.');
const target='/etc/quorum/quorum.env';
const original=fs.readFileSync(target,'utf8');
let lines=original.split('\n').filter(line=>!/^\s*(?:export\s+)?YOOKASSA_(?:SHOP_ID|SECRET_KEY)\s*=/.test(line));
lines.push(...Object.entries(keys).map(([key,value])=>key+'='+JSON.stringify(value)));
fs.writeFileSync(target,lines.join('\n').replace(/\n+$/,'')+'\n',{mode:0o600});
fs.chmodSync(target,0o600);
execFileSync('systemctl',['restart','quorum-api.service']);
console.log('Quorum SBP payment credentials installed and Quorum API restarted; secrets were not printed.');
