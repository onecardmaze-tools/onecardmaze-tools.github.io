'use strict';
const assert=require('assert'),harness=require('./app-harness');
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const [width,height] of [[390,664],[844,390],[1280,800]]) {
 const {app,S,listeners}=harness(null,{width,height});
 S.started=true;S.review=false;S.zoom=1;S.rot=S.rotTarget=0;S.cam={x:750,y:1050};S.follow=false;
 S.walker={x:740,y:1040,tx:null,ty:null};S.anchor={i:0,j:0};
 const original={...S.cam};app.tap({x:760,y:1060});
 app.update(.001);near(S.cam.x,original.x);near(S.cam.y,original.y);
 // Logical seam changes do not move a camera with a visible walker.
 S.anchor={i:1,j:1};const target=app.camTarget();near(target.x,S.cam.x);near(target.y,S.cam.y);
 // Browsing away must not pull back to the off-screen walker on tap.
 S.follow=false;S.cam={x:2000,y:2000};app.tap({x:2000,y:2000});
 app.update(.01);near(S.cam.x,2000);near(S.cam.y,2000);assert(!S.follow);
 // Following resumes only after the walker enters the user's composition.
 S.walker.x=2000;S.walker.y=2000;app.camTarget();assert(S.follow);
 // An ongoing walk near the right edge pans right, also after rotation.
 for(const rot of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
  S.rot=rot;S.walker.x=S.cam.x+Math.cos(rot)*width*.48;S.walker.y=S.cam.y-Math.sin(rot)*width*.48;
  S.walker.tx=S.walker.x+1;const t=app.camTarget();
  assert((t.x-S.cam.x)*Math.cos(rot)-(t.y-S.cam.y)*Math.sin(rot)>0);
 }
 // Arrival stops moving the map, even outside the quiet zone.
 S.walker.tx=null;const stopped=app.camTarget();near(stopped.x,S.cam.x);near(stopped.y,S.cam.y);
 // Wheel/pinch focal point remains anchored even when follow was active.
 S.follow=true;S.minZoom=.01;S.maxZoom=20;
 const focal=app.s2w(width*.3,height*.4);
 listeners['stage:wheel']({preventDefault(){},clientX:width*.3,clientY:height*.4,deltaY:-120});
 const screen=app.w2s(focal.x,focal.y);near(screen.x,width*.3);near(screen.y,height*.4);assert(!S.follow);
 // Explicit positioning remains available.
 listeners['btnLocate:click']();near(S.cam.x,S.walker.x);near(S.cam.y,S.walker.y);
}
console.log('PASS: walking camera preserves composition, crosses seams continuously, resumes after browsing and respects rotation');
