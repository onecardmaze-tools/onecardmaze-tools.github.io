/* Serial, visible Chrome regression test; no performance timing in this suite.
 * PLAYWRIGHT_MODULE=/absolute/playwright OCM_BASELINE_ROOT=/baseline/copy \
 * OCM_ROOT=/production/copy node tests/browser-regression.cjs
 * Optional CHROME_PATH, OCM_OUTPUT_DIR, OCM_WIDTH, OCM_HEIGHT, OCM_DPR.
 * Baseline and production run sequentially. Outputs include assertions and PNGs.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.OCM_ROOT||path.join(__dirname,'..'));
const baseline=process.env.OCM_BASELINE_ROOT&&path.resolve(process.env.OCM_BASELINE_ROOT);
const output=path.resolve(process.env.OCM_OUTPUT_DIR||path.join(root,'benchmarks/browser-regression'));
const width=+(process.env.OCM_WIDTH||3008),height=+(process.env.OCM_HEIGHT||1492),dpr=+(process.env.OCM_DPR||2);
fs.mkdirSync(output,{recursive:true});
const results={conditions:{width,height,dpr,method:'Deterministic browser functional checks and screenshot coverage comparisons; not a performance benchmark'},runs:[],comparisons:[]};
function serve(root){const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));}
function initProbe(){
 const nativeRAF=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window),pending=new Set(),contexts=[];
 window.__probe={contexts,callbacks:0,pending,pause(){this.paused=true;for(const id of pending)nativeCancel(id);pending.clear();},resume(){this.paused=false;},paused:false};
 window.requestAnimationFrame=fn=>{if(__probe.paused)return 0;const id=nativeRAF(t=>{pending.delete(id);__probe.callbacks++;fn(t);});pending.add(id);return id;};
 window.cancelAnimationFrame=id=>{pending.delete(id);nativeCancel(id);};
 const original=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type,...args){const ctx=original.call(this,type,...args);if(ctx&&/^webgl|experimental-webgl/.test(type)&&!contexts.includes(ctx))contexts.push(ctx);return ctx;};
}
function fixture(){
 const a=OCM,S=a.S,front=document.createElement('canvas'),back=document.createElement('canvas');
 front.width=back.width=750;front.height=back.height=1050;
 for(const [cv,color] of [[front,'#bed9d1'],[back,'#d8c9b6']]){const g=cv.getContext('2d');g.fillStyle=color;g.fillRect(0,0,750,1050);g.strokeStyle='#172b42';g.lineWidth=4;for(let i=20;i<750;i+=30){g.beginPath();g.moveTo(i,10);g.lineTo(i,1040);g.stroke();}}
 a.applyImages(front,back);document.getElementById('loader').classList.add('hidden');
 S.started=true;S.play=0;S.review=false;S.follow=false;S.rotQ0=0;S.rot=S.rotTarget=0;S.manualPivot=null;S.phase=null;S.keys=Object.create(null);
 S.trail=Array.from({length:48},(_,k)=>({x:100+(k*67)%540,y:100+(k*109)%840,r:Math.floor(k/12)%4}));S.spins=[];S.cursor=47;S.replayVersion++;S.zoom=.888095238095238;S.cam={x:375,y:525};S.walker={...S.trail[47],tx:null,ty:null};
 a.refreshTrace();for(let k=0;k<240;k++)a.update(.05);S.cam={x:375,y:525};S.rot=S.rotTarget=0;a.render();
 const style=document.createElement('style');style.textContent='body > :not(canvas):not(script):not(style) { visibility:hidden!important; }';document.head.append(style);
}
function assertGL(){const out=[];for(const gl of __probe.contexts){if(gl.isContextLost())throw Error('Unexpected lost '+gl.canvas.id+' context');let e=gl.getError();if(e!==gl.NO_ERROR)throw Error('GL error '+e+' in '+gl.canvas.id);out.push({canvas:gl.canvas.id,antialias:gl.getContextAttributes().antialias});}if(!out.length)throw Error('No WebGL renderer');return out;}
function geometryAssertions(){const a=OCM,S=a.S;for(const world of [{x:-801,y:-1100},{x:0,y:0},{x:750,y:1050},{x:1500,y:-1050}]){const p=a.w2s(world.x,world.y),q=a.s2w(p.x,p.y);if(Math.hypot(q.x-world.x,q.y-world.y)>1e-6)throw Error('World transform round trip');}for(const m of S.markers){let copies=0;for(const p of a.markerCopies(m)){const w=a.s2w(p.x,p.y),c=ReplayCore.canonical(w,p.i,p.j,S.W,S.H);if(Math.abs(c.x/S.W-m.u)>1e-6||Math.abs(c.y/S.H-m.v)>1e-6)throw Error('Marker canonical position changed');copies++;}if(!copies)throw Error('Marker has no tile copies');}return true;}
function backendAssertions() {
  function check(condition, message, detail) {
    if (!condition) throw Error('Analytic backend: ' + message + (detail ? ' ' + JSON.stringify(detail) : ''));
  }
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.id = 'backend-regression-probe';
  canvas.width = canvas.height = size;
  canvas.style.cssText = 'position:fixed;left:-1000px;top:-1000px;width:96px;height:96px;pointer-events:none';
  document.body.appendChild(canvas);
  let renderer, gl, originalBufferData, originalBufferSubData;
  try {
    check(typeof GPURenderer !== 'undefined', 'Production GPURenderer must be loaded');
    renderer = GPURenderer.create(canvas);
    check(renderer.mode === 'webgl-analytic', 'Test must exercise WebGL analytic paths, not the Canvas fallback', {mode: renderer.mode});
    const g = renderer.context;
    gl = g.gl;
    const attributes = gl.getContextAttributes();
    check(attributes && attributes.antialias === false, 'Default framebuffer MSAA must be disabled', attributes);
    const samples = gl.getParameter(gl.SAMPLES);
    check(samples === 0, 'Default framebuffer must have no MSAA samples', {samples});
    check(gl.getError() === gl.NO_ERROR, 'Initialization must produce no GL error');

    // Observe actual upload API calls as well as the renderer counters. Merely
    // checking a renderer metric could conceal an uncounted buffer upload.
    const uploads = {bufferData: 0, bufferSubData: 0};
    originalBufferData = gl.bufferData;
    originalBufferSubData = gl.bufferSubData;
    gl.bufferData = function(...args) { uploads.bufferData++; return originalBufferData.apply(this, args); };
    gl.bufferSubData = function(...args) { uploads.bufferSubData++; return originalBufferSubData.apply(this, args); };
    const path = new renderer.Path();
    path.moveTo(20.5, 20.5); path.lineTo(76.5, 76.5);
    path.moveTo(20.5, 76.5); path.lineTo(76.5, 20.5);
    // The two subpaths intersect at a physical pixel center; their round caps
    // and fractional width also expose a real analytic coverage fringe.
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 10.25;
    g.strokeStyle = '#ff8844';
    g.globalAlpha = .5;
    g.clearRect(0, 0, size, size);
    g.stroke(path);
    renderer.flush();
    function read() {
      const data = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, data);
      check(gl.getError() === gl.NO_ERROR, 'Rendering/readPixels must produce no GL error');
      return data;
    }
    function pixel(data, x, y) {
      // Canvas uses downward Y; readPixels returns the bottom row first.
      const at = ((size - 1 - y) * size + x) * 4;
      return Array.from(data.slice(at, at + 4));
    }
    function coverage(data) {
      let nonzero = 0, intermediate = 0, solid = 0, maxAlpha = 0;
      for (let at = 3; at < data.length; at += 4) {
        const a = data[at];
        if (a) nonzero++;
        if (a >= 4 && a <= 123) intermediate++;
        if (a >= 126 && a <= 129) solid++;
        maxAlpha = Math.max(maxAlpha, a);
      }
      return {nonzero, intermediate, solid, maxAlpha};
    }
    const initial = read();
    const intersection = pixel(initial, 48, 48), isolated = pixel(initial, 28, 28), cap = pixel(initial, 20, 20);
    const initialCoverage = coverage(initial);
    check(Math.abs(isolated[3] - 128) <= 1, 'A single interior segment must retain 50% opacity', {isolated});
    check(Math.abs(intersection[3] - isolated[3]) <= 1, 'Crossing subpaths within one stroke must blend only once', {intersection, isolated});
    check(Math.abs(cap[3] - isolated[3]) <= 1, 'Round caps must retain the same opacity', {cap, isolated});
    check(initialCoverage.maxAlpha <= 129, 'No pixel in a single stroke may accumulate alpha at overlaps', initialCoverage);
    check(initialCoverage.intermediate > 40 && initialCoverage.solid > 100, 'Analytic edges need intermediate coverage and opaque stroke interiors', initialCoverage);
    check(pixel(initial, 2, 2)[3] === 0, 'Pixels outside the path must remain transparent');
    // Confirm that union applies per stroke, not globally across separate calls.
    g.stroke(path);
    renderer.flush();
    const secondIntersection = pixel(read(), 48, 48);
    check(Math.abs(secondIntersection[3] - 192) <= 2, 'Two separate 50% strokes must source-over to 75% opacity', {secondIntersection});

    const uploadBaseline = {...uploads};
    const metricBaseline = {uploads: g.metrics.uploads, cacheHits: g.metrics.cacheHits};
    check(uploadBaseline.bufferData > 0, 'Initial stroke must upload retained geometry', uploadBaseline);
    const transformations = [];
    for (const [angle, lineWidth, scale] of [[0, 6.5, 1], [.37, 14.25, 1], [1.2, 9, .8]]) {
      g.clearRect(0, 0, size, size);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.translate(48.5, 48.5);
      g.rotate(angle);
      g.scale(scale, scale);
      g.translate(-48.5, -48.5);
      g.lineWidth = lineWidth;
      g.stroke(path);
      renderer.flush();
      const data = read(), center = pixel(data, 48, 48), shape = coverage(data);
      check(Math.abs(center[3] - 128) <= 1, 'Transform must preserve the path crossing and opacity', {angle, lineWidth, scale, center});
      check(shape.intermediate > 25 && shape.maxAlpha <= 129, 'Transformed edges must remain antialiased without opacity buildup', {angle, lineWidth, scale, ...shape});
      check(uploads.bufferData === uploadBaseline.bufferData && uploads.bufferSubData === uploadBaseline.bufferSubData,
        'Rotation, zoom and line width must reuse VBOs without uploads', {angle, lineWidth, scale, uploadBaseline, uploads});
      check(g.metrics.uploads === metricBaseline.uploads, 'Renderer upload counter must remain stable');
      transformations.push({angle, lineWidth, scale, ...shape});
    }
    check(transformations[1].nonzero > transformations[0].nonzero * 1.4, 'Changing line width must visibly alter coverage while retaining the VBO', transformations);
    check(g.metrics.cacheHits >= metricBaseline.cacheHits + transformations.length, 'Each transformed draw must reuse retained geometry');
    return {
      canvas: [size, size], antialias: attributes.antialias, samples,
      opacity: {intersection, isolated, cap, secondIntersection},
      initialCoverage, uploads: {...uploads}, transformations,
      cacheHitsAdded: g.metrics.cacheHits - metricBaseline.cacheHits
    };
  } finally {
    if (gl && originalBufferData) gl.bufferData = originalBufferData;
    if (gl && originalBufferSubData) gl.bufferSubData = originalBufferSubData;
    if (renderer) renderer.dispose();
    // Test instrumentation records every acquired context. Remove this disposed
    // fixture from its inventory so later app-only checks remain meaningful.
    if (gl && window.__probe && Array.isArray(window.__probe.contexts)) {
      const at = window.__probe.contexts.indexOf(gl);
      if (at >= 0) window.__probe.contexts.splice(at, 1);
    }
    if (renderer && renderer.canvas !== canvas) renderer.canvas.remove();
    canvas.remove();
  }
}

async function run(browser,which,dir){const server=await serve(dir),context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await context.newPage();const run={which,root:dir,scenes:[],errors:[],checks:{}};results.runs.push(run);
 page.on('pageerror',e=>run.errors.push(e.message));await page.addInitScript(initProbe);
 try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?demo');await page.bringToFront();await page.waitForFunction(()=>window.OCM);await page.evaluate(async()=>{await OCM.startup;const help=document.getElementById('help');if(help?.open)help.close();});await page.evaluate(fixture);if(which==='current')assert.equal(await page.evaluate(()=>OCM.foreground.mode),'webgl-analytic');await page.waitForTimeout(1000);await page.evaluate(()=>__probe.pause());
 async function shot(name,change){if(change)await page.evaluate(change);await page.evaluate(()=>OCM.render());await page.evaluate(geometryAssertions);run.checks.gl=await page.evaluate(assertGL);const file=path.join(output,which+'-'+name+'.png');await page.screenshot({path:file,animations:'disabled'});run.scenes.push({name,file,viewport:page.viewportSize(),regions:await page.evaluate(()=>OCM.S.markers.flatMap(m=>OCM.markerCopies(m).filter(p=>p.x>60&&p.x<innerWidth-60&&p.y>60&&p.y<innerHeight-60).map(p=>({shape:m.shape,x:p.x,y:p.y,width:110,height:90}))))});}
 await shot('dense-0');
 await shot('dense-rotation',()=>{OCM.S.rot=OCM.S.rotTarget=.43;});
 await shot('negative-seams',()=>{const a=OCM,S=a.S;S.trail=[{x:-900,y:-1200,r:0},{x:100,y:100,r:0},{x:750,y:100,r:1},{x:900,y:600,r:1},{x:450,y:600,r:2},{x:450,y:1200,r:2},{x:-50,y:1000,r:3}];S.cursor=6;S.walker={x:-50,y:1000,tx:null,ty:null};S.replayVersion++;S.rot=S.rotTarget=-.83;a.refreshTrace();});
 await shot('markers-text',()=>{const a=OCM,S=a.S;S.rot=S.rotTarget=.21;a.restoreMarkers(['circle','diamond','square','triangle','star'].map((shape,i)=>({face:0,u:.18+i*.16,v:.35+(i%2)*.26,shape,color:['#ef476f','#ffd166','#06d6a0','#118ab2','#b06bff'][i],label:['Circle','菱形 B','Square 3','Triangle','★ Star'][i]})));});
 await shot('zoom-in',()=>{OCM.S.zoom=1.65;});
 await shot('zoom-out',()=>{OCM.S.zoom=.45;});
 await page.setViewportSize({width:900,height:720});await shot('resized',()=>{OCM.resize();OCM.S.zoom=.65;});await page.setViewportSize({width,height});await page.evaluate(()=>OCM.resize());
 // Real production state machine, rendered at each event type and direction.
 run.checks.replay=await page.evaluate(()=>{const a=OCM,S=a.S;a.clearWalk();S.ready=S.started=true;S.rot=S.rotTarget=S.rotQ0=0;S.trail=[{x:375,y:525,r:0},{x:675,y:525,r:0},{x:825,y:525,r:0},{x:1050,y:680,r:0},{x:1125,y:900,r:1},{x:1125,y:1155,r:1},{x:1238,y:1628,r:1}];S.spins=[{i:3,q:1},{i:6,q:3}];S.cursor=6;S.replayVersion++;S.replaySpeed=4;S.zoom=.7;a.refreshTrace();a.setCursor(6);const recording=JSON.stringify({trail:S.trail,spins:S.spins}),counts=[];for(const dir of [1,-1]){a.play(dir);const events=new Set();let ticks=0;while(S.play&&ticks++<5000){a.update(.02);if(S.phase&&!events.has(S.phase.event.id)){events.add(S.phase.event.id);a.render();}}if(S.play||!S.reviewDone||Math.abs(S.cursor-(dir===1?6:0))>1e-6)throw Error('Replay failed to reach endpoint '+dir);if(events.size!==a.replayModel().events.length)throw Error('Replay skipped event '+dir);if(JSON.stringify({trail:S.trail,spins:S.spins})!==recording)throw Error('Replay mutated recording');counts.push({dir,ticks,events:[...events]});}return counts;});
 await shot('forward-replay',()=>{const a=OCM,S=a.S;S.reviewDir=1;a.setCursor(2.4);S.rot=S.rotTarget;S.cam={x:1125,y:525};S.follow=false;});
 await shot('reverse-replay',()=>{const a=OCM,S=a.S;S.reviewDir=-1;a.setCursor(4.6);S.rot=S.rotTarget;S.cam={x:1125,y:1050};S.follow=false;});
 // A lost/restored context must redraw both artwork and all foreground resources.
 await shot('before-context-loss');
 run.checks.contextRecovery=[];
 const count=which==='current'?await page.evaluate(()=>__probe.contexts.length):0;
 for(let i=0;i<count;i++){
  const supported=await page.evaluate(i=>{const gl=__probe.contexts[i],ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false;window.__loss={gl,ext,lost:false,restored:false};gl.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();__loss.lost=true;},{once:true});gl.canvas.addEventListener('webglcontextrestored',()=>{__loss.restored=true;},{once:true});ext.loseContext();return true;},i);
  assert(supported,'WEBGL_lose_context is required to validate production recovery');await page.waitForFunction(()=>__loss.lost);await page.evaluate(()=>__loss.ext.restoreContext());await page.waitForFunction(()=>__loss.restored);await page.evaluate(()=>OCM.render());run.checks.contextRecovery.push(i);
 }
 if(which==='current')await page.evaluate(()=>{OCM.resize();OCM.render();OCM.resize();OCM.render();});
 await shot('after-context-loss');
 if(which==='current')run.checks.backend=await page.evaluate(backendAssertions);
 // Resume native scheduling and require the production scheduler to reach zero.
 await page.evaluate(()=>{const S=OCM.S;S.play=0;S.review=false;S.follow=false;S.phase=null;S.manualPivot=null;S.keys=Object.create(null);S.walker.tx=S.walker.ty=null;S.rotTarget=S.rot;__probe.resume();window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});
 await page.waitForTimeout(500);await page.waitForFunction(()=>__probe.pending.size===0,{},{timeout:15000});const before=await page.evaluate(()=>({n:__probe.callbacks,pending:__probe.pending.size}));await page.waitForTimeout(500);const after=await page.evaluate(()=>({n:__probe.callbacks,pending:__probe.pending.size}));assert.equal(after.pending,0,'Idle app must not schedule RAF');assert.equal(after.n,before.n,'Idle app must execute no RAF');run.checks.idle={before,after};assert.deepEqual(run.errors,[],'No uncaught browser errors');return run;
 }finally{await context.close();await new Promise(r=>server.close(r));}}
async function compare(page,a,b,{same=false,regions=[]}={}){
 const data=await page.evaluate(async({a,b,regions})=>{
  async function decode(src){const img=await createImageBitmap(await(await fetch('data:image/png;base64,'+src)).blob());const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return {w:img.width,h:img.height,p:g.getImageData(0,0,img.width,img.height).data};}
  const A=await decode(a),B=await decode(b);if(A.w!==B.w||A.h!==B.h)throw Error('Screenshot dimensions differ');
  const w=A.w,h=A.h;let sum=0,bad=0,total=0;const histogram=new Uint32Array(256);
  for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){let error=0;for(let c=0;c<3;c++){let av=0,bv=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){av+=A.p[((y+dy)*w+x+dx)*4+c];bv+=B.p[((y+dy)*w+x+dx)*4+c];}error+=Math.abs(av-bv)/27;}histogram[Math.round(error)]++;sum+=error;bad+=error>30;total++;}
  function colorful(p,i){const r=p[i],g=p[i+1],b=p[i+2];return Math.max(r,g,b)-Math.min(r,g,b)>65&&Math.max(r,g,b)>110;}
  function coverage(source,target,box,white=false){let ink=0,missed=0;const x0=Math.max(2,Math.floor(box.x0)),x1=Math.min(w-2,Math.ceil(box.x1)),y0=Math.max(2,Math.floor(box.y0)),y1=Math.min(h-2,Math.ceil(box.y1));for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const i=(y*w+x)*4;if(white?Math.min(source[i],source[i+1],source[i+2])<230:!colorful(source,i))continue;ink++;let match=false;for(let dy=-2;dy<=2&&!match;dy++)for(let dx=-2;dx<=2;dx++){const j=((y+dy)*w+x+dx)*4;if(Math.abs(source[i]-target[j])+Math.abs(source[i+1]-target[j+1])+Math.abs(source[i+2]-target[j+2])<95){match=true;break;}}if(!match)missed++;}return{ink,missed,recall:ink?1-missed/ink:1};}
  const all={x0:0,y0:0,x1:w,y1:h};let n=0,p99=0;for(let i=0;i<256;i++){n+=histogram[i];if(n>=total*.99){p99=i;break;}}
  return {width:w,height:h,blurredMeanError:sum/total,p99Error:p99,over30Fraction:bad/total,referenceInk:coverage(A.p,B.p,all),currentInk:coverage(B.p,A.p,all),regions:regions.map(r=>({shape:r.shape,...coverage(A.p,B.p,{x0:(r.x-r.width/2)*devicePixelRatio,y0:(r.y-25)*devicePixelRatio,x1:(r.x+r.width/2)*devicePixelRatio,y1:(r.y+65)*devicePixelRatio}),label:coverage(A.p,B.p,{x0:(r.x-r.width/2)*devicePixelRatio,y0:(r.y+24)*devicePixelRatio,x1:(r.x+r.width/2)*devicePixelRatio,y1:(r.y+42)*devicePixelRatio},true)}))};
 },{a:fs.readFileSync(a).toString('base64'),b:fs.readFileSync(b).toString('base64'),regions});
 assert(data.blurredMeanError<(same?.7:4),'Mean visual error exceeds threshold: '+JSON.stringify(data));assert(data.over30Fraction<(same?.002:.03),'Large visual changes exceed 3% pixel budget: '+JSON.stringify(data));assert(data.referenceInk.recall>(same?.995:.94),'Reference colored ink missing: '+JSON.stringify(data));assert(data.currentInk.recall>(same?.995:.94),'Unexpected colored ink: '+JSON.stringify(data));for(const r of data.regions){assert(r.ink<12||r.recall>.90,'Marker coverage failed '+JSON.stringify(r));assert(r.label.ink<8||r.label.recall>.85,'Marker label coverage failed '+JSON.stringify(r));}return data;
}
(async()=>{let browser;try{browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:['--no-first-run','--no-default-browser-check']});const old=baseline?await run(browser,'baseline',baseline):null,current=await run(browser,'current',root),context=await browser.newContext({deviceScaleFactor:dpr}),page=await context.newPage();for(const run of results.runs){const a=run.scenes.find(s=>s.name==='before-context-loss'),b=run.scenes.find(s=>s.name==='after-context-loss');results.comparisons.push({kind:'context-recovery',which:run.which,...await compare(page,a.file,b.file,{same:true})});}if(old){for(const scene of old.scenes){const candidate=current.scenes.find(s=>s.name===scene.name);assert(candidate,'Missing candidate scene '+scene.name);results.comparisons.push({kind:'baseline',name:scene.name,...await compare(page,scene.file,candidate.file,{regions:scene.regions})});}}else results.warning='No OCM_BASELINE_ROOT: functionality and recovery validated; equivalent visual quality NOT established.';await context.close();results.passed=true;console.log(JSON.stringify(results,null,2));}catch(error){results.passed=false;results.failure=error.stack;console.error(error);process.exitCode=1;}finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));if(browser)await browser.close();}})();
