/* Optional real-raster test: CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/trace-raster.test.js */
'use strict';
const assert=require('assert'),fs=require('fs');
const {createCanvas,Path2D}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const T=require('../trace-renderer.js');
const route=[{x:30,y:30,r:0},{x:170,y:30,r:0},{x:170,y:75,r:0},{x:60,y:75,r:1},{x:60,y:15,r:1},{x:90,y:90,r:2},{x:180,y:140,r:0}];
const tiles=[];for(let j=-1;j<=2;j++)for(let i=-1;i<=2;i++)tiles.push({i,j});
const scene=T.scene(T.compile(route,100,100),tiles,100,100,Path2D);
for(const zoom of [1,2,4])for(let q=0;q<4;q++) {
  const cv=createCanvas(900,900),g=cv.getContext('2d'),a=q*Math.PI/2;
  g.translate(450,450);g.rotate(a);g.scale(zoom,zoom);g.translate(-100,-100);
  T.paint(g,scene,5/zoom);
  const data=g.getImageData(0,0,900,900).data;
  for(let k=1;k<route.length;k++)for(let t=.005;t<1;t+=.005) {
    const x=(route[k-1].x+(route[k].x-route[k-1].x)*t-100)*zoom;
    const y=(route[k-1].y+(route[k].y-route[k-1].y)*t-100)*zoom;
    const sx=Math.round(450+x*Math.cos(a)-y*Math.sin(a)),sy=Math.round(450+x*Math.sin(a)+y*Math.cos(a));
    const at=(sy*900+sx)*4;
    assert(data[at+3]>250,'No transparent centreline cracks at seams, bends or intersections');
    assert(data[at]+data[at+1]+data[at+2]>150,'No dark casing cuts through coloured centreline');
  }
  if(zoom===2&&q===0)fs.writeFileSync('/tmp/onecardmaze-trace-raster.png',cv.toBuffer('image/png'));
}
console.log('PASS: real raster centreline coverage and colour, 3 zoom levels × 4 rotations, seams, hairpins and crossings');
