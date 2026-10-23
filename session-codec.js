/* Portable, dependency-free recording format. No executable content or remote images. */
(function(root){
  'use strict';
  const finite=(v,limit)=>Number.isFinite(v)&&Math.abs(v)<=limit;
  const q=v=>Number.isInteger(v)&&v>=0&&v<4;
  function validate(raw){
    const fail=()=>{throw new Error('Invalid or unsupported One Card Maze recording');};
    if(!raw||raw.format!=='onecardmaze-session'||raw.version!==1)fail();
    const a=raw.art,s=raw.state;
    if(!a||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1||a.width>8192||a.height>8192||a.width*a.height>16000000)fail();
    for(const k of ['front','back'])if(typeof a[k]!=='string'||a[k].length>48000000||!/^data:image\/png;base64,[a-zA-Z0-9+/]+=*$/.test(a[k]))fail();
    if(!s||!Array.isArray(s.trail)||s.trail.length>200000||!Array.isArray(s.spins)||s.spins.length>200000||!q(s.rotQ0))fail();
    let crossings=0;
    const trail=s.trail.map((p,i)=>{
      if(!p||!finite(p.x,1e8)||!finite(p.y,1e8)||!q(p.r))fail();
      if(i){const b=s.trail[i-1];crossings+=Math.abs(Math.floor(p.x/a.width)-Math.floor(b.x/a.width))+Math.abs(Math.floor(p.y/a.height)-Math.floor(b.y/a.height));}
      return {x:p.x,y:p.y,r:p.r};
    });
    if(crossings>100000)fail();
    let last=-1;
    const spins=s.spins.map(p=>{if(!p||!Number.isInteger(p.i)||p.i<0||p.i>=trail.length||p.i<=last||!q(p.q))fail();last=p.i;return {i:p.i,q:p.q};});
    if(!finite(s.cursor,200000)||s.cursor<0||s.cursor>Math.max(0,trail.length-1)||!finite(s.rotation,1e8)||!finite(s.zoom,40)||s.zoom<.001||!s.cam||!finite(s.cam.x,1e8)||!finite(s.cam.y,1e8)||!s.walker||!finite(s.walker.x,1e8)||!finite(s.walker.y,1e8))fail();
    if(typeof s.started!=='boolean'||(s.started&&!trail.length)||typeof s.review!=='boolean'||typeof s.follow!=='boolean'||typeof s.trailOn!=='boolean'||![.05,.1,.2,.4,.8,.5,1,2,4].includes(s.replaySpeed))fail();
    if(!Array.isArray(s.markers)||s.markers.length>10000)fail();
    const markers=s.markers.map(m=>{
      if(!m||![0,1].includes(m.face)||!finite(m.u,1)||m.u<0||!finite(m.v,1)||m.v<0||!['circle','diamond','square','triangle','star'].includes(m.shape)||!/^#[0-9a-f]{6}$/i.test(m.color)||typeof m.label!=='string'||m.label.length>24)fail();
      return {face:m.face,u:m.u,v:m.v,shape:m.shape,color:m.color,label:m.label};
    });
    return {format:raw.format,version:1,art:{width:a.width,height:a.height,front:a.front,back:a.back},state:{trail,spins,rotQ0:s.rotQ0,cursor:s.cursor,rotation:s.rotation,zoom:s.zoom,cam:{x:s.cam.x,y:s.cam.y},walker:{x:s.walker.x,y:s.walker.y},started:s.started,review:s.review,follow:s.follow,trailOn:s.trailOn,replaySpeed:s.replaySpeed,markers}};
  }
  function summarize(values){
    if(!values.length)return null;
    const sorted=values.slice().sort((a,b)=>a-b),round=n=>Math.round(n*100)/100;
    return {samples:values.length,medianMs:round(sorted[Math.floor((sorted.length-1)*.5)]),p95Ms:round(sorted[Math.ceil(sorted.length*.95)-1]),maxMs:round(sorted[sorted.length-1]),over34ms:values.filter(v=>v>34).length,over50ms:values.filter(v=>v>50).length};
  }
  const api={validate,summarize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SessionCodec=api;
})(typeof globalThis!=='undefined'?globalThis:this);
