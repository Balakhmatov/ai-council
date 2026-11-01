import {modes,discuss,parseBallotDetail} from './engine.js';
import {profiles,resolveProfile} from './profiles.js';
import {getTaskHint} from './examples.js?v=purpose8';
import {getTelegramContext} from './telegram-bridge.js';
import {loadRememberedSession,rememberSession,forgetSession} from './auth-state.js';
import {formatTranscript} from './transcript.js';
import {renderMarkdown} from './markdown-render.js';
import {wordsForPreset,limitIntermediate} from './response-length.js';
import {MODEL_PRIORITY,defaultParticipants,chooseModerator} from './model-priority.js';
import {needsSources} from './fact-check.js';

const $=id=>document.getElementById(id);
const agentDetails={
 claude:{name:'Claude',sub:'Аргументы и редактура'},
 openai:{name:'OpenAI',sub:'Логика и структура'},
 mistral:{name:'Mistral',sub:'Ясность и точность'},
 gemini:{name:'Gemini',sub:'Широта контекста'},
 qwen:{name:'Qwen',sub:'Детали и анализ'},
 deepseek:{name:'DeepSeek',sub:'Глубина рассуждений'},
 grok:{name:'Grok',sub:'Нестандартный взгляд'}
};
const agents=MODEL_PRIORITY.map(id=>({id,...agentDetails[id]}));
const API=location.hostname.endsWith('github.io')?'https://cityai.site/quorum':new URL('./',location.href).pathname.replace(/\/$/,'');
let telegramContext=null,telegramIdentity=null;
let adminToken=sessionStorage.getItem('quorum-admin')||'',publicSession=null,available=new Set(),connected=false,access=null;
let mode='consensus',profileId='smm',taskId='',controller=null,messages=[],events=[],running=false,activeTask=null,stopRequested=false,lastTaskContext=null;
let priceCatalog=null,historyOffset=0,historyTotal=0,historyBusy=false,historyVersion=0,historySearchTimer=null;
const chosen=new Set(MODEL_PRIORITY.slice(0,3));
let moderatorChosenByUser=false;

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
let modelLimitTooltipTimer=null;
function showModelLimitTooltip(label){
 document.querySelector('.model-limit-tooltip')?.remove();
 clearTimeout(modelLimitTooltipTimer);
 const tip=document.createElement('span');
 tip.className='model-limit-tooltip';tip.setAttribute('role','tooltip');
 tip.textContent='Использование всех моделей одновременно доступно по подписке.';
 label.append(tip);
 modelLimitTooltipTimer=setTimeout(()=>tip.remove(),4500);
}
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
   if(cap===3)showModelLimitTooltip(label);
   else $('status').textContent='Выбрано максимальное число моделей.';
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
 const premium=!!(access?.admin||access?.subscriptionActive);
 const detailed=$('length').querySelector('option[value="detailed"]');
 detailed.disabled=!premium;
 $('lengthNote').textContent=premium?'Финальный результат не ограничивается длиной обсуждения.':'«Подробно» доступно по подписке.';
 if(!premium&&$('length').value==='detailed')$('length').value='medium';
 const old=$('judge').value;
 if(moderatorChosenByUser&&!chosen.has(old))moderatorChosenByUser=false;
 $('count').textContent=chosen.size+' / '+(access?.maxModels??3);
 $('judge').replaceChildren(...agents.filter(a=>chosen.has(a.id)).map(a=>new Option(a.name,a.id)));
 const preferred=chooseModerator(chosen,old,{manual:moderatorChosenByUser});
 if(preferred)$('judge').value=preferred;
 document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.id===mode));
 const judgeName=agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель';
 $('budget').textContent=chosen.size+' модели · '+$('rounds').value+' раунда · '+chosen.size+' токенов · итог подготовит '+judgeName;
 const mq=$('mobileQuorumText');
 if(mq) mq.textContent=chosen.size+' модели · '+$('rounds').value+' раунда · '+chosen.size+' токенов · итог '+judgeName;
 const enough=access?.admin||access?.remainingFreeTasks>=chosen.size;
 $('start').textContent=access?'Получить результат':'Войти и начать';
 $('start').disabled=running||chosen.size<2||chosen.size>(access?.maxModels??3)||(!connected&&!$('demo').checked)||(!!access&&!enough&&!$('demo').checked);
 document.querySelectorAll('.agent').forEach((label,i)=>{
  const a=agents[i],ok=$('demo').checked||available.has(a.id),input=label.querySelector('input');
  input.disabled=running||!ok;label.classList.toggle('unavailable',!ok);
  label.querySelector('small').textContent=ok?a.sub:'Скоро';
 });
 document.querySelectorAll('.profile-option,.task-option,.mode').forEach(b=>b.disabled=running);
}
$('rounds').onchange=update;$('length').onchange=update;
$('judge').onchange=()=>{moderatorChosenByUser=true;update();};

