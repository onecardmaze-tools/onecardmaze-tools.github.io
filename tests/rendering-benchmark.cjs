/* Serial, visible Chrome rendering experiment. No npm install or private artwork.
   PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/rendering-benchmark.cjs
   Optional: OCM_ROOT, OCM_MODES, OCM_WORKLOADS, OCM_WIDTH, OCM_HEIGHT, OCM_DPR,
   OCM_OUTPUT, OCM_FRAMES=120, OCM_ROUNDS=1, OCM_CYCLES=1, OCM_NATIVE_DRIVER=1, CHROME_PATH.
   Native mode runs update(1/60)+render INSIDE the RAF callback; GPU timers
   default OFF in native mode (set OCM_GPU_TIMERS=1 to enable). It adds real
   target walking/camera/card updates and replay with a spin event, so native
   results are a separate application-workload test, not identical microbenchmark motion.
   OCM_CYCLES=15 repeats the same 120 measured motion frames after 20 warmup frames.
   Reset CPU/GPU work and affected RAF intervals are separately reported; inclusive
   RAF statistics retain resets. RAF cadence is NOT confirmed frame presentation.
   See RENDERING-INVESTIGATION.md for the original one-cycle fixture. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.OCM_ROOT||path.join(__dirname,'..'));
const output=process.env.OCM_OUTPUT||path.join(root,'benchmarks/rendering-run.json');
const width=+(process.env.OCM_WIDTH||1504),height=+(process.env.OCM_HEIGHT||1492),dpr=+(process.env.OCM_DPR||2);
const nativeDriver=process.env.OCM_NATIVE_DRIVER==='1';
const gpuTimers=process.env.OCM_GPU_TIMERS===undefined?!nativeDriver:process.env.OCM_GPU_TIMERS!=='0';
const modes=(process.env.OCM_MODES||'empty,full,no-overlay,no-static,no-stamps,no-art,art-only,full').split(',');
const workloads=(process.env.OCM_WORKLOADS||'rotate').split(',');
const frames=+(process.env.OCM_FRAMES||120),rounds=+(process.env.OCM_ROUNDS||1),cycles=+(process.env.OCM_CYCLES||1);
for(const [name,value] of Object.entries({frames,rounds,cycles}))if(!Number.isInteger(value)||value<1)throw Error(name+' must be a positive integer');
function instrument(s){return s.replace('function drawReplayLayer() {','function drawReplayLayer() {\n if(window.probeMode==="no-overlay"){if(typeof drawStaticTrace==="function")drawStaticTrace();else {const g=replayCtx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,replayCanvas.width,replayCanvas.height);g.scale(dpr,dpr);g.save();worldTransform(g);drawTrace(g);g.restore();}return;} if(window.probeMode==="art-only"||window.probeMode==="empty")return;')
.replace('function drawStaticTrace() {','function drawStaticTrace() {\n if(window.probeMode==="no-static")return;')
.replace('function drawTrace(g) {','function drawTrace(g) {\n if(window.probeMode==="no-static")return;')
.replace('function render() {','function render() {\n if(window.probeMode==="empty")return;')
.replace(/gl\.drawArrays\(gl\.TRIANGLES,\s*0,\s*6\);/g,'if(window.probeMode!=="no-art")gl.drawArrays(gl.TRIANGLES,0,6);')
.replace('drawTraceStamps(g);','if(window.probeMode!=="no-stamps")drawTraceStamps(g);');}
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{let content=fs.readFileSync(file);if(file.endsWith('index.html'))content=instrument(content.toString());res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(content);}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:['--no-first-run','--no-default-browser-check'],timeout:60000});
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
 for(let round=0;round<rounds;round++)for(const workload of workloads)for(const mode of modes){
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.bringToFront();
  let traceSession;
  if(process.env.OCM_TRACE){
   traceSession=await page.context().newCDPSession(page);
   await traceSession.send('Tracing.start',{categories:'benchmark,cc,viz,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline.frame',transferMode:'ReturnAsStream'});
  }
  const result=await page.evaluate(async({mode,workload,frames,cycles,gpuTimers,nativeDriver})=>{
   const app=OCM,S=app.S,cv=document.createElement('canvas');cv.width=750;cv.height=1050;const g=cv.getContext('2d');g.fillStyle='#bed9d1';g.fillRect(0,0,750,1050);g.strokeStyle='#172b42';g.lineWidth=4;for(let i=20;i<750;i+=30){g.beginPath();g.moveTo(i,10);g.lineTo(i,1040);g.stroke();}
   app.applyImages(cv,cv);document.getElementById('loader').classList.add('hidden');S.started=true;S.trail=Array.from({length:48},(_,k)=>({x:100+(k*67)%540,y:100+(k*109)%840,r:Math.floor(k/12)%4}));S.cursor=47;S.spins=[];S.rotQ0=0;S.review=false;S.play=0;S.follow=false;S.zoom=.888095238095238;S.cam={x:375,y:525};S.walker={...S.trail[47],tx:null,ty:null};app.refreshTrace();for(let k=0;k<240;k++)app.update(.05);app.render();
   const nativeRAF=requestAnimationFrame;await new Promise(r=>setTimeout(r,500));window.requestAnimationFrame=()=>0;if(nativeDriver)window.dispatchEvent(new Event('pagehide'));window.probeMode=mode;
   const separateHistory=!!document.getElementById('traceLayer');
   for(const id of(mode==='no-overlay'&&separateHistory?['replayLayer']:mode==='no-static'?['traceLayer']:mode==='art-only'||mode==='empty'?['traceLayer','replayLayer']:[])){const element=document.getElementById(id);if(element)element.style.display='none';}
   if(workload==='replay'){
    if(nativeDriver){S.spins=[{i:1,q:1}];S.replayVersion++;S.replaySpeed=1;app.refreshTrace();app.play(1);}
    else {S.review=true;S.reviewDir=1;S.cursor=30.2;}
   }
   const driverState={waypoint:0},waypoints=[{x:220,y:300},{x:550,y:300},{x:550,y:780},{x:220,y:780}];
   const updateCpu=[],renderCpu=[],callbackDelay=[];
   const observed={updateCalls:0,inputCommands:0,playCalls:nativeDriver&&workload==='replay'?1:0,rotationMin:Infinity,rotationMax:-Infinity,cameraXMin:Infinity,cameraXMax:-Infinity,cameraYMin:Infinity,cameraYMax:-Infinity,walkerXMin:Infinity,walkerXMax:-Infinity,walkerYMin:Infinity,walkerYMax:-Infinity,maxVertices:S.trail.length,maxTiles:S.cards.size,phaseFrames:{},walkDistance:0,replayCursorMin:Infinity,replayCursorMax:-Infinity};
   const gl=app.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
   const overlay=app.foreground?.context||window.gpuOverlay,og=overlay&&overlay.gl,overlayBefore=overlay?{...overlay.metrics}:null;
   // EXT_disjoint_timer_query_webgl2 uses core query methods; WebGL1 uses EXT methods.
   function timer(context){
    if(!context||!gpuTimers)return null;const modern=context.getExtension('EXT_disjoint_timer_query_webgl2');
    const ext=modern||context.getExtension('EXT_disjoint_timer_query');if(!ext)return null;
    let disjoint=false;const records=[];
    return {api:modern?'webgl2':'webgl1',records,
     begin(info){const q=modern?context.createQuery():ext.createQueryEXT();if(!q)return null;if(modern)context.beginQuery(ext.TIME_ELAPSED_EXT,q);else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);const r={q,...info};records.push(r);return r;},
     end(r){if(!r)return;if(modern)context.endQuery(ext.TIME_ELAPSED_EXT);else ext.endQueryEXT(ext.TIME_ELAPSED_EXT);},
     pollDisjoint(){if(context.getParameter(ext.GPU_DISJOINT_EXT))disjoint=true;},
     collect(){this.pollDisjoint();let unavailable=0;for(const r of records){const ready=modern?context.getQueryParameter(r.q,context.QUERY_RESULT_AVAILABLE):ext.getQueryObjectEXT(r.q,ext.QUERY_RESULT_AVAILABLE_EXT);if(ready&&!disjoint)r.ms=(modern?context.getQueryParameter(r.q,context.QUERY_RESULT):ext.getQueryObjectEXT(r.q,ext.QUERY_RESULT_EXT))/1e6;else if(!ready)unavailable++;if(modern)context.deleteQuery(r.q);else ext.deleteQueryEXT(r.q);delete r.q;}return{disjoint,unavailable,records};}
    };
   }
   const artTimer=timer(gl),overlayTimer=og&&og!==gl?timer(og):null;
   const pieces=TraceRenderer.compile(S.trail,S.W,S.H),tiles=[...S.cards.values()].filter(t=>t.amt>.01),projected=TraceRenderer.project(pieces,tiles,S.W,S.H);
   const anchors=TraceRenderer.anchors(pieces,750*.34),travel=TraceRenderer.withoutStampOverlap(TraceRenderer.travelMarks(pieces,750*.18),anchors,750*.045);
   let staticClears=0;const tc=document.getElementById('traceLayer')?.getContext?.('2d');if(tc){const clear=tc.clearRect;tc.clearRect=function(...args){staticClears++;return clear.apply(this,args);};}
   const cpu=[],intervals=[],steadyIntervals=[],resetIntervals=[],resets=[],perCycle=Array.from({length:cycles},(_,cycle)=>({cycle,cpu:[],raf:[],verticesStart:0,verticesEnd:0}));
   let last=null,firstMeasuredTime=null,resetAffected=false,snapshot=null;
   function capture(){if(nativeDriver)return {state:structuredClone(S),driver:structuredClone(driverState)};return {trail:S.trail.map(p=>({...p})),cursor:S.cursor,walker:{...S.walker},rot:S.rot,rotTarget:S.rotTarget,recordBreak:S.recordBreak,travelled:S.travelled};}
   function reset(){if(nativeDriver){Object.assign(S,structuredClone(snapshot.state));Object.assign(driverState,structuredClone(snapshot.driver));S.replayVersion++;app.refreshTrace();app.render();return;}S.trail=snapshot.trail.map(p=>({...p}));S.cursor=snapshot.cursor;S.walker={...snapshot.walker};S.rot=snapshot.rot;S.rotTarget=snapshot.rotTarget;S.recordBreak=snapshot.recordBreak;S.travelled=snapshot.travelled;S.replayVersion++;app.refreshTrace();app.render();}
   function step(t,absolute){
    const measured=absolute>=20,cycle=measured?Math.floor((absolute-20)/frames):-1,k=measured?20+(absolute-20)%frames:absolute;
    if(measured){const dt=t-last;intervals.push(dt);perCycle[cycle].raf.push(dt);(resetAffected?resetIntervals:steadyIntervals).push(dt);if(firstMeasuredTime===null)firstMeasuredTime=t;}
    last=t;resetAffected=false;
    if(absolute===20){performance.mark('OCM-measured-start');staticClears=0;snapshot=capture();}
    if(measured&&k===20){
     if(cycle>0){const info={kind:'reset',cycle,k},oq=overlayTimer?.begin(info),q=artTimer?.begin(info),start=performance.now();reset();const ms=performance.now()-start;artTimer?.end(q);overlayTimer?.end(oq);resets.push({cycle,cpuMs:ms});resetAffected=true;}
     perCycle[cycle].verticesStart=S.trail.length;
    }
    const info={kind:measured?'sample':'warmup',cycle,k},oq=overlayTimer?.begin(info),q=artTimer?.begin(info),a=performance.now();
    if(nativeDriver){
     if(measured)callbackDelay.push(performance.now()-t);
     if(workload==='rotate')S.rotTarget=k*Math.PI/(frames+20);
     else if(workload==='walk'&&S.walker.tx==null){app.tap(waypoints[driverState.waypoint++%waypoints.length]);if(measured)observed.inputCommands++;}
     // Replay advances exclusively through play/advanceReplay inside update.
     // No playhead/position writes occur in a native measured frame.
     const wx=S.walker.x,wy=S.walker.y,beginUpdate=performance.now();
     app.update(1/60);
     const endUpdate=performance.now();
     app.render();
     const endRender=performance.now();
     if(measured){
      updateCpu.push(endUpdate-beginUpdate);renderCpu.push(endRender-endUpdate);observed.updateCalls++;
      observed.maxVertices=Math.max(observed.maxVertices,S.trail.length);observed.maxTiles=Math.max(observed.maxTiles,S.cards.size);
      observed.walkDistance+=Math.hypot(S.walker.x-wx,S.walker.y-wy);
      observed.rotationMin=Math.min(observed.rotationMin,S.rot);observed.rotationMax=Math.max(observed.rotationMax,S.rot);
      observed.cameraXMin=Math.min(observed.cameraXMin,S.cam.x);observed.cameraXMax=Math.max(observed.cameraXMax,S.cam.x);
      observed.cameraYMin=Math.min(observed.cameraYMin,S.cam.y);observed.cameraYMax=Math.max(observed.cameraYMax,S.cam.y);
      observed.walkerXMin=Math.min(observed.walkerXMin,S.walker.x);observed.walkerXMax=Math.max(observed.walkerXMax,S.walker.x);
      observed.walkerYMin=Math.min(observed.walkerYMin,S.walker.y);observed.walkerYMax=Math.max(observed.walkerYMax,S.walker.y);
      if(S.phase){const type=S.phase.event.type;observed.phaseFrames[type]=(observed.phaseFrames[type]||0)+1;}
      if(workload==='replay'){observed.replayCursorMin=Math.min(observed.replayCursorMin,S.cursor);observed.replayCursorMax=Math.max(observed.replayCursorMax,S.cursor);}
     }
    }else{
     if(workload==='rotate'){S.rot=k*Math.PI/(frames+20);S.rotTarget=S.rot;}
     else if(workload==='walk'){S.recordBreak=k===0;app.recordPosition(340+k*.7,520);S.walker.x=340+k*.7;S.walker.y=520;}
     else S.cursor=30.2+k*.001;
     app.render();
    }
    const ms=performance.now()-a;artTimer?.end(q);overlayTimer?.end(oq);
    if(measured){cpu.push(ms);perCycle[cycle].cpu.push(ms);perCycle[cycle].verticesEnd=S.trail.length;}
    artTimer?.pollDisjoint();overlayTimer?.pollDisjoint();
   }
   if(nativeDriver){
    await new Promise((resolve,reject)=>{
     let absolute=0;
     const callback=t=>{try{step(t,absolute++);if(absolute<20+frames*cycles)nativeRAF(callback);else resolve();}catch(error){reject(error);}};
     nativeRAF(callback);
    });
   }else{
    for(let absolute=0;absolute<20+frames*cycles;absolute++)step(await new Promise(nativeRAF),absolute);
   }
   performance.mark('OCM-measured-end');
   await new Promise(r=>setTimeout(r,100));const artData=artTimer?.collect(),overlayData=overlayTimer?.collect();
   const stats=a=>{const b=[...a].sort((x,y)=>x-y);return {n:b.length,median:b[Math.floor(b.length*.5)]??null,p95:b[Math.floor(b.length*.95)]??null,p99:b[Math.floor(b.length*.99)]??null,max:b[b.length-1]??null,mean:b.length?b.reduce((s,x)=>s+x,0)/b.length:null}};
   const values=(data,kind,cycle)=>data?.records.filter(r=>r.kind===kind&&(cycle===undefined||r.cycle===cycle)&&Number.isFinite(r.ms)).map(r=>r.ms)||[];
   const gpu=values(artData,'sample'),overlayGpu=values(overlayData,'sample');
   const bounds=perCycle.map(r=>({cycle:r.cycle,verticesStart:r.verticesStart,verticesEnd:r.verticesEnd}));
   if(cycles>1&&bounds.some(b=>b.verticesStart!==bounds[0].verticesStart||b.verticesEnd!==bounds[0].verticesEnd))throw Error('Unbounded workload geometry: '+JSON.stringify(bounds));
   if(nativeDriver){
    if(observed.updateCalls!==frames*cycles)throw Error('Native driver did not update on every measured frame');
    if(observed.maxVertices>64||observed.maxTiles>9)throw Error('Native driver exceeded bounded workload: '+JSON.stringify(observed));
    if(workload==='rotate'&&frames>1&&observed.rotationMax<=observed.rotationMin)throw Error('Native rotation did not change rotation');
    if(workload==='walk'&&observed.walkDistance<=0)throw Error('Native walking did not move');
    if(workload==='replay'&&frames>=120&&(!(observed.phaseFrames.spin>0)||observed.replayCursorMax<=observed.replayCursorMin))throw Error('Native replay did not exercise spin and travel: '+JSON.stringify(observed));
   }
   const glErrors=[];for(const context of [...new Set([gl,og].filter(Boolean))]){const error=context.getError();if(error!==context.NO_ERROR)glErrors.push({canvas:context.canvas.id,error});}if(glErrors.length)throw Error('GL errors during benchmark '+JSON.stringify(glErrors));
   return {mode,workload,cycles,gpuTimers,nativeDriver,driver:nativeDriver?'native-raf-callback-update-render':'legacy-raf-microtask-render',nativeConditions:nativeDriver?{dt:1/60,simulationClock:'fixed 1/60 second per callback; dropped frames slow simulated time',rotate:'rotTarget follows original angle ramp; actual rotation eased by production update',walk:'production tap() between four in-card waypoints; recording, following camera, lighting and cards updated',replay:'production play(1), speed 1, added recorded spin at route vertex 1; real event state machine; no cursor writes',waypoints,observed,updateCpuMs:stats(updateCpu),renderCpuMs:stats(renderCpu),callbackDelayMs:stats(callbackDelay),notes:'48 initial route vertices, artwork, zoom and viewport match legacy; motion/camera/event workload differs. HUD frame() throttling is not reproduced. Application RAF scheduling is suspended; all measured update/render operations are synchronous inside one native RAF callback.'}:null,framesPerCycle:frames,warmupFrames:20,measurementNote:'RAF callback cadence and CPU/GPU query timings; not confirmed presented frames, energy, or power. Cycle resets are included in rafMs, and their affected intervals are separated in resetBoundaryRafMs. GPU query scopes on separate contexts are not an additive critical-path measurement.',viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,backing:[document.getElementById('stage').width,document.getElementById('stage').height],vertices:48,projectedSegments:projected.reduce((s,g)=>s+g.lines.reduce((s,l)=>s+l.length-1,0),0),canonicalStamps:anchors.length,canonicalChevrons:travel.length,tiles:tiles.length,zoom:S.zoom,renderer:debug&&gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),ua:navigator.userAgent,traceSurface:app.traceLayout(),cpuMs:stats(cpu),rafMs:stats(intervals),steadyRafMs:stats(steadyIntervals),resetBoundaryRafMs:stats(resetIntervals),glGpuMs:stats(gpu),overlayGpuMs:stats(overlayGpu),overlayDisjoint:overlayData?.disjoint??null,overlayBefore,overlayAfter:overlay?{...overlay.metrics}:null,disjoint:artData?.disjoint??null,staticClears,over25ms:intervals.filter(x=>x>25).length,steadyOver25ms:steadyIntervals.filter(x=>x>25).length,elapsedMeasuredMs:last-firstMeasuredTime,reset:{count:resets.length,cpuMs:stats(resets.map(r=>r.cpuMs)),artGpuMs:stats(values(artData,'reset')),overlayGpuMs:stats(values(overlayData,'reset')),records:resets},timerQueries:{art:{api:artTimer?.api||null,unavailable:artData?.unavailable??null},overlay:{api:overlayTimer?.api||null,unavailable:overlayData?.unavailable??null,sharedWithArt:og===gl}},perCycle:perCycle.map(r=>({cycle:r.cycle,verticesStart:r.verticesStart,verticesEnd:r.verticesEnd,cpuMs:stats(r.cpu),rafMs:stats(r.raf),over25ms:r.raf.filter(x=>x>25).length,artGpuMs:stats(values(artData,'sample',r.cycle)),overlayGpuMs:stats(values(overlayData,'sample',r.cycle))})),glErrors};
  },{mode,workload,frames,cycles,gpuTimers,nativeDriver});result.round=round;
  if(traceSession){
   const complete=new Promise(resolve=>traceSession.once('Tracing.tracingComplete',resolve));await traceSession.send('Tracing.end');
   const {stream}=await complete;let contents='';for(;;){const chunk=await traceSession.send('IO.read',{handle:stream});contents+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}await traceSession.send('IO.close',{handle:stream});
   const filename=process.env.OCM_TRACE+'-'+round+'-'+workload+'.json.gz';fs.writeFileSync(filename,require('node:zlib').gzipSync(contents));result.traceFile=filename;await traceSession.detach();
  }
  results.push(result);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({root,results},null,2));console.log(JSON.stringify({round,mode,workload,cycles,nativeDriver,cpu:result.cpuMs,raf:result.rafMs,steadyRaf:result.steadyRafMs,gpu:result.glGpuMs,overlayGpu:result.overlayGpuMs,reset:result.reset.cpuMs}));
 }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
