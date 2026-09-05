#!/usr/bin/env node
/**
 * Mobile release readiness.
 *
 * The gate exists so "can we ship the app?" has an answer that is checked
 * rather than remembered. It verifies the scaffold's *substance* — that the
 * native module is registered, the permissions enforcement actually needs are
 * declared, the SDK levels meet the stores' current floors — not merely that
 * files exist.
 *
 * Three states per requirement:
 *   ok       verified here and now
 *   blocked  cannot ship; the reason is stated
 *   todo     needs a credential or a human step that is not code
 *
 *   node tools/deploy/mobile.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLATFORMS } from '../../core/index.js';
import { blockedAppIds } from '../../mobile/bridge/appIds.js';
import { ROOT, version } from './lib.mjs';

const config = JSON.parse(readFileSync(join(ROOT, 'mobile/release.config.json'), 'utf8'));
const APP = join(ROOT, config.scaffold.appDir);

const rows = [];
const add = (state, area, detail) => rows.push({ state, area, detail });
const read = (rel) => (existsSync(join(APP, rel)) ? readFileSync(join(APP, rel), 'utf8') : null);

console.log(`\nMobile release readiness — Free Radicals ${version}\n`);

/* --- the shared half ------------------------------------------------------- */

const bridge = ['appIds.js', 'gateController.js', 'nativeMirror.js', 'storage.js', 'useGate.js', 'BlockScreen.jsx']
  .filter((f) => !existsSync(join(ROOT, 'mobile/bridge', f)));
add(bridge.length ? 'blocked' : 'ok', 'shared bridge',
  bridge.length ? `missing: ${bridge.join(', ')}` : 'gate, native mirror, storage and block screen present');

const android = blockedAppIds({ platformOverrides: {} }, 'android');
const ios = blockedAppIds({ platformOverrides: {} }, 'ios');
add(android.length === PLATFORMS.length && ios.length === PLATFORMS.length ? 'ok' : 'blocked',
  'app identifiers', `${android.length} Android packages, ${ios.length} iOS bundle ids`);

/* --- the app scaffold ------------------------------------------------------ */

const appPkg = read('package.json');
if (!appPkg) {
  add('blocked', 'app scaffold', `${config.scaffold.appDir} does not exist`);
} else {
  const parsed = JSON.parse(appPkg);
  const rn = (parsed.dependencies || {})['react-native'];
  add(rn ? 'ok' : 'blocked', 'app scaffold', rn ? `React Native ${rn}` : 'react-native is not a dependency');

  // Metro has to be told to watch the repository root, or the shared core the
  // app imports simply is not there at bundle time.
  const metro = read('metro.config.js') || '';
  add(metro.includes('watchFolders') ? 'ok' : 'blocked', 'metro resolves core',
    metro.includes('watchFolders') ? 'watchFolders covers the repository root' : 'watchFolders is not configured');

  const index = read('index.js') || '';
  add(index.includes('Block') ? 'ok' : 'blocked', 'block surface registered',
    index.includes('Block') ? 'FreeRadicalsBlock is registered for the overlay/shield' : 'no block surface in index.js');
}

/* --- android: the enforcement actually has to be wired --------------------- */

const manifest = read('android/app/src/main/AndroidManifest.xml');
if (!manifest) {
  add('blocked', 'android manifest', 'not found');
} else {
  const missing = config.android.permissions.filter((p) => !manifest.includes(p));
  add(missing.length ? 'blocked' : 'ok', 'android permissions',
    missing.length ? `not declared: ${missing.join(', ')}` : `${config.android.permissions.length} declared`);

  const wired = manifest.includes('FeedGateService') && manifest.includes('BlockActivity');
  add(wired ? 'ok' : 'blocked', 'android components',
    wired ? 'watcher service and block activity declared' : 'FeedGateService or BlockActivity is not in the manifest');
}

const mainApp = read('android/app/src/main/java/com/freeradicals/MainApplication.kt') || '';
add(mainApp.includes('GatePackage') ? 'ok' : 'blocked', 'android native module',
  mainApp.includes('GatePackage') ? 'GatePackage registered in MainApplication' : 'GatePackage is never registered — JS calls would no-op');

