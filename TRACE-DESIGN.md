# Trace rendering and orientation readability

## Evidence and decision

There is no universal best renderer for every route problem. For this small,
editable two-face map, retained vector polylines are a better fit than a
progressively edited bitmap. MapLibre's [official route example](https://maplibre.org/maplibre-gl-js/docs/examples/geojson-line/)
uses whole LineStrings and round joins/caps. [deck.gl PathLayer](https://deck.gl/docs/api-reference/layers/path-layer)
also exposes complete paths, pixel widths and rounded joins/caps.
[Canvas2D](https://html.spec.whatwg.org/multipage/canvas.html#drawing-paths-to-the-canvas)
already supplies these stroke primitives; a new rendering dependency is unnecessary.

A [maze-player discussion](https://www.reddit.com/r/mazes/comments/ii8obt/)
describes transparent film and erasable pens. A [One Card Maze play report](https://www.whatboardgame.com/post/one-card-maze-card-game-preview)
mentions pencil traces that can be erased. Those support persistent, lightweight
ink as a useful convention, but do not establish a standard rotation notation.
The angle badges are a design decision for this app, not a claimed player consensus.
Colour is redundant with explicit text, following [W3C guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## Root causes removed

The old renderer painted individual sampled segments, then erased their centres.
An eraser could affect existing crossings, and end-cap/corner repairs depended on
sample timing. Live rendering and reconstruction used different sample sequences.
Its separate seam code could treat a diagonal crossing two different edges as a
single corner. The result was clipped ends, misaligned joins and raster artefacts.

The new renderer has one source: compact recorded vertices. ReplayCore cuts each
segment at exact grid intersections, including negative tiles and non-corner
diagonals. TraceRenderer projects the pieces using sheet translations and 180°
symmetries, joining consecutive pieces into a native path across internal seams.
Only the visible tile union is clipped. Complete dark outlines are painted first,
then colours. Nothing ever erases an earlier stroke. Live, reconstructed and replay
progress paths share the same compiler. Geometry remains exact; no smoothing curve
moves the recorded centreline.

## Reading historical orientation

Solid narrow ink makes the route legible without covering the maze with hollow
rails. A dark outline separates every colour from water, sand and printed arrows.
Widths are clamped in screen pixels. Upright dark badges say 0°, 90°, 180° or 270°;
they describe card-up when recorded, not walking direction or the current screen
rotation. Nearby overlapping visits contribute all their angles. Labels are
placed by arc length, independent of recorded sample density; screen-space
collision avoidance gives user markers and the current player precedence.
They summarise orientation along the route rather than labelling every point.
At an exact crossing the upper ink can obscure lower ink locally; orientation
labels along each run retain its meaning. No false lane offsets or interpolated
curves change the path a player actually took.

## Validation

- `node tests/replay.test.js`: existing movement/replay/marker/camera regressions.
- `node tests/trace.test.js`: projection, stitching, multi-edge diagonals,
  negative tiles, compact/dense label equivalence, multiple orientation states,
  round strokes and outline-before-colour ordering.
- Optional native raster check: `CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/trace-raster.test.js`.
  Checks actual centreline alpha and colour at 3 zoom levels × 4 rotations,
  across seams, hairpins and crossings. It writes a diagnostic PNG to `/tmp`.
- Browser checks use the user's Beach images locally, including manual rotation,
  walking, replay, zoom and phone layout. These image files are not published.
