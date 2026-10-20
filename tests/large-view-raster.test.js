/* CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/large-view-raster.test.js */
'use strict';
const assert=require('assert'),canvas=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const h=require('./app-harness.js')(canvas,{width:1504,height:1492,dpr:2,finePointer:true}),{app,S}=h;
app.tap({x:450,y:1700});for(let k=0;k<400;k++)h.tick();
S.zoom=.888095238095238;S.trail=[{x:300,y:1400,r:0},{x:450,y:1400,r:0},{x:450,y:1700,r:0}];S.cursor=2;S.replayVersion++;app.refreshTrace();app.render();
const layer=h.elements.get('replayLayer'),g=layer.getContext('2d');
assert.equal(layer.width,3008);assert.equal(layer.height,2984);
for(const angle of [0,.43,Math.PI/2,-Math.PI*.7]){
 S.rot=S.rotTarget=angle;app.render();
 for(const p of [{x:330,y:1400},{x:440,y:1400},{x:450,y:1450},{x:450,y:1650}]){
  const at=app.w2s(p.x,p.y),pixels=g.getImageData(Math.round(at.x*2)-1,Math.round(at.y*2)-1,3,3).data;
  assert(Array.from(pixels).some((a,i)=>i%4===3&&a>100),'Viewport ink covers exact world centreline at rotation '+angle);
 }
}
console.log('PASS: full-DPR Canvas fallback ink aligns with world coordinates at four rotations');
