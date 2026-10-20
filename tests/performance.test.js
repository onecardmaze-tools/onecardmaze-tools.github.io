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
// Repeated resize (including delayed orientationchange) clears the GL surface.
// The scene key may be unchanged, but the background must be submitted again.
for(let i=0;i<2;i++){
 const before=counts.glDraws;app.resize();app.render();
 assert(counts.glDraws>before,'Same-size resize must redraw cleared artwork');
}
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
  S.cursor=20.3;app.render();assert.equal(counts.staticClears,staticClears,'No Canvas2D history repaint during partial playback');assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Forward updates only a partial segment');
  S.reviewDir=-1;S.cursor=20.7;app.render();calls.length=0;
  S.cursor=20.6;app.render();assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Reverse updates only a partial segment');
} finally {T.compile=original;}
console.log('PASS: idle RAF/HUD sleep, input wake/settle, artwork reuse, hidden-page suspension/resume, no historical bitmap allocation, cached exact progress in both directions');

// Camera movement reuses model geometry; it never allocates a world-size bitmap.
const desktop=harness(null,{width:1504,height:1492,finePointer:true,dpr:2}),D=desktop.S;
for(let k=0;k<400;k++)desktop.tick();
desktop.app.tap({x:375,y:525});for(let k=0;k<400;k++)desktop.tick();
D.trail=[{x:200,y:200,r:0},{x:800,y:200,r:0},{x:800,y:1700,r:1}];
D.cursor=2;D.replayVersion++;desktop.app.refreshTrace();desktop.app.render();
const routeVersion=D.traceVersion,replayVersion=D.replayVersion;
desktop.app.spin(1);desktop.app.update(.016);desktop.app.render();
assert(D.replayVersion>replayVersion);
assert.equal(D.traceVersion,routeVersion,'Turning does not alter recorded geometry');
const compile=T.compile;let compiled=0;
T.compile=(...args)=>{compiled++;return compile(...args);};
try {
 for(let k=0;k<60;k++){D.rot=D.rotTarget=k*Math.PI/120;D.cam.x+=.2;desktop.app.render();}
 assert.equal(compiled,0,'Rotating/panning only changes the renderer transform');
}finally{T.compile=compile;}
assert.equal(desktop.app.traceLayout(),null,'No retained world bitmap or raster-budget fallback');
assert(!desktop.elements.has('traceLayer'),'The oversized historical Canvas2D surface is removed');
assert.equal(desktop.elements.get('stage').width,3008);
assert.equal(desktop.elements.get('replayLayer').width,3008,'Analytic edge coverage retains full DPR');
for(const zoom of [.05,.888,20]){D.zoom=zoom;desktop.app.render();assert.equal(desktop.elements.get('replayLayer').width,3008);}
const phone=harness(null,{width:390,height:844,dpr:3});for(let k=0;k<400;k++)phone.tick();
assert.equal(phone.elements.get('replayLayer').width,780,'Established DPR2 cap is preserved on touch viewports');
console.log('PASS: retained model geometry during rotation/pan, viewport-bounded full-resolution foreground, unchanged touch DPR');
