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
let priceCatalog=null,historyOffset=0,historyTotal=0,historyBusy=false;
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
 const tasks=[['','Без уточнения'],...profile.tasks.map(t=>[t[0],t[1]])];
 $('subtasks').replaceChildren(...tasks.map(([id,label])=>{
  const b=document.createElement('button');b.type='button';b.className='task-option'+(id===''?' task-option-any':'');
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
 input.onchange=()=>{
  const cap=access?.maxModels??3;
  if(input.checked&&chosen.size>=cap){
   input.checked=false;
   $('status').textContent=cap===3?'Без подписки можно выбрать максимум 3 модели. Снимите одну или подключите подписку.':'Выбрано максимальное число моделей.';
   return;
  }
  input.checked?chosen.add(a.id):chosen.delete(a.id);update();
 };
 label.append(avatar,data,input);$('agents').append(label);
}
for(const [id,[title,description]] of Object.entries(modes)){
 const b=document.createElement('button');b.type='button';b.className='mode'+((id==='judge'||id==='roles')?' mode-secondary':'');b.dataset.id=id;
 const name=document.createElement('span');name.textContent=title;const small=document.createElement('small');small.textContent=description;
 b.append(name,small);b.onclick=()=>{mode=id;update();};$('modes').append(b);
}
function update(){
 const old=$('judge').value;
 $('count').textContent=chosen.size+' / '+(access?.maxModels??3);
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
 $('start').disabled=running||chosen.size<2||chosen.size>(access?.maxModels??3)||(!connected&&!$('demo').checked)||(!!access&&!enough&&!$('demo').checked);
 document.querySelectorAll('.agent').forEach((label,i)=>{
  const a=agents[i],ok=$('demo').checked||available.has(a.id),input=label.querySelector('input');
  input.disabled=running||!ok;label.classList.toggle('unavailable',!ok);
  label.querySelector('small').textContent=ok?a.sub:'Скоро';
 });
 document.querySelectorAll('.profile-option,.task-option,.mode').forEach(b=>b.disabled=running);
}
$('rounds').onchange=update;$('length').onchange=update;$('judge').onchange=update;

$('agentsToggle')?.addEventListener('click',()=>{
  const body=$('participantsBody');
  const btn=$('agentsToggle');
  if(!body||!btn)return;
  if(window.matchMedia('(min-width:881px)').matches)return;
  const open=body.classList.toggle('is-open');
  btn.setAttribute('aria-expanded',String(open));
});
window.matchMedia('(max-width:880px)').addEventListener('change',()=>{
  const body=$('participantsBody');
  const btn=$('agentsToggle');
  if(!body||!btn)return;
  if(window.matchMedia('(min-width:881px)').matches){
    body.classList.add('is-open');
    btn.setAttribute('aria-expanded','true');
  }else{
    body.classList.remove('is-open');
    btn.setAttribute('aria-expanded','false');
  }
});
if(window.matchMedia('(min-width:881px)').matches){
  $('participantsBody')?.classList.add('is-open');
  $('agentsToggle')?.setAttribute('aria-expanded','true');
}



async function api(path,{method='GET',body,token,signal}={}){
 const response=await fetch(API+path,{method,credentials:'include',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal});
 let data;try{data=await response.json();}catch{throw Error('Сервис временно недоступен. Попробуйте позже.');}
 if(!response.ok){const error=new Error(data.error?.message||'Ошибка сервиса');error.status=response.status;throw error;}
 return data;
}
async function loginTelegram(){
 telegramContext=await getTelegramContext();
}
try{publicSession=loadRememberedSession(localStorage);}catch{}
let loginEmail='',pendingLogin=null,pollTimer=null,polling=false;
function saveIdentity(identity){
 publicSession={...(publicSession||{}),...identity};
 if(identity.isAdmin){adminToken=publicSession.token||'';telegramIdentity=publicSession;}
 else{adminToken='';sessionStorage.removeItem('quorum-admin');}
 try{const remembered={...publicSession};if(!location.hostname.endsWith('github.io'))delete remembered.token;rememberSession(localStorage,remembered);}catch{}
}
function clearIdentity(){
 publicSession=null;adminToken='';telegramIdentity=null;
 sessionStorage.removeItem('quorum-admin');
 try{forgetSession(localStorage);}catch{}
}
function stopLoginPolling(){clearTimeout(pollTimer);pollTimer=null;pendingLogin=null;}
function showLoginMethods(){
 stopLoginPolling();$('authMethods').hidden=false;$('emailFlow').hidden=true;$('telegramFlow').hidden=true;$('authBack').hidden=true;$('emailStatus').textContent='';
}
$('loginOpen').onclick=async()=>{
 showLoginMethods();if(!$('emailDialog').open)$('emailDialog').showModal();
 try{const config=await api('/api/email/config');$('emailOpen').disabled=!config.enabled;if(!config.enabled)$('emailStatus').textContent='Вход по email пока недоступен. Выберите Telegram.';}
 catch(error){$('emailStatus').textContent=error.message;}
};
$('authBack').onclick=showLoginMethods;
$('emailDialog').addEventListener('close',stopLoginPolling);
$('emailOpen').onclick=()=>{
 $('authMethods').hidden=true;$('emailFlow').hidden=false;$('authBack').hidden=false;$('emailStatus').textContent='';$('emailAddress').focus();
};
$('emailRequest').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{loginEmail=$('emailAddress').value.trim();await api('/api/email/request',{method:'POST',body:{email:loginEmail}});$('emailVerify').hidden=false;$('emailStatus').textContent='Код отправлен. Подтвердите адрес — вход сохранится на этом устройстве.';$('emailCode').focus();}
 catch(error){$('emailStatus').textContent=error.message;}finally{button.disabled=false;}
};
$('emailVerify').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{saveIdentity(await api('/api/email/verify',{method:'POST',body:{email:loginEmail,code:$('emailCode').value.trim()}}));$('emailCode').value='';$('emailDialog').close();await refreshAccess();$('status').textContent='Вы вошли. Можно начать обсуждение.';}
 catch(error){$('emailStatus').textContent=error.message;}finally{button.disabled=false;}
};
async function pollTelegramLogin(){
 if(!pendingLogin||polling)return;
 if(pendingLogin.expires<=Date.now()){stopLoginPolling();$('emailStatus').textContent='Время подтверждения истекло. Начните вход заново.';return;}
 polling=true;
 try{
  const login=pendingLogin;
  const identity=await api('/api/telegram/login/poll',{method:'POST',body:{id:login.id,secret:login.secret}});
  if(pendingLogin!==login)return;
  if(!identity.pending){saveIdentity(identity);stopLoginPolling();$('emailDialog').close();await refreshAccess();if(identity.isAdmin)await showAdmin();$('status').textContent='Вы вошли через Telegram. Можно начать обсуждение.';return;}
 }catch(error){
  if(!pendingLogin)return;
  $('emailStatus').textContent=error.message;
  if(error.status===410){stopLoginPolling();return;}
 }finally{polling=false;}
 if(pendingLogin)pollTimer=setTimeout(pollTelegramLogin,2000);
}
$('telegramOpen').onclick=async()=>{
 const popup=telegramContext?null:window.open('about:blank','quorum-telegram-login');
 try{
  if(telegramContext){saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));$('emailDialog').close();await refreshAccess();return;}
  const login=await api('/api/telegram/login/start',{method:'POST',body:{}});
  stopLoginPolling();pendingLogin=login;
  $('authMethods').hidden=true;$('telegramFlow').hidden=false;$('authBack').hidden=false;
  $('telegramCode').textContent=login.code;$('telegramContinue').href=login.url;
  $('emailStatus').textContent='В Telegram нажмите «Запустить», затем подтвердите вход. Эту вкладку оставьте открытой.';
  if(popup)popup.location.href=login.url;
  pollTelegramLogin();
 }catch(error){if(popup)popup.close();$('emailStatus').textContent=error.message;}
};
window.addEventListener('focus',()=>{if(pendingLogin){clearTimeout(pollTimer);pollTelegramLogin();}});
$('emailLogout').onclick=async()=>{
 try{await api('/api/logout',{method:'POST',token:publicSession?.token,body:{}});clearIdentity();$('settingsOpen').hidden=true;$('adminPanel').hidden=true;$('adminLogin').hidden=false;$('demoControls').hidden=true;showSignedOut();}
 catch(error){$('status').textContent=error.message;}
};
async function ensureSession(){
 if(adminToken)return adminToken;
 if(publicSession?.expires>Date.now())return publicSession.token||null;
 if(telegramContext){saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));return publicSession.token;}
 return null;
}
function showSignedOut(){
 access=null;$('accessChip').hidden=true;$('loginOpen').hidden=false;$('emailLogout').hidden=true;$('accountName').hidden=true;
 $('accessInfo').textContent='Войдите через Telegram или email: 10 бесплатных заданий в месяц, до 3 моделей, без истории.';
 $('historySection').hidden=true;$('historyList').replaceChildren();historyOffset=0;historyTotal=0;
 $('status').textContent='Для запуска обсуждения войдите в аккаунт.';update();
}
async function refreshAccess(){
 const token=await ensureSession();if(!token&&!publicSession){showSignedOut();return;}
 try{access=await api('/api/access',{token});}catch(error){
  if(error.status!==401){access=null;$('accessChip').hidden=false;$('accessChip').textContent='Доступ не проверен';$('accessInfo').textContent='Не удалось проверить остаток заданий. '+error.message;update();throw error;}
  clearIdentity();showSignedOut();return;
 }
 $('loginOpen').hidden=true;$('emailLogout').hidden=false;$('accountName').hidden=false;
 $('accountName').textContent=publicSession?.user?.email||publicSession?.user?.firstName||'Аккаунт';
 const cap=access.maxModels??3;
 if(chosen.size>cap){
  for(const id of Array.from(chosen).slice(cap))chosen.delete(id);
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
 }
 renderAccess();refreshHistory(true).catch(()=>{});
}
function renderAccess(){
 if(!access)return;
 $('accessChip').hidden=false;
 $('accessChip').textContent=access.admin?'Администратор':access.subscriptionActive?'Подписка: '+access.subscriptionRemaining+' заданий':'Осталось '+access.remainingFreeTasks+' заданий';
 const plan=access.subscriptionActive;
 $('accessInfo').textContent=access.admin?'Администратор: задания без ограничений.':
  plan?'Подписка: '+access.subscriptionRemaining+' из 500 заданий, все подключённые модели, история без ограничений. До '+new Date(access.subscriptionExpiresAt).toLocaleDateString('ru-RU')+'. Дополнительные задания: '+access.purchasedTasks+'.':
  'Бесплатно: '+access.freeRemaining+' из '+access.freeStartingTasks+' заданий за месяц. Купленные задания: '+access.purchasedTasks+'. Доступно до 3 моделей, новые задания не сохраняются.';
 renderPricing();
 update();
}
function renderPricing(){
 const offers=priceCatalog||access?.catalog;
 if(!offers)return;
 const target=$('pricingOffers');target.replaceChildren();
 for(const key of ['subscription','pack10','pack50','pack100']){
  const o=offers[key];if(!o)continue;
  const item=document.createElement('div');item.className='pricing-offer';
  const label=document.createElement('span');label.textContent=o.label;
  const price=document.createElement('strong');price.textContent=o.priceRub+' ₽';
  const badge=document.createElement('small');badge.textContent=o.discount?'−'+o.discount+'%':'3 ₽ за задание';
  item.append(label,price,badge);target.append(item);
 }
}
async function refreshHistory(reset=false){
 if(!access)return;
 if(historyBusy&&!reset)return;
 const accountRef=access.accountRef;
 historyBusy=true;
 try{
  const offset=reset?0:historyOffset;
  const data=await api('/api/history?limit=20&offset='+offset,{token:await ensureSession()});
  if(!access||access.accountRef!==accountRef)return;
  if(reset){historyOffset=0;$('historyList').replaceChildren();}
  historyTotal=data.total;
  for(const item of data.items){
   const btn=document.createElement('button');btn.type='button';btn.className='history-cluster';
   const title=document.createElement('strong');title.textContent=item.title;
   const info=document.createElement('small');info.textContent=new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.profile||'Задание')+(item.specialization?' / '+item.specialization:'');
   btn.append(title,info);
   btn.onclick=()=>openHistory(item.taskId);
   $('historyList').append(btn);
  }
  historyOffset=data.nextOffset??data.total;
  $('historyCount').textContent=data.total+' сохранённых';
  $('historyMore').hidden=data.nextOffset==null;
  $('historySection').hidden=!access.historyEnabled&&data.total===0;
  if(!data.total&&access.historyEnabled&&!$('historyList').children.length){
   const empty=document.createElement('p');empty.className='hint';
   empty.textContent='Первое обсуждение появится здесь после завершения задания.';
   $('historyList').append(empty);
  }
 }finally{historyBusy=false;}
}
async function openHistory(taskId){
 try{
  const item=await api('/api/history/'+encodeURIComponent(taskId),{token:await ensureSession()});
  const box=$('historyBody');box.replaceChildren();
  const prompt=document.createElement('section');prompt.className='history-prompt';
  const heading=document.createElement('h3');heading.textContent=item.title;
  const meta=document.createElement('p');meta.className='hint';meta.textContent=new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.profile||'Задание');
  const text=document.createElement('p');text.textContent=item.prompt;
  prompt.append(heading,meta,text);box.append(prompt);
  for(const m of item.messages)box.append(renderMessage(m));
  $('historyDialog').showModal();
 }catch(e){$('status').textContent='Не удалось открыть историю: '+e.message;}
}
$('historyClose').onclick=()=>$('historyDialog').close();
$('historyMore').onclick=()=>refreshHistory().catch(e=>{$('status').textContent=e.message;});
async function loadConfig(){
 try{
  await loginTelegram();const config=await api('/api/config');
  if(!adminToken){
   try{saveIdentity(await api('/api/auth/session',{token:publicSession?.token}));}
   catch(error){if(error.status!==401)throw error;clearIdentity();if(telegramContext)saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));}
  }
  available=new Set(config.providers);connected=true;priceCatalog=config.catalog;renderPricing();
  for(const id of Array.from(chosen))if(!available.has(id))chosen.delete(id);
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
  await refreshAccess();if(access?.admin)await showAdmin();
  $('status').textContent=!access?'Для запуска обсуждения войдите через Telegram или email.':!access.admin&&access.remainingFreeTasks===0?'Бесплатные задания закончились.':available.size>=2?'Опишите задачу, и несколько нейросетей подготовят результат.':'Пока доступно меньше двух моделей.';
 }catch(e){$('status').textContent=e.message||'Не удалось подключиться к сервису.';}update();
}
let latestAccounting=null;
function rub(value,empty='—'){
 if(value==null||!Number.isFinite(Number(value)))return empty;
 const n=Number(value),fraction=n>0&&n<.01?6:n>0&&n<1?4:2;
 return n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:fraction})+' ₽';
}
function num(value){return Number(value||0).toLocaleString('ru-RU');}
function node(tag,text,cls){
 const el=document.createElement(tag);if(text!=null)el.textContent=String(text);if(cls)el.className=cls;return el;
}
function stat(label,value){
 const card=node('div',null,'account-stat');card.append(node('span',label),node('strong',value));return card;
}
function renderAuditCall(call){
 const item=node('div',null,'account-call'+(call.status==='error'?' is-error':''));
 const head=node('div',null,'account-call-head');
 const name=(agents.find(a=>a.id===call.provider)?.name||call.provider)+' · '+call.model;
 head.append(node('strong',name),node('b',rub(call.costRub)));
 const meta=node('div',null,'account-call-line');
 meta.append(
  node('span',new Date(call.at).toLocaleString('ru-RU')),
  node('span',call.status==='error'?'Ошибка '+(call.httpStatus||''):call.step||call.stage||'Ответ'),
  node('span',call.durationMs!=null?(call.durationMs/1000).toFixed(1)+' сек':'—')
 );
 const counts=node('div',null,'account-call-tokens');
 counts.append(node('span','Вход '+num(call.input)),node('span','Кеш '+num(call.cached)),
  node('span','Выход '+num(call.output)),node('span','Размышления '+num(call.reasoning)));
 if(call.cacheWrite5m||call.cacheWrite1h)counts.append(node('span','Запись кеша: 5 мин '+num(call.cacheWrite5m)+' / 1 ч '+num(call.cacheWrite1h)));
 item.append(head,meta,counts);
 if(call.costBreakdownRub){
  const b=call.costBreakdownRub;
  item.append(node('small','Цена: вход '+rub(b.input)+' + кеш '+rub(b.cached)+' + выход '+rub(b.output)+(b.cacheWrite5m?' + запись 5 мин '+rub(b.cacheWrite5m):'')+(b.cacheWrite1h?' + запись 1 ч '+rub(b.cacheWrite1h):'')+' = '+rub(call.costRub)));
 }
 if(call.discussionAccumulatedRub!=null){
  item.append(node('strong','Накоплено в обсуждении: '+rub(call.discussionAccumulatedRub),'account-call-cumulative'));
 }else if(call.modelAccumulatedRub!=null){
  item.append(node('small','Накоплено по модели: '+rub(call.modelAccumulatedRub)));
 }
 if(call.rateCurrency==='RUB')item.append(node('small','Рублёвый тариф DDTokens · оценка по журналу списаний'));
 else if(call.rateUsed)item.append(node('small','Курс при запросе: '+rub(call.rateUsed)+' / '+call.rateCurrency+(call.historicalRateEstimated?' (пересчитано)':'')));
 else if(call.historicalRateEstimated)item.append(node('small','Историческая оценка по текущему курсу'));
 else if(call.costRub==null)item.append(node('small','Стоимость неизвестна: отсутствуют токены или курс'));
 return item;
}
function renderAccounting(info){
 latestAccounting=info;
 const box=$('adminAccounting');box.replaceChildren();
 const title=node('h3','Расходы на модели');
 box.append(title);
 const fx=info.fx;
 const rateLine=node('div',null,'account-rate');
 const fxText=fx?
  'Курс ЦБ на '+(fx.rateDate||'последнюю дату')+': USD '+rub(fx.usdRub)+' · CNY '+rub(fx.cnyRub)+(fx.stale?' · данные устарели':''):
  'Курс ЦБ пока недоступен — новые расходы без курса не оцениваются.';
 rateLine.append(node('span',fxText));
 const updateRate=node('button','Обновить курс','quiet');
 updateRate.type='button';
 updateRate.onclick=async()=>{
  updateRate.disabled=true;updateRate.textContent='Обновляем…';
  try{
   const result=await api('/api/admin/exchange-rate',{method:'POST',token:adminToken,body:{}});
   renderAccounting(result.accounting);
  }catch(e){updateRate.disabled=false;updateRate.textContent='Обновить курс';$('adminStatus').textContent=e.message;}
 };
 rateLine.append(updateRate);box.append(rateLine);
 const totals=info.totals||{};
 const stats=node('div',null,'account-stats');
 const discussions=(info.discussions||[]).filter(x=>x.status==='done').length;
 stats.append(stat('Расходы API',rub(totals.costRub)),
  stat('API-вызовов',num(totals.requests)),stat('Завершено обсуждений',num(discussions)),
  stat('Без расчёта',num(totals.unknownCostCalls)));
 box.append(stats);
 if(info.legacyCurrencyNotice)box.append(node('p','Старые долларовые записи пересчитаны в рубли по текущему курсу приблизительно. Для новых вызовов курс сохраняется в логе.','hint'));
 const note=node('p','Все суммы приблизительные: тарифы провайдеров и курс ЦБ. Фактическое списание DDTokens может отличаться.','hint');
 box.append(note);
 box.append(node('h4','Прайс · за 1 млн токенов'));
 const prices=node('div',null,'account-price-list');
 for(const p of info.prices||[]){
  const row=node('div',null,'account-price-row');
  row.append(node('strong',(agents.find(a=>a.id===p.provider)?.name||p.provider)+' · '+p.model));
  const values=node('div',null,'account-price-values');
  values.append(node('span','Вход: '+rub(p.input)),
   node('span','Кеш: '+rub(p.cached,'тариф неизвестен')),node('span','Выход: '+rub(p.output)));
  if(p.cacheWrite5m!=null)values.append(node('span','Запись кеша 5 мин: '+rub(p.cacheWrite5m)),node('span','Запись кеша 1 ч: '+rub(p.cacheWrite1h)));
  row.append(values,node('small',p.source||''));prices.append(row);
 }
 box.append(prices);
 box.append(node('h4','Расходы по моделям'));
 const modelList=node('div',null,'account-model-list');
 for(const [id,data] of Object.entries(info.byModel||{})){
  const model=node('div',null,'account-model-row');
  model.append(node('strong',id));
  const modelRight=node('div',null,'account-model-right');
  modelRight.append(node('b',rub(data.costRub)),node('small',num(data.requests)+' выз. · '+num(data.inputTokens)+' вход / '+num(data.outputTokens)+' выход'+(data.unknownCostCalls?' · '+num(data.unknownCostCalls)+' без цены':'')));
  model.append(modelRight);modelList.append(model);
 }
 if(!modelList.children.length)modelList.append(node('p','Пока нет обращений.','hint'));
 box.append(modelList);
 const groups=info.discussions||[];
 box.append(node('h4','Обсуждения · стоимость целиком'));
 const groupList=node('div',null,'account-groups');
 for(const group of groups.slice(0,40)){
  const details=node('details',null,'account-group');
  const summary=node('summary');
  summary.append(node('strong',rub(group.costRub)),node('span',new Date(group.startedAt).toLocaleString('ru-RU')+' · '+group.participants.join(', ')+' · '+group.rounds+' раунда · '+({done:'готово',failed:'ошибка',running:'в работе',interrupted:'прервано'}[group.status]||group.status)+(group.unknownCostCalls?' · '+group.unknownCostCalls+' без цены':'')));
  details.append(summary);
  const content=node('div',null,'account-group-body');
  content.append(node('p',num(group.requests)+' выз. · '+num(group.inputTokens)+' вход / '+num(group.outputTokens)+' выход · '+num(group.cachedTokens)+' кеш · '+num(group.errors)+' ошибок'));
  for(const [key,vals]of Object.entries(group.byModel||{})){
   const line=node('div',null,'account-group-model');
   line.append(node('span',key),node('b',rub(vals.costRub)));
   content.append(line);
  }
  const requestBox=node('div',null,'account-group-requests');
  details.addEventListener('toggle',async()=>{
   if(!details.open||requestBox.dataset.loaded)return;
   requestBox.dataset.loaded='loading';
   requestBox.textContent='Загружаем запросы обсуждения…';
   try{
    const result=await api('/api/admin/logs?taskId='+encodeURIComponent(group.taskId)+'&limit=100',{token:adminToken});
    requestBox.replaceChildren(node('strong','Все вызовы этого обсуждения ('+num(result.total)+')'));
    for(const call of result.calls.slice().reverse())requestBox.append(renderAuditCall(call));
    if(!result.calls.length)requestBox.append(node('p','Нет сохранённых записей для этого обсуждения.','hint'));
    requestBox.dataset.loaded='yes';
   }catch(e){requestBox.dataset.loaded='';requestBox.textContent='Не удалось загрузить запросы: '+e.message;}
  });
  content.append(requestBox);details.append(content);groupList.append(details);
 }
 if(!groupList.children.length)groupList.append(node('p','Стоимость обсуждений начнёт группироваться после этого обновления.','hint'));
 box.append(groupList);
 const logTitle=node('div',null,'account-log-title');logTitle.append(node('h4','Все API-вызовы · цена каждого'));
 const filter=node('select',null,'account-filter');
 for(const [value,label]of [['','Все модели'],['openai','Luna'],['mistral','Mistral'],['grok','Grok'],['claude','Claude'],['gemini','Gemini']])filter.append(new Option(label,value));
 logTitle.append(filter);box.append(logTitle);
 const logCount=node('p','Загружаем журнал…','hint');
 box.append(logCount);
 const logList=node('div',null,'account-calls');box.append(logList);
 const more=node('button','Показать ещё 50 запросов','account-more');more.type='button';more.hidden=true;box.append(more);
 let offset=0,loading=false,version=0;
 const loadPage=async(reset=false)=>{
  if(loading&&!reset)return;
  const requestedVersion=reset?++version:version;
  if(reset){offset=0;logList.replaceChildren();more.hidden=true;}
  loading=true;more.disabled=true;
  try{
   const path='/api/admin/logs?limit=50&offset='+offset+'&provider='+encodeURIComponent(filter.value);
   const result=await api(path,{token:adminToken});
   if(requestedVersion!==version)return;
   offset=result.nextOffset??result.total;
   for(const call of result.calls)logList.append(renderAuditCall(call));
   logCount.textContent='Показано '+num(Math.min(offset,result.total))+' из '+num(result.total)+' запросов';
   if(!result.total)logList.append(node('p','По выбранной модели запросов пока нет.','hint'));
   more.hidden=result.nextOffset==null;
  }catch(e){if(requestedVersion===version)logCount.textContent='Ошибка загрузки журнала: '+e.message;}
  finally{if(requestedVersion===version){loading=false;more.disabled=false;}}
 };
 filter.onchange=()=>{loadPage(true);};
 more.onclick=()=>{loadPage();};
 loadPage(true);
 const exportButton=node('button','Скачать весь журнал CSV','account-export');
 exportButton.type='button';exportButton.onclick=async()=>{
  exportButton.disabled=true;exportButton.textContent='Готовим полный CSV…';
  try{
   const keys=['at','provider','model','step','status','httpStatus','input','cached','cacheWrite5m','cacheWrite1h','output','reasoning','costRub','discussionAccumulatedRub','modelAccumulatedRub','durationMs','taskId','rateUsed','rateCurrency','rateDate','costSource'];
   const escape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
   const rows=[keys.join(';')];
   let next=0;
   for(let page=0;page<10000&&next!=null;page++){
    const result=await api('/api/admin/logs?limit=200&offset='+next,{token:adminToken});
    for(const call of result.calls)rows.push(keys.map(k=>escape(call[k])).join(';'));
    next=result.nextOffset;
   }
   const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='quorum-all-api-requests.csv';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){$('adminStatus').textContent='Не удалось выгрузить журнал: '+e.message;}
  finally{exportButton.disabled=false;exportButton.textContent='Скачать весь журнал CSV';}
 };
 box.append(exportButton);
}
async function showAdmin(){
 const config=await api('/api/admin',{token:adminToken});
 $('adminLogin').hidden=true;$('adminPanel').hidden=false;$('settingsOpen').hidden=false;$('demoControls').hidden=false;
 $('adminProviders').replaceChildren(...config.providers.map(p=>{const row=document.createElement('p');row.textContent=(agents.find(a=>a.id===p.id)?.name||p.id)+': '+(p.configured?'подключён · '+p.model:'не подключён');return row;}));
 $('adminUsage').textContent='Запросов сегодня: '+config.usage.requestsToday+' / '+config.usage.dailyLimit+'. Лимит вызовов на аккаунт: '+config.usage.perAccountDailyLimit+'.';
 renderAccounting(config.accounting);$('adminStatus').textContent='';
}
$('settingsOpen').onclick=async()=>{$('settings').showModal();try{await showAdmin();}catch(e){$('adminStatus').textContent=e.message;}};
$('adminForm').onsubmit=async e=>{e.preventDefault();adminToken=$('adminCode').value.trim();$('adminStatus').textContent='Проверяем доступ…';
 try{await showAdmin();sessionStorage.setItem('quorum-admin',adminToken);$('adminCode').value='';await refreshAccess();}
 catch(e){adminToken='';$('adminStatus').textContent=e.message;}
};
$('adminLogout').onclick=()=>{
 api('/api/logout',{method:'POST',token:adminToken}).catch(()=>{});
 clearIdentity();access=null;
 $('adminPanel').hidden=true;$('adminLogin').hidden=false;$('settingsOpen').hidden=true;$('demoControls').hidden=true;
 $('settings').close();history.replaceState(null,'',location.pathname);refreshAccess().catch(()=>{});
};
if(new URLSearchParams(location.search).has('admin'))$('settings').showModal();

