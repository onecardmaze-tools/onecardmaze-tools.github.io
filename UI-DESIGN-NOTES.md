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
- Keep only the unofficial tool name and About in a quiet, opaque footer.
- Move card import and secondary actions into a separate floating Tools menu, with opaque surfaces so the artwork cannot obscure them.
