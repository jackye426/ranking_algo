'use strict';

(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', () => { if (!document.body.classList.contains('chat-mode')) window.scrollTo(0, 0); });
  const $ = (id) => document.getElementById(id);
  const state = { epoch: 0, sessionId: null, busy: false, criteria: {}, criteriaLabels: [], controller: null, turns: [], activeTurn: null, explanationControllers: new Set(), lastMessage: '', failedRequest: null };
  const navigation = { screen: 'home', restoring: false, resultsScroll: 0, profiles: new Map(), pendingTraversal: null };
  function routeTo(screen, extra = {}, replace = false) {
    // Back is asynchronous. If another action wins before its popstate event,
    // retain that action and write its route only after traversal has settled.
    if (navigation.pendingTraversal && !navigation.restoring) {
      navigation.pendingTraversal.after = { screen, extra };
      navigation.screen = screen; return;
    }
    if (!navigation.restoring) history[replace ? 'replaceState' : 'pushState']?.({ docmap: true, epoch: state.epoch, screen, ...extra }, '', screen === 'healthcare' ? '/for-healthcare-teams' : '/');
    navigation.screen = screen;
  }
  const initialScreen = window.location.pathname === '/for-healthcare-teams' ? 'healthcare' : 'home';
  routeTo(initialScreen, {}, true);
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
  const inputMirrors = new Map();
  const resizeInput = (input) => {
    // Measure a separate, inaccessible textarea. Collapsing the focused field
    // to measure it can make the browser scroll its caret into view mid-keystroke.
    if (!input.getBoundingClientRect().width) return;
    let mirror = inputMirrors.get(input);
    if (!mirror) {
      mirror = el('textarea', 'input-measure'); mirror.tabIndex = -1; mirror.setAttribute('aria-hidden', 'true');
      document.body.append(mirror); inputMirrors.set(input, mirror);
    }
    const style = window.getComputedStyle(input);
    ['font', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'wordBreak', 'overflowWrap'].forEach((key) => { mirror.style[key] = style[key]; });
    mirror.style.width = `${input.getBoundingClientRect().width}px`;
    mirror.value = input.value || ' ';
    input.style.height = `${Math.min(140, Math.max(parseFloat(style.minHeight) || 44, mirror.scrollHeight))}px`;
  };

  function captureResultsPosition() {
    const region = $('results-region'); const boundary = region.getBoundingClientRect();
    const card = [...(state.activeTurn?.node.querySelectorAll('.consultant-card') || [])].find((node) => {
      const rect = node.getBoundingClientRect(); return rect.bottom > boundary.top && rect.top < boundary.bottom;
    });
    return { top: region.scrollTop, id: card?.dataset.consultantId || null, offset: card ? card.getBoundingClientRect().top - boundary.top : 0 };
  }
  function restoreResultsPosition(position = { top: 0 }) {
    const region = $('results-region');
    const card = position.id && [...(state.activeTurn?.node.querySelectorAll('.consultant-card') || [])].find((node) => node.dataset.consultantId === position.id);
    const top = card ? region.scrollTop + card.getBoundingClientRect().top - region.getBoundingClientRect().top - position.offset : position.top;
    region.scrollTop = Math.max(0, Math.min(top || 0, Math.max(0, region.scrollHeight - region.clientHeight)));
  }
  function showUpdatedMatches() {
    $('results-region').scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
    $('view-updated-matches').hidden = true;
  }
  function setHealthcareVisible(visible) {
    $('healthcare-view').hidden = !visible;
    document.body.classList.toggle('healthcare-mode', visible);
    window.DocMapHealthcare?.setVisible(visible);
    document.title = visible ? 'DocMap — For healthcare teams' : 'DocMap — Find your specialist';
  }
  function showHealthcare({ record = true, focus = true } = {}) {
    if (document.body.classList.contains('chat-mode')) navigation.resultsPosition = captureResultsPosition();
    closeMatchSheet({ immediate: true, restoreFocus: false });
    ['about-dialog', 'history-dialog'].forEach((id) => { if ($(id).open) $(id).close(); });
    examplePrompt.pause(); $('landing').hidden = true; $('workspace').hidden = true; $('search-actions').hidden = true;
    document.body.classList.remove('chat-mode', 'search-entering'); setHealthcareVisible(true);
    if (record) routeTo('healthcare');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (focus) $('healthcare-title')?.focus({ preventScroll: true });
  }

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
  window.DocMapScenarios = demoScenarios;
  function animateElement(node, frames, options) {
    if (reducedMotion || typeof node?.animate !== 'function') return;
    const animation = node.animate(frames, { easing: 'cubic-bezier(.22,1,.36,1)', ...options });
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
    if (!previous.size) { animateElement(turn.node, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 }); return; }
    turn.node.querySelectorAll('.consultant-card').forEach((card) => {
      const before = previous.get(card.dataset.consultantId); const after = card.getBoundingClientRect();
      card.classList.add(before ? 'is-retained' : 'is-new');
      if (after.bottom < 0 || after.top > window.innerHeight) return;
      if (before && before.bottom >= 0 && before.top <= window.innerHeight) {
        const distance = before.top - after.top;
        if (Math.abs(distance) > 1 && Math.abs(distance) < window.innerHeight) animateElement(card, [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }], { duration: 220 });
      } else if (!before) animateElement(card, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 });
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

  function updateResume() {
    $('resume-search').hidden = !state.turns.length && !state.busy && !state.failedRequest;
    $('resume-search').textContent = state.busy ? 'Return to your search in progress ↗' : 'Resume your search ↗';
  }

  function showHome({ record = true } = {}) {
    if (document.body.classList.contains('chat-mode')) navigation.resultsPosition = captureResultsPosition();
    closeMatchSheet({ immediate: true, restoreFocus: false });
    ['about-dialog', 'history-dialog'].forEach((id) => { if ($(id).open) $(id).close(); });
    setHealthcareVisible(false); $('workspace').hidden = true; $('landing').hidden = false; $('search-actions').hidden = true;
    document.body.classList.remove('chat-mode', 'search-entering', 'is-refining');
    if (record) routeTo('home');
    updateResume(); examplePrompt.reset();
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('initial-query').focus({ preventScroll: true });
    announce('Back to search. Your conversation and shortlist are saved in this tab.');
  }

  function resumeSearch({ record = true, focus = true } = {}) {
    if (!state.turns.length && !state.busy && !state.failedRequest) return;
    openConversation({ record });
    restoreResultsPosition(navigation.resultsPosition);
    if (focus) $('followup-query').focus({ preventScroll: true });
  }

  function profileRouteOpened(entry, explain) {
    const key = `${entry.context.searchId}:${entry.person.id}`;
    navigation.profiles.set(key, entry);
    navigation.profileReturn = { trigger: matchSheet.returnFocus, position: matchSheet.resultsPosition };
    routeTo('profile', { profileKey: key, explain: Boolean(explain) }, navigation.screen === 'profile');
  }

  function profileRouteClosed() {
    if (navigation.restoring || navigation.screen !== 'profile') return;
    navigation.screen = 'results';
    if (history.back) { navigation.pendingTraversal = { after: null }; history.back(); }
    else routeTo('results', {}, true);
  }

  window.addEventListener('popstate', (event) => {
    const queued = navigation.pendingTraversal; navigation.pendingTraversal = null;
    if (queued?.after) {
      routeTo(queued.after.screen, queued.after.extra, queued.after.screen !== 'profile');
      return;
    }
    const target = event.state;
    if (!target?.docmap) return; // Ordinary in-page anchors are not app navigation.
    navigation.restoring = true;
    try {
      if (target.screen === 'healthcare') {
        navigation.screen = 'healthcare'; showHealthcare({ record: false });
      } else if (!target?.docmap || target.epoch !== state.epoch || target.screen === 'home') {
        navigation.screen = 'home'; showHome({ record: false });
      } else {
        const leavingProfile = Boolean(matchSheet.entry || queued || navigation.screen === 'profile');
        const returnPosition = leavingProfile && navigation.profileReturn;
        if (returnPosition) navigation.resultsPosition = returnPosition.position;
        closeMatchSheet({ immediate: true, restoreFocus: false });
        navigation.screen = 'results'; resumeSearch({ record: false, focus: !returnPosition });
        const entry = target.screen === 'profile' && navigation.profiles.get(target.profileKey);
        if (entry && entry.epoch === state.epoch) openMatchSheet(entry, { explain: false });
        else if (returnPosition?.trigger?.isConnected) returnPosition.trigger.focus({ preventScroll: true });
      }
    } finally { navigation.restoring = false; }
  });

  function openConversation({ record = true } = {}) {
    if (document.body.classList.contains('chat-mode')) return;
    const epoch = state.epoch;
    examplePrompt.pause();
    setHealthcareVisible(false); $('landing').hidden = true; $('workspace').hidden = false; $('search-actions').hidden = false;
    if (record) routeTo('results');
    document.body.classList.add('chat-mode', 'search-entering');
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.requestAnimationFrame(() => {
      if (epoch !== state.epoch || reducedMotion) return;
      resizeInput($('followup-query'));
      animateElement($('followup-form'), [{ opacity: .6 }, { opacity: 1 }], { duration: 220 });
    });
    window.setTimeout(() => { if (epoch === state.epoch) document.body.classList.remove('search-entering'); }, reducedMotion ? 0 : 220);
  }

  function reset() {
    closeMatchSheet({ immediate: true, restoreFocus: false });
    state.epoch += 1;
    runningAnimations.forEach((animation) => animation.cancel()); runningAnimations.clear();
    state.controller?.abort();
    state.explanationControllers.forEach((controller) => controller.abort()); state.explanationControllers.clear();
    Object.assign(state, { sessionId: null, busy: false, criteria: {}, criteriaLabels: [], controller: null, turns: [], activeTurn: null, lastMessage: '', failedRequest: null });
    navigation.profiles.clear(); navigation.resultsPosition = { top: 0 }; routeTo('home', {}, true);
    ['conversation', 'active-criteria', 'search-status', 'search-error', 'history-list', 'submitted-message'].forEach((id) => $(id).replaceChildren());
    $('submitted-message').hidden = true;
    ['history-dialog', 'about-dialog'].forEach((id) => { if ($(id).open) $(id).close(); });
    setHealthcareVisible(false); $('workspace').hidden = true; $('landing').hidden = false; $('search-actions').hidden = true; $('history-preview').hidden = true;
    $('results-region').scrollTop = 0; $('view-updated-matches').hidden = true;
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
    document.querySelectorAll('.explanation-toggle, .view-consultant').forEach((button) => { button.disabled = busy; });
    $('followup-query').disabled = Boolean(preview);
    $('followup-query').placeholder = preview ? 'Return to your current search to refine' : 'Tell us more, or refine your search…';
    $('history-open').disabled = busy || !state.turns.length;
    $('conversation').setAttribute('aria-busy', String(busy));
    updateResume();
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
    $('submitted-message').hidden = true; $('view-updated-matches').hidden = true;
    $('search-status').replaceChildren(el('span', 'status-pulse'), el('span', '', state.turns.length ? 'Updating your shortlist…' : 'Finding your specialists…'));
    if (state.turns.length) return null;
    const skeleton = el('div', 'skeleton-list'); skeleton.setAttribute('aria-hidden', 'true');
    for (let cardIndex = 0; cardIndex < 2; cardIndex++) {
      const card = el('div', 'skeleton-card'); card.append(el('div', 'skeleton-avatar')); const lines = el('div', 'skeleton-lines');
      for (let i = 0; i < 4; i++) lines.append(el('div', 'skeleton-line'));
      card.append(lines); skeleton.append(card);
    }
    $('conversation').append(skeleton); return skeleton;
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
  const matchSheet = { dialog: $('match-dialog'), entry: null, version: 0, closeTimer: null, returnFocus: null, resultsPosition: { top: 0 } };

  function cancelExplanation(entry, reason = 'closed') {
    if (!entry?.pending) return;
    entry.pending.controller.abort(reason);
    window.clearTimeout(entry.pending.timeout);
    state.explanationControllers.delete(entry.pending.controller);
    entry.pending = null;
  }

  function closeMatchSheet({ immediate = false, restoreFocus = true } = {}) {
    if (!matchSheet.entry && !matchSheet.dialog.open) return;
    if (restoreFocus) profileRouteClosed();
    const entry = matchSheet.entry; const version = ++matchSheet.version;
    if (entry) entry.sheetState = { scrollTop: $('sheet-scroll').scrollTop, sourcesOpen: Boolean($('sheet-provenance').querySelector('details')?.open) };
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
      if (restoreFocus) restoreResultsPosition(matchSheet.resultsPosition);
    };
    if (immediate || reducedMotion || !matchSheet.dialog.open) finish();
    else matchSheet.closeTimer = window.setTimeout(finish, 280);
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
    const summary = el('summary', 'sheet-sources-toggle'); summary.append(el('span', '', 'Sources & evidence'), icon('chevron')); details.append(summary);
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
    if (person.description) body.append(el('h3', '', 'Original profile description'), el('p', 'sheet-record-description', person.description));
    const originalInterests = list(person.clinicalInterests).map(textValue).filter(Boolean);
    if (originalInterests.length) {
      body.append(el('h3', '', 'Clinical interests as recorded'));
      const original = el('ul'); originalInterests.forEach(text => original.append(el('li', '', text))); body.append(original);
    }
    const insurance = list(person.insuranceEvidence).filter(Boolean);
    if (insurance.length) {
      body.append(el('h3', '', 'Insurance details from source'));
      insurance.forEach((item) => { const paragraph = el('p', '', typeof item === 'string' ? item : item.text || item.note || item.description || ''); const source = link('Source', item.sourceUrl || item.url, 'source-link'); if (source) paragraph.append(document.createTextNode(' '), source); body.append(paragraph); });
    }
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

  function displayProfileText(value) {
    // Repair missing sentence spacing for reading only. The exact source text
    // remains available in the evidence disclosure.
    return String(value || '').trim().replace(/([a-z0-9])\.([A-Z][a-z])/g, '$1. $2');
  }

  function readableProfileExcerpt(value, maximum = 160) {
    const text = String(value || '').trim();
    if (text.length < 5 || text.length > maximum || /\+\/-|±|\b[A-Z]\d{4}\b|[.…]{2,}$|…$|[-/:;,]$/.test(text)) return false;
    // Characteristic mis-decoded UTF-8 and the observed r-split source remnant
    // are withheld from presentation, not repaired into an invented specialty.
    if (/\uFFFD|Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â(?:€|[\u0080-\u00bf])|\byGene\b/u.test(text)) return false;
    const brackets = []; const pairs = { ')': '(', ']': '[' };
    for (const char of text) {
      if (char === '(' || char === '[') brackets.push(char);
      else if (char === ')' || char === ']') { if (brackets.pop() !== pairs[char]) return false; }
    }
    if (brackets.length || /[a-z]:[A-Z]|\)[A-Za-z]|[a-z]{3,}[A-Z][a-z]{2,}/.test(text)) return false;
    // Observed ingestion fragments, not a clinical vocabulary allow-list. Short
    // valid terms such as hip, ear, eye, OA, GI and MS must remain available.
    if (/\b(?:su|Su|Expe|expe)(?=$|[.,;])/.test(text) || /^(?:tise:|ea of\b)/.test(text) || /\b(?:and|or|with|of|for|in|the|to)\.?$/i.test(text)) return false;
    return true;
  }

  function informativeProfilePhrase(value) {
    const text = String(value || '').replace(/^The profile (?:includes|lists)\s*:?[ ]*/i, '').replace(/[.!?]+$/, '').trim().toLowerCase();
    const anatomy = new Set(['knee', 'knees', 'hip', 'hips', 'shoulder', 'shoulders', 'foot', 'feet', 'ankle', 'ankles', 'elbow', 'elbows', 'hand', 'hands', 'wrist', 'wrists', 'spine', 'back', 'neck', 'skin', 'ear', 'ears', 'nose', 'throat', 'joint', 'joints']);
    return Boolean(text) && !text.split(/\s*(?:,|\band\b|&|\/)\s*/).every(part => anatomy.has(part));
  }

  function profileSentences(value) {
    const text = displayProfileText(value);
    const sentences = typeof Intl?.Segmenter === 'function' ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)].map(item => item.segment.trim()) : [text];
    return sentences.filter(sentence => /[.!?][”"']?$/.test(sentence) && readableProfileExcerpt(sentence, 240));
  }

  function conciseProfileRelevance(person, context = {}) {
    if (!baselineCitations(person).length) return '';
    const summary = displayProfileText(person.personalizedMatch?.summary);
    // The existing grounded summary has a known identity introduction. Keep its
    // complete clinical sentence, without repeating identity or boilerplate.
    const marker = summary.match(/\b(?:whose profile includes|has a profile that includes)\s+/);
    if (marker) {
      const phrase = profileSentences(summary.slice(marker.index + marker[0].length))[0];
      if (phrase && phrase.length <= 200 && informativeProfilePhrase(phrase)) return `The profile includes ${phrase}`;
    }
    const sentence = profileSentences(summary).find(text => informativeProfilePhrase(text) && !/^(?:That connects|The nearest|Check the|Insurer|Confirm|Procedure evidence)/i.test(text) && (!person.name || !text.startsWith(person.name)));
    if (sentence) return sentence;
    const fact = profileHighlights(person, context, 1)[0]?.text;
    if (!fact) {
      const biography = profileSentences(person.description);
      return biography.find(text => /\b(?:practice|treat(?:s|ment)?|specialist interest|subspecialty|clinical interests?)\b/i.test(text) && !/\b(?:training|fellowship|research|publication)\b/i.test(text)) || biography[0] || '';
    }
    if (/[.!?]$/.test(fact)) return fact;
    return `The profile lists ${fact}.`;
  }

  function profileHighlights(person, context = {}, maximum = 3) {
    // These are excerpts, not new clinical claims. Query overlap only chooses
    // which documented details to show first; it never changes search ranking.
    const criteria = context.criteria || {};
    const query = [criteria.topic, ...list(criteria.procedures), ...list(criteria.clinicalContext)].map(textValue).join(' ').toLowerCase();
    const words = [...new Set(query.match(/[a-z]{3,}/g) || [])].filter(word => !/^(?:the|and|with|have|want|need|that|this|for|from|has|had|not|been|only|specialist|consultant|doctor)$/.test(word));
    const clinicalFact = fact => fact.kind !== 'terminology' && !/location|specialty|consultant identity|language|gender|insurance|plain.english|terminology/i.test(fact.criterion || '') && !/\b(?:miles|fee assured|open referral|Bupa|AXA|insurance)\b/i.test(fact.text);
    const candidates = [
      ...baselineCitations(person).filter(clinicalFact).map(fact => ({ text: fact.text.replace(/^(?:Profile lists|Record lists|Specialty):\s*/i, '').trim(), sourceUrl: fact.sourceUrl })),
      ...list(person.clinicalInterests).map(textValue).filter(Boolean).map(text => ({ text: text.trim(), sourceUrl: person.evidenceUrl || person.profileUrl })),
    ];
    const seen = new Set();
    return candidates.filter(item => {
      const key = item.text.toLowerCase().replace(/[.]+$/, '').replace(/\s+/g, ' ');
      if (seen.has(key) || !readableProfileExcerpt(item.text) || !informativeProfilePhrase(item.text)) return false;
      if (/\b(?:I am|I have|my|we|our|qualified|graduated|trained|training|fellowship|career|appointed)\b|\byears? (?:of )?experience\b/i.test(item.text)) return false;
      seen.add(key); return true;
    }).map((item, index) => ({ ...item, index, overlap: words.filter(word => item.text.toLowerCase().includes(word)).length }))
      .sort((a, b) => b.overlap - a.overlap || a.index - b.index).slice(0, maximum);
  }

  function profileText(text, className = '') {
    const clean = displayProfileText(text);
    const block = el('div', `profile-text ${className}`.trim()); const paragraph = el('p', 'profile-description', clean); block.append(paragraph);
    if (clean.length > 340) {
      block.classList.add('is-collapsed');
      const toggle = el('button', 'profile-read-more', 'Read more'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => { const collapsed = block.classList.toggle('is-collapsed'); toggle.setAttribute('aria-expanded', String(!collapsed)); toggle.textContent = collapsed ? 'Read more' : 'Show less'; });
      block.append(toggle);
    }
    return block;
  }

  function renderConsultantProfile(entry) {
    const person = entry.person; const profile = el('div', 'consultant-profile');
    const accordion = (title, className) => {
      const details = el('details', `profile-accordion ${className}`); const toggle = el('summary', 'profile-accordion-toggle');
      toggle.append(el('span', '', title), icon('chevron')); details.append(toggle);
      const body = el('div', 'profile-accordion-body'); details.append(body); return { details, body };
    };
    const languages = [...new Set(list(person.languages).map(textValue).filter(Boolean))];
    const insurers = list(person.insurers).map(textValue).filter(Boolean);
    if (person.description || languages.length || insurers.length || person.gmc) {
      const about = accordion('About', 'profile-about');
      if (person.description) about.body.append(el('p', 'profile-description', displayProfileText(person.description)));
      if (languages.length || insurers.length || person.gmc) {
        const facts = el('dl', 'profile-facts');
        const fact = (label, value) => { const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); facts.append(row); };
        if (languages.length) fact('Languages listed', languages.join(' · '));
        if (insurers.length) fact('Insurer recognition listed', insurers.join(' · '));
        if (person.gmc) fact('GMC registration', person.gmc);
        about.body.append(facts);
      }
      profile.append(about.details);
    }
    const interests = [...new Set(list(person.clinicalInterests).map(textValue).map(text => text.trim()).filter(text => readableProfileExcerpt(text, 500) && informativeProfilePhrase(text)))];
    const highlights = profileHighlights(person, entry.context, 3);
    if (interests.length || highlights.length) {
      const focus = accordion('Clinical focus', 'profile-clinical');
      const items = el('ul', 'profile-focus-list');
      const shown = highlights.length ? highlights.map(item => item.text) : interests.slice(0, 3);
      const shownKeys = new Set(shown.map(text => text.toLowerCase().replace(/[.]+$/, '')));
      const remaining = interests.filter(text => !shownKeys.has(text.toLowerCase().replace(/[.]+$/, '')));
      [...shown, ...remaining].forEach(text => items.append(el('li', '', text))); focus.body.append(items); profile.append(focus.details);
    }
    const locations = list(person.locations).filter(Boolean);
    if (locations.length) {
      const section = accordion(locations.length === 1 ? 'Practice location' : 'Practice locations', 'profile-locations');
      locations.forEach((location, index) => {
        const place = el('div', 'profile-location'); const name = typeof location === 'string' ? location : location.name || location.address || location.postcode;
        const heading = el('p', 'profile-location-name'); heading.append(icon('pin'), el('span', '', name || 'Recorded practice')); place.append(heading);
        if (typeof location === 'object') {
          const address = [...new Set([location.address, location.city, location.postcode].filter(Boolean))].join(', ');
          if (address && address !== name) place.append(el('p', 'profile-location-address', address));
        }
        if (index === 0 && (person.distanceLabel || Number.isFinite(person.distanceMiles))) place.append(el('p', 'profile-location-distance', `${person.distanceLabel || `${person.distanceMiles.toFixed(1)} miles away`} · approximate straight-line distance`));
        section.body.append(place);
      });
      profile.append(section.details);
    }
    const external = link('View full Spire profile', person.profileUrl, 'profile-external-link');
    if (external) { external.append(icon('external')); profile.append(external); }
    return profile;
  }

  function renderSheet(entry) {
    if (matchSheet.entry !== entry || entry.epoch !== state.epoch) return;
    const content = $('sheet-content'); const fragment = document.createDocumentFragment();
    const scroller = $('sheet-scroll'); const priorScroll = scroller.scrollTop;
    // Keep accordions mounted while only the first, independent AI panel changes.
    // Retaining the node per result also retains disclosure states on reopening.
    const profile = entry.profileNode || (entry.profileNode = renderConsultantProfile(entry));
    let panel = content.querySelector('.profile-match-panel');
    const preserveBelow = panel && panel.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top;
    const beforeProfileTop = preserveBelow ? profile.getBoundingClientRect().top : null;
    if (!panel) {
      panel = el('section', 'profile-match-panel'); panel.setAttribute('aria-label', 'Why this could be a match');
      matchSheet.caveatsNode ||= $('sheet-caveats'); content.append(panel, matchSheet.caveatsNode, profile);
    }
    const busy = Boolean(entry.pending); const data = entry.cached;
    matchSheet.dialog.classList.toggle('is-loading', busy); matchSheet.dialog.classList.toggle('is-ready', Boolean(data));
    content.setAttribute('aria-busy', 'false'); panel.setAttribute('aria-busy', String(busy));
    const heading = el('h3', 'profile-match-heading'); heading.append(icon('spark'), el('span', '', 'Why this could be a match')); fragment.append(heading);
    const baseline = conciseProfileRelevance(entry.person, entry.context);
    if (!data && baseline) {
      const preview = el('section', 'sheet-preview'); preview.append(el('p', 'sheet-provider', 'From profile evidence'), el('p', 'sheet-summary', baseline)); fragment.append(preview);
    }
    if (busy) {
      const hasSummary = Boolean(baseline);
      const progress = el('div', `sheet-progress${hasSummary ? ' has-summary' : ''}`); const label = el('p', 'sheet-progress-text'); label.append(el('span', 'explanation-pulse'), document.createTextNode(data ? 'Checking your explanation…' : 'Personalising your explanation…')); progress.append(label);
      if (!data && !hasSummary) { const skeleton = el('div', 'sheet-skeleton'); skeleton.setAttribute('aria-hidden', 'true'); for (let index = 0; index < 3; index++) skeleton.append(el('span')); progress.append(skeleton); }
      fragment.append(progress);
    } else if (!data && !entry.error) {
      if (!baseline) fragment.append(el('p', 'profile-match-intro', 'Connect your search with the details in this consultant’s profile.'));
      const start = el('button', 'explanation-start', 'Personalise my match'); start.type = 'button'; start.addEventListener('click', () => loadMatchExplanation(entry)); fragment.append(start);
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
    if (panel.contains(document.activeElement)) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
    panel.replaceChildren(fragment); renderSheetCaveats(entry); renderSheetSources(entry);
    if (preserveBelow) scroller.scrollTop = priorScroll + profile.getBoundingClientRect().top - beforeProfileTop;
    else if (scroller.scrollTop !== priorScroll) scroller.scrollTop = priorScroll;
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

  function openMatchSheet(entry, { explain = true, trigger = entry.button } = {}) {
    if (state.busy) return;
    if (matchSheet.entry === entry && matchSheet.dialog.open && !matchSheet.dialog.classList.contains('is-closing')) {
      if (explain && !entry.cached && !entry.error) loadMatchExplanation(entry);
      profileRouteOpened(entry, explain);
      return;
    }
    closeMatchSheet({ immediate: true, restoreFocus: false });
    entry.button = trigger;
    matchSheet.entry = entry; matchSheet.version += 1; matchSheet.returnFocus = trigger;
    matchSheet.resultsPosition = captureResultsPosition();
    entry.button.setAttribute('aria-expanded', 'true');
    const identity = el('div', 'sheet-person'); const title = el('div', 'sheet-person-copy');
    title.append(el('h2', 'sheet-name', entry.person.name || 'Consultant profile')); title.firstElementChild.id = 'sheet-consultant-name';
    const specialty = list(entry.person.specialty).map(textValue).filter(Boolean).join(' · '); if (specialty) title.append(el('p', 'sheet-specialty', specialty));
    const locations = list(entry.person.locations).filter(Boolean);
    if (locations.length) { const first = locations[0]; const name = typeof first === 'string' ? first : first.name || first.city || first.postcode; if (name) title.append(el('p', 'sheet-practice', name + (locations.length > 1 ? ` · +${locations.length - 1} listed practice${locations.length > 2 ? 's' : ''}` : ''))); }
    identity.append(portrait(entry.person, 'sheet-avatar'), title); $('sheet-identity').replaceChildren(identity);
    $('sheet-provenance').replaceChildren(); $('sheet-content').replaceChildren(); $('sheet-status').textContent = '';
    matchSheet.dialog.classList.remove('is-closing'); matchSheet.dialog.classList.add('is-opening'); document.body.classList.add('sheet-open');
    renderSheet(entry); matchSheet.dialog.showModal();
    const sources = $('sheet-provenance').querySelector('details'); if (sources) sources.open = Boolean(entry.sheetState?.sourcesOpen);
    $('sheet-scroll').scrollTop = entry.sheetState?.scrollTop || 0; $('sheet-close').focus({ preventScroll: true });
    const version = matchSheet.version;
    window.setTimeout(() => { if (version === matchSheet.version) matchSheet.dialog.classList.remove('is-opening'); }, reducedMotion ? 0 : 280);
    if (explain && !entry.cached && !entry.error) loadMatchExplanation(entry);
    profileRouteOpened(entry, explain);
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
    return profileHighlights(person, context, 3);
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
      if (locations.length > 1) practical.append(el('span', 'card-other-locations', `+${locations.length - 1} listed practice${locations.length > 2 ? 's' : ''}`));
    }
    const insurers = list(person.insurers).map(textValue).filter(Boolean); const requested = String(searchContext.criteria?.insurance || '').toLowerCase();
    const shownInsurers = requested ? insurers.filter((insurer) => insurer.toLowerCase().includes(requested)) : insurers.slice(0, 1);
    if (shownInsurers.length) {
      const row = el('div', 'insurance-row');
      shownInsurers.forEach((insurer) => { const label = el('span', 'insurance-pill'); label.append(icon('check'), document.createTextNode(`${insurer} listed`)); row.append(label); });
      const shownNames = new Set(shownInsurers.map((insurer) => insurer.toLowerCase()));
      const evidence = list(person.insuranceEvidence).filter(Boolean).filter((item) => !item.insurer || shownNames.has(String(item.insurer).toLowerCase())).map((item) => typeof item === 'string' ? item : item.text || item.note || '').join(' ');
      if (/not fee assured/i.test(evidence)) row.append(el('span', 'insurance-exception', 'Not fee assured'));
      if (/not in (?:the |bupa.s )?open referral/i.test(evidence)) row.append(el('span', 'insurance-exception', 'Not in Open Referral'));
      practical.append(row);
    }
    if (practical.childElementCount) article.append(practical);
    const focus = differentiator(person, searchContext);
    if (focus.length) {
      const note = el('div', 'card-differentiator'); note.append(el('span', 'card-focus-label', 'Profile includes'));
      const details = el('ul', 'card-focus-list'); focus.forEach(item => details.append(el('li', 'card-focus-text', item.text))); note.append(details); article.append(note);
    }
    const relevance = conciseProfileRelevance(person, searchContext) || (!focus.length ? profileSentences(person.description)[0] : '');
    if (relevance) article.append(el('p', 'card-match-summary', relevance));
    const actions = el('div', 'card-actions');
    const view = el('button', 'view-consultant explanation-toggle', 'View consultant'); view.type = 'button'; view.id = `explanation-toggle-${++explanationNumber}`; view.setAttribute('aria-haspopup', 'dialog'); view.setAttribute('aria-controls', 'match-dialog'); view.setAttribute('aria-expanded', 'false'); view.setAttribute('aria-label', `View ${person.name || 'this consultant'}’s profile and match explanation`); view.append(icon('chevron'));
    const disclosure = el('span', 'sr-only', 'Opens the profile and prepares an explanation using your search and linked profile evidence.'); disclosure.id = `${view.id}-disclosure`; view.setAttribute('aria-describedby', disclosure.id);
    const entry = { person, context: searchContext, epoch: state.epoch, button: view, cached: null, pending: null, error: null,
      request: Object.freeze({ sessionId: searchContext.sessionId, searchId: searchContext.searchId, consultantId: person.id }) };
    view.addEventListener('click', () => openMatchSheet(entry, { explain: true, trigger: view })); actions.append(view, disclosure);
    article.addEventListener('click', event => {
      if (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || state.busy || view.disabled) return;
      if (event.target.closest('button, a, input, textarea, select, summary, details, [contenteditable="true"]')) return;
      const selection = window.getSelection?.(); if (selection && !selection.isCollapsed && String(selection).trim()) return;
      view.click();
    });
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
      window.requestAnimationFrame(() => { if (epoch === state.epoch) showUpdatedMatches(); });
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
    const edit = () => {
      // An existing draft is never silently replaced by the failed message.
      if (!$('followup-query').value.trim()) { $('followup-query').value = request.message || displayMessage; resizeInput($('followup-query')); }
      $('followup-query').focus({ preventScroll: true });
    };
    retry.addEventListener('click', expired ? reset : error.clarification ? edit : () => send(request, displayMessage, { preserveDraft: true }));
    errorBox.append(retry);
    if (!expired && !error.clarification) { const editButton = el('button', 'text-button edit-request', 'Edit request'); editButton.type = 'button'; editButton.addEventListener('click', edit); errorBox.append(editButton); }
    $('search-error').hidden = false; $('search-error').replaceChildren(errorBox);
    announce(expired ? 'Search expired. Your earlier results are still available.' : 'Search could not be updated. Your previous shortlist and preferences remain.');
  }

  function renderSubmittedMessage(message, pending = false) {
    const container = $('submitted-message'); container.replaceChildren(); container.hidden = !message;
    container.title = message;
    if (message) container.append(icon('check'), el('span', 'message-text', pending ? 'Request sent' : 'Shortlist updated'));
  }

  async function send(request, displayMessage, { preserveDraft = false } = {}) {
    if (state.busy || (state.activeTurn && state.activeTurn !== state.turns.at(-1))) return;
    const payload = { ...request };
    if ('message' in payload) { payload.message = payload.message.trim(); if (!payload.message) return; }
    const message = displayMessage || payload.message || 'Updated search preferences';
    const epoch = state.epoch;
    closeMatchSheet({ immediate: true, restoreFocus: false });
    if (navigation.screen === 'profile') routeTo('results', {}, true);
    openConversation();
    const beforeClear = captureResultsPosition(); $('search-error').replaceChildren(); restoreResultsPosition(beforeClear);
    state.lastMessage = message; state.failedRequest = null;
    renderSubmittedMessage(message, true);
    if (payload.message && !preserveDraft) {
      ['initial-query', 'followup-query'].forEach((id) => { $(id).value = ''; resizeInput($(id)); });
    }
    const skeleton = loading(); setBusy(true);
    // Focus follows submission, never a later network response.
    $('followup-query').focus({ preventScroll: true });
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
      const position = $('workspace').hidden ? navigation.resultsPosition || { top: 0 } : captureResultsPosition();
      const previous = cardPositions();
      state.sessionId = data.sessionId; state.criteria = data.criteria || {}; state.criteriaLabels = turn.labels;
      state.turns.push(turn); $('conversation').append(turn.node);
      skeleton?.remove(); $('search-status').replaceChildren();
      showTurn(turn, false);
      if (!$('workspace').hidden) { restoreResultsPosition(position); animateShortlist(turn, previous); }
      else navigation.resultsPosition = position;
      $('view-updated-matches').hidden = state.turns.length < 2;
      renderSubmittedMessage(message);
      announce((data.message || 'Your shortlist is ready.') + ' ' + data.results.length + ' profiles displayed.');
    } catch (error) {
      if (epoch !== state.epoch || state.controller !== controller) return;
      skeleton?.remove(); $('search-status').replaceChildren();
      if (controller.signal.aborted) error = new Error('This is taking longer than expected. Please try again. Your current shortlist is unchanged.');
      state.failedRequest = { request: payload, message };
      const position = captureResultsPosition();
      renderError(error, payload, message);
      if (!$('workspace').hidden) restoreResultsPosition(position);
      renderSubmittedMessage('Search not updated'); $('submitted-message').querySelector('.message-text').textContent = 'Search not updated';
      $('view-updated-matches').hidden = false;
    } finally {
      window.clearTimeout(timeout);
      if (epoch === state.epoch && state.controller === controller) {
        state.controller = null; setBusy(false);
      }
    }
  }

  ['initial-query', 'followup-query'].forEach((id) => {
    const input = $(id); input.addEventListener('input', () => resizeInput(input));
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); input.form.requestSubmit(); } });
  });
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(() => ['initial-query', 'followup-query'].forEach((id) => resizeInput($(id))));
  });
  function updateViewport() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--app-height', `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
  }
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport); updateViewport();
  function startSearch(message) {
    if (!message.trim()) return;
    if (state.sessionId || state.turns.length || state.busy || state.failedRequest) reset();
    send({ message }, message);
  }
  $('landing-form').addEventListener('submit', (event) => { event.preventDefault(); startSearch($('initial-query').value); });
  $('followup-form').addEventListener('submit', (event) => { event.preventDefault(); send({ message: $('followup-query').value }, $('followup-query').value); });
  document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => startSearch(button.dataset.query)));
  $('new-search').addEventListener('click', reset);
  $('brand-home').addEventListener('click', () => showHome());
  $('back-search').addEventListener('click', () => { if (history.back && navigation.screen === 'results') history.back(); else showHome(); });
  $('resume-search').addEventListener('click', () => resumeSearch());
  $('view-updated-matches').addEventListener('click', showUpdatedMatches);
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('#healthcare-open, #healthcare-return');
    if (!anchor || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (anchor.id === 'healthcare-open') showHealthcare();
    else if (state.turns.length || state.busy || state.failedRequest) resumeSearch();
    else showHome();
  });
  window.addEventListener('docmap:healthcare-ready', () => window.DocMapHealthcare?.setVisible(navigation.screen === 'healthcare'));
  $('see-how').addEventListener('click', (event) => { event.preventDefault(); $('homepage-story').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }); });
  $('return-current').addEventListener('click', () => { showTurn(state.turns.at(-1), true); $('followup-query').focus({ preventScroll: true }); announce('Back to your current search.'); });
  $('history-open').addEventListener('click', () => { renderHistory(); $('history-dialog').showModal(); });
  $('history-close').addEventListener('click', () => $('history-dialog').close());
  $('about-open').addEventListener('click', () => $('about-dialog').showModal());
  ['about-close', 'about-done'].forEach((id) => $(id).addEventListener('click', () => $('about-dialog').close()));
  $('demo-guide-about').addEventListener('click', () => { $('about-dialog').close(); showHome(); $('homepage-story').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }); });
  ['about-dialog', 'history-dialog'].forEach((id) => {
    $(id).addEventListener('click', (event) => {
      if (event.target !== $(id)) return;
      const rect = $(id).getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $(id).close();
    });
    // Native dialog restores focus to its opener on Escape, close and backdrop.
  });
  if (initialScreen === 'healthcare') showHealthcare({ record: false, focus: false });
  document.documentElement.removeAttribute('data-entry');
  fetch('/api/health').then((response) => response.ok ? response.json() : null).then((health) => {
    if (health?.sourceLabel) $('data-source-label').textContent = health.sourceLabel;
    if (health?.recordCount > 0) $('data-description').textContent = Number(health.recordCount).toLocaleString() + ' consultant records with evidence of Spire affiliation. Every profile links to its sources.' + (health.notice ? ' ' + health.notice : '');
  }).catch(() => { /* Search errors appear in context when a request is made. */ });
})();
