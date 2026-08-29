import { createGate } from '../../core/index.js';
import { blockedAppIds } from './appIds.js';
import { attachNativeMirror } from './nativeMirror.js';
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


export { attachNativeMirror, blockedAppIds };
