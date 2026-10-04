(() => {
  'use strict';

  const mount = document.getElementById('homepage-story');
  if (!mount) return;

  // Prepared walkthroughs, not live search results. Prompts share the semantic
  // regression fixtures in app.js. Excerpts were checked against the completed
  // offline-patient-example-audit-v3.json report (2 October 2026).
  const stories = [
    {
      id: 'runner', title: 'Remember what matters',
      description: 'Your goals and what you’ve already tried.',
      context: ['Knee pain', 'Return to running', 'Physiotherapy tried'],
      understanding: 'Your running goal stays in focus. Previous treatment adds context, without assuming you need surgery.',
      name: 'Dr Mark Ridgewell', excerpt: 'Knee pain · Running injuries',
      relevance: 'Recorded clinical interests that connect with your concern and your goal.',
      source: 'https://www.spirehealthcare.com/spire-cardiff-hospital/consultants/dr-mark-ridgewell-c3116968/',
      evidenceId: 'supabase-c-3116968',
      prompts: ['I’m a runner with knee pain and want to get back to running', 'Physiotherapy hasn’t helped']
    },
    {
      id: 'symptoms', title: 'Start in your own words',
      description: 'You don’t need to know the medical term.',
      context: ['Painful periods', 'Gynaecology', 'No diagnosis assumed'],
      understanding: 'The symptom stays central. Your follow-up narrows the specialty, without treating endometriosis as a diagnosis.',
      name: 'Mr Wenzhuang Chin', excerpt: 'Painful periods',
      relevance: 'A documented clinical interest to explore, without assuming what is causing your symptoms.',
      source: 'https://www.spirehealthcare.com/spire-thames-valley-hospital/consultants/mr-wenzhuang-chin-c7043088/',
      evidenceId: 'supabase-c-7043088',
      prompts: ['My periods are very painful and I haven’t been diagnosed with endometriosis', 'Only gynaecologists']
    },
    {
      id: 'procedure', title: 'Get more specific',
      description: 'Connect a diagnosis with a particular procedure.',
      context: ['Endometriosis', 'Excision surgery', 'Stage 3 shared by you'],
      understanding: '“Excision” connects to your earlier endometriosis concern, even when you ask in a separate message.',
      name: 'Mr Chin Hooi Gan', excerpt: 'Laparoscopic excision of endometriosis, +/-ureterolysis',
      relevance: 'The procedure is recorded. Expertise specifically in stage 3 disease still needs to be confirmed.',
      source: 'https://www.spirehealthcare.com/spire-elland-hospital/consultants/mr-chin-hooi-gan-c6050076/',
      evidenceId: 'supabase-c-6050076',
      prompts: ['I have stage 3 endometriosis', 'I want a specialist who performs excision surgery']
    }
  ].map(story => {
    const scenario = window.DocMapScenarios?.find(item => item.id === story.id);
    return { ...story, prompts: scenario?.prompts || story.prompts };
  });

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  let current = 0;
  let played = false;
  let inView = false;
  const tabs = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'wt-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', {
      replay: 'M3 10a9 9 0 1 1 1.5 7M3 4v6h6',
      arrow: 'M5 12h14m-6-6 6 6-6 6',
      source: 'M14 4h6v6m0-6L10 14m0-9H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5',
      check: 'm5 12 4 4L19 6'
    }[name]);
    svg.append(path);
    return svg;
  }

  const section = element('section', 'wt-showcase');
  section.setAttribute('aria-labelledby', 'wt-title');
  const introduction = element('header', 'wt-introduction');
  introduction.append(element('p', 'wt-eyebrow', 'A little more about you. A more useful search.'));
  const title = element('h2', 'wt-title', 'More than a few keywords.');
  title.id = 'wt-title';
  introduction.append(title, element('p', 'wt-intro-copy', 'Share what’s bothering you, what you’ve tried and what you’d like to get back to. See how the conversation comes together.'));

  const layout = element('div', 'wt-layout');
  const navigation = element('div', 'wt-navigation');
  const tablist = element('div', 'wt-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Search walkthroughs');
  tablist.setAttribute('aria-orientation', 'vertical');

  const panel = element('div', 'wt-panel');
  panel.id = 'wt-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = 0;
  const panelTop = element('div', 'wt-panel-top');
  const exampleLabel = element('span', 'wt-example-label', 'Example walkthrough');
  const replay = element('button', 'wt-replay');
  replay.type = 'button';
  replay.setAttribute('aria-label', 'Replay this example walkthrough');
  replay.append(icon('replay'), element('span', '', 'Replay'));
  panelTop.append(exampleLabel, replay);
  const scene = element('div', 'wt-scene');
  const footnote = element('p', 'wt-footnote', 'Prepared example with real profile information. Your search results may differ.');
  panel.append(panelTop, scene, footnote);

  stories.forEach((story, index) => {
    const tab = element('button', 'wt-tab');
    tab.type = 'button';
    tab.id = `wt-tab-${story.id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'wt-panel');
    const copy = element('span', 'wt-tab-copy');
    copy.append(element('span', 'wt-tab-title', story.title), element('span', 'wt-tab-description', story.description));
    tab.append(element('span', 'wt-tab-number', `0${index + 1}`), copy);
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % stories.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + stories.length) % stories.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = stories.length - 1;
      if (next === undefined) return;
      event.preventDefault(); select(next); tabs[next].focus();
    });
    tabs.push(tab); tablist.append(tab);
  });

  const trySearch = element('button', 'wt-try');
  trySearch.type = 'button';
  trySearch.append(element('span', '', 'Try your own search'), icon('arrow'));
  trySearch.addEventListener('click', () => {
    const input = document.getElementById('initial-query');
    if (!input || input.closest('[hidden]')) return;
    // Deliberately preserve the draft and session. This is focus, not a search.
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: 'center' });
  });
  navigation.append(tablist, trySearch);
  layout.append(navigation, panel);
  section.append(introduction, layout);

  const value = element('section', 'wt-value');
  value.setAttribute('aria-labelledby', 'wt-value-title');
  const valueIntro = element('div', 'wt-value-intro');
  valueIntro.append(element('p', 'wt-eyebrow', 'For hospitals'));
  const valueTitle = element('h2', 'wt-value-title');
  valueTitle.append(element('span', '', 'Your expertise.'), element('span', 'wt-value-emphasis', 'Easier to find.'));
  valueTitle.id = 'wt-value-title';
  valueIntro.append(valueTitle, element('p', 'wt-value-copy', 'Give patients a clearer route from their own words to a relevant consultant.'));
  const outcomes = element('div', 'wt-value-outcomes');
  outcomes.append(element('p', 'wt-measure-heading', 'What a pilot can measure'));
  const benefits = element('div', 'wt-benefits');
  [
    ['Make expertise discoverable', 'Relevant consultant profiles explored.'],
    ['Turn interest into a next step', 'Enquiries and booking starts.'],
    ['See where search falls short', 'Search abandonment, compared with today.']
  ].forEach(([heading, measure], index) => {
    const item = element('article', 'wt-benefit');
    item.append(element('span', 'wt-benefit-number', `0${index + 1}`), element('h3', '', heading), element('p', '', measure));
    benefits.append(item);
  });
  outcomes.append(benefits, element('p', 'wt-value-note', 'Outcomes to evaluate with your team in a pilot.'));
  value.append(valueIntro, outcomes);
  mount.replaceChildren(section, value);

  function stop() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }

  function play() {
    stop();
    if (motion.matches || document.visibilityState === 'hidden' || mount.closest('[hidden]')) return;
    played = true;
    scene.querySelectorAll('.wt-step').forEach((node, index) => {
      if (typeof node.animate !== 'function') return;
      const animation = node.animate([
        { opacity: 0, transform: 'translateY(9px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 400, delay: index * 140, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      animations.add(animation);
      Promise.resolve(animation.finished).catch(() => {}).then(() => animations.delete(animation));
    });
  }

  function select(index, animate = true) {
    stop(); current = index;
    const story = stories[current];
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabs[current].id);
    panel.dataset.story = story.id;
    const conversation = element('div', 'wt-conversation');
    story.prompts.forEach((prompt, i) => {
      const message = element('div', `wt-message wt-step${i ? ' wt-followup' : ''}`);
      message.append(element('span', 'wt-message-label', i ? 'Then you add' : 'You'), element('p', '', prompt));
      conversation.append(message);
    });
    const understanding = element('div', 'wt-understanding wt-step');
    const heading = element('div', 'wt-small-heading');
    heading.append(icon('check'), element('span', '', 'What stays in focus'));
    const chips = element('div', 'wt-context');
    story.context.forEach(text => chips.append(element('span', '', text)));
    understanding.append(heading, chips, element('p', '', story.understanding));
    const evidence = element('div', 'wt-evidence wt-step');
    evidence.dataset.evidenceId = story.evidenceId;
    evidence.append(element('p', 'wt-evidence-label', 'Relevant profile information'), element('h3', 'wt-consultant', story.name), element('blockquote', 'wt-excerpt', story.excerpt), element('p', 'wt-relevance', story.relevance));
    const sourceLinks = element('div', 'wt-source-links');
    const record = element('a', 'wt-source');
    record.href = `/sources/${story.evidenceId}`; record.target = '_blank'; record.rel = 'noopener noreferrer';
    record.setAttribute('aria-label', `View the supporting record for ${story.name} (opens in a new tab)`);
    record.append(element('span', '', 'View supporting record'), icon('source'));
    const profile = element('a', 'wt-source wt-source-secondary');
    profile.href = story.source; profile.target = '_blank'; profile.rel = 'noopener noreferrer';
    profile.setAttribute('aria-label', `View ${story.name}’s Spire profile (opens in a new tab)`);
    profile.append(element('span', '', 'Spire profile'), icon('source'));
    sourceLinks.append(record, profile); evidence.append(sourceLinks);
    scene.replaceChildren(conversation, understanding, evidence);
    if (animate && inView) play();
  }

  replay.addEventListener('click', play);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); });
  motion.addEventListener?.('change', stop);
  select(0, false);

  if (typeof window.IntersectionObserver === 'function') {
    const observer = new window.IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView && !played) play();
      if (!inView) stop();
    }, { threshold: .18 });
    observer.observe(panel);
  } else inView = true;

  window.DocMapWalkthrough = Object.freeze({ pause: stop });
})();
