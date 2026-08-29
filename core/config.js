/**
 * Settings shape shared by every platform. The extension persists this in
 * chrome.storage; the mobile app persists it in AsyncStorage / UserDefaults.
 */

export const SETTINGS_KEY = 'settings';
export const SESSION_KEY = 'session';
export const JOURNAL_KEY = 'journal';

export const DEFAULT_SETTINGS = Object.freeze({
  /**
   * How the window length is decided.
   *   'earned' — the base window, plus more time the more you wrote.
   *   'fixed'  — every post buys exactly `unlockMinutes`.
   */
  durationMode: 'earned',
  /** The base window in minutes: what a post at exactly `minChars` buys. */
  unlockMinutes: 5,
  /** Characters of writing, beyond `minChars`, that buy one more step. */
  earnPerChars: 50,
  /** Minutes added per step earned. */
  earnMinutesPerStep: 1,
  /** Ceiling on an earned window, however much you wrote. */
  maxUnlockMinutes: 20,
  /** Minimum characters before the Post button is enabled. */
  minChars: 25,
  /**
   * When true, submitting the compose box does not unlock on its own: the gate
   * moves to `pending` and waits for a real publish to be observed on the
   * platform (see core/platforms.js publishSignals).
   */
  requirePublishProof: false,
  /** Seconds the user must wait before the "I posted anyway" escape appears. */
  proofOverrideAfterSeconds: 90,
  /** Prefill the site's own composer with the text after submitting. */
  publishAssist: true,
  /** Refuse text that matches something already posted recently. */
  blockDuplicatePosts: true,
  /** How many journal entries back the duplicate check looks. */
  duplicateLookback: 25,
  /** Seconds remaining at which the countdown starts warning. */
  warnAtSeconds: 60,
  /** Show a quote on the block screen (News Feed Eradicator style). */
  showQuotes: true,
  /** platformId -> boolean. Missing keys default to enabled. */
  platformOverrides: {},
  /** Max journal entries retained on device. */
  journalLimit: 500,
});

export const DURATION_MODES = ['earned', 'fixed'];

const LIMITS = {
  unlockMinutes: [1, 120],
  earnPerChars: [5, 2000],
  earnMinutesPerStep: [1, 60],
  maxUnlockMinutes: [1, 240],
  minChars: [1, 2000],
  proofOverrideAfterSeconds: [10, 3600],
  duplicateLookback: [0, 500],
  warnAtSeconds: [0, 3600],
  journalLimit: [10, 5000],
};

function clampNumber(key, value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const [min, max] = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Coerce anything loaded from storage into a complete, valid settings object. */
export function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in input)) continue;
    const fallback = DEFAULT_SETTINGS[key];
    const value = input[key];
    if (key in LIMITS) out[key] = clampNumber(key, value, fallback);
    else if (typeof fallback === 'boolean') out[key] = Boolean(value);
    else if (key === 'durationMode') {
      out.durationMode = DURATION_MODES.includes(value) ? value : DEFAULT_SETTINGS.durationMode;
    } else if (key === 'platformOverrides') {
      out.platformOverrides = value && typeof value === 'object' ? { ...value } : {};
    }
  }
  return out;
}

/** The base window — what a post that just clears the minimum buys. */
export function unlockDurationMs(settings) {
  return normalizeSettings(settings).unlockMinutes * 60_000;
}
