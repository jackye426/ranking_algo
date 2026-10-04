(() => {
  'use strict';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'cmp-icon'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', {
      pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
      arrow: 'M5 12h14m-6-6 6 6-6 6',
      source: 'M14 4h6v6m0-6L10 14m0-9H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5'
    }[name]); svg.append(path); return svg;
  }

  function safeSource(href) {
    if (typeof href !== 'string') return null;
    if (/^\/sources\/[a-zA-Z0-9_-]+$/.test(href)) return href;
    try { const url = new URL(href); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
  }

  function sourceLink(label, href, name, secondary = false) {
    const safe = safeSource(href);
    if (!safe) return null;
    const link = element('a', `cmp-source${secondary ? ' cmp-source-secondary' : ''}`);
    link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${label} for ${name} (opens in a new tab)`);
    link.append(element('span', '', label), icon('source'));
    return link;
  }

  function resultCard(record, compact, sizing = false) {
    const card = element('article', `${sizing ? 'cmp-size-card' : 'cmp-result'}${compact ? ' cmp-result-compact' : ''}`);
    card.dataset.consultantId = record.id;
    card.append(element('h4', 'cmp-name', record.name), element('p', 'cmp-specialty', record.specialty));
    if (record.location) {
      const location = element('p', 'cmp-location');
      location.append(icon('pin'), element('span', '', record.location)); card.append(location);
    }
    if (!compact && record.reason) card.append(element('p', 'cmp-reason', record.reason));
    if (!compact && record.evidenceText) {
      const evidence = element('blockquote', 'cmp-evidence', record.evidenceText);
      evidence.setAttribute('aria-label', 'Supporting record excerpt'); card.append(evidence);
    }
    const sources = element('div', 'cmp-sources');
    const recordLink = sourceLink(compact ? 'Record' : 'Supporting record', record.evidenceUrl, record.name);
    const profileLink = !compact && sourceLink('Spire profile', record.profileUrl, record.name, true);
    if (recordLink) { if (sizing) recordLink.tabIndex = -1; sources.append(recordLink); }
    if (profileLink) { if (sizing) profileLink.tabIndex = -1; sources.append(profileLink); }
    if (sources.childElementCount) card.append(sources);
    return card;
  }

  let sequence = 0;
  function mount(container, { idPrefix = `comparison-${++sequence}` } = {}) {
    const data = window.DocMapComparisonData;
    if (!container || !data?.baseline?.results?.length || !data?.goal?.results?.length || !data?.history?.results?.length) return null;
    const prefix = String(idPrefix).replace(/[^a-zA-Z0-9_-]/g, '-') || `comparison-${++sequence}`;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set();
    // Permission to animate is separate from current DOM visibility. A home
    // instance may mount while a direct healthcare entry hides its ancestor;
    // animate() checks that live ancestry when the user later returns home.
    let visible = true;
    let selected = 'goal';

    const root = element('div', 'cmp-comparison');
    const proof = element('div', 'cmp-proof');
    proof.append(element('p', 'cmp-proof-title', `Same ${data.eligibleCount} consultants. Different top three.`),
      element('p', 'cmp-proof-copy', 'Only the patient’s context changes. The search reprioritises the same pool of consultants.'));
    const label = element('p', 'cmp-prepared', 'A prepared comparison using real DocMap search results');
    const grid = element('div', 'cmp-grid');

    const baseline = element('section', 'cmp-baseline');
    baseline.setAttribute('aria-labelledby', `${prefix}-baseline-title`);
    const baselineHeading = element('h3', 'cmp-section-heading', 'Who appears for “knee pain”?');
    baselineHeading.id = `${prefix}-baseline-title`;
    const baselinePrompt = element('blockquote', 'cmp-baseline-prompt', data.baseline.prompt);
    baseline.append(element('p', 'cmp-eyebrow', 'Search by condition'), baselineHeading,
      element('p', 'cmp-column-copy', 'Finds a starting list. The patient still has to work out whose interests relate to their own situation.'), baselinePrompt);
    const baselineResults = element('div', 'cmp-baseline-results');
    data.baseline.results.slice(0, 3).forEach(record => baselineResults.append(resultCard(record, true)));
    baseline.append(baselineResults, element('p', 'cmp-baseline-takeaway', '“Knee pain” tells us the concern. It doesn’t tell us that this patient wants to run again.'));

    const contextual = element('section', 'cmp-contextual');
    contextual.setAttribute('aria-labelledby', `${prefix}-context-title`);
    const contextHeading = element('h3', 'cmp-section-heading', 'Who should I consider first?');
    contextHeading.id = `${prefix}-context-title`;
    const top = element('div', 'cmp-context-top');
    const topCopy = element('div', 'cmp-context-top-copy');
    topCopy.append(element('p', 'cmp-eyebrow', 'Search with your context'), contextHeading,
      element('p', 'cmp-column-copy', 'Prioritises profiles using your goal and previous care, then connects the relevant recorded interests to what you’ve shared.'));
    top.append(topCopy);
    const tablist = element('div', 'cmp-tabs');
    tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', 'Add patient context to the prepared results');
    const tabs = {};
    const states = ['goal', 'history'];
    states.forEach((id, index) => {
      const tab = element('button', 'cmp-tab', id === 'goal' ? 'My goal' : 'What I’ve tried');
      tab.type = 'button'; tab.id = `${prefix}-tab-${id}`;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `${prefix}-context-panel`);
      tab.addEventListener('click', () => select(id));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = states[(index + 1) % states.length];
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = states[(index - 1 + states.length) % states.length];
        if (event.key === 'Home') next = 'goal';
        if (event.key === 'End') next = 'history';
        if (!next) return;
        event.preventDefault(); select(next); tabs[next].focus({ preventScroll: true });
      });
      tabs[id] = tab; tablist.append(tab);
    });
    const panel = element('div', 'cmp-context-panel');
    panel.id = `${prefix}-context-panel`; panel.setAttribute('role', 'tabpanel');
    const patient = element('div', 'cmp-patient');
    const prompt = element('blockquote', 'cmp-patient-prompt');
    const followup = element('div', 'cmp-followup');
    const followupLabel = element('span', 'cmp-followup-label', 'Then you add');
    const followupText = element('p', 'cmp-followup-text');
    followup.append(followupLabel, followupText);
    const understanding = element('p', 'cmp-understanding');
    const results = element('div', 'cmp-context-results');
    patient.append(prompt, followup, element('p', 'cmp-change-label', 'What changes in the shortlist'), understanding);
    panel.append(patient, results);
    const stage = element('div', 'cmp-context-stage');
    const sizing = element('div', 'cmp-context-sizing');
    sizing.setAttribute('aria-hidden', 'true'); sizing.setAttribute('inert', ''); sizing.inert = true;
    // Both prepared variants size the same grid cell naturally. The active
    // panel remains unique and accessible, and switching never moves the CTA
    // or content below. This also adapts to wrapping, zoom and font loading.
    states.forEach(id => {
      const state = data[id];
      const variant = element('div', 'cmp-size-variant');
      const samplePatient = element('div', 'cmp-patient');
      samplePatient.append(element('blockquote', 'cmp-patient-prompt', state.prompt));
      if (state.followup) {
        const sampleFollowup = element('div', 'cmp-followup');
        sampleFollowup.append(element('span', 'cmp-followup-label', 'Then you add'), element('p', 'cmp-followup-text', state.followup));
        samplePatient.append(sampleFollowup);
      }
      samplePatient.append(element('p', 'cmp-change-label', 'What changes in the shortlist'), element('p', 'cmp-understanding', contextExplanation(id)));
      const sampleResults = element('div', 'cmp-size-results');
      state.results.slice(0, 3).forEach(record => sampleResults.append(resultCard(record, false, true)));
      variant.append(samplePatient, sampleResults); sizing.append(variant);
    });
    stage.append(panel, sizing);
    contextual.append(top, tablist, stage);
    grid.append(baseline, contextual);
    const notice = element('p', 'cmp-notice', 'Both lists are prepared DocMap searches, not a reproduction of Spire’s current search results. Live results may differ. First recorded hospital shown.');
    const status = element('p', 'sr-only');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    root.append(proof, label, grid, notice, status); container.replaceChildren(root);

    function contextExplanation(id) {
      return id === 'history'
        ? 'Your running goal stays. Adding previous physiotherapy brings Mark Ridgewell first; his record lists knee pain and running injuries. This does not imply that surgery is needed.'
        : 'Adding the running goal brings Ashutosh Acharya first. His record lists runner’s knee and knee pain—a specific connection to what this patient wants to get back to.';
    }

    function pause() {
      for (const animation of animations) animation.cancel();
      animations.clear();
    }

    function animate(part, frames, duration = 220) {
      if (motion.matches || !visible || document.visibilityState === 'hidden' || container.closest('[hidden]') || typeof part.animate !== 'function') return;
      const animation = part.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
      animations.add(animation);
      Promise.resolve(animation.finished).catch(() => {}).then(() => animations.delete(animation));
    }

    function select(id, initial = false) {
      if (!initial && id === selected) return;
      pause(); selected = id;
      const state = data[id];
      states.forEach(key => { tabs[key].setAttribute('aria-selected', String(key === id)); tabs[key].tabIndex = key === id ? 0 : -1; });
      panel.dataset.state = id; panel.setAttribute('aria-labelledby', tabs[id].id);
      prompt.textContent = state.prompt;
      followup.hidden = !state.followup;
      followupText.textContent = state.followup || '';
      understanding.textContent = contextExplanation(id);
      results.replaceChildren(...state.results.slice(0, 3).map(record => resultCard(record, false)));
      if (!initial) {
        animate(panel, [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }]);
        animate(tabs[id], [{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], 160);
        status.textContent = id === 'history' ? 'Prepared results updated with previous physiotherapy. The running goal remains.' : 'Prepared results showing the goal of returning to running.';
      }
    }

    select('goal', true);
    const onVisibility = () => { if (document.visibilityState === 'hidden') pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener?.('change', pause);
    if (typeof window.IntersectionObserver === 'function') {
      const observer = new window.IntersectionObserver(entries => { if (!entries[0].isIntersecting) pause(); });
      observer.observe(root);
    }
    return Object.freeze({
      setVisible(value) { visible = Boolean(value); if (!visible) pause(); },
      pause
    });
  }

  window.DocMapComparison = Object.freeze({ mount });
  window.dispatchEvent(new Event('docmap:comparison-ready'));
})();
