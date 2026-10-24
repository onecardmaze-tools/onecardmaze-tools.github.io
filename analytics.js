/* First-party, allowlisted Umami transport. No vendor script or stored player identity.
   See ANALYTICS.md for metric definitions, privacy and dashboard operation. */
(function (root) {
  'use strict';
  const WEBSITE = 'fe70e40d-566a-430c-9041-034e890521da'; // Public routing ID, not a secret.
  const HOST = 'onecardmaze-tools.github.io';
  const ENDPOINT = 'https://gateway.umami.is/api/send';
  const IDLE = 30 * 60 * 1000;
  const names = new Set(['play_started', 'play_engaged', 'card_imported',
    'recording_imported', 'recording_exported', 'completion_marked']);
  let disabled = false, storageAvailable = true, lastInput = 0, lastVisit = 0;
  let inputs = 0, seconds = 0, armed = false, sent = new Set(), queue = Promise.resolve();
  let generation = 0, cache, serverDisabled = false;
  try {
    // An owner can exclude a new browser before its first pageview is sent.
    if (new URLSearchParams(root.location.search || '').get('analytics') === 'off')
      root.localStorage.setItem('umami.disabled', '1');
    disabled = !!root.localStorage.getItem('umami.disabled');
  }
  catch { disabled = true; storageAvailable = false; } // Fail closed.
  const production = root.location.protocol === 'https:' && root.location.hostname === HOST;
  const automated = !!root.navigator.webdriver;
  const privacySignal = root.navigator.globalPrivacyControl === true || root.navigator.doNotTrack === '1';
  const version = root.document.querySelector('meta[name="app-version"]')?.content || 'unknown';
  function allowed() { return !!WEBSITE && production && !automated && !privacySignal && !disabled && !serverDisabled; }
  function reset() { sent = new Set(); inputs = seconds = 0; armed = false; cache = undefined; generation++; }
  function send(name, source) {
    if (!allowed()) return;
    // Serialize sends so disabling cancels anything still waiting. No retry loop,
    // offline persistence, unload hooks, or network work in the render loop.
    const epoch = generation;
    queue = queue.then(async () => {
      if (!allowed() || epoch !== generation) return;
      const payload = { website: WEBSITE, hostname: HOST, url: '/', referrer: '',
        title: 'One Card Maze Helper', language: root.navigator.language,
        data: { app_version: version } };
      if (name) payload.name = name;
      if (source === 'practice' || source === 'imported') payload.data.card_source = source;
      const controller = new root.AbortController();
      const timer = root.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await root.fetch(ENDPOINT, { method: 'POST', credentials: 'omit',
          referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json',
            'x-umami-website-id': WEBSITE, 'x-umami-hostname': HOST,
            ...(cache ? { 'x-umami-cache': cache } : {}) },
          body: JSON.stringify({ type: 'event', payload }), keepalive: true, signal: controller.signal });
        if (response.ok) {
          const result = await response.json();
          if (epoch === generation) { cache = result?.cache; serverDisabled = !!result?.disabled; }
        }
      } catch {} // Analytics never interrupts play; blocked requests are expected.
      finally { root.clearTimeout(timer); }
    });
  }
  function visit(now) {
    if (!lastVisit || now - lastVisit >= IDLE) { reset(); send(); }
    lastVisit = now;
  }
  function event(name, source) {
    if (!names.has(name) || !allowed() || root.document.hidden) return;
    visit(Date.now());
    if (sent.has(name)) return;
    sent.add(name); send(name, source);
  }
  function walkInput() {
    if (!allowed() || root.document.hidden) return;
    const now = Date.now(); visit(now); lastInput = now; inputs++; armed = true;
  }
  function moved(dt, source) {
    if (!armed || !allowed() || root.document.hidden) return;
    // Only recent, explicit walking counts. A long unattended destination, replay,
    // idle foreground tab or background time cannot earn the engagement milestone.
    if (Date.now() - lastInput > 30000) { armed = false; return; }
    event('play_started', source);
    seconds += Math.max(0, Math.min(Number(dt) || 0, .1));
    if (seconds >= 60 && inputs >= 5) event('play_engaged', source);
  }
  function renderPreference() {
    const button = root.document.getElementById('btnAnalytics');
    const status = root.document.getElementById('analyticsStatus');
    if (!button || !status) return;
    button.setAttribute('aria-checked', String(!disabled && !privacySignal));
    button.disabled = !storageAvailable || privacySignal;
    status.textContent = privacySignal ? 'Usage statistics are off because of your browser privacy preference.' :
      !storageAvailable ? 'Usage statistics are off because browser storage is unavailable.' :
      disabled ? 'Usage statistics are off in this browser. Your own visits are excluded. Clearing site data resets this preference.' :
      'Turn this off to exclude your own visits in this browser. Clearing site data resets this preference.';
  }
  root.MazeAnalytics = { event, walkInput, moved };
  const button = root.document.getElementById('btnAnalytics');
  button?.addEventListener('click', () => {
    const next = !disabled;
    try {
      if (next) root.localStorage.setItem('umami.disabled', '1');
      else root.localStorage.removeItem('umami.disabled');
      disabled = next; reset(); lastVisit = 0;
      // Enabling applies to future activity; don't backfill excluded actions.
    } catch { disabled = true; storageAvailable = false; }
    renderPreference();
  });
  root.addEventListener('storage', e => {
    if (e.key === 'umami.disabled' || e.key === null) {
      try { disabled = !!root.localStorage.getItem('umami.disabled'); }
      catch { disabled = true; storageAvailable = false; }
      reset(); lastVisit = 0; renderPreference();
    }
  });
  root.document.addEventListener('visibilitychange', () => {
    armed = false;
    if (!root.document.hidden && allowed()) visit(Date.now());
  });
  renderPreference();
  if (!root.document.hidden && allowed()) visit(Date.now());
})(window);
