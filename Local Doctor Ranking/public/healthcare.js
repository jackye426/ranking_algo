(() => {
  'use strict';

  const mount = document.getElementById('healthcare-view');
  if (!mount) return;

  // This presentation uses the same prepared, verified comparison as the home
  // page. Its renderer owns its controls and motion; this route sends no requests.
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'hc-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', { back: 'M19 12H5m6-6-6 6 6 6', plus: 'M12 5v14M5 12h14' }[name]);
    svg.append(path);
    return svg;
  }

  const page = node('article', 'hc-page');
  page.setAttribute('aria-labelledby', 'healthcare-title');
  const back = node('a', 'hc-return'); back.id = 'healthcare-return'; back.href = '/';
  back.append(icon('back'), node('span', '', 'Return to search'));

  const header = node('header', 'hc-header');
  header.append(node('p', 'hc-eyebrow', 'DocMap for healthcare teams'));
  const heading = node('h1', 'hc-title'); heading.id = 'healthcare-title'; heading.tabIndex = -1;
  heading.append(node('span', '', 'Help patients choose '), node('span', 'hc-title-accent', 'who to contact.'));
  header.append(heading, node('p', 'hc-intro', 'A list of knee specialists still leaves a patient deciding who is relevant to them. DocMap uses their goals and previous care to prioritise profiles and explain the recorded interests behind each option.'));

  const demoOptions = node('nav', 'healthcare-demo-options'); demoOptions.setAttribute('aria-label', 'Try the two demo experiences');
  for (const [mode, title] of [['directory', 'Explore the directory'], ['guided', 'Explore top options']]) {
    const entry = node('a', '', title + ' ↗'); entry.href = '/' + mode; entry.dataset.demoExperience = mode; demoOptions.append(entry);
  }
  header.append(demoOptions);

  const story = node('section', 'hc-story');
  story.setAttribute('aria-label', 'A verified knee search with a running goal and treatment history');
  story.append(node('p', 'hc-context', 'Name, condition and procedure searches help patients find a starting list. DocMap adds the context those terms leave out: what the patient wants to get back to and what they have already tried.'));
  const comparisonMount = node('div', 'hc-comparison'); comparisonMount.id = 'healthcare-comparison';
  comparisonMount.setAttribute('aria-busy', 'true');
  comparisonMount.append(node('p', 'hc-comparison-loading', 'Loading the prepared example…'));
  story.append(comparisonMount);

  const nextStep = node('section', 'hc-next-step'); nextStep.setAttribute('aria-labelledby', 'healthcare-next-step-title');
  const nextHeading = node('h2', 'hc-next-step-title', 'Turn Spire’s expertise into a reason to enquire.'); nextHeading.id = 'healthcare-next-step-title';
  const nextCopy = node('p', 'hc-next-step-copy', 'The opportunity for Spire is to help more patients move from “I found several doctors” to “I understand why I would contact this one”. A pilot would test whether that leads to more informed enquiries and fewer abandoned searches.');
  const values = node('div', 'hc-value-grid');
  [
    ['Surface the expertise already there.', 'Bring relevant clinical interests out of individual consultant profiles and into the patient’s shortlist.'],
    ['Explain why this consultant.', 'Connect the patient’s goal to specific profile evidence, so they can compare options with a reason.'],
    ['Give the enquiry a starting point.', 'Help patients approach Spire with a consultant to explore and a clearer explanation of what they are looking for.']
  ].forEach(([title, description]) => {
    const item = node('div', 'hc-value'); item.append(node('h3', '', title), node('p', '', description)); values.append(item);
  });
  nextStep.append(nextHeading, nextCopy, values);

  const pilot = node('details', 'hc-pilot'); pilot.id = 'healthcare-pilot';
  const pilotSummary = node('summary', 'hc-pilot-summary');
  const pilotHeading = node('span', 'hc-pilot-heading');
  pilotHeading.append(node('span', 'hc-pilot-title', 'Pilot approach'), node('span', 'hc-pilot-caption', 'Agree what to measure before the pilot.'));
  pilotSummary.append(pilotHeading, icon('plus'));
  const pilotBody = node('div', 'hc-pilot-body');
  pilotBody.append(node('p', 'hc-pilot-intro', 'Compare equivalent patient scenarios in the current journey and DocMap. Assess how people choose whom to explore, with clinical review of those choices.'));
  const measures = node('ul', 'hc-measures');
  [
    ['Understanding the choice', 'Can patients identify a relevant consultant and explain their choice? Review those choices clinically.'],
    ['Time to a useful shortlist', 'Measure how long it takes to reach a shortlist worth exploring.'],
    ['Enquiries and booking starts', 'Track whether patients begin an enquiry or booking after exploring a profile.'],
    ['Search abandonment', 'Observe where patients leave before reaching a useful next step.']
  ].forEach(([title, description]) => {
    const item = node('li', 'hc-measure'); item.append(node('h3', '', title), node('p', '', description)); measures.append(item);
  });
  pilotBody.append(measures, node('p', 'hc-pilot-note', 'These are prospective pilot measures, not claimed results.'));
  pilot.append(pilotSummary, pilotBody);
  page.append(back, header, story, nextStep, pilot); mount.replaceChildren(page);

  let comparison = null;
  let visible = !mount.hidden;

  function syncVisibility() {
    comparison?.setVisible(visible && !mount.hidden && document.visibilityState !== 'hidden');
  }

  function connectStory() {
    if (!comparison && window.DocMapComparison?.mount) {
      comparison = window.DocMapComparison.mount(comparisonMount, { idPrefix: 'healthcare-story' });
      if (comparison) comparisonMount.setAttribute('aria-busy', 'false');
    }
    syncVisibility();
  }

  function pause() { comparison?.pause(); }

  window.addEventListener('docmap:comparison-ready', connectStory);
  document.addEventListener('visibilitychange', syncVisibility);
  connectStory();
  window.DocMapHealthcare = Object.freeze({
    setVisible(value) { visible = Boolean(value); connectStory(); },
    pause
  });
  window.dispatchEvent(new Event('docmap:healthcare-ready'));
})();
