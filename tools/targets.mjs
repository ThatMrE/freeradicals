/**
 * One manifest, four stores.
 *
 * The extension source is identical everywhere; only the manifest differs, and
 * it differs for reasons that are not cosmetic:
 *
 *   Firefox rejects `background.service_worker` outright — MV3 there is an
 *   event page (`background.scripts`). It also refuses to install an unsigned
 *   add-on without a `browser_specific_settings.gecko.id`, and the MAIN-world
 *   content script the publish probe depends on only exists from Firefox 128.
 *
 *   Edge is Chromium, so it takes the Chrome manifest unchanged. It is a
 *   separate target anyway because it is a separate store submission with its
 *   own package and its own review.
 *
 *   Safari is converted by Xcode's safari-web-extension-converter, which reads
 *   a plain Chrome-shaped directory. It gets its own tree so the converter has
 *   something to point at, and so the conversion is reproducible.
 *
 * Every target is derived from one base here rather than hand-maintained, so a
 * new permission cannot land in Chrome and quietly go missing in Firefox.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PLATFORMS } from '../core/platforms.js';

export const TARGETS = ['chrome', 'edge', 'firefox', 'safari'];

/**
 * The lowest Firefox that has everything this extension actually uses.
 *
 * 128 introduced MAIN-world content scripts, which the publish probe is. 140
 * introduced `data_collection_permissions`, which AMO now expects every add-on
 * to declare — so the floor is 140. That is also the current ESR line, so the
 * cost of the higher floor is close to nothing.
 */
export const MIN_FIREFOX = '140.0';

/**
 * Firefox for Android tracks the desktop features a release or two behind:
 * `data_collection_permissions` landed there in 142. Declaring the two floors
 * separately means desktop is not held back by mobile.
 */
export const MIN_FIREFOX_ANDROID = '142.0';
/** MV3 + `world: "MAIN"` content scripts. */
export const MIN_CHROME = '111';

export const GECKO_ID = 'freeradicals@thatmre.github.io';

const NAME = 'Free Radicals — post before you scroll';
const DESCRIPTION =
  'Social feeds stay blocked until you publish something. Posting buys you a timed window; when it runs out, you post again.';

/** Every host the extension ships static content scripts for. */
export function hostMatches() {
  const hosts = [...new Set(PLATFORMS.flatMap((p) => p.web.hosts))].sort();
  return hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);
}

const ICONS = {
  16: 'extension/icons/icon-16.png',
  32: 'extension/icons/icon-32.png',
  48: 'extension/icons/icon-48.png',
  128: 'extension/icons/icon-128.png',
};

/**
 * @param {{ target?: string, version: string }} options
 * @returns {object} the manifest for that store
 */
export function buildManifest({ target = 'chrome', version }) {
  if (!TARGETS.includes(target)) throw new Error(`unknown target: ${target}`);
  const matches = hostMatches();

  const manifest = {
    manifest_version: 3,
    name: NAME,
    version,
    description: DESCRIPTION,
    permissions: ['storage', 'alarms', 'scripting', 'tabs'],
    host_permissions: matches,
    optional_host_permissions: ['*://*/*'],
    background: {
      service_worker: 'extension/background/service-worker.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches,
        js: ['extension/content/routes.generated.js', 'extension/content/boot.js'],
        run_at: 'document_start',
        all_frames: false,
      },
      {
        matches,
        js: ['extension/content/signals.generated.js', 'extension/content/probe.js'],
        run_at: 'document_start',
        world: 'MAIN',
        all_frames: false,
      },
    ],
    web_accessible_resources: [
      { resources: ['core/*', 'extension/shared/*', 'extension/content/*'], matches },
    ],
    action: {
      default_popup: 'extension/ui/popup.html',
      default_title: 'Free Radicals',
      default_icon: { ...ICONS },
    },
    options_ui: { page: 'extension/ui/options.html', open_in_tab: true },
    icons: { ...ICONS },
  };

  if (target === 'chrome' || target === 'edge' || target === 'safari') {
    manifest.minimum_chrome_version = MIN_CHROME;
    return manifest;
  }

  // Firefox.
  return {
    ...manifest,
    browser_specific_settings: {
      gecko_android: { strict_min_version: MIN_FIREFOX_ANDROID },
      gecko: {
        id: GECKO_ID,
        strict_min_version: MIN_FIREFOX,
        // AMO requires every add-on to declare what it collects. This one
        // collects nothing: no server, no analytics, no telemetry. Saying so
        // explicitly is both the truth and what the reviewer looks for.
        data_collection_permissions: { required: ['none'] },
      },
    },
    background: {
      // Firefox has no MV3 service worker; it runs an event page. Because each
      // store gets its own manifest, the Chrome-only key is simply left out
      // rather than carried along for Firefox to ignore and warn about.
      scripts: ['extension/background/service-worker.js'],
      type: 'module',
    },
  };
}

/** Files that belong in a store package. Everything else is repo furniture. */
export const PACKAGE_INCLUDE = [
  'core/',
  'extension/background/',
  'extension/content/',
  'extension/shared/',
  'extension/ui/',
  'extension/icons/',
];

export const PACKAGE_EXCLUDE = [/\.map$/, /~$/, /\.DS_Store$/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Every source file that belongs in a store package, repo-relative and sorted.
 * The builder and the packaging tests both call this, so they cannot disagree
 * about what actually ships.
 */
export function packageFiles(root) {
  const files = [];
  for (const entry of PACKAGE_INCLUDE) {
    for (const file of walk(join(root, entry))) {
      const rel = relative(root, file);
      if (PACKAGE_EXCLUDE.some((re) => re.test(rel))) continue;
      files.push(rel);
    }
  }
  return files.sort();
}
