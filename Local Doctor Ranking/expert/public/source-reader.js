'use strict';
// Only reader navigation. No application state, network requests or AI calls.
(() => {
  const header = document.querySelector('.source-reader-header');
  if (!header) return;
  const measure = () => {
    const height = Math.ceil(header.getBoundingClientRect().height);
    // Enlarged text and long names must not turn the sticky identity into a
    // screen-sized obstruction. It remains fully readable in document flow.
    const inFlow = height > window.innerHeight * .4;
    header.classList.toggle('source-reader-header-in-flow', inFlow);
    document.documentElement.style.setProperty('--source-reader-header-height', (inFlow ? 0 : height) + 'px');
    return inFlow;
  };
  const land = () => {
    const inFlow = measure();
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id.startsWith('evidence-')) return;
    const target = document.getElementById(id);
    if (!target?.classList.contains('source-reader-passage')) return;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    if (inFlow && target.classList.contains('cited-passage')) window.scrollTo({top:0,behavior:'instant'});
    else target.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  measure();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(header);
  // Font settling only repositions the initial citation if the user has not started reading.
  let interacted = false;
  const reading = () => { interacted = true; };
  for (const event of ['pointerdown', 'wheel', 'touchstart', 'keydown'])
    window.addEventListener(event, reading, { once: true, passive: true });
  land();
  document.fonts?.ready.then(() => { if (!interacted) land(); });
  window.addEventListener('hashchange', land);
})();
