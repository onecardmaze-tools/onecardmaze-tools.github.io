/* Browser regression: batch import, duplicate detection and route preservation.
   node tests/batch-import.cjs (requires Playwright) */
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
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/?demo`);
    await page.evaluate(() => OCM.startup);
    const pngs = await page.evaluate(() => Array.from({ length: 26 }, (_, i) => {
      const c = document.createElement('canvas'); c.width = 20; c.height = 30;
      const g = c.getContext('2d'); g.fillStyle = `rgb(${i * 8},70,120)`; g.fillRect(0, 0, 20, 30);
      return c.toDataURL().split(',')[1];
    }));
    const image = (name, i) => ({ name, mimeType: 'image/png', buffer: Buffer.from(pngs[i], 'base64') });
    const files = [];
    for (let i = 24; i >= 0; i--) files.push(image(`Map-${i + 1}_back.png`, i), image(`Map-${i + 1}_FRONT.png`, i));
    files.push(image('Missing_front.png', 0), image('Clash_front.png', 0), image('Clash_FRONT.jpg', 0),
      image('Clash_back.png', 0), image('unknown.png', 0),
      { name: 'Broken_front.png', mimeType: 'image/png', buffer: Buffer.from('broken') }, image('Broken_back.png', 0));
    await page.evaluate(() => { OCM.S.trail.push({ x: 20, y: 30, r: 0 }, { x: 25, y: 35, r: 0 }); OCM.syncTimeline(); });
    const snapshot = () => page.evaluate(() => JSON.stringify({ trail: OCM.S.trail, markers: OCM.S.markers, demo: OCM.S.demo, saved: OCM.S.savedCardId }));
    const before = await snapshot();
    await page.click('#btnMore'); await page.click('#btnUpload');
    assert(await page.locator('#confirmCard').isHidden());
    await page.click('#btnBatchMode'); await page.locator('#fileBatch').setInputFiles(files);
    await page.waitForFunction(() => !document.getElementById('btnBatchSave').disabled);
    assert.match(await page.locator('#batchStatus').textContent(), /25 cards ready · 4 need attention/);
    assert.equal(await page.locator('#batchRows img').count(), 50);
    for (const [width, height] of [[320, 568], [844, 390], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      assert(await page.locator('#loader .panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.locator('#btnBatchSave').scrollIntoViewIfNeeded();
      const box = await page.locator('#btnBatchSave').boundingBox(); assert(box.height >= 44 && box.width >= 44);
      await page.locator('#btnSingleMode').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btnLoaderClose');
      fs.mkdirSync(path.join(root, 'ui-qa'), { recursive: true });
      await page.screenshot({ path: path.join(root, `ui-qa/batch-${width}.png`) });
    }
    await page.click('#btnBatchSave');
    await page.waitForFunction(() => !document.getElementById('cardLibrary').classList.contains('hidden') && document.getElementById('libraryStatus').textContent.includes('imported'));
    assert.match(await page.locator('#libraryStatus').textContent(), /25 cards imported/);
    assert.equal(await snapshot(), before);
    const cards = await page.evaluate(() => CardLibrary.list()); assert.equal(cards.length, 25);
    assert.deepEqual(cards.map(c => c.name), Array.from({ length: 25 }, (_, i) => `Map-${i + 1}`));
    await page.evaluate(async id => { const card = await CardLibrary.get(id); delete card.fingerprint; await CardLibrary.save(card); }, cards[0].id);
    // Repeat imports skip existing image pairs, even with different names.
    await page.click('#btnLibraryImport'); await page.click('#btnBatchMode');
    await page.locator('#fileBatch').setInputFiles([image('Renamed_front.png', 0), image('Renamed_back.png', 0),
      image('Map-1_front.png', 25), image('Map-1_back.png', 25)]);
    await page.waitForFunction(() => !document.getElementById('btnBatchSave').disabled);
    await page.click('#btnBatchSave');
    await page.waitForFunction(() => !document.getElementById('cardLibrary').classList.contains('hidden') && document.getElementById('libraryStatus').textContent.includes('imported'));
    assert.match(await page.locator('#libraryStatus').textContent(), /1 card imported · 1 duplicates skipped/);
    assert.equal(await page.evaluate(async () => (await CardLibrary.list()).length), 26);
    assert.equal(await snapshot(), before);
    // Partial writes preserve successes; retry is safe. Simulate quota failure on one card.
    await page.evaluate(() => {
      const save = CardLibrary.save; window.originalSave = save; CardLibrary.save = card => card.name === 'Fail' ? Promise.reject(Error('Full')) : save(card);
    });
    await page.click('#btnLibraryImport'); await page.click('#btnBatchMode');
    const retryFiles = [image('Fail_front.png', 0), image('Fail_back.png', 1), image('Success_front.png', 1), image('Success_back.png', 2)];
    await page.locator('#fileBatch').setInputFiles(retryFiles);
    await page.waitForFunction(() => !document.getElementById('btnBatchSave').disabled);
    await page.click('#btnBatchSave');
    await page.waitForFunction(() => !document.getElementById('cardLibrary').classList.contains('hidden') && document.getElementById('libraryStatus').textContent.includes('imported'));
    assert.match(await page.locator('#libraryStatus').textContent(), /1 card imported · 1 could not be saved: Fail/);
    assert.equal(await page.evaluate(async () => (await CardLibrary.list()).length), 27);
    assert.equal(await snapshot(), before);
    await page.evaluate(() => { CardLibrary.save = window.originalSave; });
    await page.click('#btnLibraryImport'); await page.click('#btnBatchMode');
    await page.locator('#fileBatch').setInputFiles(retryFiles);
    await page.waitForFunction(() => !document.getElementById('btnBatchSave').disabled);
    await page.click('#btnBatchSave');
    await page.waitForFunction(() => !document.getElementById('cardLibrary').classList.contains('hidden') && document.getElementById('libraryStatus').textContent.includes('duplicates skipped'));
    assert.match(await page.locator('#libraryStatus').textContent(), /1 duplicates skipped/);
    assert.equal(await page.evaluate(async () => (await CardLibrary.list()).length), 28);
    assert.equal(await snapshot(), before);
    // Single import still asks at the point that it would replace the active card.
    await page.click('#btnLibraryImport');
    await page.locator('#fileFront').setInputFiles(image('front.png', 0));
    await page.locator('#fileBack').setInputFiles(image('back.png', 0));
    await page.click('#btnStart');
    await page.waitForFunction(() => !document.getElementById('confirmCard').hidden);
    assert.equal(await snapshot(), before);
    await page.click('#btnConfirmNo'); assert.equal(await snapshot(), before);
    assert.deepEqual(errors, []);
    console.log('PASS: 25-card batch, preview, exceptions, natural sorting, duplicate skipping, same-name preservation, partial failure, route safety and responsive modal');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
