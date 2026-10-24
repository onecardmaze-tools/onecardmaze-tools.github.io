'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../analytics.js'), 'utf8')
  .replace(/const WEBSITE = '[^']*';/, "const WEBSITE = 'test-website';");
function setup(options = {}) {
  const requests = [], listeners = {}, store = new Map(options.disabled ? [['umami.disabled', '1']] : []);
  let now = 100000;
  const button = { setAttribute(k,v) { this[k] = v; }, addEventListener(k,fn) { listeners['button:'+k] = fn; } };
  const status = {};
  const root = { location: { protocol: 'https:', hostname: 'onecardmaze-tools.github.io', ...options.location },
    navigator: { language: 'en', ...options.navigator }, AbortController, setTimeout, clearTimeout,
    document: { hidden: false, querySelector: () => ({content:'test-version'}),
      getElementById: id => id === 'btnAnalytics' ? button : status,
      addEventListener: (k,fn) => listeners[k] = fn },
    addEventListener: (k,fn) => listeners[k] = fn,
    localStorage: {getItem(k) { if(options.storageBlocked) throw Error(); return store.get(k); },
      setItem(k,v) {store.set(k,v);}, removeItem(k) {store.delete(k);} },
    fetch: async (url, opts) => { requests.push({url, opts, ...JSON.parse(opts.body)});
      if(options.failNetwork) throw Error('offline');
      return {ok:true,json:async()=>({cache:'memory-only-cache'})}; } };
  vm.runInNewContext(source, {window:root, Date:{now:()=>now}, Set, Promise, Number, Math, JSON, URLSearchParams});
  return {root, api:root.MazeAnalytics, requests, listeners, button, store, advance:n=>now+=n,
    drain:async()=>{for(let i=0;i<30;i++) await Promise.resolve();}};
}
(async()=>{
  for (const opts of [{disabled:true},{location:{search:'?analytics=off'}},{storageBlocked:true},{navigator:{webdriver:true}},
    {navigator:{globalPrivacyControl:true}},{navigator:{doNotTrack:'1'}},
    {location:{hostname:'localhost'}},{location:{hostname:'preview.example'}},{location:{protocol:'http:'}}]) {
    const t=setup(opts);t.api.walkInput();t.api.moved(1,'practice');t.api.event('card_imported');await t.drain();
    assert.equal(t.requests.length,0,JSON.stringify(opts));
  }
  const t=setup();await t.drain();assert.equal(t.requests.length,1);
  assert(!t.requests[0].payload.name);
  // Merely restoring or placing a walker cannot earn a play event.
  t.api.moved(1,'practice');await t.drain();assert.equal(t.requests.length,1);
  t.api.walkInput();t.api.moved(.05,'practice');await t.drain();
  assert.equal(t.requests[1].payload.name,'play_started');
  assert.equal(t.requests[1].opts.headers['x-umami-cache'],'memory-only-cache');
  for(let i=0;i<700;i++) { if(i%100===0)t.api.walkInput();t.advance(100);t.api.moved(.1,'practice'); }
  await t.drain();assert.equal(t.requests.filter(r=>r.payload.name==='play_engaged').length,1);
  t.api.event('completion_marked');t.api.event('completion_marked');t.api.event('arbitrary-private-data');
  await t.drain();assert.equal(t.requests.filter(r=>r.payload.name==='completion_marked').length,1);
  for(const r of t.requests) {
    assert.equal(r.payload.url,'/');assert.equal(r.payload.referrer,'');
    assert.deepEqual(Object.keys(r.payload.data).sort(),r.payload.data.card_source?['app_version','card_source']:['app_version']);
    assert.equal(r.opts.credentials,'omit');assert.equal(r.opts.referrerPolicy,'no-referrer');
    assert(!('id' in r.payload));assert(!('screen' in r.payload));
  }
  const before=t.requests.length;t.listeners['button:click']();t.api.event('card_imported');await t.drain();
  assert.equal(t.requests.length,before);assert.equal(t.button['aria-checked'],'false');assert(t.store.has('umami.disabled'));
  t.listeners['button:click']();t.api.event('card_imported');await t.drain();
  assert.equal(t.requests.length,before+2); // New visit and future event only.
  const shared=setup({location:{search:'?analytics=off'}});await shared.drain();
  shared.store.delete('umami.disabled');shared.listeners.storage({key:'umami.disabled'});
  assert.equal(shared.button['aria-checked'],'true','cross-tab opt-in is not overridden by a stale exclusion URL');
  shared.store.set('umami.disabled','1');shared.listeners.storage({key:'umami.disabled'});
  shared.api.event('card_imported');await shared.drain();assert.equal(shared.requests.length,0);
  const queued=setup();queued.listeners['button:click']();queued.listeners['button:click']();await queued.drain();
  assert.equal(queued.requests.length,0,'opt-out invalidates queued sends even if re-enabled');
  const hidden=setup();await hidden.drain();hidden.root.document.hidden=true;
  hidden.api.walkInput();hidden.api.moved(10,'practice');hidden.api.event('card_imported');await hidden.drain();assert.equal(hidden.requests.length,1);
  const idle=setup();idle.api.walkInput();idle.advance(31000);idle.api.moved(1000,'practice');await idle.drain();
  assert.equal(idle.requests.length,1,'unattended movement is excluded');
  idle.advance(30*60*1000);idle.api.walkInput();idle.api.moved(.1,'imported');await idle.drain();
  assert.equal(idle.requests.length,3,'idle visit restarts milestones');
  const offline=setup({failNetwork:true});offline.api.event('card_imported');await offline.drain();
  assert.equal(offline.requests.length,2,'failure does not block next event');
  console.log('PASS: analytics excludes self, QA, privacy signals and previews; limits payloads; measures walking; deduplicates milestones; fails quietly');
})().catch(e=>{console.error(e);process.exitCode=1;});
