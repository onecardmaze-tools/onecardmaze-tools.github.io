/* Browser regression: local routes, completion, storage failure and responsive UI.
   node tests/local-progress.cjs (requires Playwright) */
'use strict';
const assert = require('assert').strict;
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage(); const errors=[];
    page.on('pageerror', e=>errors.push(String(e)));
    const base = `http://127.0.0.1:${server.address().port}/?demo`;
    await page.goto(base); await page.evaluate(()=>OCM.startup);
    await page.evaluate(async()=>{
      const front=await (await fetch('assets/demo/front.png')).blob();
      const back=await (await fetch('assets/demo/back.png')).blob();
      for (const [id,name] of [['a','01 · Woodland paths'],['b','02 · The long way home'],['c','03 · A new beginning']])
        await CardLibrary.save({id,name,front,back,createdAt:Date.now(),thumbnail:'assets/demo/front.png'});
      await OCM.useSavedCard('a');
      Object.assign(OCM.S,{trail:[{x:100,y:100,r:0},{x:200,y:100,r:0},{x:200,y:250,r:1}],spins:[{i:1,q:1}],cursor:1.5,started:true,review:true});
      OCM.syncTimeline();
    });
    await page.waitForFunction(()=>OCM.readProgress('a')?.state?.trail.length===3);
    await page.evaluate(()=>document.getElementById('btnComplete').click());
    const route=await page.evaluate(()=>JSON.stringify(OCM.S.trail));
    await page.evaluate(()=>{OCM.S.cursor=1.25;}); // pagehide flushes even before the next timer.
    await page.reload(); await page.evaluate(()=>OCM.startup);
    await page.evaluate(()=>OCM.useSavedCard('a'));
    assert.equal(await page.evaluate(()=>JSON.stringify(OCM.S.trail)),route);
    assert.equal(await page.evaluate(()=>OCM.S.cursor),1.25);
    assert.equal(await page.evaluate(()=>OCM.S.completed),true);
    await page.evaluate(async()=>{await OCM.useSavedCard('b');OCM.S.trail=[{x:50,y:50,r:0}];OCM.S.started=true;OCM.flushProgress();});
    assert.equal(await page.evaluate(()=>OCM.S.completed),false);
    await page.evaluate(()=>OCM.useSavedCard('a'));
    assert.equal(await page.evaluate(()=>JSON.stringify(OCM.S.trail)),route);
    await page.evaluate(()=>MazeUI.openLibrary());
    assert.equal(await page.locator('.is-completed').count(),1);
    assert.equal(await page.getByText('Continue route',{exact:true}).count(),1);
    fs.mkdirSync(path.join(root,'ui-qa'),{recursive:true});
    for(const [width,height] of [[320,568],[390,664],[844,390],[1280,800]]) {
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(root,`ui-qa/progress-library-${width}.png`)});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.evaluate(()=>MazeUI.closeLibrary());
      await page.locator('#btnMore').click();
      await page.screenshot({path:path.join(root,`ui-qa/progress-tools-${width}.png`)});
      await page.evaluate(()=>MazeUI.openLibrary());
    }
    await page.evaluate(()=>MazeUI.closeLibrary());
    await page.evaluate(()=>document.getElementById('btnComplete').click());
    assert.equal(await page.evaluate(()=>OCM.readProgress('a').completed),false);
    // Quota failures must keep switching behind the existing discard confirmation.
    await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('quota')};OCM.guardRoute('Switch card',()=>{window.didSwitch=true});});
    assert.equal(await page.evaluate(()=>!!window.didSwitch),false);
    assert.equal(await page.locator('#confirmCard').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: route/turn/review restoration, per-card isolation, completion toggle, responsive screenshots, quota safeguard');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
