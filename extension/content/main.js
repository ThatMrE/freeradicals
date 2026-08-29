import {
  blockPlan, createGate, getPlatform, isPlatformEnabled, matchPlatform,
} from '../../core/index.js';
import { createChromeStorage } from '../shared/chrome-storage.js';
import { MSG, send } from '../shared/messages.js';
import * as blocker from './blocker.js';
import { createOverlay } from './overlay.js';

/**
 * Content-script orchestrator.
 *
 * Reads state straight from chrome.storage through a core Gate (so every tab
 * re-renders the instant anything changes anywhere) and routes every *write*
 * through the service worker (so there is one writer and no lost updates).
 */

const DRAFT_KEY = 'draft';
const PUBLISH_OFFER_MS = 60_000;

export async function start({ platformId }) {
  const platform = getPlatform(platformId) || matchPlatform(location.href);
  if (!platform) { blocker.release(); return; }

  const storage = createChromeStorage('local');
  const gate = createGate({ storage });
  await gate.load();

  const overlay = createOverlay({
    onSubmit: async (text) => {
      const res = await send(MSG.SUBMIT_POST, { text, platformId: platform.id });
      if (res.ok) {
        await storage.set({ [DRAFT_KEY]: '' });
        await afterPost(text);
      }
      paint();
      return res;
    },
    onOpenComposer: () => openComposer(),
    onOverride: async () => { await send(MSG.OVERRIDE_PROOF); paint(); },
    onLockNow: async () => { await send(MSG.LOCK_NOW); paint(); },
    onOpenSettings: () => send(MSG.OPEN_OPTIONS),
    onDraftChange: debounce((text) => storage.set({ [DRAFT_KEY]: text }), 400),
  });
  overlay.attach();

  // Feeds rebuild the DOM constantly and some sites clear stray top-level
  // nodes. Put the overlay back whenever that happens.
  const keepAlive = new MutationObserver(() => overlay.attach());
  keepAlive.observe(document.documentElement, { childList: true });

  const draft = await storage.get([DRAFT_KEY]);
  overlay.setDraft(draft[DRAFT_KEY] || '');

  let lastText = '';

  /** After a successful post: put the text somewhere the user can publish it. */
  async function afterPost(text) {
    lastText = text;
    const snap = gate.snapshot();
    if (!snap.settings.publishAssist && !snap.settings.requirePublishProof) return;
    try { await navigator.clipboard.writeText(text); } catch { /* no gesture / no permission */ }
    if (snap.settings.requirePublishProof) openComposer(text);
  }

  function openComposer(text) {
    const body = text || lastText || overlay.value;
    if (platform.web.inlineComposer) {
      const el = document.querySelector(platform.web.inlineComposer);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        try { el.click(); el.focus(); } catch { /* not focusable */ }
        return;
      }
    }
    send(MSG.OPEN_COMPOSER, { text: body, platformId: platform.id, origin: location.origin });
  }

  /** The one place that turns gate state into what the user sees. */
  function paint() {
    const snap = gate.snapshot();
    const enabled = isPlatformEnabled(snap.settings, platform.id);
    const plan = enabled ? blockPlan(platform, location.href) : { mode: 'none', selectors: [] };
    const blocked = snap.status !== 'unlocked';

    blocker.apply(plan, blocked);

    const sinceSubmit = snap.session ? snap.now - snap.session.submittedAt : Infinity;
    overlay.render(snap, {
      platform,
      blocked: blocked && plan.mode === 'overlay',
      showPill: enabled && snap.status === 'unlocked',
      canCompose: typeof platform.web.composerUrl === 'function' || !!platform.web.inlineComposer,
      offerPublish: snap.settings.publishAssist && sinceSubmit < PUBLISH_OFFER_MS,
    });
  }

  gate.subscribe(paint);
  paint();

  /* --- keep the countdown honest and follow single-page navigation -------- */
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; }
    paint();
  }, 1000);

  const onRouteChange = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    paint();
  };
  setInterval(onRouteChange, 250);
  addEventListener('popstate', onRouteChange);
  if (typeof navigation !== 'undefined' && navigation.addEventListener) {
    navigation.addEventListener('navigate', () => setTimeout(onRouteChange, 0));
  }
  addEventListener('pageshow', paint);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });

  /* --- publish detection from the MAIN-world probe ------------------------ */
  addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__freeradicals !== 'publish') return;
    send(MSG.PUBLISH_DETECTED, { platformId: platform.id });
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
