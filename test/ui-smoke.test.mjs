import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {profiles} from '../public/profiles.js';
import {getTaskHint} from '../public/examples.js';

test('all five category tabs and specialized tags have correct initial data',()=>{
 assert.equal(profiles.length,5);
 for(const p of profiles){
  assert.equal(p.tasks.length,6);
  assert.ok(getTaskHint(p.id).length>50);
  for(const t of p.tasks)assert.ok(getTaskHint(p.id,t[0]).length>50);
 }
});
test('Telegram frontend loads a versioned hint module and keeps styled category/tag controls',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(app,/import \{getTaskHint\} from '\.\/examples\.js\?v=purpose8'/);
 assert.match(app,/function renderProfiles\(/);
 assert.match(app,/function renderSubtasks\(/);
 assert.match(app,/renderProfiles\(\);renderSubtasks\(\);syncTaskHint\(\)/);
 assert.match(html,/id="profiles"/);
 assert.match(html,/id="subtasks"/);
 assert.match(html,/app\.js\?v=show67/);
 assert.match(css,/\.profile-option\.active\{background:transparent;/);
 assert.match(css,/\.task-option\{[^}]*border-radius:999px/);
 assert.match(css,/\.task-option\.active\{[^}]*background:#f2ebfc/);
});

test('iOS fields use 16px text to prevent WebView focus zoom without disabling user zoom',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fix=css.slice(css.indexOf('@media (max-width: 880px), (pointer: coarse)'));
 assert.match(fix,/@media\s*\(max-width:\s*880px\),\s*\(pointer:\s*coarse\)/);
 assert.match(fix,/textarea,\s*select,\s*input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
 assert.match(fix,/font-size:\s*max\(16px,\s*1rem\)/);
 assert.match(fix,/@supports\s*\(-webkit-touch-callout:\s*none\)/);
 assert.match(fix,/font-size:\s*16px !important/);
 assert.match(html,/style\.css\?v=mobile-polish49/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});

test('owner accounting loads complete paginated request logs with task subtotals',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/api\/admin\/logs\?limit=50/);
 assert.match(app,/api\/admin\/logs\?taskId=/);
 assert.match(app,/discussionAccumulatedRub/);
 assert.match(app,/costBreakdownRub/);
 assert.match(app,/Скачать весь журнал CSV/);
});


test('tariff prices have an always-visible entry point and static fallback before API loads',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/<button id="pricingOpen"[^>]*>Тарифы<\/button>/);
 assert.match(html,/<dialog id="pricingDialog"[^>]*>/);
 assert.match(html,/id="pricingOffers"/);
 for(const text of ['1 200 ₽','25 ₽','225 ₽','425 ₽','300 токенов','До 7 моделей'])
  assert.ok(html.includes(text),'Static tariff must be visible without server response: '+text);
 assert.match(app,/\$\('pricingOpen'\)\.onclick=/);
 assert.match(app,/\$\('pricingDialog'\)\.showModal\(\)/);
 assert.match(ui,/\.pricing-open\{/);
 assert.match(ui,/\.pricing-dialog\{/);
 assert.ok(html.indexOf('id="pricingOpen"')<html.indexOf('<main>'),'Price opener must be above the fold');
});

test('pricing modal has readable cards, fixed close button and responsive pack layout',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/id="pricingOffers" class="pricing-offers"/);
 assert.match(html,/class="pricing-offer pricing-offer-sub"/);
 assert.equal((html.match(/class="pricing-offer pricing-offer-pack"/g)||[]).length,3);
 assert.match(html,/class="pricing-value">1 200 ₽/);
 assert.match(html,/class="quiet pricing-close"/);
 assert.match(css,/\.pricing-dialog \.pricing-offers\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/\.pricing-dialog \.pricing-offer-sub/);
 assert.match(app,/function renderPricing\(\)/);
 assert.match(app,/node\('article',null,'pricing-offer pricing-offer-sub'\)/);
});

