export async function getTelegramContext(){
 const launched=location.hash.includes('tgWebAppData=')||!!window.Telegram?.WebApp?.initData;
 if(!launched)return null;
 for(let i=0;i<30&&!window.Telegram?.WebApp?.initData;i++)await new Promise(resolve=>setTimeout(resolve,100));
 const app=window.Telegram?.WebApp;if(!app?.initData)throw Error('Не удалось загрузить Telegram. Откройте Mini App заново.');
 app.ready();app.expand();
 if(app.isVersionAtLeast?.('6.1')){app.setHeaderColor('#151916');app.setBackgroundColor('#151916');}
 const safeArea=()=>{const inset=app.contentSafeAreaInset||{};for(const side of ['top','right','bottom','left'])document.documentElement.style.setProperty(`--tg-safe-${side}`,`${Math.max(0,Number(inset[side])||0)}px`);};
 safeArea();app.onEvent?.('contentSafeAreaChanged',safeArea);document.documentElement.classList.add('telegram-app');
 return {initData:app.initData,app};
}
