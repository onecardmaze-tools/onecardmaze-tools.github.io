/* Real production RAF + HUD interaction benchmark; run scenarios serially.
 * PLAYWRIGHT_MODULE=/absolute/playwright OCM_ROOT=/checkout node tests/interaction-performance.cjs
 * OCM_OUTPUT=/file.json OCM_SECONDS=15 OCM_WORKLOADS=rotate,walk,replay
 * OCM_TRACE=/trace/prefix (or 1), CHROME_PATH=/Chrome executable.
 * OCM_FOLLOW=1 (default), OCM_REPLAY_PROFILE=events (default; plain restores old replay),
 * OCM_REQUIRE_VISIBLE_WINDOW=1 (default; 0 is exploratory/off-window only).
 * Follow/events defaults differ from the earlier synthetic baseline; report both.
 * At 3008x1492 CSS/DPR2 each GL drawing buffer must be 6016x2984.
 * No render/update calls, scheduler replacement, or timed RAF observer loop.
 * Cold means first interaction after fixture setup has naturally become idle;
 * it does not mean an uninitialized browser/shader cache. Raw samples are saved.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.OCM_ROOT||path.join(__dirname,'..'));
const output=path.resolve(process.env.OCM_OUTPUT||path.join(root,'benchmarks/interaction-run.json'));
const seconds=Number(process.env.OCM_SECONDS||15),workloads=(process.env.OCM_WORKLOADS||'rotate,walk,replay').split(',');
assert(Number.isFinite(seconds)&&seconds>=2&&seconds<=120,'OCM_SECONDS must be 2–120');
for(const name of workloads)assert(['rotate','walk','replay'].includes(name),'Unknown workload '+name);
const follow=process.env.OCM_FOLLOW!=='0',replayProfile=process.env.OCM_REPLAY_PROFILE||'events',requireVisibleWindow=process.env.OCM_REQUIRE_VISIBLE_WINDOW!=='0';
assert(['plain','events'].includes(replayProfile),'OCM_REPLAY_PROFILE must be plain or events');
const width=Number(process.env.OCM_WIDTH||3008),height=Number(process.env.OCM_HEIGHT||1492),dpr=Number(process.env.OCM_DPR||2);
const hideUI=process.env.OCM_HIDE_UI==='1';
assert([width,height,dpr].every(x=>Number.isFinite(x)&&x>0),"Invalid viewport/DPR");
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
function instrument(source){
 const opening='function frame(t) {',start=source.indexOf(opening),after=source.indexOf('\nfunction suspendFrames()',start);
 assert(start>=0&&after>start,'Cannot locate production frame()/suspendFrames(); update instrumentation explicitly');
 const old=source.slice(start,after),end=old.lastIndexOf('}');
 assert(old.slice(end+1).trim()==='','Unexpected text after frame()');
 const body=old.slice(opening.length,end);
 source=source.slice(0,start)+opening+'\n const __perf=window.__ocmPerf;const __sample=__perf&&__perf.begin(t);\n try {'+body+'\n } finally {if(__perf)__perf.end(__sample,rafId!==null,S);}\n}\n'+source.slice(after);
 for(const [name,kind] of [['render','render'],['paintTimeline','timeline'],['updateHUD','hud']]){
  const match='function '+name+'() {';assert(source.includes(match),'Missing '+name+' instrumentation point');
  source=source.replace(match,match+'\n if(window.__ocmPerf)window.__ocmPerf.count("'+kind+'");');
 }
 return source;
}
// Fail before opening Chrome if production changed around the probe insertion points.
instrument(fs.readFileSync(path.join(root,'index.html'),'utf8'));
const server=http.createServer((req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}let data=fs.readFileSync(file);if(file===path.join(root,'index.html'))data=instrument(data.toString());res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch(error){res.writeHead(error.code==='ENOENT'?404:500).end(String(error.message));}});
function installProbe({width,height,dpr}){
 const p=window.__ocmPerf={active:false,idle:false,totalFrames:0,samples:[],inputs:[],events:[],failures:[],counts:{render:0,timeline:0,hud:0},previous:null,current:null};
 p.fail=reason=>{if(!p.failures.includes(reason))p.failures.push(reason);};
 p.count=kind=>{if(p.active){p.counts[kind]++;if(p.current)p.current[kind]++;}};
 p.begin=t=>{
  p.totalFrames++;p.idle=false;if(!p.active)return null;
  const now=performance.now(),previous=p.previous;
  const sample={t,entered:now,continued:!!(previous&&previous.continuation),intervalMs:previous&&previous.continuation?t-previous.t:null,idleGapMs:previous&&!previous.continuation?t-previous.t:null,render:0,timeline:0,hud:0};
  p.current=sample;return sample;
 };
 p.end=(sample,continuation,S)=>{
  const now=performance.now();p.idle=!continuation;
  if(!sample)return;
  sample.ended=now;sample.cpuMs=now-sample.entered;sample.continuation=continuation;
  sample.state={rotation:S.rot,cursor:S.cursor,walker:[S.walker.x,S.walker.y],camera:[S.cam.x,S.cam.y],vertices:S.trail.length,tiles:S.cards.size,play:S.play,phase:S.phase&&S.phase.event.type,phaseElapsed:S.phase?S.phase.elapsed:null,phaseEvent:S.phase?S.phase.event.id:null,eventDone:S.eventDone?S.eventDone.size:0,follow:S.follow,manualPivot:!!S.manualPivot,mode:document.body.dataset.mode};
  if(document.hidden)p.fail('Page became hidden');
  if(!S.ready||S.W!==750||S.H!==1050||S.demo||S.trail!==p.fixtureTrail)p.fail('Synthetic fixture was replaced');
  if(innerWidth!==width||innerHeight!==height||devicePixelRatio!==dpr||Math.abs(S.zoom-.888095238095238)>1e-12)p.fail('Viewport, DPR or zoom changed');
  if(S.cards.size!==9||S.trail.length<48||S.trail.length>128)p.fail('Scene exceeded fixed nine tiles / bounded route');
  p.samples.push(sample);p.previous=sample;p.current=null;
 };
 const capture=e=>{
  if(!p.active)return;
  if((e.type==='keydown'&&['e',' '].includes(e.key.toLowerCase()))||e.type==='pointerup')p.inputs.push({type:e.type,key:e.key||null,time:performance.now(),eventTime:e.timeStamp,trusted:e.isTrusted,target:e.target&&e.target.id});
 };
 window.addEventListener('keydown',capture,true);window.addEventListener('pointerup',capture,true);
 window.addEventListener('resize',()=>{if(p.active)p.fail('Native window/viewport resized during measurement');});
 window.addEventListener('blur',()=>{if(p.active)p.fail('Browser window lost focus during measurement');});
 document.addEventListener('visibilitychange',()=>{if(p.active&&document.hidden)p.fail('Visibility changed to hidden');});
 try{p.observer=new PerformanceObserver(list=>{if(p.active)for(const e of list.getEntries())p.events.push({name:e.name,startTime:e.startTime,duration:e.duration,processingStart:e.processingStart,processingEnd:e.processingEnd,interactionId:e.interactionId});});p.observer.observe({type:'event',buffered:false,durationThreshold:16});}catch{p.observer=null;}
}
function setupFixture({workload,follow,replayProfile}){
 const app=OCM,S=app.S,cv=document.createElement('canvas');cv.width=750;cv.height=1050;
 const g=cv.getContext('2d');g.fillStyle='#bed9d1';g.fillRect(0,0,750,1050);g.strokeStyle='#172b42';g.lineWidth=4;for(let i=20;i<750;i+=30){g.beginPath();g.moveTo(i,10);g.lineTo(i,1040);g.stroke();}
 app.applyImages(cv,cv);S.demo=false;S.started=true;S.trail=Array.from({length:48},(_,k)=>({x:100+(k*67)%540,y:100+(k*109)%840,r:Math.floor(k/12)%4}));
 S.cursor=47;S.spins=[];S.rotQ0=0;S.rot=S.rotTarget=0;S.review=false;S.play=0;S.follow=follow;S.phase=null;S.manualPivot=null;S.undoHeld=false;S.undoRewind=false;S.keys=Object.create(null);S.zoom=.888095238095238;S.cam={x:375,y:525};S.walker={...S.trail[47],tx:null,ty:null};S.anchor={i:0,j:0};S.replaySpeed=.2;S.markers=[];S.replayVersion++;
 // Original route r changes at vertices 12/24/36: recorded turns belong at
 // the preceding vertices. Keep all 48 positions and orientation values.
 if(workload==='replay'&&replayProfile==='events'){S.spins=[{i:11,q:1},{i:23,q:2},{i:35,q:3}];S.replaySpeed=1;}
 S.cards.clear();for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)S.cards.set(i+','+j,{i,j,amt:1,target:1,bright:app.cardLight(i,j)});
 document.getElementById('loader').classList.add('hidden');const help=document.getElementById('help');if(help.open)help.close();
 app.refreshTrace();app.syncTimeline();
 __ocmPerf.fixtureTrail=S.trail;__ocmPerf.fixtureJSON=JSON.stringify(S.trail);__ocmPerf.fixturePrefix=JSON.stringify(S.trail.slice(0,48));
 return {art:[750,1050],vertices:S.trail.length,tiles:S.cards.size,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,zoom:S.zoom,replaySpeed:S.replaySpeed,follow:S.follow,spins:S.spins.map(s=>({...s})),replayProfile:workload==='replay'?replayProfile:null,projectedSegments:TraceRenderer.project(TraceRenderer.compile(S.trail,S.W,S.H),[...S.cards.values()],S.W,S.H).reduce((sum,group)=>sum+group.lines.reduce((n,line)=>n+line.length-1,0),0)};
}
function stats(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y),pick=q=>a[Math.min(a.length-1,Math.floor(a.length*q))]??null;return{n:a.length,median:pick(.5),p95:pick(.95),p99:pick(.99),max:a.at(-1)??null,mean:a.length?a.reduce((s,v)=>s+v,0)/a.length:null,over25ms:a.filter(x=>x>25).length};}
async function stopTrace(session,filename){const done=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));await session.send('Tracing.end');const {stream}=await done;const chunks=[];for(;;){const item=await session.send('IO.read',{handle:stream});chunks.push(item.base64Encoded?Buffer.from(item.data,'base64'):Buffer.from(item.data));if(item.eof)break;}await session.send('IO.close',{handle:stream});fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,zlib.gzipSync(Buffer.concat(chunks)));await session.detach();}

// Run outside measurement marks: read GPU/native-window state without polluting
// frame CPU/GPU timing. Browser screen metrics can be device-emulated; CDP window
// bounds are also recorded and tested. This still cannot prove OS-level occlusion
// or map every viewport pixel to an actually scanned-out monitor pixel.
async function auditSurface(page,context){
 const browser=await page.evaluate(()=>{
  const stage=OCM.gl,foreground=OCM.foreground.context.gl;
  const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
  const surface=gl=>{if(!gl)return null;return{id:gl.canvas.id,canvas:[gl.canvas.width,gl.canvas.height],drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],pixels:gl.drawingBufferWidth*gl.drawingBufferHeight,colorBytesRGBA8:gl.drawingBufferWidth*gl.drawingBufferHeight*4,css:rect(gl.canvas),attributes:gl.getContextAttributes(),samples:gl.getParameter(gl.SAMPLES),maxViewport:Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),lost:gl.isContextLost(),error:gl.getError()};};
  const vv=visualViewport;
  return{visible:document.visibilityState,focused:document.hasFocus(),viewport:{innerWidth,innerHeight,dpr:devicePixelRatio,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,visual:vv?{width:vv.width,height:vv.height,scale:vv.scale,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop}:null},outer:{width:outerWidth,height:outerHeight,screenX,screenY},screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight,availLeft:screen.availLeft??null,availTop:screen.availTop??null,colorDepth:screen.colorDepth,pixelDepth:screen.pixelDepth,isExtended:screen.isExtended??null},surfaces:{art:surface(stage),foreground:surface(foreground)},camera:{...OCM.S.cam},follow:OCM.S.follow};
 });
 const cdp=await context.newCDPSession(page);let nativeWindow,layout;
 try{nativeWindow=await cdp.send('Browser.getWindowForTarget');layout=await cdp.send('Page.getLayoutMetrics');}finally{await cdp.detach();}
 const expected=[Math.floor(width*Math.min(dpr,2)),Math.floor(height*Math.min(dpr,2))];
 assert.equal(browser.visible,'visible','Browser document must be visible');
 assert(browser.focused,'Browser document must have focus');
 assert.deepEqual([browser.viewport.innerWidth,browser.viewport.innerHeight,browser.viewport.dpr],[width,height,dpr],'Viewport/DPR mismatch');
 if(browser.viewport.visual){assert(Math.abs(browser.viewport.visual.width-width)<1&&Math.abs(browser.viewport.visual.height-height)<1,'Visual viewport differs from configured CSS size');assert.equal(browser.viewport.visual.scale,1,'Page must not be pinch-zoomed');}
 for(const [name,surface] of Object.entries(browser.surfaces)){
  assert(surface,'Missing real GL surface '+name);assert(!surface.lost&&surface.error===0,'Lost/error GL surface '+name);
  assert.deepEqual(surface.canvas,expected,name+' canvas attributes are not full DPR');assert.deepEqual(surface.drawingBuffer,expected,name+' GPU drawing buffer is reduced/clamped');
  assert(Math.abs(surface.css.width-width)<1&&Math.abs(surface.css.height-height)<1,name+' CSS canvas dimensions mismatch');
 }
 const bounds=nativeWindow.bounds,windowCoversViewport=Number.isFinite(bounds.width)&&Number.isFinite(bounds.height)&&bounds.width>=width&&bounds.height>=height;
 assert(bounds.windowState!=='minimized','Native Chrome window is minimized');
 if(requireVisibleWindow)assert(windowCoversViewport,'Native Chrome window is smaller than emulated viewport; resize/full-screen it before claiming visible full-size performance. For an explicitly exploratory off-window run only, set OCM_REQUIRE_VISIBLE_WINDOW=0. '+JSON.stringify({bounds,viewport:[width,height]}));
 return{...browser,nativeWindow,cdpLayout:layout,windowCoversViewport,expectedBacking:expected,screenMetricsCaveat:'Playwright may emulate window.screen; native outer bounds and visibility are audited separately. These checks do not prove absence of OS occlusion or physical scanout of every pixel.'};
}

const report={conditions:{width,height,dpr,seconds,hideUI,follow,replayProfile,requireVisibleWindow,passMeaning:'Valid instrumented run, not a 60 FPS or presentation acceptance assertion',coverage:'Plain replay covers walking only; events replay adds spins at original route orientation boundaries at 1x. Neither profile crosses a seam, so flip transitions and negative tiles require separate coverage. Follow starts true by default; actual production manual spin may turn it off on completion.',traceEnabled:!!process.env.OCM_TRACE,driver:'Trusted browser inputs; unchanged production frame()/scheduler/update/render/HUD; no external RAF sampler',coldDefinition:'First input after synthetic fixture has rendered and naturally idled; not process/shader initialization',method:'Continuous intervals require previous production frame to have scheduled continuation. Normal idle gaps are retained separately. CPU is synchronous production frame() work including HUD; input handler CPU is outside it. Input-to-frame-end is not presentation latency. Event Timing is quantized/thresholded and is not exact present latency.',traceParser:'python3 tests/summarize-render-trace.py <trace>.json.gz; RAF/JSAnimation counters may overlap; do not sum'},runs:[],passed:false};
fs.mkdirSync(path.dirname(output),{recursive:true});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:['--no-first-run','--no-default-browser-check'],timeout:60000});
 for(const workload of workloads){const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await context.newPage();const run={workload,errors:[],requests:[],actions:[]};report.runs.push(run);let traceSession;
  page.on('pageerror',error=>run.errors.push(error.message));page.on('requestfailed',request=>run.requests.push({url:request.url(),failure:request.failure()}));
  try{
   await page.addInitScript(installProbe,{width,height,dpr});await page.goto('http://127.0.0.1:'+server.address().port+'/?demo');await page.bringToFront();await page.waitForFunction(()=>window.OCM&&OCM.startup);await page.evaluate(()=>OCM.startup);await page.evaluate(()=>document.fonts.ready);
   run.fixture=await page.evaluate(setupFixture,{workload,follow,replayProfile});
   if(hideUI)await page.addStyleTag({content:'body > :not(canvas):not(script):not(style) { visibility:hidden!important; }'});
   await page.waitForFunction(()=>__ocmPerf.totalFrames>0&&__ocmPerf.idle,{},{timeout:15000});await page.waitForTimeout(250);
   assert(await page.evaluate(()=>__ocmPerf.idle&&!document.hidden),'Fixture must be visible and idle before first input');
   run.surfaceBefore=await auditSurface(page,context);
   run.renderer=await page.evaluate(()=>{const gl=OCM.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return{mode:OCM.foreground.mode,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,ua:navigator.userAgent,backing:[gl.canvas.width,gl.canvas.height]};});
   if(process.env.OCM_TRACE){traceSession=await context.newCDPSession(page);await traceSession.send('Tracing.start',{categories:'benchmark,cc,viz,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline.frame'+(process.env.OCM_TRACE_GPU?',gpu,disabled-by-default-gpu.service,disabled-by-default-gpu.device,disabled-by-default-gpu.debug':''),transferMode:'ReturnAsStream'});}
   await page.evaluate(()=>{const p=__ocmPerf;p.samples=[];p.inputs=[];p.events=[];p.previous=null;p.counts={render:0,timeline:0,hud:0};p.active=true;p.start=performance.now();performance.mark('OCM-measured-start');});
   const deadline=Date.now()+seconds*1000;let waypoint=0;
   do {
    if(workload==='rotate'){await page.keyboard.press('e');run.actions.push({type:'key',key:'e'});}
    else if(workload==='walk'){
     const world=[[220,300],[550,300],[550,780],[220,780]][waypoint++%4];
     const point=await page.evaluate(([x,y])=>{const p=OCM.w2s(x,y),hit=document.elementFromPoint(p.x,p.y);if(!hit||hit.id!=='stage')throw Error('Walk click blocked by UI at '+JSON.stringify(p)+' hit '+hit?.id);return p;},world);
     await page.mouse.click(point.x,point.y);run.actions.push({type:'tap',world,screen:point});
    }else if(!run.actions.length){if(hideUI)await page.keyboard.press('Space');else await page.locator('#btnReplay').click();run.actions.push({type:hideUI?'key':'click',id:hideUI?'Space':'btnReplay'});}
    else if(await page.locator('#btnReplayAgain').isVisible()){await page.locator('#btnReplayAgain').click();run.actions.push({type:'click',id:'btnReplayAgain'});}
    const remaining=deadline-Date.now();if(remaining>0)await page.waitForTimeout(Math.min(remaining,workload==='rotate'?400:workload==='walk'?850:1000));
    const failures=await page.evaluate(()=>__ocmPerf.failures);assert.deepEqual(failures,[],'Live fixture/visibility assertion failed');assert.deepEqual(run.errors,[],'Browser error');
   }while(Date.now()<deadline);
   run.raw=await page.evaluate(()=>{const p=__ocmPerf;p.active=false;p.endTime=performance.now();performance.mark('OCM-measured-end');return{start:p.start,end:p.endTime,samples:p.samples,inputs:p.inputs,eventTiming:p.events,counts:p.counts,failures:p.failures,prefixIntact:JSON.stringify(OCM.S.trail.slice(0,48))===p.fixturePrefix,routeIntact:JSON.stringify(OCM.S.trail)===p.fixtureJSON};});
   run.surfaceAfter=await auditSurface(page,context);
   const samples=run.raw.samples;assert(samples.length>20,'Too few production frame samples');assert(samples.every(s=>Number.isFinite(s.cpuMs)),'Invalid frame CPU sample');assert(run.raw.prefixIntact,'Fixture route prefix was altered');if(workload!=='walk')assert(run.raw.routeIntact,'Recorded route changed');
   assert(run.raw.inputs.length&&run.raw.inputs.every(i=>i.trusted),'Inputs must be trusted browser events');assert.deepEqual(run.raw.failures,[]);assert.deepEqual(run.errors,[]);assert.deepEqual(run.requests,[],'Network requests failed');
   const firstInput=run.raw.inputs[0],firstFrame=samples.find(s=>s.entered>=firstInput.time&&s.render);
   assert(firstFrame,'No rendered production frame after first input');
   run.cold={input:firstInput,frame:firstFrame,inputToFrameStartMs:firstFrame.entered-firstInput.time,inputToFrameEndMs:firstFrame.ended-firstInput.time,note:'Synchronous frame endpoint, not compositor presentation feedback'};
   run.summary={durationMs:run.raw.end-run.raw.start,frames:samples.length,continuousRafMs:stats(samples.filter(s=>s.continued).map(s=>s.intervalMs)),idleGapsMs:stats(samples.filter(s=>!s.continued).map(s=>s.idleGapMs)),frameCpuMs:stats(samples.map(s=>s.cpuMs)),postFirstFrameCpuMs:stats(samples.filter(s=>s!==firstFrame).map(s=>s.cpuMs)),longContinuousFrames:samples.filter(s=>s.continued&&s.intervalMs>25).map(s=>({index:samples.indexOf(s),sinceStartMs:s.entered-run.raw.start,intervalMs:s.intervalMs,cpuMs:s.cpuMs,previousCpuMs:samples[samples.indexOf(s)-1]?.cpuMs,callbackDelayMs:s.entered-s.t,state:s.state})),counts:run.raw.counts,verticesRange:[Math.min(...samples.map(s=>s.state.vertices)),Math.max(...samples.map(s=>s.state.vertices))],rotationRange:[Math.min(...samples.map(s=>s.state.rotation)),Math.max(...samples.map(s=>s.state.rotation))],cursorRange:[Math.min(...samples.map(s=>s.state.cursor)),Math.max(...samples.map(s=>s.state.cursor))]};
   if(workload==='rotate')assert(run.summary.rotationRange[1]-run.summary.rotationRange[0]>.5,'Rotate inputs did not move scene');
   if(workload==='walk')assert(samples.some(s=>Math.hypot(s.state.walker[0]-samples[0].state.walker[0],s.state.walker[1]-samples[0].state.walker[1])>20),'Tap inputs did not walk');
   if(workload==='replay'){assert(run.summary.cursorRange[1]-run.summary.cursorRange[0]>.1,'Replay playhead did not advance');assert(samples.some(s=>s.state.play===1),'Production replay never started');
    run.replayCoverage={profile:replayProfile,phaseFrames:samples.reduce((out,s)=>{if(s.state.phase)out[s.state.phase]=(out[s.state.phase]||0)+1;return out;},{}),phaseEvents:[...new Set(samples.map(s=>s.state.phaseEvent).filter(x=>x!==null))],completedEvents:Math.max(...samples.map(s=>s.state.eventDone)),spinRafMs:stats(samples.filter(s=>s.continued&&s.state.phase==='spin').map(s=>s.intervalMs)),travelRafMs:stats(samples.filter(s=>s.continued&&s.state.play===1&&!s.state.phase).map(s=>s.intervalMs)),rotationRange:run.summary.rotationRange,flipCoverage:false};
    if(replayProfile==='events'&&seconds>=5){assert(run.replayCoverage.phaseFrames.spin>0,'Replay did not execute a spin phase');assert(run.replayCoverage.completedEvents>0,'Replay did not complete a recorded event');assert(run.summary.rotationRange[1]-run.summary.rotationRange[0]>.5,'Replay spin did not rotate the artwork');}
   }
   run.passed=true;console.log(JSON.stringify({workload,cold:run.cold.inputToFrameEndMs,...run.summary}));
  }catch(error){run.passed=false;run.failure=error.stack;try{run.raw=run.raw||await page.evaluate(()=>{__ocmPerf.active=false;performance.mark('OCM-measured-end');return{samples:__ocmPerf.samples,inputs:__ocmPerf.inputs,eventTiming:__ocmPerf.events,failures:__ocmPerf.failures};});}catch{}throw error;}
  finally{
   if(traceSession){const prefix=process.env.OCM_TRACE==='1'?output.replace(/\.json$/,'')+'-trace':process.env.OCM_TRACE;run.traceFile=path.resolve(prefix+'-'+workload+'.json.gz');try{await stopTrace(traceSession,run.traceFile);}catch(error){run.traceError=String(error);run.passed=false;throw error;}}
   await context.close();fs.writeFileSync(output,JSON.stringify(report,null,2));
  }
 }
 report.passed=true;
 }catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));fs.writeFileSync(output,JSON.stringify(report,null,2));}
})();
