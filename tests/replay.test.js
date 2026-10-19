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
const sandbox = { console, ReplayCore:core, document:{getElementById:element,createElement:element,
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
  S.trail=[p(50,50),p(90,50),p(110,50),p(150,50),p(150,90,1),p(150,110,1),p(150,150,1)];
  S.spins=[{i:3,q:1},{i:6,q:3}]; S.cursor=6; S.replayVersion++; S.replaySpeed=4;
  app.rebuildInk(); app.setCursor(6); S.rot=S.rotTarget;
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
// Every spin holds position and keeps its screen pivot stationary through the turn.
fixture(); app.play(1);
let pivot=null,checked=0;
for(let k=0;k<1000 && S.play;k++) {
  app.update(.01);
  if(S.phase && S.phase.event.type==='spin' && S.phase.elapsed < 0.9) {
    const pos=app.w2s(S.walker.x,S.walker.y);
    if(!pivot) pivot={id:S.phase.event.id,x:pos.x,y:pos.y};
    if(pivot.id!==S.phase.event.id) pivot={id:S.phase.event.id,x:pos.x,y:pos.y};
    near(pos.x,pivot.x,'Spin x pivot stable');near(pos.y,pivot.y,'Spin y pivot stable');checked++;
  }
}
assert(checked>20);
// Pausing mid-spin freezes the phase; same-direction resume continues that phase.
fixture();app.play(1);
for(let k=0;k<1000;k++){app.update(.01);if(S.phase && S.phase.event.type==='spin' && S.phase.elapsed>.45)break;}
assert(S.phase);const paused=S.phase,elapsed=paused.elapsed,rotation=S.rot;
app.play(1);assert.equal(S.play,0);app.update(.05);
assert.strictEqual(S.phase,paused);near(S.phase.elapsed,elapsed);near(S.rot,rotation);
app.play(1);assert.strictEqual(S.phase,paused);app.update(.02);assert(S.phase.elapsed>elapsed);
// Event selection and door notes never mutate the recorded route.
fixture();app.seekEvent(1);const beforeNote=JSON.stringify({trail:S.trail,spins:S.spins});
S.markingDoor=true;app.tap({x:170,y:70});assert.equal(S.doorNotes.length,1);near(S.doorNotes[0].at,3);
assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),beforeNote);
listeners.keydown({key:'ArrowRight',target:{tagName:'INPUT'},preventDefault:()=>assert.fail('slider key prevented')});
assert(!S.keys.arrowright,'Slider keys do not walk');
// Resuming a rewind commits only the displayed past, including a fractional endpoint.
fixture(); app.setCursor(2.5); const endpoint=app.trailAt(2.5); app.commitWalk();
assert.equal(S.trail.length,4);near(S.trail[3].x,endpoint.x);near(S.trail[3].y,endpoint.y);
assert.equal(S.spins.length,0);assert(!S.review);
// A spin at the first sample and consecutive collapsed spins are real events.
fixture();app.clearWalk();S.trail=[p(50,50),p(60,50)];S.started=true;S.cursor=1;S.rotQ0=0;S.spins=[{i:0,q:3}];S.replayVersion++;
assert.deepEqual(finish(1),[0]);assert.deepEqual(finish(-1),[0]);
console.log('PASS: geometry, sampling-independent pace, bidirectional events, immutable previews, spin pivot, branch commit, endpoint spins');
