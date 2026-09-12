import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '@babel/parser';

import { DEFAULT_SETTINGS } from '../core/index.js';
import { gateStateFor } from '../mobile/bridge/nativeMirror.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'mobile/app');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * The React Native app.
 *
 * None of this can be bundled or compiled here — there is no Android SDK and
 * no Xcode — so these tests cover the failures that would otherwise only show
 * up on a device: a syntax error, an import that resolves to nothing, and a
 * JavaScript call to a native method that does not exist. That last one is the
 * nastiest, because it fails silently: the call simply never arrives, and the
 * app looks like it is working while nothing is being blocked.
 */

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCES = [...jsFiles(join(APP, 'src')), ...jsFiles(join(ROOT, 'mobile/bridge')), join(APP, 'index.js')];

test('every app source parses as modern JSX', () => {
  assert.ok(SOURCES.length >= 10, `expected the app to be scanned, found ${SOURCES.length} files`);
  for (const file of SOURCES) {
    try {
      parse(readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['jsx'],
      });
    } catch (err) {
      assert.fail(`${file.replace(ROOT, '.')}: ${err.message}`);
    }
  }
});

test('every relative import resolves to a file that exists', () => {
  // The app imports across three directories — its own src, the shared bridge
  // one level up, and core two levels up. A wrong number of `../` is invisible
  // until Metro tries to bundle.
  for (const file of SOURCES) {
    const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const spec = node.source.value;
      if (!spec.startsWith('.')) continue;

      const target = resolve(dirname(file), spec);
      const found = existsSync(target)
        || ['.js', '.jsx', '/index.js'].some((ext) => existsSync(target + ext));
      assert.ok(found, `${file.replace(ROOT, '.')} imports "${spec}" which does not exist`);
    }
  }
});

test('the app imports the same core the extension does', () => {
  const settings = read('mobile/app/src/screens/SettingsScreen.jsx');
  assert.match(settings, /from '(\.\.\/)+core\/index\.js'/,
    'settings must read the shared platform registry, not a copy');

  const home = read('mobile/app/src/screens/HomeScreen.jsx');
  assert.match(home, /formatCountdown/, 'the countdown must come from core, not be reimplemented');
});

/* --- the JS ↔ native contract --------------------------------------------- */

/** Every native method the JavaScript actually calls. */
function calledNativeMethods() {
  const source = read('mobile/app/src/native.js');
  return [...new Set([...source.matchAll(/Native\.(\w+)\(/g)].map((m) => m[1]))];
}

// Enforcement differs by platform, so some methods exist on only one side.
// Each is guarded by a Platform check in native.js; the test below asserts
// that, so an unguarded call cannot hide behind this list.
const ANDROID_ONLY = [
  'getPermissions', 'openUsageAccessSettings', 'openOverlaySettings',
  'startWatching', 'stopWatching',
];
const IOS_ONLY = ['isAuthorized', 'requestAuthorization', 'presentAppPicker'];

test('every platform-specific native call is guarded by a Platform check', () => {
  // The native module object exists on both platforms; only its *methods*
  // differ. So `if (Native)` is not enough — calling an Android-only method on
  // iOS reaches a real object and throws. Each wrapper must check the OS, and
  // the check has to be in that method's own body, which means reading the
  // enclosing function rather than nearby characters.
  const source = read('mobile/app/src/native.js');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const bodies = [];

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (['ObjectMethod', 'FunctionDeclaration', 'ArrowFunctionExpression', 'FunctionExpression'].includes(node.type)) {
      bodies.push(source.slice(node.start, node.end));
    }
    for (const key of Object.keys(node)) {
      if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments') walk(node[key]);
    }
  };
  walk(ast.program.body);

  for (const method of [...ANDROID_ONLY, ...IOS_ONLY]) {
    const owning = bodies.filter((b) => b.includes(`Native.${method}(`));
    assert.ok(owning.length > 0, `${method} is listed as platform-specific but never called`);
    // The innermost enclosing function is the shortest one containing the call.
    const body = owning.sort((a, b) => a.length - b.length)[0];
    assert.match(body, /Platform\.OS !== '(ios|android)'/,
      `Native.${method}() is called without a Platform check — it would throw on the other OS`);
  }
});

test('every native method JavaScript calls exists on Android', () => {
  const kotlin = read('mobile/app/android/app/src/main/java/com/freeradicals/GateBridgeModule.kt');
  for (const method of calledNativeMethods()) {
    if (IOS_ONLY.includes(method)) continue;
    assert.match(kotlin, new RegExp(`fun ${method}\\s*\\(`),
      `native.js calls ${method}() but GateBridgeModule.kt does not define it`);
  }
  // A Kotlin method without @ReactMethod is invisible to JavaScript.
  const exported = [...kotlin.matchAll(/@ReactMethod\s+fun (\w+)/g)].map((m) => m[1]);
  for (const method of calledNativeMethods()) {
    if (IOS_ONLY.includes(method)) continue;
    assert.ok(exported.includes(method), `${method} is missing @ReactMethod, so JS calls never arrive`);
  }
});

test('every native method JavaScript calls is exported on iOS', () => {
  const bridge = read('mobile/app/ios/FreeRadicals/GateBridge.m');
  const swift = read('mobile/app/ios/FreeRadicals/GateBridge.swift');
  for (const method of calledNativeMethods()) {
    if (ANDROID_ONLY.includes(method)) continue;
    assert.match(bridge, new RegExp(`RCT_EXTERN_METHOD\\(\\s*${method}`),
      `native.js calls ${method}() but GateBridge.m does not export it`);
    assert.match(swift, new RegExp(`func ${method}`),
      `GateBridge.m exports ${method} but GateBridge.swift does not implement it`);
  }
});

