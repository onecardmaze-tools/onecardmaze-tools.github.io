/* Pure timeline geometry shared by the browser and the regression tests. */
(function (root) {
  'use strict';
  const mod = (n, d) => ((n % d) + d) % d;
  const face = (i, j) => mod(i + j, 2);
  const turn = (a, b) => { const d = mod(b - a, 4); return d === 3 ? -1 : d; };
  function point(trail, t) {
    if (!trail.length) return null;
    t = Math.max(0, Math.min(trail.length - 1, t));
    const i = Math.floor(t), a = trail[i], b = trail[Math.min(i + 1, trail.length - 1)], f = t - i;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  function cuts(a, b, W, H) {
    const out = [];
    for (const [axis, size] of [['x', W], ['y', H]]) {
      if (a[axis] === b[axis]) continue;
      const lo = Math.ceil(Math.min(a[axis], b[axis]) / size);
      const hi = Math.floor(Math.max(a[axis], b[axis]) / size);
      for (let k = lo; k <= hi; k++) {
        const t = (k * size - a[axis]) / (b[axis] - a[axis]);
        if (t >= 0 && t <= 1) out.push({ t, axis });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  function canonical(p, i, j, W, H) {
    const x = p.x - i * W, y = p.y - j * H;
    return { x: mod(j, 2) ? W - x : x, y: mod(j, 2) ? H - y : y };
  }
  function pieces(a, b, W, H) {
    const ts = [0, ...cuts(a, b, W, H).map(c => c.t).filter(t => t > 0 && t < 1), 1];
    const result = [];
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-9) continue;
      const mid = (ts[k] + ts[k - 1]) / 2;
      const i = Math.floor((a.x + (b.x - a.x) * mid) / W);
      const j = Math.floor((a.y + (b.y - a.y) * mid) / H);
      const lerp = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      result.push({ i, j, t0: ts[k-1], t1: ts[k], face: face(i, j), a: canonical(lerp(ts[k - 1]), i, j, W, H),
        b: canonical(lerp(ts[k]), i, j, W, H) });
    }
    return result;
  }
  function canExtend(a,b,c) {
    if(a.r!==b.r || b.r!==c.r)return false;
    const dx=b.x-a.x,dy=b.y-a.y,ex=c.x-b.x,ey=c.y-b.y;
    const length=Math.hypot(dx,dy);
    return length>1e-9 && dx*ex+dy*ey>=0 && Math.abs(dx*ey-dy*ex)/length<1e-5;
  }
  function build(trail, spins, W, H, q0) {
    const events = [], distances = [0];
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      distances[i] = distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
      for (const c of cuts(a, b, W, H)) {
        const at = i - 1 + c.t;
        let ev = events[events.length - 1];
        if (!ev || Math.abs(ev.at - at) > 1e-7) {
          ev = { type: 'flip', at, axes: [], p: point(trail, at) }; events.push(ev);
        }
        if (!ev.axes.includes(c.axis)) ev.axes.push(c.axis);
      }
    }
    // A touch and return is not a fold. Compare positions on both sides of the seam.
    const folds = events.filter(e => {
      const k=Math.min(trail.length-2,Math.max(0,Math.floor(e.at)));
      const span=Math.max(Math.hypot(trail[k+1].x-trail[k].x,trail[k+1].y-trail[k].y),1);
      const epsilon=Math.min(.0001,Math.min(W,H)*.00001/span);
      const a = point(trail, e.at - epsilon), b = point(trail, e.at + epsilon);
      e.from = { i: Math.floor(a.x / W), j: Math.floor(a.y / H) };
      e.to = { i: Math.floor(b.x / W), j: Math.floor(b.y / H) };
      e.fromFace = face(e.from.i, e.from.j); e.toFace = face(e.to.i, e.to.j);
      return e.from.i !== e.to.i || e.from.j !== e.to.j;
    });
    let q = q0;
    for (const s of spins) {
      const delta = turn(q, s.q);
      if (delta && s.i >= 0) folds.push({ type: 'spin', at: Math.min(s.i, Math.max(0, trail.length - 1)),
        delta, fromQ: q, toQ: s.q, p: point(trail, s.i) });
      q = s.q;
    }
    folds.sort((a, b) => a.at - b.at || (a.type === 'flip' ? -1 : 1));
    folds.forEach((e, i) => { e.id = i; });
    return { events: folds, distances };
  }
  function distanceAt(model, t) {
    const ds = model.distances, n = ds.length - 1;
    if (n < 0) return 0;
    t = Math.max(0, Math.min(t, n));
    const i = Math.floor(t);
    return ds[i] + ((ds[Math.min(i + 1, n)] || 0) - ds[i]) * (t - i);
  }
  function advance(model, t, distance) {
    const ds = model.distances, target = Math.max(0, Math.min(ds[ds.length - 1] || 0, distanceAt(model, t) + distance));
    let lo = 0, hi = ds.length - 1;
    while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (ds[m] <= target) lo = m; else hi = m - 1; }
    if (lo >= ds.length - 1) return Math.max(0, ds.length - 1);
    return lo + (target - ds[lo]) / (ds[lo + 1] - ds[lo] || 1);
  }
  const api = { mod, face, turn, point, canonical, pieces, canExtend, build, distanceAt, advance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReplayCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
