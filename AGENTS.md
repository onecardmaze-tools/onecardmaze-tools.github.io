# Notes for coding agents

Before touching the interface (markup in `index.html`, `companion.css`,
`companion-ui.js`, or any copy), read [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) and
follow its Process and pull request checklist. The short version:

- The map owns the screen: two corner chips and one dock chosen by
  `uiMode()`. Never add a second bar.
- Reviewing never edits the route. Destructive actions are undoable or ask
  first.
- Use the tokens in `companion.css`; keep `uiInsets()` in `index.html` in step
  with the `--inset-*` tokens.
- English copy, sentence case, quietly unofficial, no game artwork.
- No third-party runtime dependencies, no build step.

Checks to run before you push:

```sh
for t in tests/*.test.js tests/*.test.cjs; do node "$t" || exit 1; done
node tests/ui-states.cjs            # browser QA; needs Playwright
```

`tests/large-view-raster.test.js` and `tests/trace-raster.test.js` need
`@napi-rs/canvas`. Rendering-engine and maze-rule changes are out of scope for
UI work; see `TRACE-DESIGN.md` and `PERFORMANCE.md` for those areas.
