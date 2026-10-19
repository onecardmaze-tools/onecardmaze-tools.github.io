/* Retained vector traces. Geometry is never rasterised, erased or resampled.
   The same compiler supplies live routes, replay and all physical sheet copies. */
(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./replay-core.js') : root.ReplayCore;
  const colors=['#ffcc4d','#5aa9ff','#ff6b6b','#b06bff'];
  const angles=['0°','90°','180°','270°'];
  const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-6;
  function compile(trail,W,H,from=0,to=trail.length-1) {
    const result=[]; let run=-1, previous=-1;
    for(let k=Math.floor(from);k<Math.min(Math.ceil(to),trail.length-1);k++) {
      const start=Math.max(from,k),end=Math.min(to,k+1); if(end<=start)continue;
      const a=C.point(trail,start),b=C.point(trail,end),v=trail[k+1];
      const q=C.mod(v.r-2*C.mod(Math.floor(v.y/H),2),4);
      for(const p of C.pieces(a,b,W,H)) {
        const r=C.mod(q+2*C.mod(p.j,2),4);
        if(r!==previous) {run++;previous=r;}
        result.push({...p,r,run,start:start+(end-start)*p.t0,end:start+(end-start)*p.t1});
      }
    }
    return result;
  }
  function project(pieces,tiles,W,H) {
    const groups=new Map();
    for(const p of pieces) for(const tile of tiles) {
      if(C.face(tile.i,tile.j)!==p.face)continue;
      const odd=C.mod(tile.j,2),same=odd===C.mod(p.j,2);
      const dx=same?tile.i-p.i:tile.i+p.i+1,dy=same?tile.j-p.j:tile.j+p.j+1;
      const key=[p.run,same?'T':'R',dx,dy].join(':');
      const world=v=>({x:tile.i*W+(odd?W-v.x:v.x),y:tile.j*H+(odd?H-v.y:v.y)});
      const a=world(p.a),b=world(p.b); let group=groups.get(key);
      if(!group) {group={r:p.r,run:p.run,lines:[],end:-1};groups.set(key,group);}
      let line=group.lines[group.lines.length-1];
      if(!line||Math.abs(group.end-p.start)>1e-7||!close(line[line.length-1],a)) {line=[a];group.lines.push(line);}
      line.push(b);group.end=p.end;
    }
    return [...groups.values()].sort((a,b)=>a.run-b.run);
  }
  function path(groups,Path) {
    const out=new Path();
    for(const group of groups)for(const line of group.lines) {
      out.moveTo(line[0].x,line[0].y); for(let k=1;k<line.length;k++)out.lineTo(line[k].x,line[k].y);
    }
    return out;
  }
  function scene(pieces,tiles,W,H,Path) {
    const groups=project(pieces,tiles,W,H);
    return {pieces,groups,casing:path(groups,Path),paths:groups.map(g=>({r:g.r,path:path([g],Path)}))};
  }
  function paint(g,scene,width,alpha=1) {
    g.save();g.globalAlpha*=alpha;g.lineCap='round';g.lineJoin='round';
    // All outlines first. No later outline or eraser can cut an earlier colour.
    g.lineWidth=width+3.4*(width/5);g.strokeStyle='#081523';g.stroke(scene.casing);
    g.lineWidth=width;
    for(const item of scene.paths) {g.strokeStyle=colors[item.r];g.stroke(item.path);}
    g.restore();
  }
  function distance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
    const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
    return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
  }
  function statesAt(pieces,face,p,tolerance) {
    let bits=0;for(const s of pieces)if(s.face===face&&distance(p,s.a,s.b)<=tolerance)bits|=1<<s.r;
    return bits;
  }
  // Arc-length anchors, independent of compact vertex density. Each orientation
  // run gets an anchor even when it is shorter than the regular label spacing.
  function anchors(pieces,spacing) {
    const out=[];let group=[];
    const flush=()=>{
      if(!group.length)return;
      const total=group.reduce((n,p)=>n+Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y),0);
      const count=Math.max(1,Math.floor(total/spacing));
      let offset=0,index=0;
      for(let k=0;k<count;k++) {
        const at=total*(k+.5)/count;
        while(index<group.length-1&&offset+Math.hypot(group[index].b.x-group[index].a.x,group[index].b.y-group[index].a.y)<at) {
          offset+=Math.hypot(group[index].b.x-group[index].a.x,group[index].b.y-group[index].a.y);index++;
        }
        const s=group[index],len=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),t=len?(at-offset)/len:0;
        out.push({face:s.face,r:s.r,x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t});
      }
    };
    for(const p of pieces) {if(group.length&&group[0].run!==p.run){flush();group=[];}group.push(p);}flush();return out;
  }
  const api={compile,project,scene,paint,statesAt,anchors,colors,angles};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TraceRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
