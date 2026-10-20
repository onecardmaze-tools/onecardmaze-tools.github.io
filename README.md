# One Card Maze Helper · Unofficial

**[Play online at onecardmaze-tools.github.io](https://onecardmaze-tools.github.io/)**

A free, open-source **One Card Maze / OneCardMaze helper**. Upload the front and
back of a maze card, explore both faces, and review your route with readable
forward and reverse playback. No account, build step, backend, or dependencies.

This is an unofficial **free-walking tool**. Move, rotate, draw, and annotate
however you like. The tool imposes no routes, required start/end points, wall
collisions, or game rules.

## Walk and plan

1. The page opens into the original, user-supplied practice maze, with a personal introduction over it. Its two 1061 × 1483 PNG faces are bundled unchanged in `assets/demo/`. The walker starts at the printed START ring. Follow the light path, match the edge letters and rotate at the spin signs; the tool records the route but does not enforce maze rules. The practice card starts at a closer scale on phones; uploaded cards retain their existing fit. Close the introduction to play, or choose **Import my card** to use your own images. The official free-demo link remains available below the game.
2. Click/tap a location to walk there. **Q / E** or the large **Rotate left / Rotate right** buttons turn the card in 90° steps. WASD and arrow-key movement are intentionally disabled.
3. Drag to pan and wheel/pinch to zoom. **Tools → Fit card** reframes the card; **Tools** also holds markers, recording import/export, trail visibility and reset.
4. Once you have walked, the compact transport provides undo, reverse replay, forward replay, a timeline and speed. Event jumps live under **Tools → Replay events**.
5. **About** reopens the personal introduction, unofficial attribution and links to the official game, demo and store.

The interface is English, bright and deliberately quiet, with a light doodle feel. Its pale background takes a low-saturation hue from both card images, sampled only when the card changes. Neutral or conflicting palettes use neutral paper. No official game artwork is bundled or fetched by the practice demo.

The current card and its **eight neighbours** remain visible. Crossing any edge
shows the opposite face. Crossing a horizontal edge also turns the sheet through
180°; diagonal copies show the same face turned through 180°. These are repeated
views of **one two-sided card**, not nine independent maps. Route marks use the
same folding transform as the artwork on every copy. A fine muted outline locates
the current card without hiding the neighbouring connections. The current face
stays fully lit; the four side neighbours are faded toward the pale background to 38% and the diagonal
copies to 24%. Approaching a shared edge gradually reveals the corresponding
side neighbour (up to 78%); corners brighten more quietly (up to 54%). These
changes ease in and out, including when focus passes to the next card. Markers
retain their high-contrast appearance on every copy.

Uploaded images are saved only in your browser's IndexedDB and are never uploaded.
The route lasts for the current page session. Markers are saved locally alongside
your uploaded card and restored on reload. Loading a different card clears its
on-screen markers; loading the demo does not overwrite the saved uploaded card
and its markers. Demo markers last for the current session.

## Export, import and share a recording

Open **Tools → Save / load recording → Export recording** to download one `.ocm.json` file containing
both faces as lossless PNGs of the active card, the complete route, spin events,
markers, playhead, zoom and camera. The back face uses the same dimensions as the
front, as displayed in the app. No remote artwork URL is needed to restore it.
Exporting during review preserves the entire future route. Animation/movement
pauses when a file is imported; replay or continue walking from that playhead.
Import is available from the initial image loader as well as **Save / load recording**.

Import replaces the current on-screen session, so export it first to keep it.
Imported sessions last until reload and do not overwrite the previous IndexedDB
card or its markers. Save changes with another export. Files are local downloads;
sharing one also shares the embedded card images and optional diagnostic summary.
Nothing is automatically uploaded or committed to this public repository.

Performance sampling is no longer exposed in the player UI. Development benchmarks and renderer checks remain in `tests/` and `benchmarks/`.

## Review a route

After walking, the transport bar provides:

| Control | Behaviour |
| --- | --- |
| **Replay / Space** | Review in recording order; press again to pause |
| **Reverse / Shift+Space** | Review from end to start; press again to pause |
| **Speed** | Cycle 0.1×, 0.2×, 0.5×, 1×, 2×, 4× (default 0.2×) |
| **Timeline** | Preview any recorded position without changing the route |
| **Tools → Replay events → Previous / Next** | Jump to the previous/next flip or spin in recording order |
| **Tools → Replay events** | Jump directly to a numbered event |
| **Undo / Z** | Step back; hold to rewind |
| **Play again** | Restart the selected direction after playback completes |

The game stays visible during replay; there is no explanatory overlay. A short completion message appears at the end. The timeline always represents position in the original recording.

### Three route layers

- **Faint full route:** a stable reference, kept visible throughout both directions.
- **Coloured progress:** the portion reviewed from the start (forward) or end
  (reverse), projected onto the two faces. Overlapping visits are traced from the
  recorded segments, not guessed from a first-touch pixel mask.
- **White current segment:** the most recent short part of this visit, with a dark
  casing for contrast. It appears only at the actual walker location, making it
  distinct from the repeated neighbouring copies.

Trail **arrow stamps record which way was up at that visit**. They have a
visible shaft and head, a dark circular backing, and the visit's trace colour.
They turn with the card: an arrow pointing to screen-up means the visit used
the current card orientation. They do not indicate walking direction. Several
arrowheads in one stamp represent overlapping historical orientations.

Stamps are attached at fixed distances from the beginning of each orientation
run, in card coordinates. Extending the route only appends new stamps; it never
redistributes existing ones. Zoom changes neither their map position nor their
spacing on the card. New nearby candidates yield to earlier stamps, and player
markers remain drawn above them. Short unfinished steps wait until they reach
the first fixed stamp distance instead of displaying a moving midpoint.

Small **open chevrons ›** on the line indicate the original walking direction,
independently of the round historical-up stamps. Opposing tips record travel in
both directions. They remain fixed to the card and do not animate during review.


The renderer retains exact polylines, splits them at mathematically exact sheet
boundaries, and stitches physical sheet symmetries into complete paths. Canvas2D
supplies native round joins and caps. Every dark casing is drawn before any
coloured stroke; there is no hollow-channel eraser, incremental raster atlas, or
render-only route sampling. Screen-pixel widths keep traces restrained at high
zoom. See [the design and research notes](TRACE-DESIGN.md).

### Flip and spin events

Movement speed is based on **distance**, rather than sample count. Increasing
walking speed never skips a rule event. Each event stops the walker and separates
arrival, transition, and settling:

| Event | Arrival | Transition | Settle |
| --- | --- | --- | --- |
| Spin | 0.35 s | 0.70 s | 0.35 s |
| Flip | 0.26 s | 1.35 s | 0.35 s |

These reading intervals stay independent of the walking-speed setting. A spin
turns around the **current card centre**. That centre stays fixed on screen
through arrival, rotation, and settling; there is no second recenter move after
the turn. The walker follows its position on the rotating card. Manual turns
also use the card centre, including in a panned view. A flip marks the connected
exit and entry with paired numbered rings. Its camera translation uses a
1.35-second curve with zero velocity at either end, then holds still before
walking resumes. Pausing also freezes the camera transition.
A corner crossing is labelled **Double fold · same face**, not a face swap.

In reverse, spins play in the opposite direction and flip labels swap their
source and destination. Turns without intervening walking collapse to the shortest
net turn. Reduced-motion preferences remove the animated spin while retaining the
arrival and settling time.

## Free-form markers

Open **Tools → Markers**, choose a **circle, diamond, square, triangle, or star**, pick any
colour, optionally enter a label, then click **Place marker** and click the map.
You can place a marker before or after starting a walk, or while reviewing.

A marker belongs to the physical face you clicked. It appears on **every copy of
that face**, using the same folding coordinates as the artwork. It stays obvious
with a dark/white outline and a constant screen size when zooming, rotating,
panning, or replaying. It is never assigned start/end/door semantics and never
controls where the walker can go. Place as many as you need.

Select a marker in the panel list to edit its shape, colour, or label everywhere
at once, or remove it with **×**. **Reset** clears only the walk, preserving
markers. Markers are stored only in your browser with the uploaded images.

Completion explicitly says **Replay complete** and whether it reached the recorded
start or end. It preserves the full route and offers **Play again**; it does not
assign game outcomes.

### Recording versus preview

Playing, reversing, seeking, pausing, and event jumps **do not change recorded
points or turns**. Only explicitly walking or spinning from an earlier position
branches the route and replaces its future. A fractional seek preserves its exact
position as the new branch endpoint.

### Compact route storage

The animation does not need to be the saved recording. A straight movement now
keeps its **start and end**, extending the current endpoint in place while the
walker moves. New clicks, turns, reversals, orientation changes, and rotations
preserve the vertices needed to reconstruct the actual route. Hundreds of
animation frames along one straight leg therefore do not become hundreds of
stored points.

Playback positions and temporary drawing samples are interpolated from those
vertices. The timeline, playback speed, and rewind use **physical distance**, so
long and short legs behave consistently. Fold events are derived from exact
boundary intersections, including when a compact leg crosses several edges.
The coloured review progress also interpolates within a leg, rather than waiting
for its endpoint.

The obsolete per-pixel time-index canvas/GPU texture has been removed. The former
4,000-sample rolling history cap is no longer needed; the compact route retains
all commands in the current session. No route points are uploaded or written to
disk/browser storage by the application.

### Map borders

Shared card edges have a narrow black border drawn in **screen pixels**. They do
not rely on black borders being present in an uploaded scan (for example the
Beach card has none). Their visible width remains stable across image resolutions
and zoom levels. They are visual guides only; the route crosses them freely.

## Run locally

Open `index.html` directly, keeping `replay-core.js` alongside it, or run:

```sh
python3 -m http.server 8000
# Open http://localhost:8000
```

Append `?demo` to open the original practice card directly without the introduction. The bundled demo never requests official artwork. After the site and both local PNG assets are available, the demo needs no external image service.

## Development and checks

- `companion.css` and `companion-ui.js`: bright UI, introduction, accessible imports and quiet menus.
- `index.html`: controls, card-quad WebGL artwork, event state machine, camera,
  free-form markers and local image/marker storage.
- `gpu-renderer.js`: retained GPU paths with analytic antialiasing, small glyph
  textures, bounded caches, context restoration and Canvas2D fallback.
- `replay-core.js`: dependency-free timeline geometry, exact seam intersections,
  fold mapping, distance interpolation, and spin events; also usable in Node.
- `tests/replay.test.js`: geometry and actual application state-machine regression
  tests with inert DOM/graphics adapters. These do not substitute for browser
  rendering checks.

```sh
node tests/replay.test.js
node tests/trace.test.js
node tests/performance.test.js
```

Coverage includes negative tiles, diagonal crossings, touching an edge without
crossing it, repeated corridors, sampling-independent pace, forward/reverse event
order, endpoint spins, pause/resume, immutable seeking, stable card-centre rotation, slow camera transitions, focus hierarchy,
branching from a fractional preview, compact endpoint recording, command/turn
preservation, and marker projection across every rotated/folded copy.

## Rendering and energy

The app sleeps when settled, suspends in the background, reuses unchanged artwork
and retained GPU route geometry, and rebuilds only the changing progress geometry
during ordinary replay. Analytic edge coverage preserves antialiasing without
full-screen MSAA. Controls remain immediate; the animated HUD refreshes at 10 Hz. There are
no third-party runtime dependencies. See [measurements, memory tradeoffs and
remaining limits](PERFORMANCE.md), including browser and native-Canvas benchmarks.


## Deployment

GitHub Pages publishes the root of `main` in
[`onecardmaze-tools/onecardmaze-tools.github.io`](https://github.com/onecardmaze-tools/onecardmaze-tools.github.io).
Push to `main` to update the site. No custom domain is configured. The previous
personal-account helper site's Pages deployment is disabled; the personal blog is
independent and is not modified by this project.

## License and attribution

Application code is available under the [MIT License](LICENSE).

One Card Maze is a game by Simon Filice and Andrew Dobson. This unofficial tool
ships no game artwork. Game names and third-party artwork belong to their owners;
the code license does not grant rights to them. The practice demo uses original supplied artwork,
not an official game maze. Get
real mazes, demos and purchases from [the creators](https://www.onecardmaze.com/).
