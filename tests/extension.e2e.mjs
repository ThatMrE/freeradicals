/**
 * End-to-end check that the packed extension really gates a real page in a real
 * Chromium: block screen up, post through the popup, feed released, timer
 * expires, feed blocked again.
 *
 * The social network itself is stubbed with request interception — the test
 * needs the URL to match, not the site.
 *
 *   node tests/extension.e2e.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STUB = `<!doctype html><html><head><title>Feed</title></head>
  <body><div id="feed">real feed content</div></body></html>`;

const results = [];
const check = (name, fn) => { try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); } };

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'fr-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  console.log(`extension id: ${extensionId}`);

  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://x.com/')) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: STUB });
    }
    // The content script dynamic-imports its own module; never block that.
    if (url.startsWith('chrome-extension://')) return route.continue();
    return route.abort();
  });

  const attr = (page) => page.evaluate(() => document.documentElement.getAttribute('data-freeradicals'));
  const hasOverlay = (page) => page.evaluate(() => !!document.getElementById('freeradicals-root'));
  const bodyVisible = (page) => page.evaluate(() =>
    getComputedStyle(document.body).visibility === 'visible');

  /* 1. A feed route is blocked on arrival. ------------------------------- */
  const feed = await context.newPage();
  feed.on('console', (m) => { if (m.type() === 'error' || m.text().includes('free radicals')) console.log(`  [page] ${m.text()}`); });
  feed.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  await feed.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  await feed.waitForFunction(
    () => document.documentElement.getAttribute('data-freeradicals') === 'blocked',
    null, { timeout: 10000 },
  );
  check('feed route is blocked on arrival', () => {});
  const overlayMounted = await hasOverlay(feed);
  check('block screen is mounted', () => assert.equal(overlayMounted, true));
  const feedHidden = !(await bodyVisible(feed));
  check('page content is hidden behind the block screen', () => assert.equal(feedHidden, true));

  /* 2. A non-feed route on the same site stays usable. ------------------- */
  const settings = await context.newPage();
  await settings.goto('https://x.com/settings/account', { waitUntil: 'domcontentloaded' });
  await settings.waitForTimeout(800);
  const settingsAttr = await attr(settings);
  check('non-feed route is not in overlay mode', () =>
    assert.notEqual(settingsAttr, 'blocked', `got ${settingsAttr}`));

  /* 3. Posting through the popup releases the feed. ---------------------- */
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/extension/ui/popup.html`);
  await popup.waitForSelector('#post');
  await popup.fill('#input', 'Wrote the gate today. Producing before consuming is the whole idea.');
  await popup.waitForFunction(() => !document.getElementById('post').disabled);
  await popup.click('#post');

  await feed.waitForFunction(
    () => document.documentElement.getAttribute('data-freeradicals') !== 'blocked',
    null, { timeout: 8000 },
  );
  check('a valid post releases the feed', () => {});
  const visibleNow = await bodyVisible(feed);
  check('feed content is visible during the window', () => assert.equal(visibleNow, true));

  const status = await popup.textContent('#statusText');
  check('popup reports the open window', () => assert.match(status, /open/i));

  /* 4. A repeat of the same text is refused. ----------------------------- */
  await popup.reload();
  await popup.waitForSelector('#lock');
  const composerHidden = await popup.evaluate(() => document.getElementById('composeSection').hidden);
  check('composer is hidden while unlocked', () => assert.equal(composerHidden, true));

  /* 5. Expiry re-blocks the feed without a reload. ----------------------- */
  await worker.evaluate(async () => {
    const { session } = await chrome.storage.local.get('session');
    session.endsAt = Date.now() - 1000; // pretend the five minutes elapsed
    await chrome.storage.local.set({ session });
  });
  await feed.waitForFunction(
    () => document.documentElement.getAttribute('data-freeradicals') === 'blocked',
    null, { timeout: 8000 },
  );
  check('the feed re-blocks itself the moment the timer runs out', () => {});
  const hiddenAgain = !(await bodyVisible(feed));
  check('content is hidden again after expiry', () => assert.equal(hiddenAgain, true));

  /* 6. The same text cannot buy a second window. ------------------------- */
  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extensionId}/extension/ui/popup.html`);
  await popup2.waitForSelector('#post');
  await popup2.fill('#input', 'Wrote the gate today. Producing before consuming is the whole idea.');
  await popup2.waitForFunction(() => !document.getElementById('post').disabled);
  await popup2.click('#post');
  await popup2.waitForFunction(() => document.getElementById('error').textContent.length > 0,
    null, { timeout: 5000 });
  const err = await popup2.textContent('#error');
  check('reposting the same text is refused', () => assert.match(err, /already posted/i));
  const stillBlocked = await attr(feed);
  check('a refused post leaves the feed blocked', () => assert.equal(stillBlocked, 'blocked'));

  /* 7. The real flow: type in the block screen itself and post. ---------- */
  // The block screen lives in a closed shadow root, so it cannot be reached by
  // selector — which is the point of it being closed. It autofocuses its
  // textarea, so drive it the way a person does: keyboard only.
  await popup2.close();
  await feed.bringToFront();
  await feed.waitForTimeout(500);
  await feed.keyboard.type('Second window, written straight into the block screen instead of the popup.');
  await feed.keyboard.press('Control+Enter');
  await feed.waitForFunction(
    () => document.documentElement.getAttribute('data-freeradicals') !== 'blocked',
    null, { timeout: 8000 },
  );
  check('posting from the block screen itself opens the feed', () => {});

  const journal = await worker.evaluate(async () =>
    (await chrome.storage.local.get('journal')).journal.map((e) => e.text));
  check('the post was journalled', () =>
    assert.match(journal[0], /straight into the block screen/));
  check('the journal keeps every window it issued', () => assert.equal(journal.length, 2));
} finally {
  await context.close();
}

let failed = 0;
for (const [state, name] of results) {
  if (state === 'FAIL') failed += 1;
  console.log(`${state === 'ok' ? '  ok' : 'FAIL'}  ${name}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
