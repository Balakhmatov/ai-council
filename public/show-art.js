// Local illustration atlases rendered as SVG images, independently of background CSS.
const STORY_ART_ORDER=['diner','heist','court','villains','spaceship','bunker','boardroom','detective','reality','time'];
const ART_VERSION='grounded1';
const CROSSOVER_ATLASES={time:'show-time-cast.webp',reality:'show-reality-cast.webp',anime:'show-anime-cast.webp',kombat:'show-kombat-cast.webp',afterlife:'show-afterlife-cast.webp',olympus:'show-olympus-cast.webp'};
const COMIC_PORTRAITS=[['joker',256,389,72,112,130,173],['thanos',240,414,88,35,89,119],['doom',256,389,61,108,103,137],['loki',256,389,59,164,128,171],['harley',256,389,75,190,103,137],['luthor',203,475,17,0,169,225],['magneto',257,399,113,46,65,87]];
function illustration(file,cls,width,height,x,y,cellWidth,cellHeight,align='xMidYMid slice'){
 return '<svg xmlns="http://www.w3.org/2000/svg" class="'+cls+'" viewBox="'+[x,y,cellWidth,cellHeight].join(' ')+'" preserveAspectRatio="'+align+'" aria-hidden="true" style="display:block;position:static;width:100%;height:100%;overflow:hidden"><image href="./assets/'+file+'?v='+ART_VERSION+'" width="'+width+'" height="'+height+'"/></svg>';
}
export function scenePoster(id){
 if(!STORY_ART_ORDER.includes(id)&&!CROSSOVER_ATLASES[id])id='diner';
 const positions=[[300,-15,300,450],[0,-20,250,380],[650,-20,250,380],[70,225,235,352],[595,225,235,352],[275,285,175,263],[450,285,175,263]];
 const order=[1,2,0,3,4,5,6];
 const faces=order.map(i=>{const [x,y,w,h]=positions[i];return '<svg data-poster-slot="'+i+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" style="overflow:hidden">'+characterPortrait(id,i)+'</svg>';}).join('');
 const shade='poster-shade-'+id;
 return '<svg xmlns="http://www.w3.org/2000/svg" class="cinema-poster-art cinema-ensemble-poster cinema-poster-'+id+'" viewBox="0 0 900 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display:block;width:100%;height:100%;overflow:hidden"><defs><linearGradient id="'+shade+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080709" stop-opacity=".12"/><stop offset=".65" stop-color="#080709" stop-opacity="0"/><stop offset="1" stop-color="#080709" stop-opacity=".85"/></linearGradient></defs><rect width="900" height="540" fill="#151018"/>'+faces+'<rect width="900" height="540" fill="url(#'+shade+')"/></svg>';
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
