/* Browser UI QA: every mode at every reference viewport.
   Usage:  npm i -D playwright (once), then  node tests/ui-states.cjs [outDir]
   Writes screenshots to outDir (default ./ui-qa, git-ignored) and fails on:
   - the wrong controls for a mode, or overlapping / off-screen chrome
   - visible controls smaller than the tap budget (44px; text links 24px)
   - chrome covering more than the layout budget (DESIGN-SYSTEM.md › Layout budgets)
   - focus lost to <body> or a hidden element after a transition
   - any page error, or a route edited by reviewing
   See DESIGN-SYSTEM.md › Process for when to run this. */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'ui-qa'));
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = new URL(q.url, 'http://x').pathname; if (p === '/') p = '/index.html';
  const f = path.join(root, decodeURIComponent(p));
  if (!f.startsWith(root)) { r.writeHead(403).end(); return; }
  try { r.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); }
  catch { r.writeHead(404).end(); }
});

// name, width, height, touch, coverage budget (share of height for walk chrome)
const VIEWPORTS = [
  ['phone-320', 320, 568, true, .16],
  ['phone-375', 375, 667, true, .15],
  ['phone-390', 390, 664, true, .15],
  ['land-844', 844, 390, true, .30],   // rails sit at the sides; measured as share of area instead
  ['land-667', 667, 375, true, .30],
  ['desktop', 1280, 800, false, .12],
];
// Which interactive controls must (and must not) be visible in each mode.
const MODE_CONTROLS = {
  walk: { show: ['btnSpinL', 'btnSpinR', 'btnUndo', 'btnReplay', 'btnHelp', 'btnMore'], hide: ['btnDone', 'btnFwd', 'scrub', 'btnReplayAgain', 'btnCancelMarker'] },
  playing: { show: ['btnDone', 'scrub', 'btnSpeed', 'btnMore'], hide: ['btnSpinL', 'btnSpinR', 'btnUndo', 'btnReplayAgain'] },
  paused: { show: ['btnDone', 'btnBack', 'btnFwd', 'scrub', 'btnSpeed'], hide: ['btnSpinL', 'btnSpinR', 'btnReplayAgain'] },
  complete: { show: ['btnReplayAgain', 'btnDoneComplete'], hide: ['btnSpinL', 'btnSpinR', 'scrub', 'btnFwd'] },
  place: { show: ['btnCancelMarker', 'btnPlaceStyle'], hide: ['btnSpinL', 'btnSpinR', 'scrub'] },
};
const failures = [];
const fail = (vp, step, msg) => { failures.push(`${vp} · ${step}: ${msg}`); };

