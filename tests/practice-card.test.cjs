'use strict';
const assert=require('assert').strict,fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.slice(html.indexOf('async function loadDemo('),html.indexOf('$("btnDemo").addEventListener'));
for(const face of ['front','back']) {
 const png=fs.readFileSync(path.join(root,'assets/demo',face+'.png'));
 assert.equal(png.slice(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),1061);assert.equal(png.readUInt32BE(20),1483);
}
function fixture(rejectBack=false) {
 const calls=[],images={front:{width:1061,height:1483},back:{width:1061,height:1483}};
 const world={S:{demo:false},pending:{},Promise,
  loadImage:async url=>{calls.push(url);if(rejectBack&&url.endsWith('/back.png'))throw Error('decode failed');return url.endsWith('/front.png')?images.front:images.back;},
  $:()=>({classList:{remove(){}},removeAttribute(){}}),c:{setAttribute(){}},
  applyImages:(f,b)=>{assert.strictEqual(f,images.front);assert.strictEqual(b,images.back);calls.push('apply');},
  fitView:()=>calls.push('fit'),startNow:()=>calls.push('start'),updateHUD:()=>calls.push('hud'),toast:()=>calls.push('error')};
 vm.createContext(world);vm.runInContext(source,world);return {world,calls};
}
(async()=>{
 const good=fixture();await good.world.loadDemo(true);
 assert(good.world.S.demo);assert.deepEqual(good.calls,['assets/demo/front.png','assets/demo/back.png','apply','fit','start','hud']);
 const failed=fixture(true);await failed.world.loadDemo(true);
 assert(!failed.calls.includes('apply'),'A missing face cannot replace the current card');
 assert(failed.calls.includes('error'),'Image failures give visible feedback');
 const h=require('./app-harness.js')(),app=h.app,S=h.S;
 app.applyImages({width:1061,height:1483},{width:1061,height:1483});S.demo=true;app.startNow();
 assert.equal(S.walker.x,522);assert.equal(S.walker.y,750,'Demo starts at the printed START ring');
 S.demo=false;app.startNow();assert.equal(S.walker.x,530.5);assert.equal(S.walker.y,741.5,'Other cards retain the existing start behavior');
 console.log('PASS: bundled PNG dimensions, both-face loading, safe decode failure, demo START ring and unchanged uploaded-card start');
})().catch(error=>{console.error(error);process.exitCode=1;});
