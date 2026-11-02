import crypto from 'node:crypto';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';

const ACCOUNT=/^account:[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES=new Set(['smm','marketing','advertising','copywriting','blogging']);
const dayOf=ms=>new Date(ms).toISOString().slice(0,10);
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const inRange=(day,from,to)=>day>=from&&day<=to;
const percent=(a,b)=>b?Math.round(a/b*1000)/10:null;
const distinct=a=>[...new Set(a)];
const blank=()=>({version:1,since:new Date().toISOString(),users:{},visitors:{},tasks:{}});
function normalize(input,now){
 if(!input||input.version!==1||typeof input.users!=='object'||!input.users||typeof input.tasks!=='object'||!input.tasks||typeof input.visitors!=='object'||!input.visitors)throw Error('Invalid analytics state');
 return input;
}
export function createAnalytics({file='',secret='',now=Date.now}={}){
 let state=blank();
 if(file){try{state=normalize(JSON.parse(readFileSync(file,'utf8')),now);}
  catch(error){if(error.code!=='ENOENT')throw Error('Analytics state unreadable');}}
 const save=()=>{if(file){writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(file+'.tmp',file);}};
 const touch=(id,{owner=false,method=''}={})=>{
  if(!ACCOUNT.test(id||''))return null;
  const at=new Date(now()).toISOString(),today=at.slice(0,10);
  const user=state.users[id]||{firstSeen:at,lastSeen:at,days:[],methods:[],owner:!!owner};
  user.lastSeen=at;user.owner=user.owner||!!owner;
  if(!user.days.includes(today))user.days.push(today);
  if(method&&!user.methods.includes(method))user.methods.push(method);
  state.users[id]=user;return user;
 };
 function login(id,{method='',owner=false}={}){
  if(!touch(id,{method,owner}))return false;
  save();return true;
 }
 function visit(visitorId,id=null,{owner=false}={}){
  if(typeof visitorId!=='string'||!UUID.test(visitorId))return false;
  const key='v:'+crypto.createHmac('sha256',secret||'quorum-visitors').update(visitorId.toLowerCase()).digest('hex').slice(0,32);
  const at=new Date(now()).toISOString(),today=at.slice(0,10);
  const visitor=state.visitors[key]||{firstSeen:at,days:[],account:null};
  if(!visitor.days.includes(today))visitor.days.push(today);
  if(ACCOUNT.test(id||'')){
   visitor.account=id;
   touch(id,{owner});
  }
  state.visitors[key]=visitor;save();return true;
 }
 function start(taskId,id,params,owner=false){
  if(!/^[0-9a-f]{48}$/.test(taskId||'')||!ACCOUNT.test(id||'')||state.tasks[taskId])return false;
  const user=touch(id,{owner});
  const profile=CATEGORIES.has(params?.profile)?params.profile:'unspecified';
  const subtask=typeof params?.subtask==='string'&&/^[a-z0-9_-]{1,32}$/.test(params.subtask)?params.subtask:'unspecified';
  state.tasks[taskId]={account:id,startedAt:new Date(now()).toISOString(),endedAt:null,status:'started',profile,subtask,
   models:Array.isArray(params?.participants)?params.participants.length:0};
  user.lastTaskAt=new Date(now()).toISOString();save();return true;
 }
 function finish(taskId,status){
  const task=state.tasks[taskId];
  if(!task||task.status!=='started'||!['done','failed','cancelled'].includes(status))return false;
  task.endedAt=new Date(now()).toISOString();task.status=status;
  const user=touch(task.account);
  user.lastTaskAt=task.endedAt;save();return true;
 }
 function report({days=30,orders=[],linkedMembers=()=>[]}={}){
  const span=[7,30,90].includes(Number(days))?Number(days):30;
  const to=dayOf(now()),from=addDays(to,1-span);
  const canonical=id=>{
   if(!ACCOUNT.test(id||''))return null;
   const linked=linkedMembers(id);
   const ids=[id,...(Array.isArray(linked)?linked.filter(x=>ACCOUNT.test(x)):[])];
   return ids.sort()[0];
  };
  const grouped=new Map();
  for(const [id,user]of Object.entries(state.users)){
   if(user.owner)continue;
   const key=canonical(id);if(!key)continue;
   if(!grouped.has(key))grouped.set(key,{firstSeen:user.firstSeen,days:[],methods:[],tasks:0});
   const item=grouped.get(key);if(item.firstSeen>user.firstSeen)item.firstSeen=user.firstSeen;
   item.days=distinct([...item.days,...user.days]);
   item.methods=distinct([...item.methods,...user.methods]);
  }
  const relevantTasks=Object.entries(state.tasks).filter(([,task])=>task.startedAt?.slice(0,10)>=from&&task.startedAt?.slice(0,10)<=to&&grouped.has(canonical(task.account)));
  const allTasks=Object.values(state.tasks).filter(task=>grouped.has(canonical(task.account)));
  const visitors=Object.values(state.visitors);
  const visitorsIn=visitors.filter(v=>v.days?.some(d=>inRange(d,from,to)));
  const seenAccounts=new Set(visitorsIn.map(v=>canonical(v.account)).filter(id=>grouped.has(id)));
  const activeAccounts=[...grouped].filter(([,u])=>u.days.some(d=>inRange(d,from,to)));
  const taskAccounts=new Set(relevantTasks.map(([,t])=>canonical(t.account)));
  const firstTasks=new Map();
  for(const task of allTasks){const key=canonical(task.account),date=task.startedAt;
   if(key&&(!firstTasks.has(key)||firstTasks.get(key)>date))firstTasks.set(key,date);}
  const payingOrders=orders.filter(o=>o?.status==='succeeded'&&o?.applied===true&&
   Number.isFinite(o.amountRub)&&o.amountRub>=0&&ACCOUNT.test(o.identity||''));
  const within=payingOrders.filter(o=>inRange(dayOf(o.capturedAt||o.createdAt),from,to));
  const paidAccounts=new Set(within.map(o=>canonical(o.identity)));
  const byProfile={},bySubtask={};
  const daily=Array.from({length:span},(_,i)=>{
   const day=addDays(from,i);
   const taskRows=relevantTasks.filter(([,t])=>t.startedAt.startsWith(day));
   const bills=within.filter(o=>dayOf(o.capturedAt||o.createdAt)===day);
   return {day,visitors:visitors.filter(v=>v.days?.includes(day)).length,
    active:[...grouped.values()].filter(u=>u.days.includes(day)).length,
    newUsers:[...grouped.values()].filter(u=>u.firstSeen.startsWith(day)).length,
    tasks:taskRows.length,completed:taskRows.filter(([,t])=>t.status==='done').length,
    revenue:Math.round(bills.reduce((n,o)=>n+o.amountRub,0)*100)/100};
  });
  for(const [,t]of relevantTasks){
   byProfile[t.profile]=(byProfile[t.profile]||0)+1;
   const key=t.profile+'/'+t.subtask;bySubtask[key]=(bySubtask[key]||0)+1;
  }
  const firstAt=(offset)=>[...grouped.values()].filter(u=>{
   const cohort=u.firstSeen.slice(0,10);
   return addDays(cohort,offset)<=to;
  });
  const retention=(n)=>{const cohort=firstAt(n);return {eligible:cohort.length,returned:cohort.filter(u=>u.days.includes(addDays(u.firstSeen.slice(0,10),n))).length,percent:percent(cohort.filter(u=>u.days.includes(addDays(u.firstSeen.slice(0,10),n))).length,cohort.length)};};
  const repeats=new Map();
  for(const task of allTasks){const key=canonical(task.account);repeats.set(key,(repeats.get(key)||0)+1);}
  const paidAlltimeAccounts=new Set(payingOrders.map(o=>canonical(o.identity)));
  const firstTaskIn=[...firstTasks].filter(([,at])=>inRange(at.slice(0,10),from,to)).length;
  return {
   since:state.since,from,to,days:span,
   audience:{visitors:visitorsIn.length,observedAccounts:grouped.size,newAccounts:[...grouped.values()].filter(u=>inRange(u.firstSeen.slice(0,10),from,to)).length,
    authenticatedVisitors:seenAccounts.size,active:activeAccounts.length,
    dau:daily.at(-1)?.active||0,wau:[...grouped.values()].filter(u=>u.days.some(d=>inRange(d,addDays(to,-6),to))).length,
    mau:[...grouped.values()].filter(u=>u.days.some(d=>inRange(d,addDays(to,-29),to))).length,
    returning:activeAccounts.filter(([id])=>(repeats.get(id)||0)>=2).length,
    retentionD1:retention(1),retentionD7:retention(7)},
   tasks:{started:relevantTasks.length,completed:relevantTasks.filter(([,t])=>t.status==='done').length,
    failed:relevantTasks.filter(([,t])=>t.status==='failed').length,
    cancelled:relevantTasks.filter(([,t])=>t.status==='cancelled').length,
    running:relevantTasks.filter(([,t])=>t.status==='started').length,
    uniqueAccounts:taskAccounts.size,firstTaskUsers:firstTaskIn,
    repeatedAccounts:[...taskAccounts].filter(id=>(repeats.get(id)||0)>=2).length,
    byProfile:Object.entries(byProfile).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
    bySubtask:Object.entries(bySubtask).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))},
   billing:{revenueRub:Math.round(within.reduce((sum,o)=>sum+o.amountRub,0)*100)/100,
    successfulPayments:within.length,payingAccounts:paidAccounts.size,paidAccountsAllTime:paidAlltimeAccounts.size,
    subscriptions:within.filter(o=>o.sku==='subscription').length,packs:within.filter(o=>o.sku!=='subscription').length,
    recent:within.slice().sort((a,b)=>Date.parse(b.capturedAt||b.createdAt)-Date.parse(a.capturedAt||a.createdAt)).slice(0,10)
      .map(o=>({at:new Date(o.capturedAt||o.createdAt).toISOString(),sku:o.sku,amountRub:o.amountRub}))},
   funnel:{visitors:visitorsIn.length,authenticated:seenAccounts.size,
    taskUsers:[...seenAccounts].filter(id=>allTasks.some(t=>canonical(t.account)===id)).length,
    buyers:[...seenAccounts].filter(id=>paidAlltimeAccounts.has(id)).length,
    registeredToFirstTask:percent(firstTaskIn,[...grouped.values()].filter(u=>inRange(u.firstSeen.slice(0,10),from,to)).length)},
   daily
  };
 }
 return {login,visit,start,finish,report};
}
