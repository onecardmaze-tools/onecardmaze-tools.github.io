/* CPU-only GL recording: retained rectangle geometry and cache lifecycle. */
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = process.argv[2] || path.join(__dirname, '..', 'gpu-renderer.js');
const uploads = [];
const gl = new Proxy({}, {
  get(target, key) {
    if (key === 'getExtension') return () => ({});
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key === 'getUniformLocation') return (program, name) => name;
    if (key === 'getAttribLocation') return (program, name) =>
      ({aPosition:0,aColor:1,aUv:2,aStart:0,aEnd:1,aCorner:2,aCaps:3}[name]);
    if (key === 'bufferData') return (target, data) => uploads.push(Array.from(data));
    if (/^[A-Z_]+$/.test(key)) return key;
    if (/^create/.test(key)) return () => ({});
    return () => {};
  }
});
const window = {};
vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
  window, Math, Float32Array, Map, Set, WeakMap, Number
});
const {Context} = window.GPURenderer;
const ctx = new Context({
  width: 1504, height: 1492,
  getContext: name => name === 'webgl' ? gl : null
});
const lastUpload = () => uploads[uploads.length - 1];
ctx.lineWidth = 4;
ctx.lineCap = 'round';
ctx.strokeRect(10, 20, 600, 500);
assert.equal(uploads.length, 1);
assert.equal(lastUpload().length, 4 * 6 * 8, 'Four butt segments form the rectangle union');
assert.deepEqual(lastUpload().slice(0, 4), [8, 20, 612, 20]);
assert.equal(ctx.lineCap, 'round', 'strokeRect restores the caller cap style');
const originalPath = ctx.rectanglePaths.values().next().value;
ctx.translate(100, -60);
ctx.rotate(.37);
ctx.strokeRect(10, 20, 600, 500);
assert.equal(uploads.length, 1, 'Rotation and translation must reuse the same VBO');
assert.equal(ctx.rectanglePaths.values().next().value, originalPath);
ctx.lineWidth = 6;
ctx.strokeRect(10, 20, 600, 500);
assert.equal(uploads.length, 2, 'A changed line width changes the square-corner expansion');
assert.deepEqual(lastUpload().slice(0, 4), [7, 20, 613, 20]);
ctx.strokeRect(10, 20, 650, 500);
assert.equal(uploads.length, 3);
assert.deepEqual(lastUpload().slice(0, 4), [7, 20, 663, 20]);
ctx.strokeRect(12, 20, 650, 500);
assert.equal(uploads.length, 4, 'A changed model-space origin must not alias the cache');
assert.deepEqual(lastUpload().slice(0, 4), [9, 20, 665, 20]);
ctx.strokeRect(12, 22, 650, 550);
assert.equal(uploads.length, 5, 'Y and height are also part of the exact geometry key');
assert.deepEqual(lastUpload().slice(0, 4), [9, 22, 665, 22]);
assert.deepEqual(lastUpload().slice(48, 52), [9, 572, 665, 572]);
ctx.setLineDash([100, 100]);
ctx.strokeRect(12, 22, 650, 550);
assert.equal(uploads.length, 6, 'Dash changes still invalidate the renderer stroke VBO');
ctx.strokeRect(12, 22, 650, 550);
assert.equal(uploads.length, 6);
ctx.setLineDash([]);
for (let x = 0; x < 70; x++) ctx.strokeRect(1000 + x, 20, 600, 500);
assert.equal(ctx.rectanglePaths.size, 64, 'Rectangle path ownership is bounded independently of VBO eviction');
ctx.dispose(true);
assert.equal(ctx.rectanglePaths.size, 0, 'Context loss releases cached path references');
console.log('Retained rectangle checks passed: transform reuse, exact geometry keys, cap restoration, dash invalidation and bounded lifecycle.');
