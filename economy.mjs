import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';

const knownPrices=Object.freeze({
 'openai/gpt-6-luna':{input:0.10,cached:0.01,output:0.50},
 'mistral/mistral-large-2512':{input:0.50,cached:0.05,output:1.50},
 'grok/grok-4.7':{input:2,cached:0.50,output:6}
});
// DDTokens Grok(heavy) = 0.3x on its $2/$0.5/$6 list prices.
// Its public relay catalogue expresses the resulting rates as CNY 0.60/0.15/1.80 per million.
// 11.1 RUB per nominal CNY is an INFERRED display conversion from the user's
// October 2026 billing screenshots, not an official FX rate or actual charge.
const ddtokensGrokCny=Object.freeze({input:0.60,cached:0.15,output:1.80});
function validRate(value,fallback){const n=Number(value);return Number.isFinite(n)&&n>0&&n<1000?n:fallback;}
function nonnegative(value,fallback){const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=100000?n:fallback;}
export function createEconomy({env,now=Date.now}){
 const file=env.ACCOUNTING_FILE||'';
 const freeTasks=nonnegative(env.FREE_START_TASKS,3);
 const ddtokensProxy=/^https:\/\/ddtnew\.com\/v1\/?$/.test(env.XAI_BASE_URL||'');
 const ddtokensRubPerCny=validRate(env.DDTOKENS_RUB_PER_CNY,11.1);
 let state={allowances:{},totals:{requests:0,knownCostUsd:0,unknownCostCalls:0,inputTokens:0,outputTokens:0},byModel:{},recent:[]};
 if(file){try{
  const stored=JSON.parse(readFileSync(file,'utf8'));
  if(stored&&typeof stored==='object'&&(stored.allowances||stored.wallets)&&stored.totals&&stored.byModel&&Array.isArray(stored.recent)){state=stored;if(!state.allowances){state.allowances=Object.fromEntries(Object.entries(state.wallets||{}).map(([id,w])=>[id,{remainingFreeTasks:w.balance,createdAt:w.createdAt}]));delete state.wallets;}}
 }catch(e){if(e.code!=='ENOENT')throw Error('Accounting state unreadable');}}
 const tasks=new Map();
 function save(){if(file){writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(file+'.tmp',file);}}
 function allowance(identity){
  if(!Object.hasOwn(state.allowances,identity)){
   state.allowances[identity]={remainingFreeTasks:freeTasks,createdAt:new Date(now()).toISOString()};
   save();
  }
  return state.allowances[identity];
 }
 function access(identity,isAdmin=false){
  return {remainingFreeTasks:isAdmin?null:allowance(identity).remainingFreeTasks,
   freeStartingTasks:freeTasks,admin:isAdmin,paidPlansAvailable:false};
 }
 function start(identity,isAdmin,params,available){
  const models=params?.participants,rounds=Number(params?.rounds),mode=params?.mode;
  if(!Array.isArray(models)||models.length<2||models.length>7||new Set(models).size!==models.length||models.some(id=>typeof id!=='string'||!available.includes(id))||!Number.isInteger(rounds)||rounds<2||rounds>5||!['consensus','vote','judge','roles','brainstorm'].includes(mode))return null;
  if(!isAdmin&&allowance(identity).remainingFreeTasks<1)return {insufficient:true};
  if(!isAdmin){allowance(identity).remainingFreeTasks--;save();}
  const id=crypto.randomBytes(24).toString('hex');
  const limit=models.length*rounds+1+(['vote','consensus'].includes(mode)?models.length:0);
  tasks.set(id,{identity,allowed:new Set(models),maxCalls:limit,calls:0,finalCalls:0,successful:0,createdAt:now(),isAdmin});
  return {taskId:id,maxCalls:limit,remainingFreeTasks:isAdmin?null:allowance(identity).remainingFreeTasks};
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
  if(!task.isAdmin&&task.successful===0){allowance(identity).remainingFreeTasks++;save();}
  return {ok:true,refunded:!task.isAdmin&&task.successful===0,remainingFreeTasks:task.isAdmin?null:allowance(identity).remainingFreeTasks};
 }
 function record(provider,model,usage){
  const usageReported=!!usage&&typeof usage==='object';
  usage=usageReported?usage:{};
  const input=nonnegative(usage.prompt_tokens??usage.input_tokens,0),output=nonnegative(usage.completion_tokens??usage.output_tokens,0);
  const cached=Math.min(input,nonnegative(usage.prompt_tokens_details?.cached_tokens??usage.cache_read_input_tokens,0));
  const reasoning=nonnegative(usage.completion_tokens_details?.reasoning_tokens,0);
  const isDdTokensGrok=ddtokensProxy&&provider==='grok'&&model==='grok-4.7';
  const price=isDdTokensGrok?null:knownPrices[provider+'/'+model];
  const usd=price&&usageReported?(Math.max(0,input-cached)*price.input+cached*price.cached+output*price.output)/1e6:null;
  // Approximate proxy RUB charge separately: never mix RUB and USD in one total.
  const rub=isDdTokensGrok&&usageReported?
   ((Math.max(0,input-cached)*ddtokensGrokCny.input+cached*ddtokensGrokCny.cached+output*ddtokensGrokCny.output)/1e6)*ddtokensRubPerCny:null;
  const entry={at:new Date(now()).toISOString(),provider,model,input,output,cached,reasoning,usageReported,
   costUsd:usd,estimatedCostRub:rub,costSource:rub!==null?'ddtokens-grok-heavy-estimate':usd!==null?'direct-api-list':'unknown'};
  const totals=state.totals;
  totals.estimatedCostRub??=0;totals.estimatedRubCalls??=0;
  totals.requests++;totals.inputTokens+=input;totals.outputTokens+=output;
  if(rub!==null){totals.estimatedCostRub+=rub;totals.estimatedRubCalls++;}
  else if(usd!==null)totals.knownCostUsd+=usd;
  else totals.unknownCostCalls++;
  const by=state.byModel[provider+'/'+model]||{requests:0,inputTokens:0,outputTokens:0,knownCostUsd:0,unknownCostCalls:0};
  by.estimatedCostRub??=0;by.estimatedRubCalls??=0;
  by.requests++;by.inputTokens+=input;by.outputTokens+=output;
  if(rub!==null){by.estimatedCostRub+=rub;by.estimatedRubCalls++;}
  else if(usd!==null)by.knownCostUsd+=usd;
  else by.unknownCostCalls++;
  state.byModel[provider+'/'+model]=by;state.recent.push(entry);if(state.recent.length>1000)state.recent.shift();save();
 }
 function summary(){return {totals:state.totals,byModel:state.byModel,recent:state.recent.slice(-30).reverse(),freeAccounts:Object.keys(state.allowances).length,priceKnownFor:Object.keys(knownPrices),ddtokensGrokPricing:ddtokensProxy?{rubPerCny:ddtokensRubPerCny,group:'Grok(heavy) ×0.3',estimated:true}:null};}
 return {access,start,checkCall,success,finish,record,summary};
}
