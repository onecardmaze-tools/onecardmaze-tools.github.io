'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('../replay-core.js');
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-6, message || `${a} != ${b}`);
const p = (x, y, r = 0) => ({ x, y, r });
// Exact seams, negative tiles, corners, touching/returning, and repeat visits.
let route = [p(50, 50), p(100, 50), p(150, 50), p(100, 50), p(50, 50)];
let model = core.build(route, [], 100, 100, 0);
assert.equal(model.events.length, 2);
assert.deepEqual(model.events.map(e => [e.fromFace, e.toFace]), [[0, 1], [1, 0]]);
assert.equal(core.build([p(50,50),p(100,50),p(50,50)], [], 100,100,0).events.length, 0);
assert.equal(core.build([p(-50,-50),p(50,50),p(150,150)], [], 100,100,0).events.length, 2);
assert(core.build([p(50,50),p(150,150)], [],100,100,0).events.every(e => e.axes.length === 2));
assert.equal(core.build([p(50,50),p(100,50)],[],100,100,0).events.length,1,'Arrival on positive seam changes face');
assert.equal(core.build([p(100,50),p(50,50)],[],100,100,0).events.length,1,'Leaving negative seam changes face');
assert.equal(core.build([p(100,50),p(150,50)],[],100,100,0).events.length,0,'Starting on seam does not imply a flip');
for(let k=1;k<=100;k++) {
  const a=p(k*17%800-400,k*43%600-300),b=p(k*61%800-400,k*19%600-300);
  const ps=core.pieces(a,b,100,100);
  near(ps.reduce((d,s)=>d+Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),0),Math.hypot(b.x-a.x,b.y-a.y),'Fold mapping preserves segment distance');
  for(const s of ps) for(const v of [s.a,s.b]) assert(v.x>=-1e-6&&v.x<=100+1e-6&&v.y>=-1e-6&&v.y<=100+1e-6);
}
let pieces = core.pieces(p(50,50),p(150,50),100,100);
assert.equal(pieces.length,2); assert.equal(pieces[0].b.x,100); assert.equal(pieces[1].a.x,0);
pieces = core.pieces(p(-50,-50),p(50,50),100,100);
assert.equal(pieces.length,2); assert.deepEqual(pieces[0].b,{x:0,y:0}); assert.deepEqual(pieces[1].a,{x:0,y:0});
const coarse = core.build([p(0,0),p(100,0)], [],1000,1000,0);
const dense = core.build(Array.from({length:101},(_,i)=>p(i,0)), [],1000,1000,0);
near(core.distanceAt(coarse,core.advance(coarse,0,33)),33);
near(core.distanceAt(dense,core.advance(dense,0,33)),33);
near(core.distanceAt(dense,core.advance(dense,100,-33)),67);
assert.equal(core.turn(0,3),-1); assert.equal(core.turn(3,0),1);

// Run the actual app's state machine with inert browser/graphics adapters.
// This checks production logic without requiring a network or altering the UI.
const noop = () => {};
const context2d = new Proxy({ measureText: () => ({width:20}), getImageData:()=>({data:new Uint8ClampedArray(4)}) },
  { get:(t,k)=>k in t?t[k]:noop });
const gl = new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,
  getUniformLocation:()=>({}),createTexture:()=>({}),createBuffer:()=>({}),createProgram:()=>({}),createShader:()=>({})},
  {get:(t,k)=>k in t?t[k]:(k.toUpperCase()===k?1:noop)});
const elements = new Map();
function element(id) {
  if (elements.has(id)) return elements.get(id);
  const e = {id,style:{setProperty:noop},classList:{toggle:noop,add:noop,remove:noop},
    addEventListener:noop,setAttribute:noop,replaceChildren:noop,appendChild:noop,add:noop,
    querySelector:s=>element(id+s),getContext:t=>t==='2d'?context2d:gl,
    getBoundingClientRect:()=>({left:0,top:0,width:1200,height:900}),width:100,height:100};
  elements.set(id,e); return e;
}
const listeners = {};
const sandbox = { console, ReplayCore:core, TraceRenderer:require('../trace-renderer.js'), document:{getElementById:element,createElement:element,
  body:element('body'),querySelector:s=>element(s)},
  innerWidth:1200,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{listeners[name]=fn;},
  requestAnimationFrame:noop,performance:{now:()=>0},setTimeout:noop,clearTimeout:noop,
  URLSearchParams,URL,location:{search:''},Float32Array,Uint8ClampedArray,
  Option:function(text,value){this.text=text;this.value=value;},Path2D:function(){this.moveTo=noop;this.lineTo=noop;}};
