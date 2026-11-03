// Original inline vector illustrations for all ten Quorum Show scenes.
const art={
  "diner": "<rect x=\"15\" y=\"20\" width=\"290\" height=\"130\" fill=\"#251e31\"/><rect x=\"28\" y=\"30\" width=\"263\" height=\"74\" fill=\"#40405a\"/><path d=\"M115 31v75m90-75v75\" stroke=\"#d3a58a\" stroke-width=\"5\"/><path d=\"M42 47l-10 31m38-30-11 35m114-35-10 31m80-32-11 35\" stroke=\"#9ca9c4\" stroke-width=\"2\"/><rect x=\"22\" y=\"108\" width=\"277\" height=\"41\" fill=\"#773e4f\"/><ellipse cx=\"159\" cy=\"124\" rx=\"103\" ry=\"16\" fill=\"#ad7465\"/><circle cx=\"112\" cy=\"87\" r=\"16\" fill=\"#201923\"/><circle cx=\"213\" cy=\"87\" r=\"16\" fill=\"#201923\"/><path d=\"M96 105h33v33H96zm100 0h33v33h-33z\" fill=\"#201923\"/><path d=\"M148 116h22v13h-22z\" fill=\"#fff0df\"/><path d=\"M159 22v22m-25 0h50l-10 17h-30z\" fill=\"#f4a75a\" stroke=\"#c58a60\" stroke-width=\"3\"/>",
  "heist": "<rect x=\"16\" y=\"22\" width=\"288\" height=\"120\" fill=\"#1e2a38\"/><rect x=\"99\" y=\"33\" width=\"124\" height=\"97\" fill=\"#3b4453\"/><path d=\"M44 39l224 95M277 39 46 128M83 34l145 103\" stroke=\"#e86a75\" stroke-width=\"2\"/><rect x=\"124\" y=\"91\" width=\"73\" height=\"39\" rx=\"4\" fill=\"#396274\" stroke=\"#9bbdcb\" stroke-width=\"3\"/><path d=\"m160 83 17 12-17 20-17-20z\" fill=\"#8de9ff\" stroke=\"#f4ffff\" stroke-width=\"2\"/><circle cx=\"62\" cy=\"86\" r=\"15\" fill=\"#171b25\"/><path d=\"M42 105h39l7 32H35z\" fill=\"#171b25\"/><circle cx=\"252\" cy=\"86\" r=\"15\" fill=\"#171b25\"/><path d=\"M232 105h39l8 32h-56z\" fill=\"#171b25\"/>",
  "court": "<rect x=\"15\" y=\"20\" width=\"290\" height=\"130\" fill=\"#28374c\"/><path d=\"M35 35h250v11H35zm20 11v75m45-75v75m119-75v75m46-75v75\" stroke=\"#a7b6c4\" stroke-width=\"8\"/><path d=\"M24 125h272v20H24z\" fill=\"#45536b\"/><path d=\"M92 105h136v22H92z\" fill=\"#b89076\"/><circle cx=\"160\" cy=\"88\" r=\"16\" fill=\"#181d2e\"/><path d=\"M138 100h44v26h-44z\" fill=\"#181d2e\"/><path d=\"M160 24v41m-31-28h62m-63 0-12 24h24zm64 0-12 24h24z\" fill=\"none\" stroke=\"#f1ce92\" stroke-width=\"3\"/>",
  "villains": "<circle cx=\"245\" cy=\"47\" r=\"35\" fill=\"#cb5b9c\"/><path d=\"M21 123V70h25v53m6 0V45h34v78m8 0V75h28v48m8 0V29h33v94m11 0V60h28v63m8 0V47h30v76m8 0V81h32v42\" fill=\"#211c3e\"/><ellipse cx=\"162\" cy=\"133\" rx=\"107\" ry=\"21\" fill=\"#543764\"/><circle cx=\"97\" cy=\"104\" r=\"15\" fill=\"#151128\"/><circle cx=\"163\" cy=\"92\" r=\"18\" fill=\"#151128\"/><circle cx=\"228\" cy=\"104\" r=\"15\" fill=\"#151128\"/><path d=\"M79 123h37v23H79zm60-13h48v36h-48zm70 13h37v23h-37z\" fill=\"#151128\"/>",
  "spaceship": "<rect x=\"15\" y=\"15\" width=\"290\" height=\"130\" rx=\"20\" fill=\"#1c304c\"/><rect x=\"36\" y=\"28\" width=\"248\" height=\"82\" rx=\"10\" fill=\"#0b1934\"/><circle cx=\"233\" cy=\"61\" r=\"23\" fill=\"#498fc7\"/><path d=\"m217 60 32-13m-24 32 32-18\" stroke=\"#a2ddf5\" stroke-width=\"2\"/><g fill=\"#eef9ff\"><circle cx=\"70\" cy=\"49\" r=\"2\"/><circle cx=\"108\" cy=\"81\" r=\"2\"/><circle cx=\"166\" cy=\"44\" r=\"2\"/><circle cx=\"265\" cy=\"91\" r=\"2\"/></g><path d=\"M45 112h230v12H45zM83 126h156l10 22H71z\" fill=\"#59718c\"/><path d=\"M113 128h38v9h-38zm60 0h35v9h-35z\" fill=\"#8ae8ec\"/>",
  "bunker": "<rect x=\"15\" y=\"15\" width=\"290\" height=\"132\" fill=\"#394037\"/><path d=\"M28 30h264M28 131h264\" stroke=\"#7b8d76\" stroke-width=\"8\"/><rect x=\"96\" y=\"25\" width=\"127\" height=\"113\" rx=\"11\" fill=\"#656d63\" stroke=\"#afbaa7\" stroke-width=\"5\"/><circle cx=\"159\" cy=\"81\" r=\"44\" fill=\"#39443c\" stroke=\"#9ea79d\" stroke-width=\"6\"/><circle cx=\"159\" cy=\"81\" r=\"19\" fill=\"#1b2b28\" stroke=\"#c4cebb\" stroke-width=\"5\"/><path d=\"M139 81h40m-20-20v40\" stroke=\"#d5dccc\" stroke-width=\"6\"/><path d=\"M37 37h34L40 100h-8zm218 0h33l-30 63h-8z\" fill=\"#c9a35a\"/><circle cx=\"263\" cy=\"117\" r=\"9\" fill=\"#d9684d\"/>",
  "boardroom": "<rect x=\"15\" y=\"17\" width=\"290\" height=\"128\" fill=\"#303743\"/><rect x=\"28\" y=\"26\" width=\"265\" height=\"84\" fill=\"#576b7b\"/><path d=\"M34 106V63h20v43m9 0V46h26v60m8 0V58h25v48m25 0V35h30v71m11 0V68h25v38m10 0V54h27v52\" fill=\"#374b5e\"/><path d=\"M159 26v84\" stroke=\"#b9c4ca\" stroke-width=\"4\"/><ellipse cx=\"162\" cy=\"124\" rx=\"108\" ry=\"19\" fill=\"#c59d84\"/><circle cx=\"74\" cy=\"104\" r=\"13\" fill=\"#252a30\"/><circle cx=\"249\" cy=\"104\" r=\"13\" fill=\"#252a30\"/><circle cx=\"158\" cy=\"89\" r=\"15\" fill=\"#252a30\"/><path d=\"M139 105h37l10 26h-57z\" fill=\"#252a30\"/><path d=\"M108 119h30l5 8h-40zm77 0h29l5 8h-40z\" fill=\"#f4dfbe\"/>",
  "detective": "<rect x=\"15\" y=\"15\" width=\"290\" height=\"131\" fill=\"#26364b\"/><path d=\"M26 28h268v113H26z\" fill=\"#405064\"/><rect x=\"104\" y=\"40\" width=\"112\" height=\"100\" fill=\"#654f4b\" stroke=\"#b89c82\" stroke-width=\"6\"/><rect x=\"119\" y=\"53\" width=\"81\" height=\"80\" fill=\"#3b323c\"/><circle cx=\"185\" cy=\"91\" r=\"5\" fill=\"#e3bb79\"/><rect x=\"38\" y=\"49\" width=\"50\" height=\"61\" fill=\"#1e3243\" stroke=\"#adaba7\" stroke-width=\"5\"/><rect x=\"231\" y=\"49\" width=\"48\" height=\"61\" fill=\"#1e3243\" stroke=\"#adaba7\" stroke-width=\"5\"/><circle cx=\"160\" cy=\"32\" r=\"14\" fill=\"#f4d5a5\" stroke=\"#a08b70\" stroke-width=\"2\"/><path d=\"M160 23v11l7 4\" fill=\"none\" stroke=\"#463b42\" stroke-width=\"2\"/>",
  "reality": "<rect x=\"15\" y=\"15\" width=\"290\" height=\"130\" rx=\"10\" fill=\"#29183d\"/><path d=\"m22 24 107 112m165-112-107 112\" stroke=\"#e35da8\" stroke-width=\"13\" opacity=\".6\"/><path d=\"m47 20 77 115m151-115-77 115\" stroke=\"#70d7ed\" stroke-width=\"8\" opacity=\".6\"/><ellipse cx=\"163\" cy=\"132\" rx=\"105\" ry=\"25\" fill=\"#8649b4\"/><rect x=\"142\" y=\"63\" width=\"40\" height=\"57\" rx=\"6\" fill=\"#4e3560\" stroke=\"#d79def\" stroke-width=\"4\"/><circle cx=\"162\" cy=\"48\" r=\"17\" fill=\"#1b192c\"/><path d=\"M138 67h47v32h-47z\" fill=\"#1b192c\"/><circle cx=\"91\" cy=\"92\" r=\"14\" fill=\"#23152d\"/><circle cx=\"234\" cy=\"92\" r=\"14\" fill=\"#23152d\"/>",
  "time": "<rect x=\"15\" y=\"16\" width=\"290\" height=\"129\" fill=\"#44315e\"/><circle cx=\"160\" cy=\"81\" r=\"59\" fill=\"#283555\" stroke=\"#bb9ef0\" stroke-width=\"8\"/><circle cx=\"160\" cy=\"81\" r=\"43\" fill=\"#52648a\" stroke=\"#f6d7ae\" stroke-width=\"4\"/><path d=\"M160 34v94m-44-47h88\" stroke=\"#c7d2ec\" opacity=\".5\" stroke-width=\"2\"/><path d=\"M139 51h42l-15 30 15 32h-42l15-32z\" fill=\"#f6d5a0\" stroke=\"#fff0d0\" stroke-width=\"3\"/><path d=\"m145 60 15 18 15-18zm4 44 11-14 11 14z\" fill=\"#b36b8a\"/><circle cx=\"45\" cy=\"48\" r=\"3\" fill=\"#ffd88a\"/><circle cx=\"268\" cy=\"112\" r=\"3\" fill=\"#c8b6ff\"/>"
};
const colors={
  "diner": [
    "#542437",
    "#c56762"
  ],
  "heist": [
    "#2f3240",
    "#be9958"
  ],
  "court": [
    "#2f5061",
    "#819db4"
  ],
  "villains": [
    "#42205f",
    "#c958a5"
  ],
  "spaceship": [
    "#10274b",
    "#5789ca"
  ],
  "bunker": [
    "#3d4435",
    "#b69563"
  ],
  "boardroom": [
    "#30343f",
    "#79848d"
  ],
  "detective": [
    "#1c3048",
    "#6f8f9d"
  ],
  "reality": [
    "#452061",
    "#d75ba5"
  ],
  "time": [
    "#42295d",
    "#c18fac"
  ]
};
export function scenePoster(id){
 const key=Object.hasOwn(art,id)?id:'diner';
 const [a,b]=colors[key];
 return '<svg xmlns="http://www.w3.org/2000/svg" class="show-poster-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'+
 '<defs><linearGradient id="bg-'+key+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient></defs>'+
 '<rect width="320" height="160" fill="url(#bg-'+key+')"/>'+art[key]+'</svg>';
}
