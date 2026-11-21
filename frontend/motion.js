'use strict';

// Progressive enhancement: data and controls stay usable without animation APIs.
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('motion-toggle');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'edutainal-motion-paused';
  let paused = false;
  try { paused = localStorage.getItem(storageKey) === 'true'; } catch (_) { /* Storage can be disabled. */ }

  function syncPreference() {
    const stopped = paused || preference.matches;
    root.classList.toggle('motion-paused', stopped);
    if (stopped) document.querySelectorAll('.motion-enter').forEach(element => element.classList.remove('motion-enter'));
    if (!toggle) return;
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', String(stopped));
    toggle.querySelector('span').textContent = preference.matches ? 'Reduced motion' : stopped ? 'Motion paused' : 'Motion on';
    toggle.title = preference.matches ? 'Reduced motion is enabled in your device settings' : stopped ? 'Enable dashboard animations' : 'Pause dashboard animations';
    toggle.disabled = preference.matches;
  }
  toggle?.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem(storageKey, String(paused)); } catch (_) { /* Keep the session preference. */ }
    syncPreference();
  });
  preference.addEventListener('change', syncPreference);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      paused = event.newValue === 'true';
      syncPreference();
    }
  });
  document.addEventListener('visibilitychange', () => root.classList.toggle('page-idle', document.hidden));
  syncPreference();

  // Release the entrance transform so normal hover/focus interactions can run.
  document.addEventListener('animationend', event => {
    event.target.classList.remove('motion-enter');
  });

  if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  const surfaces = '.heading, .card, .panel, .filter-bar, .report-toolbar, .insight-strip, .methodology, .progress-summary, .progress-class-detail, .comparison-row, .pathway, .parent-account';
  const lines = 'svg line[stroke]:not(.chart-grid):not(.radar-grid)';
  const points = 'svg circle';
  const bars = '.fill, .bar-track > span, .compare-track > span, .activity-bar, .test-bar-track > div';
  const targets = [surfaces, lines, points, bars].join(',');
  const seen = new WeakSet();
  const pending = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // No hiding or replay loop: one entrance per newly rendered component.
      if (!root.classList.contains('motion-paused')) entry.target.classList.add('motion-enter');
      observer.unobserve(entry.target);
      pending.delete(entry.target);
    }
  }, {threshold: 0, rootMargin: '0px 0px -16px 0px'});

  function enhance(node) {
    if (!(node instanceof Element)) return;
    const elements = [...(node.matches(targets) ? [node] : []), ...node.querySelectorAll(targets)];
    elements.forEach((element, index) => {
      if (seen.has(element)) return;
      seen.add(element);
      if (element.matches(lines)) {
        element.setAttribute('pathLength', '1');
        element.classList.add('chart-draw');
      } else if (element.matches(points)) {
        element.classList.add('chart-point');
      } else if (element.matches(bars)) {
        element.classList.add('chart-bar');
      }
      element.style.setProperty('--motion-delay', `${Math.min(index % 6 * 45, 225)}ms`);
      pending.add(element);
      observer.observe(element);
    });
  }

  const mutations = new MutationObserver(records => {
    // Report and class-chart rerenders replace nodes; release detached observers.
    for (const element of pending) {
      if (!element.isConnected) {
        observer.unobserve(element);
        pending.delete(element);
      }
    }
    for (const record of records) record.addedNodes.forEach(enhance);
  });
  enhance(document.body);
  mutations.observe(document.body, {childList: true, subtree: true});
})();
