/* Classic content script, document_start. Two jobs, in this order:
 *
 * 1. Hide the page before it paints, so a feed never flashes into view while
 *    the async storage read is in flight. Only on routes that are actually
 *    feeds — a YouTube watch page must never blank out.
 * 2. Load the real (module) content script.
 *
 * The route table is generated from core/platforms.js by tools/build-manifest.mjs.
 */
(() => {
  const ATTR = 'data-freeradicals';
  const table = globalThis.__FR_ROUTES__ || [];
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const platform = table.find((p) =>
    p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));

  const isFeedRoute =
    !!platform && platform.feedRoutes.some((src) => {
      try { return new RegExp(src).test(location.pathname); } catch { return false; }
    });

  if (isFeedRoute) {
    document.documentElement.setAttribute(ATTR, 'booting');
    const style = document.createElement('style');
    style.id = 'fr-preblock';
    style.textContent =
      `html[${ATTR}="booting"] body{visibility:hidden!important}` +
      `html[${ATTR}="booting"]{overflow:hidden!important}`;
    (document.head || document.documentElement).appendChild(style);

    // Failsafe: a broken build must degrade to "no blocking", never to a
    // permanently blank social network.
    setTimeout(() => {
      if (document.documentElement.getAttribute(ATTR) === 'booting') {
        document.documentElement.removeAttribute(ATTR);
      }
    }, 4000);
  }

  import(chrome.runtime.getURL('extension/content/main.js'))
    .then((mod) => mod.start({ platformId: platform ? platform.id : null }))
    .catch((err) => {
      document.documentElement.removeAttribute(ATTR);
      console.warn('[free radicals] could not start:', err);
    });
})();
