'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = require('../public/comparison-data.js');

function setup(reducedMotion = true) {
  const ids = new Map(), calls = { animations: [], scrolls: [], requests: 0, observers: [] }, listeners = {};
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.className = ''; this.value = ''; this.hidden = false; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
    get childElementCount() { return this.children.length; }
    append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key]; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, event = {}) { (this.listeners[name] || []).forEach(callback => callback({ preventDefault() {}, ...event })); }
    focus(options) { document.activeElement = this; this.lastFocusOptions = options; }
    scrollIntoView(options) { calls.scrolls.push(options); }
    closest(selector) { return selector === '[hidden]' ? (this.hidden ? this : this.parentNode?.closest(selector)) : null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.className.split(' ').includes(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]); }
    animate(_frames, options) { const animation = { options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } }; calls.animations.push(animation); return animation; }
  }
  const document = { visibilityState: 'visible', activeElement: null,
    getElementById: id => ids.get(id), createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag),
    addEventListener: (event, callback) => { (listeners[event] ||= []).push(callback); } };
  const mount = new Node('div'); mount.id = 'homepage-story';
  const input = new Node('textarea'); input.id = 'initial-query'; input.value = 'My unfinished search';
  const preferences = [];
  const window = {
    matchMedia: () => { const preference = { matches: reducedMotion, callbacks: [], addEventListener(_event, fn) { this.callbacks.push(fn); } }; preferences.push(preference); return preference; },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; calls.observers.push(this); } observe(target) { this.target = target; } disconnect() {} },
    addEventListener() {}, dispatchEvent() {}
  };
  const context = vm.createContext({ document, window, Event, URL, Promise, fetch: () => { calls.requests++; throw Error('Comparison must not send requests'); } });
  for (const file of ['comparison-data.js','comparison.js','walkthrough.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
  return { mount, input, calls, document, window, ids, Node, preferences,
    visibility: value => { document.visibilityState = value; (listeners.visibilitychange || []).forEach(fn => fn()); } };
}
const resultIds = node => node.querySelectorAll('.cmp-result').map(result => result.dataset.consultantId);

test('prepared comparison preserves baseline nodes and actual result order through refinement', () => {
  const h = setup(), baseline = h.mount.querySelectorAll('.cmp-baseline-results')[0], contextual = h.mount.querySelectorAll('.cmp-context-results')[0];
  const original = [...baseline.children];
  assert.deepEqual(resultIds(baseline), data.baseline.results.map(r => r.id));
  assert.deepEqual(resultIds(contextual), data.goal.results.map(r => r.id));
  h.mount.querySelectorAll('.cmp-tab')[1].emit('click');
  assert.deepEqual(resultIds(contextual), data.history.results.map(r => r.id));
  assert.deepEqual(baseline.children, original);
  assert.match(h.mount.textContent, /Physiotherapy hasn’t helped/);
  assert.ok(h.mount.textContent.includes(data.goal.prompt));
  assert.equal(h.mount.querySelectorAll('.cmp-followup')[0].hidden, false);
  assert.equal(h.input.value, 'My unfinished search');
  assert.equal(h.calls.requests, 0); assert.equal(h.calls.animations.length, 0); assert.equal(h.calls.scrolls.length, 0);
});

test('context tabs have one keyboard stop and keep source links attached to the correct record', () => {
  const h = setup(), tabs = h.mount.querySelectorAll('.cmp-tab');
  tabs[0].emit('keydown', { key: 'End' });
  assert.equal(h.document.activeElement, tabs[1]); assert.equal(h.document.activeElement.lastFocusOptions.preventScroll, true);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1);
  tabs[1].emit('keydown', { key: 'ArrowRight' });
  assert.equal(h.document.activeElement, tabs[0]); assert.equal(h.mount.querySelectorAll('.cmp-followup')[0].hidden, true);
  const links = h.mount.querySelectorAll('.cmp-source');
  for (const result of data.goal.results) {
    assert.ok(links.some(link => link.href === result.evidenceUrl)); assert.ok(links.some(link => link.href === result.profileUrl));
    assert.ok(h.mount.textContent.includes(result.evidenceText)); assert.ok(h.mount.textContent.includes(result.reason));
  }
  assert.ok(links.every(link => link.rel === 'noopener noreferrer')); assert.equal(h.calls.requests, 0);
});

