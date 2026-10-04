const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/healthcare.js'), 'utf8');

function presentation(reducedMotion = false) {
  const ids = new Map();
  const calls = { animations: [], requests: 0, events: [] };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ''; this.hidden = false; this.open = false; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
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
    animate() {
      const animation = { cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
      calls.animations.push(animation); return animation;
    }
  }
  const listeners = {};
  const document = {
    visibilityState: 'visible',
    getElementById: id => ids.get(id), createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag),
    createTextNode: text => { const result = new Node('#text'); result.textContent = text; return result; },
    addEventListener: (event, callback) => { listeners[event] = callback; }
  };
  const mount = new Node('div'); mount.id = 'healthcare-view'; mount.hidden = true;
  let intersection;
  const window = {
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
    dispatchEvent: event => calls.events.push(event.type)
  };
  vm.runInNewContext(source, { document, window, Event, Promise, fetch: () => { calls.requests++; throw Error('Presentation must not send requests'); } });
  return { mount, calls, document, window, ids, listeners, intersection: visible => intersection([{ isIntersecting: visible }]) };
}

test('healthcare proof is prepared and source-linked, with a collapsed prospective pilot and no requests', () => {
  const { mount, calls, window, ids, intersection } = presentation(true);
  assert.deepEqual(calls.events, ['docmap:healthcare-ready']);
  assert.equal(calls.animations.length, 0);
  mount.hidden = false; window.DocMapHealthcare.setVisible(true); intersection(true);
  const replay = mount.querySelectorAll('.hc-replay')[0]; replay.emit('click');
  assert.equal(calls.animations.length, 0, 'reduced motion retains immediate readable content');
  assert.match(mount.textContent, /Prepared demonstration/);
  assert.match(mount.textContent, /does not verify stage-specific expertise/);
  assert.match(mount.textContent, /Prospective measures for a pilot/);
  assert.equal(ids.get('healthcare-pilot').open, false);
  assert.equal(mount.querySelectorAll('.hc-measure').length, 3);
  const links = mount.querySelectorAll('.hc-source');
  assert.ok(links.some(link => link.href === '/sources/supabase-c-6050076' && link.textContent === 'View supporting record'));
  assert.equal(mount.querySelectorAll('.hc-record-excerpt')[0].textContent, 'Laparoscopic excision of endometriosis, +/-ureterolysis');
  assert.equal(ids.get('healthcare-return').href, '/');
  assert.equal(calls.requests, 0);
});

test('healthcare reveal plays once when visible, can replay, and stops when route or document is hidden', () => {
  const { mount, calls, document, window, listeners, intersection } = presentation();
  intersection(true);
  assert.equal(calls.animations.length, 0, 'a hidden route cannot animate');
  mount.hidden = false; window.DocMapHealthcare.setVisible(true);
  assert.equal(calls.animations.length, 4);
  window.DocMapHealthcare.setVisible(false); mount.hidden = true;
  assert.ok(calls.animations.every(animation => animation.cancelled));
  mount.hidden = false; window.DocMapHealthcare.setVisible(true); intersection(true);
  assert.equal(calls.animations.length, 4, 'returning does not restart the reveal');
  mount.querySelectorAll('.hc-replay')[0].emit('click');
  assert.equal(calls.animations.length, 8);
  document.visibilityState = 'hidden'; listeners.visibilitychange();
  assert.ok(calls.animations.every(animation => animation.cancelled));
  mount.querySelectorAll('.hc-replay')[0].emit('click');
  assert.equal(calls.animations.length, 8);
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
  for (const asset of ['/healthcare.js', '/healthcare.css']) {
    const file = await fetch(origin + asset);
    assert.equal(file.status, 200, asset);
    assert.ok((await file.text()).length > 100);
  }
  assert.equal(searches, 0);
});