const gradle = read('android/build.gradle') || '';
for (const [key, label] of [['targetSdk', 'targetSdkVersion'], ['minSdk', 'minSdkVersion']]) {
  const found = Number((gradle.match(new RegExp(`${label}\\s*=\\s*(\\d+)`)) || [])[1]);
  const required = config.android[key];
  add(found >= required ? 'ok' : 'blocked', `android ${label}`,
    `${found || 'unset'} (needs ${required})`);
}

/* --- ios ------------------------------------------------------------------- */

const entitlements = read('ios/FreeRadicals/FreeRadicals.entitlements');
if (!entitlements) {
  add('blocked', 'ios entitlements', 'FreeRadicals.entitlements not found');
} else {
  const missing = config.ios.entitlements.filter((e) => !entitlements.includes(e));
  add(missing.length ? 'blocked' : 'ok', 'ios entitlements',
    missing.length ? `missing: ${missing.join(', ')} — ${config.ios.entitlementNote}` : 'family-controls and app group declared');
}

const pbx = read('ios/FreeRadicals.xcodeproj/project.pbxproj') || '';
add(pbx.includes(config.ios.bundleId) ? 'ok' : 'blocked', 'ios bundle id',
  pbx.includes(config.ios.bundleId) ? config.ios.bundleId : `still the template placeholder, not ${config.ios.bundleId}`);

add(read('ios/FreeRadicals/GateBridge.m') ? 'ok' : 'blocked', 'ios native module',
  read('ios/FreeRadicals/GateBridge.m') ? 'GateBridge exported to React Native' : 'GateBridge.m missing — the Swift module would be invisible to JS');

// The Screen Time extensions need Xcode targets, which cannot be hand-authored
// into a pbxproj safely. Their sources exist; the targets do not.
const targets = config.scaffold.iosExtensionTargets;
const declared = targets.filter((t) => pbx.includes(`${t}.appex`));
add(declared.length === targets.length ? 'ok' : 'blocked', 'ios extension targets',
  declared.length === targets.length
    ? targets.join(', ')
    : `sources written, targets not added in Xcode: ${targets.filter((t) => !declared.includes(t)).join(', ')} — see mobile/app/ios/README.md`);

/* --- deadlines, checked against the clock ---------------------------------- */

const today = new Date().toISOString().slice(0, 10);
for (const [os, key, value] of [
  ['android', 'targetSdkDeadline', `target SDK ${config.android.targetSdk}`],
  ['ios', 'sdkDeadline', `iOS SDK ${config.ios.sdk} (Xcode ${config.ios.xcode})`],
]) {
  const deadline = config[os][key];
  const inForce = today >= deadline;
  add(inForce ? 'todo' : 'ok', `${os} store requirement`,
    `${value} — ${inForce ? `required as of ${deadline}` : `required from ${deadline}`}`);
}

/* --- credentials ----------------------------------------------------------- */

for (const [os, names] of Object.entries({
  ios: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8'],
  android: ['PLAY_SERVICE_ACCOUNT_JSON'],
})) {
  const missing = names.filter((n) => !process.env[n]);
  add(missing.length ? 'todo' : 'ok', `${os} credentials`,
    missing.length ? `not set: ${missing.join(', ')}` : 'present');
}

/* --- report --------------------------------------------------------------- */

const mark = { ok: '✓', todo: '·', blocked: '✗' };
for (const r of rows) console.log(`  ${mark[r.state]} ${r.area.padEnd(26)} ${r.detail}`);

const blocked = rows.filter((r) => r.state === 'blocked');
const todo = rows.filter((r) => r.state === 'todo');

console.log('');
if (blocked.length) {
  console.log(`✗ mobile release is blocked by ${blocked.length} item(s). Nothing will be uploaded.`);
  console.log('  The extension pipeline is unaffected; see docs/RELEASING.md.\n');
  process.exit(1);
}
console.log(`✓ mobile release is ready${todo.length ? ` (${todo.length} item(s) need credentials or a human step)` : ''}\n`);
