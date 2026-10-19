/* CPU-side production-path benchmark; not browser FPS, GPU time or battery power.
   CANVAS_MODULE optionally enables native Canvas2D; without it isolates geometry. */
'use strict';
const {performance}=require('perf_hooks'),harness=require('./app-harness.js');
const canvas=process.env.CANVAS_MODULE?require(process.env.CANVAS_MODULE):null;
const h=harness(canvas),{app,S,counts}=h;
for(let k=0;k<400;k++)h.tick();
const beforeIdle={...counts};for(let k=0;k<120;k++)h.tick();
const result={adapter:canvas?'native Canvas2D + counted WebGL':'counted graphics; CPU geometry only',idleTwoSeconds:{rafCallbacks:counts.rafCalls-beforeIdle.rafCalls,glDraws:counts.glDraws-beforeIdle.glDraws}};
function timing(fn,n=30){for(let k=0;k<5;k++)fn(k);const samples=[];for(let k=0;k<n;k++){const start=performance.now();fn(k);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {medianMs:+samples[Math.floor(n*.5)].toFixed(3),p95Ms:+samples[Math.floor(n*.95)].toFixed(3)};}
for(const n of [100,1000]) {
  app.clearWalk();S.started=true;S.trail=Array.from({length:n},(_,k)=>({x:50+(k*67)%640,y:50+(k*109)%940,r:Math.floor(k/25)%4}));
  S.replayVersion++;S.spins=[];S.cursor=n-1;app.refreshTrace();
  S.review=false;app.render();const draws=counts.glDraws;
  const stable=timing(()=>app.render());
  result[n]={stable,artDrawsFor35OverlayRenders:counts.glDraws-draws};
  result[n].edit=timing(k=>{S.trail[n-1].x+=k%2?1:-1;S.replayVersion++;app.render();},15);
  S.review=true;S.reviewDir=1;S.cursor=Math.floor(n*.65)+.1;
  result[n].replay=timing(k=>{S.cursor=Math.floor(n*.65)+.1+(k%30)*.002;app.render();});
}
console.log(JSON.stringify(result,null,2));
