import {modes,discuss} from './engine.js';
import {profiles,resolveProfile} from './profiles.js';
import {getTaskHint} from './examples.js?v=purpose8';
import {getTelegramContext} from './telegram-bridge.js';
import {loadRememberedSession,rememberSession,forgetSession} from './auth-state.js';

const $=id=>document.getElementById(id);
const agents=[
 {id:'openai',name:'OpenAI',sub:'Логика и структура'},
 {id:'grok',name:'Grok',sub:'Нестандартный взгляд'},
 {id:'mistral',name:'Mistral',sub:'Ясность и точность'},
 {id:'qwen',name:'Qwen',sub:'Детали и анализ'},
 {id:'deepseek',name:'DeepSeek',sub:'Глубина рассуждений'},
 {id:'gemini',name:'Gemini',sub:'Широта контекста'},
 {id:'claude',name:'Claude',sub:'Аргументы и редактура'}
];
const API=location.hostname.endsWith('github.io')?'https://cityai.site/quorum':new URL('./',location.href).pathname.replace(/\/$/,'');
let telegramContext=null,telegramIdentity=null;
let adminToken=sessionStorage.getItem('quorum-admin')||'',publicSession=null,available=new Set(),connected=false,access=null;
let mode='consensus',profileId='smm',taskId='',controller=null,messages=[],events=[],running=false,activeTask=null;
const chosen=new Set(['openai','grok','mistral']);

function renderProfiles(){
 $('profiles').replaceChildren(...profiles.map(p=>{
  const b=document.createElement('button');b.type='button';b.className='profile-option';
  b.textContent=p.name;b.title=p.summary;b.classList.toggle('active',p.id===profileId);
  b.setAttribute('aria-pressed',String(p.id===profileId));b.onclick=()=>{profileId=p.id;taskId='';renderProfiles();renderSubtasks();syncTaskHint();};
  return b;
 }));
}
function renderSubtasks(){
 const {profile}=resolveProfile(profileId,taskId);
 const tasks=[['','Любая задача'],...profile.tasks.map(t=>[t[0],t[1]])];
 $('subtasks').replaceChildren(...tasks.map(([id,label])=>{
  const b=document.createElement('button');b.type='button';
  b.className='task-option'+(id===''?' task-option-any':'');
  b.classList.toggle('active',id===taskId);
  b.textContent=label;b.setAttribute('aria-pressed',String(id===taskId));
  b.onclick=()=>{taskId=id;renderSubtasks();syncTaskHint();};return b;
 }));
}
function syncTaskHint(){
 // Explain what this section is for; do not replace any user-entered task.
 $('task').placeholder=getTaskHint(profileId,taskId);
}
renderProfiles();renderSubtasks();syncTaskHint();
for(const a of agents){
 const label=document.createElement('label');label.className='agent';
 const avatar=document.createElement('span');avatar.className='avatar provider-avatar';
 const img=document.createElement('img');img.src='./assets/models/'+a.id+'.svg';img.width=26;img.height=26;img.alt='';avatar.append(img);
 const data=document.createElement('span');const strong=document.createElement('strong');strong.textContent=a.name;const small=document.createElement('small');small.textContent=a.sub;data.append(strong,small);
 const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label',a.name);input.checked=chosen.has(a.id);
 input.onchange=()=>{input.checked?chosen.add(a.id):chosen.delete(a.id);update();};
 label.append(avatar,data,input);$('agents').append(label);
}
for(const [id,[title,description]] of Object.entries(modes)){
 const b=document.createElement('button');b.type='button';b.className='mode';b.dataset.id=id;
 const name=document.createElement('span');name.textContent=title;const small=document.createElement('small');small.textContent=description;
 b.append(name,small);b.onclick=()=>{mode=id;update();};$('modes').append(b);
}
function update(){
 const old=$('judge').value;
 $('count').textContent=chosen.size+' / 7';
 $('judge').replaceChildren(...agents.filter(a=>chosen.has(a.id)).map(a=>new Option(a.name,a.id)));
 const preferred=chosen.has(old)?old:chosen.has('grok')?'grok':agents.find(a=>chosen.has(a.id))?.id;
 if(preferred)$('judge').value=preferred;
 document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.id===mode));
 const judgeName=agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель';
 $('budget').textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог подготовит '+judgeName;
 const mq=$('mobileQuorumText');
 if(mq) mq.textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог '+judgeName;
 const enough=access?.admin||access?.remainingFreeTasks>0;
 $('start').textContent=access?'Получить результат':'Войти и начать';
 $('start').disabled=running||chosen.size<2||(!connected&&!$('demo').checked)||(!!access&&!enough&&!$('demo').checked);
 document.querySelectorAll('.agent').forEach((label,i)=>{
  const a=agents[i],ok=$('demo').checked||available.has(a.id),input=label.querySelector('input');
  input.disabled=running||!ok;label.classList.toggle('unavailable',!ok);
  label.querySelector('small').textContent=ok?a.sub:'Скоро';
 });
 document.querySelectorAll('.profile-option,.task-option,.mode').forEach(b=>b.disabled=running);
}
$('rounds').onchange=update;$('length').onchange=update;$('judge').onchange=update;
$('mobileQuorumJump')?.addEventListener('click',()=>{
  const el=document.querySelector('aside');
  if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
});

async function api(path,{method='GET',body,token,signal}={}){
 const response=await fetch(API+path,{method,credentials:'include',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal});
 let data;try{data=await response.json();}catch{throw Error('Сервис временно недоступен. Попробуйте позже.');}
 if(!response.ok){const error=new Error(data.error?.message||'Ошибка сервиса');error.status=response.status;throw error;}
 return data;
}
