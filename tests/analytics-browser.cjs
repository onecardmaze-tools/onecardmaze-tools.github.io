/* Controlled production-origin simulation: all analytics requests are intercepted.
   No QA traffic is sent to Umami. */
'use strict';
const {chromium}=require('playwright'), assert=require('assert').strict;
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const context=await browser.newContext();const requests=[],errors=[];
  await context.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
  await context.route('https://gateway.umami.is/**',async route=>{
   requests.push(route.request().postDataJSON());
   await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"cache":"test-cache"}'});
  });
  await context.route('https://onecardmaze-tools.github.io/**',async route=>{
   let file=new URL(route.request().url()).pathname;if(file==='/')file='/index.html';
   let body=fs.readFileSync(path.join(root,file));
   if(file==='/analytics.js')body=body.toString().replace(/const WEBSITE = '[^']*';/,"const WEBSITE = 'test-website';");
   await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://onecardmaze-tools.github.io/?private=query#private');await page.evaluate(()=>OCM.startup);
  await page.waitForFunction(()=>!!window.MazeAnalytics);
  await page.evaluate(()=>{OCM.tap({x:200,y:300});});
  await page.waitForTimeout(150);assert.equal(requests.filter(r=>r.payload.name==='play_started').length,0);
  await page.evaluate(()=>{OCM.tap({x:400,y:300});OCM.update(.1);});
  await page.waitForTimeout(150);assert.equal(requests.filter(r=>r.payload.name==='play_started').length,1);
  await page.evaluate(()=>{OCM.update(2);document.getElementById('btnReplay').click();OCM.update(1);});
  await page.waitForTimeout(150);assert.equal(requests.filter(r=>r.payload.name==='play_started').length,1);
  await page.evaluate(()=>{
   document.getElementById('btnDone').click();
   document.getElementById('btnComplete').click();
   document.getElementById('btnComplete').click();
   document.getElementById('btnComplete').click();
   document.getElementById('btnExportSession').click();
  });
  await page.evaluate(async()=>{
   const recording=OCM.captureSession();
   await OCM.importSessionFile(new File([JSON.stringify(recording)],'private-name.ocm.json'));
   try {await OCM.importSessionFile(new File(['{}'],'bad.ocm.json'));}catch{}
  });
  await page.waitForTimeout(200);
  for(const name of ['completion_marked','recording_imported','recording_exported'])
   assert.equal(requests.filter(r=>r.payload.name===name).length,1,name);
  for(const r of requests){assert.equal(r.payload.url,'/');assert(!JSON.stringify(r).includes('private'));}
  // About disclosure remains usable at narrow, short landscape and desktop sizes.
  for(const [width,height] of [[320,568],[844,390],[1280,800]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{document.getElementById('help').showModal();document.getElementById('analyticsPrivacy').open=true;});
   const toggle=page.locator('#btnAnalytics');await toggle.scrollIntoViewIfNeeded();
   const box=await toggle.boundingBox();assert(box.width>=44&&box.height>=44);assert(box.x>=0&&box.x+box.width<=width+1);
   await page.screenshot({path:`/tmp/ocm-analytics-ui/privacy-${width}.png`});
  }
  const before=requests.length;await page.locator('#btnAnalytics').click();
  await page.evaluate(()=>{MazeAnalytics.event('card_imported');MazeAnalytics.walkInput();MazeAnalytics.moved(1,'practice');});
  await page.reload();await page.evaluate(()=>OCM.startup);await page.waitForTimeout(100);
  assert.equal(requests.length,before);assert.equal(await page.evaluate(()=>localStorage.getItem('umami.disabled')),'1');
  // Another same-origin tab inherits the owner's exclusion.
  const second=await context.newPage();await second.goto('https://onecardmaze-tools.github.io/');
  await second.evaluate(()=>OCM.startup);await page.waitForTimeout(100);assert.equal(requests.length,before);
  assert.deepEqual(errors,[]);
  console.log('PASS: browser integration sends only actual walking, suppresses replay and sensitive URLs, persists self-exclusion across reloads/tabs; privacy control fits three viewports');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
