const fs = require("fs");
const vm = require("vm");
const assert = require("assert").strict;
const calls = [];
const uploads = [];
const special = {
  getExtension: () => ({}),
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getAttribLocation: (program, name) =>
    [
      "aPosition",
      "aColor",
      "aUv",
      "aStart",
      "aEnd",
      "aCorner",
      "aCaps",
    ].indexOf(name),
  getUniformLocation: (program, name) => name,
  bufferData: (target, data) => uploads.push(Array.from(data)),
};
const gl = new Proxy(
  {},
  {
    get: (_, key) => {
      if (special[key]) return special[key];
      if (/^[A-Z_]+$/.test(key)) return key;
      if (/^create/.test(key)) return () => ({});
      return (...args) => calls.push([key, ...args]);
    },
  },
);
const window = {};
vm.runInNewContext(
  fs.readFileSync(
    require("path").join(__dirname, "..", "gpu-renderer.js"),
    "utf8",
  ),
  { window, Math, Float32Array, Map, WeakMap, Number },
);
const { Context, Path } = window.GPURenderer;
const ctx = new Context({
  width: 1000,
  height: 1000,
  getContext: (name) => (name === "webgl" ? gl : null),
});
const path = new Path();
path.moveTo(0, 0);
path.lineTo(10, 0);
path.lineTo(10, 10);
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.stroke(path);
assert.equal(uploads[uploads.length - 1].length, 2 * 6 * 8);
assert.equal(ctx.metrics.cachedDraws, 2);
let count = uploads.length;
ctx.lineWidth = 50;
ctx.rotate(0.3);
ctx.stroke(path);
assert.equal(
  uploads.length,
  count,
  "line width and transform must reuse cached VBO",
);
assert.equal(ctx.metrics.cacheHits, 1);
const child = new Path();
child.addPath(path);
child.addPath(path);
ctx.stroke(child);
assert.equal(
  ctx.metrics.cachedDraws,
  8,
  "composite paths draw all leaves in both passes",
);
ctx.setLineDash([2, 2]);
ctx.stroke(path);
assert(uploads[uploads.length - 1].length > 2 * 6 * 8, "dashes split segments");
ctx.strokeId = 254;
ctx.stroke(path);
assert.equal(ctx.strokeId, 1);
assert(
  calls.some(
    (call) =>
      call[0] === "colorMask" && call.slice(1).every((v) => v === false),
  ),
);
assert(calls.some((call) => call[0] === "depthFunc" && call[1] === "GREATER"));
assert(calls.some((call) => call[0] === "depthFunc" && call[1] === "EQUAL"));
const circle = new Path();
circle.arc(2, 3, 4, 0, Math.PI * 2);
assert.equal(circle.commands.length, 1);
assert.equal(circle.commands[0][0], "arc");
const rect = new Path();
rect.rect(2, 3, 4, 5);
assert.equal(rect.commands.length, 1);
assert.equal(rect.commands[0][0], "rect");
console.log(
  "Analytic stroke mock checks passed: leaf cache, width/transform reuse, composite prepass, dashes, depth/stencil rollover, original arc/rect commands.",
);
