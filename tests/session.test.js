'use strict';
const assert=require('assert'),codec=require('../session-codec.js'),harness=require('./app-harness.js');
const fixture={format:'onecardmaze-session',version:1,art:{width:750,height:1050,front:'data:image/png;base64,AAAA',back:'data:image/png;base64,AAAA'},state:{
  trail:[{x:375,y:525,r:0},{x:800,y:525,r:0},{x:800,y:1100,r:1},{x:-20,y:1100,r:1}],spins:[{i:1,q:1},{i:3,q:3}],rotQ0:0,
  cursor:1.5,rotation:Math.PI/2,zoom:.6,cam:{x:1125,y:525},walker:{x:800,y:812.5},started:true,review:true,follow:false,trailOn:false,replaySpeed:.2,
  markers:[{face:1,u:.2,v:.7,shape:'star',color:'#ffcc4d',label:'Finish <b>'}]}};
const clean=codec.validate(JSON.parse(JSON.stringify(fixture)));
assert.deepEqual(clean,fixture,'Portable data round trips without dropping the future');
for(const mutate of [f=>f.version=99,f=>f.art.front='https://example.com/a.png',f=>f.art.width=99999,f=>f.state.cursor=99,f=>f.state.trail[1].x=Infinity,f=>f.state.spins.push({i:0,q:1}),f=>f.state.markers[0].color='url(x)',f=>f.state.replaySpeed=99,f=>f.state.trail=[{x:0,y:0,r:0},{x:1e8,y:0,r:0}]]){
  const bad=JSON.parse(JSON.stringify(fixture));mutate(bad);assert.throws(()=>codec.validate(bad));
}
const h=harness(),{app,S}=h;S.play=1;S.keys.d=true;S.phase={};
app.restoreSessionState(clean.state);
assert.deepEqual(JSON.parse(JSON.stringify(S.trail)),fixture.state.trail);
assert.deepEqual(JSON.parse(JSON.stringify(S.spins)),fixture.state.spins);
assert.equal(S.cursor,1.5);assert.equal(S.trail.length,4,'Rewound future preserved');assert.equal(S.play,0);assert.equal(S.phase,null);assert.equal(Object.keys(S.keys).length,0);
assert.equal(S.markers[0].label,'Finish <b>');assert.equal(S.trailOn,false);assert.equal(S.rot,S.rotTarget);
const before=JSON.stringify({trail:S.trail,spins:S.spins});
app.play(1);for(let k=0;k<2000&&S.play;k++)app.update(.03);
assert.equal(S.play,0);assert.equal(S.cursor,3);assert.equal(JSON.stringify({trail:S.trail,spins:S.spins}),before,'Imported record replays without mutation');
app.setCursor(1.5);app.commitWalk();assert(S.trail.length<4,'Imported rewind can branch normally');
assert.deepEqual(codec.summarize([16,17,50,100]),{samples:4,medianMs:17,p95Ms:100,maxMs:100,over34ms:2,over50ms:1});
assert.equal(codec.summarize([]),null);
console.log('PASS: session round trip, full future and spin preservation, safe validation, paused restoration, imported replay/branch, timing summaries');

// Sampling is explicitly activated and releases its extra RAF on stop/hide.
const sample=harness();for(let k=0;k<400;k++)sample.tick();
assert.equal(sample.pending(),0);sample.listeners['btnMeasure:click']();
assert(sample.pending()>0);for(let k=0;k<20;k++)sample.tick();
sample.listeners['btnMeasure:click']();assert.equal(sample.pending(),0);
assert(sample.elements.get('measureStatus').textContent.includes('Sample saved'));
sample.listeners['btnMeasure:click']();sample.tick();sample.tick();sample.document.hidden=true;sample.listeners['document:visibilitychange']();
assert.equal(sample.pending(),0);assert(sample.elements.get('measureStatus').textContent.includes('tab hidden'));
console.log('PASS: manual performance sampling stops all extra callbacks on stop/visibility loss');

// New checkpoints survive validation; corrupt histories never enter the app.
const withCommands=JSON.parse(JSON.stringify(fixture));
withCommands.state.commands=[{at:0,q:0},{at:1,q:0},{at:1,q:1},{at:2,q:1}];
assert.deepEqual(codec.validate(withCommands).state.commands,withCommands.state.commands);
for(const commands of [[{at:-1,q:0}],[{at:99,q:0}],[{at:0,q:4}],[{at:2,q:1},{at:1,q:1}]]) {
  assert.throws(()=>codec.validate({...fixture,state:{...fixture.state,commands}}));
}
console.log('PASS: command checkpoint round trip and validation');
