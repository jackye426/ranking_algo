'use strict';

(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', () => { if (!document.body.classList.contains('chat-mode')) window.scrollTo(0, 0); });
  const $ = (id) => document.getElementById(id);
  const state = { epoch: 0, sessionId: null, busy: false, criteria: {}, criteriaLabels: [], controller: null, turns: [], activeTurn: null, explanationControllers: new Set() };
  let explanationNumber = 0;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference.matches;
  const runningAnimations = new Set();
  motionPreference.addEventListener?.('change', () => { reducedMotion = motionPreference.matches; if (reducedMotion) runningAnimations.forEach((animation) => animation.cancel()); });
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#icon-${name}`); svg.append(use); return svg;
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const textValue = (value) => typeof value === 'string' ? value : (value?.name || value?.label || '');
  const list = (value) => Array.isArray(value) ? value : (value ? [value] : []);
  const safeUrl = (value) => {
    if (typeof value !== 'string') return null;
    try {
      // Only the server's record-evidence route may use a relative URL. Reject
      // protocol-relative URLs, traversal, query strings and encoded slashes.
      if (value.startsWith('/')) {
        if (!/^\/sources\/[^/?#\\\s]+$/.test(value)) return null;
        const id = decodeURIComponent(value.slice('/sources/'.length));
        if (!id || id === '.' || id === '..' || /[\/\\\u0000-\u001f\u007f]/.test(id)) return null;
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin && url.pathname.startsWith('/sources/') ? url.href : null;
      }
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  const link = (label, url, className) => {
    const href = safeUrl(url); if (!href) return null;
    const a = el('a', className, label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  };
  const announce = (message) => { $('announcer').textContent = message; };
  const resizeInput = (input) => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };

  // DEMO_SCENARIOS_START: exact, locally verified prompts; never auto-submitted.
  const demoScenarios = [
    {
      id: 'runner', title: 'Remember the person',
      prompts: ['I’m a runner with knee pain and want to get back to running', 'Physiotherapy hasn’t helped'],
      notice: 'The knee concern and running goal stay; previous care adds context without assuming surgery. Look for profile evidence such as running injuries, rather than a doctor’s hobbies.'
    },
    {
      id: 'symptoms', title: 'Symptoms, without assumptions',
      prompts: ['My periods are very painful and I haven’t been diagnosed with endometriosis', 'Only gynaecologists'],
      notice: 'Painful periods stay central, with gynaecology added when requested. Endometriosis and a procedure are not assumed.'
    },
    {
      id: 'procedure', title: 'A procedure in context',
      prompts: ['I have stage 3 endometriosis', 'I want a specialist who performs excision surgery'],
      notice: 'Excision relates to the earlier endometriosis concern. Open “Why this match” to see documented practice and its limits: stage 3 is patient context, not verified consultant expertise.'
    },
    {
      id: 'change-focus', title: 'Change your mind, keep your place',
      prompts: ['I’m a runner with knee pain and want to get back to running', 'Only in London', 'Find an eczema specialist instead'],
      notice: 'Eczema replaces the knee concern and clears the running goal. London stays because the location has not changed.'
    }
  ];
  // DEMO_SCENARIOS_END
  const demoGuide = { opener: null, version: 0, copyRequest: 0 };

  function closeDemoGuide({ restoreFocus = true } = {}) {
    const dialog = $('demo-guide-dialog');
    const opener = demoGuide.opener;
    demoGuide.version += 1; demoGuide.opener = null;
    document.body.classList.remove('demo-guide-open');
    if (dialog.open) dialog.close();
    if (restoreFocus && opener?.isConnected && !opener.hidden && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
  }

  function renderDemoGuide() {
    const container = $('demo-guide-list'); container.replaceChildren();
    demoScenarios.forEach((scenario, index) => {
      const section = el('details', 'demo-scenario'); section.dataset.scenario = scenario.id;
      section.setAttribute('name', 'demo-scenarios'); section.open = index === 0;
      const summary = el('summary', 'demo-scenario-heading'); summary.append(el('span', '', scenario.title), icon('chevron'));
      const steps = el('ol', 'demo-scenario-steps');
      scenario.prompts.forEach((prompt, step) => {
        const item = el('li', 'demo-scenario-step');
        item.append(el('p', 'demo-scenario-prompt', prompt));
        const button = el('button', `demo-step-action${step === 0 ? ' demo-start-action' : ''}`, step === 0 ? 'Use as new search' : 'Copy follow-up');
        button.type = 'button'; button.dataset.step = String(step);
        button.setAttribute('aria-label', `${step === 0 ? 'Use as new search' : 'Copy follow-up'}: ${prompt}`);
        if (step === 0) button.addEventListener('click', () => {
          closeDemoGuide({ restoreFocus: false }); reset();
          const input = $('initial-query'); input.value = prompt; resizeInput(input); input.focus({ preventScroll: true });
          announce('New search prepared. Review the opening prompt, then send it when you’re ready.');
        });
        else button.addEventListener('click', async () => {
          const version = demoGuide.version; const request = ++demoGuide.copyRequest;
          button.disabled = true; button.textContent = 'Copying…'; $('demo-guide-status').textContent = '';
          try {
            if (!window.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
            await window.navigator.clipboard.writeText(prompt);
            if (version !== demoGuide.version || !$('demo-guide-dialog').open) return;
            button.textContent = 'Copied';
            if (request === demoGuide.copyRequest) $('demo-guide-status').textContent = 'Follow-up copied. Paste it into your search when you’re ready.';
          } catch {
            if (version !== demoGuide.version || !$('demo-guide-dialog').open) return;
            button.textContent = 'Copy follow-up';
            if (request === demoGuide.copyRequest) $('demo-guide-status').textContent = 'Couldn’t copy. Select the follow-up text and copy it manually.';
          } finally {
            if (version === demoGuide.version && $('demo-guide-dialog').open) button.disabled = false;
          }
        });
        item.append(button); steps.append(item);
      });
      const notice = el('div', 'demo-scenario-notice'); notice.append(el('strong', '', 'What to notice'), el('p', '', scenario.notice));
      section.append(summary, steps, notice); container.append(section);
    });
  }

  function openDemoGuide(opener) {
    closeMatchSheet({ immediate: true, restoreFocus: false });
    const fromAbout = $('about-dialog').open;
    ['about-dialog', 'history-dialog'].forEach((id) => { if ($(id).open) $(id).close(); });
    demoGuide.opener = fromAbout ? $('about-open') : opener;
    demoGuide.version += 1;
    // Establish a visible native-dialog return target before showModal.
    demoGuide.opener.focus({ preventScroll: true });
    renderDemoGuide(); $('demo-guide-status').textContent = '';
    document.body.classList.add('demo-guide-open');
    $('demo-guide-dialog').showModal(); $('demo-guide-dialog').scrollTop = 0;
    $('demo-guide-close').focus({ preventScroll: true });
  }

  function animateElement(node, frames, options) {
    if (reducedMotion || typeof node?.animate !== 'function') return;
    const animation = node.animate(frames, { easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
    runningAnimations.add(animation);
    Promise.resolve(animation.finished).catch(() => {}).then(() => runningAnimations.delete(animation));
  }

  function cardPositions() {
    const positions = new Map();
    state.activeTurn?.node.querySelectorAll('.consultant-card').forEach((card) => positions.set(card.dataset.consultantId, card.getBoundingClientRect()));
    return positions;
  }

  function animateShortlist(turn, previous) {
    if (reducedMotion) return;
    if (!previous.size) { animateElement(turn.node, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280 }); return; }
    turn.node.querySelectorAll('.consultant-card').forEach((card) => {
      const before = previous.get(card.dataset.consultantId); const after = card.getBoundingClientRect();
      card.classList.add(before ? 'is-retained' : 'is-new');
      if (after.bottom < 0 || after.top > window.innerHeight) return;
      if (before && before.bottom >= 0 && before.top <= window.innerHeight) {
        const distance = before.top - after.top;
        if (Math.abs(distance) > 1 && Math.abs(distance) < window.innerHeight) animateElement(card, [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }], { duration: 240 });
      } else if (!before) animateElement(card, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200 });
    });
  }

  function createExamplePrompt() {
    const input = $('initial-query'); const overlay = $('search-example');
    const text = overlay.querySelector('.search-example-text');
    // The clickable query is also the animated example: both describe exactly
    // the same supported request, and neither writes into the person's input.
    const examples = [...document.querySelectorAll('[data-query]')].map((button) => button.dataset.query.trim()).filter(Boolean);
    if (!examples.length) examples.push(text.textContent.trim() || 'Find a specialist');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = null; let generation = 0; let index = 0; let length = examples[0].length; let phase = 'hold';
    const canShow = () => !document.body.classList.contains('chat-mode') && !$('landing').hidden && document.activeElement !== input && input.value.length === 0 && document.visibilityState !== 'hidden';
    const stop = () => { generation += 1; if (timer !== null) window.clearTimeout(timer); timer = null; };
    const pause = () => { stop(); overlay.hidden = true; };
    const paint = () => { text.textContent = examples[index].slice(0, length); };
    const readingPause = () => Math.max(4200, examples[index].length * 110);
    function schedule(delay) {
      const expectedGeneration = generation;
      timer = window.setTimeout(() => {
        if (expectedGeneration !== generation) return;
        timer = null;
        if (!canShow() || motion.matches) { sync(); return; }
        step();
      }, delay);
    }
    function step() {
      if (phase === 'hold') phase = 'delete';
      if (phase === 'delete') {
        length = Math.max(0, length - 1); paint();
        if (!length) { index = (index + 1) % examples.length; phase = 'type'; schedule(420); }
        else schedule(34);
      } else {
        length += 1; paint();
        if (length >= examples[index].length) { phase = 'hold'; schedule(readingPause()); }
        else schedule(65);
      }
    }
    function sync() {
      stop();
      overlay.hidden = !canShow();
      if (overlay.hidden) return;
      if (motion.matches) index = 0;
      length = examples[index].length; phase = 'hold'; paint();
      if (!motion.matches) schedule(readingPause());
    }
    input.addEventListener('focus', pause);
    input.addEventListener('blur', sync);
    input.addEventListener('input', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', sync);
    motion.addEventListener?.('change', sync);
    sync();
    return { pause, reset: () => { index = 0; sync(); } };
  }
  const examplePrompt = createExamplePrompt();

  function openConversation() {
    if (document.body.classList.contains('chat-mode')) return;
    const source = $('landing-form').getBoundingClientRect(); const epoch = state.epoch;
    examplePrompt.pause();
    $('landing').hidden = true; $('workspace').hidden = false; $('search-actions').hidden = false;
    document.body.classList.add('chat-mode', 'search-entering');
    window.requestAnimationFrame(() => {
      if (epoch !== state.epoch || reducedMotion) return;
      const form = $('followup-form'); const target = form.getBoundingClientRect();
      if (source.width && target.width) animateElement(form, [{ transform: `translate(${source.left - target.left}px,${source.top - target.top}px) scale(${source.width / target.width},${source.height / target.height})`, transformOrigin: '0 0', opacity: .8 }, { transform: 'translate(0,0) scale(1)', transformOrigin: '0 0', opacity: 1 }], { duration: 340 });
    });
    window.setTimeout(() => { if (epoch === state.epoch) document.body.classList.remove('search-entering'); }, reducedMotion ? 0 : 380);
  }

  function reset() {
    closeDemoGuide({ restoreFocus: false });
    closeMatchSheet({ immediate: true, restoreFocus: false });
    state.epoch += 1;
    runningAnimations.forEach((animation) => animation.cancel()); runningAnimations.clear();
    state.controller?.abort();
    state.explanationControllers.forEach((controller) => controller.abort()); state.explanationControllers.clear();
    Object.assign(state, { sessionId: null, busy: false, criteria: {}, criteriaLabels: [], controller: null, turns: [], activeTurn: null });
    ['conversation', 'active-criteria', 'search-status', 'search-error', 'history-list'].forEach((id) => $(id).replaceChildren());
    ['history-dialog', 'about-dialog'].forEach((id) => { if ($(id).open) $(id).close(); });
    $('workspace').hidden = true; $('landing').hidden = false; $('search-actions').hidden = true; $('history-preview').hidden = true;
    $('result-total').textContent = ''; $('search-title').textContent = 'Your shortlist';
    document.body.classList.remove('chat-mode', 'search-entering', 'is-refining');
    ['initial-query', 'followup-query'].forEach((id) => { $(id).value = ''; resizeInput($(id)); });
    examplePrompt.reset();
    setBusy(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('initial-query').focus({ preventScroll: true });
    announce('Started a new consultant search.');
  }

  function setBusy(busy) {
    state.busy = busy;
    document.body.classList.toggle('is-refining', busy && state.turns.length > 0);
    const preview = state.activeTurn && state.activeTurn !== state.turns.at(-1);
    document.querySelectorAll('.send-button, .suggestion-button, button.criterion-chip, .example-queries button').forEach((button) => { button.disabled = busy || Boolean(preview); });
    document.querySelectorAll('.explanation-toggle').forEach((button) => { button.disabled = busy; });
    $('followup-query').disabled = busy || Boolean(preview);
    $('followup-query').placeholder = preview ? 'Return to your current search to refine' : 'Tell us more, or refine your search…';
    $('history-open').disabled = busy || !state.turns.length;
    $('conversation').setAttribute('aria-busy', String(busy));
  }

  function labelsFor(data) {
    const criteria = data.criteria || {};
    const fallbackLabels = ['topic', 'specialty', 'procedures', 'location', 'insurance', 'gender', 'language'].flatMap((key) => {
      const value = list(criteria[key]).map(textValue).filter(Boolean).join(', ');
      if (!value) return [];
      const prefix = { specialty: 'Specialty: ', procedures: 'Procedures: ', gender: 'Consultant: ', language: 'Speaks ' }[key] || '';
      return [{ key, label: `${prefix}${value}` }];
    });
    if (criteria.radiusMiles > 0) fallbackLabels.push({ key: 'radiusMiles', label: `Within ${criteria.radiusMiles} miles` });
    if (criteria.sortByDistance) fallbackLabels.push({ key: 'sortByDistance', label: 'Nearest first' });
    // An explicit empty list means the server has cleared all active criteria.
    const labels = (Array.isArray(data.criteriaLabels) ? data.criteriaLabels : fallbackLabels)
      .filter((item) => item && typeof item.key === 'string' && typeof item.label === 'string' && item.label.trim());
    const labelKey = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();
    const roles = { procedures: 'Procedure', specialty: 'Specialty', clinicalContext: 'Clinical context', location: 'Location', insurance: 'Insurance', gender: 'Consultant gender', language: 'Language', radiusMiles: 'Radius', sortByDistance: 'Distance' };
    return labels.map((item) => item.key !== 'topic' && labels.some((other) => other.key !== item.key && labelKey(other.label) === labelKey(item.label))
      ? { ...item, label: `${roles[item.key] || 'Filter'}: ${item.label}` } : item);
  }

  function renderCriteria(labels, readOnly = false) {
    const container = $('active-criteria'); container.replaceChildren();
    labels.forEach(({ key, label }) => {
      const chip = el(readOnly ? 'span' : 'button', `criterion-chip${readOnly ? ' read-only' : ''}`);
      chip.append(el('span', '', label));
      if (!readOnly) {
        chip.type = 'button';
        chip.setAttribute('aria-label', `Remove ${label} from your search`);
        chip.append(icon('close'));
        chip.addEventListener('click', () => send({ removeCriterion: key }, `Remove “${label}” from my search`));
      }
      container.append(chip);
    });
  }

  function suggestionActions(suggestions) {
    const container = el('div', 'empty-actions');
    list(suggestions).slice(0, 2).forEach((suggestion) => {
      const query = typeof suggestion === 'string' ? suggestion : suggestion.message || suggestion.query || suggestion.label;
      if (!query) return;
      const button = el('button', 'suggestion-button retry-button', typeof suggestion === 'string' ? suggestion : suggestion.label || query);
      button.type = 'button'; button.addEventListener('click', () => send({ message: query }, query));
      container.append(button);
    });
    return container;
  }

  function loading() {
    $('search-status').replaceChildren(el('span', 'status-pulse'), el('span', '', state.turns.length ? 'Updating your shortlist…' : 'Finding your specialists…'));
    if (state.turns.length) return null;
    const skeleton = el('div', 'skeleton-card'); skeleton.setAttribute('aria-hidden', 'true');
    skeleton.append(el('div', 'skeleton-avatar')); const lines = el('div', 'skeleton-lines');
    for (let i = 0; i < 3; i++) lines.append(el('div', 'skeleton-line'));
    skeleton.append(lines); $('conversation').append(skeleton); return skeleton;
  }

  function formatLocation(location) {
    if (typeof location === 'string') return location;
    return [location?.name, location?.postcode].filter(Boolean).join(' · ') || location?.address || '';
  }

  function portrait(person, extraClass = '') {
    const avatar = el('div', `avatar ${extraClass}`.trim()); avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = String(person.name || '').replace(/^(mr|mrs|ms|miss|dr|professor|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('');
    const imageUrl = safeUrl(person.imageUrl);
    if (imageUrl) {
      const initials = avatar.textContent; const img = el('img'); img.src = imageUrl; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { avatar.textContent = initials; }); avatar.replaceChildren(img);
    }
    return avatar;
  }

  const validCitations = (values) => list(values).filter((citation) => citation && typeof citation.text === 'string' && citation.text.trim() && safeUrl(citation.sourceUrl));
  const baselineCitations = (person) => validCitations(person.personalizedMatch?.citations).length ? validCitations(person.personalizedMatch.citations) : validCitations(person.reasons).map((reason, index) => ({ ...reason, id: `e${index + 1}` }));
  const fullCaveats = (entry, data = entry.cached) => [...new Set([
    ...list(entry.person.personalizedMatch?.caveats), ...list(data?.caveats),
    ...list(entry.person.insuranceEvidence).filter(Boolean).filter((item) => !entry.context.criteria?.insurance || !item.insurer || String(item.insurer).toLowerCase() === entry.context.criteria.insurance.toLowerCase())
      .map((item) => typeof item === 'string' ? item : item.text || item.note || '').filter((text) => /not fee assured|not in (?:the |bupa.s )?open referral/i.test(text)),
  ].filter((value) => typeof value === 'string' && value.trim()))];
  const matchSheet = { dialog: $('match-dialog'), entry: null, version: 0, closeTimer: null, returnFocus: null, scrollX: 0, scrollY: 0 };

  function cancelExplanation(entry, reason = 'closed') {
    if (!entry?.pending) return;
    entry.pending.controller.abort(reason);
    window.clearTimeout(entry.pending.timeout);
    state.explanationControllers.delete(entry.pending.controller);
    entry.pending = null;
  }

  function closeMatchSheet({ immediate = false, restoreFocus = true } = {}) {
    if (!matchSheet.entry && !matchSheet.dialog.open) return;
    const entry = matchSheet.entry; const version = ++matchSheet.version;
    cancelExplanation(entry);
    entry?.button.setAttribute('aria-expanded', 'false');
    window.clearTimeout(matchSheet.closeTimer);
    matchSheet.dialog.classList.remove('is-opening', 'is-dragging');
    matchSheet.dialog.style.removeProperty('--sheet-drag');
    sheetDrag = null;
    matchSheet.dialog.classList.add('is-closing');
    $('sheet-status').textContent = '';
    const finish = () => {
      if (version !== matchSheet.version) return;
      const trigger = matchSheet.returnFocus;
      matchSheet.entry = null; matchSheet.returnFocus = null; matchSheet.closeTimer = null;
      if (matchSheet.dialog.open) matchSheet.dialog.close();
      matchSheet.dialog.classList.remove('is-closing', 'is-loading', 'is-ready');
      document.body.classList.remove('sheet-open');
      $('sheet-content').setAttribute('aria-busy', 'false');
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
      if (restoreFocus && (window.scrollX !== matchSheet.scrollX || window.scrollY !== matchSheet.scrollY)) window.scrollTo({ left: matchSheet.scrollX, top: matchSheet.scrollY, behavior: 'instant' });
    };
    if (immediate || reducedMotion || !matchSheet.dialog.open) finish();
    else matchSheet.closeTimer = window.setTimeout(finish, 240);
  }

  function sourceLabel(url) {
    const href = safeUrl(url); if (!href) return 'Source';
    const parsed = new URL(href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/sources/') ? 'Consultant record' : parsed.hostname.replace(/^www\./, '');
  }

  function renderSheetSources(entry, data = entry.cached) {
    const previous = $('sheet-provenance').querySelector('details');
    const wasOpen = previous?.open || false;
    const focusedSource = previous?.contains(document.activeElement) ? document.activeElement : null;
    const focusedHref = focusedSource?.tagName === 'A' ? focusedSource.href : null;
    const details = el('details', 'sheet-sources'); details.open = wasOpen;
    const citations = [...validCitations(data?.citations), ...baselineCitations(entry.person)];
    const seen = new Set(); const unique = citations.filter((item) => {
      const key = `${item.text.trim()}\n${safeUrl(item.sourceUrl)}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    });
    const summary = el('summary', 'sheet-sources-toggle'); summary.append(el('span', '', 'Sources & profile details'), icon('chevron')); details.append(summary);
    const body = el('div', 'sheet-source-content');
    const reasons = list(data?.reasons).filter((item) => item && typeof item.text === 'string' && item.text.trim());
    const citationMap = new Map(validCitations(data?.citations).map((item) => [String(item.id), item]));
    if (reasons.length) {
      body.append(el('h3', '', 'Evidence behind the explanation'));
      const items = el('ul', 'sheet-reasons');
      reasons.forEach((reason) => {
        const references = [...new Set(list(reason.evidenceIds).map(String))].map((id) => citationMap.get(id)).filter(Boolean);
        if (!references.length) return;
        const item = el('li'); if (reason.title) item.append(el('h4', '', reason.title));
        item.append(el('p', '', reason.text));
        const links = el('div', 'sheet-source-links');
        [...new Set(references.map((citation) => safeUrl(citation.sourceUrl)))].forEach((url) => { const source = link(sourceLabel(url), url, 'source-link'); if (source) links.append(source); });
        item.append(links); items.append(item);
      });
      body.append(items);
    }
    if (unique.length) {
      body.append(el('h3', '', 'Source evidence'));
      const sources = el('ol', 'sheet-source-list');
      unique.forEach((citation) => {
        const item = el('li'); item.append(el('p', '', citation.text));
        const source = link(sourceLabel(citation.sourceUrl), citation.sourceUrl, 'source-link'); if (source) { source.append(icon('external')); item.append(source); } sources.append(item);
      });
      body.append(sources);
    }
    const caveats = fullCaveats(entry, data);
    if (caveats.length) { body.append(el('h3', '', 'Important details')); const items = el('ul'); caveats.forEach((text) => items.append(el('li', '', text))); body.append(items); }
    const person = entry.person;
    if (person.description) body.append(el('h3', '', 'From the consultant record'), el('p', 'sheet-record-description', person.description));
    const interests = list(person.clinicalInterests).map(textValue).filter(Boolean);
    if (interests.length) { body.append(el('h3', '', 'Clinical interests listed')); const items = el('ul'); interests.forEach((text) => items.append(el('li', '', text))); body.append(items); }
    const locations = list(person.locations).filter(Boolean);
    if (locations.length) {
      body.append(el('h3', '', 'Practice locations')); const items = el('ul');
      locations.forEach((location) => items.append(el('li', '', typeof location === 'string' ? location : [...new Set([location.name, location.address, location.postcode].filter(Boolean))].join(', ')))); body.append(items);
    }
    const insurers = list(person.insurers).map(textValue).filter(Boolean);
    if (insurers.length) body.append(el('h3', '', 'Insurance listed'), el('p', '', insurers.join(' · ')));
    const insurance = list(person.insuranceEvidence).filter(Boolean);
    if (insurance.length) {
      body.append(el('h3', '', 'Insurance details from source'));
      insurance.forEach((item) => { const paragraph = el('p', '', typeof item === 'string' ? item : item.text || item.note || item.description || ''); const source = link('Source', item.sourceUrl || item.url, 'source-link'); if (source) paragraph.append(document.createTextNode(' '), source); body.append(paragraph); });
    }
    if (person.gmc) body.append(el('p', '', `GMC registration: ${person.gmc}`));
    const urls = [...new Set([person.evidenceUrl, person.profileUrl, ...list(person.sourceUrls).map((item) => typeof item === 'string' ? item : item?.url)].map(safeUrl).filter(Boolean))];
    if (urls.length) { body.append(el('h3', '', 'Profile links')); const links = el('div', 'sheet-source-links'); urls.forEach((url) => { const source = link(sourceLabel(url), url, 'source-link'); if (source) { source.append(icon('external')); links.append(source); } }); body.append(links); }
    details.append(body); $('sheet-provenance').replaceChildren(details);
    if (focusedSource && matchSheet.entry === entry && matchSheet.dialog.open) {
      const target = focusedHref ? [...details.querySelectorAll('a')].find((source) => source.href === focusedHref) : null;
      (target || summary).focus({ preventScroll: true });
    }
  }

  function renderSheetCaveats(entry) {
    let procedure = false; let coverage = false;
    const caveats = fullCaveats(entry).flatMap((text) => {
      const material = [];
      if (/not fee assured/i.test(text)) material.push('Not fee assured; some fees may exceed your cover.');
      if (/not in (?:the |bupa.s )?open referral/i.test(text)) material.push('Not in the Open Referral network.');
      if (material.length) return material;
      if (/recognition does not guarantee coverage/i.test(text)) { coverage = true; return []; }
      if (/procedure/i.test(text) && /availability|available|confirmation/i.test(text)) { procedure = true; return []; }
      if (/straight.line|not travel times/i.test(text)) return [];
      return [text];
    });
    if (procedure && coverage) caveats.push('Confirm procedure availability and insurance cover before booking.');
    else if (procedure) caveats.push('Confirm procedure availability at your chosen hospital.');
    else if (coverage) caveats.push('Confirm insurance cover and any fee shortfall before booking.');
    $('sheet-caveats').replaceChildren(...[...new Set(caveats)].map((text) => el('p', '', text)));
    $('sheet-caveats').hidden = !caveats.length;
  }

  function renderSheet(entry) {
    if (matchSheet.entry !== entry || entry.epoch !== state.epoch) return;
    const content = $('sheet-content'); const fragment = document.createDocumentFragment();
    const busy = Boolean(entry.pending); const data = entry.cached;
    matchSheet.dialog.classList.toggle('is-loading', busy); matchSheet.dialog.classList.toggle('is-ready', Boolean(data));
    content.setAttribute('aria-busy', String(busy));
    if (busy) {
      const profileSummary = typeof entry.person.personalizedMatch?.summary === 'string' && baselineCitations(entry.person).length ? entry.person.personalizedMatch.summary.trim() : '';
      const progress = el('div', `sheet-progress${!data && profileSummary ? ' has-summary' : ''}`); const label = el('p', 'sheet-progress-text'); label.append(el('span', 'explanation-pulse'), document.createTextNode(data ? 'Checking your explanation…' : 'Personalising your explanation…')); progress.append(label);
      if (!data && !profileSummary) { const skeleton = el('div', 'sheet-skeleton'); skeleton.setAttribute('aria-hidden', 'true'); for (let index = 0; index < 3; index++) skeleton.append(el('span')); progress.append(skeleton); }
      fragment.append(progress);
      if (!data && profileSummary) {
        const preview = el('section', 'sheet-explanation sheet-preview');
        preview.append(el('p', 'sheet-provider', 'Profile summary'), el('p', 'sheet-summary', profileSummary)); fragment.append(preview);
      }
    }
    if (data) {
      const ai = ['openrouter', 'openai'].includes(data.provider);
      const explanation = el('section', 'sheet-explanation');
      explanation.append(el('p', 'sheet-provider', ai ? 'AI-generated explanation' : 'Profile evidence'), el('p', 'sheet-summary', data.summary));
      if (data.notice || !ai) explanation.append(el('p', 'sheet-notice', data.notice || 'Showing linked profile evidence. An AI-generated explanation is not available for this request.'));
      if (data.retryable === true && !entry.error) { const retry = el('button', 'explanation-retry', 'Try AI explanation again'); retry.type = 'button'; retry.disabled = busy; retry.addEventListener('click', () => loadMatchExplanation(entry, true)); explanation.append(retry); }
      fragment.append(explanation);
    }
    if (entry.error) {
      const failure = el('div', 'sheet-error'); failure.setAttribute('role', 'alert'); const expired = entry.error.status === 410;
      failure.append(el('p', '', expired ? 'This search has expired. Start a new search to request an explanation; this clears the conversation and its preferences.' : entry.error.message || 'We couldn’t load the explanation. Your results are still available.'));
      const retry = el('button', 'explanation-retry', expired ? 'Start a new search' : 'Try again'); retry.type = 'button'; retry.disabled = busy; retry.addEventListener('click', expired ? reset : () => loadMatchExplanation(entry, true)); failure.append(retry); fragment.append(failure);
    }
    content.replaceChildren(fragment); renderSheetCaveats(entry); renderSheetSources(entry);
  }

  function checkedExplanation(data) {
    if (!data || typeof data.summary !== 'string' || !data.summary.trim() || !validCitations(data.citations).length) throw new Error('The explanation did not include verifiable supporting sources. Please try again.');
    return { ...data, summary: data.summary.trim(), citations: validCitations(data.citations) };
  }

  function loadMatchExplanation(entry, force = false) {
    if (entry.epoch !== state.epoch || matchSheet.entry !== entry) return null;
    if (entry.pending && !entry.pending.controller.signal.aborted) return entry.pending.promise;
    if (entry.cached && !force) { renderSheet(entry); return null; }
    entry.error = null;
    if (!entry.request.sessionId || !entry.request.searchId || !entry.request.consultantId) {
      try { entry.cached = checkedExplanation({ summary: entry.person.personalizedMatch?.summary || 'The linked records describe this consultant’s practice.', citations: baselineCitations(entry.person), caveats: fullCaveats(entry), provider: 'evidence', notice: 'This result is from an earlier search. Start a new search for a fresh AI explanation.', retryable: false }); }
      catch (error) { entry.error = error; }
      renderSheet(entry); return null;
    }
    const version = matchSheet.version; const controller = new AbortController();
    const pending = { controller, timeout: window.setTimeout(() => controller.abort('timeout'), 60000), promise: null }; entry.pending = pending;
    state.explanationControllers.add(controller); renderSheet(entry);
    $('sheet-status').textContent = `Preparing an explanation for ${entry.person.name || 'this consultant'}.`;
    const current = () => entry.epoch === state.epoch && matchSheet.entry === entry && matchSheet.version === version && entry.pending === pending && !controller.signal.aborted;
    pending.promise = fetch('/api/match-explanation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry.request), signal: controller.signal })
      .then(async (response) => {
        let data; try { data = await response.json(); } catch { throw new Error('The explanation service returned an unreadable response. Please try again.'); }
        if (!response.ok) {
          const seconds = Number(response.headers.get('Retry-After'));
          const suffix = response.status === 429 && Number.isFinite(seconds) && seconds > 0 ? ` Please wait ${Math.ceil(seconds)} seconds before retrying.` : '';
          const error = new Error((typeof data.error === 'string' ? data.error : 'We couldn’t load the explanation. Please try again.') + suffix); error.status = response.status; throw error;
        }
        if (!current()) return;
        entry.cached = checkedExplanation(data);
        $('sheet-status').textContent = ['openrouter', 'openai'].includes(data.provider) ? 'Your AI explanation is ready.' : 'The linked profile evidence is ready.';
      })
      .catch((error) => {
        if (entry.epoch !== state.epoch || matchSheet.entry !== entry || matchSheet.version !== version || entry.pending !== pending) return;
        if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
        entry.error = controller.signal.aborted ? new Error('The explanation is taking longer than expected. Please try again.') : error;
        $('sheet-status').textContent = 'The explanation could not be loaded. Your consultant results remain available.';
      })
      .finally(() => {
        window.clearTimeout(pending.timeout); state.explanationControllers.delete(controller);
        if (entry.pending !== pending) return;
        entry.pending = null;
        if (entry.epoch === state.epoch && matchSheet.entry === entry && matchSheet.version === version) renderSheet(entry);
      });
    return pending.promise;
  }

  function openMatchSheet(entry) {
    if (state.busy) return;
    if (matchSheet.entry === entry && matchSheet.dialog.open && !matchSheet.dialog.classList.contains('is-closing')) return;
    closeMatchSheet({ immediate: true, restoreFocus: false });
    matchSheet.entry = entry; matchSheet.version += 1; matchSheet.returnFocus = entry.button;
    matchSheet.scrollX = window.scrollX; matchSheet.scrollY = window.scrollY;
    entry.button.setAttribute('aria-expanded', 'true');
    const identity = el('div', 'sheet-person'); const title = el('div', 'sheet-person-copy');
    title.append(el('h2', 'sheet-name', entry.person.name || 'Consultant profile')); title.firstElementChild.id = 'sheet-consultant-name';
    const specialty = list(entry.person.specialty).map(textValue).filter(Boolean).join(' · '); if (specialty) title.append(el('p', 'sheet-specialty', specialty));
    identity.append(portrait(entry.person, 'sheet-avatar'), title); $('sheet-identity').replaceChildren(identity);
    $('sheet-provenance').replaceChildren(); $('sheet-content').replaceChildren(); $('sheet-status').textContent = '';
    matchSheet.dialog.classList.remove('is-closing'); matchSheet.dialog.classList.add('is-opening'); document.body.classList.add('sheet-open');
    renderSheet(entry); matchSheet.dialog.showModal(); $('sheet-scroll').scrollTop = 0; $('sheet-close').focus({ preventScroll: true });
    const version = matchSheet.version;
    window.setTimeout(() => { if (version === matchSheet.version) matchSheet.dialog.classList.remove('is-opening'); }, reducedMotion ? 0 : 360);
    if (!entry.cached && !entry.error) loadMatchExplanation(entry);
  }

  $('sheet-close').addEventListener('click', () => closeMatchSheet());
  matchSheet.dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeMatchSheet(); });
  // close is queued by the browser: an old opening may dispatch it after the
  // reusable dialog has already opened for another consultant.
  matchSheet.dialog.addEventListener('close', () => { if (!matchSheet.dialog.open && matchSheet.entry) closeMatchSheet({ immediate: true }); });
  let backdropStart = false;
  const outsideSheet = (event) => { const rect = matchSheet.dialog.getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
  matchSheet.dialog.addEventListener('pointerdown', (event) => { backdropStart = event.target === matchSheet.dialog && outsideSheet(event); });
  matchSheet.dialog.addEventListener('click', (event) => { if (backdropStart && event.target === matchSheet.dialog && outsideSheet(event)) closeMatchSheet(); backdropStart = false; });
  let sheetDrag = null;
  matchSheet.dialog.addEventListener('pointerdown', (event) => {
    if (!window.matchMedia('(max-width: 640px)').matches || event.button !== 0 || !event.target.closest('.sheet-handle, .sheet-header') || event.target.closest('button, a')) return;
    sheetDrag = { y: event.clientY, x: event.clientX, pointerId: event.pointerId, distance: 0 };
  });
  window.addEventListener('pointermove', (event) => {
    if (!sheetDrag || sheetDrag.pointerId !== event.pointerId) return;
    const delta = Math.max(0, event.clientY - sheetDrag.y);
    if (Math.abs(event.clientX - sheetDrag.x) > delta + 15) { sheetDrag = null; matchSheet.dialog.classList.remove('is-dragging'); matchSheet.dialog.style.removeProperty('--sheet-drag'); return; }
    sheetDrag.distance = delta;
    if (delta > 8 && !reducedMotion) { matchSheet.dialog.classList.add('is-dragging'); matchSheet.dialog.style.setProperty('--sheet-drag', `${Math.min(delta, 260)}px`); if (event.cancelable) event.preventDefault(); }
  }, { passive: false });
  const finishSheetDrag = (event) => { if (!sheetDrag || sheetDrag.pointerId !== event.pointerId) return; const distance = sheetDrag.distance; sheetDrag = null; matchSheet.dialog.classList.remove('is-dragging'); matchSheet.dialog.style.removeProperty('--sheet-drag'); if (distance > 80 && event.type !== 'pointercancel') closeMatchSheet(); };
  window.addEventListener('pointerup', finishSheetDrag); window.addEventListener('pointercancel', finishSheetDrag);

  function differentiator(person, context) {
    const insurance = String(context.criteria?.insurance || '').toLowerCase();
    const facts = baselineCitations(person).filter((fact) => fact.kind !== 'terminology' && !/location|specialty|consultant identity|language|gender|plain.english|terminology/i.test(fact.criterion || '') && (!insurance || String(fact.criterion).toLowerCase() !== insurance));
    for (const fact of facts) {
      const text = fact.text.replace(/^(?:Profile lists|Record lists|Specialty):\s*/i, '').trim().replace(/[.]$/, '');
      if (text.length < 8 || text.length > 125 || /\+\/-|±|\b[A-Z]\d{4}\b|\b(?:miles|fee assured|open referral|Bupa|AXA|insurance)\b/i.test(text)) continue;
      if (/\b(?:I am|I have|my|we|our|qualified|graduated|trained|training|fellowship|career|appointed)\b|\byears? (?:of )?experience\b/i.test(text)) continue;
      return text;
    }
    return null;
  }

  function consultantCard(person, index, searchContext) {
    const article = el('article', 'consultant-card'); article.dataset.consultantId = String(person.id || index);
    const main = el('div', 'card-main'); const content = el('div', 'card-content');
    content.append(el('h3', 'consultant-name', person.name || 'Consultant profile'));
    const specialty = list(person.specialty).map(textValue).filter(Boolean).join(' · '); if (specialty) content.append(el('p', 'consultant-specialty', specialty));
    main.append(portrait(person), content); article.append(main);
    const practical = el('div', 'card-practical'); const locations = list(person.locations).filter(Boolean);
    if (locations.length) {
      const location = locations[0]; const row = el('div', 'card-location'); row.append(icon('pin'), el('span', 'location-text', typeof location === 'string' ? location : location.name || location.address || location.postcode || ''));
      if (person.distanceLabel || Number.isFinite(person.distanceMiles)) {
        const distance = el('span', 'distance', person.distanceLabel || `${person.distanceMiles.toFixed(1)} miles away`);
        distance.title = 'Approximate straight-line distance to a recorded Spire practice, not travel time.'; row.append(distance);
      }
      practical.append(row);
    }
    const insurers = list(person.insurers).map(textValue).filter(Boolean); const requested = String(searchContext.criteria?.insurance || '').toLowerCase();
    const shownInsurers = requested ? insurers.filter((insurer) => insurer.toLowerCase().includes(requested)) : insurers.slice(0, 1);
    if (shownInsurers.length) {
      const row = el('div', 'insurance-row');
      shownInsurers.forEach((insurer) => { const label = el('span', 'insurance-pill'); label.append(icon('check'), document.createTextNode(insurer)); row.append(label); });
      const shownNames = new Set(shownInsurers.map((insurer) => insurer.toLowerCase()));
      const evidence = list(person.insuranceEvidence).filter(Boolean).filter((item) => !item.insurer || shownNames.has(String(item.insurer).toLowerCase())).map((item) => typeof item === 'string' ? item : item.text || item.note || '').join(' ');
      if (/not fee assured/i.test(evidence)) row.append(el('span', 'insurance-exception', 'Not fee assured'));
      if (/not in (?:the |bupa.s )?open referral/i.test(evidence)) row.append(el('span', 'insurance-exception', 'Not in Open Referral'));
      practical.append(row);
    }
    if (practical.childElementCount) article.append(practical);
    const focus = differentiator(person, searchContext);
    if (focus) { const note = el('div', 'card-differentiator'); note.append(el('span', 'card-focus-label', 'Profile includes'), el('p', 'card-focus-text', focus)); article.append(note); }
    const actions = el('div', 'card-actions');
    const why = el('button', 'explanation-toggle'); why.type = 'button'; why.id = `explanation-toggle-${++explanationNumber}`;
    why.setAttribute('aria-haspopup', 'dialog'); why.setAttribute('aria-controls', 'match-dialog'); why.setAttribute('aria-expanded', 'false');
    why.setAttribute('aria-label', `Why ${person.name || 'this consultant'} matches your search`);
    why.title = 'Uses your search preferences and profile evidence'; why.append(icon('spark'), el('span', 'explanation-toggle-label', 'Why this match'), icon('chevron'));
    const disclosure = el('span', 'sr-only', 'Uses your search preferences and profile evidence to prepare an explanation.'); disclosure.id = `${why.id}-disclosure`; why.setAttribute('aria-describedby', disclosure.id);
    const entry = { person, context: searchContext, epoch: state.epoch, button: why, cached: null, pending: null, error: null,
      request: Object.freeze({ sessionId: searchContext.sessionId, searchId: searchContext.searchId, consultantId: person.id }) };
    why.addEventListener('click', () => openMatchSheet(entry)); actions.append(why, disclosure);
    const sourceUrls = list(person.sourceUrls).map((item) => typeof item === 'string' ? item : item?.url).map(safeUrl).filter(Boolean);
    const evidenceUrl = safeUrl(person.evidenceUrl); const profileUrl = safeUrl(person.profileUrl) || sourceUrls.find((url) => url !== evidenceUrl);
    const profile = link(profileUrl ? 'View profile' : 'View record', profileUrl || evidenceUrl, 'profile-link');
    if (profile) { profile.setAttribute('aria-label', `View source ${profileUrl ? 'profile' : 'record'} for ${person.name || 'this consultant'}`); profile.append(icon('external')); actions.append(profile); }
    article.append(actions); return article;
  }

  function renderResponse(data) {
    const turn = el('section', 'turn'); turn.setAttribute('aria-label', 'Search results');
    const clarifications = list(data.clarifications).filter((text) => typeof text === 'string' && text.trim());
    const notice = (text) => { const node = el('div', 'notice'); node.append(icon('info'), el('span', '', text)); return node; };
    clarifications.forEach((text) => turn.append(notice(text)));
    const results = data.results;
    if (results.length) {
      const cards = el('div', 'consultant-list');
      const context = Object.freeze({ sessionId: data.sessionId, searchId: data.searchId, criteria: { ...(data.criteria || {}) } });
      results.forEach((person, index) => cards.append(consultantCard(person, index, context)));
      turn.append(cards);
    } else {
      const empty = el('div', 'empty-state');
      empty.append(icon('search'), el('h2', '', 'A little more room to search?'), el('p', '', 'No matches for these preferences. Try a wider area or remove a filter.'));
      empty.append(suggestionActions(data.suggestions)); turn.append(empty);
    }
    const notices = list(data.notices).map((item) => typeof item === 'string' ? item : item.message || item.text).filter(Boolean);
    const notes = el('div', 'search-notes');
    [...new Set(notices)].filter((text) => !clarifications.includes(text)).forEach((text) => notes.append(notice(text)));
    if (notes.childElementCount) turn.append(notes);
    return turn;
  }

  function showTurn(turn, scroll = false) {
    if (!turn) return;
    closeMatchSheet({ immediate: true, restoreFocus: false });
    state.activeTurn = turn;
    const preview = turn !== state.turns.at(-1);
    state.turns.forEach((entry) => { entry.node.hidden = entry !== turn; });
    $('history-preview').hidden = !preview;
    $('search-error').hidden = preview;
    $('search-title').textContent = preview ? 'Earlier shortlist' : 'Your shortlist';
    const total = Number.isFinite(turn.data.total) ? turn.data.total : Number.isFinite(turn.data.totalMatches) ? turn.data.totalMatches : turn.data.results.length;
    $('result-total').textContent = total.toLocaleString() + (total === 1 ? ' consultant' : ' consultants') + (total > turn.data.results.length ? ' · ' + turn.data.results.length + ' shown' : '');
    renderCriteria(turn.labels, preview);
    setBusy(state.busy);
    if (scroll) {
      const epoch = state.epoch;
      window.requestAnimationFrame(() => { if (epoch === state.epoch) document.querySelector('.search-overview').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }); });
    }
  }

  function renderHistory() {
    const container = $('history-list'); container.replaceChildren();
    [...state.turns].reverse().forEach((turn) => {
      const item = el('article', 'history-entry');
      if (turn === state.turns.at(-1)) item.append(el('span', 'history-current', 'Current search'));
      item.append(el('h3', '', turn.message));
      if (turn.data.message) item.append(el('p', '', turn.data.message));
      if (turn.labels.length) item.append(el('p', 'history-criteria', turn.labels.map((label) => label.label).join(' · ')));
      const view = el('button', 'text-button', turn === state.turns.at(-1) ? 'View current shortlist ↗' : 'View this shortlist ↗');
      view.type = 'button';
      view.addEventListener('click', () => {
        if (state.busy) return;
        $('history-dialog').close(); showTurn(turn, true);
        const epoch = state.epoch;
        window.requestAnimationFrame(() => {
          if (epoch !== state.epoch) return;
          $('search-title').setAttribute('tabindex', '-1'); $('search-title').focus({ preventScroll: true });
        });
        announce(turn === state.turns.at(-1) ? 'Current shortlist restored.' : 'Viewing an earlier shortlist. Return to your current search to refine.');
      });
      item.append(view); container.append(item);
    });
  }

  function renderError(error, request, displayMessage) {
    const errorBox = el('div', 'error-state'); errorBox.setAttribute('role', 'alert');
    const expired = error.status === 410;
    errorBox.append(el('h2', '', expired ? 'This search has expired' : error.clarification ? 'One detail to clarify' : 'We couldn’t update your search'),
      el('p', '', expired ? 'Your results are still here. Start a new search to continue with fresh preferences.' : error.message || 'Please try again. Your current shortlist and preferences are unchanged.'));
    const retry = el('button', 'retry-button', expired ? 'Start a new search' : error.clarification ? 'Edit your request' : 'Try again'); retry.type = 'button';
    retry.addEventListener('click', expired ? reset : error.clarification ? () => $('followup-query').focus() : () => send(request, displayMessage));
    errorBox.append(retry); $('search-error').hidden = false; $('search-error').replaceChildren(errorBox);
    announce(expired ? 'Search expired. Your earlier results are still available.' : 'Search could not be updated. Your previous shortlist and preferences remain.');
  }

  async function send(request, displayMessage) {
    if (state.busy || (state.activeTurn && state.activeTurn !== state.turns.at(-1))) return;
    const payload = { ...request };
    if ('message' in payload) { payload.message = payload.message.trim(); if (!payload.message) return; }
    const message = displayMessage || payload.message || 'Updated search preferences';
    const epoch = state.epoch;
    closeMatchSheet({ immediate: true, restoreFocus: false });
    openConversation(); $('search-error').replaceChildren();
    const skeleton = loading(); setBusy(true);
    if (payload.message) { $('followup-query').value = payload.message; resizeInput($('followup-query')); }
    const controller = new AbortController(); state.controller = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 90000);
    announce(state.turns.length ? 'Updating your shortlist. Your current results remain available.' : 'Searching Spire consultant records.');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...(state.sessionId ? { sessionId: state.sessionId } : {}) }), signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { throw new Error('The search service returned an unreadable response. Please try again.'); }
      if (!response.ok) {
        const error = new Error(typeof data.error === 'string' ? data.error : data.message || 'The search service is temporarily unavailable. Please try again.');
        error.status = response.status; error.clarification = response.status === 422 && Array.isArray(data.clarifications); throw error;
      }
      if (epoch !== state.epoch || state.controller !== controller) return;
      if (!Array.isArray(data.results) || !data.sessionId) throw new Error('The search response was incomplete. Please try again.');
      // Build first; only commit criteria and shortlist after a complete response.
      const turn = { message, data, labels: labelsFor(data), node: renderResponse(data) };
      const previous = cardPositions();
      state.sessionId = data.sessionId; state.criteria = data.criteria || {}; state.criteriaLabels = turn.labels;
      state.turns.push(turn); $('conversation').append(turn.node);
      skeleton?.remove(); $('search-status').replaceChildren();
      showTurn(turn, false); animateShortlist(turn, previous);
      if (payload.message) { $('initial-query').value = ''; $('followup-query').value = ''; resizeInput($('followup-query')); }
      announce((data.message || 'Your shortlist is ready.') + ' ' + data.results.length + ' profiles displayed.');
    } catch (error) {
      if (epoch !== state.epoch || state.controller !== controller) return;
      skeleton?.remove(); $('search-status').replaceChildren();
      if (controller.signal.aborted) error = new Error('This is taking longer than expected. Please try again. Your current shortlist is unchanged.');
      renderError(error, payload, message);
    } finally {
      window.clearTimeout(timeout);
      if (epoch === state.epoch && state.controller === controller) {
        state.controller = null; setBusy(false);
        if (!reducedMotion && !state.turns.length) window.scrollTo({ top: 0, behavior: 'smooth' });
        $('followup-query').focus({ preventScroll: true });
      }
    }
  }

  ['initial-query', 'followup-query'].forEach((id) => {
    const input = $(id); input.addEventListener('input', () => resizeInput(input));
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); input.form.requestSubmit(); } });
  });
  $('landing-form').addEventListener('submit', (event) => { event.preventDefault(); send({ message: $('initial-query').value }, $('initial-query').value); });
  $('followup-form').addEventListener('submit', (event) => { event.preventDefault(); send({ message: $('followup-query').value }, $('followup-query').value); });
  document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => send({ message: button.dataset.query }, button.dataset.query)));
  ['brand-home', 'new-search'].forEach((id) => $(id).addEventListener('click', reset));
  $('return-current').addEventListener('click', () => { showTurn(state.turns.at(-1), true); $('followup-query').focus({ preventScroll: true }); announce('Back to your current search.'); });
  $('history-open').addEventListener('click', () => { renderHistory(); $('history-dialog').showModal(); });
  $('history-close').addEventListener('click', () => $('history-dialog').close());
  $('about-open').addEventListener('click', () => $('about-dialog').showModal());
  ['about-close', 'about-done'].forEach((id) => $(id).addEventListener('click', () => $('about-dialog').close()));
  ['demo-guide-open', 'demo-guide-about'].forEach((id) => $(id).addEventListener('click', () => openDemoGuide($(id))));
  $('demo-guide-close').addEventListener('click', () => closeDemoGuide());
  $('demo-guide-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeDemoGuide(); });
  $('demo-guide-dialog').addEventListener('close', () => {
    if (!$('demo-guide-dialog').open) { demoGuide.version += 1; document.body.classList.remove('demo-guide-open'); }
  });
  const outsideDemoGuide = (event) => { const rect = $('demo-guide-dialog').getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
  let demoBackdropStart = false;
  $('demo-guide-dialog').addEventListener('pointerdown', (event) => { demoBackdropStart = event.target === $('demo-guide-dialog') && outsideDemoGuide(event); });
  $('demo-guide-dialog').addEventListener('click', (event) => { if (demoBackdropStart && event.target === $('demo-guide-dialog') && outsideDemoGuide(event)) closeDemoGuide(); demoBackdropStart = false; });
  ['about-dialog', 'history-dialog'].forEach((id) => {
    $(id).addEventListener('click', (event) => {
      if (event.target !== $(id)) return;
      const rect = $(id).getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $(id).close();
    });
    // Native dialog restores focus to its opener on Escape, close and backdrop.
  });
  fetch('/api/health').then((response) => response.ok ? response.json() : null).then((health) => {
    if (health?.sourceLabel) $('data-source-label').textContent = health.sourceLabel;
    if (health?.recordCount > 0) $('data-description').textContent = Number(health.recordCount).toLocaleString() + ' consultant records with evidence of Spire affiliation. Every profile links to its sources.' + (health.notice ? ' ' + health.notice : '');
  }).catch(() => { /* Search errors appear in context when a request is made. */ });
})();
