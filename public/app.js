import {modes,ambiences,discuss,parseBallotDetail} from './engine.js';
import {SHOW_SCENARIOS,showScenario,showCast,clipShowLine,runShow} from './show.js';
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
let experience='council',showScenarioId='diner',showAssigned={},mode='consensus',ambience='none',profileId='smm',taskId='',controller=null,messages=[],events=[],running=false,activeTask=null,stopRequested=false,lastTaskContext=null;
let priceCatalog=null,historyOffset=0,historyTotal=0,historyBusy=false,historyListVersion=0,historySearchVersion=0,historySearchTimer=null;
const chosen=new Set(MODEL_PRIORITY.slice(0,3));
let landingExploring=false;
const heroImage=$('landingHeroImage');
heroImage.addEventListener('error',()=>document.body.classList.add('landing-asset-missing'));
heroImage.addEventListener('load',()=>{
 if(heroImage.naturalWidth>0)document.body.classList.remove('landing-asset-missing');
});
if(heroImage.complete&&!heroImage.naturalWidth)document.body.classList.add('landing-asset-missing');

function syncLanding(){
 // The landing is the home page for everyone, even returning users and Telegram Mini App.
 // Only an explicit click to explore (or a deep link to admin/payment) opens the workspace.
 const url=new URLSearchParams(location.search);
 const openWorkspace=landingExploring||url.has('admin')||url.has('payment');
 document.body.classList.toggle('landing-visible',!openWorkspace);
}
$('landingTry').onclick=()=>{
 landingExploring=true;syncLanding();window.scrollTo({top:0,behavior:'instant'});
};
$('landingEmail').onclick=()=>{
 landingExploring=true;syncLanding();$('loginOpen').click();$('emailOpen').click();
};
let moderatorChosenByUser=false;
// First-party, random per-browser identifier. Persistent analytics stores only its HMAC.
let analyticsVisitorId;
try{
 analyticsVisitorId=localStorage.getItem('quorum-visitor-v1');
 if(!/^[a-f0-9-]{36}$/i.test(analyticsVisitorId||'')){
  analyticsVisitorId=crypto.randomUUID();
  localStorage.setItem('quorum-visitor-v1',analyticsVisitorId);
 }
}catch{analyticsVisitorId=crypto.randomUUID();}
function trackVisit(pageView=false){return api('/api/analytics/visit',{method:'POST',body:{visitorId:analyticsVisitorId,pageView},token:publicSession?.token}).catch(()=>{});}

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
 document.documentElement.dataset.profile=profileId;
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
 const b=document.createElement('button');b.type='button';b.className='mode'+((id==='judge'||id==='roles')?' mode-secondary':'')+(id==='roast'?' mode-roast':'');b.dataset.id=id;
 const name=document.createElement('span');name.textContent=title;const small=document.createElement('small');small.textContent=description;
 b.append(name,small);b.onclick=()=>{mode=id;if(mode==='roast')$('showDiscussion').checked=true;update();};$('modes').append(b);
}
for(const [id,scene] of Object.entries(ambiences))$('ambience').add(new Option(scene.label,id));
$('ambience').value=ambience;
$('ambience').onchange=()=>{ambience=$('ambience').value;if(ambience!=='none')$('showDiscussion').checked=true;update();};

