# Rendering and energy exploration — 2026-10-18

This pass adds original-travel chevrons without replacing the accepted historical-up
arrow stamps. It also removes repeated work from the interactive rendering path.
No third-party runtime, continuous direction animation, resolution reduction or
application frame-rate cap was added.

## What changed

- A settled page has **no pending app requestAnimationFrame**. Input and state
  changes wake the scheduler; motion, camera transitions and fades keep it awake
  only until they finish. Visibility/page lifecycle events suspend it and reset
  the time origin, preserving replay position on return.
- Artwork and player/destination marks are separate. A background whose camera,
  rotation, zoom, brightness, neighbours and image are unchanged is reused.
  The shader selects the physical tile under each pixel and stops after finding it.
- Static full-route ink and the completed replay prefix/suffix occupy their own
  Canvas2D layer. The moving partial leg and current white visit remain exact
  vectors in the live layer. Advancing inside one compact leg does not repaint
  the static history or rebuild the whole progress path.
- Walking retains the completed geometric prefix; only the moving endpoint's leg
  is recompiled/reprojected. Branching/resetting explicitly invalidates it.
- Orientation-state lookup happens when geometry changes, not once per stamp,
  per copy, per frame. A spatial grid preserves chronological stamp placement
  while avoiding all-pairs proximity searches. Small arrow sprites are cached;
  travel chevrons are batched per visible tile.
- HUD work during animation is limited to 10 Hz, with immediate transport updates
  for explicit controls. Unchanged event menus and status text are retained.
- The WebGL context requests `low-power` as a browser hint. Decorative backdrop
  blurs were replaced with clearer, more opaque panels, removing another source
  of work over a moving scene.

These choices follow the general guidance on [layering and pre-rendering Canvas2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas),
[WebGL batching and avoiding unnecessary work](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),
and the [one-shot nature of requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

## Browser comparison

Baseline: commit `e8287b4` (the accepted fixed-arrow version). Same local desktop
in-app browser, a 1200×900 app viewport at devicePixelRatio 2, synthetic 750×1050
artwork, 1,000 deterministic vertices, 20 warmup frames and 60 measured frames.
The upload overlay is closed. The fixture intentionally draws many long crossing
lines over the same card, making it much denser than a short ordinary walk.
Only one benchmark runs at a time. Values are observations from one local run,
not a device-independent performance guarantee.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median synchronous `render()` time | 14.1 ms | 1.2 ms |
| P95 synchronous `render()` time | 17.2 ms | 1.8 ms |
| Median actual frame interval | 166.4 ms | 33.4 ms |
| P95 actual frame interval | 182.9 ms | 49.3 ms |

The empty animation-frame control in this environment measured a median **16.7 ms**
and P95 **18.3 ms**. The dense workload therefore improved substantially, but it
still does not reach the empty-control cadence. Synchronous JavaScript timing
alone would overstate success: rasterisation, compositing and browser scheduling
remain part of the observed frame interval. There was no calibrated GPU trace,
so their individual contributions cannot be separated here.

Raw observations: [before](benchmarks/browser-before.json),
[after](benchmarks/browser-after.json), [empty control](benchmarks/browser-control.json).

To reproduce, serve this repository over localhost and open
[`tests/browser-benchmark.html`](tests/browser-benchmark.html). Use the same
benchmark file against the baseline checkout. It uses synthetic artwork, touches
no saved user images, and does not start automatically.

## Deterministic and native-Canvas checks

The app harness uses production code with a deterministic RAF queue and counted
WebGL calls. These checks establish work avoided, rather than battery watts:

| Controlled check | Before | After |
| --- | ---: | ---: |
| App RAF callbacks in two settled seconds at 60 Hz | 120 | 0 |
| Artwork submissions for 35 forced overlay-only renders | 35 | 0 |
| Idle WebGL artwork submissions | 0 | 0 |

The optional native Canvas2D benchmark uses the same deterministic routes at
100 and 1,000 vertices. Its WebGL adapter counts submissions and performs no GPU
work, so its numbers are **not browser FPS**. Raw runs are retained in
[before](benchmarks/native-before.json) and [after](benchmarks/native-after.json).

Commands:

```sh
node tests/trace.test.js
node tests/replay.test.js
node tests/performance.test.js
# Optional, with @napi-rs/canvas available in the local environment:
CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/performance-bench.js
CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/trace-raster.test.js
```

The regression suite covers scheduler sleep/wakeup, hidden-page suspension without
fast-forwarding, artwork reuse, static-history reuse, exact partial progress in
both replay directions, unchanged camera/marker behaviour, append-stable direction
marks, row/rotation transforms, and real-raster continuity across seams and bends.

## Costs, limits and next measurements

The extra static-history canvas trades memory for less repeat rendering. Its RGBA
pixels alone are about **5.0 MiB at 390×844 and DPR 2**, or **16.5 MiB at 1200×900
and DPR 2**. Browser/GPU bookkeeping or buffering can add to that. Small cached
arrow sprites require less than 0.25 MiB for all fifteen orientation combinations
at DPR 2. Old-DPR sprites are released on a DPR change.

Large route edits, crossing to another compact leg, zooming, folds and spins can
still invalidate the cached history. This pass does not claim every possible
long route will maintain 60 FPS, or that a desktop viewport emulation measures a
phone's battery usage. Chrome DevTools tracing was unavailable in this session;
Core Web Vitals, device power draw and thermal behaviour were not measured.

A useful next experiment is a fixed ten-minute workload on the user's actual
phone/browser: a normal route plus a dense saved fixture, with the same brightness,
zoom and playback speed before/after. Record frame pacing, temperature and battery
or power instrumentation. That evidence should decide whether an optional battery
mode (lower artwork resolution or refresh cadence), off-thread preparation, or
more expensive transition caching is worthwhile. Defaulting to lower fidelity
without that evidence would make the tradeoff hard to assess.
