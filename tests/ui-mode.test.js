/* UI modes and route safety (DESIGN-SYSTEM.md › Modes, › Route safety).
   Reviewing never edits; branching asks; Done keeps the route; Start over is undoable. */
'use strict';
const assert = require('assert'), harness = require('./app-harness.js');
const h = harness(), { app, S } = h;
const settle = (n = 240) => { for (let i = 0; i < n; i++) h.tick(); };
const route = () => JSON.stringify(S.trail);

app.startNow();
assert.equal(app.uiMode(), 'walk', 'a fresh card starts in walk mode');
for (const p of [{ x: 600, y: 525 }, { x: 600, y: 800 }, { x: 300, y: 800 }]) { app.tap(p); settle(); }
app.spin(1); settle(60);
app.tap({ x: 300, y: 600 }); settle();
const end = S.trail.length - 1;
assert(end >= 3, 'walking records a route');
const full = route(), spins = JSON.stringify(S.spins);

// Undo is a walking tool: it rewinds but stays in walk mode, and walking commits (standard undo).
app.undoOnce();
assert.equal(app.uiMode(), 'walk', 'Undo keeps the walk dock');
assert(S.cursor < end && S.undoRewind, 'Undo rewinds');
app.finishReview();
assert.equal(route(), full, 'Done after Undo returns to the end unchanged');
assert.equal(S.cursor, end);

// Playing and pausing.
app.play(1);
assert.equal(app.uiMode(), 'playing');
app.tap({ x: 10, y: 10 });
assert.equal(S.play, 0, 'tapping the map during a replay pauses it');
assert.equal(app.uiMode(), 'paused');
assert.equal(route(), full, 'pausing by tap never edits the route');

// P0 regression: reverse replay to the start, then tap. The route must survive.
S.cursor = end; app.play(-1); S.replaySpeed = 4;
for (let i = 0; i < 4000 && S.play; i++) h.tick(50);
assert(S.reviewDone && S.cursor === 0, 'reverse replay completes at the start');
assert.equal(app.uiMode(), 'complete');
app.tap({ x: 500, y: 500 });
assert.equal(route(), full, 'a tap after a reverse replay does not truncate the route');
assert(S.confirm && S.confirm.kind === 'branch', 'it asks before branching');
app.confirmNo();
assert.equal(route(), full, 'Keep route keeps it');
assert.equal(S.confirm, null);

// Rotating from the middle of a review also asks; Esc-equivalent Done keeps everything.
app.setCursor(1.5);
assert.equal(app.uiMode(), 'paused');
app.spin(-1);
assert.equal(route(), full, 'rotating while reviewing does not edit the route');
assert.equal(JSON.stringify(S.spins), spins, 'nor the recorded turns');
assert(S.confirm, 'rotating mid-route asks first');
app.finishReview();
assert.equal(S.confirm, null, 'Done withdraws the question');
assert.equal(app.uiMode(), 'walk');
assert.equal(S.cursor, end, 'Done goes to the end of the route');
assert.equal(route(), full, 'Done never edits the trail');

// Rotating or walking at the end of a finished replay just continues.
app.play(1);
for (let i = 0; i < 4000 && S.play; i++) h.tick(50);
assert.equal(app.uiMode(), 'complete');
app.spin(1);
assert.equal(S.confirm, null, 'no question at the end of the route');
assert.equal(app.uiMode(), 'walk');
assert.equal(S.trail.length - 1, end, 'continuing from the end keeps every point');
app.spin(-1); settle(60);   // turn back so the route is unchanged for the next checks

// Confirming a branch from the middle replaces only the later part.
app.setCursor(1);
app.tap({ x: 450, y: 525 });
assert(S.confirm, 'mid-route tap asks');
app.confirmYes(); settle();
assert.equal(app.uiMode(), 'walk');
assert(S.trail.length - 1 < end + 1 && JSON.stringify(S.trail[1]) === JSON.stringify(JSON.parse(full)[1]),
  'walking from here keeps the route up to the playhead');
const branched = route();

// Start over is undoable and keeps markers.
for (const [id, v] of [['markerShape', 'star'], ['markerColor', '#ff5b7a'], ['markerLabel', '']]) h.document.getElementById(id).value = v;
app.addMarker({ x: 100, y: 100 });
const markers = S.markers.length;
app.doReset();
assert.equal(S.trail.length, 0, 'Start over clears the route');
assert.equal(S.markers.length, markers, 'Start over keeps markers');
h.listeners['actionToastBtn:click']();
assert.equal(route(), branched, 'the toast Undo restores the route exactly');
assert.equal(app.uiMode(), 'walk');

// Switching card asks only when there is a route to lose.
let switched = 0;
app.guardRoute('Switch card', () => switched++);
assert.equal(switched, 0, 'switching card with a route asks first');
assert.equal(S.confirm.kind, 'card');
app.confirmYes();
assert.equal(switched, 1);

// Marker placement is its own mode.
app.setMarkerMode(true);
assert.equal(app.uiMode(), 'place');
app.setMarkerMode(false);
assert.equal(app.uiMode(), 'walk');
console.log('PASS: walk/playing/paused/complete/place modes, undo stays walking, tap pauses, reverse-complete tap keeps the route, branch asks, Done keeps the route, Start over undo, card switch asks');
