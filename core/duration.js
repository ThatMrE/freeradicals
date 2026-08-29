import { normalizeSettings } from './config.js';
import { charCount } from './text.js';

/**
 * How long a given post buys.
 *
 * In `earned` mode the window is not a constant: clearing the minimum buys the
 * base window, and every further `earnPerChars` characters buys another step,
 * up to a ceiling. Write a sentence, get a glance; write something substantial,
 * get a sitting. The block screen shows this counting up live as you type, so
 * the trade is visible while you are making it rather than after.
 *
 * Kept pure and platform-free like the rest of core/: the extension's block
 * screen, the popup and the React Native screen all call the same function, and
 * the number it returns is what gets frozen into the session's `endsAt`.
 */

/** @returns {number} minutes this text buys under the current settings */
export function earnedMinutes(text, settings) {
  const s = normalizeSettings(settings);
  if (s.durationMode !== 'earned') return s.unlockMinutes;

  // A ceiling below the base would be nonsense; the base always wins.
  const cap = Math.max(s.unlockMinutes, s.maxUnlockMinutes);
  const chars = charCount(text);
  if (chars <= s.minChars) return s.unlockMinutes;

  const steps = Math.floor((chars - s.minChars) / s.earnPerChars);
  return Math.min(cap, s.unlockMinutes + steps * s.earnMinutesPerStep);
}

export function earnedDurationMs(text, settings) {
  return earnedMinutes(text, settings) * 60_000;
}

/**
 * Everything a compose box needs to show the deal as it is being struck.
 *
 * @returns {{
 *   minutes: number, ms: number, mode: string, atCap: boolean,
 *   charsToNext: number, nextMinutes: number, earning: boolean
 * }}
 */
export function earnProgress(text, settings) {
  const s = normalizeSettings(settings);
  const chars = charCount(text);
  const minutes = earnedMinutes(text, s);
  const earning = s.durationMode === 'earned';
  const cap = Math.max(s.unlockMinutes, s.maxUnlockMinutes);
  const atCap = earning && minutes >= cap;

  let charsToNext = 0;
  if (earning && !atCap) {
    charsToNext = chars < s.minChars
      ? s.minChars - chars                                  // still buying the base window
      : s.earnPerChars - ((chars - s.minChars) % s.earnPerChars);
  }

  return {
    minutes,
    ms: minutes * 60_000,
    mode: s.durationMode,
    atCap,
    charsToNext,
    nextMinutes: atCap ? minutes : Math.min(cap, minutes + s.earnMinutesPerStep),
    earning,
  };
}
