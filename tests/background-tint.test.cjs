'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('function updateBackground('), html.indexOf('\nfunction applyImages('));
let pixels, output;
const sandbox = { BG: [], document: {
  createElement() { return { getContext() { return { drawImage() {}, getImageData() { return { data: pixels }; } }; } }; },
  documentElement: { style: { setProperty(name, value) { output = value; } } }
} };
vm.createContext(sandbox); vm.runInContext(source, sandbox);
function tint(values) {
  pixels = values.flat(); sandbox.updateBackground({}, {});
  assert.match(output, /^rgb\(/);
  for (const v of sandbox.BG) assert(v >= .95 && v <= 1, 'Tint stays near white');
  return Array.from(sandbox.BG);
}
for (const [rgb, channel] of [[[255,0,0],0], [[0,255,0],1], [[0,0,255],2]]) {
  const color = tint([[...rgb,255], [...rgb,255]]);
  assert(color[channel] > color[(channel+1)%3], 'Background takes the card hue');
}
for (const input of [
  [[230,230,230,255], [30,30,30,255]], // neutral image
  [[255,0,0,255], [0,255,255,255]], // equal opposite hues
  [[255,0,0,0], [220,220,220,255]] // transparent color must not dominate
]) {
  const color = tint(input);
  assert(Math.max(...color)-Math.min(...color)<1e-6, 'Ambiguous artwork uses neutral paper');
}
console.log('PASS: card hue follows artwork, remains near white, and handles neutral, opposing and transparent colors');
