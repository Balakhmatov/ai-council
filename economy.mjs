import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';

const knownPrices=Object.freeze({
 'openai/gpt-6-luna':{input:0.10,cached:0.01,output:0.50},
 'mistral/mistral-large-2512':{input:0.50,cached:0.05,output:1.50}
});
function nonnegative(value,fallback){const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=100000?n:fallback;}
export function createEconomy({env,now=Date.now}){
 const file=env.ACCOUNTING_FILE||'';
 const freeCoins=nonnegative(env.FREE_START_COINS,3),taskPrice=nonnegative(env.TASK_COIN_COST,1);
 let state={wallets:{},totals:{requests:0,knownCostUsd:0,unknownCostCalls:0,inputTokens:0,outputTokens:0},byModel:{},recent:[]};
 if(file){try{
  const stored=JSON.parse(readFileSync(file,'utf8'));
  if(stored&&typeof stored==='object'&&stored.wallets&&stored.totals&&stored.byModel&&Array.isArray(stored.recent))state=stored;
 }catch(e){if(e.code!=='ENOENT')throw Error('Accounting state unreadable');}}
 const tasks=new Map();
 function save(){if(file){writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(file+'.tmp',file);}}
 function wallet(identity){
  if(!state.wallets[identity]){state.wallets[identity]={balance:freeCoins,createdAt:new Date(now()).toISOString()};save();}
  return state.wallets[identity];
 }
 function balance(identity,isAdmin=false){return {coins:isAdmin?null:wallet(identity).balance,costPerTask:taskPrice,freeStartingCoins:freeCoins,admin:isAdmin,checkoutAvailable:false};}
 function start(identity,isAdmin,params,available){
  const models=params?.participants,rounds=Number(params?.rounds),mode=params?.mode;
  if(!Array.isArray(models)||models.length<2||models.length>7||new Set(models).size!==models.length||models.some(id=>typeof id!=='string'||!available.includes(id))||!Number.isInteger(rounds)||rounds<2||rounds>5||!['consensus','vote','judge','roles','brainstorm'].includes(mode))return null;
  if(!isAdmin&&wallet(identity).balance<taskPrice)return {insufficient:true};
  if(!isAdmin){wallet(identity).balance-=taskPrice;save();}
  const id=crypto.randomBytes(24).toString('hex');
  const limit=models.length*rounds+1+(['vote','consensus'].includes(mode)?models.length:0);
  tasks.set(id,{identity,allowed:new Set(models),maxCalls:limit,calls:0,finalCalls:0,successful:0,createdAt:now(),isAdmin});
  return {taskId:id,maxCalls:limit,coins:isAdmin?null:wallet(identity).balance};
 }
 function checkCall(id,identity,provider,stage='intermediate'){
  const task=tasks.get(id);
  if(!task||task.identity!==identity||!task.allowed.has(provider)||task.calls>=task.maxCalls||now()-task.createdAt>7200000)return false;
  if(stage==='final'&&task.finalCalls>=1)return false;
  if(stage==='final')task.finalCalls++;
  task.calls++;return true;
 }
 function success(id){const task=tasks.get(id);if(task)task.successful++;}
 function finish(id,identity){
  const task=tasks.get(id);if(!task||task.identity!==identity)return null;
  tasks.delete(id);
  if(!task.isAdmin&&task.successful===0){wallet(identity).balance+=taskPrice;save();}
  return {ok:true,refunded:!task.isAdmin&&task.successful===0,coins:task.isAdmin?null:wallet(identity).balance};
 }
 function record(provider,model,usage){
  if(!usage||typeof usage!=='object')return;
  const input=nonnegative(usage.prompt_tokens??usage.input_tokens,0),output=nonnegative(usage.completion_tokens??usage.output_tokens,0);
  const cached=Math.min(input,nonnegative(usage.prompt_tokens_details?.cached_tokens??usage.cache_read_input_tokens,0));
  const reasoning=nonnegative(usage.completion_tokens_details?.reasoning_tokens,0);
  const price=knownPrices[provider+'/'+model];
  const usd=price?(Math.max(0,input-cached)*price.input+cached*price.cached+output*price.output)/1e6:null;
  const entry={at:new Date(now()).toISOString(),provider,model,input,output,cached,reasoning,costUsd:usd};
  const totals=state.totals;totals.requests++;totals.inputTokens+=input;totals.outputTokens+=output;
  if(usd===null)totals.unknownCostCalls++;else totals.knownCostUsd+=usd;
  const by=state.byModel[provider+'/'+model]||{requests:0,inputTokens:0,outputTokens:0,knownCostUsd:0,unknownCostCalls:0};
  by.requests++;by.inputTokens+=input;by.outputTokens+=output;if(usd===null)by.unknownCostCalls++;else by.knownCostUsd+=usd;
  state.byModel[provider+'/'+model]=by;state.recent.push(entry);if(state.recent.length>1000)state.recent.shift();save();
 }
 function summary(){return {totals:state.totals,byModel:state.byModel,recent:state.recent.slice(-30).reverse(),walletCount:Object.keys(state.wallets).length,priceKnownFor:Object.keys(knownPrices)};}
 return {balance,start,checkCall,success,finish,record,summary};
}
