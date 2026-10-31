import {modes,discuss} from './engine.js';
import {profiles,resolveProfile} from './profiles.js';
import {getTaskExample} from './examples.js';
import {getTelegramContext} from './telegram-bridge.js';

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
let telegramContext=null,telegramIdentity=null,telegramLogin=null;
let adminToken=sessionStorage.getItem('quorum-admin')||'',publicSession=null,available=new Set(),connected=false,access=null;
let mode='consensus',profileId='smm',taskId='',controller=null,messages=[],events=[],running=false,activeTask=null;
const chosen=new Set(['openai','grok','mistral']);

function renderProfiles(){
 $('profiles').replaceChildren(...profiles.map(p=>{
  const b=document.createElement('button');b.type='button';b.className='profile-option';
  b.textContent=p.name;b.title=p.summary;b.classList.toggle('active',p.id===profileId);
  b.setAttribute('aria-pressed',String(p.id===profileId));b.onclick=()=>{profileId=p.id;taskId='';renderProfiles();renderSubtasks();syncTaskExample();};
  return b;
 }));
}
function renderSubtasks(){
 const {profile}=resolveProfile(profileId,taskId);
 const tasks=[['','Любая задача'],...profile.tasks.map(t=>[t[0],t[1]])];
 $('subtasks').replaceChildren(...tasks.map(([id,label])=>{
  const b=document.createElement('button');b.type='button';b.className='task-option';b.classList.toggle('active',id===taskId);
  b.textContent=label;b.setAttribute('aria-pressed',String(id===taskId));b.onclick=()=>{taskId=id;renderSubtasks();syncTaskExample();};return b;
 }));
}
function syncTaskExample(){
 // The placeholder must never replace the user's draft.
 $('task').placeholder=getTaskExample(profileId,taskId);
}
renderProfiles();renderSubtasks();syncTaskExample();
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
 $('budget').textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог подготовит '+(agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель');
 const enough=access?.admin||access?.remainingFreeTasks>0;
 $('start').disabled=running||chosen.size<2||(!connected&&!$('demo').checked)||(!enough&&!$('demo').checked);
 document.querySelectorAll('.agent').forEach((label,i)=>{
  const a=agents[i],ok=$('demo').checked||available.has(a.id),input=label.querySelector('input');
  input.disabled=running||!ok;label.classList.toggle('unavailable',!ok);
  label.querySelector('small').textContent=ok?a.sub:'Скоро';
 });
 document.querySelectorAll('.profile-option,.task-option,.mode').forEach(b=>b.disabled=running);
}
$('rounds').onchange=update;$('length').onchange=update;$('judge').onchange=update;

