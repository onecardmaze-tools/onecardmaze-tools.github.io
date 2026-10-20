const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const html = fs.readFileSync(
  require("path").join(__dirname, "..", "index.html"),
  "utf8",
);
const source = html.slice(
  html.indexOf("function cardsCoverViewport("),
  html.indexOf("\nfunction render() {"),
);
const world = {
  S: { W: 100, H: 140, zoom: 1, rot: 0, cam: { x: 50, y: 70 } },
  view: { w: 80, h: 100 },
  dpr: 2,
  cardFloatPrecision: 23,
  cardIdx: new Float32Array(36),
  cardOut: new Float32Array(72),
  cardAmt: new Float32Array(18),
};
vm.createContext(world);
vm.runInContext(source, world);
function tiles(values) {
  world.cardIdx.fill(0);
  world.cardOut.fill(0);
  world.cardAmt.fill(0);
  values.forEach(([i, j, amt = 1, outer = [0, 0, 0, 0]], n) => {
    world.cardIdx.set([i, j], n * 2);
    world.cardOut.set(outer, n * 4);
    world.cardAmt[n] = amt;
  });
  return world.cardsCoverViewport(values.length);
}
assert(tiles([[0, 0]]));
assert(!tiles([[0, 0, 0.999]]));
assert(!tiles([[0, 0, 1, [15, 0, 0, 0]]]));
assert(tiles([[0, 0, 1, [4, 4, 4, 4]]]));
world.view = { w: 150, h: 200 };
const nine = [];
for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) nine.push([i, j]);
assert(tiles(nine));
assert(!tiles(nine.filter(([i, j]) => i || j))); // Four corners cannot detect this hole.
world.S.rot = Math.PI / 4;
assert(tiles(nine));
world.view = { w: 310, h: 310 };
assert(!tiles(nine));
world.view = { w: 80, h: 100 };
world.S.rot = 0;
world.cardFloatPrecision = 10;
assert(!tiles([[0, 0]]));
world.cardFloatPrecision = 23;
let seed = 421337,
  accepted = 0;
const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
for (let trial = 0; trial < 20000; trial++) {
  world.S.cam = {
    x: 50 + (random() - 0.5) * 150,
    y: 70 + (random() - 0.5) * 180,
  };
  world.S.rot = random() * Math.PI * 2;
  world.S.zoom = 0.6 + random() * 2;
  world.view = { w: 50 + random() * 180, h: 50 + random() * 200 };
  const candidates = nine
    .filter(() => random() > 0.05)
    .map(([i, j]) => [
      i,
      j,
      random() < 0.08 ? 0.75 : 1,
      [
        random() < 0.1 ? 8 : 0,
        random() < 0.1 ? 8 : 0,
        random() < 0.1 ? 8 : 0,
        random() < 0.1 ? 8 : 0,
      ],
    ]);
  if (!tiles(candidates)) continue;
  accepted++;
  const cr = Math.cos(world.S.rot),
    sr = Math.sin(world.S.rot),
    z = world.S.zoom;
  for (let v = 0; v <= 12; v++)
    for (let u = 0; u <= 12; u++) {
      const dx = (u / 12 - 0.5) * world.view.w,
        dy = (v / 12 - 0.5) * world.view.h;
      const x = world.S.cam.x + (cr * dx + sr * dy) / z,
        y = world.S.cam.y + (-sr * dx + cr * dy) / z;
      const i = Math.floor(x / 100),
        j = Math.floor(y / 140),
        tile = candidates.find((t) => t[0] === i && t[1] === j);
      assert(tile && tile[2] === 1);
      const o = tile[3];
      assert(
        x >= i * 100 + o[0] &&
          x <= (i + 1) * 100 - o[1] &&
          y >= j * 140 + o[2] &&
          y <= (j + 1) * 140 - o[3],
      );
    }
}
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  new vm.Script(match[1]);
console.log(
  `Opaque coverage: deterministic cases, 20000 random views (${accepted} accepted, 169 samples each), and inline syntax checks passed.`,
);
