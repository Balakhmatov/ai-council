const key='quorum-session';
export function loadRememberedSession(storage,now=Date.now()){
 try{
  const value=JSON.parse(storage.getItem(key)||storage.getItem('quorum-email-session')||'null');
  return value&&value.expires>now?value:null;
 }catch{return null;}
}
export function rememberSession(storage,identity){
 try{storage.setItem(key,JSON.stringify(identity));storage.removeItem('quorum-email-session');}catch{}
}
export function forgetSession(storage){
 try{storage.removeItem(key);storage.removeItem('quorum-email-session');}catch{}
}