test('home and healthcare comparisons maintain independent state and unique accessibility references', () => {
  const h = setup(), second = new h.Node('div');
  h.window.DocMapComparison.mount(second, { idPrefix: 'healthcare-comparison' });
  h.mount.querySelectorAll('.cmp-tab')[1].emit('click');
  assert.deepEqual(resultIds(second.querySelectorAll('.cmp-context-results')[0]), data.goal.results.map(r => r.id));
  const tabs = [...h.mount.querySelectorAll('.cmp-tab'), ...second.querySelectorAll('.cmp-tab')];
  assert.equal(new Set(tabs.map(tab => tab.id)).size, 4);
  for (const tab of tabs) assert.ok(h.ids.has(tab.getAttribute('aria-controls')));
  assert.equal(h.calls.requests, 0);
});

test('only deliberate changes animate and hidden presentations cancel in-flight motion', () => {
  const h = setup(false), target = new h.Node('div');
  const comparison = h.window.DocMapComparison.mount(target, { idPrefix: 'motion-comparison' });
  assert.equal(h.calls.animations.length, 0);
  const tabs = target.querySelectorAll('.cmp-tab'); tabs[1].emit('click');
  assert.deepEqual(h.calls.animations.map(animation => animation.options.duration).sort(), [160, 220]);
  comparison.setVisible(false); assert.ok(h.calls.animations.every(animation => animation.cancelled));
  tabs[0].emit('click'); assert.equal(h.calls.animations.length, 2);
  comparison.setVisible(true); tabs[1].emit('click'); h.visibility('hidden');
  assert.ok(h.calls.animations.every(animation => animation.cancelled)); assert.equal(h.calls.requests, 0);
});

test('reduced-motion changes cancel current animations and show subsequent content immediately', () => {
  const h = setup(false), tabs = h.mount.querySelectorAll('.cmp-tab'); tabs[1].emit('click');
  const count = h.calls.animations.length;
  for (const preference of h.preferences) { preference.matches = true; preference.callbacks.forEach(fn => fn()); }
  assert.ok(h.calls.animations.every(animation => animation.cancelled)); tabs[0].emit('click');
  assert.equal(h.calls.animations.length, count);
  assert.deepEqual(resultIds(h.mount.querySelectorAll('.cmp-context-results')[0]), data.goal.results.map(r => r.id));
});

test('a homepage mounted behind a healthcare deep link can animate after returning home', () => {
  const h = setup(false), landing = new h.Node('section'), target = new h.Node('div');
  landing.hidden = true; landing.append(target);
  h.window.DocMapComparison.mount(target, { idPrefix: 'initially-hidden' });
  const tabs = target.querySelectorAll('.cmp-tab');
  tabs[1].emit('click'); assert.equal(h.calls.animations.length, 0);
  landing.hidden = false;
  tabs[0].emit('click'); assert.equal(h.calls.animations.length, 2);
  assert.equal(h.calls.requests, 0);
});

test('Try your own search focuses the existing input without replacing or submitting a draft', () => {
  const h = setup(); h.mount.querySelectorAll('.wt-try')[0].emit('click');
  assert.equal(h.input.value, 'My unfinished search'); assert.equal(h.document.activeElement, h.input); assert.equal(h.calls.requests, 0);
  assert.equal(h.mount.querySelectorAll('.wt-healthcare-link')[0].href, '/for-healthcare-teams');
  assert.match(h.mount.textContent, /The details change who you consider/); assert.doesNotMatch(h.mount.textContent, /Stage 3|excision|Remember what matters/);
});