$('agentsToggle')?.addEventListener('click',()=>{
  const body=$('agentsPanel');
  const btn=$('agentsToggle');
  if(!body||!btn)return;
  if(window.matchMedia('(min-width:881px)').matches)return;
  const open=body.classList.toggle('is-open');
  btn.setAttribute('aria-expanded',String(open));
});
window.matchMedia('(max-width:880px)').addEventListener('change',()=>{
  const body=$('agentsPanel');
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
  $('agentsPanel')?.classList.add('is-open');
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
 // Never carry a previous account's token into a different authenticated identity.
 const previous=publicSession;
 const sameUser=previous?.user&&identity?.user&&(
  (previous.user.email&&previous.user.email===identity.user.email)||
  (previous.user.id&&previous.user.id===identity.user.id));
 publicSession={...identity,...(!Object.hasOwn(identity,'token')&&sameUser&&previous.token?{token:previous.token}:{})};
 adminToken=identity.isAdmin?(publicSession.token||''):'';
 telegramIdentity=identity.isAdmin?publicSession:null;
 sessionStorage.removeItem('quorum-admin');
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
 $('emailPasswordLogin').hidden=false;$('emailRecovery').hidden=true;$('emailPasswordSetup').hidden=true;$('emailVerify').hidden=true;
}
$('loginOpen').onclick=async()=>{
 showLoginMethods();if(!$('emailDialog').open)$('emailDialog').showModal();
 try{const config=await api('/api/email/config');$('emailOpen').disabled=!config.passwordLogin&&!config.enabled;$('emailRecoveryOpen').disabled=!config.enabled;}
 catch(error){$('emailStatus').textContent=error.message;}
};
$('authBack').onclick=showLoginMethods;
$('emailDialog').addEventListener('close',stopLoginPolling);
$('emailOpen').onclick=()=>{
 $('authMethods').hidden=true;$('emailFlow').hidden=false;$('authBack').hidden=false;$('emailStatus').textContent='';$('emailPasswordLogin').hidden=false;$('emailRecovery').hidden=true;$('emailPasswordSetup').hidden=true;$('loginPasswordEmail').focus();
};
$('passwordSettings').onclick=()=>{
 showLoginMethods();
 $('authMethods').hidden=true;$('emailFlow').hidden=false;$('authBack').hidden=false;
 $('emailPasswordLogin').hidden=true;$('emailRecovery').hidden=false;$('emailPasswordSetup').hidden=true;
 $('emailAddress').value=publicSession?.user?.email||'';
 $('emailStatus').textContent='Подтвердите email один раз, чтобы установить или заменить пароль.';
 if(!$('emailDialog').open)$('emailDialog').showModal();
};
$('emailRecoveryOpen').onclick=()=>{
 $('emailPasswordLogin').hidden=true;$('emailRecovery').hidden=false;$('emailPasswordSetup').hidden=true;
 $('emailAddress').value=$('loginPasswordEmail').value.trim();
 $('emailStatus').textContent='';$('emailAddress').focus();
};
$('emailPasswordLogin').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{
  const email=$('loginPasswordEmail').value.trim();
  const pass=$('loginPassword').value;
  saveIdentity(await api('/api/email/password/login',{method:'POST',body:{email,password:pass}}));
  $('loginPassword').value='';$('emailDialog').close();
  await refreshAccess();$('status').textContent='Вы вошли. Дальше вход будет автоматическим на этом устройстве.';
 }catch(error){$('emailStatus').textContent=error.message;}
 finally{button.disabled=false;}
};
$('emailPasswordSetup').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;
 const pass=$('emailNewPassword').value;
 if(pass!==$('emailRepeatPassword').value){$('emailStatus').textContent='Пароли не совпадают.';return;}
 button.disabled=true;
 try{
  await api('/api/email/password/set',{method:'POST',token:await ensureSession(),body:{password:pass}});
  $('emailNewPassword').value='';$('emailRepeatPassword').value='';$('emailCode').value='';
  $('emailDialog').close();await refreshAccess();$('status').textContent='Пароль сохранён. Вход на этом устройстве будет автоматическим.';
 }catch(error){$('emailStatus').textContent=error.message;}
 finally{button.disabled=false;}
};
$('emailRequest').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{loginEmail=$('emailAddress').value.trim();await api('/api/email/request',{method:'POST',body:{email:loginEmail}});$('emailVerify').hidden=false;$('emailStatus').textContent='Код отправлен. Подтвердите адрес — вход сохранится на этом устройстве.';$('emailCode').focus();}
 catch(error){$('emailStatus').textContent=error.message;}finally{button.disabled=false;}
};
$('emailVerify').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{
  saveIdentity(await api('/api/email/verify',{method:'POST',body:{email:loginEmail,code:$('emailCode').value.trim()}}));
  $('emailRecovery').hidden=true;$('emailPasswordLogin').hidden=true;$('emailPasswordSetup').hidden=false;
  $('emailStatus').textContent='Email подтверждён. Сохраните постоянный пароль.';
  $('emailNewPassword').focus();
 }
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
 if(publicSession?.expires>Date.now())return publicSession.token||null;
 if(adminToken)return adminToken;
 if(telegramContext){saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));return publicSession.token||null;}
 return null;
}
function showSignedOut(){
 access=null;$('accessChip').hidden=true;$('loginOpen').hidden=false;$('emailLogout').hidden=true;$('accountName').hidden=true;$('passwordSettings').hidden=true;
 $('settingsOpen').hidden=true;$('demoControls').hidden=true;
 $('accessInfo').textContent='Войдите через Telegram или email: 10 бесплатных токенов при регистрации.';
 $('historySection').hidden=true;$('historyList').replaceChildren();historyOffset=0;historyTotal=0;
 $('accountCodeDetails').hidden=true;
 $('status').textContent='Для запуска обсуждения войдите в аккаунт.';update();
}
async function refreshAccess(){
 const token=await ensureSession();if(!token&&!publicSession){showSignedOut();return;}
 // Revalidate the owner's role against the live server, not a stale browser snapshot.
 // A session cookie also works after the page reloads (the bearer token is not persisted).
 if(publicSession){
  try{
   let identity;
   try{identity=await api('/api/auth/session',{token:publicSession.token});}
   catch(error){
    if(error.status!==401||!publicSession.token)throw error;
    identity={...await api('/api/auth/session'),token:null}; // Drop stale bearer and rely on the valid cookie.
   }
   saveIdentity(identity);
  }catch(error){if(error.status!==401)throw error;}
 }
 try{access=await api('/api/access',{token:await ensureSession()});}catch(error){
  if(error.status!==401){access=null;$('accessChip').hidden=false;$('accessChip').textContent='Доступ не проверен';$('accessInfo').textContent='Не удалось проверить остаток токенов. '+error.message;update();throw error;}
  clearIdentity();showSignedOut();return;
 }
 $('loginOpen').hidden=true;$('emailLogout').hidden=false;$('accountName').hidden=false;
 $('passwordSettings').hidden=!publicSession?.user?.email;
 $('accountName').textContent=publicSession?.user?.email||publicSession?.user?.firstName||'Аккаунт';
 $('settingsOpen').hidden=!access.admin;
 $('demoControls').hidden=!access.admin;
 const cap=access.maxModels??3;
 if(chosen.size>cap){
  for(const id of Array.from(chosen).slice(cap))chosen.delete(id);
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
 }
 renderAccess();refreshHistory(true).catch(()=>{});if(new URLSearchParams(location.search).has('payment'))checkPayment().catch(()=>{});
}
function taskCount(value){
 const n=Math.abs(Number(value)||0),lastTwo=n%100,last=n%10;
 return lastTwo>=11&&lastTwo<=14?'токенов':last===1?'токен':last>=2&&last<=4?'токена':'токенов';
}
function renderAccess(){
 if(!access)return;
 $('accessChip').hidden=false;
 $('accessChip').textContent=access.admin?'Администратор':access.subscriptionActive?'Подписка: '+access.subscriptionRemaining+' '+taskCount(access.subscriptionRemaining):'Доступно: '+access.remainingFreeTasks+' '+taskCount(access.remainingFreeTasks);
 const plan=access.subscriptionActive;
 $('accessInfo').textContent=access.admin?'Администратор: задачи без ограничений.':
  plan?'Подписка: '+access.subscriptionRemaining+' '+taskCount(access.subscriptionRemaining)+' из 300 токенов, все подключённые модели, история без ограничений. До '+new Date(access.subscriptionExpiresAt).toLocaleDateString('ru-RU')+'. Дополнительные задачи: '+access.purchasedTasks+'.':
  'Бесплатно: '+access.freeRemaining+' '+taskCount(access.freeRemaining)+' из '+access.freeStartingTasks+' '+taskCount(access.freeStartingTasks)+' при регистрации. Купленные токены: '+access.purchasedTasks+'. Доступно до 3 моделей, новые задачи не сохраняются.';
 $('accountCodeDetails').hidden=!access.accountRef;
 $('accountCode').textContent=access.accountRef||'';
 renderPricing();
 update();
}
$('copyAccountCode').onclick=async()=>{
 try{await navigator.clipboard.writeText($('accountCode').textContent);$('status').textContent='Код аккаунта скопирован.';}
 catch{$('status').textContent='Выделите и скопируйте код аккаунта вручную.';}
};
$('pricingOpen').onclick=()=>{if(!$('pricingDialog').open)$('pricingDialog').showModal();};
$('pricingClose').onclick=()=>$('pricingDialog').close();
async function checkPayment(){
 const status=$('pricingPaymentStatus');
 if(!access?.paidPlansAvailable){status.textContent='Оплата СБП пока не настроена.';return;}
 try{
  status.textContent='Проверяем платёж…';
  const result=await api('/api/payments',{token:await ensureSession()});
  const latest=result.orders?.[0];
  if(latest?.status==='succeeded'&&latest.applied)status.textContent='Оплата подтверждена, токены начислены.';
  else if(latest?.status==='pending')status.textContent='Ожидаем оплату через СБП. После платежа нажмите «Проверить оплату».';
  else if(latest?.status==='canceled')status.textContent='Платёж отменён. Можно попробовать снова.';
  else status.textContent='Платёж не найден.';
  if(result.access){access=result.access;renderAccess();}
 }catch(error){status.textContent=error.message;}
}
$('pricingRefreshPayment').onclick=checkPayment;
async function purchase(sku){
 const status=$('pricingPaymentStatus');
 if(!access){status.textContent='Сначала войдите через Telegram или email.';return;}
 if(!$('pricingAgree').checked){status.textContent='Примите условия использования перед оплатой.';return;}
 if(!access.paidPlansAvailable){status.textContent='СБП пока не настроена. Повторите позже.';return;}
 try{
  status.textContent='Открываем безопасную оплату СБП…';
  const result=await api('/api/payments',{method:'POST',token:await ensureSession(),body:{sku,acceptedTerms:true}});
  if(result.applied){status.textContent='Оплата подтверждена, токены начислены.';await refreshAccess();return;}
  if(!result.paymentUrl){status.textContent='Платёж создан. Нажмите «Проверить оплату».';return;}
  // Navigation is an explicit user action; return URL brings the payer back to Quorum.
  window.location.assign(result.paymentUrl);
 }catch(error){status.textContent=error.message;}
}
function renderPricing(){
 const offers=priceCatalog||access?.catalog;
 if(!offers)return; // Keep the four static price cards readable offline.
 const target=$('pricingOffers');target.replaceChildren();
 $('pricingRefreshPayment').hidden=!access?.paidPlansAvailable;
 $('pricingPaymentStatus').textContent=!access?'Войдите в аккаунт, чтобы оплатить тариф.':access.paidPlansAvailable?'Выберите тариф, примите условия и оплатите через СБП.':'Оплата СБП пока не настроена.';
 const sub=offers.subscription;
 if(sub){
  const card=node('article',null,'pricing-offer pricing-offer-sub');
  const top=node('div',null,'pricing-offer-top');
  top.append(node('span',sub.label,'pricing-plan-title'),node('span','−'+sub.discount+'%','pricing-save'));
  const price=node('div',null,'pricing-value');
  price.append(document.createTextNode(sub.priceRub.toLocaleString('ru-RU')+' ₽ '),node('small','/ 30 дней'));
  const perks=node('div',null,'pricing-perks');
  perks.append(node('span',sub.tasks+' '+taskCount(sub.tasks)),node('span','До 7 моделей'),node('span','История без ограничений'));
  card.append(top,price,perks);const pay=node('button','Оплатить 1 200 ₽ через СБП','pricing-buy');pay.type='button';pay.disabled=!access?.paidPlansAvailable;pay.onclick=()=>purchase('subscription');card.append(pay);target.append(card);
 }
 const heading=node('div',null,'pricing-pack-heading');
 heading.append(node('span','Дополнительные токены'),node('small','Без подписки'));
 target.append(heading);
 for(const key of ['pack5','pack50','pack100']){
  const offer=offers[key];if(!offer)continue;
  const card=node('article',null,'pricing-offer pricing-offer-pack');
  card.append(node('span',offer.tasks+' '+taskCount(offer.tasks),'pricing-pack-title'),
    node('strong',offer.priceRub.toLocaleString('ru-RU')+' ₽','pricing-value'),
    node('small',(offer.discount?'−'+offer.discount+'% · ':'')+(offer.priceRub/offer.tasks).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽ за токен','pricing-unit'));
  const pay=node('button','Оплатить через СБП','pricing-buy');
  pay.type='button';pay.disabled=!access?.paidPlansAvailable;pay.onclick=()=>purchase(key);card.append(pay);
  target.append(card);
 }
}
async function refreshHistory(reset=false){
 if(!access)return;
 if(historyBusy&&!reset)return;
 const requestedVersion=reset?++historyVersion:historyVersion;
 const accountRef=access.accountRef;
 if(reset){historyOffset=0;$('historyList').replaceChildren();$('historyMore').hidden=true;}
 historyBusy=true;
 try{
  const offset=reset?0:historyOffset;
  const data=await api('/api/history?limit=20&offset='+offset,{token:await ensureSession()});
  if(requestedVersion!==historyVersion||!access||access.accountRef!==accountRef)return;
  historyTotal=data.total;
  for(const item of data.items){
   const btn=document.createElement('button');btn.type='button';btn.className='history-cluster';
   const title=document.createElement('strong');title.textContent=item.title;
   const info=document.createElement('small');info.textContent=new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.profile||'Задача')+(item.specialization?' / '+item.specialization:'');
   btn.append(title,info);btn.onclick=()=>openHistory(item.taskId);$('historyList').append(btn);
  }
  historyOffset=data.nextOffset??data.total;
  $('historyCount').textContent=data.total+' '+taskCount(data.total)+' найдено';
  $('historyMore').hidden=data.nextOffset==null;
  $('historySection').hidden=!access.historyEnabled&&data.total===0;
  if(!data.total){
   const empty=document.createElement('p');empty.className='hint';
   empty.textContent='Первое обсуждение появится здесь после завершения задачи.';
   $('historyList').append(empty);
  }
 }finally{if(requestedVersion===historyVersion)historyBusy=false;}
}
function highlightFound(text,term){
 const frag=document.createDocumentFragment(),value=String(text||''),index=value.toLocaleLowerCase('ru-RU').indexOf(term.toLocaleLowerCase('ru-RU'));
 if(index<0){frag.append(document.createTextNode(value));return frag;}
 frag.append(document.createTextNode(value.slice(0,index)));
 const match=document.createElement('mark');match.textContent=value.slice(index,index+term.length);frag.append(match);
 frag.append(document.createTextNode(value.slice(index+term.length)));return frag;
}
function closeHistorySuggestions(){
 const panel=$('historySuggest');panel.hidden=true;panel.replaceChildren();
 $('historySearch').setAttribute('aria-expanded','false');
}
async function suggestHistory(){
 const term=$('historySearch').value.trim(),seq=++historyVersion;
 if(term.length<3){closeHistorySuggestions();return;}
 const panel=$('historySuggest');panel.replaceChildren();panel.hidden=false;
 $('historySearch').setAttribute('aria-expanded','true');
 const waiting=document.createElement('p');waiting.className='history-suggest-state';waiting.textContent='Ищем в истории…';panel.append(waiting);
 try{
  const data=await api('/api/history?limit=7&offset=0&search='+encodeURIComponent(term),{token:await ensureSession()});
  if(seq!==historyVersion||$('historySearch').value.trim()!==term)return;
  panel.replaceChildren();
  if(!data.items.length){
   const empty=document.createElement('p');empty.className='history-suggest-state';empty.textContent='Совпадений нет';panel.append(empty);return;
  }
  for(const item of data.items){
   const button=document.createElement('button');button.type='button';button.className='history-suggestion';button.setAttribute('role','option');
   const heading=document.createElement('strong');heading.append(highlightFound(item.title,term));
   const snippet=document.createElement('small');snippet.className='history-suggest-snippet';snippet.append(highlightFound(item.excerpt||item.title,term));
   const meta=document.createElement('span');meta.className='history-suggest-meta';meta.textContent=item.matchLabel||'Найдено в задаче';
   button.append(heading,snippet,meta);
   button.onclick=()=>{closeHistorySuggestions();openHistory(item.taskId);};
   panel.append(button);
  }
  if(data.total>data.items.length){
   const foot=document.createElement('p');foot.className='history-suggest-state';
   foot.textContent='Показаны первые '+data.items.length+' из '+data.total+' совпадений. Уточните запрос.';
   panel.append(foot);
  }
 }catch(e){
  if(seq!==historyVersion)return;
  panel.replaceChildren();const info=document.createElement('p');info.className='history-suggest-state';
  info.textContent='Поиск временно недоступен. Попробуйте ещё раз.';panel.append(info);
 }
}
$('historySearch').addEventListener('input',()=>{
 clearTimeout(historySearchTimer);
 const term=$('historySearch').value.trim();
 if(term.length<3){++historyVersion;closeHistorySuggestions();return;}
 historySearchTimer=setTimeout(()=>suggestHistory(),190);
});
$('historySearch').addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeHistorySuggestions();return;}
 if(e.key==='ArrowDown'){
  const first=$('historySuggest').querySelector('button.history-suggestion');
  if(first){e.preventDefault();first.focus();}
 }
 if(e.key==='Enter'){
  const first=$('historySuggest').querySelector('button.history-suggestion');
  if(first){e.preventDefault();first.click();}
 }
});
document.addEventListener('pointerdown',e=>{
 if(!e.target.closest('.history-search-box'))closeHistorySuggestions();
});
async function openHistory(taskId){
 try{
  const item=await api('/api/history/'+encodeURIComponent(taskId),{token:await ensureSession()});
  const box=$('historyBody');box.replaceChildren();
  $('historyCopyAll').onclick=()=>copyText(formatTranscript(item),$('historyCopyAll'));
  const prompt=document.createElement('section');prompt.className='history-prompt';
  const heading=document.createElement('h3');heading.textContent=item.title;
  const meta=document.createElement('p');meta.className='hint';meta.textContent=new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.profile||'Задача');
  const text=document.createElement('div');text.className='history-prompt-text';text.append(renderMarkdown(item.prompt));
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
  if(publicSession||!adminToken){
   try{
    let identity;
    try{identity=await api('/api/auth/session',{token:publicSession?.token});}
    catch(error){
     if(error.status!==401||!publicSession?.token)throw error;
     identity={...await api('/api/auth/session'),token:null};
    }
    saveIdentity(identity);
   }catch(error){if(error.status!==401)throw error;clearIdentity();if(telegramContext)saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));}
  }
  available=new Set(config.providers);connected=true;priceCatalog=config.catalog;renderPricing();
  chosen.clear();
  for(const id of defaultParticipants(available))chosen.add(id);
  moderatorChosenByUser=false;
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
  await refreshAccess();if(access?.admin)await showAdmin();
  $('status').textContent=!access?'Для запуска обсуждения войдите через Telegram или email.':!access.admin&&access.remainingFreeTasks<chosen.size?'Недостаточно токенов для выбранных моделей.':available.size>=2?'Опишите задачу, и несколько нейросетей подготовят результат.':'Пока доступно меньше двух моделей.';
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
  node('span',call.status==='error'?'Ошибка '+(call.httpStatus||'')+(call.errorType?' · '+call.errorType:''):call.step||call.stage||'Ответ'),
  node('span',call.durationMs!=null?(call.durationMs/1000).toFixed(1)+' сек':'—')
 );
 const counts=node('div',null,'account-call-tokens');
 counts.append(node('span','Вход '+num(call.input)),node('span','Кеш '+num(call.cached)),
  node('span','Выход '+num(call.output)),node('span','Размышления '+num(call.reasoning)));
 if(call.cacheWrite5m||call.cacheWrite1h)counts.append(node('span','Запись кеша: 5 мин '+num(call.cacheWrite5m)+' / 1 ч '+num(call.cacheWrite1h)));
 item.append(head,meta,counts);
 if(call.status==='error'&&call.errorDetail)item.append(node('small','Причина: '+call.errorDetail));
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
 for(const [value,label]of [['','Все модели'],...agents.map(a=>[a.id,a.name])])filter.append(new Option(label,value));
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
 const exportChoices=node('div',null,'account-export-choices');
 const allLabel=node('label');const allExport=node('input');allExport.type='checkbox';allExport.checked=true;allLabel.append(allExport,document.createTextNode(' Вся история'));exportChoices.append(allLabel);
 const selectedTasks=new Set();
 const taskChoices=node('div',null,'account-task-choices');
 taskChoices.style.maxHeight='190px';taskChoices.style.overflowY='auto';
 for(const group of groups){
  if(!group.taskId)continue;
  const label=node('label');label.style.display='block';
  const checkbox=node('input');checkbox.type='checkbox';checkbox.value=group.taskId;
  checkbox.onchange=()=>{checkbox.checked?selectedTasks.add(group.taskId):selectedTasks.delete(group.taskId);if(selectedTasks.size)allExport.checked=false;};
  label.append(checkbox,document.createTextNode(' '+new Date(group.startedAt).toLocaleString('ru-RU')+' · '+group.participants.join(', ')+' · '+rub(group.costRub)));
  taskChoices.append(label);
 }
 allExport.onchange=()=>{if(allExport.checked){selectedTasks.clear();taskChoices.querySelectorAll('input').forEach(x=>x.checked=false);}};
 exportChoices.append(taskChoices);box.append(exportChoices);
 const exportButton=node('button','Скачать CSV','account-export');
 exportButton.type='button';exportButton.onclick=async()=>{
  if(!allExport.checked&&!selectedTasks.size){$('adminStatus').textContent='Выберите задачи для экспорта.';return;}
  exportButton.disabled=true;exportButton.textContent='Готовим CSV…';
  try{
   const keys=['at','provider','model','step','status','httpStatus','input','cached','cacheWrite5m','cacheWrite1h','output','reasoning','costRub','discussionAccumulatedRub','modelAccumulatedRub','durationMs','errorType','errorDetail','taskId','rateUsed','rateCurrency','rateDate','costSource'];
   const escape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
   const rows=[keys.join(';')];
   let next=0;
   for(let page=0;page<10000&&next!=null;page++){
    const result=await api('/api/admin/logs?limit=200&offset='+next,{token:adminToken});
    for(const call of result.calls){if(allExport.checked||selectedTasks.has(call.taskId))rows.push(keys.map(k=>escape(call[k])).join(';'));}
    next=result.nextOffset;
   }
   const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=allExport.checked?'quorum-all-api-requests.csv':'quorum-selected-tasks.csv';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){$('adminStatus').textContent='Не удалось выгрузить журнал: '+e.message;}
  finally{exportButton.disabled=false;exportButton.textContent='Скачать весь журнал CSV';}
 };
 box.append(exportButton);
}
$('adminGrantForm').onsubmit=async event=>{
 event.preventDefault();
 const submit=event.submitter;
 submit.disabled=true;$('adminGrantStatus').textContent='Начисляем доступ…';
 try{
  const ref=$('adminGrantAccount').value.trim();
  const sku=$('adminGrantSku').value;
  const result=await api('/api/admin/billing/grant',{method:'POST',token:adminToken,body:{accountRef:ref,sku}});
  $('adminGrantStatus').textContent='Начислено: '+result.access.plan+' · доступно: '+result.access.remainingFreeTasks+' '+taskCount(result.access.remainingFreeTasks)+'.';
  if(access?.accountRef===ref)await refreshAccess();
 }catch(e){$('adminGrantStatus').textContent='Не удалось начислить: '+e.message;}
 finally{submit.disabled=false;}
};
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
let lastRoleRefresh=0;
window.addEventListener('focus',()=>{
 if(!publicSession||running||Date.now()-lastRoleRefresh<15000)return;
 lastRoleRefresh=Date.now();
 refreshAccess().catch(()=>{});
});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible'||!publicSession||running||Date.now()-lastRoleRefresh<15000)return;
 lastRoleRefresh=Date.now();
 refreshAccess().catch(()=>{});
});
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
  label.textContent=name==='Первый раунд'||name==='Независимая идея'?'Первый раунд · независимые варианты':name==='Итоговый проект'?'Подготовка готового материала':name==='Проверка согласия'?'Финальная проверка':name==='Готово'?'Результат готов':name.replace(/^Раунд /,'Обсуждение · раунд ');
  row.append(marker,label);if(done)row.classList.add('done');return row;
 }));
}
function progress(event){events.push(event);renderProgress();}
const COPY_SVG='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';
function copyIcon(button){
 button.insertAdjacentHTML('afterbegin',COPY_SVG);
}
async function writeClipboard(text){
 if(navigator.clipboard?.writeText){
  try{await navigator.clipboard.writeText(text);return true;}catch{}
 }
 // Telegram WebView / older mobile Safari can deny navigator.clipboard.
 const el=document.createElement('textarea');
 el.value=text;el.setAttribute('readonly','');
 el.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
 document.body.append(el);
 const current=document.activeElement;
 el.focus();el.select();el.setSelectionRange(0,el.value.length);
 let copied=false;
 try{copied=document.execCommand('copy');}catch{}
 el.remove();
 if(current&&typeof current.focus==='function')current.focus({preventScroll:true});
 return copied;
}
async function copyText(text,button){
 if(!text)return;
 const old=button.title;
 try{
  if(!await writeClipboard(text))throw Error('Копирование недоступно');
  button.title='Скопировано';
  button.classList.add('copied');
  $('status').textContent='Текст скопирован.';
  setTimeout(()=>{button.title=old;button.classList.remove('copied');},1600);
 }catch{
  $('status').textContent='Не удалось скопировать. Выделите текст долгим нажатием.';
 }
}
function taskTranscript(){
 const details=lastTaskContext||{prompt:$('task').value};
 return formatTranscript({...details,messages});
}
$('copyAll').insertAdjacentHTML('afterbegin',COPY_SVG);
$('copyAll').onclick=()=>copyText(taskTranscript(),$('copyAll'));
$('historyCopyAll').insertAdjacentHTML('afterbegin',COPY_SVG);
function showResearch(research){
 const panel=$('researchPanel'),sources=$('researchSources'),widget=$('researchSearchWidget');
 sources.replaceChildren();widget.replaceChildren();panel.hidden=false;
 if(research.status!=='grounded'){
  $('researchState').textContent='Нет подтверждённых источников';
  sources.append(node('p','Не удалось проверить открытые источники. Числовые показатели моделей нельзя считать подтверждёнными.','research-warning'));
  return;
 }
 $('researchState').textContent='Найдены ссылки на '+(research.facts?.length||0)+' фрагментов';
 sources.append(node('p','Ссылки получены поиском Google. Проверяйте дату и соответствие конкретной компании.','research-warning'));
 for(const source of research.sources||[]){
  const a=node('a',source.title||source.url,'research-source');
  a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);
 }
 if(research.searchWidget){
  const frame=document.createElement('iframe');
  frame.className='research-search-frame';
  frame.sandbox='allow-popups allow-popups-to-escape-sandbox';
  frame.title='Поисковые предложения Google';
  frame.referrerPolicy='no-referrer';
  frame.srcdoc=research.searchWidget;
  widget.append(frame);
 }
}
async function verifyTaskSources(task,signal){
 if($('demo').checked)return {status:'unavailable',reason:'В демонстрации веб-поиск не выполняется',sources:[],facts:[]};
 const result=await api('/api/research',{method:'POST',token:await ensureSession(),
  body:{taskId:activeTask?.taskId,prompt:task.slice(0,1500)},signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
 return result.status==='grounded'?result:{...result,reason:'Проверка открытых источников сейчас недоступна'};
}
function readableStoredMessage(m){
 if(!['Проверка согласия','Голосование'].includes(m.stage))return m.text;
 if(!String(m.text||'').trim().startsWith('{')&&!String(m.text||'').trim().startsWith('```'))return m.text;
 const choices=m.stage==='Проверка согласия'?['agree','disagree']:agents.map(a=>a.id);
 const ballot=parseBallotDetail(m.text,choices);
 if(!ballot)return 'Модель не смогла дать корректную оценку.';
 const label=m.stage==='Проверка согласия'
  ?(ballot.vote==='agree'?'Согласна с итогом':'Не согласна с итогом')
  :'Выбрала: '+(agents.find(a=>a.id===ballot.vote)?.name||ballot.vote);
 return '**'+label+'**'+(ballot.reason?'\n\n'+ballot.reason:'');
}
function renderMessage(m){
 const type=agents.find(a=>a.name===m.name)?.id||(m.final?'final':'service');
 const card=document.createElement('article');card.className='message provider-'+type+(m.final?' final':'')+(m.error?' error':'');
 const head=document.createElement('div');head.className='message-head';
 const identity=document.createElement('span');identity.className='model-identity';
 const dot=document.createElement('span');dot.className='model-dot';dot.setAttribute('aria-hidden','true');
 const name=document.createElement('strong');name.textContent=m.final?'Готовый результат':m.name;
 identity.append(dot,name);
 const stage=document.createElement('small');stage.className='stage-pill';stage.textContent=m.final?'Итоговый ответ · '+(agents.find(a=>a.id===m.id)?.name||'модель'):m.stage==='Независимая идея'?'Первый раунд':m.stage;
 const text=readableStoredMessage(m);
 const copy=document.createElement('button');
 copy.type='button';copy.className='copy-action copy-single';
 copy.title='Скопировать ответ';copy.setAttribute('aria-label','Скопировать '+(m.final?'итоговый результат':'ответ '+m.name+' · '+m.stage));
 copyIcon(copy);
 copy.onclick=()=>copyText(text,copy);
 head.append(identity,stage,copy);
 const body=renderMarkdown(text);body.classList.add('message-text');
 card.append(head,body);return card;
}
function syncResultActions(){
 $('copyAll').disabled=messages.length===0;
 $('export').disabled=!messages.some(m=>m.final);
}
function renderMessages(){
 const visible=$('showDiscussion').checked?messages:messages.filter(m=>m.final);
 $('feed').replaceChildren(...visible.map(renderMessage));
 syncResultActions();
}
$('showDiscussion').onchange=renderMessages;
function emit(m){
 messages.push(m);
 // Append instead of rebuilding the entire feed: preserving iOS/Android touch selections
 // while further AI responses arrive.
 if($('showDiscussion').checked||m.final)$('feed').append(renderMessage(m));
 syncResultActions();
}
async function request(a,chat,signal,stage={}){
 if($('demo').checked){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,400);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Остановлено','AbortError'));},{once:true});});
  const prompt=chat[1].content;
  if(prompt.includes('Допустимые идентификаторы:'))return JSON.stringify({vote:agents.find(x=>chosen.has(x.id)).id,reason:'Демонстрационный голос'});
  if(prompt.includes('"agree" или'))return '{"vote":"agree","reason":"Демонстрационное согласие"}';
  return '[ДЕМО — не ответ модели] '+a.name+': этот пример не вызывает API. Для настоящего результата отключите демо.';
 }
 const result=await api('/api/chat',{method:'POST',token:await ensureSession(),body:{provider:a.id,messages:chat,taskId:activeTask?.taskId,stage:stage.stage,step:stage.step,maxWords:wordsForPreset($('length').value)},signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
 if(typeof result.text!=='string'||!result.text.trim())throw Error('Модель вернула пустой ответ');
 // JSON ballots are a control protocol, not a prose response. Never truncate them.
 return stage.stage==='final'||['Голосование','Проверка согласия'].includes(stage.step)
  ?result.text:limitIntermediate(result.text,wordsForPreset($('length').value));
}
$('start').onclick=async()=>{
 if(!access&&!$('demo').checked){$('loginOpen').click();return;}
 const task=$('task').value.trim();if(!task){$('status').textContent='Сначала опишите задачу.';return;}
 const members=agents.filter(a=>chosen.has(a.id));const moderator=members.find(a=>a.id===$('judge').value)||members[0];
 running=true;stopRequested=false;telegramContext?.app.enableClosingConfirmation?.();messages=[];events=[];controller=new AbortController();
 const {profile:currentProfile,task:currentSubtask}=resolveProfile(profileId,taskId);
 lastTaskContext={prompt:task,profile:currentProfile.name,specialization:currentSubtask?.[1]||''};
 $('feed').replaceChildren();syncResultActions();$('progress').hidden=true;$('researchPanel').hidden=true;$('researchSources').replaceChildren();$('researchSearchWidget').replaceChildren();
 $('stopAction').hidden=false;$('stop').disabled=false;$('stop').textContent='Остановить задачу';
 document.querySelectorAll('aside input,aside select,aside button,#task,#settingsOpen,#demo,#rounds,#length,#factCheck').forEach(e=>e.disabled=true);
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
  await discuss({agents:members,judge:moderator,mode,rounds:Number($('rounds').value),words:wordsForPreset($('length').value),task,professional:profile.name+'. '+profile.criteria,specialty:subtask?subtask[1]+'. '+subtask[2]:'Любая задача в указанном направлении.',request,emit,signal:controller.signal,onProgress:progress,
   researchProvider:$('factCheck').checked&&needsSources(task)&&!$('demo').checked?verifyTaskSources:null,onResearch:showResearch});
  $('status').textContent='Готово. Итог ниже; подробности обсуждения доступны по переключателю.';
  if(messages.some(m=>m.error))$('status').textContent+=' Часть ответов завершилась ошибкой.';
 }catch(e){
  if(e.status===402&&access){access={...access,remainingFreeTasks:0};renderAccess();}
  $('status').textContent=e.name==='AbortError'?'Задача остановлена. Квота не возвращается; полученные ответы можно скопировать.':e.message;
 }finally{
  if(activeTask){
   const {profile,task:subtask}=resolveProfile(profileId,taskId);
   const historyPayload={
    prompt:$('task').value,profile:profile.name,
    specialization:subtask?.[1]||'',messages:messages.map(({name,stage,text,final,error})=>({name,stage,text,final:!!final,error:!!error}))
   };
   try{const finished=await api('/api/task/finish',{method:'POST',token:await ensureSession(),body:{
     taskId:activeTask.taskId,cancelled:stopRequested,...(activeTask.historyEnabled?{history:historyPayload}:{})
    }});if(finished.refundedTokens>0)$('status').textContent+=' Возвращено '+finished.refundedTokens+' '+taskCount(finished.refundedTokens)+' за ошибки ИИ.';}catch(e){$('status').textContent+=' Не удалось завершить задачу: '+e.message;}
   activeTask=null;
  }
  if(!$('demo').checked)await refreshAccess().catch(()=>{});
  running=false;telegramContext?.app.disableClosingConfirmation?.();$('stopAction').hidden=true;
  document.querySelectorAll('aside input,aside select,aside button,#task,#example,#settingsOpen,#demo,#rounds,#length,#factCheck').forEach(e=>e.disabled=false);
  update();
 }
};
$('stop').onclick=()=>{
 if(!running||stopRequested)return;
 stopRequested=true;
 $('stop').disabled=true;$('stop').textContent='Останавливаем…';
 $('status').textContent='Останавливаем задачу. Квота не возвращается.';
 controller?.abort();
};
$('export').onclick=()=>{
 if(!messages.some(m=>m.final))return;
 const output=taskTranscript();
 const url=URL.createObjectURL(new Blob([output],{type:'text/markdown;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='quorum-result.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
update();

