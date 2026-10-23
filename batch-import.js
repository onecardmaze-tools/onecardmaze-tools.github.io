/* Filename pairing and local-only batch import. No changes to the active card. */
(function (root) {
  'use strict';
  const compareNames = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  function pairFiles(files) {
    const groups = new Map(), issues = [];
    for (const file of files) {
      const match = /^(.+)_(front|back)\.[^.]+$/i.exec(file.name);
      if (!match || !match[1].trim()) {
        issues.push({ name: file.name, issue: 'Use name_front and name_back' }); continue;
      }
      const name = match[1].trim(), key = name.normalize('NFC').toLowerCase();
      if (!groups.has(key)) groups.set(key, { name, front: [], back: [] });
      groups.get(key)[match[2].toLowerCase()].push(file);
    }
    const pairs = [];
    for (const group of groups.values()) {
      const problems = [];
      for (const side of ['front', 'back']) {
        if (!group[side].length) problems.push('Missing ' + side);
        if (group[side].length > 1) problems.push('Multiple ' + side + ' images');
      }
      if (problems.length) issues.push({ name: group.name, issue: problems.join(' · ') });
      else pairs.push({ name: group.name, front: group.front[0], back: group.back[0] });
    }
    pairs.sort((a, b) => compareNames(a.name, b.name));
    issues.sort((a, b) => compareNames(a.name, b.name));
    return { pairs, issues };
  }
  if (typeof module !== 'undefined') module.exports = { pairFiles };
  if (!root.document) return;
  const $ = id => document.getElementById(id);
  let generation = 0, ready = [], busy = false;
  function reset() {
    if (busy) return;
    generation++; ready = [];
    $('loader').removeAttribute('data-batch');
    $('singleImport').hidden = false; $('batchImport').hidden = true;
    $('importTitle').textContent = 'Bring your own card';
    $('importLead').textContent = 'Choose both faces to add a card to your saved collection. Images stay in this browser.';
    $('fileBatch').value = ''; $('batchRows').replaceChildren();
    $('batchStatus').textContent = ''; $('batchChoose').textContent = 'Choose or drop images';
    $('btnBatchSave').disabled = true; $('btnBatchSave').textContent = 'Import cards';
  }
  root.BatchImport = { reset, get busy() { return busy; } };
  $('btnBatchMode').addEventListener('click', () => {
    $('loader').setAttribute('data-batch', 'true');
    $('singleImport').hidden = true; $('batchImport').hidden = false;
    $('importTitle').textContent = 'Import multiple cards';
    $('importLead').textContent = 'Images stay in this browser. Your current route is kept.';
    $('fileBatch').focus();
  });
  $('btnSingleMode').addEventListener('click', () => { reset(); $('cardName').focus(); });
  const plural = n => n === 1 ? 'card' : 'cards';
  function addRow(item, issue) {
    const row = document.createElement('li'), name = document.createElement('span');
    name.className = 'batch-name'; name.textContent = item.name;
    const detail = document.createElement('small'); detail.textContent = issue || 'Front + back';
    name.appendChild(detail); row.appendChild(name);
    for (const side of ['front', 'back']) if (item[side + 'Thumb']) {
      const img = document.createElement('img'); img.src = item[side + 'Thumb']; img.alt = side === 'front' ? 'Front' : 'Back'; row.appendChild(img);
    }
    $('batchRows').appendChild(row);
  }
  async function thumbnail(file) {
    const url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 112;
      canvas.getContext('2d').drawImage(img, 0, 0, 80, 112);
      return canvas.toDataURL('image/jpeg', .7);
    } finally { img.src = ''; URL.revokeObjectURL(url); }
  }
  async function inspect(files) {
    if (busy) return;
    const ticket = ++generation;
    ready = []; $('batchRows').replaceChildren(); $('btnBatchSave').disabled = true;
    $('batchChoose').textContent = 'Choose files again';
    const { pairs, issues } = pairFiles(files);
    for (let i = 0; i < pairs.length; i++) {
      if (ticket !== generation) return;
      $('batchStatus').textContent = `Checking ${i + 1} of ${pairs.length} ${plural(pairs.length)}…`;
      const pair = pairs[i];
      try {
        pair.frontThumb = await thumbnail(pair.front);
        pair.backThumb = await thumbnail(pair.back);
        if (ticket !== generation) return;
        ready.push(pair); addRow(pair);
      } catch {
        issues.push({ name: pair.name, issue: 'Could not read both images' });
      }
    }
    if (ticket !== generation) return;
    $('batchRows').replaceChildren();
    for (const issue of issues) addRow(issue, issue.issue);
    for (const pair of ready) addRow(pair);
    $('batchStatus').textContent = `${ready.length} ${plural(ready.length)} ready` +
      (issues.length ? ` · ${issues.length} need attention. Only ready cards will be imported.` : '. Duplicate images will be skipped.');
    $('btnBatchSave').textContent = `Import ${ready.length} ${plural(ready.length)}`;
    $('btnBatchSave').disabled = !ready.length;
  }
  $('fileBatch').addEventListener('change', e => { if (e.target.files.length) inspect(Array.from(e.target.files)); });
  const drop = $('dropBatch');
  drop.addEventListener('dragover', e => { e.preventDefault(); if (!busy) drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag');
    if (e.dataTransfer.files.length) inspect(Array.from(e.dataTransfer.files));
  });
  async function digest(blob) {
    const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  }
  async function fingerprint(card) { return (await digest(card.front)) + ':' + (await digest(card.back)); }
  $('btnBatchSave').addEventListener('click', async () => {
    if (busy || !ready.length) return;
    busy = true;
    const controls = Array.from($('loader').querySelectorAll('button,input'));
    const disabled = controls.map(el => el.disabled); controls.forEach(el => { el.disabled = true; });
    $('batchImport').setAttribute('aria-busy', 'true');
    $('batchStatus').setAttribute('tabindex', '-1');
    $('batchStatus').focus();
    let imported = 0, skipped = 0; const failed = [];
    try {
      $('batchStatus').textContent = 'Checking saved cards for duplicates…';
      const known = new Set();
      // One card at a time keeps decoded images and original blobs bounded.
      for (const entry of await CardLibrary.list()) {
        const card = await CardLibrary.get(entry.id);
        if (card) known.add(card.fingerprint || await fingerprint(card));
      }
      const createdAt = Date.now();
      for (let i = 0; i < ready.length; i++) {
        const pair = ready[i];
        $('batchStatus').textContent = `Importing ${i + 1} of ${ready.length} ${plural(ready.length)}…`;
        try {
          const key = await fingerprint(pair);
          if (known.has(key)) { skipped++; continue; }
          await CardLibrary.save({ id: crypto.randomUUID(), name: pair.name, front: pair.front, back: pair.back,
            markers: [], thumbnail: pair.frontThumb, fingerprint: key, createdAt });
          known.add(key); imported++;
        } catch { failed.push(pair.name); }
      }
    } catch { failed.push(...ready.map(pair => pair.name)); }
    finally {
      busy = false; controls.forEach((el, i) => { el.disabled = disabled[i]; });
      $('batchImport').removeAttribute('aria-busy');
    }
    await root.MazeUI.openLibrary();
    $('libraryStatus').textContent = `${imported} ${plural(imported)} imported` + (skipped ? ` · ${skipped} duplicates skipped` : '') +
      (failed.length ? ` · ${failed.length} could not be saved: ${failed.join(', ')}. Check browser storage and choose the files again to retry.` : '.');
  });
})(typeof window === 'undefined' ? globalThis : window);