test('both platforms read every field the gate sends', () => {
  const state = gateStateFor(
    { status: 'unlocked', endsAt: 123, settings: DEFAULT_SETTINGS },
    'android',
  );
  const kotlin = read('mobile/app/android/app/src/main/java/com/freeradicals/GateBridgeModule.kt');
  const swift = read('mobile/app/ios/FreeRadicals/GateBridge.swift');

  for (const key of Object.keys(state)) {
    assert.ok(kotlin.includes(`"${key}"`), `Android never reads "${key}" from the gate state`);
  }
  // iOS shields whole apps chosen through the system picker, so it has no use
  // for blockedApps — the tokens are opaque and the list would be meaningless.
  for (const key of ['status', 'unlockedUntil']) {
    assert.ok(swift.includes(`"${key}"`), `iOS never reads "${key}" from the gate state`);
  }
});

test('the block surface the natives launch is the one that is registered', () => {
  const index = read('mobile/app/index.js');
  const activity = read('mobile/app/android/app/src/main/java/com/freeradicals/BlockActivity.kt');

  const registered = (index.match(/registerComponent\(`\$\{appName\}(\w+)`/) || [])[1];
  assert.equal(registered, 'Block', 'index.js should register a Block surface');
  assert.match(activity, /"FreeRadicalsBlock"/,
    'BlockActivity must ask for the surface index.js registers, or it renders nothing');
});

/* --- enforcement is declared, not just implemented ------------------------ */

test('android declares every permission its enforcement needs', () => {
  const manifest = read('mobile/app/android/app/src/main/AndroidManifest.xml');
  for (const permission of [
    'PACKAGE_USAGE_STATS',   // read the foreground app
    'SYSTEM_ALERT_WINDOW',   // launch the block screen from the background
    'FOREGROUND_SERVICE',    // keep the watcher alive
  ]) {
    assert.match(manifest, new RegExp(permission), `${permission} is not declared`);
  }
  // Enumerating installed apps is not needed and would be a privacy claim this
  // product does not want to make. Match a real declaration, not the substring:
  // the manifest comment names the permission precisely to say it is not asked
  // for, and a naive includes() reads that as a request.
  assert.equal(/<uses-permission[^>]*QUERY_ALL_PACKAGES/.test(manifest), false,
    'the app compares one foreground package to a list; it never enumerates apps');
});

test('the back button cannot dismiss the block screen', () => {
  const activity = read('mobile/app/android/app/src/main/java/com/freeradicals/BlockActivity.kt');
  assert.match(activity, /onBackPressed/, 'back must be handled');
  assert.match(activity, /moveTaskToBack/,
    'back should leave the block screen, not dismiss the gate');
});

test('ios asks for exactly the entitlements Screen Time needs', () => {
  const entitlements = read('mobile/app/ios/FreeRadicals/FreeRadicals.entitlements');
  assert.match(entitlements, /com\.apple\.developer\.family-controls/);
  // All three processes — app, shield, monitor — read gate state through this.
  assert.match(entitlements, /group\.com\.freeradicals/);
});

test('nothing shadows a global the app also uses', () => {
  // A component named `Number` parses fine, imports fine, and then throws the
  // first time someone edits a numeric setting, because `Number.parseInt`
  // inside it resolves to the component. Cheap to check, invisible otherwise.
  const globals = ['Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'Math', 'JSON', 'Error', 'Map', 'Set'];

  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8');
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    for (const node of ast.program.body) {
      const declared = node.type === 'FunctionDeclaration' ? [node.id && node.id.name]
        : node.type === 'VariableDeclaration' ? node.declarations.map((d) => d.id.name)
          : [];
      for (const name of declared) {
        assert.equal(globals.includes(name), false,
          `${file.replace(ROOT, '.')} declares "${name}", shadowing the global of the same name`);
      }
    }
  }
});

test('no release signing material is in the repository', () => {
  // The release pipeline takes every credential from CI secrets. A signing key
  // committed once stays in the history forever, so this is worth asserting
  // rather than trusting to a .gitignore nobody re-reads.
  const dangerous = /\.(jks|p8|p12|mobileprovision)$|(?<!debug)\.keystore$/;
  const offenders = [];

  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'dist', '.git', 'build', 'Pods'].includes(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) scan(full);
      else if (dangerous.test(name)) offenders.push(full.replace(ROOT, '.'));
    }
  };
  scan(ROOT);

  assert.deepEqual(offenders, [], `signing material must never be committed: ${offenders.join(', ')}`);

  // And the ignore rules that keep it that way.
  const ignore = read('mobile/app/.gitignore');
  for (const pattern of ['*.keystore', '*.p8', '*.p12', '*.mobileprovision']) {
    assert.ok(ignore.includes(pattern), `${pattern} is not ignored`);
  }
});

test('identifiers agree between the app and the release config', () => {
  const config = JSON.parse(read('mobile/release.config.json'));
  const gradle = read('mobile/app/android/app/build.gradle');
  const pbx = read('mobile/app/ios/FreeRadicals.xcodeproj/project.pbxproj');

  assert.match(gradle, new RegExp(`applicationId "${config.android.applicationId}"`),
    'Android applicationId disagrees with release.config.json');
  assert.ok(pbx.includes(config.ios.bundleId),
    'iOS bundle id disagrees with release.config.json');
});
