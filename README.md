# One Card Maze Helper · Infinite Walker

**[Play online at onecardmaze-tools.github.io](https://onecardmaze-tools.github.io/)**

A free, open-source **One Card Maze / OneCardMaze helper**. Upload the front and
back of a maze card, explore both faces, and review your route with readable
forward and reverse playback. No account, build step, backend, or dependencies.

This is an unofficial companion. It supports **free walking**: walls, doors,
SPIN locations, and victory conditions are not detected or enforced. In the
physical game a door unlocks when its arrow points up; this app never claims a
route is a verified solution.

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
The route and door notes last for the current page session; reloading clears them.

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

To explain a relevant door after a spin, pause at that spin with the event menu,
choose **Mark door**, then click the next door on the map. This adds a manual note
without moving the walker. During that turn's settling stage the marked door is
highlighted with **check ↑**. The app does not infer whether the pictured arrow is
actually up or whether the door is passable.

Completion explicitly says **Replay complete** and whether it reached the recorded
start or end. It preserves the full route and offers **Replay again**; it does not
claim a win.

### Recording versus preview

Playing, reversing, seeking, pausing, and event jumps **do not change recorded
points or turns**. Only explicitly walking or spinning from an earlier position
branches the route and replaces its future. A fractional seek preserves its exact
position as the new branch endpoint. The existing history limit is 4,000 points;
when exceeded, the oldest 1,000 leave the seekable window, while their baked marks
remain on the card until a route rebuild or reset.

## Run locally

Open `index.html` directly, keeping `replay-core.js` alongside it, or run:

```sh
python3 -m http.server 8000
# Open http://localhost:8000
```

Append `?demo` to load the rules card automatically (requires Internet access).

## Development and checks

- `index.html`: controls, WebGL artwork/reference trail, Canvas2D review layer,
  event state machine, camera, local image storage.
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
order, endpoint spins, pause/resume, immutable seeking, stable spin pivots, and
branching from a fractional preview.

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
