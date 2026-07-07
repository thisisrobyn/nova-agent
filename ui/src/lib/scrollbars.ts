/**
 * Auto-hiding overlay scrollbars.
 *
 * Scroll containers use the `.scrollbar-thin` class (styled in index.css to be
 * hidden when idle). This module reveals them by toggling `.is-scrolling`:
 * - while the user scrolls, and
 * - briefly when a scroll container first appears (a menu/modal/panel opens).
 *
 * The class is removed a short delay after activity so the bar fades away.
 */

const HIDE_DELAY = 1500;
const timers = new WeakMap<Element, number>();

function reveal(el: Element): void {
  el.classList.add('is-scrolling');
  const prev = timers.get(el);
  if (prev !== undefined) window.clearTimeout(prev);
  const id = window.setTimeout(() => {
    el.classList.remove('is-scrolling');
    timers.delete(el);
  }, HIDE_DELAY);
  timers.set(el, id);
}

function revealWithin(node: Element): void {
  if (node.classList?.contains('scrollbar-thin')) reveal(node);
  node.querySelectorAll?.('.scrollbar-thin').forEach((el) => reveal(el));
}

export function initScrollbars(): void {
  // Reveal while scrolling (scroll doesn't bubble → listen in capture phase).
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (el instanceof Element && el.classList.contains('scrollbar-thin')) {
        reveal(el);
      }
    },
    true,
  );

  // Flash briefly when a scroll container is added to the DOM (open animation).
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof Element) revealWithin(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
