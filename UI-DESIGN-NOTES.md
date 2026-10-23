# UI / UX redesign brief

Captured from the owner's review on 2026-10-19. Design exploration first; do not implement until the direction has been reviewed.

- Understand the physical game's visual character and official site. The helper should feel friendly, restrained, and clearly independent; avoid generic AI dashboard styling.
- Minimize visible controls. Prioritize large, clearly labeled left/right rotation buttons. Remove the replay explanation box and other obstructive teaching panels.
- Remove diagnostic-looking content from the player UI.
- Identify the tool as unofficial on first entry and retain a quiet identifier during play. Introduce the game and link to its official website, official demo/downloads, and purchase channels.
- Replace automatic/optional official demo-card loading with a very simple original practice example. Clearly distinguish that example from the actual game and encourage obtaining the real demo from the creators.
- Explain the personal motivation: a longtime fan made physical cards, found it hard to remember their location and previous visits, and built a helper for themself and other players with the same need. The project is open source and deliberately distributes no official maze artwork. Obtain actual mazes through official channels.
- Remove keyboard movement (WASD / arrows); retain Q / E rotation.
- First deliverable: directional UI mocks for discussion, not changes to the production interface.

Verified reference links:
- https://www.onecardmaze.com/
- https://www.onecardmaze.com/shop
- https://www.onecardmaze.com/downloads
- https://onecardmaze.itch.io/

## Direction selected in review

- Prefer a simple, bright interface.
- Explore a very pale background tint derived from the uploaded card's dominant color; keep the card and route legible and avoid saturated backgrounds.
- Open directly into the game canvas, with a compact introduction overlay. Do not build a separate marketing/official-site-style landing page.
- The introduction offers the official website, an original practice demo, and importing the player's own card. Keep unofficial attribution visible.
- Continue with a refined mock for review before production changes.
- All product UI and copy must be English.
- No header. Use only extremely restrained footer information and entry points.
- The demo is already loaded underneath the introduction overlay; dismissing it immediately allows interaction. Blank card placeholders are acceptable for design review.
- Keep the introduction personal and faithful to the owner's original story; avoid commercial or official brand copy.
- Add a light doodle feel through restrained imperfect outlines and small handwritten details.

## Follow-up refinements

- Use the handwritten heading “Unofficial OneCardMaze helper”.
- Prefer plain fan-made / unofficial wording rather than formal authorization language.
- Add a GitHub icon to the source link.
- Use clean, mirrored circular rotation arrows with connected arrowheads.
- Keep only the unofficial tool name and About in a quiet, opaque footer. (Superseded 2026-10-21: the footer became the top-left identity chip.)
- Move card import and secondary actions into a separate floating Tools menu, with opaque surfaces so the artwork cannot obscure them.

## Redesign implemented (2026-10-21)

Reviewed against issue #1 and the owner's direction to rewrite the UI/UX. The
owner approved the mock direction and asked for a design system so later work
stays consistent. The rules now live in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md);
this file keeps the history.

Problems found by testing the previous UI:

- Bottom controls covered 22–36% of a 390×664 phone (25–34% at 320×568, up to
  41% in landscape), stacked as rotate buttons, a transport and a footer.
- The completion panel never went away.
- Data loss: after a reverse replay, one map tap truncated the route and Undo
  could not restore it. Rotating after scrubbing back did the same.
- Start over cleared the route with no confirmation or undo.
- At 320px the markers panel overlapped Tools, and "Use this card" was below the
  fold.

Decisions:

- One dock chosen by mode (walk, playing, paused, complete, place); the footer
  is replaced by a top-left "unofficial OneCardMaze helper" chip that opens
  About. Walk chrome is now about 11–12% of the height on phones.
- Reviewing never edits. Branching from a review position asks "Walk from
  here?"; Done returns to the end unchanged; tapping during a replay pauses.
  Undo stays a walking tool.
- Start over is immediate but offers Undo for 8 seconds; switching or importing
  a card asks first because that can't be undone.
- Short landscape uses side rails for Rotate left/right so nothing covers the
  bottom centre while walking.
