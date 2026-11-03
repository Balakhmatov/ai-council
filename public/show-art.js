// Local illustration atlases rendered as SVG images, independently of background CSS.
const STORY_ART_ORDER=['diner','heist','court','villains','spaceship','bunker','boardroom','detective','reality','time'];
const ART_VERSION='portraits2';
function illustration(file,cls,width,height,x,y,cellWidth,cellHeight){
 return '<svg xmlns="http://www.w3.org/2000/svg" class="'+cls+'" viewBox="'+[x,y,cellWidth,cellHeight].join(' ')+'" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display:block;position:static;width:100%;height:100%;overflow:hidden"><image href="./assets/'+file+'?v='+ART_VERSION+'" width="'+width+'" height="'+height+'"/></svg>';
}
export function scenePoster(id){
 if(id==='heist')return illustration('show-heist-poster.webp','cinema-poster-art cinema-poster-heist',1024,1536,0,0,1024,1536);
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 return illustration('show-posters.webp','cinema-poster-art',1536,1024,(index%5)*307.2,Math.floor(index/5)*512,307.2,512);
}
export function characterPortrait(id,slot){
 const safeSlot=Math.max(0,Math.min(6,slot));
 if(id==='heist')return illustration('show-heist-cast.webp','cinema-character-art cinema-character-heist',2172,724,safeSlot*2172/7,0,2172/7,724);
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 const group=index<2?'crime':index<6?'worlds':'stories';
 const row=index<2?index:index<6?index-2:index-6;
 const width=group==='crime'?1774:1659,height=group==='crime'?887:948,rows=group==='crime'?2:4;
 const castingOrder={court:[0,2,3,1,4,5,6],villains:[0,2,5,1,4,6,3],spaceship:[0,1,4,3,2,6,5]};
 const column=(castingOrder[id]||[0,1,2,3,4,5,6])[safeSlot];
 return illustration('show-cast-'+group+'.webp','cinema-character-art cinema-character-'+group,width,height,column*width/7,row*height/rows,width/7,height/rows);
}