$('demo').onchange=()=>{if(!$('demo').checked){for(const id of Array.from(chosen))if(!available.has(id))chosen.delete(id);document.querySelectorAll('.agent input').forEach((input,i)=>input.checked=chosen.has(agents[i].id));}update();};
loadConfig();
$('task').oninput=()=>$('chars').textContent=$('task').value.length.toLocaleString('ru')+' / 20 000';

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
 const result=await api('/api/chat',{method:'POST',token:await ensureSession(),body:{provider:a.id,messages:chat,taskId:activeTask?.taskId,stage:stage.stage,step:stage.step},signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
 if(typeof result.text!=='string'||!result.text.trim())throw Error('Модель вернула пустой ответ');
 return result.text;
}
$('start').onclick=async()=>{
 if(!access&&!$('demo').checked){$('loginOpen').click();return;}
 const task=$('task').value.trim();if(!task){$('status').textContent='Сначала опишите задачу.';return;}
 const members=agents.filter(a=>chosen.has(a.id));const moderator=members.find(a=>a.id===$('judge').value)||members[0];
 running=true;telegramContext?.app.enableClosingConfirmation?.();messages=[];events=[];controller=new AbortController();
 $('feed').replaceChildren();$('export').disabled=true;$('progress').hidden=true;
 $('stop').hidden=false;document.querySelectorAll('aside input,aside select,aside button,#task,#settingsOpen,#demo,#rounds,#length,#showDiscussion').forEach(e=>e.disabled=true);
 update();$('status').textContent=$('demo').checked?'Демонстрация без API.':'Нейросети работают над вашей задачей.';
 try{
  if(!$('demo').checked){
   let token=await ensureSession();
   const startBody={participants:members.map(a=>a.id),rounds:Number($('rounds').value),mode};
   try{activeTask=await api('/api/task/start',{method:'POST',token,body:startBody});}
   catch(error){
    if(error.status!==401||adminToken)throw error;
    clearIdentity();
    if(!telegramContext){showSignedOut();throw Error('Войдите через Telegram или email заново.');}
    token=await ensureSession();
    activeTask=await api('/api/task/start',{method:'POST',token,body:startBody});
   }
   access={...access,remainingFreeTasks:activeTask.remainingFreeTasks};renderAccess();
  }
  const {profile,task:subtask}=resolveProfile(profileId,taskId);
  await discuss({agents:members,judge:moderator,mode,rounds:Number($('rounds').value),words:Number($('length').value),task,professional:profile.name+'. '+profile.criteria,specialty:subtask?subtask[1]+'. '+subtask[2]:'Любая задача в указанном направлении.',request,emit,signal:controller.signal,onProgress:progress});
  $('status').textContent='Готово. Итог ниже; подробности обсуждения доступны по переключателю.';
  if(messages.some(m=>m.error))$('status').textContent+=' Часть ответов завершилась ошибкой.';
 }catch(e){
  if(e.status===402&&access){access={...access,remainingFreeTasks:0};renderAccess();}
  $('status').textContent=e.name==='AbortError'?'Остановлено. Уже полученные результаты сохранены в текущей вкладке.':e.message;
 }finally{
  if(activeTask){
   const {profile,task:subtask}=resolveProfile(profileId,taskId);
   const historyPayload={
    prompt:$('task').value,profile:profile.name,
    specialization:subtask?.[1]||'',messages:messages.map(({name,stage,text,final,error})=>({name,stage,text,final:!!final,error:!!error}))
   };
   try{await api('/api/task/finish',{method:'POST',token:await ensureSession(),body:{
    taskId:activeTask.taskId,...(activeTask.historyEnabled?{history:historyPayload}:{})
   }});}catch(e){$('status').textContent+=' Не удалось сохранить задание: '+e.message;}
   activeTask=null;
  }
  if(!$('demo').checked)await refreshAccess().catch(()=>{});
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