function createShowCard(scene){
 const b=document.createElement('button');b.type='button';b.className='show-scenario show-palette-'+scene.palette;b.dataset.scenario=scene.id;
 b.setAttribute('aria-pressed',String(scene.id===showScenarioId));
 const poster=document.createElement('span');poster.className='show-poster';poster.setAttribute('aria-hidden','true');
 const glyph=document.createElement('span');glyph.className='show-poster-glyph';glyph.textContent=scene.emoji;poster.append(glyph);
 const body=document.createElement('span');body.className='show-scenario-body';
 const genre=document.createElement('small');genre.textContent=scene.genre;
 const title=document.createElement('strong');title.textContent=scene.title;
 const desc=document.createElement('span');desc.textContent=scene.description;
 body.append(genre,title,desc);b.append(poster,body);
 b.onclick=()=>{if(running)return;showScenarioId=scene.id;showAssigned={};randomShowCast();renderShowScenarios();renderShowCast();};
 return b;
}
function renderShowScenarios(){
 $('showScenarioCards').replaceChildren(...SHOW_SCENARIOS.map(createShowCard));
 const scene=showScenario(showScenarioId);
 const title=document.createElement('strong');title.textContent=scene.emoji+' '+scene.title;
 const text=document.createElement('p');text.textContent=scene.setting;
 const twist=document.createElement('small');twist.textContent='Поворот: '+scene.twist;
 $('showScenarioDetails').replaceChildren(title,text,twist);
}
function orderedChosen(){return agents.filter(a=>chosen.has(a.id)&&available.has(a.id));}
function ensureShowCast(){
 const scene=showScenario(showScenarioId),picked=orderedChosen().map(a=>a.id),used=new Set();
 const result={};
 for(const [slot,provider]of Object.entries(showAssigned)){
  if(picked.includes(provider)&&!used.has(provider)&&Number(slot)<scene.roles.length){
   result[slot]=provider;used.add(provider);
  }
 }
 for(const provider of picked){
  if(used.has(provider))continue;
  const slot=scene.roles.findIndex((role,i)=>!Object.hasOwn(result,i));
  if(slot>=0){result[slot]=provider;used.add(provider);}
 }
 showAssigned=result;
}
function randomShowCast(){
 const ids=orderedChosen().map(a=>a.id);
 const slots=showScenario(showScenarioId).roles.map((_,i)=>i);
 for(let i=slots.length-1;i>0;i--){
  const values=new Uint32Array(1);crypto.getRandomValues(values);
  const j=values[0]%(i+1);[slots[i],slots[j]]=[slots[j],slots[i]];
 }
 showAssigned=Object.fromEntries(ids.map((id,i)=>[slots[i],id]));
 $('showCastMode').textContent='Случайное распределение · можно изменить вручную';
}
function renderShowCast(){
 ensureShowCast();
 const scene=showScenario(showScenarioId),members=orderedChosen();
 $('showCastCount').textContent=members.length+' из '+scene.roles.length+' ролей';
 $('showCast').replaceChildren(...scene.roles.map(([name,description],index)=>{
  const card=document.createElement('div');card.className='show-role'+(showAssigned[index]?' show-role-active':'');
  const avatar=document.createElement('span');avatar.className='show-role-avatar';avatar.textContent=['♠','◆','✦','●','▲','★','✶'][index];
  const body=document.createElement('div');body.className='show-role-body';
  const strong=document.createElement('strong');strong.textContent=name;
  const desc=document.createElement('small');desc.textContent=description;
  body.append(strong,desc);
  const label=document.createElement('label');label.className='show-role-model';
  const title=document.createElement('span');title.textContent='Исполнитель';
  const select=document.createElement('select');select.dataset.slot=String(index);select.setAttribute('aria-label','Кто играет '+name);
  select.add(new Option('— Свободная роль —',''));
  for(const model of members)select.add(new Option(model.name,model.id));
  select.value=showAssigned[index]||'';
  select.disabled=running;
  select.onchange=()=>{
   const selected=select.value;
   if(selected){
    for(const [key,id] of Object.entries(showAssigned))if(id===selected)delete showAssigned[key];
    showAssigned[index]=selected;
   }else delete showAssigned[index];
   $('showCastMode').textContent='Ручной кастинг';
   renderShowCast();
  };
  label.append(title,select);card.append(avatar,body,label);
  return card;
 }));
 $('showRandomCast').disabled=running;
}
function setExperience(next){
 if(running)return;
 experience=next==='show'?'show':'council';
 document.body.dataset.experience=experience;
 $('councilPanel').hidden=experience==='show';
 $('showPanel').hidden=experience!=='show';
 $('experienceCouncil').classList.toggle('active',experience==='council');
 $('experienceShow').classList.toggle('active',experience==='show');
 for(const id of ['Council','Show'])$('experience'+id).setAttribute('aria-pressed',String(experience===id.toLowerCase()));
 if(experience==='show'){
  $('showDiscussion').checked=true;
  $('showDiscussion').parentElement.hidden=true;
  messages=[];lastTaskContext=null;syncResultActions();
  $('researchPanel').hidden=true;
  if(!Object.keys(showAssigned).length)randomShowCast();
  renderShowScenarios();
  renderShowCast();
  $('status').textContent='Выберите сцену и распределите персонажей по нейросетям.';
  $('feed').replaceChildren();
  $('feed').append(Object.assign(document.createElement('p'),{textContent:'🎬 Выберите сюжет и запустите шоу. Здесь появятся короткие реплики персонажей.',className:'show-empty'}));
 }else{
  $('showDiscussion').parentElement.hidden=false;
  messages=[];lastTaskContext=null;syncResultActions();
  $('status').textContent='Опишите задачу, и Кворум соберёт решение.';
  renderMessages();
 }
 $('experienceCouncil').disabled=running;
 $('experienceShow').disabled=running;
 update();
}
$('experienceCouncil').onclick=()=>setExperience('council');
$('experienceShow').onclick=()=>setExperience('show');
$('showRandomCast').onclick=()=>{randomShowCast();renderShowCast();};
renderShowScenarios();

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
 $('roastModeNote').hidden=mode!=='roast';
 $('ambienceHint').textContent=ambiences[ambience]?.description||ambiences.none.description;
 $('discussionChoiceLabel').textContent=mode==='roast'?'Показывать токсичную перепалку моделей':'Показывать обсуждение моделей';
 const judgeName=agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель';
 $('budget').textContent=experience==='show'?chosen.size+' модели · 2 короткие сцены · '+(chosen.size*2)+' API-реплик · '+chosen.size+' токенов':chosen.size+' модели · '+$('rounds').value+' раунда · '+chosen.size+' токенов · итог подготовит '+judgeName;
 const mq=$('mobileQuorumText');
 if(mq) mq.textContent=chosen.size+' модели · '+$('rounds').value+' раунда · '+chosen.size+' токенов · итог '+judgeName;
 const enough=access?.admin||access?.remainingFreeTasks>=chosen.size;
 $('start').textContent=access?(experience==='show'?'Запустить шоу':'Получить результат'):'Войти и начать';
 $('start').disabled=running||chosen.size<2||chosen.size>(access?.maxModels??3)||!connected||(!!access&&!enough);
 document.querySelectorAll('.agent').forEach((label,i)=>{
  const a=agents[i],ok=available.has(a.id),input=label.querySelector('input');
  input.disabled=running||!ok;label.classList.toggle('unavailable',!ok);
  label.querySelector('small').textContent=ok?a.sub:'Скоро';
 });
 document.querySelectorAll('.profile-option,.task-option,.mode').forEach(b=>b.disabled=running);
 $('ambience').disabled=running;
 if(experience==='show')renderShowCast();
 document.querySelectorAll('.show-scenario').forEach(b=>b.disabled=running);
 $('showExtra').disabled=running;
 for(const id of ['Council','Show'])$('experience'+id).disabled=running;
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
  btn.textContent=open?'Свернуть':'Выбрать ИИ';
});
window.matchMedia('(max-width:880px)').addEventListener('change',()=>{
  const body=$('agentsPanel');
  const btn=$('agentsToggle');
  if(!body||!btn)return;
  if(window.matchMedia('(min-width:881px)').matches){
    body.classList.add('is-open');
    btn.setAttribute('aria-expanded','true');btn.textContent='Свернуть';
  }else{
    body.classList.remove('is-open');
    btn.setAttribute('aria-expanded','false');btn.textContent='Выбрать ИИ';
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
 try{await api('/api/logout',{method:'POST',token:publicSession?.token,body:{}});clearIdentity();landingExploring=false;$('settingsOpen').hidden=true;$('adminPanel').hidden=true;$('adminLogin').hidden=false;showSignedOut();}
 catch(error){$('status').textContent=error.message;}
};
async function ensureSession(){
 if(publicSession?.expires>Date.now())return publicSession.token||null;
 if(adminToken)return adminToken;
 if(telegramContext){saveIdentity(await api('/api/telegram/auth',{method:'POST',body:{initData:telegramContext.initData}}));return publicSession.token||null;}
 return null;
}
function showSignedOut(){
 access=null;syncLanding();$('accessChip').hidden=true;$('loginOpen').hidden=false;$('emailLogout').hidden=true;$('accountName').hidden=true;$('passwordSettings').hidden=true;
 $('settingsOpen').hidden=true;
 $('accessInfo').textContent='Войдите через Telegram или email: 10 бесплатных токенов при регистрации.';
 $('historySection').hidden=true;$('historyJump').hidden=true;$('historyList').replaceChildren();historyOffset=0;historyTotal=0;
 $('historyLinkBox').hidden=true;$('historyLinkPanel').hidden=true;

 $('status').textContent='Для запуска обсуждения войдите в аккаунт.';update();
}
function historyLinkUi(linked){
 $('historyLinkBox').hidden=false;
 $('historyLinkToggle').textContent=linked?'✓ Истории Telegram и email связаны':'Связать историю Telegram и email';
 const emailAccount=!!publicSession?.user?.email,canLinkTelegram=emailAccount&&!!telegramContext;
 $('historyLinkEmailForm').hidden=linked||emailAccount;
 $('historyLinkTelegram').hidden=linked||!canLinkTelegram;
 $('historyLinkExplanation').textContent=linked
  ?'Сохранённые обсуждения доступны при обоих способах входа. Новые задачи сохраняются по условиям тарифа текущего аккаунта.'
  :emailAccount
   ?canLinkTelegram?'Подтвердите Telegram, чтобы видеть историю обоих аккаунтов.':'Для объединения откройте Кворум через Telegram, войдите там через Telegram и укажите email и пароль.'
   :'Введите email и пароль второго аккаунта. Уже сохранённые обсуждения объединятся без удаления.';
}
async function refreshHistoryLinkState(){
 if(!publicSession||!access){$('historyLinkBox').hidden=true;return;}
 const info=await api('/api/history/link',{token:await ensureSession()});
 historyLinkUi(!!info.linked);
}
$('historyLinkToggle').onclick=()=>{
 const panel=$('historyLinkPanel');panel.hidden=!panel.hidden;
 $('historyLinkToggle').setAttribute('aria-expanded',String(!panel.hidden));
};
$('historyLinkEmailForm').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{
  const info=await api('/api/history/link',{method:'POST',token:await ensureSession(),
   body:{email:$('historyLinkEmail').value.trim(),password:$('historyLinkPassword').value}});
  $('historyLinkPassword').value='';
  historyLinkUi(!!info.linked);
  $('historyLinkStatus').textContent='Истории объединены. Обновляем список задач.';
  await refreshHistory(true);
 }catch(error){$('historyLinkStatus').textContent=error.message;}
 finally{button.disabled=false;}
};
$('historyLinkTelegram').onclick=async()=>{
 const button=$('historyLinkTelegram');button.disabled=true;
 try{
  const info=await api('/api/history/link',{method:'POST',token:await ensureSession(),body:{initData:telegramContext?.initData}});
  historyLinkUi(!!info.linked);
  $('historyLinkStatus').textContent='Истории объединены. Обновляем список задач.';
  await refreshHistory(true);
 }catch(error){$('historyLinkStatus').textContent=error.message;}
 finally{button.disabled=false;}
};
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
 syncLanding();
 $('loginOpen').hidden=true;$('emailLogout').hidden=false;$('accountName').hidden=false;
 $('historyJump').hidden=false;
 $('passwordSettings').hidden=!publicSession?.user?.email;
 $('accountName').textContent=publicSession?.user?.email||publicSession?.user?.firstName||'Аккаунт';
 $('settingsOpen').hidden=!access.admin;
 
 const cap=access.maxModels??3;
 if(chosen.size>cap){
  for(const id of Array.from(chosen).slice(cap))chosen.delete(id);
  for(const a of agents)document.querySelector('.agent input[aria-label="'+a.name+'"]').checked=chosen.has(a.id);
 }
 trackVisit();
 renderAccess();refreshHistory(true).catch(e=>{$('status').textContent='Не удалось загрузить историю: '+e.message;});
 refreshHistoryLinkState().catch(()=>{$('historyLinkBox').hidden=true;});
 if(new URLSearchParams(location.search).has('payment'))checkPayment().catch(()=>{});
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
  plan?'Подписка активна до '+new Date(access.subscriptionExpiresAt).toLocaleDateString('ru-RU')+'. Осталось '+access.subscriptionRemaining+' '+taskCount(access.subscriptionRemaining)+' из 300.':
  'При регистрации — 10 бесплатных токенов. Доступно сейчас: '+access.remainingFreeTasks+' '+taskCount(access.remainingFreeTasks)+(access.purchasedTasks?' (из них куплено '+access.purchasedTasks+')':'')+'.';
 renderPricing();
 update();
}
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
  if(latest?.status==='succeeded'&&latest.applied)status.textContent='Оплата подтверждена, токены начислены.';
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
 const requestedVersion=reset?++historyListVersion:historyListVersion;
 const accountRef=access.accountRef;
 if(reset){++historySearchVersion;closeHistorySuggestions();historyOffset=0;$('historyList').replaceChildren();$('historyMore').hidden=true;}
 historyBusy=true;
 try{
  const offset=reset?0:historyOffset;
  const data=await api('/api/history?limit=20&offset='+offset,{token:await ensureSession()});
  if(requestedVersion!==historyListVersion||!access||access.accountRef!==accountRef)return;
  historyTotal=data.total;
  for(const item of data.items){
   const btn=document.createElement('button');btn.type='button';btn.className='history-cluster';
   const title=document.createElement('strong');title.textContent=item.title;
   const info=document.createElement('small');info.textContent=new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.profile||'Задача')+(item.specialization?' / '+item.specialization:'');
   btn.append(title,info);btn.onclick=()=>openHistory(item.taskId);$('historyList').append(btn);
  }
  historyOffset=data.nextOffset??data.total;
  const n=data.total,lastTwo=n%100,last=n%10;
  $('historyCount').textContent=n?n+' '+(lastTwo>=11&&lastTwo<=14?'задач':last===1?'задача':last>=2&&last<=4?'задачи':'задач'):'Пока пусто';
  $('historyMore').hidden=data.nextOffset==null;
  $('historySection').hidden=false;
  if(!data.total){
   const empty=document.createElement('p');empty.className='hint';
   empty.textContent=access.historyEnabled?'Здесь появятся завершённые обсуждения. Пока сохранённых задач нет.':'Сохранённых обсуждений пока нет. Новые задачи сохраняются по подписке.';
   $('historyList').append(empty);
  }
 }catch(error){
  if(requestedVersion===historyListVersion){$('historySection').hidden=false;$('historyCount').textContent='Ошибка загрузки';
   const warning=document.createElement('p');warning.className='hint';warning.textContent='Не удалось получить историю: '+error.message;
   $('historyList').append(warning);
  }
  throw error;
 }finally{if(requestedVersion===historyListVersion)historyBusy=false;}
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
 const term=$('historySearch').value.trim(),seq=++historySearchVersion;
 if(term.length<3){closeHistorySuggestions();return;}
 const panel=$('historySuggest');panel.replaceChildren();panel.hidden=false;
 $('historySearch').setAttribute('aria-expanded','true');
 const waiting=document.createElement('p');waiting.className='history-suggest-state';waiting.textContent='Ищем в истории…';panel.append(waiting);
 try{
  const data=await api('/api/history?limit=7&offset=0&search='+encodeURIComponent(term),{token:await ensureSession()});
  if(seq!==historySearchVersion||$('historySearch').value.trim()!==term)return;
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
  if(seq!==historySearchVersion)return;
  panel.replaceChildren();const info=document.createElement('p');info.className='history-suggest-state';
  info.textContent='Поиск временно недоступен. Попробуйте ещё раз.';panel.append(info);
 }
}
$('historySearch').addEventListener('input',()=>{
 clearTimeout(historySearchTimer);
 const term=$('historySearch').value.trim();
 if(term.length<3){++historySearchVersion;closeHistorySuggestions();return;}
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
$('historyJump').onclick=()=>$('historySection').scrollIntoView({behavior:'smooth',block:'start'});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&access&&!running)refreshHistory(true).catch(e=>{$('status').textContent='Не удалось обновить историю: '+e.message;});
});
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
  await refreshAccess();syncLanding();if(access?.admin)await showAdmin();
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

