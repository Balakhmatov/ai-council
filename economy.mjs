import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,appendFileSync,existsSync} from 'node:fs';

const direct=Object.freeze({
 'openai/gpt-6-luna':{input:0.10,cached:0.01,output:0.50,currency:'USD',source:'OpenAI Standard'},
 'mistral/mistral-large-2512':{input:0.50,cached:0.05,output:1.50,currency:'USD',source:'Mistral Standard'},
 'grok/grok-4.7':{input:2,cached:0.50,output:6,currency:'USD',source:'xAI direct'}
});
const grokHeavyCny=Object.freeze({input:0.60,cached:0.15,output:1.80});
export const BILLING_CATALOG=Object.freeze({
 subscription:{label:'Подписка · 30 дней',tasks:500,priceRub:1200,discount:20,monthly:true},
 pack10:{label:'10 задач',tasks:10,priceRub:30,discount:0},
 pack50:{label:'50 задач',tasks:50,priceRub:135,discount:10},
 pack100:{label:'100 задач',tasks:100,priceRub:255,discount:15}
});
// Effective RUB rates reconciled against the owner's DDTokens receipts.
// Dynamic group prices are estimates, not USD converted at the CBR rate.
const ddtokensRates=Object.freeze({
 'gemini/gemini-4-argon-high':Object.freeze({input:15.192,cached:null,output:75.96,source:'DDTokens Gemini(Antigravity)4 ×0.6 · receipts 2026-10-31'}),
 'claude/claude-sonnet-5-5':Object.freeze({input:25.32,cached:1.266,output:126.6,cacheWrite5m:31.65,cacheWrite1h:50.64,source:'DDTokens Claude(Fool) ×1 · receipts 2026-10-31'}),
});
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
 target.cacheWriteTokens=(target.cacheWriteTokens||0)+(entry.cacheWrite5m||0)+(entry.cacheWrite1h||0);
 target.reasoningTokens=(target.reasoningTokens||0)+entry.reasoning;
 if(entry.costRub!=null)target.costRub=(target.costRub||0)+entry.costRub;
 else target.unknownCostCalls=(target.unknownCostCalls||0)+1;
}
export function createEconomy({env,now=Date.now}){
 const file=env.ACCOUNTING_FILE||'';
 const logFile=env.ACCOUNTING_LOG_FILE||(file?file+'.requests.jsonl':'');
 const monthlyTasks=safeInt(env.ACCOUNT_MONTHLY_TASKS,10);
 const periodFor=()=>new Date(now()+10800000).toISOString().slice(0,7);
 const limitFor=()=>monthlyTasks;
 const ddtokensProxy=(env.XAI_BASE_URL||'').replace(/\/$/,'')==='https://ddtnew.com/v1';
 const ddtokensRubPerCny=rate(env.DDTOKENS_RUB_PER_CNY)||11.1;
 let state={allowances:{},subscriptions:{},purchasedCredits:{},totals:emptyMetrics(),byModel:{},recent:[],discussions:[],fx:null};
 if(file){try{
  const stored=JSON.parse(readFileSync(file,'utf8'));
  if(stored&&typeof stored==='object'&&stored.totals&&stored.byModel&&Array.isArray(stored.recent)&&(stored.allowances||stored.wallets)){
   state={...state,...stored};
   if(!state.allowances){state.allowances=Object.fromEntries(Object.entries(state.wallets||{}).map(([id,w])=>[id,{remainingFreeTasks:w.balance,createdAt:w.createdAt}]));delete state.wallets;}
   if(!Array.isArray(state.discussions))state.discussions=[];
   if(!state.fx)state.fx=null;
   state.subscriptions??={};state.purchasedCredits??={};
  }
 }catch(e){if(e.code!=='ENOENT')throw Error('Accounting state unreadable');}}
 // Keep a separate append-only audit of every metered API call. The rolling
 // recent preview is no longer the only record of billing history.
 if(logFile&&!existsSync(logFile)){
  const previous=state.recent.map(x=>JSON.stringify(x)).join('\n');
  writeFileSync(logFile,previous?previous+'\n':'',{mode:0o600,flag:'wx'});
 }
 const tasks=new Map();
 function save(){if(file){writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(file+'.tmp',file);}}
 function allowance(identity){
  if(!Object.hasOwn(state.allowances,identity)||state.allowances[identity].period!==periodFor(identity)){
   state.allowances[identity]={remainingFreeTasks:limitFor(identity),limit:limitFor(identity),period:periodFor(identity),createdAt:new Date(now()).toISOString()};save();
  }
  const entry=state.allowances[identity],limit=limitFor(identity),previous=entry.limit??5;
  if(entry.limit!==limit){
   entry.remainingFreeTasks=Math.max(0,Math.min(limit,entry.remainingFreeTasks+limit-previous));
   entry.limit=limit;save();
  }
  return entry;
 }
 function subscription(identity){
  const s=state.subscriptions[identity];
  return s&&Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>now()?s:null;
 }
 function catalog(){return BILLING_CATALOG;}
 function access(identity,isAdmin=false){
  const free=identity?allowance(identity):null,sub=identity?subscription(identity):null;
  const packs=identity?Math.max(0,state.purchasedCredits[identity]||0):0;
  return {
   accountRef:identity||null,
   plan:isAdmin?'admin':sub?'subscription':'free',
   subscriptionActive:!!sub,
   subscriptionExpiresAt:sub?.expiresAt||null,
   subscriptionRemaining:sub?.remainingTasks??0,
   purchasedTasks:packs,
   remainingFreeTasks:isAdmin?null:(sub?sub.remainingTasks+(packs||0):free.remainingFreeTasks+packs),
   freeRemaining:free?.remainingFreeTasks??0,
   freeStartingTasks:limitFor(identity),
   period:'month',resetTimezone:'Europe/Moscow',
   maxModels:isAdmin||sub?7:3,
   historyEnabled:!!identity&&(isAdmin||!!sub),
   authenticated:true,admin:isAdmin,
   paidPlansAvailable:false,
   catalog:BILLING_CATALOG
  };
 }
 function grant(identity,sku){
  if(typeof identity!=='string'||!/^account:[0-9a-f]{32}$/.test(identity))throw Error('Некорректный ID аккаунта');
  const offer=BILLING_CATALOG[sku];
  if(!offer)throw Error('Неизвестный тариф');
  if(sku==='subscription'){
   state.subscriptions[identity]={
    activatedAt:new Date(now()).toISOString(),
    expiresAt:new Date(now()+30*86400000).toISOString(),
    remainingTasks:offer.tasks
   };
  }else state.purchasedCredits[identity]=Math.max(0,state.purchasedCredits[identity]||0)+offer.tasks;
  save();return access(identity);
 }
 function activeTaskAccess(id,identity){
  const task=tasks.get(id);
  return task&&task.identity===identity?{historyEnabled:!!task.historyEnabled,detailedEnabled:!!task.isAdmin||!!subscription(identity),successful:task.successful,taskId:id}:null;
 }
 function exchangeRates(){return state.fx||null;}
 function updateExchangeRates(rates){
  if(!rates||!Number.isFinite(rates.usdRub)||!Number.isFinite(rates.cnyRub))throw Error('Некорректный курс');
  state.fx=rates;save();return rates;
 }
 function price(provider,model){
  const fx=exchangeRates();
  const proxyBase=String(env[provider.toUpperCase()+'_BASE_URL']||'').replace(/\/$/,'');
  const proxyRate=proxyBase==='https://ddtnew.com/v1'?ddtokensRates[provider+'/'+model]:null;
  if(proxyRate)return {...proxyRate,currency:'RUB',estimated:true,rate:1,rateCurrency:'RUB',rateDate:'2026-10-31'};
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
  return ['openai','mistral','grok',...['claude','gemini'].filter(p=>models[p])].map(provider=>{
   const model=models[provider]||({openai:'gpt-6-luna',mistral:'mistral-large-2512',grok:'grok-4.7'}[provider]);
   return {provider,model,...(price(provider,model)||{currency:'RUB',input:null,cached:null,output:null,source:'Тариф не задан',estimated:true})};
  });
 }
 function start(identity,isAdmin,params,available){
  const models=params?.participants,rounds=Number(params?.rounds),mode=params?.mode;
  if(!Array.isArray(models)||models.length<2||models.length>7||new Set(models).size!==models.length||models.some(id=>typeof id!=='string'||!available.includes(id))||!Number.isInteger(rounds)||rounds<2||rounds>5||!['consensus','vote','judge','roles','brainstorm'].includes(mode))return null;
  const allowedModels=isAdmin||!!subscription(identity)?7:3;
  if(!isAdmin&&models.length>allowedModels)return {upgradeRequired:true};
  const sub=isAdmin?null:subscription(identity);
  let source='admin';
  if(!isAdmin){
   if(sub&&sub.remainingTasks>0){sub.remainingTasks--;source='subscription';}
   else if(!sub&&allowance(identity).remainingFreeTasks>0){allowance(identity).remainingFreeTasks--;source='free';}
   else if((state.purchasedCredits[identity]||0)>0){state.purchasedCredits[identity]--;source='pack';}
   else return {insufficient:true};
   save();
  }
  const id=crypto.randomBytes(24).toString('hex');
  const limit=models.length*rounds+1+(['vote','consensus'].includes(mode)?models.length:0);
  tasks.set(id,{identity,allowed:new Set(models),maxCalls:limit,calls:0,finalCalls:0,successful:0,createdAt:now(),isAdmin,period:periodFor(identity),source,historyEnabled:!!identity&&(isAdmin||!!sub)});
  const group={taskId:id,startedAt:new Date(now()).toISOString(),endedAt:null,mode,rounds,
   participants:models,status:'running',...emptyMetrics(),byModel:{}};
  state.discussions.push(group);
  if(state.discussions.length>300)state.discussions.splice(0,state.discussions.length-300);
  save();
  return {taskId:id,maxCalls:limit,remainingFreeTasks:isAdmin?null:access(identity).remainingFreeTasks,historyEnabled:!!identity&&(isAdmin||!!sub)};
 }
 function checkCall(id,identity,provider,stage='intermediate'){
  const task=tasks.get(id);
  if(!task||task.identity!==identity||!task.allowed.has(provider)||task.calls>=task.maxCalls||now()-task.createdAt>7200000)return false;
  if(stage==='final'&&task.finalCalls>=1)return false;
  if(stage==='final')task.finalCalls++;
  task.calls++;return true;
 }
 function success(id){const task=tasks.get(id);if(task)task.successful++;}
 function finish(id,identity,{cancelled=false}={}){
  const task=tasks.get(id);if(!task||task.identity!==identity)return null;
  tasks.delete(id);
  // An explicit user stop consumes the allocated task even before the first answer.
  const refunded=!cancelled&&!task.isAdmin&&task.successful===0;
  if(refunded){
   if(task.source==='subscription'&&state.subscriptions[identity]?.expiresAt&&Date.parse(state.subscriptions[identity].expiresAt)>now())
    state.subscriptions[identity].remainingTasks++;
   else if(task.source==='free'&&task.period===periodFor(identity))allowance(identity).remainingFreeTasks++;
   else if(task.source==='pack')state.purchasedCredits[identity]=(state.purchasedCredits[identity]||0)+1;
  }
  const group=state.discussions.find(x=>x.taskId===id);
  if(group){group.endedAt=new Date(now()).toISOString();group.status=cancelled?'cancelled':task.successful?'done':'failed';}
  save();
  return {ok:true,refunded,cancelled:!!cancelled,remainingFreeTasks:task.isAdmin?null:access(identity).remainingFreeTasks};
 }
 function logCall({taskId=null,provider,model,stage='intermediate',step='',status='ok',httpStatus=null,durationMs=null,usage=null}){
  const hasUsage=!!usage&&typeof usage==='object'&&(
   Number.isFinite(Number(usage.prompt_tokens??usage.input_tokens))||Number.isFinite(Number(usage.completion_tokens??usage.output_tokens)));
  const rawInput=safeInt(usage?.prompt_tokens??usage?.input_tokens,0,100000000);
  const output=safeInt(usage?.completion_tokens??usage?.output_tokens,0,100000000);
  // Anthropic input_tokens excludes cache reads and writes; OpenAI prompt_tokens includes reads.
  const anthropic=provider==='claude'&&usage?.prompt_tokens==null;
  const cached=anthropic?safeInt(usage?.cache_read_input_tokens,0,100000000):Math.min(rawInput,safeInt(usage?.prompt_tokens_details?.cached_tokens,0,100000000));
  const creation=anthropic?safeInt(usage?.cache_creation_input_tokens,0,100000000):0;
  const cacheWrite1h=anthropic?safeInt(usage?.cache_creation?.ephemeral_1h_input_tokens,0,100000000):0;
  const cacheWrite5m=anthropic?safeInt(usage?.cache_creation?.ephemeral_5m_input_tokens,Math.max(0,creation-cacheWrite1h),100000000):0;
  const input=anthropic?rawInput+cached+cacheWrite5m+cacheWrite1h:rawInput;
  const reasoning=safeInt(usage?.completion_tokens_details?.reasoning_tokens,0,100000000);
  const p=price(provider,model);
  const knownRates=p&&[[input-cached-cacheWrite5m-cacheWrite1h,p.input],[cached,p.cached],[output,p.output],[cacheWrite5m,p.cacheWrite5m],[cacheWrite1h,p.cacheWrite1h]].every(([tokens,value])=>!tokens||Number.isFinite(value));
  const breakdown=hasUsage&&p&&p.rate!=null&&knownRates?{
   input:(input-cached-cacheWrite5m-cacheWrite1h)*p.input/1000000,
   cached:cached?(cached*p.cached/1000000):0,
   output:output*p.output/1000000,
   ...(cacheWrite5m?{cacheWrite5m:cacheWrite5m*p.cacheWrite5m/1000000}:{}),
   ...(cacheWrite1h?{cacheWrite1h:cacheWrite1h*p.cacheWrite1h/1000000}:{})
  }:null;
  const amount=breakdown?Object.values(breakdown).reduce((sum,value)=>sum+value,0):null;
  const entry={
   id:crypto.randomBytes(8).toString('hex'),taskId:typeof taskId==='string'&&/^[a-f0-9]{48}$/.test(taskId)?taskId:null,
   at:new Date(now()).toISOString(),provider,model,stage:typeof stage==='string'?stage.slice(0,32):'',
   step:typeof step==='string'?step.slice(0,48):'',status:status==='ok'?'ok':'error',
   httpStatus:Number.isInteger(httpStatus)?httpStatus:null,durationMs:safeInt(durationMs,0,3600000),
   input,output,cached,cacheWrite5m,cacheWrite1h,reasoning,usageReported:hasUsage,
   costRub:amount,costBreakdownRub:breakdown,currency:'RUB',rateUsed:p?.rate??null,rateCurrency:p?.rateCurrency??null,
   rateDate:p?.rateDate??null,unitPriceRub:p?{input:p.input,cached:p.cached,output:p.output,cacheWrite5m:p.cacheWrite5m??null,cacheWrite1h:p.cacheWrite1h??null}:null,
   costSource:amount!=null?p.source:'unknown'
  };
  const key=provider+'/'+model;
  const modelSummary=state.byModel[key]||emptyMetrics();
  const group=state.discussions.find(x=>x.taskId===entry.taskId);
  entry.discussionAccumulatedRub=group?Number(group.costRub||0)+(amount||0):null;
  entry.modelAccumulatedRub=Number(modelSummary.costRub||0)+(amount||0);
  addMetrics(state.totals,entry);
  addMetrics(modelSummary,entry);state.byModel[key]=modelSummary;
  if(group){addMetrics(group,entry);const sub=group.byModel[key]||emptyMetrics();addMetrics(sub,entry);group.byModel[key]=sub;}
  state.recent.push(entry);
  if(state.recent.length>300)state.recent.splice(0,state.recent.length-300);
  save();
  if(logFile)appendFileSync(logFile,JSON.stringify(entry)+'\n',{mode:0o600});
  return entry;
 }
 function record(provider,model,usage,context={}){return logCall({provider,model,usage,...context});}
 function listCalls({limit=50,offset=0,provider='',taskId=''}={}){
  const take=Math.max(1,Math.min(200,safeInt(limit,50,200)));
  const skip=safeInt(offset,0,10000000);
  let calls=state.recent;
  if(logFile&&existsSync(logFile)){
   // The file contains only metering metadata: no prompts, responses or credentials.
   const raw=readFileSync(logFile,'utf8');
   calls=raw.split('\n').filter(Boolean).map(line=>{
    try{return JSON.parse(line);}catch{return null;}
   }).filter(Boolean);
  }
  const matches=calls.filter(call=>
   (!provider||call.provider===provider)&&(!taskId||call.taskId===taskId));
  const page=matches.slice().reverse().slice(skip,skip+take);
  const fx=exchangeRates();
  const enrich=call=>({
   ...call,
   costRub:call.costRub??(call.estimatedCostRub??(call.costUsd!=null&&fx?call.costUsd*fx.usdRub:null)),
   historicalRateEstimated:call.costRub==null&&(call.costUsd!=null||call.estimatedCostRub!=null)
  });
  return {total:matches.length,offset:skip,limit:take,
   nextOffset:skip+page.length<matches.length?skip+page.length:null,
   calls:page.map(enrich)};
 }
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
 return {access,start,checkCall,success,finish,record,logCall,summary,listCalls,prices,exchangeRates,updateExchangeRates,grant,catalog,activeTaskAccess};
}

