import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_SETTINGS, PLATFORMS, getPlatform } from '../core/index.js';
import { blockedAppIds, composeIntent } from '../mobile/bridge/appIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The mobile port is only cheap while core/ stays free of platform APIs. That
 * is a property worth enforcing mechanically rather than promising in a README:
 * the first `document.querySelector` that lands in core/ is the moment the
 * Android and iOS shells stop being thin.
 */
test('core has no browser, extension, or React Native dependencies', () => {
  const banned = [
    /\bdocument\./, /\bwindow\./, /\bchrome\.\w/, /\bbrowser\.\w/,
    /\blocalStorage\b/, /\bnavigator\./, /\brequire\s*\(/,
    /from\s+['"]react/, /\bsetTimeout\b/, /\bfetch\s*\(/,
  ];
  const files = readdirSync(join(ROOT, 'core')).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 9, 'expected the full core to be scanned');

  for (const file of files) {
    const source = readFileSync(join(ROOT, 'core', file), 'utf8')
      // Comments describe the platforms; only real code is disqualifying.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of banned) {
      assert.equal(pattern.test(source), false, `core/${file} uses ${pattern}`);
    }
  }
});

test('core imports nothing outside core', () => {
  for (const file of readdirSync(join(ROOT, 'core')).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(ROOT, 'core', file), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^\.\/[\w.-]+\.js$/, `core/${file} imports ${match[1]}`);
    }
  }
});

test('every platform carries the identifiers the mobile shells need', () => {
  for (const p of PLATFORMS) {
    assert.ok(p.mobile, `${p.id} has no mobile block`);
    assert.equal(typeof p.mobile.android, 'string', `${p.id} is missing an Android package`);
    assert.equal(typeof p.mobile.ios, 'string', `${p.id} is missing an iOS bundle id`);
    assert.match(p.mobile.android, /^[a-z][\w.]+$/, `${p.id} android id looks wrong`);
    assert.ok(Array.isArray(p.mobile.feedScreens), `${p.id} has no feed screens`);
  }
});

test('blocked app lists follow the shared platform settings', () => {
  const all = blockedAppIds(DEFAULT_SETTINGS, 'android');
  assert.equal(all.length, PLATFORMS.length);
  assert.ok(all.includes('com.reddit.frontpage'));

  const some = blockedAppIds(
    { platformOverrides: { tiktok: false, youtube: false } }, 'android',
  );
  assert.equal(some.length, PLATFORMS.length - 2);
  assert.equal(some.includes('com.zhiliaoapp.musically'), false);

  const ios = blockedAppIds(DEFAULT_SETTINGS, 'ios');
  assert.ok(ios.includes('com.burbn.instagram'));
});

test('mobile compose intents carry the text', () => {
  const url = composeIntent(getPlatform('x'), 'hello there');
  assert.equal(url, 'twitter://post?message=hello%20there');
  assert.equal(composeIntent(getPlatform('facebook'), 'x'), null, 'no scheme means no fake link');
});

test('the generated extension tables match the registry', () => {
  const routes = readFileSync(join(ROOT, 'extension/content/routes.generated.js'), 'utf8');
  const signals = readFileSync(join(ROOT, 'extension/content/signals.generated.js'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

  for (const p of PLATFORMS) {
    assert.ok(routes.includes(`"${p.id}"`), `routes table is missing ${p.id}`);
    assert.ok(signals.includes(`"${p.id}"`), `signals table is missing ${p.id}`);
    for (const host of p.web.hosts) {
      assert.ok(
        manifest.host_permissions.includes(`*://${host}/*`),
        `manifest is missing ${host} — re-run tools/build-manifest.mjs`,
      );
    }
  }
});

test('every file the extension loads at runtime is web accessible', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const exposed = manifest.web_accessible_resources[0].resources;
  // main.js is dynamically imported by the content script and pulls in these
  // trees; Chrome refuses any of them that is not listed here.
  for (const dir of ['core/*', 'extension/shared/*', 'extension/content/*']) {
    assert.ok(exposed.includes(dir), `${dir} must be web accessible`);
  }
});
