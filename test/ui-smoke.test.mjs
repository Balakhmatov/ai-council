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
 assert.match(html,/app\.js\?v=password38/);
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
 assert.match(html,/style\.css\?v=password38/);
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
 for(const text of ['1 200 ₽','30 ₽','135 ₽','255 ₽','500 заданий','До 7 моделей'])
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
