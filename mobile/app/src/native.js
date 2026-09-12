import { NativeModules, Platform } from 'react-native';

/**
 * The JavaScript side of the native bridge.
 *
 * Everything the gate decides stays in core/. Native code is asked only to
 * *enforce* — to watch the foreground app and put a screen over it, or to
 * raise and lower a Screen Time shield. That asymmetry is what let the same
 * gate ship in a browser extension first.
 *
 * The module is wrapped rather than used directly so that a JS-only run
 * (Metro on a simulator without the native build, or a unit test) degrades to
 * a no-op instead of crashing on `undefined.setGateState`.
 */
const Native = NativeModules.FreeRadicals || null;

export const hasNativeModule = Native !== null;

function warnOnce(method) {
  if (warnOnce.seen.has(method)) return;
  warnOnce.seen.add(method);
  console.warn(
    `[free radicals] native method "${method}" is unavailable. `
    + 'The JS gate still works; nothing is being blocked.',
  );
}
warnOnce.seen = new Set();

/** The one call the shared gate makes. See mobile/bridge/nativeMirror.js. */
export const gateBridge = {
  setGateState(state) {
    if (!Native) return warnOnce('setGateState');
    return Native.setGateState(state);
  },
};

/**
 * Android needs two permissions the user must grant by hand, in Settings:
 * usage access (to see which app is in front) and draw-over-other-apps (to
 * put the block screen there). Neither can be granted from a normal prompt.
 */
export const android = {
  async permissions() {
    if (Platform.OS !== 'android' || !Native) return { usageAccess: false, overlay: false };
    return Native.getPermissions();
  },
  openUsageAccessSettings() {
    if (Platform.OS !== 'android' || !Native) return;
    Native.openUsageAccessSettings();
  },
  openOverlaySettings() {
    if (Platform.OS !== 'android' || !Native) return;
    Native.openOverlaySettings();
  },
  startWatching() {
    if (Platform.OS !== 'android' || !Native) return;
    Native.startWatching();
  },
  stopWatching() {
    if (Platform.OS !== 'android' || !Native) return;
    Native.stopWatching();
  },
};

/**
 * iOS cannot draw over another app, so the enforcement is Screen Time:
 * FamilyControls asks for authorization, the user picks the apps themselves in
 * a system picker (the app never learns what they picked), and ManagedSettings
 * raises the shield.
 */
export const ios = {
  async isAuthorized() {
    if (Platform.OS !== 'ios' || !Native) return false;
    return Native.isAuthorized();
  },
  async requestAuthorization() {
    if (Platform.OS !== 'ios' || !Native) return false;
    return Native.requestAuthorization();
  },
  presentAppPicker() {
    if (Platform.OS !== 'ios' || !Native) return;
    Native.presentAppPicker();
  },
};

/** What the current platform needs before it can block anything. */
export function enforcementRequirements() {
  return Platform.OS === 'ios'
    ? [{ key: 'screenTime', label: 'Screen Time access', detail: 'Lets Free Radicals shield the apps you choose.' }]
    : [
      { key: 'usageAccess', label: 'Usage access', detail: 'Lets Free Radicals see which app is in front.' },
      { key: 'overlay', label: 'Display over other apps', detail: 'Lets the block screen cover a feed.' },
    ];
}