const PRODUCT_NAMES={smm:'SMM',marketing:'Маркетинг',advertising:'Реклама',copywriting:'Копирайтинг',blogging:'Блогинг',unspecified:'Не указано'};
const asPercent=value=>value==null?'—':String(value).replace('.',',')+'%';
function productSection(title,sub=''){
 const box=node('section',null,'product-report-section');box.append(node('h4',title));
 if(sub)box.append(node('p',sub,'hint'));return box;
}
function productTiles(items){
 const box=node('div',null,'product-metric-grid');
 for(const [label,value,note]of items){
  const tile=node('div',null,'product-metric');tile.append(node('small',label),node('strong',String(value)));
  if(note)tile.append(node('span',note));box.append(tile);
 }
 return box;
}
function productBars(rows,field,formatter=num){
 const grouped=rows.length>30?rows.reduce((out,d,i)=>{
  const index=Math.floor(i/7);
  if(!out[index])out[index]={day:d.day,end:d.day,[field]:0};
  out[index][field]+=Number(d[field]||0);out[index].end=d.day;return out;
 },[]):rows;
 const wrap=node('div',null,'product-bars'),max=Math.max(1,...grouped.map(r=>Number(r[field]||0)));
 for(const d of grouped){
  const line=node('div',null,'product-bar-row');
  const rail=node('div',null,'product-bar-rail'),bar=node('div',null,'product-bar-fill');
  bar.style.width=Number(d[field]||0)/max*100+'%';rail.append(bar);
  const label=d.end?'нед. '+d.day.slice(5).split('-').reverse().join('.'):d.day.slice(5).split('-').reverse().join('.');
  line.append(node('span',label),rail,node('b',formatter(d[field])));wrap.append(line);
 }
 return wrap;
}
function renderProductAnalytics(data){
 const target=$('adminProductBody');target.replaceChildren();
 const a=data.audience,t=data.tasks,b=data.billing,site=data.site;
 target.append(node('p','Начало учёта событий: '+new Date(data.since).toLocaleDateString('ru-RU')+
  '. До этой даты активность пользователей и категории задач неизвестны. Подтверждённые старые платежи включены.','product-caveat'));
 const traffic=productSection('Посещения страницы','Посетитель — уникальный браузер, открытие — каждая загрузка страницы. Вход и регистрация не нужны.');
 traffic.append(productTiles([
  ['Открытия страницы',num(site.pageViews),'Все загрузки страницы'],
  ['Уникальные посетители',num(site.uniqueVisitors),'Браузеры, а не гарантированно люди'],
  ['Без входа в аккаунт',num(site.unregisteredVisitors),'Браузеры, не связанные с аккаунтом'],
  ['Гостевые открытия',num(site.guestPageViews),'Открытия без авторизации']
 ]));
 if(site.pageViewsSince)traffic.append(node('p','Открытия считаются с '+new Date(site.pageViewsSince).toLocaleString('ru-RU')+'. Более ранние открытия восстановить нельзя.','hint'));
 const trafficDaily=productSection('Открытия по дням');trafficDaily.append(productBars(data.daily,'pageViews'));
 traffic.append(trafficDaily);target.append(traffic);
 const audience=productSection('Пользователи','Регистрации, активность и удержание после входа в аккаунт. Администратор исключён.');
 audience.append(productTiles([
  ['Новые аккаунты',num(a.newAccounts)],
  ['Активные пользователи',num(a.active)],['Всего учтено',num(a.observedAccounts)],
  ['DAU / WAU / MAU',num(a.dau)+' / '+num(a.wau)+' / '+num(a.mau)],
  ['Вернулись к задачам',num(a.returning)],
  ['Удержание D1',asPercent(a.retentionD1.percent),a.retentionD1.eligible+' аккаунтов в расчёте'],
  ['Удержание D7',asPercent(a.retentionD7.percent),a.retentionD7.eligible+' аккаунтов в расчёте']
 ]));target.append(audience);
 const tasks=productSection('Задачи');
 tasks.append(productTiles([
  ['Запущено',num(t.started)],['Завершено',num(t.completed)],
  ['С ошибкой',num(t.failed)],['Отменено',num(t.cancelled)],
  ['Уникальные авторы',num(t.uniqueAccounts)],['Повторные пользователи',num(t.repeatedAccounts)]
 ]));
 const taskColumns=node('div',null,'product-report-columns');
 const daily=productSection('Задачи по дням');daily.append(productBars(data.daily,'tasks'));
 const directions=productSection('Направления');
 const ranking=node('div',null,'product-ranked-list');
 for(const item of t.byProfile)ranking.append(productRank(PRODUCT_NAMES[item.name]||item.name,num(item.count)));
 if(!ranking.childElementCount)ranking.append(node('p','Пока нет задач','hint'));
 directions.append(ranking);
 directions.append(node('p','Популярные типы: '+(t.bySubtask.slice(0,5).map(x=>x.name+' · '+num(x.count)).join('; ')||'пока нет'),'hint'));
 taskColumns.append(daily,directions);tasks.append(taskColumns);target.append(tasks);
 const income=productSection('Деньги','Считаются только подтверждённые реальные оплаты ЮKassa, ручные начисления исключены.');
 income.append(productTiles([
  ['Выручка',rub(b.revenueRub)],['Успешные платежи',num(b.successfulPayments)],
  ['Покупатели',num(b.payingAccounts)],['Подписки / пакеты',num(b.subscriptions)+' / '+num(b.packs)],
  ['Затраты API',b.costComplete?rub(b.apiCostRub):'От '+rub(b.apiCostRub)],
  ['Маржа до комиссий',b.marginRub==null?'Недостаточно данных':rub(b.marginRub)]
 ]));
 if(!b.costComplete)income.append(node('p','Полный расчёт маржи невозможен: неполный журнал затрат или '+num(b.unknownCostCalls)+' запросов без цены.','product-caveat'));
 const sales=productSection('Выручка по дням');sales.append(productBars(data.daily,'revenue',rub));income.append(sales);
 const recent=productSection('Последние оплаты');const rows=node('div',null,'product-ranked-list');
 for(const payment of b.recent)rows.append(productRank(new Date(payment.at).toLocaleDateString('ru-RU')+' · '+(payment.sku==='subscription'?'Подписка':payment.sku),rub(payment.amountRub)));
 if(!rows.childElementCount)rows.append(node('p','За период оплат не было.','hint'));
 recent.append(rows);income.append(recent);target.append(income);
 const funnel=productSection('Путь пользователя','Не строгая когортная воронка: учитываются действия этих посетителей, в том числе после выбранного периода.');
 funnel.append(productTiles([
  ['Уникальные посетители',num(data.funnel.visitors)],
  ['Вошли в аккаунт',num(data.funnel.authenticated)],
  ['Запускали задачи',num(data.funnel.taskUsers)],
  ['Покупали',num(data.funnel.buyers)]
 ]));target.append(funnel);
}
function productRank(label,value){
 const line=node('div',null,'product-ranked-row');
 line.append(node('span',label),node('strong',value));return line;
}
let analyticsRenderVersion=0,adminTechnicalLoaded=false;
async function loadProductAnalytics(){
 const version=++analyticsRenderVersion;
 $('adminProductBody').replaceChildren(node('p','Считаем показатели…','hint'));
 try{
  const days=$('analyticsPeriod').value;
  const data=await api('/api/admin/product-analytics?days='+encodeURIComponent(days),{token:adminToken});
  if(version===analyticsRenderVersion)renderProductAnalytics(data);
 }catch(error){if(version===analyticsRenderVersion)$('adminProductBody').replaceChildren(node('p','Ошибка аналитики: '+error.message,'product-caveat'));}
}
async function loadTechnicalMonitor(){
 const config=await api('/api/admin',{token:adminToken});
 $('adminProviders').replaceChildren(...config.providers.map(p=>{
  const row=document.createElement('p');
  row.textContent=(agents.find(a=>a.id===p.id)?.name||p.id)+': '+(p.configured?'подключён · '+p.model:'не подключён');return row;
 }));
 $('adminUsage').textContent='Запросов сегодня: '+config.usage.requestsToday+' / '+config.usage.dailyLimit+
  '. Лимит вызовов на аккаунт: '+config.usage.perAccountDailyLimit+'.';
 renderAccounting(config.accounting);
}
function showAdminTab(isProduct){
 $('adminProductAnalytics').hidden=!isProduct;$('adminTechnicalAnalytics').hidden=isProduct;
 for(const [id,active]of [['adminProductTab',isProduct],['adminTechnicalTab',!isProduct]]){
  $(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));
 }
 if(!isProduct&&!adminTechnicalLoaded){
  adminTechnicalLoaded=true;loadTechnicalMonitor().catch(e=>{$('adminStatus').textContent=e.message;});
 }
}
$('adminProductTab').onclick=()=>showAdminTab(true);
$('adminTechnicalTab').onclick=()=>showAdminTab(false);
$('analyticsPeriod').onchange=loadProductAnalytics;
async function showAdmin(){
 const config=await api('/api/admin',{token:adminToken});
 $('adminLogin').hidden=true;$('adminPanel').hidden=false;$('settingsOpen').hidden=false;
 adminTechnicalLoaded=false;showAdminTab(true);$('adminStatus').textContent='';
 await loadProductAnalytics();
}

