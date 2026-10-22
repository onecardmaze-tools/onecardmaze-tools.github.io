/* Mock command-order/lifecycle tests only; this file starts no browser/GPU. */
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict,path=require('path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','gpu-renderer.js'),'utf8');
class WebGL2RenderingContext {}
function fixture({borrowed=true,depth=true,stencil=true,power='high-performance'}={}) {
  const calls=[],listeners={},requests=[],errors=[];let serial=0,lost=false,failCompile=false;
  const constants={COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,STENCIL_BUFFER_BIT:4};
  const canvas={width:6016,height:2984,getContext(name,options){requests.push({name,options});return name==='webgl2'?gl:null;},cloneNode(){throw Error('Shared stage must never be replaced');},addEventListener(name,fn){listeners[name]=fn},removeEventListener(name){delete listeners[name]}};
  const gl=new Proxy(new WebGL2RenderingContext(),{get(target,key){
    if(key==='canvas')return canvas;
    if(key==='isContextLost')return()=>lost;
    if(key==='getContextAttributes')return()=>({depth,stencil,alpha:false,antialias:false});
    if(key==='getShaderParameter')return()=>!failCompile;
    if(key==='getProgramParameter')return()=>true;
    if(key==='getShaderInfoLog')return()=> 'deliberate shader failure';
    if(key==='getExtension')return()=>({});
    if(key==='getUniformLocation')return(_,name)=>name;
    if(key==='getAttribLocation')return(_,name)=>({aPosition:0,aColor:1,aUv:2,aStart:0,aEnd:1,aCorner:2,aCaps:3}[name]);
    if(key in constants)return constants[key];
    if(/^[A-Z_]+$/.test(key))return key;
    if(/^create/.test(key))return()=>{const resource={kind:key,id:++serial};calls.push([key,resource]);return resource};
    return(...args)=>calls.push([key,...args]);
  }});
  const window={};vm.runInNewContext(source,{window,WebGL2RenderingContext,Math,Float32Array,Map,Set,WeakMap,Number});
  const options={powerPreference:power,onError:e=>errors.push(e)};
  if(borrowed)Object.assign(options,{gl,preserveColor:true});
  return {construct:()=>window.GPURenderer.create(canvas,options),calls,listeners,requests,errors,gl,canvas,setLost:v=>lost=v,setFailCompile:v=>failCompile=v};
}
const f=fixture(),renderer=f.construct(),ctx=renderer.context;
assert.equal(renderer.canvas,f.canvas);assert.equal(ctx.gl,f.gl);assert.equal(f.requests.length,0,'Borrowed context must not allocate a second GL context');
const vao=ctx.vertexArray;assert(vao);
f.gl.bindVertexArray(null);ctx.clearRect();
assert(f.calls.some(c=>c[0]==='bindVertexArray'&&c[1]===vao),'Overlay must restore its own attribute state');
assert.equal(f.calls.filter(c=>c[0]==='clear').pop()[1],6,'Shared clear must retain color');
renderer.resize();assert.equal(f.calls.filter(c=>c[0]==='clear').pop()[1],6,'Resize must also retain color');
let start=f.calls.length;renderer.endFrame();
let last=f.calls[f.calls.length-1];assert.equal(last[0],'invalidateFramebuffer');assert.deepEqual(Array.from(last[2]),['DEPTH','STENCIL']);assert(!f.calls.slice(start).some(c=>c[0]==='drawArrays'),'Empty overlay need not invent a stroke');
f.gl.disable(f.gl.BLEND);start=f.calls.length;ctx.drawImage({width:2,height:2},0,0);renderer.endFrame();
const sprite=f.calls.slice(start),draw=sprite.findIndex(c=>c[0]==='drawArrays');assert(draw>=0);
assert(sprite.slice(0,draw).some(c=>c[0]==='enable'&&c[1]==='BLEND'),'Sprite-only frames explicitly restore blending');
assert(sprite.slice(0,draw).some(c=>c[0]==='blendFuncSeparate'&&c[1]==='ONE'&&c[2]==='ONE_MINUS_SRC_ALPHA'),'Sprite-only frames use premultiplied source-over');
assert.equal(sprite[sprite.length-1][0],'invalidateFramebuffer','Discard must follow all drawing');
const oldProgram=ctx.program,oldVAO=ctx.vertexArray;
f.setLost(true);start=f.calls.length;renderer.endFrame();assert.equal(f.calls.length,start,'Early loss is guarded before the DOM event');
f.listeners.webglcontextlost({preventDefault(){}});start=f.calls.length;ctx.clearRect();renderer.flush();renderer.endFrame();assert.equal(f.calls.length,start,'DOM loss suppresses overlay GL calls');
f.setLost(false);f.listeners.webglcontextrestored();assert.equal(renderer.context,ctx,'Public proxy survives restore');assert.notEqual(ctx.program,oldProgram);assert.notEqual(ctx.vertexArray,oldVAO);assert.equal(f.requests.length,0,'Restore borrows the same recovered GL');
assert(!f.calls.slice(start).some(c=>c[0]==='deleteProgram'&&c[1]===oldProgram),'Do not delete an old-generation program after restore');
const restoredVAO=ctx.vertexArray;renderer.dispose();assert(f.calls.some(c=>c[0]==='deleteVertexArray'&&c[1]===restoredVAO));start=f.calls.length;renderer.endFrame();assert.equal(f.calls.length,start);
const owned=fixture({borrowed:false,power:'low-power'}),ownedRenderer=owned.construct();assert.equal(owned.requests[0].options.powerPreference,'low-power','Fallback uses the caller power preference');ownedRenderer.context.clearRect();assert.equal(owned.calls.filter(c=>c[0]==='clear').pop()[1],7,'Independent overlay still clears color');ownedRenderer.dispose();
const invalid=fixture({stencil:false});assert.throws(invalid.construct,/Shared analytic rendering/);assert.equal(invalid.requests.length,0,'Shared capability failure cannot replace/reacquire the stage');
const recovery=fixture(),r=recovery.construct();recovery.listeners.webglcontextlost({preventDefault(){}});recovery.setFailCompile(true);recovery.listeners.webglcontextrestored();assert.equal(r.mode,'webgl-lost');assert(r.error);assert.equal(recovery.errors.length,1,'Restore failure is reported');
console.log('Shared context command ordering and lifecycle checks passed.');