test('password sign-in and first-time code verification retain Telegram login and auto-session controls',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 for(const id of ['passwordSettings','emailPasswordLogin','loginPasswordEmail','loginPassword','emailRecoveryOpen','emailRecovery','emailRequest','emailVerify','emailPasswordSetup','emailNewPassword','emailRepeatPassword','telegramOpen']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(html,/autocomplete="current-password"/);
 assert.match(html,/autocomplete="new-password"/);
 assert.match(app,/api\/email\/password\/login/);
 assert.match(app,/api\/email\/password\/set/);
 assert.match(app,/\$\('passwordSettings'\)\.onclick=/);
 assert.match(app,/api\/auth\/session/);
 assert.match(app,/api\/telegram\/auth/);
 assert.match(css,/\.auth-password-form/);
});

test('customer-facing Quorum consistently calls units tasks, not assignments',()=>{
 const root=new URL('../',import.meta.url);
 for(const path of ['public/index.html','public/app.js','server.mjs','economy.mjs','history.mjs']){
  const content=readFileSync(new URL(path,root),'utf8');
  assert.doesNotMatch(content,/задан(?:ие|ия|ий|ию|ии|ием|ием|иям|иями|иях|иe)/i,path+' contains outdated wording');
 }
 const html=readFileSync(new URL('public/index.html',root),'utf8');
 const app=readFileSync(new URL('public/app.js',root),'utf8');
 for(const text of ['Опишите задачу','История задач','300 токенов','5 токенов','50 токенов','100 токенов','за токен']){
  assert.ok(html.includes(text),text+' should appear in interface');
 }
 assert.match(app,/function taskCount\(value\)/);
 assert.match(app,/taskCount\(access\.remainingFreeTasks\)/);
});

test('owner role is refreshed from live session and unlocks administration without a new login',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(js,/async function refreshAccess\(\)/);
 assert.match(js,/api\/auth\/session/);
 assert.match(js,/\$\('settingsOpen'\)\.hidden=!access\.admin/);
 assert.doesNotMatch(html,/Демо без API|id="demoControls"|id="demo"/);
 assert.doesNotMatch(js,/\$\('demo'\)|demoControls|Демонстрация без API/);
 assert.match(js,/window\.addEventListener\('focus'/);
 assert.match(js,/document\.addEventListener\('visibilitychange'/);
 assert.match(js,/Object\.hasOwn\(identity,'token'\)/);
 assert.match(html,/app\.js\?v=show67/);
});

test('stop button clearly discloses that user cancellation does not refund quota',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="stopAction"/);
 assert.match(html,/id="stop"[^>]*>Остановить шоу/);
 assert.match(html,/При остановке квота не возвращается/);
 assert.match(app,/stopRequested=true/);
 assert.match(app,/controller\?\.abort\(\)/);
 assert.match(app,/cancelled:stopRequested/);
 assert.match(app,/\$\('stopAction'\)\.hidden=false/);
 assert.match(app,/\$\('stopAction'\)\.hidden=true/);
});
test('per-model and complete copy controls exist in current tasks and archived discussions',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 for(const id of ['copyAll','historyCopyAll'])assert.ok(html.includes('id="'+id+'"'),id+' missing');
 assert.match(app,/import \{formatTranscript\} from '\.\/transcript\.js'/);
 assert.match(app,/function renderMessage\(m\)/);
 assert.match(app,/className='copy-action copy-single'/);
 assert.match(app,/writeClipboard\(text\)/);
 assert.match(app,/document\.execCommand\('copy'\)/);
 assert.match(app,/formatTranscript\(item\)/);
 assert.match(app,/formatTranscript\(\{\.\.\.details,messages\}\)/);
 assert.match(css,/-webkit-user-select:text!important/);
 assert.match(css,/-webkit-touch-callout:default!important/);
 assert.match(css,/\.message-head \.copy-single/);
 assert.match(app,/\$\('feed'\)\.append\(renderMessage\(m\)\)/);
 assert.doesNotMatch(app,/function emit\(m\)\{messages\.push\(m\);renderMessages\(\);\}/);
});

test('Quorum defaults to Claude for the final answer and never silently prioritizes Grok',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/import \{MODEL_PRIORITY,defaultParticipants,chooseModerator\} from '\.\/model-priority\.js'/);
 assert.match(app,/const agents=MODEL_PRIORITY\.map/);
 assert.match(app,/const chosen=new Set\(MODEL_PRIORITY\.slice\(0,3\)\)/);
 assert.match(app,/chooseModerator\(chosen,old,\{manual:moderatorChosenByUser\}\)/);
 assert.match(app,/for\(const id of defaultParticipants\(available\)\)chosen\.add\(id\)/);
 assert.match(app,/\$\('judge'\)\.onchange=\(\)=>\{moderatorChosenByUser=true/);
 assert.doesNotMatch(app,/chosen\.has\('grok'\)\?'grok'/);
 assert.match(html,/app\.js\?v=show67/);
});

