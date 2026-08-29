import { createGate } from '../../core/index.js';
import { blockedAppIds } from './appIds.js';
import { createAsyncStorageAdapter } from './storage.js';

/**
 * The mobile equivalent of the extension's service worker: one owner of the
 * gate, plus the bridge that hands the answer to native code.
 *
 * The whole port turns on one property of core/session.js: an open window is
 * an absolute `endsAt` timestamp, not a running countdown. Native code that
 * blocks apps — an Android overlay service, an iOS shield extension — never
 * needs the JS runtime alive. It needs one number, and it can compare that
 * number to the clock itself. `attachNativeMirror` is what writes that number
 * somewhere native code can read while the React Native context is asleep or
 * dead.
 */

/**
 * @param {object} [options]
 * @param {object} [options.native]  NativeModules.FreeRadicals — see mobile/README.md
 */
export function createMobileGate({ native, os = 'android' } = {}) {
  const storage = createAsyncStorageAdapter();
  const gate = createGate({ storage, autoClear: true });

  if (native) attachNativeMirror(gate, native, os);

  return gate;
}

/**
 * Push every state change down to the native layer.
 *
 * `setGateState` is the entire native surface area. Everything else — what
 * counts as a valid post, how long the window is, whether a repeat is allowed —
 * stays in core/, shared byte-for-byte with the Chrome extension.
 *
 * @param {object} gate    from createGate
 * @param {{ setGateState(state: object): void }} native
 * @param {'android'|'ios'} os
 */
export function attachNativeMirror(gate, native, os = 'android') {
  const push = (snap) => {
    native.setGateState({
      status: snap.status,                           // 'locked' | 'pending' | 'unlocked'
      unlockedUntil: snap.endsAt || 0,               // epoch ms; 0 when locked
      blockedApps: blockedAppIds(snap.settings, os), // package names / bundle ids
    });
  };
  gate.subscribe(push);
  return gate.load().then((snap) => { push(snap); return snap; });
}

export { blockedAppIds };
