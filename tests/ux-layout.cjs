/* Fast geometry experiment: camera reservations match actual task docks after resize. */
'use strict';
const assert=require('assert').strict,{chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?demo`);await page.evaluate(()=>OCM.startup);
    await page.evaluate(()=>{OCM.tap({x:200,y:300});OCM.tap({x:400,y:300});OCM.update(1);OCM.tap({x:400,y:500});OCM.update(1);});
    for(const [width,height] of [[320,568],[375,667],[390,664],[667,375],[844,390],[768,1024],[1280,800]]){
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>parseFloat(document.getElementById("stage").style.width)===innerWidth && parseFloat(document.getElementById("stage").style.height)===innerHeight);
      for(const mode of ['walk','playing','paused','complete','place']){
        const result=await page.evaluate(mode=>{
          OCM.setMarkerMode(false);OCM.finishReview();
          if(mode==='playing')OCM.play(1);
          if(mode==='paused'||mode==='complete'){OCM.setCursor(1);OCM.S.reviewDone=mode==='complete';OCM.syncTimeline();}
          if(mode==='place')OCM.setMarkerMode(true);
          const ins=OCM.uiInsets(),css=getComputedStyle(document.body);
          const dock=document.querySelector(mode==='walk'?'#dockWalk':mode==='place'?'#markerPlacementTip':'#player').getBoundingClientRect();
          const card=document.getElementById('btnCards').getBoundingClientRect(),map=document.getElementById('btnMore').getBoundingClientRect();
          return {mode:OCM.uiMode(),top:ins.top,bottom:ins.bottom,cssTop:parseFloat(css.getPropertyValue('--inset-top')),cssBottom:parseFloat(css.getPropertyValue('--inset-bottom')),dockTop:dock.top,cardRight:card.right,mapLeft:map.left,height:innerHeight};
        },mode);
        assert.equal(result.mode,mode);assert.equal(result.top,result.cssTop);assert.equal(result.bottom,result.cssBottom,`${width} ${mode}: camera/CSS bottom`);
        assert(result.cardRight<=result.mapLeft,`${width}: card and map chips overlap`);
        if(mode!=='walk')assert(result.dockTop>=height-result.bottom,`${width} ${mode}: dock exceeds camera reservation`);
      }
    }
    assert.deepEqual(errors,[]);console.log('PASS: camera/CSS insets and dock clearance in 35 viewport/mode combinations, card/map chip separation after live resizing');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