async function api(path,{method='GET',body,token,signal}={}){
 const response=await fetch(API+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal});
 let data;try{data=await response.json();}catch{throw Error('Сервис временно недоступен. Попробуйте позже.');}
 if(!response.ok){const error=new Error(data.error?.message||'Ошибка сервиса');error.status=response.status;throw error;}
 return data;
}
async function loginTelegram(){
 if(telegramLogin)return telegramLogin;
 telegramLogin=(async()=>{
  telegramContext=await getTelegramContext();if(!telegramContext)return;
  const identity=await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}});
  telegramIdentity=identity;publicSession=identity;
  if(identity.isAdmin){adminToken=identity.token;await showAdmin();}
  else{adminToken='';sessionStorage.removeItem('quorum-admin');$('settingsOpen').hidden=true;if($('settings').open)$('settings').close();}
 })();
 return telegramLogin;
}
async function ensureSession(){
 if(adminToken)return adminToken;
 if(publicSession?.token&&publicSession.expires>Date.now()+180000)return publicSession.token;
 if(telegramContext){publicSession=await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}});return publicSession.token;}
 publicSession=await api('/api/session',{method:'POST',body:{}});return publicSession.token;
}
async function refreshAccess(){
 const token=await ensureSession();access=await api('/api/access',{token});
 $('accessChip').hidden=false;$('accessChip').textContent=access.admin?'Администратор':'Бесплатно: '+access.remainingFreeTasks;
 $('accessInfo').textContent=access.admin?'Администратор: задания без лимита.':'Осталось бесплатных заданий: '+access.remainingFreeTasks+'.';
 update();
}
async function loadConfig(){
 try{
  await loginTelegram();const config=await api('/api/config');
  available=new Set(config.providers);connected=true;
  for(const id of Array.from(chosen))if(!available.has(id))chosen.delete(id);
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
  await refreshAccess();
  $('status').textContent=available.size>=2?'Опишите задачу, и несколько нейросетей подготовят результат.':'Пока доступно меньше двух моделей.';
 }catch(e){$('status').textContent=e.message||'Не удалось подключиться к сервису.';}update();
}
function showAdminAccounting(info){
 const box=$('adminAccounting');box.replaceChildren();
 const title=document.createElement('h3');title.textContent='Расходы на AI';box.append(title);
 const totals=info?.totals;
 if(!totals){box.append('Статистика пока недоступна.');return;}
 const p=document.createElement('p');p.className='hint';
 p.textContent='API-вызовов: '+totals.requests+' · токены входа/выхода: '+totals.inputTokens.toLocaleString('ru')+' / '+totals.outputTokens.toLocaleString('ru')+' · известные расходы: $'+totals.knownCostUsd.toFixed(5)+' · без тарифа: '+totals.unknownCostCalls;
 box.append(p);
 const table=document.createElement('div');table.className='admin-costs';
 for(const [key,value]of Object.entries(info.byModel||{})){
  const row=document.createElement('p');
  row.textContent=key+' · '+value.requests+' выз. · '+value.inputTokens+'/'+value.outputTokens+' ток. · '+(value.unknownCostCalls?'тариф не задан':'$'+value.knownCostUsd.toFixed(5));table.append(row);
 }
 if(!table.children.length)table.textContent='Пока нет запросов.';box.append(table);
 const details=document.createElement('details');details.className='accounting-details';
 const summary=document.createElement('summary');summary.textContent='Последние обращения к моделям';details.append(summary);
 const recent=document.createElement('div');recent.className='admin-costs';
 for(const call of info.recent||[]){
  const line=document.createElement('p');
  const price=call.costUsd===null?'стоимость неизвестна':'~$'+Number(call.costUsd).toFixed(6);
  line.textContent=[call.at,call.provider+' / '+call.model,call.input+' вход / '+call.output+' выход',
   call.cached?'кеш '+call.cached:'',call.reasoning?'рассуждения '+call.reasoning:'',price].filter(Boolean).join(' · ');
  recent.append(line);
 }
 if(!recent.children.length)recent.textContent='Пока нет обращений.';
 details.append(recent);box.append(details);
}
async function showAdmin(){
 const config=await api('/api/admin',{token:adminToken});
 $('adminLogin').hidden=true;$('adminPanel').hidden=false;$('settingsOpen').hidden=false;$('demoControls').hidden=false;
 $('adminProviders').replaceChildren(...config.providers.map(p=>{const row=document.createElement('p');row.textContent=(agents.find(a=>a.id===p.id)?.name||p.id)+': '+(p.configured?'подключён · '+p.model:'не подключён');return row;}));
 $('adminUsage').textContent='Запросов сегодня: '+config.usage.requestsToday+' / '+config.usage.dailyLimit+'. Лимит на посетителя: '+config.usage.perIpDailyLimit+'.';
 showAdminAccounting(config.accounting);$('adminStatus').textContent='';
}
$('settingsOpen').onclick=async()=>{$('settings').showModal();try{await showAdmin();}catch(e){$('adminStatus').textContent=e.message;}};
$('adminForm').onsubmit=async e=>{e.preventDefault();adminToken=$('adminCode').value.trim();$('adminStatus').textContent='Проверяем доступ…';
 try{await showAdmin();sessionStorage.setItem('quorum-admin',adminToken);$('adminCode').value='';await refreshAccess();}
 catch(e){adminToken='';$('adminStatus').textContent=e.message;}
};
$('adminLogout').onclick=()=>{
 api('/api/logout',{method:'POST',token:adminToken}).catch(()=>{});
 telegramIdentity=null;publicSession=null;adminToken='';access=null;sessionStorage.removeItem('quorum-admin');
 $('adminPanel').hidden=true;$('adminLogin').hidden=false;$('settingsOpen').hidden=true;$('demoControls').hidden=true;
 $('settings').close();history.replaceState(null,'',location.pathname);refreshAccess().catch(()=>{});
};
if(new URLSearchParams(location.search).has('admin'))$('settings').showModal();
if(adminToken)showAdmin().catch(()=>{adminToken='';sessionStorage.removeItem('quorum-admin');refreshAccess().catch(()=>{});});
$('demo').onchange=()=>{if(!$('demo').checked){for(const id of Array.from(chosen))if(!available.has(id))chosen.delete(id);document.querySelectorAll('.agent input').forEach((input,i)=>input.checked=chosen.has(agents[i].id));}update();};
loadConfig();
$('task').oninput=()=>$('chars').textContent=$('task').value.length.toLocaleString('ru')+' / 20 000';
$('example').onclick=()=>{
 if($('task').value.trim()&&!window.confirm('Заменить ваш текст выбранным примером задания?'))return;
 $('task').value=getTaskExample(profileId,taskId);
 $('task').oninput();
};

