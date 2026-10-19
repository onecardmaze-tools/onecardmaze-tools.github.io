/* CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/large-view-raster.test.js */
'use strict';
const assert=require('assert'),canvas=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const h=require('./app-harness.js')(canvas,{width:1504,height:1492,dpr:2,finePointer:true}),{app,S}=h;
app.tap({x:450,y:1700});for(let k=0;k<400;k++)h.tick();
S.zoom=.888095238095238;S.trail=[{x:300,y:1400,r:0},{x:450,y:1400,r:0},{x:450,y:1700,r:0}];S.cursor=2;S.replayVersion++;app.refreshTrace();app.render();
const layer=h.elements.get('traceLayer'),layout=app.traceLayout();assert(layout&&layout.rasterRatio<2);
const screen=canvas.createCanvas(3008,2984),g=screen.getContext('2d');
for(const angle of [0,.43,Math.PI/2,-Math.PI*.7]){
 S.rot=S.rotTarget=angle;app.render();
 const m=layer.style.transform.slice(7,-1).split(',').map(Number);
 g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,3008,2984);
 g.setTransform(m[0]*2,m[1]*2,m[2]*2,m[3]*2,m[4]*2,m[5]*2);
 g.drawImage(layer.getContext('2d').canvas,0,0,parseFloat(layer.style.width),parseFloat(layer.style.height));
 for(const p of [{x:330,y:1400},{x:440,y:1400},{x:450,y:1450},{x:450,y:1650}]){
  const at=app.w2s(p.x,p.y),pixels=g.getImageData(Math.round(at.x*2)-1,Math.round(at.y*2)-1,3,3).data;
  assert(Array.from(pixels).some((a,i)=>i%4===3&&a>100),'Retained ink covers exact world centreline at rotation '+angle);
 }
}
console.log('PASS: bounded-density static ink aligns with world coordinates in real raster at four rotations');
