import {telegramApi,telegramAdminIds} from '../telegram.mjs';
const env=process.env;
if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET||!env.TELEGRAM_APP_URL)throw Error('Configure TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_APP_URL first');
const app=new URL(env.TELEGRAM_APP_URL);if(app.protocol!=='https:')throw Error('HTTPS required');
const webhook=new URL('api/telegram/webhook',app.href.endsWith('/')?app.href:app.href+'/').href;
const me=await telegramApi(env.TELEGRAM_BOT_TOKEN,'getMe');
if(env.TELEGRAM_BOT_USERNAME&&me.username.toLowerCase()!==env.TELEGRAM_BOT_USERNAME.replace(/^@/,'').toLowerCase())throw Error('Bot username does not match configured bot');
const old=await telegramApi(env.TELEGRAM_BOT_TOKEN,'getWebhookInfo');
if(old.url&&old.url!==webhook)throw Error('This bot already has a different webhook; refusing to replace another application');
const commands=[{command:'start',description:'Открыть Кворум'},{command:'app',description:'Совет нейросетей'},{command:'help',description:'Как пользоваться'}];
await telegramApi(env.TELEGRAM_BOT_TOKEN,'setMyCommands',{commands});
await telegramApi(env.TELEGRAM_BOT_TOKEN,'setMyDescription',{description:'Кворум — совет нейросетей. Дайте задачу нескольким ИИ: они предложат идеи, проверят аргументы и соберут итог. Откройте приложение кнопкой ниже.'});
await telegramApi(env.TELEGRAM_BOT_TOKEN,'setMyShortDescription',{short_description:'Несколько нейросетей обсуждают вашу задачу и готовят общее решение.'});
await telegramApi(env.TELEGRAM_BOT_TOKEN,'setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть Кворум',web_app:{url:app.href}}});
for(const id of telegramAdminIds(env)){
 try{await telegramApi(env.TELEGRAM_BOT_TOKEN,'setMyCommands',{scope:{type:'chat',chat_id:Number(id)},commands:[...commands,{command:'admin',description:'Администрирование'}]});}
 catch{console.log('Owner-specific commands can be installed after the owner starts the bot.');}
}
await telegramApi(env.TELEGRAM_BOT_TOKEN,'setWebhook',{url:webhook,secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message'],max_connections:1});
const info=await telegramApi(env.TELEGRAM_BOT_TOKEN,'getWebhookInfo');if(info.url!==webhook)throw Error('Webhook verification failed');
console.log(JSON.stringify({bot:'@'+me.username,url:'https://t.me/'+me.username,app:app.href,webhookConfigured:true,pendingUpdates:info.pending_update_count}));
