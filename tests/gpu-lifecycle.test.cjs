const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert").strict;
const calls = [];
let failCompile = false;
const gl = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === "getExtension") return () => ({});
      if (key === "getShaderParameter") return () => !failCompile;
      if (key === "getProgramParameter") return () => true;
      if (key === "getShaderInfoLog") return () => "mock compilation failed";
      if (key === "getUniformLocation") return (_, name) => name;
      if (key === "getAttribLocation")
        return (_, name) =>
          ({
            aPosition: 0,
            aColor: 1,
            aUv: 2,
            aStart: 0,
            aEnd: 1,
            aCorner: 2,
            aCaps: 3,
          })[name];
      if (/^[A-Z_]+$/.test(key)) return key;
      if (/^create/.test(key)) return () => ({});
      return (...args) => calls.push([key, ...args]);
    },
  },
);
const native = { measureText: () => ({ width: 42 }), canvas: null };
function canvas(gpu = true) {
  const handlers = {};
  return {
    width: 800,
    height: 600,
    handlers,
    getContext: (name) =>
      name === "2d" ? native : name === "webgl" && gpu ? gl : null,
    cloneNode: () => canvas(false),
    addEventListener: (name, fn) => (handlers[name] = fn),
    removeEventListener: (name) => delete handlers[name],
  };
}
const window = { Path2D: class NativePath {} };
const document = { createElement: () => ({ getContext: () => native }) };
vm.runInNewContext(
  fs.readFileSync(
    require("path").join(__dirname, "..", "gpu-renderer.js"),
    "utf8",
  ),
  { window, document, Math, Float32Array, Map, Set, Proxy, WeakMap, Number },
);
const api = window.GPURenderer;
let invalidations = 0;
const cv = canvas();
const renderer = api.create(cv, {
  invalidate: () => invalidations++,
  pathBudgetBytes: 1024,
});
const context = renderer.context;
const savedStroke = context.stroke;
const path = new api.Path();
path.moveTo(0, 0);
for (let i = 1; i < 20; i++) path.lineTo(i, 1);
savedStroke(path);
assert.equal(
  context.pathBytes,
  0,
  "oversized path evicted after completing draw",
);
const drawPositions = calls
  .map((call, i) => (call[0] === "drawArrays" ? i : -1))
  .filter((i) => i >= 0);
const deletePosition = calls.findIndex((call) => call[0] === "deleteBuffer");
assert(
  deletePosition > drawPositions[drawPositions.length - 1],
  "eviction must follow both passes",
);
context.drawImage({ width: 5, height: 5 }, 0, 0);
renderer.flush();
assert(
  calls.some((call) => call[0] === "disableVertexAttribArray" && call[1] === 3),
);
let prevented = false;
cv.handlers.webglcontextlost({ preventDefault: () => (prevented = true) });
assert(prevented);
assert.equal(renderer.mode, "webgl-lost");
let count = calls.length;
savedStroke(path);
assert.equal(calls.length, count, "lost rendering must not call GL");
assert.equal(context.measureText("a").width, 42);
cv.handlers.webglcontextrestored();
assert.equal(renderer.context, context);
assert.equal(renderer.mode, "webgl-analytic");
savedStroke(path);
assert(context.metrics.draws > 0);
assert.equal(invalidations, 2);
renderer.dispose();
count = calls.length;
savedStroke(path);
assert.equal(calls.length, count);
assert(!cv.handlers.webglcontextlost);
const fallback = api.create(canvas(false));
assert.equal(fallback.mode, "canvas2d-fallback");
assert.equal(fallback.Path, window.Path2D);
failCompile = true;
const failed = api.create(canvas());
assert.equal(failed.mode, "canvas2d-fallback");
assert(calls.some((call) => call[0] === "deleteShader"));
console.log(
  "Lifecycle checks passed: VBO byte budget, deferred eviction, stale attributes, context loss suppression, text measurement, stable restore proxy, disposal, native fallback and failed-shader cleanup.",
);