- Tools, Markers and Recording are bottom sheets on phones and popovers on
  desktop. The intro and import are bottom sheets on phones.
- The hand-drawn identity is kept and made consistent: Patrick Hand (bundled,
  OFL) for titles, uneven radii, offset shadows, olive/paper palette, amber only
  for route progress.

## Task-based UX implementation (2026-10-23)

Owner approved implementation after discussing frequent replay for route checking
and enjoyment, confusing undo, and upload/switching/navigation friction. Keep the
existing paper, olive, hand-drawn style; reconsider controls across screen sizes.

User jobs:
- While exploring, correct the previous action precisely without learning replay.
- After exploring, watch or inspect the route, then return to walking or explicitly
  choose a new branch.
- Open another card or add images while keeping the current card's progress.

Implemented:
- Current-card/Cards chip opens one library. Single/batch imports share Add cards;
  the single form chooses images before naming. Completion, backup and Start over
  belong to current-card options. Map contains only map aids and annotations.
- Undo checkpoints store command boundaries and orientation, including consecutive
  turns at one vertex. Checkpoints persist in local progress and portable backups;
  legacy recordings use their recorded vertices when no checkpoints exist.
- Replay remains a first-level action. Paused and completed replay retain the same
  timeline/transport. Explicit Continue from here owns branching; review map taps
  and Q/E cannot modify the route. Previous/next step inspects recorded vertices.
- Removed the independent Route events list; flip/spin animation and timeline
  ticks remain. Add marker uses the current style immediately, with optional style
  editing. Desktop has direct position, fit and marker shortcuts.
- Portrait review uses three rows (timeline, playback, inspection); landscape uses
  a compact two-row transport and keeps walking rails; tablet/desktop use a wider
  timeline. No renderer or maze-rule changes.

Experiments and evidence:

| Expectation | Experiment | Result |
| --- | --- | --- |
| Undo restores one action exactly | `tests/ui-mode.test.js`: complete/partial movement, successive spins at the same point, restored history | Passed |
| Review never edits without explicit intent | Unit and browser tests: play, pause, reverse completion, map tap, Q/E, fractional branch | Passed |
| Card navigation preserves progress | `tests/card-cache.cjs`, `tests/local-progress.cjs`: real uploads, cancelling a partial upload, switching, reload, blocked storage, completion | Passed |
| Library keyboards cannot operate the map underneath | Open library, focus a button, press R; compare route | Passed; fixed global shortcut handling |
| Batch import is independent of the active route | `tests/batch-import.cjs`: 25 cards, ambiguous files, duplicates, partial failure, retry, quota guard | Passed |
| Layout works beyond one phone size | `tests/ui-states.cjs`: 320×568, 375×667, 390×664, 667×375, 844×390, 768×1024, 1280×800 | Passed; screenshots inspected |
| Camera leaves space for the actual controls | `tests/ux-layout.cjs`: all five modes at seven viewports, live resize, CSS/JS inset comparison and dock bounds | Passed: 35 combinations |
| Existing geometry/rendering behavior is preserved | All `tests/*.test.js` and `tests/*.test.cjs`, including native raster tests | Passed |

Portrait walking dock occupied 12.4%, 11.3%, 11.4% of height at the three phone
sizes; tablet 7.4%, desktop 11.8%. Landscape walking controls occupied 10.1% and
7.7% of screen area. These are dock budgets, not total map-chrome coverage.

Corrections from experiments: de-emphasized Continue from here relative to Play;
kept inspection controls in place while playing (disabled); moved image selection
before the name; removed held-key rewind; reserved bottom space for marker
placement in landscape. A batch test previously required a discard question even
when autosave succeeded; it now explicitly simulates quota failure to verify the
actual data-loss boundary. The live-resize geometry probe waits for the resize
handler before comparing CSS and renderer dimensions.

References in `docs/design/` have been regenerated, including a new tablet sheet.
This verifies behavior and geometry in automated Chromium plus visual inspection;
it is not a substitute for user feedback or testing on physical iOS/Android devices.
