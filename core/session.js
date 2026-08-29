/**
 * The session is the single piece of mutable state that decides whether a feed
 * is visible. It is a plain JSON object so it can live in chrome.storage,
 * AsyncStorage, UserDefaults, or an Android SharedPreferences blob unchanged.
 *
 * @typedef {'locked'|'pending'|'unlocked'} GateStatus
 *
 * @typedef {object} Session
 * @property {string}  id
 * @property {'pending'|'open'} phase   `pending` = posted, awaiting publish proof.
 * @property {number}  submittedAt      When the compose box was submitted.
 * @property {number|null} startedAt    When the clock actually started.
 * @property {number|null} endsAt       startedAt + unlock duration.
 * @property {number}  durationMs
 * @property {string|null} platformId   Platform the post was written for.
 * @property {string}  fingerprint      Fingerprint of the post text.
 */

/** @returns {Session} */
export function createSession({ now, durationMs, platformId, fingerprint, requireProof }) {
  return {
    id: `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    phase: requireProof ? 'pending' : 'open',
    submittedAt: now,
    startedAt: requireProof ? null : now,
    endsAt: requireProof ? null : now + durationMs,
    durationMs,
    platformId: platformId || null,
    fingerprint: fingerprint || '',
  };
}

/** Promote a `pending` session to `open` once a publish has been observed. */
export function startClock(session, now) {
  if (!session || session.phase === 'open') return session;
  return { ...session, phase: 'open', startedAt: now, endsAt: now + session.durationMs };
}

/**
 * The one function that decides what the user sees. Pure: same session and
 * same `now` always yields the same answer, on every platform.
 *
 * @returns {{ status: GateStatus, remainingMs: number, session: Session|null }}
 */
export function evaluate(session, now) {
  if (!session) return { status: 'locked', remainingMs: 0, session: null };
  if (session.phase === 'pending') {
    return { status: 'pending', remainingMs: session.durationMs, session };
  }
  const remaining = (session.endsAt || 0) - now;
  if (remaining <= 0) return { status: 'locked', remainingMs: 0, session: null };
  return { status: 'unlocked', remainingMs: remaining, session };
}

/** How long a pending session has been waiting for publish proof. */
export function pendingAgeMs(session, now) {
  if (!session || session.phase !== 'pending') return 0;
  return Math.max(0, now - session.submittedAt);
}
