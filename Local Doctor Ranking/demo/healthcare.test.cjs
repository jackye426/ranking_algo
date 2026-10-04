const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/healthcare.js'), 'utf8');

function presentation({ rendererPresent = true, rendererReady = true, realComparison = false } = {}) {
  const ids = new Map();
  const calls = { mounts: [], visibility: [], pauses: 0, requests: 0, events: [] };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ''; this.hidden = false; this.open = false; this.dataset = {}; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
    get childElementCount() { return this.children.length; }
    focus() {}
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name) { (this.listeners[name] || []).forEach(callback => callback()); }
    closest(selector) { return selector === '[hidden]' ? (this.hidden ? this : this.parentNode?.closest(selector)) : null; }
    querySelectorAll(selector) {
      const result = [];
      for (const child of this.children) {
        if (child.className.split(' ').includes(selector.slice(1))) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const listeners = {};
  const document = {
    visibilityState: 'visible',
    getElementById: id => ids.get(id), createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag),
    createTextNode: text => { const result = new Node('#text'); result.textContent = text; return result; },
    addEventListener: (event, callback) => { listeners[event] = callback; }
  };
  const mount = new Node('div'); mount.id = 'healthcare-view'; mount.hidden = true;
  const windowListeners = {};
  const renderer = {
    mount(container, options) {
      calls.mounts.push({ container, options });
      if (!rendererReady) return null;
      const prepared = new Node('div'); prepared.className = 'shared-comparison';
      prepared.textContent = 'Prepared verified knee comparison: baseline, running goal, treatment history.'; container.replaceChildren(prepared);
      return { setVisible: value => calls.visibility.push(value), pause: () => { calls.pauses++; } };
    }
  };
  const window = {
    DocMapComparison: rendererPresent ? renderer : undefined,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener: (event, callback) => { windowListeners[event] = callback; },
    dispatchEvent: event => calls.events.push(event.type)
  };
  const context = vm.createContext({ document, window, Event, Promise, URL, fetch: () => { calls.requests++; throw Error('Presentation must not send requests'); } });
  if (realComparison) for (const file of ['comparison-data.js', 'comparison.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
  vm.runInContext(source, context);
  return { mount, calls, document, window, ids, listeners, windowListeners,
    installRenderer: () => { window.DocMapComparison = renderer; }, setRendererReady: value => { rendererReady = value; } };
}

test('healthcare uses the shared prepared comparison, fair copy and a collapsed prospective pilot without requests', () => {
  const { mount, calls, ids } = presentation();
  assert.deepEqual(calls.events, ['docmap:healthcare-ready']);
  assert.equal(calls.mounts.length, 1); assert.equal(calls.mounts[0].container, ids.get('healthcare-comparison'));
  assert.equal(calls.mounts[0].options.idPrefix, 'healthcare-story'); assert.equal(ids.get('healthcare-comparison').attrs['aria-busy'], 'false');
  assert.equal(ids.get('healthcare-title').textContent, 'Help patients choose who to contact.');
  assert.equal(ids.get('healthcare-title').tabIndex, -1);
  assert.match(mount.textContent, /A list of knee specialists still leaves a patient deciding who is relevant to them/);
  assert.match(mount.textContent, /Name, condition and procedure searches help patients find a starting list/);
  assert.match(mount.textContent, /Prepared verified knee comparison/);
  assert.doesNotMatch(mount.textContent, /endometriosis|excision|stage 3|%|proven results/i);
  assert.equal(mount.querySelectorAll('.hc-value').length, 3);
  assert.match(mount.textContent, /Turn Spire’s expertise into a reason to enquire\./);
  assert.match(mount.textContent, /A pilot would test whether that leads to more informed enquiries and fewer abandoned searches\./);
  assert.match(mount.textContent, /Surface the expertise already there\./); assert.match(mount.textContent, /Explain why this consultant\./); assert.match(mount.textContent, /Give the enquiry a starting point\./);
  assert.match(mount.textContent, /Compare equivalent patient scenarios/); assert.match(mount.textContent, /clinical review/);
  assert.match(mount.textContent, /prospective pilot measures, not claimed results/);
  assert.equal(ids.get('healthcare-pilot').open, false);
  assert.equal(mount.querySelectorAll('.hc-measure').length, 4);
  assert.match(mount.textContent, /Time to a useful shortlist/); assert.match(mount.textContent, /Enquiries and booking starts/); assert.match(mount.textContent, /Search abandonment/);
  assert.equal(ids.get('healthcare-return').href, '/');
  assert.equal(calls.requests, 0);
});

test('healthcare route and document visibility reach the same mounted comparison without resetting its state', () => {
  const { mount, calls, document, window, listeners, ids } = presentation();
  assert.deepEqual(calls.visibility, [false]); window.DocMapHealthcare.setVisible(true);
  assert.equal(calls.visibility.at(-1), false, 'a hidden route cannot animate even if a caller asks to show its instance');
  mount.hidden = false; window.DocMapHealthcare.setVisible(true);
  assert.equal(calls.visibility.at(-1), true);
  const comparison = ids.get('healthcare-comparison').children[0]; ids.get('healthcare-pilot').open = true;
  window.DocMapHealthcare.setVisible(false); mount.hidden = true;
  assert.equal(calls.visibility.at(-1), false);
  mount.hidden = false; window.DocMapHealthcare.setVisible(true);
  assert.equal(calls.visibility.at(-1), true); assert.equal(calls.mounts.length, 1); assert.equal(ids.get('healthcare-comparison').children[0], comparison); assert.equal(ids.get('healthcare-pilot').open, true);
  document.visibilityState = 'hidden'; listeners.visibilitychange();
  assert.equal(calls.visibility.at(-1), false); document.visibilityState = 'visible'; listeners.visibilitychange(); assert.equal(calls.visibility.at(-1), true);
  window.DocMapHealthcare.pause(); assert.equal(calls.pauses, 1);
  assert.equal(calls.requests, 0);
});

test('a visible healthcare deep link connects when the shared renderer becomes available', () => {
  const { mount, calls, window, ids, windowListeners, installRenderer } = presentation({ rendererPresent: false });
  mount.hidden = false; window.DocMapHealthcare.setVisible(true); assert.equal(calls.mounts.length, 0); assert.equal(ids.get('healthcare-comparison').attrs['aria-busy'], 'true');
  installRenderer(); windowListeners['docmap:comparison-ready']();
  assert.equal(calls.mounts.length, 1); assert.equal(calls.visibility.at(-1), true); assert.equal(ids.get('healthcare-comparison').attrs['aria-busy'], 'false');
  assert.doesNotMatch(ids.get('healthcare-comparison').textContent, /Loading/); assert.equal(calls.requests, 0);
});

test('a missing shared-data mount can retry without duplicating the prepared component', () => {
  const { calls, window, ids, windowListeners, setRendererReady } = presentation({ rendererReady: false });
  assert.equal(calls.mounts.length, 1); assert.equal(ids.get('healthcare-comparison').attrs['aria-busy'], 'true');
  setRendererReady(true); windowListeners['docmap:comparison-ready'](); window.DocMapHealthcare.setVisible(false);
  assert.equal(calls.mounts.length, 2); assert.equal(ids.get('healthcare-comparison').children.length, 1); assert.equal(ids.get('healthcare-comparison').attrs['aria-busy'], 'false');
});

test('the actual shared verified comparison mounts on healthcare and keeps its refinement across route changes', () => {
  const { mount, calls, window, ids } = presentation({ realComparison: true });
  const data = window.DocMapComparisonData, comparison = ids.get('healthcare-comparison');
  assert.equal(comparison.attrs['aria-busy'], 'false'); assert.equal(comparison.querySelectorAll('.cmp-result').length, 6);
  const baseline = comparison.querySelector('.cmp-baseline-results').children.slice();
  assert.deepEqual(baseline.map(card => card.dataset.consultantId), Array.from(data.baseline.results.slice(0, 3), record => record.id));
  assert.equal(ids.get('healthcare-story-context-panel').dataset.state, 'goal');
  mount.hidden = false; window.DocMapHealthcare.setVisible(true); ids.get('healthcare-story-tab-history').emit('click');
  assert.equal(ids.get('healthcare-story-context-panel').dataset.state, 'history');
  assert.deepEqual(comparison.querySelector('.cmp-context-results').children.map(card => card.dataset.consultantId), Array.from(data.history.results.slice(0, 3), record => record.id));
  assert.match(comparison.textContent, /Your running goal stays/); assert.match(comparison.textContent, /Adding previous physiotherapy brings Mark Ridgewell first/);
  assert.ok(comparison.querySelectorAll('.cmp-source').some(link => link.href === data.history.results[0].evidenceUrl));
  window.DocMapHealthcare.setVisible(false); mount.hidden = true; mount.hidden = false; window.DocMapHealthcare.setVisible(true);
  assert.equal(ids.get('healthcare-story-context-panel').dataset.state, 'history'); assert.deepEqual(comparison.querySelector('.cmp-baseline-results').children, baseline);
  assert.equal(calls.requests, 0);
});

test('healthcare deep link serves the shell and static assets without requiring search readiness', async t => {
  const { createApp } = require('./server.cjs');
  let searches = 0;
  const engine = { ready: false, health: () => ({ ready: false }), search: () => { searches++; throw Error('Unexpected search'); } };
  const offline = Object.assign(async () => { throw Error('Unexpected AI call'); }, { configured: false });
  const app = createApp(engine, { explainMatch: offline, interpretQuery: offline });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/for-healthcare-teams`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const shell = await response.text();
  assert.match(shell, /<html lang="en" data-entry="healthcare">/);
  assert.match(shell, /id="landing"/);
  const home = await fetch(origin);
  assert.doesNotMatch(await home.text(), /data-entry="healthcare"/);
  for (const asset of ['/healthcare.js', '/healthcare.css', '/comparison.js', '/comparison.css', '/comparison-data.js']) {
    const file = await fetch(origin + asset);
    assert.equal(file.status, 200, asset);
    assert.ok((await file.text()).length > 100);
  }
  assert.equal(searches, 0);
});
