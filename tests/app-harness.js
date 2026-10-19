/* Production app with deterministic DOM, RAF and graphics adapters. Optional
   native Canvas2D uses the actual draw pipeline; WebGL calls remain counted. */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function harness(canvasModule) {
  const noop=()=>{},elements=new Map(),listeners={},frames=new Map();
  let serial=0,clock=0;const counts={glDraws:0,rafCalls:0,domWrites:0,staticClears:0};
  const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,
    getUniformLocation:()=>({}),createTexture:()=>({}),createBuffer:()=>({}),createProgram:()=>({}),createShader:()=>({}),
    drawArrays:()=>{counts.glDraws++;}}, {get:(t,k)=>k in t?t[k]:(k.toUpperCase()===k?1:noop)});
  function make(id) {
    const cv=canvasModule&&canvasModule.createCanvas(1200,900);
    const ctx=canvasModule?cv.getContext('2d'):new Proxy({measureText:()=>({width:20}),clearRect(){if(id==='traceLayer')counts.staticClears++;}},{get:(t,k)=>k in t?t[k]:noop});
    const e={id,style:{setProperty:noop},classList:{toggle:noop,add:noop,remove:noop},
      addEventListener:(name,fn)=>{listeners[id+':'+name]=fn;},setAttribute:noop,replaceChildren:noop,appendChild:noop,add:noop,
      querySelector:s=>element(id+s),getContext:t=>t==='2d'?ctx:gl,
      getBoundingClientRect:()=>({left:0,top:0,width:1200,height:900})};
    for(const key of ['width','height']) {let size=1200;Object.defineProperty(e,key,{get:()=>cv?cv[key]:size,set:v=>{size=v;if(cv)cv[key]=v;}});}
    for(const key of ['textContent','innerHTML']) {let value='';Object.defineProperty(e,key,{get:()=>value,set:v=>{value=v;counts.domWrites++;}});}
    return e;
  }
  function element(id){if(!elements.has(id))elements.set(id,make(id));return elements.get(id);}
  const document={hidden:false,getElementById:element,createElement:tag=>canvasModule&&tag==='canvas'?canvasModule.createCanvas(1,1):make(tag),body:element('body'),querySelector:element,
    addEventListener:(name,fn)=>{listeners['document:'+name]=fn;}};
  const sandbox={console,ReplayCore:require('../replay-core.js'),TraceRenderer:require('../trace-renderer.js'),document,
    innerWidth:1200,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false}),
    addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},
    cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>clock},setTimeout:noop,clearTimeout:noop,
    URLSearchParams,URL,location:{search:''},Float32Array,Uint8ClampedArray,
    Option:function(text,value){this.text=text;this.value=value;},
    Path2D:canvasModule?canvasModule.Path2D:function(){this.moveTo=noop;this.lineTo=noop;this.addPath=noop;}};
  sandbox.window=sandbox;vm.createContext(sandbox);
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  vm.runInContext([...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'),sandbox);
  const app=sandbox.OCM,S=app.S;
  app.applyImages(canvasModule?canvasModule.createCanvas(750,1050):{width:750,height:1050},
    canvasModule?canvasModule.createCanvas(750,1050):{width:750,height:1050});
  function tick(dt=1000/60){clock+=dt;const batch=[...frames.values()];frames.clear();for(const fn of batch){counts.rafCalls++;fn(clock);}}
  return {app,S,counts,elements,listeners,document,tick,pending:()=>frames.size};
};
