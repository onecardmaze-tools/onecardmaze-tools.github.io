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


## 2026-10-19: Mac Chrome Q/E rotation correction

The previous pass missed rotating-view workloads: changing the artwork camera
key also invalidated the entire historical trace every animation frame. Spin
events additionally changed the geometry version even though no points changed.

Desktop now retains a world-space trace bitmap and places it with a CSS transform.
Camera rotation/panning no longer repaint that bitmap. Route geometry has its own
version, separate from the replay event timeline. Small coarse-pointer viewports
(<900 CSS pixels) retain the previous drawing path. Desktop WebGL uses the browser's
default power preference; small touch viewports retain the low-power hint. These
are hints, and actual GPU selection was not measured.

The cache is bounded at 16 million pixels (about 61 MiB of RGBA pixels, excluding
browser/GPU overhead), with the previous viewport renderer as fallback. At the
1200×800 test viewport, the retained surface was 2143×3000: about 24.5 MiB, versus
14.6 MiB for the old viewport bitmap. This trades extra desktop memory for fewer
repeated paints; no artwork resolution or animation cadence was reduced.

Actual Mac Chrome, a synthetic 100-vertex route, and a trusted Q key produced:

| Measurement | Before | After |
|---|---:|---:|
| Historical trace paints during one spin | 32 | 0 |
| Keydown event duration | 120 ms | 56 ms |
| Keyup event duration | 168 ms | 128 ms |
| Observed long tasks during test | 0 | 2 (worst 54 ms) |

Raw results: [before](benchmarks/chrome-turn-key-before.json),
[after](benchmarks/chrome-turn-key-after.json). These are individual Event Timing
entries, **not a formal INP comparison with the user's 656 ms screenshot**. Most
latency was presentation delay. Frame pacing varied across runs and occasional
long frames remain; this does not establish stable 60 FPS or phone battery savings.

The reproducible developer fixture is `tests/interaction-benchmark.html`; select
100 vertices, prepare the keyboard test, press Q in the focused app, and read final
stats after animation settles. It generates synthetic artwork without saving or
uploading user images. Automated checks cover first-key cache retention, matrix
alignment, bounded allocation/fallback, small touch viewports, replay and actual
raster continuity. Beach images were also checked locally in Chrome.

Background: [INP phases](https://web.dev/articles/optimize-inp),
[compositor-friendly animation and layer costs](https://web.dev/articles/animations-guide).


## Portable real-world workloads

`session-codec.js` defines a versioned, dependency-free `.ocm.json` format. Import
validates point/event/marker values and resource bounds, decodes both images
before replacing the current scene, and rebuilds derived trace/replay caches.
No uploaded session fixtures or artwork are included in the repository.

The optional 15-second sample uses [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
intervals and [long-task entries](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming).
It runs only after explicit activation and stops on completion, manual stop,
import or a hidden tab. The extra RAF loop itself affects idle power, so compare
active workloads with the same sampling configuration; do not infer battery use
from it. Long-task support is optional and exported as null when unavailable.
A sample belongs to the original device; importing does not relabel its results
as measurements of the new device. The original file retains its diagnostics.

This enables comparison using actual path geometry and artwork; it does not
recreate original input timing, pauses, thermal state, GPU selection or exact
presented frames. Those require an on-device trace or system-level measurement.


## 2026-10-19: actual 48-vertex recording / large Retina viewport

The supplied recording has 48 vertices, five spins, two markers and 750×1050
artwork. Its saved environment is 1504×1492 CSS pixels at DPR 2, zoom
0.888095238095238, `traceSurface: null`, and `measurement: null`. No original
frame-rate sample was supplied. The private images and route are not in Git.

At that zoom the 3×3 world trace surface needs 22,360,018 pixels at DPR 2.
The previous hard 16M-pixel eligibility gate therefore disabled retained ink at
this ordinary zoom. A production-path regression reproduced 59 ink repaints in
60 rotation poses (the first pose reused the unchanged angle); in Chrome's 60
measured changing poses it cleared history 60 times and painted paths 120 times.
The earlier 1200×800 scenario missed this gate, so its improvement did not extend
to the user's actual viewport.

The corrected gate budgets raster density instead: this case retains a
3380×4732 surface at ratio 1.691819, below 16M pixels. Only static ink and its
focus outline use this ratio. Artwork, orientation arrows, chevrons and markers
keep their existing full DPR. Pixels still map uniformly to world coordinates;
real-raster tests cover four rotations and the new ratio. Cache dimensions also
stay below 8192 per edge. Extreme zoom below one raster pixel per CSS pixel still
uses the viewport fallback, and small touch screens retain their prior path.
This does not increase the 16M maximum allocation. Compared with the formerly
used 3008×2984 fallback, it adds about 26.8 MiB of static RGBA pixels to avoid
repeated paints; browser/GPU overhead is additional.

Actual Chrome with the imported private artwork and route, an iframe matching the
saved 1504×1492 viewport, browser DPR 2.2 (app backing capped at 2), 10 warm-up
frames and 60 measured frames per quarter-turn workload:

| Metric | Before | After, first | After, repeat |
|---|---:|---:|---:|
| History clears | 60 | 0 | 0 |
| History paint calls | 120 | 0 | 0 |
| RAF interval median | 166.1 ms | 33.3 ms | 33.2 ms |
| RAF interval p95 | 199.3 ms | 167 ms | 83 ms |
| RAF interval maximum | 217.3 ms | 399.6 ms | 116.8 ms |

Raw [before](benchmarks/real-route-before.json),
[after first](benchmarks/real-route-after-first.json),
[after repeat](benchmarks/real-route-after-repeat.json). This is a reproducible
local workload, not the user's original frame-rate recording or confirmed
presented FPS. Large spikes remain; this does not demonstrate stable 60 FPS.

As a diagnostic ablation only, omitting WebGL artwork draws kept the before
median at 134.2 ms and the corrected-cache median at 33 ms. Raw
[before ablation](benchmarks/real-route-no-art-before.json),
[after ablation](benchmarks/real-route-no-art-after.json). This points to costs
beyond just the background shader; large Canvas2D/compositor surfaces are a next
investigation, not a measured GPU-power diagnosis. The production app continues
to render the artwork. No CPU/GPU wattage, driver selection or thermal readings
were collected. The next device sample should include continuous rotation/walk
and be paired with a Chrome performance trace when available.

Reproduce through `tests/recording-benchmark.html`: choose a local recording,
then Measure rotation. Its fixture restores artwork/route/view from the file,
uses the saved viewport dimensions and never uploads the recording. Exported
environment diagnostics now state world/viewport cache mode and raster ratio
explicitly instead of an unexplained null.