async function audit(pg, vp, step, opts = {}) {
  const r = await pg.evaluate(({ step }) => {
    const vis = el => { if (!el) return false; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const rect = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const W = innerWidth, H = innerHeight;
    const mode = document.body.dataset.mode;
    const ids = ['btnSpinL', 'btnSpinR', 'btnUndo', 'btnReplay', 'btnHelp', 'btnMore', 'btnDone', 'btnBack', 'btnFwd', 'scrub', 'btnSpeed', 'btnReplayAgain', 'btnDoneComplete', 'btnCancelMarker', 'btnPlaceStyle'];
    const visible = Object.fromEntries(ids.map(id => [id, vis(document.getElementById(id))]));
    // chrome boxes that float over the map
    const chromeSel = ['#btnHelp', '#btnMore', '.dock-walk .dbtn', '#player', '#replayCompletion', '#markerPlacementTip', '#walkHint', '#confirmCard', '#actionToast'];
    const boxes = [];
    for (const sel of chromeSel) for (const el of document.querySelectorAll(sel)) if (vis(el)) boxes.push({ sel: el.id ? '#' + el.id : sel, ...rect(el) });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ix = Math.min(a.r, b.r) - Math.max(a.x, b.x), iy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) overlaps.push(a.sel + ' × ' + b.sel);
    }
    const offscreen = boxes.filter(b => b.x < -1 || b.y < -1 || b.r > W + 1 || b.b > H + 1).map(b => b.sel);
    // tap targets for every visible interactive element in floating chrome and open surfaces
    const scope = [...document.querySelectorAll('#hud, .chip, #confirmCard, #actionToast, .sheet:not([hidden]), #loader:not(.hidden), dialog[open]')];
    const small = [];
    for (const s of scope) for (const el of s.querySelectorAll('button, a, input:not([type=file]), select, summary')) {
      if (!vis(el) || el.closest('[hidden]')) continue;
      const b = el.getBoundingClientRect(); const textLink = el.matches('a, .linkish');
      const min = textLink ? 24 : 44;
      if (el.type === 'range') { if (b.height < 28) small.push('#' + el.id + ' h' + Math.round(b.height)); continue; }
      if (b.height < min - .5 || (!textLink && b.width < min - .5)) small.push((el.id ? '#' + el.id : el.textContent.trim().slice(0, 18)) + ` ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    // Words must not overflow their buttons.
    const clipped = [];
    for (const el of document.querySelectorAll('#hud .dbtn span, .chip, .li, .confirm-actions button, #actionToast')) {
      if (!vis(el)) continue; if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.id || el.textContent.trim().slice(0, 20));
    }
    // coverage: chrome area along the bottom (portrait) or sides (landscape)
    const dockBoxes = boxes.filter(b => !['#btnHelp', '#btnMore', '#walkHint'].includes(b.sel));
    const bottomTop = dockBoxes.length ? Math.min(...dockBoxes.map(b => b.y)) : H;
    const area = dockBoxes.reduce((s, b) => s + b.w * b.h, 0) / (W * H);
    const a = document.activeElement;
    const focus = { id: a && (a.id || a.tagName), visible: !!a && a !== document.body && vis(a) };
    return { mode, visible, overlaps, offscreen, small, clipped, coverageH: (H - bottomTop) / H, coverageArea: area, focus };
  }, { step });
  const spec = MODE_CONTROLS[opts.mode || r.mode];
  if (opts.mode && r.mode !== opts.mode) fail(vp, step, `mode is ${r.mode}, expected ${opts.mode}`);
  if (spec && !opts.sheet) {
    for (const id of spec.show) if (!r.visible[id]) fail(vp, step, `${id} should be visible in ${r.mode}`);
    for (const id of spec.hide) if (r.visible[id]) fail(vp, step, `${id} should be hidden in ${r.mode}`);
  }
  if (r.overlaps.length && !opts.sheet) fail(vp, step, 'overlap ' + r.overlaps.join(', '));
  if (r.offscreen.length) fail(vp, step, 'off-screen ' + r.offscreen.join(', '));
  if (r.small.length) fail(vp, step, 'small targets ' + r.small.join(', '));
  if (r.clipped.length) fail(vp, step, 'clipped text ' + r.clipped.join(', '));
  if (opts.budget != null) {
    const v = opts.land ? r.coverageArea : r.coverageH;
    if (v > opts.budget) fail(vp, step, `chrome covers ${(v * 100).toFixed(1)}% (budget ${(opts.budget * 100).toFixed(0)}%)`);
  }
  if (opts.focus && !r.focus.visible) fail(vp, step, `focus lost (${r.focus.id})`);
  return r;
}

srv.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const summary = [];
  for (const [vp, w, h, touch, budget] of VIEWPORTS) {
    const land = w > h && h <= 500;
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
    pg.setDefaultTimeout(4000);
    try {
    const errors = []; pg.on('pageerror', e => errors.push(e.message));
    const shot = name => pg.screenshot({ path: path.join(out, `${vp}-${name}.png`), timeout: 30000 });
    const settle = (ms = 400) => pg.waitForTimeout(ms);
    const mode = () => pg.evaluate(() => document.body.dataset.mode);
    await pg.goto(base); await settle(2200);
    await shot('01-intro');
    await audit(pg, vp, 'intro', { sheet: true });
    await pg.click('#btnIntroDemo'); await settle(800);
    await shot('02-start');
    await audit(pg, vp, 'start', { mode: 'walk', budget, land, focus: true });
    // walk a short route with a rotation in the middle
    const pts = [[.5, .36], [.62, .36], [.62, .52], [.42, .52]];
    for (const [i, [x, y]] of pts.entries()) {
      await pg.mouse.click(w * x, h * y); await settle(1500);
      if (i === 1) { await pg.click('#btnSpinR'); await settle(900); }
    }
    await shot('03-walk');
    const walked = await audit(pg, vp, 'walk', { mode: 'walk', budget, land });
    const trailLen = await pg.evaluate(() => OCM.S.trail.length);
    if (trailLen < 3) fail(vp, 'walk', 'route did not record (' + trailLen + ')');
    // replay
    await pg.click('#btnReplay'); await settle(600);
    await shot('04-playing');
    await audit(pg, vp, 'playing', { mode: 'playing', focus: true });
    await pg.click('#btnFwd'); await settle(300);   // pause
    await shot('05-paused');
    await audit(pg, vp, 'paused', { mode: 'paused', focus: true });
    // fast-forward to the end
    await pg.evaluate(() => { OCM.S.replaySpeed = 4; });
    await pg.click('#btnFwd');
    for (let i = 0; i < 60 && await mode() !== 'complete'; i++) await settle(250);
    await settle(300);
    await shot('06-complete');
    await audit(pg, vp, 'complete', { mode: 'complete', focus: true });
    // reverse replay to the start, then tap the map: the route must survive
    await pg.evaluate(() => { OCM.S.cursor = OCM.S.trail.length - 1; OCM.play(-1); });
    for (let i = 0; i < 60 && await mode() !== 'complete'; i++) await settle(250);
    const before = await pg.evaluate(() => JSON.stringify(OCM.S.trail));
    await pg.mouse.click(w * .5, h * .45); await settle(500);
    const after = await pg.evaluate(() => ({ trail: JSON.stringify(OCM.S.trail), confirm: !document.getElementById('confirmCard').hidden }));
    if (after.trail !== before) fail(vp, 'reverse-complete tap', 'route was edited by a tap during review');
    if (!after.confirm) fail(vp, 'reverse-complete tap', 'confirm card did not appear');
    await shot('07-confirm');
    await audit(pg, vp, 'confirm', { focus: true });
    await pg.click('#btnConfirmNo'); await settle(200);
    // Done returns to walking at the end, without editing
    await pg.keyboard.press('Escape'); await settle(500);
    const done = await pg.evaluate(() => ({ m: document.body.dataset.mode, c: OCM.S.cursor, n: OCM.S.trail.length - 1, t: JSON.stringify(OCM.S.trail) }));
    if (done.m !== 'walk' || Math.abs(done.c - done.n) > 1e-6 || done.t !== before) fail(vp, 'done', 'Done did not return to the end unchanged');
    // Tools
    await pg.click('#btnMore'); await settle(300);
    await shot('08-tools');
    await audit(pg, vp, 'tools', { sheet: true, focus: true });
    // Start over and undo it
    await pg.click('#btnReset'); await settle(300);
    await shot('09-start-over');
    await audit(pg, vp, 'start over', { mode: 'walk' });
    await pg.click('#actionToastBtn'); await settle(400);
    const restored = await pg.evaluate(() => JSON.stringify(OCM.S.trail));
    if (restored !== before) fail(vp, 'start over', 'Undo did not restore the route');
    // marker placement
    await pg.click('#btnMore'); await pg.click('#btnMarkers'); await settle(300);
    await shot('10-markers');
    await audit(pg, vp, 'markers', { sheet: true, focus: true });
    await pg.click('#btnPlaceMarker'); await settle(300);
    await shot('11-place');
    await audit(pg, vp, 'place', { mode: 'place', focus: true });
    await pg.click('#btnCancelMarker'); await settle(200);
    // Opening import preserves the route; only activating a card asks first.
    await pg.click('#btnMore'); await pg.click('#btnUpload'); await settle(300);
    const asked = await pg.evaluate(() => !document.getElementById('confirmCard').hidden);
    if (asked) fail(vp, 'import', 'opening import should not ask to discard the route');
    await settle(400);
    await shot('12-import');
    await audit(pg, vp, 'import', { sheet: true, focus: true });
    const startBtn = await pg.evaluate(() => { const b = document.getElementById('btnStart').getBoundingClientRect(); return b.bottom <= innerHeight; });
    if (!startBtn) fail(vp, 'import', '"Use this card" is below the fold');
    if (errors.length) fail(vp, 'page', errors.join(' | '));
    summary.push(`${vp.padEnd(10)} walk chrome ${(walked.coverageH * 100).toFixed(1)}% of height, ${(walked.coverageArea * 100).toFixed(1)}% of area`);
    } catch (e) { fail(vp, 'script', e.message.split('\n')[0]); await pg.screenshot({ path: path.join(out, `${vp}-99-error.png`) }).catch(() => {}); }
    await pg.close();
  }
  await browser.close(); srv.close();
  console.log(summary.join('\n'));
  if (failures.length) { console.error('FAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('PASS: modes, overlap, tap targets, coverage, focus and route safety at ' + VIEWPORTS.length + ' viewports');
});
