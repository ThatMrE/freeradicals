import { PLATFORMS, isPlatformEnabled } from '../../core/index.js';

/**
 * Translate the shared platform registry into native app identifiers — the
 * package names Android's overlay watches for, or the bundle ids iOS shields.
 *
 * Kept free of React Native imports so it runs (and is tested) under plain Node.
 *
 * @param {object} settings
 * @param {'android'|'ios'} os
 */
export function blockedAppIds(settings, os = 'android') {
  return PLATFORMS
    .filter((p) => isPlatformEnabled(settings, p.id))
    .map((p) => (os === 'ios' ? p.mobile.ios : p.mobile.android))
    .filter(Boolean);
}

/**
 * The platform a native app identifier belongs to, or null for one we do not
 * gate. Android package names and iOS bundle ids are both matched, since the
 * block screen is handed whichever one the OS it is running on uses.
 *
 * Needed because a package name is not a name: the last segment of
 * `com.instagram.android` is "android", and of `com.zhiliaoapp.musically` it is
 * "musically". The registry already knows what these apps are called.
 */
export function platformForAppId(appId) {
  if (!appId) return null;
  const id = String(appId);
  return PLATFORMS.find((p) => p.mobile.android === id || p.mobile.ios === id) || null;
}

/** The deep link that opens a platform's native composer with text prefilled. */
export function composeIntent(platform, text) {
  const scheme = platform && platform.mobile && platform.mobile.iosScheme;
  return typeof scheme === 'function' ? scheme(text) : null;
}
