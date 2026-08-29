/**
 * Text helpers used to judge whether the user actually produced something.
 * Deliberately dependency-free so the mobile runtime can reuse it verbatim.
 */

/** Collapse whitespace and case so "cheap" edits do not read as new work. */
export function normalize(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Visible character count, ignoring leading/trailing whitespace. */
export function charCount(text) {
  return String(text || '').trim().length;
}

export function wordCount(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * A cheap 32-bit hash of the normalized text. Used for duplicate detection so
 * the journal never has to store or compare full post bodies in hot paths.
 */
export function fingerprint(text) {
  const s = normalize(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Rejects filler that technically clears a character minimum: a single word
 * repeated, or a run of one character ("aaaaaaaaaa", "....", "asdf asdf asdf").
 */
export function looksLikeFiller(text) {
  const s = normalize(text);
  if (!s) return true;
  const stripped = s.replace(/[^a-z0-9]/g, '');
  if (stripped.length === 0) return true;
  if (new Set(stripped).size <= 2) return true;
  const words = s.split(' ').filter(Boolean);
  if (words.length >= 3 && new Set(words).size <= Math.ceil(words.length / 3)) return true;
  return false;
}
