/* MAIN-world content script, document_start.
 *
 * Publish detection. The isolated world cannot see the page's fetch/XHR calls,
 * so this thin shim runs in the page itself, watches for the request that a
 * successful post makes (patterns generated from core/platforms.js), and
 * announces it over postMessage. It reads nothing else: no bodies are stored,
 * no responses are inspected beyond the status code, and nothing leaves the tab.
 *
 * Only meaningful when "require publish proof" is on. Since it necessarily runs
 * in the page's own world, a hostile page could forge the same message — see
 * docs/PRIVACY.md. It is an accountability aid, not a security boundary.
 */
(() => {
  const table = globalThis.__FR_SIGNALS__ || [];
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const entry = table.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (!entry || !entry.signals.length) return;

  const signals = entry.signals.map((s) => ({
    method: s.method,
    url: s.url ? new RegExp(s.url, s.urlFlags) : null,
    body: s.body ? new RegExp(s.body, s.bodyFlags) : null,
  }));

  let announced = 0;
  function announce() {
    const now = Date.now();
    if (now - announced < 3000) return; // one post, one announcement
    announced = now;
    window.postMessage({ __freeradicals: 'publish', at: now }, location.origin);
  }

  function matches(method, url, body) {
    const m = String(method || 'GET').toUpperCase();
    return signals.some((sig) => {
      if (sig.method && sig.method.toUpperCase() !== m) return false;
      if (sig.url && !sig.url.test(String(url || ''))) return false;
      if (sig.body && !sig.body.test(typeof body === 'string' ? body : '')) return false;
      return true;
    });
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function patchedFetch(input, init) {
      let url = '';
      let method = 'GET';
      let body = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = (init && init.method) || (input && input.method) || 'GET';
        const raw = init && init.body;
        if (typeof raw === 'string') body = raw.slice(0, 4000);
        else if (raw instanceof URLSearchParams) body = raw.toString().slice(0, 4000);
      } catch { /* exotic Request shapes are simply not matched */ }

      const promise = nativeFetch.apply(this, arguments);
      if (matches(method, url, body)) {
        promise.then((res) => { if (res && res.ok) announce(); }).catch(() => {});
      }
      return promise;
    };
  }

  const open = XMLHttpRequest.prototype.open;
  const sendXhr = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__fr = { method, url };
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const info = this.__fr;
    if (info) {
      const payload = typeof body === 'string' ? body.slice(0, 4000) : '';
      if (matches(info.method, info.url, payload)) {
        this.addEventListener('load', () => {
          if (this.status >= 200 && this.status < 300) announce();
        });
      }
    }
    return sendXhr.apply(this, arguments);
  };
})();
