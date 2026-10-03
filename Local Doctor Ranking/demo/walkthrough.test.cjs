const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/walkthrough.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const scenarios = vm.runInNewContext(`${app.split('// DEMO_SCENARIOS_START')[1].split('// DEMO_SCENARIOS_END')[0].replace(/^[^\n]*\n/, '')}\ndemoScenarios;`);

function setup(reducedMotion = true) {
  const ids = new Map();
  const calls = { animations: [], scrolls: [], requests: 0 };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.className = ''; this.value = ''; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key]; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, event = {}) { (this.listeners[name] || []).forEach(callback => callback({ preventDefault() {}, ...event })); }
    focus() { document.activeElement = this; }
    scrollIntoView(options) { calls.scrolls.push(options); }
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
    visibilityState: 'visible', activeElement: null,
    getElementById: id => ids.get(id), createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag),
    addEventListener: (event, callback) => { listeners[event] = callback; }
  };
  const mount = new Node('div'); mount.id = 'homepage-story';
  const input = new Node('textarea'); input.id = 'initial-query'; input.value = 'My unfinished search';
  let intersection;
  const window = {
    DocMapScenarios: scenarios,
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} }
  };
  vm.runInNewContext(source, { document, window, Promise, fetch: () => { calls.requests++; throw Error('Walkthrough must not send requests'); } });
  return { mount, input, calls, document, window, listeners, intersection: visible => intersection([{ isIntersecting: visible }]) };
}

test('walkthrough navigation and replay never submit a search or overwrite the patient draft', () => {
  const { mount, input, calls, document, intersection } = setup();
  intersection(true);
  const tabs = mount.querySelectorAll('.wt-tab');
  assert.equal(tabs.length, 3);
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].emit('click');
    const story = scenarios.find(item => item.id === ['runner', 'symptoms', 'procedure'][i]);
    story.prompts.forEach(prompt => assert.ok(mount.textContent.includes(prompt)));
    assert.equal(tabs[i].getAttribute('aria-selected'), 'true');
    assert.equal(tabs[i].tabIndex, 0);
    assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1);
    const evidence = mount.querySelectorAll('.wt-evidence')[0];
    const supportingLink = mount.querySelectorAll('.wt-source')[0];
    assert.equal(supportingLink.href, `/sources/${evidence.dataset.evidenceId}`);
    assert.equal(supportingLink.textContent, 'View supporting record');
  }
  mount.querySelectorAll('.wt-replay')[0].emit('click');
  mount.querySelectorAll('.wt-try')[0].emit('click');
  assert.equal(input.value, 'My unfinished search');
  assert.equal(document.activeElement, input);
  assert.equal(calls.scrolls[0].behavior, 'auto');
  assert.equal(calls.requests, 0);
  assert.equal(calls.animations.length, 0, 'reduced motion shows all content immediately');
  assert.match(mount.textContent, /Example walkthrough/);
  assert.match(mount.textContent, /Outcomes to evaluate with your team in a pilot/);
  assert.match(mount.textContent, /stage 3 disease still needs to be confirmed/);
});

test('walkthrough keyboard selection has one tab stop and pauses motion when hidden', () => {
  const { mount, document, window, calls, listeners, intersection } = setup(false);
  intersection(true);
  assert.equal(calls.animations.length, 4);
  const tabs = mount.querySelectorAll('.wt-tab');
  tabs[0].emit('keydown', { key: 'End' });
  assert.equal(document.activeElement, tabs[2]);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  tabs[2].emit('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, tabs[0]);
  window.DocMapWalkthrough.pause();
  assert.ok(calls.animations.every(animation => animation.cancelled));
  mount.querySelectorAll('.wt-replay')[0].emit('click');
  document.visibilityState = 'hidden'; listeners.visibilitychange();
  assert.ok(calls.animations.every(animation => animation.cancelled));
  const before = calls.animations.length;
  mount.querySelectorAll('.wt-replay')[0].emit('click');
  assert.equal(calls.animations.length, before);
});
