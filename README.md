# One Card Maze Helper · Infinite Walker

A tiny, pure front-end web app for the card game **One Card Maze** (onecardmaze.com).
Upload the front and back of a maze card, drop a walker anywhere, and walk freely.
Rather than flipping the card, the card you are standing on is held in the **middle** of the
screen with all **eight** cards around it: **the other side** above, below, left and right, and
the **same side turned 180°** in the four corners (a diagonal step crosses two folds). The
two faces behave as one map, so you never have to "flip" it yourself; step over an edge and the
view slides the card you land on into the middle.

Everything is a single self-contained file. No build, no backend, no dependencies.

## Play online

**[Open One Card Maze Helper](https://blog.xuezhonghao.com/one-card-maze-helper/)** — no installation or account required.

An unofficial, open-source OneCardMaze / One Card Maze companion with path tracking,
card rotation, undo, and replay. Your uploaded images stay in your browser.

## License

The application source code is available under the [MIT License](LICENSE).
One Card Maze names and third-party game artwork belong to their respective owners;
the MIT license does not grant rights to that artwork. The optional demo loads artwork
from the original online source; no game artwork is included in this repository.

## Deployment

GitHub Pages serves the repository root on the `main` branch. Push changes to `main`
to update the live site automatically. No build step is needed.

## Run it

Just open `index.html` in a browser (double-click), or serve it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Deploy anywhere static (GitHub Pages, Netlify, an S3 bucket, …).

## Play

1. **Images** (top-left) opens the loader. Add the **Front** and **Back** images
   (click a box or drag a file onto it). `Load demo card` pulls a real One Card Maze
   card from the official online maze so you can try it immediately.
2. Hit **Start walking**, then **click / tap anywhere** to drop the walker.
3. Move with **WASD / arrow keys**, or **click a spot** and the walker walks there.
4. **Walk to an edge** — all eight cards around you are drawn, so you can see where every edge
   leads before you get there: **left, right, up and down** show **the other side**, and the four
   **corners** show the **same side turned 180°**. Keep walking past the edge and you are simply
   on the other face: the view animates the card you step onto into the middle of the screen,
   and the one you left slides out to become the neighbour behind you.

5. **Rotate the card** — `Q` / `E` (or the `⟲` / `⟳` buttons) spin the whole map 90°
   at a time, like the game's SPIN icon, so a door's arrow can point **up**. The status
   bar's **Up** readout shows which way the card's own top points.

6. **Undo, replay it, or scrub it** — once you have walked a little, the **transport bar**
   appears at the bottom. `↶` steps back (hold it, or hold `Z`, to wind back smoothly),
   `◀` / `▶` (or `Shift`+`Space` / `Space`) replay your whole walk backwards and forwards,
   the **speed button** cycles how fast that playback runs — `0.1×` / `0.2×` / `0.5×` / `1×` /
   `2×` / `4×`, starting slow at **0.2×** — and the **slider**
   scrubs anywhere along it. The replay **plays your turns back as well** — the card spins
   exactly where you spun it, and several spins with no walking in between collapse into one
   (three turns to the left replay as a single turn to the right). Rewinding is a *preview*
   — the trace hides itself up to the playhead and the marker walks back along your own
   route — and the moment you **walk again**, the part you wound past is dropped and the
   trace is redrawn to match.

Other controls: `Trail` / `T` (breadcrumb path), `Reset` / `R` (pick a new start),
`Rotate` / `Q` `E`, undo / replay `Z` `Space` `Shift`+`Space` (speed on the transport bar),
zoom via wheel / pinch / `+` `−` / `Fit`, pan by dragging, `H` for help.

Your images are stored locally in the browser (IndexedDB) and are never uploaded.

## How the "other side" map works

### How it's drawn

The whole scene is **one full-screen WebGL fragment shader** (WebGL2, with a WebGL1
fallback). Every pixel works out which tile it is on, folds the coordinate, and samples a
packed art atlas (`W × 2H`: front on top, back below) directly — no per-tile drawing, no
sprite list, no per-frame canvas repaint. The trail rides in a second atlas that the same
shader repeats, so the trace moves at GPU speed along with the map; a third, matching atlas
records *when* each bit of that trace was laid, which is what makes undo and replay free
(see below). If the GPU context is lost the app rebuilds its program and textures and
carries on.

The card is modelled as a repeating **2D checkerboard** of the two faces over the whole
plane:

```
front  back   front  back   …
back   front  back   front  …
front  back   front  back   …
…      …      …      …      …
```

* Tile *(i, j)* spans world `[i·W, (i+1)·W] × [j·H, (j+1)·H]`. Tiles butt exactly
  edge-to-edge — there is **no overlap**: the neighbour's face begins where yours ends.
* The face of a tile is `front` when `(i + j)` is even, `back` when odd — so **all four**
  orthogonal neighbours are the opposite face, while the four **diagonal** neighbours are the
  *same* face as you (their `(i+j)` has the same parity) turned **180°**. Stepping off *any*
  edge puts you on the other side; stepping across a corner keeps your side but turns you round.
* The card is a **sheet**, not wallpaper. Crossing a horizontal edge *folds* it over that
  edge, so a tile in an **odd row** (`j` odd) shows its face turned through 180° — walk
  down and the card turns over under you, walk down again and it turns back. Crossing
  left/right leaves the orientation alone (the back scan is already a left-right mirror, so
  the horizontal neighbours line up exactly as printed).
* The same sheet mapping is applied to the artwork **and** to the trail, so a trace always
  sits on the same bit of card, however that tile happens to be laid down.

**The card you are standing on is held in the middle of the screen**, with all **eight** tiles
around it drawn — the other side up, down, left and right, and the *same* side turned 180° in
the four corners — and nothing beyond that, so the middle card and its ring read as a block of
cards rather than as endless wallpaper.

The corners are not a fudge: a diagonal step crosses **two** folds (one vertical, one
horizontal), and two folds leave you on the **same** face you started on, turned through 180°.
In this model a tile shows face `(i+j) mod 2` with both axes mirrored when `j` is odd, so moving
diagonally leaves `(i+j)`'s parity alone but flips `j`'s — both mirror bits flip together, which
*is* a half-turn. That is also why the corners tile seamlessly against the sides: every pair of
adjacent tiles agrees along their shared edge.

Earlier versions showed only the *one* neighbour across your nearest edge and swung it round as
you moved. Showing the whole ring at once means there is nothing to swing, and you can see
where every edge — and every corner — leads before you commit to it.

The middle card is **not** the walker: you roam freely inside it, and it is the *card* that
stays centred. Step more than `CFG.anchorMarginFrac` of a card past an edge and the middle is
handed to the card you stepped onto; the view then **eases** across (`CFG.camLerp`) so the new
card slides into the middle while the old one slides out to become the neighbour behind you.
A card that drops out of the set keeps being drawn while it **fades** (`CFG.cardFade`), so
nothing ever pops in or out of existence mid-slide.

Cards fade softly into the dark on an edge only to the extent that there is **no** card across
it (`CFG.edgeFadeFrac`) — so the middle card, surrounded on all four sides, stays crisp while the
outer edges of the ring dissolve away. Both that soft edge and the fold line are scaled by how
present the neighbour is, so as a card fades out its neighbour's edge softens with it. The other
side is pushed back a touch in brightness (`CFG.nbDimMin`), brightening as you near the seam it
shares with you, so the neighbour you are closest to reads as the one you are about to step onto.

The view is otherwise a plain camera on the centred card: drag to look around and it comes
back when you next move; zoom in past the card and it slides only as far as it must to keep
the walker on screen (`CFG.keepInFrac`). `Fit` frames the card plus a slice of each
neighbour (`CFG.fitArmFrac`) — the corners of the ring show up in the corners of the window.

Where the two faces meet there is a **faint fold line** — a soft dark ramp about 1% of the
card's shorter side on each side of the seam (`CFG.seamFrac` / `CFG.seamDark`) — so the edge
between the faces is legible without becoming a heavy border. (Most cards also print their
own black border, which the seam line simply deepens.) Both axes are handled identically, so
it works walking up, down, left or right.

### The map is really just two faces

The tiling is a **visual** device. Logically the card is only ever the **front** and the
**back**, so any mark you leave at a card position `(face, x, y)` is drawn at that same
position on **every** copy of that face. Walk left (onto the back) and left again (onto
the front) and you're back on the *same* card — your earlier trace is still there, not
duplicated onto "new" territory. The trail is therefore canonicalised onto the two faces
and replicated onto whichever copy is currently on screen.

### Spinning the card

`Q` / `E` (or `⟲` / `⟳`) add ±90° to a target spin that the whole map eases towards, and the
scene is rotated about the middle of the screen — the centred card spins in place. Pointer
input is un-rotated to match, so clicking a spot still walks exactly to the point under the
cursor. `Up` in the status bar tracks the card's own top direction (`↑ → ↓ ←`), including the
fold above: standing in an odd row reads 180° away from the spin on its own, because the card
is upside down there.

### The trail

The trail is a **hollow ribbon** drawn as a mark *on the card*, so it spins with the map.
Each point remembers the card orientation it was laid at, and that drives:

* **Colour** — four orientations, four colours: `↑` gold, `→` blue, `↓` red, `←` violet
  (the same order as the `Up` readout). The orientation stored is the one you actually saw
  on screen — spin *plus* fold — so a trace laid in an odd row takes the opposite colour,
  exactly as the card is upside down there. A legend sits in the status bar.
* **Arrows** — small triangles inside the hollow channel, pointing to the direction the
  card's "up" faced when that part of the trail was drawn. Because the mark is on the card,
  the arrows turn with it: spin the card and a "gold, arrows-up" trail becomes
  "gold, arrows-right".
* **Turn badge** — crossing a **top or bottom** edge folds the sheet over, which tumbles you
  180°, so the ribbon switches colour there for no reason you can see. A small `⟲` disc is
  stamped beside the ribbon at each such crossing, coloured to match the new leg. A crossing
  that only swaps the face **sideways** — left or right, which leaves you the same way up —
  gets **no** badge, so a bare seam reads as "you are still the same way up".

The ribbon is baked with canvas2D into a tile-sized, two-face atlas (`W × 2H`, front on
top) which the shader repeats for every copy of a face; only the rectangle that changed is
re-uploaded. It is built one segment at a time: a dark casing is stroked first so it reads
over busy artwork, then the colour, then a narrower stroke with `destination-out` punches
the channel so the map shows through, then the arrows — the punch and arrows are deferred
by one segment so a wide casing stroke can never refill the hollow behind it.

The card's *artwork* gets the fold line, but the **trail deliberately does not**, so a trace
stays unbroken as it runs from one face onto the next: when a step crosses an edge the
segment is extended to the seam on the old face and restarted exactly there on the new one,
so the two halves meet instead of leaving a gap. The trace still fades near an edge that has
no neighbour, but over a much shorter ramp than the artwork (`CFG.trailEdgeFrac`), so a badge
stamped beside the seam stays crisp instead of dissolving into the dark with the card.
Tuning lives in `CFG.trailWidthFrac` / `trailCasingFrac` / `trailHollowFrac` /
`trailArrowFrac` / `trailArrowGapFrac` / `trailStepFrac` / `turnBadgeFrac` /
`trailEdgeFrac`.

### Undo, replay and scrubbing

The walk is recorded as a list of points (`S.trail`), and every stroke that goes into the
trace atlas is **mirrored into a third atlas** at one texel per world pixel (`markCv`). That
mask stores, in its red and green channels, the **index of the point that laid that bit of
ink** — a 16-bit number carried as two bytes, so it survives any float precision. The mask is
painted `destination-over`, so each texel keeps the index of the **first** stroke that reached
it.

That first-touch rule is what makes a replay look right. A strand is never knocked out by a
later one crossing it: the trace comes back **complete**, appearing at exactly the moment it
was first drawn there, however many times the walk later passes over it. (The ink itself is
still composited normally, so the artwork's over/under at a crossing is unchanged.)

Nothing is redrawn to replay a walk: showing the trace between two points is a pair of byte
comparisons in the shader,

```glsl
vec2 mk = texture2D(uInk, uv).rg * 255.0;                 // this texel's bytes
float show = mk.x < uInkProg.x - 0.5 ? 1.0                // ...at or before the playhead?
           : (mk.x > uInkProg.x + 0.5 ? 0.0 : step(mk.y, uInkProg.y + 0.5));
tA = clamp(t.a * … * show, 0.0, 1.0);
```

so `undo`, `◀` / `▶` replay at any speed, holding `Z`, and dragging the slider are all the
same thing to the renderer: move `uInkProg` (`S.cursor`) and the ink follows, at any speed, on
any device. The mask capsule is drawn a little fatter than the ink (casing plus a few px), so
no fringe of trace can be left behind — the tests check exactly that: *every* texel of trace
in the atlas carries an index, and a rewind to nothing leaves nothing.

A few smaller pieces make it feel right:

* **The marker walks the route.** Scrubbing moves the walker along the recorded polyline and
  the camera follows, so rewinding reads as *walking backwards out of the maze* rather than a
  progress bar going in reverse.
* **You choose the pace.** The transport's speed button multiplies the replay rate
  (`CFG.replaySpeeds`, `S.replaySpeed`) — `0.1×` up to `4×`, starting at `0.2×` so the default
  replay is slow enough to follow. It governs *watching* the walk back; holding undo is a
  scrub of its own and keeps `CFG.rewindRate`.
* **The card turns with it.** Spins are recorded as small events on the same timeline
  (`S.spins`: "a turn to orientation *q*, when the walk had *i* points"). Moving the playhead
  applies or undoes them as it passes, in either direction, so replaying *plays your turns
  back*, scrubbing through them rotates the card smoothly, and a scrub out and back leaves the
  card exactly as it was. Spins with no walking in between are collapsed into one event, and
  each event is replayed as the **shortest** step round: three turns to the left come back as
  a single turn to the right.
* **Rewinding is a preview; walking commits it.** The recorded walk is untouched while you
  scrub, so you can play forwards again. The moment you walk, the timeline is cut at the
  playhead and the trace is **rebuilt from the recorded points** (the same points, through
  the same drawing code, so the ink is identical) — which is also what renumbers the mask
  indices so the two stay in step.

### The walk has a beginning, too

The history is capped at `CFG.trailMax` points and slides a block at a time. The mask's
indices do **not** start again at zero when it does: `S.trailBase` remembers how many points
have scrolled out, is added to the playhead before the byte comparison, and the recorded
turns shift along with the points. Ink older than the window simply stays on the card, as it
always has — a mask texel is revealed at the index it was *first* inked, so walking back over
your own trace keeps the trace near the marker. Only running out of mask index room
(`CFG.inkMax`) forces a rebuild, and that is invisible: the ink it drops has already scrolled
out of the history.

### Current scope (P0)

* Free roaming — the walker moves anywhere; maze walls are **not** enforced yet.
* All **eight** cards around the one you are on are shown: the other side across every edge,
  the same side turned 180° in every corner; the middle follows you across a seam with a short
  slide, and the two faces butt at a faint fold line (no overlap).
* Logically a **finite** two-face card with a shared trace (see above).
* Manual 90° card spin, and the sheet **fold**: a tile in an odd row shows its face turned
  through 180°, as if the card had been folded over a horizontal edge.
* **Undo / replay / scrub** over the whole recorded walk, in both directions, with a speed
  control (0.1× up to 4×, starting at 0.2×) and the card's turns played back with it.

### Roadmap

* **P1**: detect roads/paths in the uploaded art and snap / constrain the walker
  (collision), plus an easy "auto-trace" mode.
* Optional: the deeper spin semantics where rotating the card also changes which edges
  connect, image registration/calibration (scale/offset/rotate the two scans so their edges
  line up), and the real game's door / spin / flip icons with an exit detection.

## Files

* `index.html` — the whole app (markup, styles, renderer, and logic). Open it and go.
* `README.md` — this file.

> One Card Maze is a game by Simon Filice and Andrew Dobson. This is an unofficial
> companion tool for playing cards you already own; it ships no game artwork.
