(() => {
  'use strict';
  const mount = document.getElementById('homepage-story');
  if (!mount) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function arrow() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'wt-icon'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 12h14m-6-6 6 6-6 6'); svg.append(path); return svg;
  }

  const section = element('section', 'wt-showcase');
  section.setAttribute('aria-labelledby', 'wt-title');
  const intro = element('header', 'wt-introduction');
  const title = element('h2', 'wt-title', 'The details change who you consider.');
  title.id = 'wt-title';
  intro.append(element('p', 'wt-eyebrow', 'A search with more of you in it.'), title, element('p', 'wt-intro-copy', 'Share what matters to you. See which recorded interests connect with your situation.'));
  const comparisonMount = element('div', 'wt-comparison'); comparisonMount.id = 'homepage-comparison';
  const actions = element('div', 'wt-actions');
  const trySearch = element('button', 'wt-try'); trySearch.type = 'button';
  trySearch.append(element('span', '', 'Try your own search'), arrow());
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  trySearch.addEventListener('click', () => {
    const input = document.getElementById('initial-query');
    if (!input || input.closest('[hidden]')) return;
    // This explicit action only returns focus; it preserves draft and session.
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: 'center' });
  });
  actions.append(trySearch);
  section.append(intro, comparisonMount, actions);
  const footer = element('footer', 'wt-footer');
  const healthcare = element('a', 'wt-healthcare-link');
  healthcare.id = 'healthcare-open'; healthcare.href = '/for-healthcare-teams';
  healthcare.append(element('span', '', 'For healthcare teams'), arrow()); footer.append(healthcare);
  mount.replaceChildren(section, footer);

  let comparison;
  const initialise = () => {
    if (!comparison && window.DocMapComparison) comparison = window.DocMapComparison.mount(comparisonMount, { idPrefix: 'homepage-story' });
  };
  initialise();
  window.addEventListener('docmap:comparison-ready', initialise);
  window.DocMapWalkthrough = Object.freeze({
    pause() { comparison?.pause(); },
    setVisible(value) { comparison?.setVisible(value); }
  });
})();
