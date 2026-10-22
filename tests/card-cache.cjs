/* Browser regression: multi-card library, migration and failure isolation.
   node tests/card-cache.cjs (requires Playwright) */
'use strict';
const assert = require('assert').strict;
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext(); context.setDefaultTimeout(15000);
    let page = await context.newPage();
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
    page.on('pageerror', e => errors.push(String(e)));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const open = async () => { await page.goto(base); return page.evaluate(() => OCM.startup); };
    const list = () => page.evaluate(() => CardLibrary.list());
    assert.equal(await open(), false);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 160;
      const g = c.getContext('2d'); g.fillStyle = '#abc'; g.fillRect(0, 0, 120, 160);
      return c.toDataURL('image/png').split(',')[1];
    });
    const image = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    async function add(name) {
      await page.evaluate(() => MazeUI.openImport());
      await page.locator('#cardName').fill(name);
      await page.locator('#fileFront').setInputFiles(image('front.png'));
      // Selecting only one face must not modify the map or save a mixed pair.
      assert(await page.locator('#btnStart').isDisabled());
      await page.locator('#fileBack').setInputFiles(image('back.png'));
      await page.locator('#btnStart').click();
      await page.waitForFunction(() => document.getElementById('loader').classList.contains('hidden'));
    }
    async function choose(name) {
      await page.evaluate(() => MazeUI.openLibrary());
      const card = (await list()).find(c => c.name === name);
      await page.getByRole('button', { name: 'Play ' + name, exact: true }).click();
      await page.waitForFunction(id => OCM.S.savedCardId === id && document.getElementById('cardLibrary').classList.contains('hidden'), card.id);
    }
    await add('Card A');
    const [a] = await list(); assert(a.thumbnail.startsWith('data:image/jpeg'));
    await page.evaluate(() => OCM.addMarker({ x: 20, y: 30 }));
    await page.waitForFunction(async id => (await CardLibrary.get(id)).markers.length === 1, a.id);
    await add('Card B'); assert.equal((await list()).length, 2);
    assert.equal(await page.evaluate(() => OCM.S.markers.length), 0);
    await choose('Card A'); assert.equal(await page.evaluate(() => OCM.S.markers.length), 1);
    await choose('Card B'); assert.equal(await page.evaluate(() => OCM.S.markers.length), 0);
    await page.close(); page = await context.newPage();
    assert.equal(await open(), true);
    await page.waitForFunction(() => !document.getElementById('cardLibrary').classList.contains('hidden'));
    assert.equal(await page.locator('#savedCards li').count(), 2);
    assert.equal(await page.locator('#help').evaluate(el => el.open), false);
    await choose('Card A');
    // A real route is protected when selecting a different saved card.
    await page.evaluate(() => { OCM.S.trail.push({ x: 25, y: 35, r: 0 }); OCM.syncTimeline(); });
    await page.evaluate(() => MazeUI.openLibrary());
    await page.getByRole('button', { name: 'Play Card B', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('confirmCard').hidden);
    assert.equal(await page.evaluate(() => OCM.S.savedCardId), a.id);
    await page.locator('#btnConfirmNo').click();
    assert.equal(await page.evaluate(() => OCM.S.savedCardId), a.id);
    await page.evaluate(() => MazeUI.openLibrary());
    await page.getByRole('button', { name: 'Play Card B', exact: true }).click();
    await page.locator('#btnConfirmYes').click();
    await page.waitForFunction(id => OCM.S.savedCardId !== id, a.id);
    // Failed new-card writes must roll back both card images and markers.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (this.name === 'card-markers') throw new DOMException('Storage full', 'QuotaExceededError');
        return key === undefined ? put.call(this, value) : put.call(this, value, key);
      };
    });
    await add('Failed card');
    assert.equal((await list()).length, 2);
    assert((await page.locator('#toast').textContent()).includes('could not save'));
    assert.equal(await page.evaluate(() => OCM.S.ready), true);
    await open();
    const beforeDemo = await list();
    await page.goto(base + '?demo'); await page.evaluate(() => OCM.startup);
    assert.deepEqual(await list(), beforeDemo);
    // Deleting one card never touches the other card's marker collection.
    await page.evaluate(() => MazeUI.openLibrary());
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Delete Card B', exact: true }).click();
    await page.waitForFunction(async () => (await CardLibrary.list()).length === 1);
    assert.equal(await page.evaluate(async id => (await CardLibrary.get(id)).markers.length, a.id), 1);
    // Verify keyboard containment and long names at phone and desktop sizes.
    await page.evaluate(async id => {
      const card = await CardLibrary.get(id);
      card.name = 'A long maze card name for a collection with several different editions and scans';
      await CardLibrary.save(card);
      await CardLibrary.save({ ...card, id: 'layout-extra', name: 'Another saved card', markers: [] });
    }, a.id);
    for (const [width, height] of [[320, 568], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => MazeUI.openLibrary());
      await page.locator('#btnLibraryPractice').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btnLibraryClose');
      const box = await page.locator('#btnLibraryImport').boundingBox(); assert(box.width >= 44);
      assert(await page.locator('#cardLibrary .panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Long card names must wrap inside the panel');
      fs.mkdirSync(path.join(root, 'ui-qa'), { recursive: true });
      await page.screenshot({ path: path.join(root, `ui-qa/library-${width}.png`) });
    }
    // Seed the v1 layout in a fresh origin context, then upgrade without data loss.
    const legacy = await browser.newContext(); const old = await legacy.newPage();
    await old.goto(base + 'robots.txt');
    await old.evaluate(async png => {
      const blob = await (await fetch('data:image/png;base64,' + png)).blob();
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('ocm-walker', 1); r.onupgradeneeded = () => r.result.createObjectStore('imgs');
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('imgs', 'readwrite'), store = tx.objectStore('imgs');
        store.put(blob, 'front'); store.put(blob, 'back');
        store.put([{ face: 0, u: .2, v: .3, shape: 'circle', color: '#ff5b7a', label: 'Legacy' }], 'markers');
        tx.oncomplete = resolve; tx.onerror = reject;
      }); db.close();
    }, png);
    await old.goto(base); assert.equal(await old.evaluate(() => OCM.startup), true);
    const migrated = await old.evaluate(() => CardLibrary.get('legacy'));
    assert.equal(migrated.name, 'Saved card'); assert.equal(migrated.markers[0].label, 'Legacy');
    await old.getByRole('button', { name: 'Play Saved card', exact: true }).click();
    await old.waitForFunction(() => OCM.S.savedCardId === 'legacy');
    assert.equal(await old.evaluate(() => OCM.S.markers.length), 1);
    await legacy.close();
    const blocked = await browser.newContext(); await blocked.addInitScript(() => { indexedDB.open = () => { throw Error('Storage blocked'); }; });
    const restricted = await blocked.newPage(); await restricted.goto(base);
    assert.equal(await restricted.evaluate(() => OCM.startup), false);
    assert.equal(await restricted.evaluate(() => OCM.S.ready && OCM.S.demo), true);
    await blocked.close();
    assert.deepEqual(errors, []);
    console.log('PASS: multiple cards, explicit save, isolated markers, tab reopen chooser, route protection, atomic failure, deletion, modal keyboard, legacy migration, demo and blocked storage');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
