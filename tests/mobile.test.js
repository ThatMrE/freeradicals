import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS, PLATFORMS, createGate, createManualClock, createMemoryStorage,
} from '../core/index.js';
import { blockedAppIds, composeIntent } from '../mobile/bridge/appIds.js';
import { attachNativeMirror, gateStateFor } from '../mobile/bridge/nativeMirror.js';

/**
 * The iOS and Android halves of the port.
 *
 * There is no React Native app in this repository yet, so what is testable is
 * the seam: the record the shared gate hands to native code. That record is the
 * whole contract — get it wrong and an Android overlay lets a feed through, or
 * an iOS shield never lifts — and it is pure JavaScript, so it can be tested
 * properly here rather than discovered on a device.
 */

const MIN = 60_000;
const POST = 'Wrote the mobile bridge tests today, which is more interesting than it sounds.';

function harness(settings = {}) {
  const clock = createManualClock(1_700_000_000_000);
  const storage = createMemoryStorage({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  const gate = createGate({ storage, clock, autoClear: true });
  const pushed = [];
  const native = { setGateState: (state) => pushed.push(state) };
  return { clock, gate, native, pushed };
}

test('a locked gate tells native to block, with no expiry', async () => {
  const { gate, native, pushed } = harness();
  await attachNativeMirror(gate, native, 'android');

  assert.equal(pushed.length, 1, 'native must be told the state at startup, not only on change');
  assert.equal(pushed[0].status, 'locked');
  assert.equal(pushed[0].unlockedUntil, 0);
  assert.ok(pushed[0].blockedApps.includes('com.instagram.android'));
});

test('posting pushes an absolute expiry native code can act on alone', async () => {
  const { gate, native, pushed, clock } = harness({ durationMode: 'fixed', unlockMinutes: 5 });
  await attachNativeMirror(gate, native, 'android');

  await gate.submitPost({ text: POST, platformId: 'instagram' });
  const latest = pushed.at(-1);

  assert.equal(latest.status, 'unlocked');
  assert.equal(latest.unlockedUntil, clock() + 5 * MIN,
    'native gets a wall-clock deadline, not a duration to count down');
});

test('an earned window is mirrored at its earned length', async () => {
  const { gate, native, pushed, clock } = harness({ minChars: 25, unlockMinutes: 5, earnPerChars: 50 });
  await attachNativeMirror(gate, native, 'android');

  const long = `${POST} ${'Another clause that pushes this well past the first earned step.'}`;
  await gate.submitPost({ text: long });
  assert.ok(pushed.at(-1).unlockedUntil > clock() + 5 * MIN,
    'the mobile shell must honour the same earned window as the extension');
});

test('a pending post is not treated as an open window', () => {
  // Proof mode: submitted, awaiting publication. Reporting this as open would
  // hand the phone an unbounded window, since pending never expires.
  const state = gateStateFor({
    status: 'pending', endsAt: null, settings: DEFAULT_SETTINGS,
  }, 'android');
  assert.equal(state.unlockedUntil, 0);
  assert.equal(state.status, 'pending');
});

test('an expired window reports as locked', () => {
  const state = gateStateFor({ status: 'locked', endsAt: null, settings: DEFAULT_SETTINGS }, 'ios');
  assert.equal(state.unlockedUntil, 0);
});

test('the native record carries nothing but what native code needs', () => {
  const state = gateStateFor({ status: 'locked', endsAt: null, settings: DEFAULT_SETTINGS }, 'android');
  assert.deepEqual(Object.keys(state).sort(), ['blockedApps', 'status', 'unlockedUntil']);
  // No journal, no post text: what the user wrote never crosses into native
  // storage, where an OS backup could carry it off the device.
  assert.equal(JSON.stringify(state).includes('journal'), false);
});

test('every platform maps to a real Android package and iOS bundle id', () => {
  const android = blockedAppIds(DEFAULT_SETTINGS, 'android');
  const ios = blockedAppIds(DEFAULT_SETTINGS, 'ios');
  assert.equal(android.length, PLATFORMS.length);
  assert.equal(ios.length, PLATFORMS.length);

  for (const id of [...android, ...ios]) {
    // Reverse-DNS with at least two segments. Case matters: X's iOS bundle is
    // still com.atebits.Tweetie2, after the app Twitter acquired in 2010.
    assert.match(id, /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/,
      `"${id}" is not a plausible package name or bundle id`);
  }
  assert.equal(new Set(android).size, android.length, 'duplicate Android package');
});

test('turning a platform off in settings unblocks exactly that app', () => {
  const off = blockedAppIds({ platformOverrides: { instagram: false } }, 'android');
  assert.equal(off.includes('com.instagram.android'), false);
  assert.equal(off.length, PLATFORMS.length - 1);
  // Threads ships from the Instagram team but is a separate app and a separate
  // toggle; disabling one must not disable the other.
  assert.ok(off.includes('com.instagram.barcelona'));
});

test('the blocked list follows settings changes without a restart', async () => {
  const { gate, native, pushed } = harness();
  await attachNativeMirror(gate, native, 'android');

  await gate.updateSettings({ platformOverrides: { tiktok: false } });
  assert.equal(pushed.at(-1).blockedApps.includes('com.zhiliaoapp.musically'), false);
});

test('compose intents are only claimed where a scheme really exists', () => {
  assert.equal(composeIntent(PLATFORMS.find((p) => p.id === 'x'), 'hi there'),
    'twitter://post?message=hi%20there');
  for (const p of PLATFORMS) {
    const intent = composeIntent(p, 'text');
    if (intent === null) continue;
    assert.match(intent, /^[a-z][a-z0-9+.-]*:\/\//i, `${p.id} intent is not a URL scheme`);
  }
  // Facebook and Instagram publish no supported compose scheme; inventing one
  // would send the user to a dead link at the worst moment.
  assert.equal(composeIntent(PLATFORMS.find((p) => p.id === 'facebook'), 'x'), null);
  assert.equal(composeIntent(PLATFORMS.find((p) => p.id === 'instagram'), 'x'), null);
});

test('iOS and Android get different identifiers where the apps differ', () => {
  const x = PLATFORMS.find((p) => p.id === 'x');
  assert.notEqual(x.mobile.android, x.mobile.ios, 'X ships under different ids per store');
  const yt = PLATFORMS.find((p) => p.id === 'youtube');
  assert.notEqual(yt.mobile.android, yt.mobile.ios);
});
