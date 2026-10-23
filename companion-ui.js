/* Companion UI: intro, import, Tools sheet and panel plumbing.
   The game engine (index.html) owns modes and route safety; this file only
   opens and closes surfaces. Rules live in DESIGN-SYSTEM.md. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = window.OCM;
  if (!app) return;
  const intro = $('help'), loader = $('loader'), library = $('cardLibrary'), menu = $('moreMenu');
  const sheets = ['moreMenu', 'markerPanel', 'sessionPanel'];
  const opener = { moreMenu: 'btnMore', markerPanel: 'btnMarkers', sessionPanel: 'btnSession' };
  let importFocus = null;
  if (window.matchMedia('(max-width:520px)').matches) $('introStory').open = false;

  /* One sheet at a time. Opening one closes the others; closing returns focus. */
  function closeSheet(id, refocus) {
    const el = $(id); if (el.hidden) return false;
    el.hidden = true; $(opener[id]).setAttribute('aria-expanded', 'false');
    if (id === 'markerPanel' && !app.S.placingMarker) app.setMarkerMode(false);
    if (refocus) $(id === 'moreMenu' ? 'btnMore' : 'btnMore').focus();
    return true;
  }
  function closeAll(refocus) { let any = false; for (const id of sheets) any = closeSheet(id, false) || any; if (any && refocus) $('btnMore').focus(); return any; }
  function openSheet(id, focusId) {
    for (const other of sheets) if (other !== id) closeSheet(other, false);
    const el = $(id); el.hidden = false; $(opener[id]).setAttribute('aria-expanded', 'true');
    app.S.play = 0; app.syncTimeline();
    const f = focusId && $(focusId); (f || el.querySelector('button,select,input')).focus({ preventScroll: true });
  }
  const closeMenu = () => closeSheet('moreMenu', false);
  // Sheet visibility drives the shared backdrop (phones) without each caller knowing.
  const sync = () => app.syncSheets();
  const obs = new MutationObserver(sync);
  for (const id of sheets) obs.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  $('sheetBackdrop').addEventListener('click', () => closeAll(true));

  function openImport() {
    if (intro.open) intro.close();
    closeAll(false);
    app.S.play = 0; app.S.undoHeld = false; app.S.walker.tx = app.S.walker.ty = null;
    app.syncTimeline();
    importFocus = document.activeElement;
    library.classList.add('hidden');
    app.prepareImport();
    window.BatchImport.reset();
    loader.classList.remove('hidden');
    $('hud').inert = true; $('stage').inert = true;
    $('cardName').focus();
  }
  function closeImport() {
    if (window.BatchImport.busy) return;
    window.BatchImport.reset();
    loader.classList.add('hidden');
    $('hud').inert = false; $('stage').inert = false;
    (importFocus?.isConnected && importFocus.getClientRects().length ? importFocus : $('btnMore')).focus();
  }
  async function openLibrary() {
    if (window.BatchImport.busy) return;
    window.BatchImport.reset();
    if (intro.open) intro.close();
    closeAll(false);
    importFocus = document.activeElement;
    loader.classList.add('hidden'); library.classList.remove('hidden');
    app.S.play = 0; app.S.undoHeld = false; app.S.walker.tx = app.S.walker.ty = null;
    app.syncTimeline();
    $('hud').inert = true; $('stage').inert = true;
    $('cardSearch').value = '';
    $('btnLibraryImport').focus();
    await app.refreshSavedCards();
    if (!library.classList.contains('hidden'))
      (library.querySelector('.saved-card-play') || $('btnLibraryImport')).focus();
  }
  function closeLibrary() {
    library.classList.add('hidden');
    $('hud').inert = false; $('stage').inert = false;
    $('btnMore').focus();
  }
  window.MazeUI = { openImport, closeImport, closeAll, openLibrary, closeLibrary };
  $('btnCards').addEventListener('click', openLibrary);
  $('btnLibraryClose').addEventListener('click', closeLibrary);
  $('btnSavedFromImport').addEventListener('click', openLibrary);
  $('btnLibraryImport').addEventListener('click', () => {
    openImport();
  });
  $('btnLibraryPractice').addEventListener('click', () => {
    closeLibrary(); app.guardRoute('Switch card', () => app.loadDemo(true));
  });
  $('btnLoaderClose').addEventListener('click', closeImport);
  $('btnDemo').addEventListener('click', closeImport);
  $('btnImportWelcome').addEventListener('click', () => { closeImport(); openSheet('sessionPanel', 'btnImportSession'); });
  $('btnIntroImport').addEventListener('click', openImport);
  $('btnIntroDemo').addEventListener('click', () => {
    // On first entry the demo is already underneath the introduction.
    if (!app.S.demo) app.loadDemo(true);
    intro.close();
  });

  // Tools sheet
  $('btnMore').addEventListener('click', () => {
    if (!menu.hidden) { closeMenu(); return; }
    openSheet('moreMenu', 'btnSession');
  });
  $('btnMoreClose').addEventListener('click', () => closeSheet('moreMenu', true));
  // Engine handlers toggle these panels; make them sheets that replace Tools.
  $('btnMarkers').addEventListener('click', () => {
    closeMenu();
    if (!$('markerPanel').hidden) { for (const id of ['sessionPanel']) closeSheet(id, false); $('markerShape').focus(); }
  });
  $('btnSession').addEventListener('click', () => {
    closeMenu();
    if (!$('sessionPanel').hidden) { closeSheet('markerPanel', false); $('btnExportSession').focus(); }
  });
  $('btnMarkersClose').addEventListener('click', () => $('btnMore').focus());
  $('btnSessionClose').addEventListener('click', () => $('btnMore').focus());
  $('btnReset').addEventListener('click', closeMenu);
  $('btnAboutFromTools').addEventListener('click', () => { closeMenu(); intro.showModal(); });
  // Save the current card before switching; guard unsaved routes if storage fails.
  $('btnPractice').addEventListener('click', () => {
    closeMenu();
    app.guardRoute('Switch card', () => app.loadDemo(true));
  });
  $('btnUpload').addEventListener('click', () => {
    closeMenu();
    openImport();
  });

  // Upload/recording completion may close the existing loader from the engine.
  const observer = new MutationObserver(() => {
    if (loader.classList.contains('hidden') && library.classList.contains('hidden')) {
      $('hud').inert = false; $('stage').inert = false;
    }
  });
  observer.observe(loader, { attributes: true, attributeFilter: ['class'] });
  // File inputs remain native and keyboard reachable through the image slots.
  for (const side of ['Front', 'Back']) {
    const input = $('file' + side), label = $('drop' + side);
    input.hidden = false;
    input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:3';
    label.setAttribute('aria-label', side + ' card image');
  }
  // Desktop popovers close on an outside press; phone sheets use the backdrop.
  document.addEventListener('pointerdown', e => {
    if (menu.hidden || menu.contains(e.target) || $('btnMore').contains(e.target)) return;
    if (e.target === $('sheetBackdrop')) return;
    closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close the top-most surface only; the engine handles Esc for modes.
      if (!library.classList.contains('hidden')) { closeLibrary(); e.stopPropagation(); return; }
      if (!loader.classList.contains('hidden')) { closeImport(); e.stopPropagation(); return; }
      if (closeAll(true)) { e.stopPropagation(); return; }
    }
    const modal = !library.classList.contains('hidden') ? library : !loader.classList.contains('hidden') ? loader : null;
    if (e.key !== 'Tab' || !modal) return;
    if (window.BatchImport.busy) { e.preventDefault(); return; }
    const focusable = Array.from(modal.querySelectorAll('button,input,a,[tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  intro.addEventListener('close', () => {
    const target = document.body.getAttribute('data-route') === '1' ? $('btnReplay') : $('btnSpinR');
    (target && target.getClientRects().length ? target : $('btnHelp')).focus({ preventScroll: true });
  });
  // ?demo remains an explicit quick-open route, including benchmark fixtures.
  if (!new URLSearchParams(location.search).has('demo')) {
    app.startup.then(saved => { if (saved) openLibrary(); else if (!intro.open) intro.showModal(); });
  }
})();
