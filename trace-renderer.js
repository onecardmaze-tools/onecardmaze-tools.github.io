/* Retained vector traces. Geometry is never rasterised, erased or resampled.
   The same compiler supplies live routes, replay and all physical sheet copies. */
(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./replay-core.js') : root.ReplayCore;
  const colors=['#ffcc4d','#5aa9ff','#ff6b6b','#b06bff'];
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
    const runs=[];
    for(const group of groups) {
      let run=runs[runs.length-1];
      if(!run||run.run!==group.run){run={run:group.run,r:group.r,groups:[]};runs.push(run);}
      run.groups.push(group);
    }
    return {pieces,groups,casing:path(groups,Path),paths:runs.map(run=>({r:run.r,path:path(run.groups,Path)}))};
  }
  function mergeScenes(scenes,Path) {
    const casing=new Path(),paths=[];
    for(const scene of scenes) {
      casing.addPath(scene.casing);
      for(const item of scene.paths) {
        const previous=paths[paths.length-1];
        if(previous&&previous.r===item.r)previous.path.addPath(item.path);
        else {const path=new Path();path.addPath(item.path);paths.push({r:item.r,path});}
      }
    }
    return {casing,paths};
  }
  function paintMany(g,scenes,width,alpha=1) {
    g.save();g.globalAlpha*=alpha;g.lineCap='round';g.lineJoin='round';
    // All outlines first. No later outline or eraser can cut an earlier colour.
    g.lineWidth=width+3.4*(width/5);g.strokeStyle='#081523';for(const scene of scenes)g.stroke(scene.casing);
    g.lineWidth=width;
    for(const scene of scenes)for(const item of scene.paths) {g.strokeStyle=colors[item.r];g.stroke(item.path);}
    g.restore();
  }
  function paint(g,scene,width,alpha=1) {paintMany(g,[scene],width,alpha);}
  function distance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
    const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
    return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
  }
  function statesAt(pieces,face,p,tolerance) {
    let bits=0;for(const s of pieces)if(s.face===face&&
      p.x>=Math.min(s.a.x,s.b.x)-tolerance&&p.x<=Math.max(s.a.x,s.b.x)+tolerance&&
      p.y>=Math.min(s.a.y,s.b.y)-tolerance&&p.y<=Math.max(s.a.y,s.b.y)+tolerance&&
      distance(p,s.a,s.b)<=tolerance)bits|=1<<s.r;
    return bits;
  }
  function pointGrid(cell) {
    const cells=new Map();let serial=0;
    const key=(face,x,y)=>face+':'+x+':'+y;
    return {
      add(p) {const k=key(p.face,Math.floor(p.x/cell),Math.floor(p.y/cell));let bucket=cells.get(k);if(!bucket){bucket=[];cells.set(k,bucket);}bucket.push({p,serial:serial++});},
      near(p,radius) {
        const x=Math.floor(p.x/cell),y=Math.floor(p.y/cell),range=Math.ceil(radius/cell);let first=null;
        for(let j=y-range;j<=y+range;j++)for(let i=x-range;i<=x+range;i++) {
          const bucket=cells.get(key(p.face,i,j));if(!bucket)continue;
          for(const candidate of bucket)if((!first||candidate.serial<first.serial)&&Math.hypot(candidate.p.x-p.x,candidate.p.y-p.y)<radius)first=candidate;
        }
        return first&&first.p;
      }
    };
  }
  function withoutStampOverlap(marks,stamps,radius) {
    const grid=pointGrid(radius);for(const p of stamps)grid.add(p);
    return marks.filter(p=>!grid.near(p,radius));
  }
  // Distances are measured from the START of each historical run, never
  // redistributed across its current length. Zoom and new endpoints cannot
  // move old stamps. Greedy suppression is chronological in card coordinates.
  function anchors(pieces,spacing) {
    const out=[],grid=pointGrid(spacing*.23);let run=-1,travel=0,next=spacing*.18;
    for(const p of pieces) {
      if(p.run!==run) {run=p.run;travel=0;next=spacing*.18;}
      const len=Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y);
      while(next<=travel+len+1e-7) {
        const t=len?Math.max(0,Math.min(1,(next-travel)/len)):0;
        const candidate={face:p.face,r:p.r,x:p.a.x+(p.b.x-p.a.x)*t,y:p.a.y+(p.b.y-p.a.y)*t};
        if(!grid.near(candidate,spacing*.23)){out.push(candidate);grid.add(candidate);}
        next+=spacing;
      }
      travel+=len;
    }
    return out;
  }
  // Small, unboxed chevrons record travel independently of historical up.
  // Fixed arc distances preserve earlier glyph positions as endpoints extend.
  function travelMarks(pieces,spacing) {
    const out=[],grid=pointGrid(spacing*.22);let run=-1,travel=0,next=spacing*.60;
    for(const p of pieces) {
      if(p.run!==run){run=p.run;travel=0;next=spacing*.60;}
      const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,len=Math.hypot(dx,dy);
      if(len<1e-9)continue;
      while(next<=travel+len+1e-7) {
        const t=Math.max(0,Math.min(1,(next-travel)/len));
        const mark={face:p.face,x:p.a.x+dx*t,y:p.a.y+dy*t,dx:dx/len,dy:dy/len,both:false};
        const near=grid.near(mark,spacing*.22);
        if(!near){out.push(mark);grid.add(mark);}
        else if(near.dx*mark.dx+near.dy*mark.dy<-.96&&Math.abs((mark.x-near.x)*near.dy-(mark.y-near.y)*near.dx)<spacing*.025)near.both=true;
        next+=spacing;
      }
      travel+=len;
    }
    return out;
  }
  function chevronPath(g,x,y,dx,dy,both,row,rotation) {
    const angle=rotation+(C.mod(row,2)?Math.PI:0),cs=Math.cos(angle),sn=Math.sin(angle);
    const ux=dx*cs-dy*sn,uy=dx*sn+dy*cs;
    const point=(u,v,move)=>g[move?'moveTo':'lineTo'](x+u*ux-v*uy,y+u*uy+v*ux);
    const tip=both?4.5:2.5,tail=both?-.5:-2.5;
    point(tail,-4,true);point(tip,0,false);point(tail,4,false);
    if(both){point(-tail,-4,true);point(-tip,0,false);point(-tail,4,false);}
  }
  function paintChevrons(g) {
    g.lineCap='round';g.lineJoin='round';g.lineWidth=4.5;g.strokeStyle='#081523';g.stroke();
    g.lineWidth=1.8;g.strokeStyle='#fffbee';g.stroke();
  }
  // Historical card-up in canonical card coordinates. If the present card has
  // the same orientation as the visit, its stamp points to screen-up. Stamps
  // rotate WITH the card, instead of acting like walking-direction arrows.
  function upAngle(r,row,rotation) {return rotation+(C.mod(row,2)?Math.PI:0)-r*Math.PI/2;}
  function stamp(g,x,y,bits,row,rotation,radius=13) {
    g.save();g.translate(x,y);
    g.beginPath();g.arc(0,0,radius,0,Math.PI*2);g.fillStyle='#081523';g.fill();
    g.lineWidth=1.3;g.strokeStyle='#e7f4ff99';g.stroke();
    for(let r=0;r<4;r++)if(bits&(1<<r)) {
      g.save();g.rotate(upAngle(r,row,rotation));g.scale(radius/13,radius/13);
      g.beginPath();g.moveTo(-2.4,6);g.lineTo(2.4,6);g.lineTo(2.4,-2);
      g.lineTo(7,-2);g.lineTo(0,-10);g.lineTo(-7,-2);g.lineTo(-2.4,-2);g.closePath();
      g.fillStyle=colors[r];g.fill();g.restore();
    }
    g.restore();
  }
  const api={compile,project,scene,mergeScenes,paint,paintMany,statesAt,anchors,colors,upAngle,stamp,travelMarks,withoutStampOverlap,chevronPath,paintChevrons};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TraceRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
