import { systemClock } from './clock.js';
import {
  DEFAULT_SETTINGS, JOURNAL_KEY, SESSION_KEY, SETTINGS_KEY,
  normalizeSettings, unlockDurationMs,
} from './config.js';
import { earnedDurationMs } from './duration.js';
import { append, createEntry, isDuplicate, markVerified, stats } from './journal.js';
import { createSession, evaluate, pendingAgeMs, startClock } from './session.js';
import { charCount, fingerprint, looksLikeFiller } from './text.js';

/**
 * The gate. Everything the product does — refuse the feed, accept a post, run
 * the five-minute clock, lock again — happens here, with no reference to
 * Chrome, the DOM, React Native, or any UI. Both the extension's service
 * worker and the mobile app's headless controller drive this same object.
 */

export const REJECTIONS = {
  EMPTY: 'empty',
  TOO_SHORT: 'too-short',
  FILLER: 'filler',
  DUPLICATE: 'duplicate',
  ALREADY_OPEN: 'already-open',
  AWAITING_PROOF: 'awaiting-proof',
};

const REJECTION_MESSAGES = {
  [REJECTIONS.EMPTY]: 'Write something first.',
  [REJECTIONS.TOO_SHORT]: 'That is shorter than your minimum.',
  [REJECTIONS.FILLER]: 'That reads like filler. Write a real thought.',
  [REJECTIONS.DUPLICATE]: 'You already posted that. The gate needs something new.',
  [REJECTIONS.ALREADY_OPEN]: 'Your feed is already open.',
  [REJECTIONS.AWAITING_PROOF]: 'Waiting for your post to go live.',
};

export function rejectionMessage(code) {
  return REJECTION_MESSAGES[code] || 'Post rejected.';
}

/**
 * @param {object} options
 * @param {object} options.storage   See core/storage.js
 * @param {() => number} [options.clock]
 * @param {boolean} [options.autoClear] Clear expired sessions on read. Only the
 *   single writer (the service worker / mobile controller) should set this.
 */
