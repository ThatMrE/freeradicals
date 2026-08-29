/**
 * Service worker: the single writer for gate state, plus the two things only a
 * background context can do — wake up when a window expires, and paint the
 * toolbar badge.
 *
 * MV3 workers are killed aggressively. Nothing here holds state that matters:
 * the session lives in chrome.storage with an absolute `endsAt` timestamp, so a
 * worker that is dead through the whole five minutes still yields the correct
 * answer the moment anything asks.
 */
import {
  composerUrlFor, createGate, formatBadge, getPlatform, matchPlatform,
} from '../../core/index.js';
import { createChromeStorage } from '../shared/chrome-storage.js';
import { MSG } from '../shared/messages.js';

const EXPIRY_ALARM = 'fr:expiry';
const TICK_ALARM = 'fr:tick';

const storage = createChromeStorage('local');
const gate = createGate({ storage, autoClear: true });

const ready = gate.load().then(() => sync());

/** Keep the alarm and the badge consistent with whatever the gate now says. */
async function sync() {
  const snap = await gate.reconcile();

  if (snap.status === 'unlocked' && snap.endsAt) {
    await chrome.alarms.create(EXPIRY_ALARM, { when: snap.endsAt + 250 });
    // MV3 clamps periodic alarms to one minute, which is exactly the badge's
    // resolution anyway. The countdown itself is rendered from `endsAt`.
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(EXPIRY_ALARM);
    await chrome.alarms.clear(TICK_ALARM);
  }
  await paintBadge(snap);
  return snap;
}

async function paintBadge(snap) {
  const text =
    snap.status === 'unlocked' ? formatBadge(snap.remainingMs)
      : snap.status === 'pending' ? '…'
        : '';
  const color = snap.warning ? '#dc2626' : snap.status === 'pending' ? '#f59e0b' : '#16a34a';
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({
      title:
        snap.status === 'unlocked' ? `Feed open — ${formatBadge(snap.remainingMs)} left`
          : snap.status === 'pending' ? 'Waiting for your post to go live'
            : 'Feeds locked — post to open one',
    });
  } catch { /* action APIs are unavailable while the worker is shutting down */ }
}

gate.subscribe(() => { sync(); });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== EXPIRY_ALARM && alarm.name !== TICK_ALARM) return;
  await ready;
  await sync();
});

chrome.runtime.onStartup.addListener(() => { ready.then(sync); });
chrome.runtime.onInstalled.addListener(async (details) => {
  await ready;
  await sync();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('extension/ui/options.html#welcome') });
  }
});

/* -------------------------------------------------------------------------- */

const handlers = {
  async [MSG.GET_STATE]() {
    return { ok: true, snapshot: await gate.reconcile() };
  },

  async [MSG.SUBMIT_POST]({ text, platformId }) {
    const res = await gate.submitPost({ text, platformId });
    await sync();
    return res.ok
      ? { ok: true, snapshot: res.snapshot, entry: res.entry }
      : { ok: false, reason: res.reason, message: res.message, snapshot: gate.snapshot() };
  },

  async [MSG.PUBLISH_DETECTED]({ platformId }) {
    const res = await gate.notePublish({ platformId, verified: true });
    await sync();
    return { ...res, snapshot: gate.snapshot() };
  },

  async [MSG.OVERRIDE_PROOF]() {
    const res = await gate.overrideProof();
    await sync();
    return { ...res, snapshot: gate.snapshot() };
  },

  async [MSG.LOCK_NOW]() {
    const snapshot = await gate.lockNow();
    await sync();
    return { ok: true, snapshot };
  },

  async [MSG.UPDATE_SETTINGS](patch) {
    const snapshot = await gate.updateSettings(patch || {});
    await sync();
    return { ok: true, snapshot };
  },

  async [MSG.CLEAR_JOURNAL]() {
    return { ok: true, snapshot: await gate.clearJournal() };
  },

  async [MSG.OPEN_OPTIONS]() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },

  /**
   * Open the platform's own composer with the text prefilled. Where a network
   * has no supported compose intent (Facebook, Instagram), fall back to
   * clipboard-plus-home so the user still only has to paste.
   */
  async [MSG.OPEN_COMPOSER]({ text, platformId, origin }, sender) {
    const platform = getPlatform(platformId) || matchPlatform(sender?.tab?.url || '');
    const url = composerUrlFor(platform, text, origin);
    if (!url) return { ok: false, reason: 'no-composer-url' };
    await chrome.tabs.create({ url, active: true });
    return { ok: true, url };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message && handlers[message.type];
  if (!handler) return false;
  ready
    .then(() => handler(message.payload || {}, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, reason: 'error', message: String(err && err.message) }));
  return true; // keep the channel open for the async response
});
