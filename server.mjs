import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const providers={openai:['https://api.openai.com/v1/chat/completions','OPENAI_API_KEY'],grok:['https://api.x.ai/v1/chat/completions','GROK_API_KEY'],mistral:['https://api.mistral.ai/v1/chat/completions','MISTRAL_API_KEY'],qwen:['https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions','QWEN_API_KEY'],deepseek:['https://api.deepseek.com/chat/completions','DEEPSEEK_API_KEY'],gemini:['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions','GEMINI_API_KEY'],claude:['https://api.anthropic.com/v1/messages','CLAUDE_API_KEY']};
export function createServer(){let active=0;
 const grokBase=process.env.XAI_BASE_URL||'https://api.x.ai/v1';
 if(!['https://api.x.ai/v1','https://ddtnew.com/v1'].includes(grokBase.replace(/\/$/,'')))throw Error('Invalid Grok base URL');
 const routes={...providers,grok:[grokBase.replace(/\/$/,'')+'/chat/completions','XAI_API_KEY']};const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);return http.createServer(async(req,res)=>{
 const origin=req.headers.origin;const expected=`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;const originOK=!origin||origin===expected||allowed.includes(origin);
 if(origin&&originOK){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(req.url==='/api/chat'){
  if(!originOK)return json(403,{error:{message:'Origin запрещён'}});
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST'});return res.end();}
  if(req.method!=='POST')return json(405,{error:{message:'Нужен POST'}});
  const token=process.env.PROXY_TOKEN;if(!token)return json(503,{error:{message:'Настройте PROXY_TOKEN на сервере'}});
  if(req.headers.authorization!==`Bearer ${token}`)return json(401,{error:{message:'Неверный токен сервера'}});
  if(active>=10)return json(429,{error:{message:'Сервер занят, повторите позже'}});
  let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>350000)return json(413,{error:{message:'Слишком большой запрос'}});}}catch{return json(400,{error:{message:'Ошибка чтения запроса'}});}
  let body;try{body=JSON.parse(raw);}catch{return json(400,{error:{message:'Неверный JSON'}});}
  const config=routes[body.provider];if(!config||typeof body.model!=='string'||!body.model.trim()||body.model.length>200||!Array.isArray(body.messages)||body.messages.length>30||!body.messages.length||body.messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))return json(400,{error:{message:'Некорректные provider, model или messages'}});
  const key=process.env[config[1]]||(body.provider==='grok'?process.env.GROK_API_KEY:'');if(!key)return json(503,{error:{message:`На сервере не настроен ${config[1]}`}});
  body.model=process.env[body.provider.toUpperCase()+'_MODEL']||body.model;
  active++;const controller=new AbortController();res.on('close',()=>controller.abort());
  try{let payload={model:body.model,messages:body.messages,max_tokens:1600};if(body.provider==='grok'&&body.model==='grok-4.7')payload.reasoning_effort='low';const headers={'Content-Type':'application/json',Authorization:`Bearer ${key}`};
   if(body.provider==='claude'){delete headers.Authorization;headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';payload={model:body.model,max_tokens:1600,system:body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:body.messages.filter(m=>m.role!=='system')};}
   const upstream=await fetch(config[0],{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(110000)])});
   if(!upstream.ok){await upstream.body?.cancel();return json(upstream.status,{error:{message:`Провайдер ${body.provider}: HTTP ${upstream.status}. Проверьте ключ, модель, квоту и регион API.`}});}
   const data=await upstream.json();const text=body.provider==='claude'?data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):data.choices?.[0]?.message?.content;
   if(typeof text!=='string'||!text.trim())return json(502,{error:{message:'Провайдер вернул пустой ответ'}});json(200,{text});
  }catch{if(!res.destroyed)json(502,{error:{message:'Провайдер недоступен или превышено время ожидания'}});}finally{active--;}return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 const path=req.url?.split('?')[0];const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/engine.js':'engine.js'};const file=files[path];if(!file){res.writeHead(404);return res.end('Not found');}
 try{const data=await readFile(new URL(`./public/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(500);res.end('Read error');}
 });}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||8787);createServer().listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Кворум: http://localhost:${port}`));}