sandbox.window=sandbox;
vm.createContext(sandbox);
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
vm.runInContext(script,sandbox);
const app=sandbox.OCM; assert(app,'App initialized');
const S=app.S;
app.applyImages({width:100,height:100},{width:100,height:100});
function fixture() {
  app.clearWalk(); S.ready=true; S.started=true; S.rot=S.rotTarget=0; S.rotQ0=0;
  S.trail=[p(50,50),p(90,50),p(110,50),p(140,65),p(150,90,1),p(150,110,1),p(165,155,1)];
  S.spins=[{i:3,q:1},{i:6,q:3}]; S.cursor=6; S.replayVersion++; S.replaySpeed=4;
  app.refreshTrace(); app.setCursor(6); S.rot=S.rotTarget;
}
function finish(dir) {
  const seen=[]; let prev=null;
  app.play(dir);
  for(let k=0;k<1000 && S.play;k++) {
    app.update(.02);
    if(S.phase && S.phase.event.id!==prev) {seen.push(S.phase.event.id);prev=S.phase.event.id;}
  }
  assert.equal(S.play,0,'Replay must terminate'); assert(S.reviewDone);
  return seen;
}
fixture(); const original=JSON.stringify({trail:S.trail,spins:S.spins});
assert.deepEqual(finish(1),[0,1,2,3]); near(S.cursor,6); near(app.orientationAt(6),3);
assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),original);
assert.deepEqual(finish(-1),[3,2,1,0]); near(S.cursor,0); near(S.rotTarget%(Math.PI*2),0);
assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),original);
for(const pos of [5.5,1.2,6,0,3,0,6]) app.setCursor(pos);
near(app.orientationAt(S.cursor),3);
assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),original,'Scrubbing preserves recording');
// Replay spins keep the card centre stationary through arrival, turn, and settle.
fixture(); app.play(1);
let pivot=null,checked=0,playerArc=0;
for(let k=0;k<1000 && S.play;k++) {
  app.update(.01);
  if(S.phase && S.phase.event.type==='spin') {
    const centre=app.cardCenter(),pos=app.w2s(centre.x,centre.y),player=app.w2s(S.walker.x,S.walker.y);
    if(!pivot) pivot={id:S.phase.event.id,x:pos.x,y:pos.y,player};
    if(pivot.id!==S.phase.event.id) pivot={id:S.phase.event.id,x:pos.x,y:pos.y,player};
    near(pos.x,pivot.x,'Card x pivot stable');near(pos.y,pivot.y,'Card y pivot stable');
    playerArc=Math.max(playerArc,Math.hypot(player.x-pivot.player.x,player.y-pivot.player.y));checked++;
  }
}
assert(checked>20);assert(playerArc>5,"Off-centre player travels with the rotating card");
// Completing a spin does not trigger a second recenter move.
fixture();app.play(1);let lastSpin=null;
for(let k=0;k<1500;k++) {
 app.update(.01);
 if(S.phase&&S.phase.event.type==='spin')lastSpin=S.phase;
 else if(lastSpin){app.play(1);break;}
}
assert(lastSpin);const settled={x:S.cam.x,y:S.cam.y};
for(let k=0;k<100;k++)app.update(.01);
near(S.cam.x,settled.x,'No horizontal recenter after spin');near(S.cam.y,settled.y,'No vertical recenter after spin');
// Manual turns use the physical card centre even in a panned view and leave it there.
fixture();app.clearWalk();S.started=true;S.anchor={i:0,j:0};S.cam={x:20,y:40};S.follow=false;
S.walker={x:70,y:20,tx:null,ty:null};S.trail=[p(70,20)];S.rot=S.rotTarget=0;S.rotQ0=0;
const centerBefore=app.w2s(50,50);app.spin(1);
for(let k=0;k<120;k++){app.update(.01);const at=app.w2s(50,50);near(at.x,centerBefore.x);near(at.y,centerBefore.y);}
assert(!S.manualPivot);assert(!S.follow);
// Flip camera moves are slower than the former exponential jump and finish exactly.
fixture();app.play(1);let flip=null,lastCamera=null,maxFraction=0;
for(let k=0;k<1500;k++) {
 app.update(.01);
 if(S.phase&&S.phase.event.type==='flip') {
  flip=S.phase;
  if(lastCamera){const total=Math.hypot(flip.toCam.x-flip.fromCam.x,flip.toCam.y-flip.fromCam.y);
   maxFraction=Math.max(maxFraction,Math.hypot(S.cam.x-lastCamera.x,S.cam.y-lastCamera.y)/(total||1));}
  lastCamera={x:S.cam.x,y:S.cam.y};
 } else if(flip)break;
}
assert(flip);assert(maxFraction<.02,'No large camera jump in a 10ms frame');
near(S.cam.x,flip.toCam.x);near(S.cam.y,flip.toCam.y);
// Pausing a flip freezes the camera as well as the walker and event clock.
fixture();app.play(1);
for(let k=0;k<1500;k++){app.update(.01);if(S.phase&&S.phase.event.type==='flip'&&S.phase.elapsed>.65)break;}
assert(S.phase);const held=S.phase,holdCam={x:S.cam.x,y:S.cam.y},holdTime=S.phase.elapsed;
app.play(1);for(let k=0;k<30;k++)app.update(.01);
assert.strictEqual(S.phase,held);near(S.phase.elapsed,holdTime);near(S.cam.x,holdCam.x);near(S.cam.y,holdCam.y);
app.play(1);app.update(.02);assert(S.phase.elapsed>holdTime);
// Focus hierarchy: current > approaching side > ordinary sides > corners.
fixture();app.clearWalk();S.anchor={i:0,j:0};S.started=true;S.walker={x:50,y:50,tx:null,ty:null};
near(app.cardLight(0,0),1);near(app.cardLight(1,0),app.CFG.nbDimMin);near(app.cardLight(1,1),app.CFG.cornerDim);
S.walker.x=99;const right=app.cardLight(1,0);
assert(right>.75&&right<1);near(app.cardLight(-1,0),app.CFG.nbDimMin);
assert(app.cardLight(1,1)<app.cardLight(1,0));
S.anchor={i:-2,j:-3};S.walker={x:-101,y:-250,tx:null,ty:null};
near(app.cardLight(-2,-3),1);assert(app.cardLight(-1,-3)>.75);
// Pausing mid-spin freezes the phase; same-direction resume continues that phase.
fixture();app.play(1);
for(let k=0;k<1000;k++){app.update(.01);if(S.phase && S.phase.event.type==='spin' && S.phase.elapsed>.45)break;}
assert(S.phase);
// Arrival reports the displayed card orientation, not the eventual target.
fixture();app.play(-1);
for(let k=0;k<1000;k++){app.update(.01);if(S.phase && S.phase.event.type==='spin' && S.phase.elapsed>.02)break;}
const fold=Math.floor(S.walker.y/S.H)%2?2:0;
const expectedArrow=['↑','→','↓','←'][(S.phase.event.toQ+fold)%4];
assert(elements.get('replayFace').textContent.endsWith(expectedArrow));
fixture();app.play(1);
for(let k=0;k<1000;k++){app.update(.01);if(S.phase && S.phase.event.type==='spin' && S.phase.elapsed>.45)break;}
assert(S.phase);const paused=S.phase,elapsed=paused.elapsed,rotation=S.rot;
app.play(1);assert.equal(S.play,0);app.update(.05);
assert.strictEqual(S.phase,paused);near(S.phase.elapsed,elapsed);near(S.rot,rotation);
app.play(1);assert.strictEqual(S.phase,paused);app.update(.02);assert(S.phase.elapsed>elapsed);
// Free-form markers do not move the walker or mutate recordings, and repeat on all matching copies.
fixture();app.seekEvent(1);const beforeNote=JSON.stringify({trail:S.trail,spins:S.spins});
elements.get('markerShape').value='star';elements.get('markerColor').value='#ff0055';elements.get('markerLabel').value='Anywhere';
S.placingMarker=true;app.tap({x:170,y:70});assert.equal(S.markers.length,1);
assert.equal(S.markers[0].face,1);near(S.markers[0].u,.7);near(S.markers[0].v,.7);
assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),beforeNote);
S.cards.clear();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)S.cards.set(i+','+j,{i,j,amt:1});
for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
  S.rot=rotation;const copies=app.markerCopies(S.markers[0]);assert.equal(copies.length,4);
  for(const copy of copies){const w=app.s2w(copy.x,copy.y),l=core.canonical(w,copy.i,copy.j,S.W,S.H);near(l.x/S.W,.7);near(l.y/S.H,.7);}
}
app.clearWalk();assert.equal(S.markers.length,1,'Route reset preserves markers');
// Collinear animation frames collapse to endpoints, while command boundaries, turns and spins remain.
fixture();app.clearWalk();S.rot=S.rotTarget=0;S.rotQ0=0;S.started=true;
S.walker={x:10,y:10,tx:null,ty:null};S.trail=[p(10,10)];app.tap({x:350,y:10});
for(let k=0;k<1000&&S.walker.tx!==null;k++)app.update(.01);
assert.equal(S.trail.length,2,'One long click needs only two retained points');near(S.trail[1].x,350);near(S.travelled,340);
assert.equal(app.replayModel().events.length,3,'Compact segment preserves every crossed edge');
app.tap({x:450,y:10});for(let k=0;k<1000&&S.walker.tx!==null;k++)app.update(.01);
assert.equal(S.trail.length,3,'Next command preserves previous endpoint');near(S.trail[1].x,350);
app.spin(1);const spinIndex=S.spins[0].i;app.tap({x:450,y:70});
for(let k=0;k<1000&&S.walker.tx!==null;k++)app.update(.01);
near(S.trail[spinIndex].x,450);near(S.trail[spinIndex].y,10);assert(S.trail.length<=6);
assert(!core.canExtend(p(0,0),p(10,0),p(5,0)),'Reversal is retained');
assert(!core.canExtend(p(0,0),p(10,0),p(10,10)),'Corner is retained');
listeners.keydown({key:'ArrowRight',target:{tagName:'INPUT'},preventDefault:()=>assert.fail('slider key prevented')});
assert(!S.keys.arrowright,'Slider keys do not walk');
// Resuming a rewind commits only the displayed past, including a fractional endpoint.
fixture(); app.setCursor(2.5); const endpoint=app.trailAt(2.5); app.commitWalk();
assert.equal(S.trail.length,4);near(S.trail[3].x,endpoint.x);near(S.trail[3].y,endpoint.y);
assert.equal(S.spins.length,0);assert(!S.review);
// A spin at the first sample and consecutive collapsed spins are real events.
fixture();app.clearWalk();S.trail=[p(50,50),p(60,50)];S.started=true;S.cursor=1;S.rotQ0=0;S.spins=[{i:0,q:3}];S.replayVersion++;
assert.deepEqual(finish(1),[0]);assert.deepEqual(finish(-1),[0]);
// A vertical run retains only the few vertices needed for fold-orientation colours.
fixture();app.clearWalk();S.rot=S.rotTarget=0;S.rotQ0=0;S.started=true;
S.walker={x:10,y:10,tx:null,ty:null};S.trail=[p(10,10)];app.tap({x:10,y:350});
for(let k=0;k<1000&&S.walker.tx!==null;k++)app.update(.01);
assert(S.trail.length<=8);assert.equal(app.replayModel().events.length,3);near(S.trail.slice(-1)[0].y,350);
// Actual Beach aspect ratio: annotations stay canonical at every screen rotation.
app.applyImages({width:750,height:1050},{width:750,height:1050});
app.restoreMarkers([{face:0,u:.31,v:.76,shape:'triangle',color:'#123abc',label:'Free'}]);
S.cards.clear();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)S.cards.set(i+','+j,{i,j,amt:1});
for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
 S.rot=angle;const copies=app.markerCopies(S.markers[0]);assert.equal(copies.length,5);
 for(const copy of copies){const w=app.s2w(copy.x,copy.y),l=core.canonical(w,copy.i,copy.j,750,1050);near(l.x/750,.31);near(l.y/1050,.76);}
}
console.log('PASS: compact recording, exact folds, replay in both directions, immutable seeking, stable card-centred spins, smooth flip camera, focus hierarchy, free markers on all copies, Beach aspect ratio');
