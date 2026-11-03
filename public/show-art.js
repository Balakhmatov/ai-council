// Generated artwork is served locally. Each regular atlas cell is its own illustration.
const STORY_ART_ORDER=['diner','heist','court','villains','spaceship','bunker','boardroom','detective','reality','time'];
export function scenePoster(id){
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 return '<span class="cinema-poster-art" style="--art-x:'+(index%5)*25+'%;--art-y:'+Math.floor(index/5)*100+'%" aria-hidden="true"></span>';
}
export function characterPortrait(id,slot){
 const index=Math.max(0,STORY_ART_ORDER.indexOf(id));
 const group=index<2?'crime':index<6?'worlds':'stories';
 const row=index<2?index:index<6?index-2:index-6;
 const rows=index<2?2:4;
 const castingOrder={court:[0,2,3,1,4,5,6],villains:[0,2,5,1,4,6,3],spaceship:[0,1,4,3,2,6,5]};
 const column=(castingOrder[id]||[0,1,2,3,4,5,6])[Math.max(0,Math.min(6,slot))];
 return '<span class="cinema-character-art cinema-character-'+group+'" style="--art-x:'+(column/6*100)+'%;--art-y:'+(row/(rows-1)*100)+'%" aria-hidden="true"></span>';
}
