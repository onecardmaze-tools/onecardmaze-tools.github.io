/* Quiet companion UI. The game engine remains in index.html. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = window.OCM;
  if (!app) return;
  const intro = $('help'), loader = $('loader'), menu = $('moreMenu');
  let importFocus = null;
  if (window.matchMedia('(max-width:520px)').matches) $('introStory').open = false;
  function closeMenu() { menu.hidden = true; $('btnMore').setAttribute('aria-expanded', 'false'); }
  function openImport() {
    if (intro.open) intro.close();
    closeMenu();
    app.S.play = 0; app.S.undoHeld = false; app.S.walker.tx = app.S.walker.ty = null;
    app.syncTimeline();
    importFocus = document.activeElement;
    loader.classList.remove('hidden');
    $('hud').inert = true; $('stage').inert = true;
    $('btnLoaderClose').focus();
  }
  function closeImport() {
    loader.classList.add('hidden');
    $('hud').inert = false; $('stage').inert = false;
    (importFocus?.isConnected && importFocus.getClientRects().length ? importFocus : $('btnMore')).focus();
  }
  window.MazeUI = { openImport };
  $('btnLoaderClose').addEventListener('click', closeImport);
  $('btnStart').addEventListener('click', closeImport);
  $('btnDemo').addEventListener('click', closeImport);
  $('btnIntroImport').addEventListener('click', openImport);
  $('btnIntroDemo').addEventListener('click', () => {
    // On first entry the demo is already underneath the introduction.
    if (!app.S.demo) app.loadDemo(true);
    intro.close();
  });
  $('btnPractice').addEventListener('click', () => { app.loadDemo(true); closeMenu(); });
  $('btnMore').addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    $('btnMore').setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) $('btnUpload').focus();
  });
  for (const id of ['btnMarkers', 'btnSession', 'btnFit', 'btnReset']) $(id).addEventListener('click', closeMenu);
  // Upload/recording completion may close the existing loader from the engine.
  const observer = new MutationObserver(() => {
    if (loader.classList.contains('hidden')) {
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
  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !menu.contains(e.target) && !$('btnMore').contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const menuWasOpen = !menu.hidden;
      closeMenu();
      if (menuWasOpen) $('btnMore').focus();
      if (!loader.classList.contains('hidden')) closeImport();
      for (const id of ['sessionPanel', 'markerPanel']) $(id).hidden = true;
    }
    if (e.key !== 'Tab' || loader.classList.contains('hidden')) return;
    const focusable = Array.from(loader.querySelectorAll('button,input,a')).filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  intro.addEventListener('close', () => $('btnHelp').focus());
  // ?demo remains an explicit quick-open route, including benchmark fixtures.
  if (!new URLSearchParams(location.search).has('demo')) intro.showModal();
})();