test('round and named response length selectors appear under task input, separate from modes',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const modesStart=html.indexOf('<details class="advanced">'),controls=html.indexOf('class="response-controls"'),prompt=html.indexOf('id="task"');
 assert.ok(prompt<controls&&controls<modesStart,'Both controls must be visible below prompt before the collapsible modes');
 for(const label of ['Раунды обсуждения','Длина промежуточных ответов','Коротко','Средне','Подробно'])assert.ok(html.includes(label),label);
 assert.match(html,/<option value="short" selected>Коротко/);
 assert.match(app,/wordsForPreset\(\$\('length'\)\.value\)/);
 assert.match(app,/limitIntermediate\(result.text/);
 assert.match(app,/maxWords:stage\.format==='show'\?\(stage\.maxWords\|\|45\):wordsForPreset/);
 assert.match(app,/renderMarkdown\(text\)/);
 assert.match(app,/Первый раунд/);
});
test('history viewer is fullscreen and searchable on all stored tasks, using server-side API',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/id="historySearch"/);
 assert.match(html,/history-fullscreen/);
 assert.match(app,/search='\+encodeURIComponent\(term\)/);
 assert.match(app,/\$\('historySearch'\)\.addEventListener\('input'/);
 assert.match(css,/dialog\.history-dialog\.history-fullscreen\[open\]/);
 assert.match(css,/max-height:100dvh/);
 assert.match(css,/\.rendered-markdown \.md-table-scroll/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
});

test('research UI is selective, source-based and never silently claims every model number verified',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 for(const id of ['factCheck','researchPanel','researchState','researchSources','researchSearchWidget'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/app\.js\?v=show67/);
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(app,/needsSources\(task\)/);
 assert.match(app,/api\/research/);
 assert.match(app,/onResearch:showResearch/);
 assert.match(app,/research\.status!=='grounded'/);
 assert.match(app,/iframe/);
 assert.match(css,/\.research-panel/);
 assert.match(css,/\.research-source/);
});

test('history typeahead floats beneath input, debounces after 3 chars and shows source-line context',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/id="historySuggest"/);
 assert.match(html,/role="combobox"/);
 assert.match(app,/if\(term\.length<3\)/);
 assert.match(app,/setTimeout\(\(\)=>suggestHistory\(\),190\)/);
 assert.match(app,/history-suggest-snippet/);
 assert.match(app,/item\.excerpt/);
 assert.match(css,/\.history-suggest\{position:absolute/);
 assert.doesNotMatch(app,/\$\(\'historySearch\'\)\.addEventListener\(\'input\',\(\)=>\{[\s\S]*?setTimeout\(\(\)=>refreshHistory\(true\)/);
});
test('voting responses are readable, model cards are distinct, premium details are gated',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../public/engine.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/до 300 слов/);
 assert.match(html,/до 600 слов/);
 assert.match(html,/до 1 000 слов/);
 assert.match(html,/id="lengthNote"/);
 assert.match(app,/detailed\.disabled=!premium/);
 assert.match(app,/stage\.step\)/);
 assert.match(app,/readableStoredMessage/);
 assert.match(engine,/readableBallot\(ballot,stage,agents\)/);
 assert.match(css,/\.message-head \.stage-pill/);
 assert.match(css,/provider-mistral/);
});

test('choosing a fourth model on free plan shows an anchored tooltip, not a removed choice',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/function showModelLimitTooltip\(label\)/);
 assert.match(app,/Использование всех моделей одновременно доступно по подписке/);
 assert.match(app,/if\(input\.checked&&chosen\.size>=cap\)/);
 assert.match(app,/input\.checked=false/);
 assert.match(app,/if\(cap===3\)showModelLimitTooltip\(label\)/);
 assert.match(css,/\.model-limit-tooltip\{/);
 assert.match(css,/pointer-events:none/);
 assert.match(html,/app\.js\?v=show67/);
 assert.match(html,/uiux32\.css\?v=show65/);
});
test('Qwen and DeepSeek models are available in the selection UI when configured',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/qwen:\{name:'Qwen'/);
 assert.match(app,/deepseek:\{name:'DeepSeek'/);
 assert.match(app,/available\.has\(a\.id\)/);
});

