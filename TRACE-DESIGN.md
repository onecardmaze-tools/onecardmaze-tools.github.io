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
The historical-up arrows are a design decision for this app, not a claimed player consensus.
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
Widths are clamped in screen pixels. High-contrast arrow stamps have a shaft
and head on a dark round backing, with no numeric angle decoding. Their direction
is historical card-up in canonical sheet coordinates: inverse recorded rotation,
then the visible tile's half-turn and the current camera rotation. Thus an arrow
points to screen-up exactly when the current card orientation matches that visit.
It rotates with the physical sheet rather than behaving like a travel arrow.
Overlapping visits can add arrowheads in other directions to the same backing.

Anchors begin at 18% of a fixed card-relative interval from each orientation run's
start, then repeat by that interval. They are never redistributed by total route
length, viewport size or zoom. Chronological suppression in canonical coordinates
lets old stamps keep priority over new nearby candidates. There is no dynamic
screen-space packing or player-based hiding. Player markers and the walker render
above stamps. Short unfinished runs wait for the first fixed threshold; a moving
midpoint would recreate the distracting behaviour this replaces.

At an exact crossing the upper ink can obscure lower ink locally; orientation
stamps along each run retain its meaning. No false lane offsets or interpolated
curves change the path a player actually took.

## Original travel direction

Unboxed white chevrons follow the recorded segment tangent. The circular coloured
arrow stamps continue to encode historical card-up. Both use canonical physical
card coordinates, transform through the visible tile row and camera rotation,
and remain fixed as the route extends. Collinear reverse visits may add an
opposing tip; nearby parallel routes are not treated as the same corridor.
Small direction marks yield to the larger orientation stamps. Reversing replay
does not reverse these historical travel cues.

The source of truth remains retained vectors. Screen-space caches are disposable
and rebuilt after view/geometry changes; no destructive raster eraser or painted
segment repair has returned. [Performance notes](PERFORMANCE.md) describe the
static-history layer, retained geometric prefix, sprite cache and tests.

## Validation

- `node tests/replay.test.js`: existing movement/replay/marker/camera regressions.
- `node tests/trace.test.js`: projection, stitching, multi-edge diagonals,
  negative tiles, compact/dense anchor equivalence, append-only stamp positions, historical-up
  direction on every tile parity, multiple orientation states,
  round strokes and outline-before-colour ordering.
- Optional native raster check: `CANVAS_MODULE=/path/to/@napi-rs/canvas node tests/trace-raster.test.js`.
  Checks actual centreline alpha and colour at 3 zoom levels × 4 rotations,
  across seams, hairpins and crossings. It writes a diagnostic PNG to `/tmp`.
- Browser checks use the user's Beach images locally, including manual rotation,
  walking, replay, zoom and phone layout. These image files are not published.
