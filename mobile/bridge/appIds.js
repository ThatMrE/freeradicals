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

/** The deep link that opens a platform's native composer with text prefilled. */
export function composeIntent(platform, text) {
  const scheme = platform && platform.mobile && platform.mobile.iosScheme;
  return typeof scheme === 'function' ? scheme(text) : null;
}
