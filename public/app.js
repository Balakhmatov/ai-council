// Runtime restore: load last known-good app.js, apply UI/UX patches, import as module.
const base = new URL('./', import.meta.url);
const GOOD = 'https://raw.githubusercontent.com/Balakhmatov/ai-council/93ea750403ebac700f37ddc0b27f2551b580d232/public/app.js';
const res = await fetch(GOOD);
if (!res.ok) throw new Error('Failed to load app.js from history: ' + res.status);
let code = await res.text();

// Patch 1: soft "any task" chip
code = code.replace(
  "b.className='task-option';b.classList.toggle('active',id===taskId);\n  b.textContent=label;b.setAttribute('aria-pressed',String(id===taskId));b.onclick=()=>{taskId=id;renderSubtasks();syncTaskHint();};return b;",
  "b.className='task-option'+(id===''?' task-option-any':'');\n  b.classList.toggle('active',id===taskId);\n  b.textContent=label;b.setAttribute('aria-pressed',String(id===taskId));\n  b.onclick=()=>{taskId=id;renderSubtasks();syncTaskHint();};return b;"
);

// Patch 2: mobile quorum summary text
code = code.replace(
  " $('budget').textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог подготовит '+(agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель');\n",
  " const judgeName=agents.find(a=>a.id===$('judge').value)?.name||'выбранная модель';\n $('budget').textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог подготовит '+judgeName;\n const mq=$('mobileQuorumText');\n if(mq) mq.textContent=chosen.size+' модели · '+$('rounds').value+' раунда · итог '+judgeName;\n"
);

// Patch 3: jump to participants on mobile
if (!code.includes('mobileQuorumJump')) {
  code = code.replace(
    "$('rounds').onchange=update;$('length').onchange=update;$('judge').onchange=update;",
    "$('rounds').onchange=update;$('length').onchange=update;$('judge').onchange=update;\n$('mobileQuorumJump')?.addEventListener('click',()=>{\n  const el=document.querySelector('aside');\n  if(el) el.scrollIntoView({behavior:'smooth',block:'start'});\n});"
  );
}

// Rewrite relative imports to current origin (blob URLs can't resolve ./engine.js)
const root = base.href;
code = code.replaceAll("from './", `from '${root}`);
code = code.replaceAll('from "./', `from "${root}`);

const blob = new Blob([code], { type: 'text/javascript' });
await import(URL.createObjectURL(blob));
