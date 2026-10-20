'use strict';
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const Core=require('../replay-core.js');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function makePracticeCard('),html.indexOf('\nasync function loadDemo('));
const noop=()=>{};
const world={document:{createElement(){const card={routes:[],texts:[],fills:[]};let line=[];
 const g={fillRect(...rect){card.fills.push({color:g.fillStyle,rect});},beginPath(){line=[];},moveTo(x,y){line.push([x,y]);},lineTo(x,y){line.push([x,y]);},stroke(){if(g.lineWidth===100)card.routes.push(line);},quadraticCurveTo:noop,fill:noop,arc:noop,save:noop,restore:noop,translate:noop,rotate:noop,fillText(text,x,y){card.texts.push({text,x,y});}};
 return {getContext(){return g;},card};}}};
vm.createContext(world);vm.runInContext(source,world);
const front=world.makePracticeCard(false),back=world.makePracticeCard(true),W=front.width,H=front.height;
assert.equal(W,755);assert.equal(H,1055,'Match the official reference aspect ratio');
assert.equal(back.width,W);assert.equal(back.height,H);
assert.notEqual(front.card.fills[0].color,back.card.fills[0].color,'Distinguishable faces');
assert.equal(front.card.routes.length,3);assert.equal(back.card.routes.length,3);
const sequence=[front.card.routes[0],back.card.routes[0],front.card.routes[1],back.card.routes[1]];
assert.deepEqual(Array.from(sequence[0][0]),[W/2,H/2],'The actual boot position is inside the start clearing');
// Follow the entire authored route through the same canonical transform used
// by the renderer. Vertical crossings lead to the same physical edge, mirrored.
let i=0,j=0;
for(let n=0;n<sequence.length-1;n++) {
 const [x,y]=sequence[n][sequence[n].length-1],odd=Core.mod(j,2);
 const worldX=i*W+(odd?W-x:x),worldY=j*H+(odd?H-y:y);
 const dx=x===0?-1:x===W?1:0,dy=y===0?-1:y===H?1:0;
 assert(dx||dy,'A route leg reaches a physical edge');
 const nextX=worldX+dx*(odd?-1:1)*.001,nextY=worldY+dy*(odd?-1:1)*.001;
 i=Math.floor(nextX/W);j=Math.floor(nextY/H);
 const arrival=Core.canonical({x:worldX,y:worldY},i,j,W,H),expected=sequence[n+1][0];
 assert.equal(arrival.x,expected[0]);assert.equal(arrival.y,expected[1]);
 assert.equal(Core.face(i,j),(n+1)%2,'Each portal lands on the intended face');
}
for(const card of [front,back]){
 const main=card.card.routes[0],branch=card.card.routes[2];
 assert(main.some(([x,y])=>x===branch[0][0]&&y===branch[0][1]),'A small dead end branches off the walkable route');
 const words=card.card.texts.map(t=>t.text).join(' ');
 assert(words.split(/\s+/).length<65,'Hints remain short');
}
const words=back.card.texts.map(t=>t.text).join(' ');
assert(words.includes('official demo is free.')&&words.includes('onecardmaze.com/downloads'));
console.log('PASS: portrait reference dimensions, connected front/back maze with three real folds, centered start, exploratory branches and concise official-demo attribution');
// Walk the authored lesson through the real production state machine, including
// both suggested rotations. No collisions/rules or automatic routing are added.
const h=require('./app-harness.js')(),app=h.app,S=h.S;
app.loadDemo(true);
const tiles=[[0,0],[1,0],[1,1],[1,2]];
for(let n=0;n<sequence.length;n++)for(let k=1;k<sequence[n].length;k++) {
 const [i,j]=tiles[n],odd=Core.mod(j,2),[x,y]=sequence[n][k];
 app.tap({x:i*W+(odd?W-x:x),y:j*H+(odd?H-y:y)});
 for(let step=0;step<2000&&S.walker.tx!==null;step++)app.update(.025);
 assert.equal(S.walker.tx,null,'Every corridor waypoint is reachable');
 if(n===0&&k===7)app.spin(1);
 if(n===1&&k===5)app.spin(-1);
}
const events=app.replayModel().events;
assert.equal(events.filter(e=>e.type==='flip').length,3,'The lesson actually visits all three folded joins');
assert.equal(events.filter(e=>e.type==='spin').length,2,'Suggested rotations remain recorded for replay');
assert.equal(S.walker.x,1280);assert.equal(S.walker.y,2575);
console.log('PASS: full authored demo walk reaches the finish through three folds and two replayable rotations');
