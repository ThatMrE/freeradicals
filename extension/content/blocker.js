/**
 * The mechanics of making a feed not-visible. Two modes, chosen by
 * core/platforms.js#blockPlan:
 *
 *   overlay  — the whole route is a feed. Hide <body>, cover with the block
 *              screen, pause any media that started before we got here.
 *   elements — the route is otherwise useful (a video, a profile, your DMs) but
 *              contains feed modules. Hide only those.
 *
 * Everything is done with one injected stylesheet on <html> rather than by
 * mutating the site's own nodes, so nothing is destroyed and unblocking is a
 * single attribute flip. Feeds re-render constantly; removing nodes is a losing
 * race, and CSS is not.
 */
const ATTR = 'data-freeradicals';
const STYLE_ID = 'fr-block-style';

function styleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

/** Silence anything already playing behind the block screen. */
function pauseMedia() {
  for (const el of document.querySelectorAll('video, audio')) {
    try { if (!el.paused) el.pause(); } catch { /* cross-origin media */ }
  }
}

let mediaObserver = null;

function watchMedia(on) {
  if (on && !mediaObserver) {
    mediaObserver = new MutationObserver(pauseMedia);
    mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
    pauseMedia();
  } else if (!on && mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }
}

/**
 * @param {{ mode: 'overlay'|'elements'|'none', selectors: string[] }} plan
 * @param {boolean} blocked
 */
export function apply(plan, blocked) {
  const root = document.documentElement;

  if (!blocked || plan.mode === 'none') {
    root.removeAttribute(ATTR);
    styleEl().textContent = '';
    watchMedia(false);
    return;
  }

  if (plan.mode === 'overlay') {
    root.setAttribute(ATTR, 'blocked');
    styleEl().textContent =
      `html[${ATTR}="blocked"] body{visibility:hidden!important}` +
      `html[${ATTR}="blocked"]{overflow:hidden!important}`;
    watchMedia(true);
    return;
  }

  // elements mode
  root.setAttribute(ATTR, 'trimmed');
  const hidden = plan.selectors.map((s) => `html[${ATTR}="trimmed"] ${s}`).join(',');
  styleEl().textContent = hidden ? `${hidden}{display:none!important}` : '';
  watchMedia(false);
}

/** Release the page unconditionally (used on teardown and on failure paths). */
export function release() {
  document.documentElement.removeAttribute(ATTR);
  const el = document.getElementById(STYLE_ID);
  if (el) el.textContent = '';
  watchMedia(false);
}
