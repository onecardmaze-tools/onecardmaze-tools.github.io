# One Card Maze Helper · Infinite Walker

**[Play online at onecardmaze-tools.github.io](https://onecardmaze-tools.github.io/)**

A free, open-source **One Card Maze / OneCardMaze helper**. Upload the front and
back of a maze card, explore both faces, and review your route with readable
forward and reverse playback. No account, build step, backend, or dependencies.

This is an unofficial **free-walking tool**. Move, rotate, draw, and annotate
however you like. The tool imposes no routes, required start/end points, wall
collisions, or game rules.

## Walk and plan

1. Open **Images** and upload the two faces, or choose **Load demo card** to fetch
   the official online rules card from its original source.
2. Choose **Start walking**. Click/tap a location to walk there, or use WASD / arrows.
3. **Q / E**, or **⟲ / ⟳**, rotate the map in 90° steps.
4. Drag to pan, wheel/pinch or **+ / −** to zoom, and **Fit** to reframe.
5. **Trail / T** toggles the route. **Reset / R** clears it and lets you pick a start.

The current card and its **eight neighbours** remain visible. Crossing any edge
shows the opposite face. Crossing a horizontal edge also turns the sheet through
180°; diagonal copies show the same face turned through 180°. These are repeated
views of **one two-sided card**, not nine independent maps. Route marks use the
same folding transform as the artwork on every copy. A fine teal outline locates
the current card without hiding the neighbouring connections.

Uploaded images are saved only in your browser's IndexedDB and are never uploaded.
The route lasts for the current page session. Markers are saved locally alongside
your uploaded card and restored on reload. Loading a different card clears its
on-screen markers; loading the demo does not overwrite the saved uploaded card
and its markers. Demo markers last for the current session.

## Review a route

After walking, the transport bar provides:

| Control | Behaviour |
| --- | --- |
| **Forward / Space** | Review in recording order; press again to pause |
| **Reverse / Shift+Space** | Review from end to start; press again to pause |
| **Speed** | Cycle 0.1×, 0.2×, 0.5×, 1×, 2×, 4× (default 0.2×) |
| **Timeline** | Preview any recorded position without changing the route |
| **\|‹ / ›\|** | Jump to the previous/next flip or spin in recording order |
| **Event menu** | Jump directly to a numbered event |
| **↶ / Z** | Step back; hold to rewind |
| **Replay again** | Restart the selected direction after playback completes |

The review panel states the direction, current event, card face, and up direction.
Its percentage means **distance reviewed in the chosen direction**; the transport
percentage always means **position in the original recording**. In reverse these
percentages therefore move in opposite directions.

### Three route layers

- **Faint full route:** a stable reference, kept visible throughout both directions.
- **Coloured progress:** the portion reviewed from the start (forward) or end
  (reverse), projected onto the two faces. Overlapping visits are traced from the
  recorded segments, not guessed from a first-touch pixel mask.
- **White current segment:** the most recent short part of this visit, with a dark
  casing for contrast. It appears only at the actual walker location, making it
  distinct from the repeated neighbouring copies.

Trail **colour records card-up direction when drawn**: gold ↑, blue →, red ↓,
violet ←. It does not encode the face, visit number, or replay progress. The
orientation legend is always available in the status bar.

### Flip and spin events

Movement speed is based on **distance**, rather than sample count. Increasing
walking speed never skips a rule event. Each event stops the walker and separates
arrival, transition, and settling:

| Event | Arrival | Transition | Settle |
| --- | --- | --- | --- |
| Spin | 0.35 s | 0.55 s | 0.45 s |
| Flip | 0.22 s | 0.45 s | 0.35 s |

These reading intervals stay independent of the walking-speed setting. A spin
keeps the walker at the same screen position while the map turns; the camera
reframes during settling before walking resumes. A flip marks the connected exit
and entry with paired numbered rings and moves the camera while walking is held.
A corner crossing is labelled **Double fold · same face**, not a face swap.

In reverse, spins play in the opposite direction and flip labels swap their
source and destination. Turns without intervening walking collapse to the shortest
net turn. Reduced-motion preferences remove the animated spin while retaining the
arrival and settling time.

## Free-form markers

Open **Markers**, choose a **circle, diamond, square, triangle, or star**, pick any
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
start or end. It preserves the full route and offers **Replay again**; it does not
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

Append `?demo` to load the rules card automatically (requires Internet access).

## Development and checks

- `index.html`: controls, WebGL artwork/reference trail, Canvas2D review layer,
  event state machine, camera, free-form markers, local image/marker storage.
- `replay-core.js`: dependency-free timeline geometry, exact seam intersections,
  fold mapping, distance interpolation, and spin events; also usable in Node.
- `tests/replay.test.js`: geometry and actual application state-machine regression
  tests with inert DOM/graphics adapters. These do not substitute for browser
  rendering checks.

```sh
node tests/replay.test.js
```

Coverage includes negative tiles, diagonal crossings, touching an edge without
crossing it, repeated corridors, sampling-independent pace, forward/reverse event
order, endpoint spins, pause/resume, immutable seeking, stable spin pivots,
branching from a fractional preview, compact endpoint recording, command/turn
preservation, and marker projection across every rotated/folded copy.

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
the code license does not grant rights to them. The optional demo loads the rules
card directly from its original online source.