test('mobile pricing consent is grouped, archive visible and account code removed',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/class="pricing-agree-copy"/);
 assert.match(html,/id="pricingAgree"/);
 assert.match(css,/grid-template-columns:20px minmax\(0,1fr\)/);
 assert.match(html,/id="historyJump"/);
 assert.match(html,/id="historyLinkBox"/);
 assert(html.indexOf('id="historyLinkBox"')>html.indexOf('id="historyMore"'));
 assert(!html.includes('id="accountCodeDetails"'));
 assert.match(app,/document\.documentElement\.dataset\.profile=profileId/);
 assert.match(app,/\$\('historySection'\)\.hidden=false/);
 assert.match(css,/\[data-profile="marketing"\]/);
 assert.match(css,/\.participants-toggle-mobile\{/);
});

test('marketing landing opens guest workspace without sign-up, with an optional real email login',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/id="landingTry"[^>]*>Попробовать бесплатно/);
 assert.match(html,/id="landingEmail"[^>]*>Войти по email/);
 assert.match(html, /<img[^>]+src="data:image\/webp;base64,UklGR/);
 assert.match(html, /<source[^>]+srcset="data:image\/webp;base64,UklGR/);
 assert.match(js,/landingExploring=true;syncLanding\(\)/);
 assert.match(js,/\$\('loginOpen'\)\.click\(\);\$\('emailOpen'\)\.click\(\)/);
 assert.match(js,/function showSignedOut\(\)\{\s*access=null;syncLanding\(\)/);
 assert.match(js,/if\(!access\)\{\$\('loginOpen'\)\.click\(\);return;\}/);
 assert.match(css,/body\.landing-visible>header,body\.landing-visible>main/);
 assert.match(css,/landing-asset-missing/);
});

test('Show is the first screen for every user, with the obsolete Council and marketing landing hidden',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const sync=app.slice(app.indexOf('function syncLanding(){'),app.indexOf("$('landingTry').onclick"));
 assert.match(sync,/openWorkspace=landingExploring\|\|url\.has\('admin'\)\|\|url\.has\('payment'\)/);
 assert.doesNotMatch(sync,/!!access|!!telegramContext|!!adminToken/);
 assert.match(html,/<body data-experience="show">/);
 assert.match(sync,/document\.body\.classList\.remove\('landing-visible'\)/);
 assert.match(html,/id="councilPanel" class="council-panel" hidden/);
 assert.match(html,/id="showPanel" class="show-panel" aria-label="Создать шоу"[^>]*>/);
 assert.match(app,/setExperience\('show'\);/);
 assert.match(html,/app\.js\?v=show67/);
});

