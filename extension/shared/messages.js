/**
 * Every mutation goes through the service worker so there is exactly one
 * writer. Reads never use messaging: each context keeps its own core Gate over
 * chrome.storage and re-renders from onChanged.
 */
export const MSG = {
  SUBMIT_POST: 'fr:submit-post',
  PUBLISH_DETECTED: 'fr:publish-detected',
  OVERRIDE_PROOF: 'fr:override-proof',
  LOCK_NOW: 'fr:lock-now',
  UPDATE_SETTINGS: 'fr:update-settings',
  CLEAR_JOURNAL: 'fr:clear-journal',
  OPEN_COMPOSER: 'fr:open-composer',
  OPEN_OPTIONS: 'fr:open-options',
  GET_STATE: 'fr:get-state',
};

/** Promise wrapper that never throws on a sleeping/absent worker. */
export async function send(type, payload = {}) {
  try {
    const res = await chrome.runtime.sendMessage({ type, payload });
    return res || { ok: false, reason: 'no-response' };
  } catch (err) {
    return { ok: false, reason: 'disconnected', message: String(err && err.message) };
  }
}
