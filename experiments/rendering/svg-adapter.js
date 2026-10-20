/* Experimental retained SVG adapter. Native artwork WebGL remains untouched. */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg', I=()=>[1,0,0,1,0,0];
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const matrix=m=>'matrix('+m.join(' ')+')';
function attrs(el,values){for(const [k,v] of Object.entries(values)){if(v==null){if(el.hasAttribute(k))el.removeAttribute(k);}else if(el.getAttribute(k)!==String(v))el.setAttribute(k,v);}}
class SVGPath {
 constructor(p){this.d=p?p.d:'';}
 moveTo(x,y){this.d+='M'+x+' '+y;}
 lineTo(x,y){this.d+='L'+x+' '+y;}
 closePath(){this.d+='Z';}
 rect(x,y,w,h){this.d+='M'+x+' '+y+'h'+w+'v'+h+'h'+(-w)+'Z';}
 arc(x,y,r,a,b,ccw=false){const delta=b-a,full=Math.abs(delta)>=Math.PI*2-1e-8;this.moveTo(x+r*Math.cos(a),y+r*Math.sin(a));if(full){this.d+='a'+r+' '+r+' 0 1 '+(ccw?0:1)+' '+(-2*r*Math.cos(a))+' '+(-2*r*Math.sin(a));this.d+='a'+r+' '+r+' 0 1 '+(ccw?0:1)+' '+(2*r*Math.cos(a))+' '+(2*r*Math.sin(a));}else this.d+='A'+r+' '+r+' 0 '+(Math.abs(delta)>Math.PI?1:0)+' '+(ccw?0:1)+' '+(x+r*Math.cos(b))+' '+(y+r*Math.sin(b));}
 addPath(p){this.d+=p.d;}
}
const stateKeys=['globalAlpha','fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','font','textAlign','textBaseline','dash','clipId'];
class SVGContext {
 constructor(svg){this.svg=svg;this.defs=document.createElementNS(NS,'defs');this.root=document.createElementNS(NS,'g');svg.append(this.defs,this.root);this.items=[];this.clips=[];this.stack=[];this.m=I();this.globalAlpha=1;this.fillStyle='#000';this.strokeStyle='#000';this.lineWidth=1;this.lineCap='butt';this.lineJoin='miter';this.font='10px sans-serif';this.textAlign='start';this.textBaseline='alphabetic';this.dash=[];this.clipId=null;this.n=0;this.c=0;this.beginPath();}
 setTransform(...m){this.m=m;}
 translate(x,y){this.m=mul(this.m,[1,0,0,1,x,y]);}
 scale(x,y){this.m=mul(this.m,[x,0,0,y,0,0]);}
 rotate(a){this.m=mul(this.m,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);}
 save(){const s={m:this.m.slice()};for(const k of stateKeys)s[k]=this[k];this.stack.push(s);}
 restore(){const s=this.stack.pop();if(s)Object.assign(this,s);}
 clearRect(){this.n=0;this.c=0;this.clipId=null;}
 finish(){for(let k=this.n;k<this.items.length;k++)this.items[k].wrap.setAttribute('display','none');}
 beginPath(){this.path=new SVGPath();}
 moveTo(...a){this.path.moveTo(...a);}lineTo(...a){this.path.lineTo(...a);}rect(...a){this.path.rect(...a);}arc(...a){this.path.arc(...a);}closePath(){this.path.closePath();}
 clip(){const id=this.svg.id+'-clip-'+this.c;let cp=this.clips[this.c++];if(!cp){cp=document.createElementNS(NS,'clipPath');cp.append(document.createElementNS(NS,'path'));this.defs.append(cp);this.clips.push(cp);}attrs(cp,{id,clipPathUnits:'userSpaceOnUse'});attrs(cp.firstChild,{d:this.path.d,transform:matrix(this.m)});this.clipId=id;}
 node(tag,a){let item=this.items[this.n++];if(!item){const wrap=document.createElementNS(NS,'g'),el=document.createElementNS(NS,tag);wrap.append(el);this.root.append(wrap);item={wrap,el};this.items.push(item);}else if(item.el.localName!==tag){const el=document.createElementNS(NS,tag);item.el.replaceWith(el);item.el=el;}
 attrs(item.wrap,{display:null,'clip-path':this.clipId?'url(#'+this.clipId+')':null});attrs(item.el,{...a,transform:matrix(this.m),opacity:this.globalAlpha});return item.el;}
 stroke(p=this.path){this.node('path',{d:p.d,fill:'none',stroke:this.strokeStyle,'stroke-width':this.lineWidth,'stroke-linecap':this.lineCap,'stroke-linejoin':this.lineJoin,'stroke-dasharray':this.dash.length?this.dash.join(' '):null});}
 fill(p=this.path){this.node('path',{d:p.d,fill:this.fillStyle,stroke:'none','stroke-dasharray':null});}
 strokeRect(...a){const p=new SVGPath();p.rect(...a);this.stroke(p);}
 fillRect(...a){const p=new SVGPath();p.rect(...a);this.fill(p);}
 setLineDash(a){this.dash=a;}
 drawImage(sprite,x,y,w,h){if(!sprite._svgData)sprite._svgData=sprite.toDataURL();this.node('image',{href:sprite._svgData,x,y,width:w,height:h});}
 measureText(text){if(!this.measure){this.measure=document.createElement('canvas').getContext('2d');}this.measure.font=this.font;return this.measure.measureText(text);}
 fillText(text,x,y){const el=this.node('text',{x,y,fill:this.fillStyle,stroke:'none','text-anchor':this.textAlign==='center'?'middle':this.textAlign==='right'?'end':'start','dominant-baseline':this.textBaseline==='middle'?'central':'auto',style:'font:'+this.font});if(el.textContent!==text)el.textContent=text;}
}
window.SVGPath=SVGPath;
window.svgCanvas=function(id){const svg=document.getElementById(id),g=new SVGContext(svg);let width=1,height=1;return {style:svg.style,context:g,element:svg,getContext:()=>g,get width(){return width;},set width(v){width=v;svg.setAttribute('viewBox','0 0 '+width+' '+height);},get height(){return height;},set height(v){height=v;svg.setAttribute('viewBox','0 0 '+width+' '+height);}};};
})();