export function createGate({ storage, clock = systemClock, autoClear = false }) {
  let cache = { settings: { ...DEFAULT_SETTINGS }, session: null, journal: [] };
  let loaded = false;
  const listeners = new Set();

  function emit() {
    const snap = snapshot();
    for (const fn of listeners) {
      try { fn(snap); } catch { /* a broken listener must not stall the gate */ }
    }
  }

  async function load() {
    const raw = await storage.get([SETTINGS_KEY, SESSION_KEY, JOURNAL_KEY]);
    cache = {
      settings: normalizeSettings(raw[SETTINGS_KEY]),
      session: raw[SESSION_KEY] || null,
      journal: Array.isArray(raw[JOURNAL_KEY]) ? raw[JOURNAL_KEY] : [],
    };
    loaded = true;
    return snapshot();
  }

  const unsubscribeStorage = storage.subscribe(async (keys) => {
    if (!keys || keys.some((k) => [SETTINGS_KEY, SESSION_KEY, JOURNAL_KEY].includes(k))) {
      await load();
      emit();
    }
  });

  /**
   * The complete view of the world, derived fresh from the clock every call.
   * This is what every UI renders from.
   */
  function snapshot() {
    const now = clock();
    const { status, remainingMs, session } = evaluate(cache.session, now);
    const settings = cache.settings;
    return {
      status,
      remainingMs,
      endsAt: session && session.phase === 'open' ? session.endsAt : null,
      /** The base window. What a *specific* post buys is earnedDurationMs(text). */
      baseDurationMs: unlockDurationMs(settings),
      warning: status === 'unlocked' && remainingMs <= settings.warnAtSeconds * 1000,
      session,
      settings,
      journal: cache.journal,
      stats: stats(cache.journal, now),
      /** In `pending`, whether the manual "I posted anyway" escape is offered. */
      proofOverrideAvailable:
        status === 'pending' &&
        pendingAgeMs(cache.session, now) >= settings.proofOverrideAfterSeconds * 1000,
      now,
    };
  }

  /** Drop a session whose clock has run out, so storage reflects reality. */
  async function reconcile() {
    if (!autoClear || !cache.session) return snapshot();
    const { status } = evaluate(cache.session, clock());
    if (status === 'locked') {
      cache.session = null;
      await storage.set({ [SESSION_KEY]: null });
    }
    return snapshot();
  }

  /**
   * Validate and accept a post. This is the only door into `unlocked`.
   * @returns {{ ok: true, snapshot: object }|{ ok: false, reason: string, message: string }}
   */
  async function submitPost({ text, platformId = null }) {
    if (!loaded) await load();
    const now = clock();
    const settings = cache.settings;
    const current = evaluate(cache.session, now);

    if (current.status === 'unlocked') {
      return fail(REJECTIONS.ALREADY_OPEN);
    }
    if (current.status === 'pending') {
      return fail(REJECTIONS.AWAITING_PROOF);
    }
    const body = String(text || '');
    if (charCount(body) === 0) return fail(REJECTIONS.EMPTY);
    if (charCount(body) < settings.minChars) return fail(REJECTIONS.TOO_SHORT);
    if (looksLikeFiller(body)) return fail(REJECTIONS.FILLER);
    if (settings.blockDuplicatePosts &&
        isDuplicate(cache.journal, body, settings.duplicateLookback)) {
      return fail(REJECTIONS.DUPLICATE);
    }

    const entry = createEntry({ text: body, platformId, now, verified: false });
    const session = createSession({
      now,
      // The length is decided here, once, from what was actually written, and
      // frozen into the session. Editing settings later cannot extend a window
      // already running.
      durationMs: earnedDurationMs(body, settings),
      platformId,
      fingerprint: fingerprint(body),
      requireProof: settings.requirePublishProof,
    });
    session.entryId = entry.id;

    cache.journal = append(cache.journal, entry, settings.journalLimit);
    cache.session = session;
    await storage.set({ [SESSION_KEY]: session, [JOURNAL_KEY]: cache.journal });
    emit();
    return { ok: true, snapshot: snapshot(), entry };
  }

  function fail(reason) {
    return { ok: false, reason, message: rejectionMessage(reason) };
  }

  /**
   * A real publish was observed on the platform (network probe on web, share
   * intent completion on mobile). Starts the clock on a pending session and
   * marks the journal entry verified.
   */
  async function notePublish({ platformId = null, verified = true } = {}) {
    if (!loaded) await load();
    if (!cache.session) return { ok: false, reason: 'no-session', snapshot: snapshot() };
    if (cache.session.platformId && platformId && cache.session.platformId !== platformId) {
      return { ok: false, reason: 'platform-mismatch', snapshot: snapshot() };
    }
    const now = clock();
    const patch = {};
    if (cache.session.phase === 'pending') {
      cache.session = startClock(cache.session, now);
      patch[SESSION_KEY] = cache.session;
    }
    if (verified && cache.session.entryId) {
      cache.journal = markVerified(cache.journal, cache.session.entryId);
      patch[JOURNAL_KEY] = cache.journal;
    }
    if (Object.keys(patch).length) await storage.set(patch);
    emit();
    return { ok: true, snapshot: snapshot() };
  }

  /** The "I posted anyway" escape from `pending`. Recorded as unverified. */
  async function overrideProof() {
    if (!loaded) await load();
    const snap = snapshot();
    if (snap.status !== 'pending' || !snap.proofOverrideAvailable) {
      return { ok: false, reason: 'not-available', snapshot: snap };
    }
    cache.session = startClock(cache.session, clock());
    await storage.set({ [SESSION_KEY]: cache.session });
    emit();
    return { ok: true, snapshot: snapshot() };
  }

  /** End the session early — "I'm done", the honest opposite of a cheat. */
  async function lockNow() {
    if (!loaded) await load();
    cache.session = null;
    await storage.set({ [SESSION_KEY]: null });
    emit();
    return snapshot();
  }

  async function updateSettings(patch) {
    if (!loaded) await load();
    cache.settings = normalizeSettings({ ...cache.settings, ...patch });
    await storage.set({ [SETTINGS_KEY]: cache.settings });
    emit();
    return snapshot();
  }

  async function clearJournal() {
    if (!loaded) await load();
    cache.journal = [];
    await storage.set({ [JOURNAL_KEY]: [] });
    emit();
    return snapshot();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    load,
    snapshot,
    reconcile,
    submitPost,
    notePublish,
    overrideProof,
    lockNow,
    updateSettings,
    clearJournal,
    subscribe,
    destroy() { unsubscribeStorage(); listeners.clear(); },
    get isLoaded() { return loaded; },
  };
}
