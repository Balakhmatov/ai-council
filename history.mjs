import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';

// User-visible results live in a separate private file from API metering.
// No results are written for free or pack-only tasks.
export function createHistoryStore({file='',now=Date.now}={}){
 let state={accounts:{}};
 if(file&&existsSync(file)){
  const loaded=JSON.parse(readFileSync(file,'utf8'));
  if(loaded&&typeof loaded==='object'&&loaded.accounts&&typeof loaded.accounts==='object')state=loaded;
 }
 function save(){
  if(!file)return;
  writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});
  renameSync(file+'.tmp',file);
 }
 function validateMessages(messages){
  if(!Array.isArray(messages)||messages.length>90)throw Error('Некорректная история');
  return messages.map(m=>{
   if(!m||typeof m!=='object'||typeof m.text!=='string'||m.text.length>80000||
    typeof m.name!=='string'||m.name.length>100||typeof m.stage!=='string'||m.stage.length>150)
    throw Error('Некорректные сообщения');
   return {name:m.name,stage:m.stage,text:m.text,final:!!m.final,error:!!m.error};
  });
 }
 function record(identity,taskId,payload){
  if(typeof identity!=='string'||!/^account:[0-9a-f]{32}$/.test(identity))throw Error('История доступна только аккаунту');
  if(!/^[0-9a-f]{48}$/.test(taskId))throw Error('Некорректный идентификатор');
  const prompt=payload?.prompt;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>20000)throw Error('Некорректное задание');
  const profile=typeof payload.profile==='string'?payload.profile.slice(0,60):'';
  const specialization=typeof payload.specialization==='string'?payload.specialization.slice(0,100):'';
  const messages=validateMessages(payload.messages);
  if(!messages.length)return null;
  const account=state.accounts[identity]||{};
  if(account[taskId])return account[taskId];
  const item={taskId,createdAt:new Date(now()).toISOString(),title:prompt.trim().replace(/\s+/g,' ').slice(0,110),
   prompt,profile,specialization,messages};
  account[taskId]=item;state.accounts[identity]=account;save();
  return {taskId:item.taskId,createdAt:item.createdAt,title:item.title,profile,specialization};
 }
 function list(identity,{offset=0,limit=20}={}){
  const all=Object.values(state.accounts[identity]||{}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const start=Math.max(0,Math.min(1000000,Number(offset)||0));
  const take=Math.max(1,Math.min(50,Number(limit)||20));
  return {total:all.length,items:all.slice(start,start+take).map(({taskId,createdAt,title,profile,specialization})=>({taskId,createdAt,title,profile,specialization})),
   nextOffset:start+take<all.length?start+take:null};
 }
 function get(identity,taskId){return state.accounts[identity]?.[taskId]||null;}
 return {record,list,get};
}