$('settingsOpen').onclick=async()=>{$('settings').showModal();try{await showAdmin();}catch(e){$('adminStatus').textContent=e.message;}};
$('adminForm').onsubmit=async e=>{e.preventDefault();adminToken=$('adminCode').value.trim();$('adminStatus').textContent='Проверяем доступ…';
 try{await showAdmin();sessionStorage.setItem('quorum-admin',adminToken);$('adminCode').value='';await refreshAccess();}
 catch(e){adminToken='';$('adminStatus').textContent=e.message;}
};
$('adminLogout').onclick=()=>{
 api('/api/logout',{method:'POST',token:adminToken}).catch(()=>{});
 clearIdentity();access=null;
 $('adminPanel').hidden=true;$('adminLogin').hidden=false;$('settingsOpen').hidden=true;
 $('settings').close();history.replaceState(null,'',location.pathname);refreshAccess().catch(()=>{});
};
if(new URLSearchParams(location.search).has('admin'))$('settings').showModal();

loadConfig();
trackVisit(true);
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
 const card=document.createElement('article');card.className='message provider-'+type+(m.final?' final':'')+(m.error?' error':'')+(m.show?' show-message':'');
 const head=document.createElement('div');head.className='message-head';
 const identity=document.createElement('span');identity.className='model-identity';
 const dot=document.createElement('span');dot.className='model-dot';dot.setAttribute('aria-hidden','true');
 const name=document.createElement('strong');name.textContent=m.final&&!m.show?'Готовый результат':m.nickname?m.nickname+' · '+m.name:m.name;
 identity.append(dot,name);
 const stage=document.createElement('small');stage.className='stage-pill';stage.textContent=m.final&&!m.show?'Итоговый ответ · '+(m.nickname?m.nickname+' / ':'')+(agents.find(a=>a.id===m.id)?.name||'модель'):m.stage==='Независимая идея'?'Первый раунд':m.stage;
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
 const visible=experience==='show'||$('showDiscussion').checked?messages:messages.filter(m=>m.final);
 $('feed').replaceChildren(...visible.map(renderMessage));
 syncResultActions();
}
$('showDiscussion').onchange=renderMessages;
function emit(m){
 messages.push(m);
 // Append instead of rebuilding the entire feed: preserving iOS/Android touch selections
 // while further AI responses arrive.
 if(experience==='show'||$('showDiscussion').checked||m.final)$('feed').append(renderMessage(m));
 syncResultActions();
}
async function request(a,chat,signal,stage={}){
 const result=await api('/api/chat',{method:'POST',token:await ensureSession(),body:{provider:a.id,messages:chat,taskId:activeTask?.taskId,stage:stage.stage,step:stage.step,format:stage.format,maxWords:stage.format==='show'?45:wordsForPreset($('length').value)},signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
 if(typeof result.text!=='string'||!result.text.trim())throw Error('Модель вернула пустой ответ');
 // JSON ballots are a control protocol, not a prose response. Never truncate them.
 return stage.format==='show'?clipShowLine(result.text):stage.stage==='final'||['Голосование','Проверка согласия'].includes(stage.step)
  ?result.text:limitIntermediate(result.text,wordsForPreset($('length').value));
}
$('start').onclick=async()=>{
 if(!access){$('loginOpen').click();return;}
 const isShow=experience==='show',scene=showScenario(showScenarioId);
 const extra=$('showExtra').value.trim();
 const task=isShow?scene.title+': '+scene.description+(extra?' Режиссёрский поворот: '+extra:''):$('task').value.trim();
 if(!task){$('status').textContent='Сначала опишите задачу.';return;}
 const members=agents.filter(a=>chosen.has(a.id));
 if(isShow)ensureShowCast();
 const cast=isShow?showCast(scene,showAssigned):[];
 if(isShow&&cast.length!==members.length){$('status').textContent='Каждой выбранной нейросети нужна своя роль.';return;}
 const moderator=members.find(a=>a.id===$('judge').value)||members[0];
 running=true;stopRequested=false;telegramContext?.app.enableClosingConfirmation?.();messages=[];events=[];controller=new AbortController();
 const {profile:currentProfile,task:currentSubtask}=resolveProfile(profileId,taskId);
 lastTaskContext=isShow?{prompt:task,profile:'Шоу',specialization:scene.title}:{prompt:task,profile:currentProfile.name,specialization:currentSubtask?.[1]||''};
 $('feed').replaceChildren();syncResultActions();$('progress').hidden=true;$('researchPanel').hidden=true;$('researchSources').replaceChildren();$('researchSearchWidget').replaceChildren();
 $('stopAction').hidden=false;$('stop').disabled=false;$('stop').textContent='Остановить задачу';
 document.querySelectorAll('aside input,aside select,aside button,#task,#showExtra,#showRandomCast,.show-scenario,#settingsOpen,#rounds,#length,#factCheck,#ambience').forEach(e=>e.disabled=true);
 update();$('status').textContent=isShow?'Шоу начинается. Персонажи вступают в диалог.':'Нейросети работают над вашей задачей.';
 try{
  let token=await ensureSession();
   const startBody={participants:members.map(a=>a.id),rounds:isShow?2:Number($('rounds').value),mode:isShow?'show':mode,profile:isShow?'show':profileId,subtask:isShow?scene.id:taskId||'unspecified'};
   try{activeTask=await api('/api/task/start',{method:'POST',token,body:startBody});}
   catch(error){
    if(error.status!==401||adminToken)throw error;
    clearIdentity();
    if(!telegramContext){showSignedOut();throw Error('Войдите через Telegram или email заново.');}
    token=await ensureSession();
    activeTask=await api('/api/task/start',{method:'POST',token,body:startBody});
   }
  access={...access,remainingFreeTasks:activeTask.remainingFreeTasks};renderAccess();
  if(isShow){
   await runShow({agents:members,scenario:scene,cast,extra,turns:2,request,emit,signal:controller.signal,onProgress:progress});
   $('status').textContent='🎬 Сцена завершена. Можно поменять кастинг или выбрать другую историю.';
  }else{
   const {profile,task:subtask}=resolveProfile(profileId,taskId);
   await discuss({agents:members,judge:moderator,mode,ambience,rounds:Number($('rounds').value),words:wordsForPreset($('length').value),task,professional:profile.name+'. '+profile.criteria,specialty:subtask?subtask[1]+'. '+subtask[2]:'Любая задача в указанном направлении.',request,emit,signal:controller.signal,onProgress:progress,
    researchProvider:$('factCheck').checked&&needsSources(task)?verifyTaskSources:null,onResearch:showResearch});
   $('status').textContent='Готово. Итог ниже; подробности обсуждения доступны по переключателю.';
  }
  if(messages.some(m=>m.error))$('status').textContent+=' Часть ответов завершилась ошибкой.';
 }catch(e){
  if(e.status===402&&access){access={...access,remainingFreeTasks:0};renderAccess();}
  $('status').textContent=e.name==='AbortError'?'Задача остановлена. Квота не возвращается; полученные ответы можно скопировать.':e.message;
 }finally{
  if(activeTask){
   const {profile,task:subtask}=resolveProfile(profileId,taskId);
   const historyPayload={
    prompt:isShow?task:$('task').value,profile:isShow?'Шоу':profile.name,ambience:isShow?'none':ambience,
    specialization:isShow?scene.title:subtask?.[1]||'',messages:messages.map(({name,nickname,stage,text,final,error,show})=>({name,nickname,stage,text,final:!!final,error:!!error,show:!!show}))
   };
   try{const finished=await api('/api/task/finish',{method:'POST',token:await ensureSession(),body:{
     taskId:activeTask.taskId,cancelled:stopRequested,...(activeTask.historyEnabled?{history:historyPayload}:{})
    }});if(finished.refundedTokens>0)$('status').textContent+=' Возвращено '+finished.refundedTokens+' '+taskCount(finished.refundedTokens)+' за ошибки ИИ.';}catch(e){$('status').textContent+=' Не удалось завершить задачу: '+e.message;}
   activeTask=null;
  }
  await refreshAccess().catch(()=>{});
  running=false;telegramContext?.app.disableClosingConfirmation?.();$('stopAction').hidden=true;
  document.querySelectorAll('aside input,aside select,aside button,#task,#showExtra,#showRandomCast,.show-scenario,#example,#settingsOpen,#rounds,#length,#factCheck,#ambience').forEach(e=>e.disabled=false);
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

