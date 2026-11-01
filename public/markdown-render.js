// Safe DOM-only Markdown renderer: no untrusted innerHTML.
function inline(text,parent,depth=0){
 if(depth>7){parent.append(document.createTextNode(text));return;}
 const token=/(\x60+)([\s\S]*?)\1|\[([^\]]+)\]\(([^)\s]+)\)|(\*\*|__)([\s\S]+?)\5|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!\w)_([^_\n]+)_(?!\w)/g;
 let last=0,m;
 while((m=token.exec(text))){
  if(m.index>last)parent.append(document.createTextNode(text.slice(last,m.index)));
  if(m[1]){const el=document.createElement('code');el.textContent=m[2];parent.append(el);}
  else if(m[3]){
   const href=m[4];let safe=false;try{const u=new URL(href);safe=['https:','http:','mailto:'].includes(u.protocol);}catch{}
   const el=document.createElement(safe?'a':'span');if(safe){el.href=href;el.rel='noopener noreferrer';el.target='_blank';}el.textContent=m[3];parent.append(el);
  }else{const el=document.createElement(m[5]?'strong':'em');inline(m[5]?m[6]:m[7]??m[8],el,depth+1);parent.append(el);}
  last=token.lastIndex;
 }
 if(last<text.length)parent.append(document.createTextNode(text.slice(last)));
}
function cells(line){return line.replace(/\\\|/g,'\uE000').replace(/^\s*\||\|\s*$/g,'').split('|').map(s=>s.replace(/\uE000/g,'|').trim());}
function divider(line){return /^\s*\|?[\s:|-]+\|?\s*$/.test(line)&&line.includes('-')&&cells(line).every(x=>/^:?-{3,}:?$/.test(x));}
function listed(line){return /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line);}
function boundary(line){return /^\s{0,3}(?:#{1,6}\s+|>|-{3,}\s*$|\x60{3,}|~{3,})/.test(line)||listed(line);}
export function renderMarkdown(input){
 const root=document.createElement('div');root.className='rendered-markdown';
 const lines=String(input||'').replace(/\r\n?/g,'\n').split('\n');
 let i=0;
 while(i<lines.length){
  const line=lines[i];if(!line.trim()){i++;continue;}
  const fence=line.match(/^\s{0,3}(\x60{3,}|~{3,})(.*)$/);
  if(fence){
   const code=[],mark=fence[1][0],len=fence[1].length;i++;
   while(i<lines.length&&!new RegExp('^\\s{0,3}'+mark+'{'+len+',}\\s*$').test(lines[i]))code.push(lines[i++]);
   if(i<lines.length)i++;const pre=document.createElement('pre'),c=document.createElement('code');c.textContent=code.join('\n');pre.append(c);root.append(pre);continue;
  }
  const h=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
  if(h){const el=document.createElement('h'+h[1].length);inline(h[2].replace(/\s+#+\s*$/,''),el);root.append(el);i++;continue;}
  if(/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)){root.append(document.createElement('hr'));i++;continue;}
  if(i+1<lines.length&&line.includes('|')&&divider(lines[i+1])){
   const headers=cells(line),table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
   for(const h of headers){const th=document.createElement('th');inline(h,th);tr.append(th);}thead.append(tr);table.append(thead);
   const tbody=document.createElement('tbody');i+=2;
   while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){
    const row=document.createElement('tr'),vals=cells(lines[i++]);
    for(let j=0;j<headers.length;j++){const td=document.createElement('td');inline(vals[j]||'',td);row.append(td);}tbody.append(row);
   }
   table.append(tbody);const wrap=document.createElement('div');wrap.className='md-table-scroll';wrap.append(table);root.append(wrap);continue;
  }
  if(/^\s{0,3}>\s?/.test(line)){
   const quote=[];while(i<lines.length&&/^\s{0,3}>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^\s{0,3}>\s?/,''));
   const el=document.createElement('blockquote');el.append(renderMarkdown(quote.join('\n')));root.append(el);continue;
  }
  if(listed(line)){
   const ordered=/^\s{0,3}\d+[.)]\s+/.test(line),list=document.createElement(ordered?'ol':'ul');
   while(i<lines.length&&listed(lines[i])&&(/^\s{0,3}\d+[.)]\s+/.test(lines[i])===ordered)){
    const li=document.createElement('li');inline(lines[i++].replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/,''),li);list.append(li);
   }
   root.append(list);continue;
  }
  const paragraph=[line];i++;
  while(i<lines.length&&lines[i].trim()&&!boundary(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&divider(lines[i+1]))){paragraph.push(lines[i++]);}
  const p=document.createElement('p');inline(paragraph.join('\n'),p);root.append(p);
 }
 return root;
}
