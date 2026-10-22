/* CPU-only geometry equivalence and retained path invalidation. */
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict,path=require('path');
const repository=process.argv[3]||process.cwd();
const source=process.argv[2]||path.join(repository,'index.html');
const TraceRenderer=require(path.join(repository,'trace-renderer.js'));
class Path {
  constructor(){this.commands=[];}
  moveTo(x,y){this.commands.push(['M',x,y]);}
  lineTo(x,y){this.commands.push(['L',x,y]);}
}
const text=fs.readFileSync(source,'utf8');
const start=text.indexOf('function retainedChevrons(travel)');
const end=text.indexOf('\nfunction stampKey',start);
assert(start>=0&&end>start,'Retained chevron compiler is present');
const sandbox={S:{zoom:1,rot:0,cam:{x:40,y:80}},TraceRenderer,Path2D:Path,Math};
vm.runInNewContext('let chevronCache=null;\n'+text.slice(start,end),sandbox);
const compile=travel=>sandbox.retainedChevrons(travel);
const travel=[{face:0,x:100,y:120,dx:1,dy:0,both:false},{face:0,x:250,y:300,dx:.6,dy:.8,both:true},{face:1,x:320,y:420,dx:-.8,dy:.6,both:false}];
const W=750,H=1050,view={w:1504,h:1492};
function screen(x,y,zoom,rotation){const dx=(x-40)*zoom,dy=(y-80)*zoom,c=Math.cos(rotation),s=Math.sin(rotation);return [dx*c-dy*s+view.w/2,dx*s+dy*c+view.h/2];}
for(const zoom of [.3,1,2.4])for(const rotation of [-Math.PI/3,0,.72,Math.PI]) {
  sandbox.S.zoom=zoom;sandbox.S.rot=rotation;const retained=compile(travel);
  for(const i of [-1,0,2])for(const j of [-1,0,1,2]) {
    const face=((i+j)%2+2)%2,odd=(j%2+2)%2,expected=new Path();
    for(const p of travel)if(p.face===face) {
      const center=screen(i*W+(odd?W-p.x:p.x),j*H+(odd?H-p.y:p.y),zoom,rotation);
      TraceRenderer.chevronPath(expected,center[0],center[1],p.dx,p.dy,p.both,j,rotation);
    }
    const actual=retained[face].commands;
    assert.equal(actual.length,expected.commands.length);
    for(let k=0;k<actual.length;k++) {
      const q=actual[k],transformed=screen(i*W+(odd?W-q[1]:q[1]),j*H+(odd?H-q[2]:q[2]),zoom,rotation);
      assert.equal(q[0],expected.commands[k][0]);
      assert(Math.abs(transformed[0]-expected.commands[k][1])<1e-8);
      assert(Math.abs(transformed[1]-expected.commands[k][2])<1e-8);
    }
    assert(Math.abs(4.5/zoom*zoom-4.5)<1e-10);
    assert(Math.abs(1.8/zoom*zoom-1.8)<1e-10);
  }
}
sandbox.S.zoom=1;const first=compile(travel);sandbox.S.rot+=.37;sandbox.S.cam.x+=100;assert.equal(compile(travel),first,'Camera changes retain both paths');
const copied=travel.map(p=>({...p}));assert.equal(compile(copied),first,'Equivalent regenerated marks retain paths during walking');
copied[0].x+=1;
// The compiler consumes immutable travel arrays, as produced by traceScene.
const changed=copied.map(p=>({...p}));assert.notEqual(compile(changed),first,'Changed mark geometry invalidates paths');
const beforeZoom=compile(changed);sandbox.S.zoom=2;assert.notEqual(compile(changed),beforeZoom,'Zoom changes screen-constant geometry');
assert.equal(compile(travel.filter(p=>p.face===0))[1],null,'Absent face does not allocate draws');
console.log('Retained chevron checks passed: exact glyph positions/directions across zoom, rotation and tile parity, constant widths and geometry-only cache invalidation.');
