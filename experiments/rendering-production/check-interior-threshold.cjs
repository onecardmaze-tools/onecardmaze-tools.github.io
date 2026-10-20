const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(process.env.OCM_ROOT||__dirname,'index.html'),'utf8');
const context=vm.createContext({SEAM_BORDER_EPS:Math.fround(.001)});
vm.runInContext(html.slice(html.indexOf('function interiorEdgeLimit('),html.indexOf('\nfunction uploadInteriorBounds(')),context);
const threshold=context.interiorEdgeLimit,f=Math.fround,clamp=x=>Math.max(0,Math.min(1,x));
function ramp(edge,width,size){return width>0?clamp(f(edge*f(size/width))):1;}
function border(edge,seam,size,zoom){if(seam<=f(.001))return 0;const px=f(edge*f(size*zoom)),t=clamp(f(f(px-f(1.1))/f(f(1.8)-f(1.1))));return f(1-f(f(t*t)*f(3-f(2*t))));}
assert.equal(threshold(0,0,900,1,10),2);
for(const [outer,seam,size,zoom] of [[0,0,904,.6],[40,0,904,.6],[0,10,1393,.6],[40,10,904,.1],[.0001,.001,904,1],[1,1,1,1]]) {
 const t=threshold(f(outer),f(seam),size,zoom,23);
 for(const edge of [t,f(t+1e-6),f(t+.01),1])if(edge>=t&&edge<=1){assert.equal(ramp(edge,f(outer),size),1);assert.equal(ramp(edge,f(seam),size),1);assert.equal(border(edge,f(seam),size,zoom),0);}
}
let seed=292939,accepted=0;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
for(let n=0;n<300000;n++){
 const size=1+Math.floor(random()*16384),zoom=.005+random()*16;
 const outer=f(random()<.2?0:random()*size*.8),seam=f(random()<.2?0:random()*size*.08);
 const t=threshold(outer,seam,size,zoom,23);
 for(const edge of [t,f(t+random()*1e-5),f(random())]) {
  if(edge<t||edge>1)continue;accepted++;
  assert.equal(ramp(edge,outer,size),1);assert.equal(ramp(edge,seam,size),1);assert.equal(border(edge,seam,size,zoom),0);
 }
}
const interiorFraction=(W,H,F,SW)=>{const x=threshold(F,SW,W,.6,23),y=threshold(F,SW,H,.6,23);return(1-2*x)*(1-2*y);};
console.log({testedCards:300000,acceptedEdgeCases:accepted,allFastPathRamps:1,allFastPathBorders:0,exampleWorstAllEdgesInteriorFraction:interiorFraction(904,1393,904*.045,904*.012)});
