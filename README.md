# One Card Maze Helper · Unofficial

**[Play online at onecardmaze-tools.github.io](https://onecardmaze-tools.github.io/)**

A free, open-source **One Card Maze / OneCardMaze helper**. Upload the front and
back of a maze card, explore both faces, and review your route with readable
forward and reverse playback. No account, build step, backend, or dependencies.

This is an unofficial **free-walking tool**. Move, rotate, draw, and annotate
however you like. The tool imposes no routes, required start/end points, wall
collisions, or game rules.

## Walk and plan

1. The page opens into the original, user-supplied practice maze, with a personal introduction over it. Its two 1061 × 1483 PNG faces are bundled unchanged in `assets/demo/`. Tap the card’s start to place your walker and begin recording; loading a card does not choose a starting point. Follow the light path, match the edge letters and rotate at the spin signs; the tool records the route but does not enforce maze rules. The practice card starts at a closer scale on phones; uploaded cards retain their existing fit. Close the introduction to play, or choose **Import my card** to use your own images. The official free-demo link remains available below the game.
2. Click/tap a location to walk there. **Q / E** or the large **Rotate left / Rotate right** buttons turn the card in 90° steps. WASD and arrow-key movement are intentionally disabled.
3. Drag to pan and wheel/pinch to zoom around your pointer or fingers. Walking preserves your view across card edges and scrolls only as the walker approaches the usable screen edge. After browsing, following resumes when the walker enters the middle of your view. Use **Back to my position** to locate the walker or **Fit** to frame the current card. **Map** (top right) holds position, markers, zoom / **Fit**, and trail visibility. The current card name / **Cards** (top left) opens your collection, imports and current-card options. Desktop also exposes position, fit and marker shortcuts beside the map.
4. While walking, one dock shows **Rotate left · Undo · Replay · Rotate right**. On short landscape screens the rotate buttons move to rails at the sides. Replaying swaps the dock for a transport (**Back to walking · Reverse · Play/Pause · timeline · Speed**, plus step inspection and **Continue from here**); see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for every mode.
5. The small **unofficial helper** link below the card name reopens the personal introduction, unofficial attribution and links to the official game, demo and store.

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
Import both faces, optionally name the card, then choose **Save and start** to
add it to your collection. Importing another card keeps the previous cards.
For a batch, choose **Import multiple cards**, then select or drop all images at
once (for example, 40 images for 20 cards). Name each pair `01-Forest_front.png`
and `01-Forest_back.png`: the shared prefix becomes the card name, and face
suffixes ignore case. Review the paired thumbnails, then choose **Import N cards**.
Missing faces, ambiguous names and unreadable images are listed separately and
skipped. Fix those files outside the app and choose them again. Exact image pairs
are skipped on repeat imports; same-name cards with different images are kept
separately. Batch import adds to Saved cards without switching your current card
or clearing its route. A persistent result reports any storage failures; retrying
skips cards already saved. New batch cards sort naturally by name.
Number-first names such as `01-Forest` keep numbered cards in order. Older names
continue to work. In **Saved cards**, type any part of a name into **Search cards**
to filter instantly (case-insensitive); clear the field to show all cards.
On your next visit, **Saved cards** opens with names and thumbnails so you can
choose which card to play. You can also open it from the **Cards** chip.
Each card keeps its own route, markers and completion mark. The previous single-card cache migrates
automatically as **Saved card**. **Delete** removes one card and its saved progress
after confirmation; clearing site data removes the collection.

A toast confirms saving; if browser storage is unavailable or full, you can
still play and a message explains that the card could not be saved. Routes on saved cards and the practice card persist across visits. Switching
cards resumes the saved route and only asks before discarding work if it could
not be saved. Practice cards and imported recordings do
not overwrite the collection or its markers.

## Export, import and share a recording

Open **Cards → Current card options → Back up or restore… → Export backup** to download one `.ocm.json` file containing
both faces as lossless PNGs of the active card, the complete route, spin events,
markers, playhead, zoom and camera. The back face uses the same dimensions as the
front, as displayed in the app. No remote artwork URL is needed to restore it.
Exporting during review preserves the entire future route. Animation/movement
pauses when a file is imported; replay or continue walking from that playhead.
Use **Restore backup** in the same panel to open a recording; image uploads remain in **Cards → Add cards**.

Import replaces the current on-screen session, so export it first to keep it.
Imported sessions last until reload and do not overwrite the previous IndexedDB
card or its markers. Save changes with another export. Files are local downloads;
sharing one also shares the embedded card images and optional diagnostic summary.
Nothing is automatically uploaded or committed to this public repository.

Performance sampling is no longer exposed in the player UI. Development benchmarks and renderer checks remain in `tests/` and `benchmarks/`.

## Review a route

Press **Replay** (or Space) to review. The dock becomes a transport:

| Control | Behaviour |
| --- | --- |
| **Replay / Space** | Start reviewing from the beginning, in recording order |
| **Play · Pause / Space** | Play forward; press again to pause |
| **Reverse / Shift+Space** | Review from end to start; press again to pause |
| **Speed** | Cycle 0.25×, 0.5×, 1×, 2×, 4× (default 1×) |
| **Timeline** | Preview any recorded position without changing the route. Amber shows progress; ticks mark spins and flips |
| **Back to walking / Esc** | Go back to walking at the end of the route, unchanged |
| **Previous step / Next step** | Inspect adjacent recorded vertices while paused |
| **Continue from here** | Explicitly branch from the inspected position; asks before replacing later history |
| **Undo / Z** (while walking) | Undo exactly one movement or rotation, including an unfinished movement. Checkpoints persist with progress and backups; legacy recordings fall back to recorded vertices |

The game stays visible during replay; there is no explanatory overlay. When a replay finishes, a short message says whether it reached the start or the end, and the timeline and transport remain available for further inspection or another replay. Tapping the map during a replay pauses it. The timeline always represents position in the original recording.

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

Open **Map → Add marker**, then tap the location to leave a marker with the current style. Use **Change style** during placement, or **Map → Edit markers…**, to choose a circle, diamond, square, triangle or star, a colour and an optional label. Desktop has a direct Add marker shortcut.
You can place a marker before or after starting a walk, or while reviewing.

A marker belongs to the physical face you clicked. It appears on **every copy of
that face**, using the same folding coordinates as the artwork. It stays obvious
with a dark/white outline and a constant screen size when zooming, rotating,
panning, or replaying. It is never assigned start/end/door semantics and never
controls where the walker can go. Place as many as you need.

Select a marker in the panel list to edit its shape, colour, or label everywhere
at once, or remove it with **×**. **Start over** clears only the walk, preserving
markers, and offers **Undo** for 8 seconds. Markers are stored only in your browser with the uploaded images.

Completion explicitly says **Replay complete** and whether it reached the recorded
start or end. It preserves the full route and leaves the timeline available; it does not
assign game outcomes.

### Recording versus preview

Playing, reversing, seeking, pausing and inspection steps **do not change recorded
points or turns**. Map taps pause a running replay and do nothing during paused
or completed review. Rotating is unavailable during review. **Continue from here**
is the explicit branch entry; before replacing future history it asks **Walk from
here?**. **Back to walking** returns to the route end unchanged. A fractional
branch preserves its interpolated endpoint. Undo is separate: one press restores
the previous movement or rotation immediately, with no held-key rewind.

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
all commands in the current session. Route points are stored locally per card; nothing is uploaded.

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

- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md): principles, modes, layout budgets, tokens,
  components, copy rules and the design process for any UI change. Reference
  screens are in `docs/design/`.
