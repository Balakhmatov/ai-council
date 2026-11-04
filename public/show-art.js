// Local illustration atlases rendered as SVG images, independently of background CSS.
const STORY_ART_ORDER=['diner','heist','court','villains','spaceship','bunker','boardroom','detective','reality','time'];
const ART_VERSION='crossovers1';
const CROSSOVER_ATLASES={time:'show-time-cast.webp',reality:'show-reality-cast.webp',anime:'show-anime-cast.webp',kombat:'show-kombat-cast.webp'};
const COMIC_PORTRAITS=[['joker',256,389,72,112,130,173],['thanos',240,414,88,35,89,119],['doom',256,389,61,108,103,137],['loki',256,389,59,164,128,171],['harley',256,389,75,190,103,137],['luthor',203,475,17,0,169,225],['magneto',257,399,113,46,65,87]];
function illustration(file,cls,width,height,x,y,cellWidth,cellHeight,align='xMidYMid slice'){
 return '<svg xmlns="http://www.w3.org/2000/svg" class="'+cls+'" viewBox="'+[x,y,cellWidth,cellHeight].join(' ')+'" preserveAspectRatio="'+align+'" aria-hidden="true" style="display:block;position:static;width:100%;height:100%;overflow:hidden"><image href="./assets/'+file+'?v='+ART_VERSION+'" width="'+width+'" height="'+height+'"/></svg>';
}
export function scenePoster(id){
 if(CROSSOVER_ATLASES[id])return illustration(CROSSOVER_ATLASES[id],'cinema-poster-art cinema-poster-'+id,1536,1024,0,0,384,512);
 if(id==='villains')return illustration('show-villains-poster.webp','cinema-poster-art cinema-poster-villains',1024,1536,0,0,1024,1536);
 if(id==='heist')return illustration('show-heist-poster.webp','cinema-poster-art cinema-poster-heist',1024,1536,0,0,1024,1536);
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 return illustration('show-posters.webp','cinema-poster-art',1536,1024,(index%5)*307.2,Math.floor(index/5)*512,307.2,512);
}
export function characterPortrait(id,slot){
 const safeSlot=Math.max(0,Math.min(6,slot));
 if(CROSSOVER_ATLASES[id]){const cell=safeSlot+1;return illustration(CROSSOVER_ATLASES[id],'cinema-character-art cinema-character-'+id,1536,1024,(cell%4)*384,Math.floor(cell/4)*512,384,512);}
 if(id==='villains'){const [name,width,height,x,y,w,h]=COMIC_PORTRAITS[safeSlot];return illustration('show-comic-'+name+'.webp','cinema-character-art cinema-character-comic',width,height,x,y,w,h,'xMidYMin slice');}
 if(id==='heist')return illustration('show-heist-cast.webp','cinema-character-art cinema-character-heist',2172,724,safeSlot*2172/7,0,2172/7,724);
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 const group=index<2?'crime':index<6?'worlds':'stories';
 const row=index<2?index:index<6?index-2:index-6;
 const width=group==='crime'?1774:1659,height=group==='crime'?887:948,rows=group==='crime'?2:4;
 const castingOrder={court:[0,2,3,1,4,5,6],villains:[0,2,5,1,4,6,3],spaceship:[0,1,4,3,2,6,5]};
 const column=(castingOrder[id]||[0,1,2,3,4,5,6])[safeSlot];
 return illustration('show-cast-'+group+'.webp','cinema-character-art cinema-character-'+group,width,height,column*width/7,row*height/rows,width/7,height/rows);
}