function renderProgress(){
 if(!events.length){$('progress').hidden=true;return;}
 $('progress').hidden=false;
 const names=[...new Set(events.map(e=>e.stage))];
 $('progress').replaceChildren(...names.map(name=>{
  const row=document.createElement('div');row.className='progress-item';
  const done=events.some(e=>e.stage===name&&e.status==='done');
  const marker=document.createElement('span');marker.className='progress-mark';marker.textContent=done?'✓':'·';
  const label=document.createElement('span');
  label.textContent=name==='Независимая идея'?'Нейросети готовят независимые варианты':name==='Итоговый проект'?'Подготовка готового материала':name==='Проверка согласия'?'Финальная проверка':name==='Готово'?'Результат готов':name.replace(/^Раунд /,'Обсуждение · раунд ');
  row.append(marker,label);if(done)row.classList.add('done');return row;
 }));
}
function progress(event){events.push(event);renderProgress();}
function renderMessage(m){
 const card=document.createElement('article');card.className='message'+(m.final?' final':'')+(m.error?' error':'');
 const head=document.createElement('div');head.className='message-head';
 const name=document.createElement('strong');name.textContent=m.final?'Готовый результат':m.name;
 const stage=document.createElement('small');stage.textContent=m.final?'Можно копировать и использовать':m.stage;
 head.append(name,stage);
 const p=document.createElement('p');p.textContent=m.text;card.append(head,p);return card;
}
function renderMessages(){
 const visible=$('showDiscussion').checked?messages:messages.filter(m=>m.final);
 if(!visible.length){$('feed').replaceChildren();return;}
 $('feed').replaceChildren(...visible.map(renderMessage));$('export').disabled=!messages.some(m=>m.final);
}
$('showDiscussion').onchange=renderMessages;
function emit(m){messages.push(m);renderMessages();}
async function request(a,chat,signal,stage={}){
 if($('demo').checked){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,400);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Остановлено','AbortError'));},{once:true});});
  const prompt=chat[1].content;
  if(prompt.includes('Допустимые идентификаторы:'))return JSON.stringify({vote:agents.find(x=>chosen.has(x.id)).id,reason:'Демонстрационный голос'});
  if(prompt.includes('"agree" или'))return '{"vote":"agree","reason":"Демонстрационное согласие"}';
  return '[ДЕМО — не ответ модели] '+a.name+': этот пример не вызывает API. Для настоящего результата отключите демо.';
 }
 const result=await api('/api/chat',{method:'POST',token:await ensureSession(),body:{provider:a.id,messages:chat,taskId:activeTask?.taskId,stage:stage.stage},signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
 if(typeof result.text!=='string'||!result.text.trim())throw Error('Модель вернула пустой ответ');
 return result.text;
}
$('start').onclick=async()=>{
 const task=$('task').value.trim();if(!task){$('status').textContent='Сначала опишите задачу.';return;}
 const members=agents.filter(a=>chosen.has(a.id));const moderator=members.find(a=>a.id===$('judge').value)||members[0];
 running=true;telegramContext?.app.enableClosingConfirmation?.();messages=[];events=[];controller=new AbortController();
 $('feed').replaceChildren();$('export').disabled=true;$('progress').hidden=true;
 $('stop').hidden=false;document.querySelectorAll('aside input,aside select,aside button,#task,#example,#settingsOpen,#demo,#rounds,#length,#showDiscussion').forEach(e=>e.disabled=true);
 update();$('status').textContent=$('demo').checked?'Демонстрация без API.':'Нейросети работают над вашей задачей.';
 try{
  if(!$('demo').checked){
   const token=await ensureSession();
   activeTask=await api('/api/task/start',{method:'POST',token,body:{participants:members.map(a=>a.id),rounds:Number($('rounds').value),mode}});
  }
  const {profile,task:subtask}=resolveProfile(profileId,taskId);
  await discuss({agents:members,judge:moderator,mode,rounds:Number($('rounds').value),words:Number($('length').value),task,professional:profile.name+'. '+profile.criteria,specialty:subtask?subtask[1]+'. '+subtask[2]:'Любая задача в указанном направлении.',request,emit,signal:controller.signal,onProgress:progress});
  $('status').textContent='Готово. Итог ниже; подробности обсуждения доступны по переключателю.';
  if(messages.some(m=>m.error))$('status').textContent+=' Часть ответов завершилась ошибкой.';
 }catch(e){
  $('status').textContent=e.name==='AbortError'?'Остановлено. Уже полученные результаты сохранены в текущей вкладке.':e.message;
 }finally{
  if(activeTask){
   try{await api('/api/task/finish',{method:'POST',token:await ensureSession(),body:{taskId:activeTask.taskId}});}catch{}
   activeTask=null;refreshAccess().catch(()=>{});
  }
  running=false;telegramContext?.app.disableClosingConfirmation?.();$('stop').hidden=true;
  document.querySelectorAll('aside input,aside select,aside button,#task,#example,#settingsOpen,#demo,#rounds,#length,#showDiscussion').forEach(e=>e.disabled=false);
  update();
 }
};
$('stop').onclick=()=>controller?.abort();
$('export').onclick=()=>{
 const result=messages.findLast(m=>m.final);if(!result)return;
 const {profile,task:subtask}=resolveProfile(profileId,taskId);
 const output='# Кворум — '+profile.name+(subtask?' / '+subtask[1]:'')+'\n\n## Задание\n'+$('task').value+'\n\n## Готовый результат\n'+result.text+
 ($('showDiscussion').checked?'\n\n## Обсуждение\n'+messages.filter(m=>!m.final).map(m=>'### '+m.name+' — '+m.stage+'\n'+m.text).join('\n\n'):'');
 const url=URL.createObjectURL(new Blob([output],{type:'text/markdown;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='quorum-result.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
update();