- `card-library.js`: local multi-card storage, per-card markers and legacy cache migration.
- `companion.css` and `companion-ui.js`: tokens and components, introduction,
  accessible imports, Tools and the other sheets.
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
node tests/ui-mode.test.js     # modes and route safety
node tests/ui-states.cjs       # browser QA at six viewports (needs Playwright)
node tests/card-cache.cjs      # image cache and storage failures (needs Playwright)
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
the code license does not grant rights to them. The bundled Patrick Hand font
(`assets/fonts/`) is by Patrick Wagesreiter under the SIL Open Font License 1.1. The practice demo uses original supplied artwork,
not an official game maze. Get
real mazes, demos and purchases from [the creators](https://www.onecardmaze.com/).

### Local progress and completion

Routes auto-save in this browser for each saved card and the practice card.
Switch cards or reload, then select a card to resume its route, including recorded
turns and its review position. Cards → current-card options → **Mark as completed** adds a reversible
completion mark. Saved cards shows **Completed**, **Continue route**, or **Not started**.
Completion is your own annotation; replaying or clearing a route does not change it.

Progress stays on this device and browser. Clearing site data removes it. Use
**Save or load recording…** for a portable backup; imported recording files remain
separate from saved cards. If browser storage is full or blocked, an error explains
how to keep your route. Deleting a card also deletes its route and completion mark.
