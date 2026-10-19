'use strict';
const assert=require('assert').strict;
const T=require('../trace-renderer.js');
const p=(x,y,r=0)=>({x,y,r});
const tiles=[];for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++)tiles.push({i,j});
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
// A diagonal crosses x and y seams at different times. Never invent a corner.
let pieces=T.compile([p(50,20),p(170,150,2)],100,100);
assert.equal(pieces.length,3);
assert.deepEqual(pieces.map(s=>[s.i,s.j,s.r]),[[0,0,0],[1,0,0],[1,1,2]]);
near(pieces[0].b.y,20+130*50/120);
for(let k=1;k<=100;k++) {
  const a=p(k*17%800-400,k*43%600-300),b=p(k*61%800-400,k*19%600-300);
  const ps=T.compile([a,b],100,100);
  near(ps.reduce((d,s)=>d+Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),0),Math.hypot(b.x-a.x,b.y-a.y));
}
// Across a same-orientation fold, both faces join one actual native polyline.
pieces=T.compile([p(40,50),p(150,50),p(150,80)],100,100);
let groups=T.project(pieces,tiles,100,100);
assert(groups.some(g=>g.lines.some(l=>l[0].x===40&&l[0].y===50&&l[l.length-1].x===150&&l[l.length-1].y===80&&l.some(v=>v.x===100))));
// Vertex density does not change arc-length badge positions or retained centreline.
const compact=T.compile([p(10,50),p(90,50)],100,100);
const dense=T.compile(Array.from({length:81},(_,i)=>p(10+i,50)),100,100);
assert.deepEqual(T.anchors(compact,30),T.anchors(dense,30));
// Exact overlapping visits keep all recorded orientations, including blue and red.
pieces=T.compile([p(10,50),p(90,50),p(10,50,1),p(90,50,2)],100,100);
assert.equal(T.statesAt(pieces,0,p(50,50),.1),7);
assert.equal(T.statesAt(pieces,1,p(50,50),.1),0);
// No compositing eraser, butt ends or segment-by-segment outline overpainting.
class Path {moveTo(){}lineTo(){}}
const scene=T.scene(pieces,tiles,100,100,Path),calls=[];
const g={globalAlpha:1,save(){},restore(){},stroke(path){calls.push([this.strokeStyle,this.lineCap,this.lineJoin,path]);}};
T.paint(g,scene,5);
assert.equal(calls[0][0],'#081523');assert.equal(calls.length,scene.paths.length+1);
assert(calls.every(c=>c[1]==='round'&&c[2]==='round'));
assert(calls.slice(1).every(c=>c[0]!=='#081523'));
console.log('PASS: exact multi-edge projection, seam stitching, negative tiles, sampling-independent labels, overlapping orientation states, non-destructive round vector strokes');