test('landing artwork contains no painted CTA; interactive actions, category chips and legal links follow image',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 const body=html.slice(html.indexOf('<section id="quorumLanding"'),html.indexOf('<header>'));
 assert.match(body,/<picture class="quorum-landing-art"/);
 assert.match(body,/data:image\/webp;base64,UklGR/);
 assert.match(body,/<\/picture>[\s\S]*id="landingTry"[\s\S]*id="landingEmail"/);
 assert.match(body,/<div class="quorum-landing-topics"/);
 assert.match(body,/<nav class="quorum-landing-legal"/);
 assert.match(css,/\.quorum-landing-actions\{position:relative/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.doesNotMatch(css,/\.quorum-landing-frame\{[^}]*aspect-ratio:941\/1672/);
});

test('mobile marketing screen stays inside stable Safari viewport without white overscroll gaps',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(css,/html:has\(body\.landing-visible\)\{height:100%;background:#f4e1fa!important;/);
 assert.match(css,/body\.landing-visible\{position:fixed;inset:0;width:100%;height:100svh;min-height:0;/);
 assert.match(css,/body\.landing-visible .quorum-landing\{display:flex;flex-direction:column;/);
 assert.match(css,/\.quorum-landing-frame\{width:min\(calc\(100vw - 14px\),530px,calc\(78\.027svh - 122\.50px\)\)/);
 assert.match(css,/\.quorum-landing-legal\{gap:15px;padding:2px 6px 0;/);
 assert.doesNotMatch(css,/\.quorum-landing-frame\{[^}]*margin:auto auto 0/);
 const ratio=941/1206;
 for(const [width,height] of [[320,480],[375,568],[390,650],[393,700],[430,750]]){
   const artWidth=Math.min(width-14,530,height*.78027-122.50);
   const occupied=artWidth/ratio+2*42+7+7+27+18+12;
   assert(occupied<=height, `mobile ${width}x${height}: landing art and controls overflow by ${occupied-height}px`);
 }
});

test('landing image fills mobile viewport without surrounding white gutters',()=>{
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(css,/body\.landing-visible \.quorum-landing\{\s*padding:0!important;/);
 assert.match(css,/background:linear-gradient\(180deg,#f9efff 0%,#f4e4fe 48%,#eddcfe 100%\)!important/);
 assert.match(css,/width:min\(100vw,530px,calc\(78\.027svh - 110px\)\)!important/);
 assert.match(css,/justify-content:flex-start!important/);
 assert.match(css,/body\.landing-visible \.quorum-landing-legal\{/);
});

test('roast battle has distinct selector, displays the transcript by default, and does not change other modes',()=>{
 const engine=readFileSync(new URL('../public/engine.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(engine,/roast: \['🔥 Токсичный баттл'/);
 assert.match(html,/id="roastModeNote"[^>]*hidden/);
 assert.match(html,/id="discussionChoiceLabel"/);
 assert.match(html,/app\.js\?v=show67/);
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(app,/if\(mode==='roast'\)\$\('showDiscussion'\)\.checked=true/);
 assert.match(app,/\$\('roastModeNote'\)\.hidden=mode!=='roast'/);
 assert.match(app,/\$\('discussionChoiceLabel'\)\.textContent=mode==='roast'/);
 assert.match(css,/#modes \.mode-roast\.active/);
 assert.match(css,/\.roast-mode-note\{/);
});

test('discussion ambience is a separate live setting with scene nicknames and true model names',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../public/engine.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 assert.match(html,/id="ambience"/);
 assert.match(html,/id="ambienceHint"/);
 assert.match(html,/app\.js\?v=show67/);
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(engine,/label:'🎬 Тарантино'/);
 assert.match(engine,/label:'🕶️ Гангстеры'/);
 assert.match(engine,/label:'🧢 Блатной двор'/);
 assert.match(engine,/label:'⚡ Аниме'/);
 assert.match(app,/Object\.entries\(ambiences\)/);
 assert.match(app,/ambience='none'/);
 assert.match(app,/ambience,rounds:Number\(\$\('rounds'\)\.value\)/);
 assert.match(app,/m\.nickname\?m\.nickname\+' · '\+m\.name:m\.name/);
 assert.match(css,/\.ambience-setting\{/);
});


test('Show stays independent of Council, includes ten visual scenes and model-to-character casting',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/uiux32.css',import.meta.url),'utf8');
 const show=readFileSync(new URL('../public/show.js',import.meta.url),'utf8');
 for(const id of ['experienceCouncil','experienceShow','councilPanel','showPanel','showScenarioCards','showScenarioDetails','showCast','showRandomCast','showExtra'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/app\.js\?v=show67/);
 assert.match(html,/uiux32\.css\?v=show65/);
 assert.match(app,/import \{SHOW_SCENARIOS,showScenario,showCast,clipShowLine,runShow\} from '\.\/show\.js\?v=drama1'/);
 assert.match(app,/const isShow=experience==='show'/);
 assert.match(app,/await runShow\(/);
 assert.match(app,/mode:isShow\?'show':mode/);
 assert.match(app,/format:stage\.format/);
 assert.match(app,/maxWords:stage\.format==='show'\?\(stage\.maxWords\|\|45\)/);
 assert.match(app,/showAssigned\[index\]=selected/);
 assert.match(app,/crypto\.getRandomValues/);
 assert.match(css,/\.show-scenarios\{/);
 assert.match(css,/\.show-poster\{/);
 assert.match(css,/\.show-role\{/);
 assert.match(css,/#feed \.show-message/);
 assert.match(show,/export const SHOW_SCENARIOS/);
});
