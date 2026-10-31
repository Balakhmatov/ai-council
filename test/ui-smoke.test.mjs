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
 assert.match(html,/app\.js\?v=accountpricing15/);
 assert.match(css,/\.profile-option\.active\{background:transparent;/);
 assert.match(css,/\.task-option\{[^}]*border-radius:999px/);
 assert.match(css,/\.task-option\.active\{[^}]*background:#f2ebfc/);
});

test('iOS fields use 16px text to prevent WebView focus zoom without disabling user zoom',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fix=css.slice(css.indexOf('/* Mobile input focus:'));
 assert.match(fix,/@media\s*\(max-width:\s*880px\),\s*\(pointer:\s*coarse\)/);
 assert.match(fix,/textarea,\s*select,\s*input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
 assert.match(fix,/font-size:\s*max\(16px,\s*1rem\)/);
 assert.match(fix,/@supports\s*\(-webkit-touch-callout:\s*none\)/);
 assert.match(fix,/font-size:\s*16px !important/);
 assert.match(html,/style\.css\?v=full-audit12/);
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

