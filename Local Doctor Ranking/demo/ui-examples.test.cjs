const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createQueryInterpreter } = require('./query-interpreter.cjs');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const queries = [...html.matchAll(/data-query="([^"]+)"/g)].map((match) => match[1]);

test('patient-language examples preserve symptoms and goals without inventing a diagnosis or procedure', async () => {
  assert.equal(queries.length, 3);
  const interpret = createQueryInterpreter({ client: null });
  const parsed = await Promise.all(queries.map((message) => interpret({ message })));
  assert.ok(parsed.every((result) => !result.clarifications?.length));
  assert.equal(parsed[0].criteria.topic, 'knee pain'); assert.deepEqual(parsed[0].criteria.procedures, []);
  assert.match(parsed[0].criteria.clinicalContext, /running|runner/i);
  assert.equal(parsed[1].criteria.topic, 'endometriosis');
  assert.deepEqual(parsed[1].criteria.procedures, ['Endometriosis excision']);
  assert.equal(parsed[1].criteria.clinicalContext, 'Stage 3 endometriosis');
  assert.equal(parsed[1].criteria.stage, undefined, 'stage remains patient context, not a verified consultant filter');
  assert.equal(parsed[2].criteria.topic, 'painful periods'); assert.deepEqual(parsed[2].criteria.procedures, []);
  assert.match(parsed[2].criteria.clinicalContext, /haven.t been diagnosed|not.*diagnos/i);
  for (const result of parsed) { assert.equal(result.criteria.specialty, null); assert.equal(result.criteria.location, null); assert.equal(result.criteria.insurance, null); }
  assert.ok(queries.every((query) => !/available|tomorrow|best|expert/i.test(query)));
});

test('animated examples hold long enough, cycle the clickable queries and never replace typed input', () => {
  const eventTarget = (initial = {}) => ({ ...initial, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, emit(name) { this.listeners[name]?.(); } });
  const input = eventTarget({ value: '' }); const text = { textContent: queries[0] };
  const overlay = { hidden: false, querySelector: () => text }; const landing = { hidden: false };
  const motion = eventTarget({ matches: false });
  const document = eventTarget({ activeElement: null, visibilityState: 'visible', body: { classList: { contains: () => false } }, querySelectorAll: () => queries.map((query) => ({ dataset: { query } })) });
  let now = 0; let nextId = 0; const timers = new Map();
  const window = eventTarget({ matchMedia: () => motion, setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  const $ = (id) => ({ 'initial-query': input, 'search-example': overlay, landing })[id];
  const start = app.indexOf('  function createExamplePrompt() {'); const end = app.indexOf('  const examplePrompt = createExamplePrompt();', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(app.slice(start, end) + '\ncreateExamplePrompt();', { document, window, $ });
  function advance(duration) {
    const until = now + duration;
    for (;;) {
      const first = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first || first[1].at > until) break;
      now = first[1].at; timers.delete(first[0]); first[1].callback();
    }
    now = until;
  }
  assert.equal(text.textContent, queries[0]); assert.equal(input.value, ''); assert.equal(timers.size, 1);
  const firstPause = [...timers.values()][0].at - now; assert.ok(firstPause >= 4200);
  advance(firstPause - 1); assert.equal(text.textContent, queries[0]);
  const seen = new Set([text.textContent]);
  for (let step = 0; step < 800; step++) { advance(50); if (queries.includes(text.textContent)) seen.add(text.textContent); }
  assert.equal(seen.size, 3); assert.equal(input.value, '');
  document.activeElement = input; input.emit('focus'); assert.equal(overlay.hidden, true); assert.equal(timers.size, 0);
  input.value = 'My own search'; input.emit('input'); document.activeElement = null; input.emit('blur');
  advance(10000); assert.equal(input.value, 'My own search'); assert.equal(overlay.hidden, true); assert.equal(timers.size, 0);
  input.value = ''; input.emit('input'); assert.equal(overlay.hidden, false); assert.equal(timers.size, 1);
  input.emit('blur'); window.emit('pageshow'); document.emit('visibilitychange'); assert.equal(timers.size, 1);
  motion.matches = true; motion.emit('change'); assert.equal(text.textContent, queries[0]); assert.equal(timers.size, 0);
  advance(10000); assert.equal(text.textContent, queries[0]);
  motion.matches = false; motion.emit('change'); assert.equal(timers.size, 1);
  window.emit('pagehide'); assert.equal(timers.size, 0); assert.equal(overlay.hidden, true);
});
