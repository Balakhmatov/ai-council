import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';

const direct=Object.freeze({
 'openai/gpt-6-luna':{input:0.10,cached:0.01,output:0.50,currency:'USD',source:'OpenAI Standard'},
 'mistral/mistral-large-2512':{input:0.50,cached:0.05,output:1.50,currency:'USD',source:'Mistral Standard'},
 'grok/grok-4.7':{input:2,cached:0.50,output:6,currency:'USD',source:'xAI direct'}
});
const grokHeavyCny=Object.freeze({input:0.60,cached:0.15,output:1.80});
function safeInt(value,fallback,max=100000){
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=max?n:fallback;
}
function rate(value){const n=Number(value);return value!==''&&value!=null&&Number.isFinite(n)&&n>=1&&n<=1000?n:null;}
function emptyMetrics(){return {requests:0,errors:0,inputTokens:0,outputTokens:0,cachedTokens:0,reasoningTokens:0,costRub:0,unknownCostCalls:0};}
function addMetrics(target,entry){
 target.requests=(target.requests||0)+1;
 if(entry.status!=='ok')target.errors=(target.errors||0)+1;
 target.inputTokens=(target.inputTokens||0)+entry.input;
 target.outputTokens=(target.outputTokens||0)+entry.output;
 target.cachedTokens=(target.cachedTokens||0)+entry.cached;
 target.reasoningTokens=(target.reasoningTokens||0)+entry.reasoning;
 if(entry.costRub!=null)target.costRub=(target.costRub||0)+entry.costRub;
 else target.unknownCostCalls=(target.unknownCostCalls||0)+1;
}
export function createEconomy({env,now=Date.now}){
 const file=env.ACCOUNTING_FILE||'';
 const freeTasks=safeInt(env.FREE_START_TASKS,3);
 const ddtokensProxy=(env.XAI_BASE_URL||'').replace(/\/$/,'')==='https://ddtnew.com/v1';
 const ddtokensRubPerCny=rate(env.DDTOKENS_RUB_PER_CNY)||11.1;
 let state={allowances:{},totals:emptyMetrics(),byModel:{},recent:[],discussions:[],fx:null};
 if(file){try{
  const stored=JSON.parse(readFileSync(file,'utf8'));
  if(stored&&typeof stored==='object'&&stored.totals&&stored.byModel&&Array.isArray(stored.recent)&&(stored.allowances||stored.wallets)){
   state={...state,...stored};
   if(!state.allowances){state.allowances=Object.fromEntries(Object.entries(state.wallets||{}).map(([id,w])=>[id,{remainingFreeTasks:w.balance,createdAt:w.createdAt}]));delete state.wallets;}
   if(!Array.isArray(state.discussions))state.discussions=[];
   if(!state.fx)state.fx=null;
  }
 }catch(e){if(e.code!=='ENOENT')throw Error('Accounting state unreadable');}}
 const tasks=new Map();
 function save(){if(file){writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(file+'.tmp',file);}}
 function allowance(identity){
  if(!Object.hasOwn(state.allowances,identity)){
   state.allowances[identity]={remainingFreeTasks:freeTasks,createdAt:new Date(now()).toISOString()};save();
  }
  return state.allowances[identity];
 }
 function access(identity,isAdmin=false){
  return {remainingFreeTasks:isAdmin?null:allowance(identity).remainingFreeTasks,freeStartingTasks:freeTasks,admin:isAdmin,paidPlansAvailable:false};
 }
 function exchangeRates(){return state.fx||null;}
 function updateExchangeRates(rates){
  if(!rates||!Number.isFinite(rates.usdRub)||!Number.isFinite(rates.cnyRub))throw Error('Некорректный курс');
  state.fx=rates;save();return rates;
 }
 function price(provider,model){
  const fx=exchangeRates();
  if(ddtokensProxy&&provider==='grok'&&model==='grok-4.7'){
   return {currency:'RUB',input:fx?grokHeavyCny.input*fx.cnyRub:null,
    cached:fx?grokHeavyCny.cached*fx.cnyRub:null,output:fx?grokHeavyCny.output*fx.cnyRub:null,
    source:'DDTokens Grok heavy ×0.3 · CBR CNY',estimated:true,rate:fx?.cnyRub??null,rateCurrency:'CNY',
    rateDate:fx?.rateDate??null};
  }
  const p=direct[provider+'/'+model];
  if(!p)return null;
  return {currency:'RUB',input:fx?p.input*fx.usdRub:null,
   cached:fx?p.cached*fx.usdRub:null,output:fx?p.output*fx.usdRub:null,
   source:p.source+' · CBR USD',estimated:true,rate:fx?.usdRub??null,rateCurrency:'USD',
   rateDate:fx?.rateDate??null};
 }
 function prices(models={}){
  return ['openai','mistral','grok'].map(provider=>{
   const model=models[provider]||({openai:'gpt-6-luna',mistral:'mistral-large-2512',grok:'grok-4.7'}[provider]);
   return {provider,model,...(price(provider,model)||{currency:'RUB',input:null,cached:null,output:null,source:'Тариф не задан',estimated:true})};
  });
 }
 function start(identity,isAdmin,params,available){
  const models=params?.participants,rounds=Number(params?.rounds),mode=params?.mode;
  if(!Array.isArray(models)||models.length<2||models.length>7||new Set(models).size!==models.length||models.some(id=>typeof id!=='string'||!available.includes(id))||!Number.isInteger(rounds)||rounds<2||rounds>5||!['consensus','vote','judge','roles','brainstorm'].includes(mode))return null;
  if(!isAdmin&&allowance(identity).remainingFreeTasks<1)return {insufficient:true};
  if(!isAdmin){allowance(identity).remainingFreeTasks--;save();}
  const id=crypto.randomBytes(24).toString('hex');
  const limit=models.length*rounds+1+(['vote','consensus'].includes(mode)?models.length:0);
  tasks.set(id,{identity,allowed:new Set(models),maxCalls:limit,calls:0,finalCalls:0,successful:0,createdAt:now(),isAdmin});
  const group={taskId:id,startedAt:new Date(now()).toISOString(),endedAt:null,mode,rounds,
   participants:models,status:'running',...emptyMetrics(),byModel:{}};
  state.discussions.push(group);
  if(state.discussions.length>300)state.discussions.splice(0,state.discussions.length-300);
  save();
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
  const refunded=!task.isAdmin&&task.successful===0;
  if(refunded)allowance(identity).remainingFreeTasks++;
  const group=state.discussions.find(x=>x.taskId===id);
  if(group){group.endedAt=new Date(now()).toISOString();group.status=task.successful?'done':'failed';}
  save();
  return {ok:true,refunded,remainingFreeTasks:task.isAdmin?null:allowance(identity).remainingFreeTasks};
 }
 function logCall({taskId=null,provider,model,stage='intermediate',step='',status='ok',httpStatus=null,durationMs=null,usage=null}){
  const hasUsage=!!usage&&typeof usage==='object'&&(
   Number.isFinite(Number(usage.prompt_tokens??usage.input_tokens))||Number.isFinite(Number(usage.completion_tokens??usage.output_tokens)));
  const input=safeInt(usage?.prompt_tokens??usage?.input_tokens,0,100000000);
  const output=safeInt(usage?.completion_tokens??usage?.output_tokens,0,100000000);
  const cached=Math.min(input,safeInt(usage?.prompt_tokens_details?.cached_tokens??usage?.cache_read_input_tokens,0,100000000));
  const reasoning=safeInt(usage?.completion_tokens_details?.reasoning_tokens,0,100000000);
  const p=price(provider,model);
  const amount=hasUsage&&p&&p.rate!=null?(Math.max(0,input-cached)*p.input+cached*p.cached+output*p.output)/1000000:null;
  const entry={
   id:crypto.randomBytes(8).toString('hex'),taskId:typeof taskId==='string'&&/^[a-f0-9]{48}$/.test(taskId)?taskId:null,
   at:new Date(now()).toISOString(),provider,model,stage:typeof stage==='string'?stage.slice(0,32):'',
   step:typeof step==='string'?step.slice(0,48):'',status:status==='ok'?'ok':'error',
   httpStatus:Number.isInteger(httpStatus)?httpStatus:null,durationMs:safeInt(durationMs,0,3600000),
   input,output,cached,reasoning,usageReported:hasUsage,
   costRub:amount,currency:'RUB',rateUsed:p?.rate??null,rateCurrency:p?.rateCurrency??null,
   rateDate:p?.rateDate??null,unitPriceRub:p?{input:p.input,cached:p.cached,output:p.output}:null,
   costSource:amount!=null?p.source:'unknown'
  };
  addMetrics(state.totals,entry);
  const key=provider+'/'+model;
  const modelSummary=state.byModel[key]||emptyMetrics();
  addMetrics(modelSummary,entry);state.byModel[key]=modelSummary;
  const group=state.discussions.find(x=>x.taskId===entry.taskId);
  if(group){addMetrics(group,entry);const sub=group.byModel[key]||emptyMetrics();addMetrics(sub,entry);group.byModel[key]=sub;}
  state.recent.push(entry);
  if(state.recent.length>3000)state.recent.splice(0,state.recent.length-3000);
  save();
  return entry;
 }
 function record(provider,model,usage,context={}){return logCall({provider,model,usage,...context});}
 function summary(models={}){
  const fx=exchangeRates();
  const legacyTotals=state.totals||{};
  const convert=(metrics)=>{
   const usd=Number(metrics.knownCostUsd||0);
   const rub=Number(metrics.estimatedCostRub||0);
   return {...metrics,costRub:Number(metrics.costRub||0)+rub+(fx?.usdRub?usd*fx.usdRub:0),
    legacyUnconvertedUsd:fx?.usdRub?0:usd,
    unknownCostCalls:Number(metrics.unknownCostCalls||0)};
  };
  return {totals:convert(legacyTotals),byModel:Object.fromEntries(Object.entries(state.byModel).map(([k,v])=>[k,convert(v)])),
   recent:state.recent.slice(-200).reverse().map(x=>({
    ...x,costRub:x.costRub??(x.estimatedCostRub??(x.costUsd!=null&&fx?x.costUsd*fx.usdRub:null)),
    historicalRateEstimated:x.costRub==null&&(x.costUsd!=null||x.estimatedCostRub!=null)
   })),
   discussions:state.discussions.slice(-80).reverse().map(x=>({...convert(x),
    status:x.status==='running'&&now()-Date.parse(x.startedAt)>7200000?'interrupted':x.status,
    byModel:Object.fromEntries(Object.entries(x.byModel||{}).map(([k,v])=>[k,convert(v)]))})),
   freeAccounts:Object.keys(state.allowances).length,
   prices:prices(models),fx:fx?{...fx,stale:now()-Date.parse(fx.fetchedAt)>48*3600000}:null,
   legacyCurrencyNotice:Number(legacyTotals.knownCostUsd||0)>0};
 }
 return {access,start,checkCall,success,finish,record,logCall,summary,prices,exchangeRates,updateExchangeRates};
}
