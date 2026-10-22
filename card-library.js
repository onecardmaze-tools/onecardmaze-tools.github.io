/* Local two-sided card library. No image data leaves IndexedDB. */
(function (root) {
  'use strict';
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ocm-walker', 2);
      request.onupgradeneeded = () => {
        const db = request.result, tx = request.transaction;
        if (!db.objectStoreNames.contains('imgs')) db.createObjectStore('imgs');
        db.createObjectStore('cards', { keyPath: 'id' });
        db.createObjectStore('card-markers');
        // Upgrade the previous single-card cache in the same transaction.
        const old = tx.objectStore('imgs'), values = {};
        let remaining = 3;
        for (const key of ['front', 'back', 'markers']) {
          const r = old.get(key);
          r.onsuccess = () => {
            values[key] = r.result;
            if (--remaining || !values.front || !values.back) return;
            tx.objectStore('cards').put({ id: 'legacy', name: 'Saved card', front: values.front,
              back: values.back, createdAt: Date.now(), thumbnail: '' });
            tx.objectStore('card-markers').put(values.markers || [], 'legacy');
            old.clear();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other tabs of this site, then try again.'));
    });
  }
  async function transaction(mode, run) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['cards', 'card-markers'], mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Card storage unavailable'));
        try { run(tx.objectStore('cards'), tx.objectStore('card-markers'), value => { result = value; }); }
        catch (error) { tx.abort(); reject(error); }
      });
    } finally { db.close(); }
  }
  const api = {
    list: () => transaction('readonly', (cards, markers, done) => {
      const rows = [], r = cards.openCursor();
      r.onsuccess = () => {
        const cursor = r.result;
        if (!cursor) { done(rows.sort((a, b) => b.createdAt - a.createdAt)); return; }
        const { id, name, createdAt, thumbnail } = cursor.value;
        rows.push({ id, name, createdAt, thumbnail }); cursor.continue();
      };
    }),
    get: id => transaction('readonly', (cards, markers, done) => {
      const card = cards.get(id), pins = markers.get(id);
      // Request callbacks run before transaction completion.
      pins.onsuccess = () => done(card.result ? { ...card.result, markers: pins.result || [] } : null);
    }),
    save: card => transaction('readwrite', (cards, markers) => {
      const { markers: pins = [], ...images } = card;
      cards.put(images); markers.put(pins, card.id);
    }),
    saveMarkers: (id, pins) => transaction('readwrite', (cards, markers) => {
      const r = cards.get(id);
      r.onsuccess = () => { if (r.result) markers.put(pins, id); };
    }),
    remove: id => transaction('readwrite', (cards, markers) => { cards.delete(id); markers.delete(id); })
  };
  root.CardLibrary = api;
})(typeof window === 'undefined' ? globalThis : window);
