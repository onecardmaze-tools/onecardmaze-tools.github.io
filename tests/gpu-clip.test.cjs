const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert").strict;
const source =
  process.argv[2] || require("path").join(__dirname, "..", "gpu-renderer.js");
const calls = [];
const gl = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === "getExtension") return () => ({});
      if (key === "getShaderParameter" || key === "getProgramParameter")
        return () => true;
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
const window = { Path2D: class {} };
vm.runInNewContext(fs.readFileSync(source, "utf8"), {
  window,
  Math,
  Float32Array,
  Map,
  Set,
  Proxy,
  WeakMap,
  Number,
});
const ctx = new window.GPURenderer.Context({
  width: 800,
  height: 600,
  getContext: (name) => (name === "webgl" ? gl : null),
});
function clipRects(rects) {
  ctx.beginPath();
  for (const rect of rects) ctx.rect(...rect);
  ctx.clip();
}
function reset() {
  ctx.state.clip = null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
const serialize = (value) => JSON.parse(JSON.stringify(value));
reset();
clipRects([
  [0, 0, 10, 10],
  [10, 0, 10, 10],
  [0, 10, 10, 10],
]);
assert.equal(
  ctx.state.clip.rects.length,
  2,
  "L shape retains both overlapping maximal bars",
);
const rects = ctx.state.clip.rects;
function coverage(x, y) {
  return Math.max(
    ...rects.map((r) => {
      const dx = Math.abs(x - r[0] - r[2] / 2) - r[2] / 2,
        dy = Math.abs(y - r[1] - r[3] / 2) - r[3] / 2;
      const d =
        Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
        Math.min(Math.max(dx, dy), 0);
      return Math.max(0, Math.min(1, 0.5 - d));
    }),
  );
}
assert.equal(coverage(5, 10), 1, "vertical shared tile edge has no seam");
assert.equal(coverage(10, 5), 1, "horizontal shared tile edge has no seam");
assert.equal(coverage(20, 5), 0.5, "outer clip boundary antialiases");
assert.equal(coverage(20.75, 5), 0, "outside fringe fully clipped");
assert.equal(coverage(12, 12), 0, "L shape missing corner stays empty");
ctx.save();
clipRects([[5, 5, 10, 10]]);
assert.equal(ctx.state.clip.rects.length, 2);
ctx.restore();
assert.equal(ctx.state.clip.rects, rects);
clipRects([[30, 30, 10, 10]]);
assert.equal(ctx.state.clip.rects.length, 0);
ctx.setStrokeClip(ctx.u);
assert(
  calls.some(
    (c) => c[0] === "uniform1i" && c[1] === "uClipCount" && c[2] === -1,
  ),
);
reset();
const grid = [];
for (let y = 0; y < 3; y++)
  for (let x = 0; x < 6; x++) grid.push([10 * x, 10 * y, 10, 10]);
clipRects(grid);
assert.deepEqual(serialize(ctx.state.clip.rects), [[0, 0, 60, 30]]);
reset();
ctx.scale(2, 2);
ctx.rotate(0.5);
clipRects([[0, 0, 10, 10]]);
assert(Math.abs(ctx.state.clip.scale[0] - 2) < 1e-10);
const original = ctx.state.clip;
clipRects([[3, 4, 2, 3]]);
assert.deepEqual(serialize(ctx.state.clip.rects), [[3, 4, 2, 3]]);
assert.deepEqual(
  serialize(ctx.state.clip.inverse),
  serialize(original.inverse),
);
console.log(
  "Clip checks passed: maximal rectangular union, no L-shape seams, one-pixel outer coverage, nested intersection, empty clipping, save/restore, grid coalescing and rotated scale.",
);
