/**
 * Free Radicals core — platform-agnostic gate logic.
 *
 * Nothing in this directory may import a browser, Chrome, or React Native API.
 * That constraint is what makes the Chrome extension and the mobile overlay two
 * thin shells over one implementation. See docs/ARCHITECTURE.md.
 */
export * from './clock.js';
export * from './config.js';
export * from './duration.js';
export * from './format.js';
export * from './gate.js';
export * from './journal.js';
export * from './platforms.js';
export * from './quotes.js';
export * from './session.js';
export * from './storage.js';
export * from './text.js';
