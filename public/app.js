// Restores full app.js from split parts (tool size limit workaround)
const base = new URL('./', import.meta.url);
const texts = await Promise.all(
  [1,2,3].map(i => fetch(new URL(`app.part${i}.txt?v=uiux31`, base)).then(r => {
    if (!r.ok) throw new Error('Failed to load app.part' + i);
    return r.text();
  }))
);
let code = texts.join('');
const root = base.href;
code = code.replaceAll("from './", `from '${root}`);
code = code.replaceAll('from "./', `from "${root}`);
const blob = new Blob([code], { type: 'text/javascript' });
const url = URL.createObjectURL(blob);
await import(url);
