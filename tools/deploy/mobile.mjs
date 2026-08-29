#!/usr/bin/env node
/**
 * Mobile release readiness.
 *
 * The iOS and Android pipelines are defined (mobile/fastlane/Fastfile) and the
 * shared JavaScript they depend on is tested (tests/mobile.test.js), but the
 * React Native app itself is not in this repository yet. This check exists so
 * that fact is a loud, failing gate rather than a pipeline that appears to work
 * until someone tags a release.
 *
 * It reports three states per requirement:
 *   ok       verified here and now
 *   blocked  cannot proceed; the reason is stated
 *   todo     needs a credential or a decision that is not code
 *
 *   node tools/deploy/mobile.mjs [--dry-run]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLATFORMS } from '../../core/index.js';
import { blockedAppIds } from '../../mobile/bridge/appIds.js';
import { ROOT, version } from './lib.mjs';

const config = JSON.parse(readFileSync(join(ROOT, 'mobile/release.config.json'), 'utf8'));
const rows = [];
const add = (state, area, detail) => rows.push({ state, area, detail });

console.log(`\nMobile release readiness — Free Radicals ${version}\n`);

/* --- what is genuinely verifiable today ----------------------------------- */

const bridge = ['appIds.js', 'gateController.js', 'nativeMirror.js', 'storage.js', 'useGate.js', 'BlockScreen.jsx']
  .filter((f) => !existsSync(join(ROOT, 'mobile/bridge', f)));
if (bridge.length) add('blocked', 'shared bridge', `missing: ${bridge.join(', ')}`);
else add('ok', 'shared bridge', 'gate, native mirror, storage adapter and block screen present');

const android = blockedAppIds({ platformOverrides: {} }, 'android');
const ios = blockedAppIds({ platformOverrides: {} }, 'ios');
add(
  android.length === PLATFORMS.length && ios.length === PLATFORMS.length ? 'ok' : 'blocked',
  'app identifiers',
  `${android.length} Android packages, ${ios.length} iOS bundle ids for ${PLATFORMS.length} platforms`,
);

for (const [os, ref] of [['android', 'mobile/android/FeedGateService.kt'], ['ios', 'mobile/ios/ShieldGate.swift']]) {
  add(existsSync(join(ROOT, ref)) ? 'ok' : 'blocked', `${os} reference`, ref);
}

/* --- deadlines, checked against the clock rather than remembered ---------- */

const today = new Date().toISOString().slice(0, 10);
for (const [os, key, value] of [
  ['android', 'targetSdkDeadline', `target SDK ${config.android.targetSdk}`],
  ['ios', 'sdkDeadline', `iOS SDK ${config.ios.sdk} (Xcode ${config.ios.xcode})`],
]) {
  const deadline = config[os][key];
  const passed = today >= deadline;
  add(
    passed ? 'todo' : 'ok',
    `${os} store requirement`,
    `${value} — ${passed ? `required as of ${deadline}` : `required from ${deadline}`}`,
  );
}

/* --- the blocker ---------------------------------------------------------- */

const appDir = join(ROOT, config.scaffold.appDir);
const hasApp = existsSync(appDir);
add(hasApp ? 'ok' : 'blocked', 'app scaffold', hasApp ? config.scaffold.appDir : config.scaffold.note);

const secrets = {
  ios: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8'],
  android: ['PLAY_SERVICE_ACCOUNT_JSON'],
};
for (const [os, names] of Object.entries(secrets)) {
  const missing = names.filter((n) => !process.env[n]);
  add(missing.length ? 'todo' : 'ok', `${os} credentials`,
    missing.length ? `not set: ${missing.join(', ')}` : 'present');
}

/* --- report --------------------------------------------------------------- */

const mark = { ok: '✓', todo: '·', blocked: '✗' };
for (const r of rows) {
  console.log(`  ${mark[r.state]} ${r.area.padEnd(24)} ${r.detail}`);
}

const blocked = rows.filter((r) => r.state === 'blocked');
const todo = rows.filter((r) => r.state === 'todo');

console.log('');
if (blocked.length) {
  console.log(`✗ mobile release is blocked by ${blocked.length} item(s). Nothing will be uploaded.`);
  console.log('  The extension pipeline is unaffected; see docs/RELEASING.md for the mobile plan.\n');
  process.exit(1);
}
console.log(`✓ mobile release is ready${todo.length ? ` (${todo.length} item(s) need credentials or a decision)` : ''}\n`);
