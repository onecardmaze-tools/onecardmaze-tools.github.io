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
  S.replayVersion++;S.cursor=20.2;app.render();calls.length=0;const staticClears=counts.staticClears;
  S.cursor=20.3;app.render();assert.equal(counts.staticClears,staticClears,'Full history canvas stays unchanged during partial-segment playback');assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Forward updates only a partial segment');
  S.reviewDir=-1;S.cursor=20.7;app.render();calls.length=0;
  S.cursor=20.6;app.render();assert.equal(calls.length,1);assert(calls[0][1]-calls[0][0]<1,'Reverse updates only a partial segment');
} finally {T.compile=original;}
console.log('PASS: idle RAF/HUD sleep, input wake/settle, artwork reuse, hidden-page suspension/resume, static history canvas reuse, cached exact progress in both directions');
