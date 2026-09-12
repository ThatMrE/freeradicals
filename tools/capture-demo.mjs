#!/usr/bin/env node
/**
 * Captures the screenshots the site uses, by driving the real extension in a
 * real Chromium — the same way tests/extension.e2e.mjs does.
 *
 *   node tools/capture-demo.mjs            both device sizes
 *   node tools/capture-demo.mjs desktop    just one
 *
 * The images on the landing page are evidence, so they are produced by a script
 * anyone can re-run rather than assembled by hand: every frame below is the
 * extension reacting to typing and to the clock, never a mockup.
 *
 * The network is stubbed — the extension matches on URL, so the fixture only
 * has to be at the right address, and it says so on its own face.
 */
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/img');

/**
 * `keep` is exactly the set the site shows. The flow still walks through the
 * states in between — you cannot reach "the same post refused" without first
 * posting one — they are simply not written out, so the repository and the
 * deploy carry no image nothing links to.
 */
const DEVICES = {
  desktop: {
    viewport: { width: 1280, height: 860 },
    prefix: '',
    extensionPages: true,
    keep: ['01-blocked', '03-earning-more', '04-open', '05-warning', '07-repeat-refused',
           '08-popup', '09-settings'],
  },
  phone: {
    viewport: { width: 390, height: 844 },
    prefix: 'phone-',
    extensionPages: false,
    keep: ['01-blocked', '03-earning-more', '04-open'],
  },
};

/** A feed-shaped page that never pretends to be a real network. */
const STUB = `<!doctype html><html><head><title>Feed</title><style>
  body { margin:0; font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
         background:#f6f7f9; color:#111; }
  header { background:#fff; border-bottom:1px solid #e5e7eb; padding:14px 24px; font-weight:650; }
  main { max-width:620px; margin:0 auto; padding:24px 16px; display:grid; gap:16px; }
  article { background:#fff; border:1px solid #e9ebef; border-radius:12px; padding:16px;
            display:flex; gap:14px; }
  .avatar { width:38px; height:38px; border-radius:999px; background:#dfe3ea; flex:none; }
  .lines { flex:1; display:grid; gap:8px; padding-top:4px; }
  .line { height:9px; border-radius:5px; background:#e4e7ec; }
</style></head><body>
  <header>stubbed feed &mdash; test fixture, not a real social network</header>
  <main>${Array.from({ length: 6 }, () => `<article><div class="avatar"></div><div class="lines">
    <div class="line" style="width:38%"></div><div class="line" style="width:88%"></div>
    <div class="line" style="width:70%"></div><div class="line" style="width:50%"></div>
  </div></article>`).join('')}</main>
</body></html>`;

const SHORT = 'Shipped the earned-window rule today.';
const LONG = `${SHORT} The clock is now priced by the post: write more, and the gate hands back more of the feed. Five minutes is only the floor.`;

const blocked = (page) => page.waitForFunction(
  () => document.documentElement.getAttribute('data-freeradicals') === 'blocked',
  null, { timeout: 10000 },
);
const released = (page) => page.waitForFunction(
  () => document.documentElement.getAttribute('data-freeradicals') !== 'blocked',
  null, { timeout: 10000 },
);

async function capture(name, page, { prefix, keep }) {
  if (!keep.includes(name)) return;
  await page.screenshot({ path: join(OUT, `${prefix}${name}.jpg`), type: 'jpeg', quality: 72 });
  console.log(`  ${prefix}${name}.jpg`);
}

async function run(deviceName) {
  const device = DEVICES[deviceName];
  const { viewport, extensionPages } = device;
  console.log(`${deviceName} ${viewport.width}x${viewport.height}`);

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'fr-shot-')), {
    channel: 'chromium',
    headless: true,
    viewport,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;

    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('https://x.com/')) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: STUB });
      }
      if (url.startsWith('chrome-extension://')) return route.continue();
      return route.abort();
    });

    const feed = context.pages()[0] ?? await context.newPage();
    await feed.setViewportSize(viewport);
    await feed.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await blocked(feed);
    await feed.waitForTimeout(400);
    await capture('01-blocked', feed, device);

    // The block screen's textarea autofocuses and lives in a closed shadow
    // root, so it is driven the way a person drives it: keyboard only.
    await feed.keyboard.type(SHORT);
    await feed.waitForTimeout(300);
    await capture('02-earning-base', feed, device);

    await feed.keyboard.type(LONG.slice(SHORT.length));
    await feed.waitForTimeout(300);
    await capture('03-earning-more', feed, device);

    await feed.keyboard.press('Control+Enter');
    await released(feed);
    await feed.waitForTimeout(600);
    await capture('04-open', feed, device);

    // Wind the clock down to the last seconds instead of waiting for them.
    await worker.evaluate(async () => {
      const { session } = await chrome.storage.local.get('session');
      await chrome.storage.local.set({ session: { ...session, endsAt: Date.now() + 18_500 } });
    });
    await feed.waitForTimeout(1200);
    await capture('05-warning', feed, device);

    await worker.evaluate(() => chrome.storage.local.set({ session: null }));
    await blocked(feed);
    await feed.waitForTimeout(400);
    await capture('06-reblocked', feed, device);

    // The same text a second time: the gate wants something new.
    await feed.keyboard.type(LONG);
    await feed.keyboard.press('Control+Enter');
    await feed.waitForTimeout(900);
    await capture('07-repeat-refused', feed, device);

    if (extensionPages) {
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 420, height: 560 });
      await popup.goto(`chrome-extension://${extensionId}/extension/ui/popup.html`);
      await popup.waitForSelector('#post');
      await popup.waitForTimeout(500);
      await capture('08-popup', popup, device);

      const options = await context.newPage();
      await options.setViewportSize(viewport);
      await options.goto(`chrome-extension://${extensionId}/extension/ui/options.html`);
      await options.waitForTimeout(700);
      await capture('09-settings', options, device);
    }
  } finally {
    await context.close();
  }
}

mkdirSync(OUT, { recursive: true });
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const device of requested.length ? requested : Object.keys(DEVICES)) {
  if (!DEVICES[device]) throw new Error(`unknown device: ${device}`);
  await run(device);
}
