'use strict';
const assert=require('assert'),harness=require('./app-harness.js');
const h=harness(),{app,S,counts}=h;
for(let k=0;k<400;k++)h.tick();
assert.equal(h.pending(),0,'Settled scene must have no RAF callback pending');
const sleeping={...counts};for(let k=0;k<120;k++)h.tick();
assert.equal(counts.rafCalls,sleeping.rafCalls,'Zero polling while idle');
assert.equal(counts.domWrites,sleeping.domWrites,'Zero idle HUD writes');
// A real input wakes exactly one pending frame and continues until motion ends.
app.tap({x:375,y:525});h.tick();
h.listeners.keydown({key:'d',target:{tagName:'DIV'},preventDefault(){}});
for(let k=0;k<12;k++)h.tick();
const x=S.walker.x;assert(x>375,'Keyboard movement wakes the sleeping scheduler');
h.listeners.keyup({key:'d'});for(let k=0;k<400;k++)h.tick();
assert.equal(h.pending(),0,'Releasing input and finishing fades returns to sleep');
// Overlay-only changes must not submit another full-screen artwork draw.
app.render();const draws=counts.glDraws;
for(let k=0;k<20;k++){S.walker.x+=.01;app.render();}
assert.equal(counts.glDraws,draws,'Fixed background is reused for player-only updates');
// A hidden page suspends even an active replay without skipping time on return.
app.play(-1);assert(h.pending()>0);h.document.hidden=true;h.listeners['document:visibilitychange']();
assert.equal(h.pending(),0,'No queued RAF when the page is hidden');
const cursor=S.cursor;for(let k=0;k<300;k++)h.tick();assert.equal(S.cursor,cursor);
h.document.hidden=false;h.listeners['document:visibilitychange']();h.tick();
assert(Math.abs(S.cursor-cursor)<.1,'Returning from background does not fast-forward playback');
// Cached progress is exact: crossing a compact vertex and seeking rebuilds only
// the fixed prefix/suffix, while within-segment movement compiles one short leg.
const T=require('../trace-renderer.js'),original=T.compile,calls=[];
T.compile=(trail,W,H,from=0,to=trail.length-1)=>{calls.push([from,to]);return original(trail,W,H,from,to);};
try {
  S.play=0;S.review=true;S.reviewDir=1;S.trail=Array.from({length:30},(_,i)=>({x:100+i*3,y:200+(i%2)*10,r:0}));
  S.replayVersion++;S.cursor=20.2;app.refreshTrace();app.render();calls.length=0;const staticClears=counts.staticClears;
  S.cursor=20.3;app.render();assert.equal(counts.staticClears,staticClears,'Full history canvas stays unchanged during partial-segment playback');assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Forward updates only a partial segment');
  S.reviewDir=-1;S.cursor=20.7;app.render();calls.length=0;
  S.cursor=20.6;app.render();assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Reverse updates only a partial segment');
} finally {T.compile=original;}
console.log('PASS: idle RAF/HUD sleep, input wake/settle, artwork reuse, hidden-page suspension/resume, static history canvas reuse, cached exact progress in both directions');

// Desktop rotation/pan changes only a compositor matrix, not the retained ink.
const desktop=harness(null,{finePointer:true,dpr:2.2}),D=desktop.S;
for(let k=0;k<400;k++)desktop.tick();
desktop.app.tap({x:375,y:525});for(let k=0;k<400;k++)desktop.tick();D.trail=[{x:200,y:200,r:0},{x:500,y:200,r:0},{x:500,y:700,r:0}];
D.cursor=2;D.replayVersion++;desktop.app.refreshTrace();desktop.app.render();
const retained=desktop.counts.staticClears,routeVersion=D.traceVersion,replayVersion=D.replayVersion;
desktop.app.spin(1);desktop.app.update(.016);desktop.app.render();
assert(D.replayVersion>replayVersion,'A turn still updates the event timeline');
assert.equal(D.traceVersion,routeVersion,'A turn does not change recorded route geometry');
assert.equal(desktop.counts.staticClears,retained,'Even the first Q/E frame must reuse ink, without a cold rasterisation');
D.manualPivot=null;

