'use strict';
const assert=require('assert').strict,fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function makePracticeCard('),html.indexOf('\nasync function loadDemo('));
const cards=[];
const world={document:{createElement(){const card={lines:[],texts:[],fills:[]};let line;
 const g={fillRect(...rect){card.fills.push({color:g.fillStyle,rect});},strokeRect(){},beginPath(){line=[];card.lines.push(line);},moveTo(x,y){line.push([x,y]);},lineTo(x,y){line.push([x,y]);},stroke(){},fillText(text,x,y){card.texts.push({text,x,y});}};
 const canvas={getContext(){return g;},card};cards.push(canvas);return canvas;}}};
vm.createContext(world);vm.runInContext(source,world);
const front=world.makePracticeCard(false),back=world.makePracticeCard(true);
assert.equal(front.width,back.width);assert.equal(front.height,back.height);
assert.notEqual(front.card.fills[0].color,back.card.fills[0].color,'The physical faces remain distinguishable');
// Exits are actual open channels centered at all four boundaries, whose
// two endpoints continue onto the reverse face even under the vertical fold.
function endpoints(card){return card.lines.flatMap(line=>[line[0],line[line.length-1]]);}
for(const [a,b] of [[front,back],[back,front]])for(const [x,y] of endpoints(a.card)) {
 const W=a.width,H=a.height;
 const transformed=x===0?[W,y]:x===W?[0,y]:y===0?[W-x,H]:[W-x,0];
 assert(endpoints(b.card).some(([bx,by])=>bx===transformed[0]&&by===transformed[1]),'Exit walls align through the real folding transform');
}
const frontWords=front.card.texts.map(t=>t.text).join(' '),backWords=back.card.texts.map(t=>t.text).join(' ');
assert(frontWords.includes('9 views.')&&frontWords.includes('Still one card.'));
assert(frontWords.includes('matching')&&frontWords.includes('copies, too.'));
assert(backWords.includes('Q / E')&&backWords.includes('Then Replay.'));
assert(backWords.includes('official demo is free.')&&backWords.includes('onecardmaze.com/downloads'));
for(const card of [front,back])for(const t of card.card.texts)assert(t.x>=0&&t.x<card.width&&t.y>0&&t.y<=card.height,'Hints stay inside the card');
console.log('PASS: distinct two-sided practice artwork, fold-aligned exits, concise nine-view / trace guidance, free official demo attribution');
