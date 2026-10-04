(() => {
  'use strict';

  const mount = document.getElementById('healthcare-view');
  if (!mount) return;

  // A prepared presentation: no inference, search, data refresh or analytics.
  // The specialty and verbatim procedure below were verified in the completed
  // offline-patient-example-audit-v3.json report (2 October 2026). The supporting
  // record retains field-level provenance; the procedure is not attributed to
  // the Spire website merely because the consultant has a Spire profile.
  const evidence = Object.freeze({
    name: 'Mr Chin Hooi Gan',
    specialty: 'Obstetrics and gynaecology',
    procedure: 'Laparoscopic excision of endometriosis, +/-ureterolysis',
    record: '/sources/supabase-c-6050076',
    profile: 'https://www.spirehealthcare.com/spire-elland-hospital/consultants/mr-chin-hooi-gan-c6050076/'
  });

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
    path.setAttribute('d', {
      replay: 'M3 10a9 9 0 1 1 1.5 7M3 4v6h6',
      back: 'M19 12H5m6-6-6 6 6 6',
      arrow: 'M5 12h14m-6-6 6 6-6 6',
      plus: 'M12 5v14M5 12h14',
      source: 'M14 4h6v6m0-6L10 14m0-9H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5'
    }[name]);
    svg.append(path);
    return svg;
  }

  function sourceLink(label, href, className = '') {
    const link = node('a', `hc-source ${className}`.trim());
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${label} (opens in a new tab)`);
    link.append(node('span', '', label), icon('source'));
    return link;
  }

  const page = node('article', 'hc-page');
  page.setAttribute('aria-labelledby', 'healthcare-title');
  const back = node('a', 'hc-return');
  back.id = 'healthcare-return'; back.href = '/';
  back.append(icon('back'), node('span', '', 'Return to search'));

  const header = node('header', 'hc-header');
  header.append(node('p', 'hc-eyebrow', 'DocMap for healthcare teams'));
  const heading = node('h1', 'hc-title');
  heading.id = 'healthcare-title'; heading.tabIndex = -1;
  heading.append(node('span', '', 'Find the expertise'), node('span', 'hc-title-accent', 'behind the title.'));
  header.append(heading, node('p', 'hc-intro', 'A specialty is a starting point. Connect what a patient asks with the detail in a consultant’s record.'));

  const story = node('section', 'hc-story');
  story.setAttribute('aria-label', 'A prepared example connecting patient language with recorded expertise');
  const controls = node('div', 'hc-story-controls');
  const prepared = node('p', 'hc-prepared', 'Prepared demonstration');
  const replay = node('button', 'hc-replay'); replay.type = 'button';
  replay.append(icon('replay'), node('span', '', 'Replay'));
  replay.setAttribute('aria-label', 'Replay the prepared demonstration');
  controls.append(prepared, replay);

  const question = node('div', 'hc-question hc-reveal');
  question.append(node('p', 'hc-step-label', 'In a patient’s words'));
  const quote = node('blockquote', 'hc-patient-words');
  quote.append(document.createTextNode('“I have stage 3 endometriosis. I’m looking for someone who performs '), node('span', 'hc-patient-emphasis', 'excision surgery'), document.createTextNode('.”'));
  question.append(quote);

  const bridge = node('div', 'hc-bridge');
  const identity = node('div', 'hc-identity hc-reveal');
  identity.append(node('p', 'hc-step-label', 'The specialty'));
  identity.append(node('h2', 'hc-specialty', evidence.specialty));
  const person = node('div', 'hc-person');
  const initials = node('span', 'hc-person-initials', 'CG'); initials.setAttribute('aria-hidden', 'true');
  const personCopy = node('div', 'hc-person-copy');
  personCopy.append(node('p', 'hc-person-name', evidence.name), node('p', 'hc-person-caption', 'Spire consultant'));
  person.append(initials, personCopy); identity.append(person);
  identity.append(sourceLink('Spire profile', evidence.profile, 'hc-secondary-source'));

  const connector = node('div', 'hc-connector hc-reveal');
  connector.setAttribute('aria-hidden', 'true');
  connector.append(node('span', 'hc-connector-line'), icon('arrow'));

  const detail = node('div', 'hc-detail hc-reveal');
  detail.append(node('p', 'hc-step-label', 'The relevant detail'));
  detail.append(node('p', 'hc-record-label', 'A procedure listed in the consultant record'));
  const excerpt = node('blockquote', 'hc-record-excerpt');
  excerpt.append(document.createTextNode('Laparoscopic '), node('mark', 'hc-evidence-highlight', 'excision of endometriosis'), document.createTextNode(', +/-ureterolysis'));
  detail.append(excerpt, sourceLink('View supporting record', evidence.record));
  const limit = node('p', 'hc-limit', 'Stage 3 is context shared by the patient. The record does not verify stage-specific expertise.');
  detail.append(limit);
  bridge.append(identity, connector, detail);
  story.append(controls, question, bridge);

  const takeaway = node('div', 'hc-takeaway');
  takeaway.append(node('p', 'hc-takeaway-title', 'The detail gives the patient a reason to explore.'), node('p', 'hc-takeaway-copy', 'Bring relevant recorded practice into view, with evidence the patient can follow.'));

  const pilot = node('details', 'hc-pilot'); pilot.id = 'healthcare-pilot';
  const pilotSummary = node('summary', 'hc-pilot-summary');
  const pilotHeading = node('span', 'hc-pilot-heading');
  pilotHeading.append(node('span', 'hc-pilot-title', 'Pilot approach'), node('span', 'hc-pilot-caption', 'Measure the difference in real patient journeys.'));
  pilotSummary.append(pilotHeading, icon('plus'));
  const pilotBody = node('div', 'hc-pilot-body');
  pilotBody.append(node('p', 'hc-pilot-intro', 'Agree success measures before the pilot. Compare the experience with your current search.'));
  const measures = node('ol', 'hc-measures');
  [
    ['Relevant profiles explored', 'How often a search leads to a relevant consultant profile.'],
    ['Enquiries and booking starts', 'How often patients take the next step after searching.'],
    ['Search abandonment', 'Where patients leave before finding a consultant to explore.']
  ].forEach(([title, description]) => {
    const item = node('li', 'hc-measure');
    item.append(node('h3', '', title), node('p', '', description));
    measures.append(item);
  });
  pilotBody.append(measures, node('p', 'hc-pilot-note', 'Prospective measures for a pilot, not results or claimed improvements.'));
  pilot.append(pilotSummary, pilotBody);
  page.append(back, header, story, takeaway, pilot);
  mount.replaceChildren(page);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  let visible = !mount.hidden;
  let inView = false;
  let played = false;

  function pause() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }

  function play() {
    pause();
    if (!visible || !inView || document.visibilityState === 'hidden' || mount.closest('[hidden]')) return;
    played = true;
    if (motion.matches) return;
    [identity, connector, detail, question].forEach((part, index) => {
      if (typeof part.animate !== 'function') return;
      const animation = part.animate([
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 220, delay: index * 220, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      animations.add(animation);
      Promise.resolve(animation.finished).catch(() => {}).then(() => animations.delete(animation));
    });
  }

  replay.addEventListener('click', play);
  motion.addEventListener?.('change', pause);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pause(); });
  if (typeof window.IntersectionObserver === 'function') {
    const observer = new window.IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) pause();
      else if (visible && !played) play();
    }, { threshold: .2 });
    observer.observe(story);
  } else inView = true;

  window.DocMapHealthcare = Object.freeze({
    setVisible(value) {
      visible = Boolean(value);
      if (!visible) pause();
      else if (!played) play();
    },
    pause
  });
  window.dispatchEvent(new Event('docmap:healthcare-ready'));
})();