for(let k=1;k<=60;k++){D.rot=k*Math.PI/120;D.rotTarget=D.rot;desktop.app.render();}
assert.equal(desktop.counts.staticClears,retained,'Desktop quarter-turn must reuse the existing ink bitmap for every animation frame');
const surface=desktop.elements.get('traceLayer'),transform=surface.style.transform;
D.cam.x+=10;desktop.app.render();assert.equal(desktop.counts.staticClears,retained,'Panning also reuses the retained ink');
assert.notEqual(surface.style.transform,transform,'CSS placement tracks the camera');
assert(desktop.app.traceLayout().pixelW*desktop.app.traceLayout().pixelH<=16000000,'Retained surface obeys its explicit allocation budget');
// Pixel rounding must never stretch the retained bitmap away from world geometry.
for(const angle of [0,.37,Math.PI/2,-Math.PI*.7]) {
  D.rot=angle;D.cam={x:397,y:498};desktop.app.render();
  const layout=desktop.app.traceLayout(),m=surface.style.transform.slice(7,-1).split(',').map(Number);
  nearSurface(Number.parseFloat(surface.style.width)/surface.width,.5);
  for(const p of [{x:0,y:0},{x:750,y:1050},{x:-600,y:1300}]) {
    const x=(p.x-layout.x)*D.zoom,y=(p.y-layout.y)*D.zoom,expected=desktop.app.w2s(p.x,p.y);
    nearSurface(m[0]*x+m[2]*y+m[4],expected.x);nearSurface(m[1]*x+m[3]*y+m[5],expected.y);
  }
}
function nearSurface(a,b){assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
D.zoom=20;desktop.app.render();assert.equal(desktop.app.traceLayout(),null,'Oversized surfaces fall back to a viewport-sized cache');
assert.equal(surface.style.transform,'none');assert.equal(surface.width,2400);assert.equal(surface.height,1800);
const fallback=desktop.counts.staticClears;D.rot+=.1;desktop.app.render();assert(desktop.counts.staticClears>fallback,'Fallback still paints current geometry');
console.log('PASS: desktop rotation/pan compositor reuse, bounded cache allocation, exact viewport fallback');

const phone=harness(null,{width:390,height:844,dpr:3});for(let k=0;k<400;k++)phone.tick();
phone.app.render();assert.equal(phone.app.traceLayout(),null,'iPhone-sized touch viewport retains the existing rendering path');
assert.equal(phone.elements.get('traceLayer').width,780,'Touch backing still uses the established DPR 2 cap');

// Regression: the real user's 1504×1492 Retina viewport / 88.8% zoom exceeded
// the previous 16M cache gate even on a short route. Preserve caching by budgeting
// only static-ink raster density, leaving artwork and arrow sprites unchanged.
const large=harness(null,{width:1504,height:1492,dpr:2,finePointer:true}),L=large.S;
large.app.tap({x:467,y:1869});for(let k=0;k<400;k++)large.tick();
L.zoom=.888095238095238;L.trail=[{x:375,y:525,r:0},{x:800,y:525,r:0},{x:467,y:1869,r:1}];
L.cursor=2;L.replayVersion++;large.app.refreshTrace();large.app.render();
const bounded=large.app.traceLayout();assert(bounded,'Normal Retina desktop must not fall back');
assert(bounded.rasterRatio>=1&&bounded.rasterRatio<2);assert(bounded.pixelW*bounded.pixelH<=16000000);
const ink=large.elements.get('traceLayer');nearSurface(parseFloat(ink.style.width)/ink.width,1/bounded.rasterRatio);
const paints=large.counts.staticClears;
for(let k=0;k<60;k++){L.rot=k*Math.PI/120;L.rotTarget=L.rot;large.app.render();}
assert.equal(large.counts.staticClears,paints,'Large-view rotation retains ink across all 60 frames');
assert.equal(large.elements.get('stage').width,3008,'Artwork retains full DPR 2');
assert.equal(large.elements.get('replayLayer').width,3008,'Arrow and marker layer retains full DPR 2');
console.log('PASS: real-size Retina viewport retains bounded ink with full-resolution artwork and glyphs');
