/* Real-browser coverage for local card persistence and storage failures.
   Run with node tests/card-cache.cjs (requires Playwright). */
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
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
async function saved(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('ocm-walker', 1);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      return await Promise.all(['front', 'back', 'markers'].map(key => new Promise((resolve, reject) => {
        const r = db.transaction('imgs').objectStore('imgs').get(key);
        r.onsuccess = async () => resolve(r.result instanceof Blob ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await r.result.arrayBuffer()))) : r.result);
        r.onerror = () => reject(r.error);
      })));
    } finally { db.close(); }
  });
}
async function importCard(page, front, back) {
  await page.evaluate(() => MazeUI.openImport());
  await page.locator('#fileFront').setInputFiles(front);
  await page.locator('#fileBack').setInputFiles(back);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    let page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const open = async () => { await page.goto(base); return page.evaluate(() => OCM.startup); };
    assert.equal(await open(), false);
    await page.waitForFunction(() => document.getElementById('help').open);
    await page.locator('#btnIntroImport').click();
    const front = path.join(root, 'assets/demo/front.png'), back = path.join(root, 'assets/demo/back.png');
    await importCard(page, front, back);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Card saved'));
    await page.evaluate(() => OCM.addMarker({ x: 100, y: 120 }));
    await page.waitForFunction(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('ocm-walker', 1); r.onsuccess = () => resolve(r.result); });
      const r = db.transaction('imgs').objectStore('imgs').get('markers');
      const markers = await new Promise(resolve => { r.onsuccess = () => resolve(r.result); }); db.close();
      return markers.length === 1;
    });
    console.log('Saved initial card and marker');
    const original = await saved(page);
    // Closing the tab and reopening still restores both blobs and markers.
    await page.close(); page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
    assert.equal(await open(), true);
    assert.deepEqual(await saved(page), original);
    assert.equal(await page.evaluate(() => OCM.S.markers.length), 1);
    assert.equal(await page.locator('#help').evaluate(el => el.open), false);
    assert.equal(await page.evaluate(() => OCM.S.demo), false);
    console.log('Restored tab');
    // An explicitly requested practice card must not overwrite the saved card.
    await page.goto(base + '?demo'); await page.evaluate(() => OCM.startup);
    assert.equal(await page.evaluate(() => OCM.S.demo), true);
    assert.deepEqual(await saved(page), original);
    console.log('Demo preserved cache');
    // Fail the second put synchronously: the first face and marker reset must
    // roll back too, keeping the complete previous card usable on next visit.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (key === 'back') throw new DOMException('Storage full', 'QuotaExceededError');
        return put.call(this, value, key);
      };
    });
    await importCard(page, back, front);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('could not save'));
    assert.equal(await page.evaluate(() => OCM.S.ready), true);
    assert.deepEqual(await saved(page), original, 'Failed replacement must leave the previous card intact');
    assert.equal(await open(), true);
    await page.evaluate(() => MazeUI.openImport());
    await page.locator('#btnForget').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Saved images cleared');
    assert.deepEqual(await saved(page), [undefined, undefined, undefined]);
    assert.equal(await open(), false);
    // Private/restricted browser storage still allows the practice card.
    await page.addInitScript(() => { indexedDB.open = () => { throw new Error('Storage blocked'); }; });
    assert.equal(await open(), false);
    assert.equal(await page.evaluate(() => OCM.S.demo && OCM.S.ready), true);
    assert.deepEqual(errors, []);
    console.log('PASS: image/marker persistence, tab reopen, intro bypass, demo isolation, atomic rollback, failure feedback, forgetting and unavailable storage');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
