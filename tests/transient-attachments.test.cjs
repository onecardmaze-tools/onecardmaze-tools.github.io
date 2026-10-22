/* CPU-only command-order tests; no WebGL implementation is started. */
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict,path=require('path');
const source=process.argv[2]||path.join(__dirname,'..','gpu-renderer.js');
class WebGL2RenderingContext {}
function setup(webgl2) {
  const calls=[];let reportedLost=false;
  const gl=new Proxy(webgl2?new WebGL2RenderingContext():{}, {get(target,key){
    if(key==='isContextLost')return()=>reportedLost;
    if(key==='getExtension')return()=>({});
    if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
    if(key==='getUniformLocation')return(_,name)=>name;
    if(key==='getAttribLocation')return(_,name)=>({aPosition:0,aColor:1,aUv:2,aStart:0,aEnd:1,aCorner:2,aCaps:3}[name]);
    if(/^[A-Z_]+$/.test(key))return key;
    if(/^create/.test(key))return()=>({});
    return(...args)=>calls.push([key,...args]);
  }});
  const handlers={},window={};
  vm.runInNewContext(fs.readFileSync(source,'utf8'),{window,WebGL2RenderingContext,Math,Float32Array,Map,Set,WeakMap,Number});
  const renderer=window.GPURenderer.create({width:100,height:100,
    getContext:name=>name===(webgl2?'webgl2':'webgl')?gl:null,
    addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name]});
  return {renderer,calls,handlers,setLost:value=>reportedLost=value};
}
const test=setup(true),ctx=test.renderer.context;
ctx.drawImage({width:2,height:2},0,0);
test.renderer.endFrame();
const end=test.calls[test.calls.length-1];
assert.equal(end[0],'invalidateFramebuffer');
assert.equal(end[1],'FRAMEBUFFER');
assert.deepEqual(Array.from(end[2]),['DEPTH','STENCIL'],'Color must survive presentation');
assert(test.calls.some(c=>c[0]==='drawArrays'),'Queued sprites must render before discarding transient attachments');
let invalidations=test.calls.filter(c=>c[0]==='invalidateFramebuffer').length;
ctx.drawImage({width:2,height:2},0,0);test.renderer.flush();
assert.equal(test.calls.filter(c=>c[0]==='invalidateFramebuffer').length,invalidations,'Ordinary flush preserves same-frame stroke depth/stencil');
test.setLost(true);let count=test.calls.length;test.renderer.endFrame();assert.equal(test.calls.length,count,'Guard loss before its DOM event');
test.handlers.webglcontextlost({preventDefault(){}});count=test.calls.length;test.renderer.endFrame();assert.equal(test.calls.length,count,'Guard delivered context loss');
test.renderer.dispose();test.renderer.endFrame();assert.equal(test.calls.length,count);
const legacy=setup(false);legacy.renderer.context.drawImage({width:2,height:2},0,0);legacy.renderer.endFrame();
assert(legacy.calls.some(c=>c[0]==='drawArrays'),'WebGL1 still flushes final queued drawing');
assert(!legacy.calls.some(c=>c[0]==='invalidateFramebuffer'),'WebGL1 must not invoke the WebGL2 hint');
console.log('Frame-end attachment checks passed: flush-before-discard, color retained, ordinary flush unchanged, WebGL1 fallback and loss/disposal guards.');
