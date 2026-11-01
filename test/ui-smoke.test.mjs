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
 assert.match(html,/app\.js\?v=history-sync48/);
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
 assert.match(html,/style\.css\?v=history-layout43/);
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
 assert.match(js,/\$\('demoControls'\)\.hidden=!access\.admin/);
 assert.match(js,/window\.addEventListener\('focus'/);
 assert.match(js,/document\.addEventListener\('visibilitychange'/);
 assert.match(js,/Object\.hasOwn\(identity,'token'\)/);
 assert.match(html,/app\.js\?v=history-sync48/);
});

test('stop button clearly discloses that user cancellation does not refund quota',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="stopAction"/);
 assert.match(html,/id="stop"[^>]*>Остановить задачу/);
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
 assert.match(html,/app\.js\?v=history-sync48/);
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
 assert.match(app,/maxWords:wordsForPreset/);
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
 assert.match(html,/app\.js\?v=history-sync48/);
 assert.match(html,/uiux32\.css\?v=history-sync48/);
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
 assert.match(html,/app\.js\?v=history-sync48/);
 assert.match(html,/uiux32\.css\?v=history-sync48/);
});
test('Qwen and DeepSeek models are available in the selection UI when configured',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/qwen:\{name:'Qwen'/);
 assert.match(app,/deepseek:\{name:'DeepSeek'/);
 assert.match(app,/available\.has\(a\.id\)/);
});
