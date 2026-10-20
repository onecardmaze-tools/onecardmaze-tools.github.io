/* No browser/GPU work: model context generations so stale handle use fails. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert").strict;
const path = require("path");
const source = process.argv[2] || path.join(process.cwd(), "gpu-renderer.js");
const calls = [];
let generation = 1;
let contextLost = false;
const gl = new Proxy(
  {},
  {
    get(target, key) {
      if (key === "getExtension") return () => ({});
      if (key === "getShaderParameter" || key === "getProgramParameter")
        return () => true;
      if (key === "getUniformLocation")
        return (program, name) => ({ generation, name });
      if (key === "getAttribLocation")
        return (program, name) =>
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
      if (/^create/.test(key)) return () => ({ generation, resource: key });
      return (...args) => {
        assert(!contextLost, "GL call while lost: " + key);
        for (const value of args) {
          if (value && value.resource)
            assert.equal(
              value.generation,
              generation,
              "Stale GPU handle in " + key,
            );
        }
        calls.push([key, ...args]);
      };
    },
  },
);
const handlers = {};
const canvas = {
  width: 800,
  height: 600,
  getContext: (name) => (name === "webgl" ? gl : null),
  addEventListener: (name, listener) => (handlers[name] = listener),
  removeEventListener: (name) => delete handlers[name],
};
const rasterContext = { measureText: () => ({ width: 42 }) };
const document = { createElement: () => ({ getContext: () => rasterContext }) };
const window = { Path2D: class NativePath {} };
vm.runInNewContext(fs.readFileSync(source, "utf8"), {
  window,
  document,
  Math,
  Float32Array,
  Map,
  Set,
  Proxy,
  WeakMap,
  Number,
});
const renderer = window.GPURenderer.create(canvas);
const context = renderer.context;
const stroke = context.stroke;
const route = new renderer.Path();
route.moveTo(0, 0);
route.lineTo(20, 10);
stroke(route);
context.imageTexture({ width: 2, height: 2 });
const beforeLoss = calls.length;
contextLost = true;
handlers.webglcontextlost({ preventDefault() {} });
assert.equal(
  calls.length,
  beforeLoss,
  "Loss must release JavaScript ownership without GL deletion",
);
stroke(route);
assert.equal(context.measureText("text").width, 42);
assert.equal(calls.length, beforeLoss, "No drawing or deletion while lost");
contextLost = false;
generation++;
handlers.webglcontextrestored();
assert.equal(renderer.context, context, "Public context remains stable");
assert.equal(renderer.mode, "webgl-analytic");
stroke(route);
assert(
  context.metrics.draws > 0,
  "Cached method must address restored renderer",
);
renderer.dispose();
assert(!handlers.webglcontextlost);
console.log(
  "Context generation checks passed: no lost-context GL calls, no old-handle deletion after restore, stable context/method references and current-generation disposal.",
);
