import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORMS } from '../core/index.js';
import {
  GECKO_ID, MIN_CHROME, MIN_FIREFOX, MIN_FIREFOX_ANDROID, TARGETS, buildManifest,
  hostMatches, packageFiles,
} from '../tools/targets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const FILES = packageFiles(ROOT);
const FILE_SET = new Set(FILES);

/**
 * What ships, per store.
 *
 * The one bug this repo has actually shipped was a file the manifest depended
 * on that was not web-accessible — invisible to every unit test, fatal at
 * runtime. These tests walk the manifest's own references and insist each one
 * is present in the package, for every browser target.
 */

/** Every path a manifest points at, flattened. */
function referencedPaths(manifest) {
  const paths = [];
  const bg = manifest.background || {};
  if (bg.service_worker) paths.push(bg.service_worker);
  for (const s of bg.scripts || []) paths.push(s);
  for (const cs of manifest.content_scripts || []) paths.push(...(cs.js || []), ...(cs.css || []));
  for (const p of Object.values(manifest.icons || {})) paths.push(p);
  for (const p of Object.values((manifest.action || {}).default_icon || {})) paths.push(p);
  if ((manifest.action || {}).default_popup) paths.push(manifest.action.default_popup);
  if ((manifest.options_ui || {}).page) paths.push(manifest.options_ui.page);
  return [...new Set(paths)];
}

for (const target of TARGETS) {
  const manifest = buildManifest({ target, version });

  test(`${target}: manifest is a valid MV3 manifest`, () => {
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.name && manifest.name.length <= 75, 'name missing or over the store limit');
    assert.ok(manifest.description.length <= 132,
      `description is ${manifest.description.length} chars; every store caps it at 132`);
    assert.match(manifest.version, /^\d+(\.\d+){0,3}$/, 'version must be dot-separated integers');
    assert.equal(manifest.version, version, 'manifest version must track package.json');
  });

  test(`${target}: every file the manifest references is in the package`, () => {
    for (const path of referencedPaths(manifest)) {
      assert.ok(existsSync(join(ROOT, path)), `${target}: ${path} does not exist`);
      assert.ok(FILE_SET.has(path), `${target}: ${path} is referenced but not shipped in the package`);
    }
  });

  test(`${target}: the content script's import chain is web accessible`, () => {
    const exposed = manifest.web_accessible_resources[0].resources;
    // boot.js dynamic-imports main.js, which pulls in these trees. Chrome
    // refuses any of them that is not listed, and fails silently in the page.
    for (const dir of ['core/*', 'extension/shared/*', 'extension/content/*']) {
      assert.ok(exposed.includes(dir), `${target}: ${dir} must be web accessible`);
    }
  });

  test(`${target}: host permissions match the platform registry exactly`, () => {
    assert.deepEqual([...manifest.host_permissions].sort(), [...hostMatches()].sort());
    for (const p of PLATFORMS) {
      for (const host of p.web.hosts) {
        assert.ok(manifest.host_permissions.includes(`*://${host}/*`),
          `${target}: missing host permission for ${host} (${p.id})`);
      }
    }
  });

  test(`${target}: no repo furniture leaks into the package`, () => {
    for (const file of FILES) {
      assert.equal(/^(tests|tools|docs|mobile|node_modules|dist|\.github)\//.test(file), false,
        `${file} must not ship to users`);
    }
    assert.ok(FILES.length > 20, 'the package looks suspiciously empty');
  });
}

test('chrome, edge and safari take the Chromium manifest', () => {
  for (const target of ['chrome', 'edge', 'safari']) {
    const m = buildManifest({ target, version });
    assert.ok(m.background.service_worker, `${target} needs a service worker`);
    assert.equal(m.minimum_chrome_version, MIN_CHROME);
    assert.equal(m.browser_specific_settings, undefined,
      `${target} must not carry Gecko settings`);
  }
});

test('firefox gets an event page, an add-on id, and a floor of 128', () => {
  const m = buildManifest({ target: 'firefox', version });

  // Firefox has no MV3 service worker: without `scripts` the background never
  // runs, which means no alarms, no badge, and no expiry.
  assert.ok(Array.isArray(m.background.scripts) && m.background.scripts.length === 1,
    'Firefox needs background.scripts');
  assert.equal(m.background.scripts[0], 'extension/background/service-worker.js');

  // AMO will not sign an add-on without a stable id.
  assert.equal(m.browser_specific_settings.gecko.id, GECKO_ID);

  // The publish probe is a MAIN-world content script (Firefox 128+), and AMO
  // wants a data-collection declaration (Firefox 140+, Android 142+). Claiming
  // compatibility below those floors ships an add-on that does not work.
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, MIN_FIREFOX);
  const [major] = MIN_FIREFOX.split('.').map(Number);
  assert.ok(major >= 128, 'MAIN-world content scripts require Firefox 128+');
  assert.ok(major >= 140, 'data_collection_permissions requires Firefox 140+');
  assert.equal(m.browser_specific_settings.gecko_android.strict_min_version, MIN_FIREFOX_ANDROID);

  // This extension has no server and collects nothing; AMO requires that to be
  // stated rather than implied.
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });

  // Carrying Chrome's key here only earns a BACKGROUND_SERVICE_WORKER_IGNORED
  // warning from AMO; each store gets its own manifest, so it is left out.
  assert.equal(m.background.service_worker, undefined,
    'Firefox has no MV3 service worker — the key only draws a review warning');
  assert.equal(m.minimum_chrome_version, undefined, 'Gecko does not read minimum_chrome_version');
});

test('the MAIN-world probe is declared for every target that ships it', () => {
  for (const target of TARGETS) {
    const m = buildManifest({ target, version });
    const main = m.content_scripts.find((cs) => cs.world === 'MAIN');
    assert.ok(main, `${target} is missing the MAIN-world probe`);
    assert.ok(main.js.includes('extension/content/probe.js'));
    assert.equal(main.run_at, 'document_start');
  }
});

test('the committed root manifest matches the chrome target', () => {
  // The repo root doubles as the unpacked extension for development. If it
  // drifts from the built package, developers debug something users never run.
  const committed = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const built = buildManifest({ target: 'chrome', version });
  assert.deepEqual(committed, built,
    'manifest.json is stale — run `npm run build`');
});

test('permissions stay minimal and justified', () => {
  const m = buildManifest({ target: 'chrome', version });
  assert.deepEqual(m.permissions.sort(), ['alarms', 'scripting', 'storage', 'tabs']);
  // A blanket host permission would be a different product with a different
  // privacy story; the optional one grants nothing until a user approves it.
  assert.equal(m.host_permissions.includes('*://*/*'), false,
    'host access must stay enumerated, never a wildcard');
  assert.deepEqual(m.optional_host_permissions, ['*://*/*']);
});
