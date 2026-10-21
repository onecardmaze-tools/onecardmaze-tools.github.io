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
