import { fingerprint, normalize, wordCount } from './text.js';

/**
 * Append-only log of everything the user has produced through the gate. It is
 * what makes "post before you consume" feel like a practice instead of a tax:
 * the popup can show what you made this week, and duplicate detection uses it
 * to stop the same paragraph unlocking the feed twice.
 *
 * @typedef {object} JournalEntry
 * @property {string} id
 * @property {number} at
 * @property {string} text
 * @property {string} fp
 * @property {string|null} platformId
 * @property {boolean} verified   True when a real publish was observed.
 */

/** @returns {JournalEntry} */
export function createEntry({ text, platformId, now, verified = false }) {
  return {
    id: `p_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: now,
    text: String(text || '').trim(),
    fp: fingerprint(text),
    platformId: platformId || null,
    verified,
  };
}

export function append(journal, entry, limit = 500) {
  const list = Array.isArray(journal) ? journal : [];
  return [entry, ...list].slice(0, Math.max(1, limit));
}

export function markVerified(journal, entryId) {
  return (journal || []).map((e) => (e.id === entryId ? { ...e, verified: true } : e));
}

/** True when `text` matches one of the last `lookback` entries. */
export function isDuplicate(journal, text, lookback = 25) {
  if (lookback <= 0) return false;
  const fp = fingerprint(text);
  const norm = normalize(text);
  if (!norm) return true;
  return (journal || []).slice(0, lookback).some((e) => e.fp === fp);
}

const DAY = 86_400_000;
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Lightweight stats for the popup: today, this week, words, and a day streak. */
export function stats(journal, now) {
  const list = journal || [];
  const today = dayKey(now);
  const days = new Set(list.map((e) => dayKey(e.at)));
  let streak = 0;
  for (let i = 0; i < 3650; i += 1) {
    if (!days.has(dayKey(now - i * DAY))) {
      // Today not being posted yet should not break yesterday's streak.
      if (i === 0) continue;
      break;
    }
    streak += 1;
  }
  return {
    total: list.length,
    today: list.filter((e) => dayKey(e.at) === today).length,
    week: list.filter((e) => now - e.at < 7 * DAY).length,
    words: list.reduce((sum, e) => sum + wordCount(e.text), 0),
    streak,
  };
}
