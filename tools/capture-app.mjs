#!/usr/bin/env node
/**
 * Captures the mobile app's screens for the site.
 *
 *   node tools/capture-app.mjs
 *
 * The screens are the app's own: mobile/app/src/*, over mobile/bridge and the
 * same core/ gate, rendered by react-native-web and driven at phone size. What
 * that buys is that these images cannot drift from the app — change a screen
 * and re-run, and the site shows the change.
 *
 * What it is not: an Android build. React Native's own components render here,
 * not Android's, so spacing and the system font differ from a device by a hair.
 * The site says so next to the images rather than implying an emulator.
 *
 * Two substitutions, both only for this harness:
 *   - `react-native`  -> `react-native-web`
 *   - AsyncStorage    -> an in-memory map, so each run starts from a clean
 *                        install rather than from whatever the last one wrote.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/img');
const APP = join(ROOT, 'mobile/app/src');
const VIEWPORT = { width: 390, height: 844 };

const POST = 'Shipped the earned-window rule today. The clock is now priced by the post: '
  + 'write more, and the gate hands back more of the feed. Five minutes is only the floor.';

/* ---------- build the app for the browser ---------- */

const work = mkdtempSync(join(tmpdir(), 'fr-app-'));

writeFileSync(join(work, 'async-storage-stub.js'), `
const store = new Map();
export default {
  async multiGet(keys) { return keys.map((k) => [k, store.has(k) ? store.get(k) : null]); },
  async multiSet(pairs) { for (const [k, v] of pairs) store.set(k, v); },
  async multiRemove(keys) { for (const k of keys) store.delete(k); },
  async getItem(k) { return store.has(k) ? store.get(k) : null; },
  async setItem(k, v) { store.set(k, v); },
  async removeItem(k) { store.delete(k); },
};
`);

writeFileSync(join(work, 'entry.jsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';

import App from ${JSON.stringify(join(APP, 'App.jsx'))};
import BlockOnly from ${JSON.stringify(join(APP, 'BlockOnly.jsx'))};

const view = new URLSearchParams(location.search).get('view');
createRoot(document.getElementById('root')).render(
  view === 'overlay' ? <BlockOnly appId="com.instagram.android" /> : <App />,
);
`);

await build({
  entryPoints: [join(work, 'entry.jsx')],
  bundle: true,
  outfile: join(work, 'app.js'),
  jsx: 'transform',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  alias: {
    'react-native': 'react-native-web',
    '@react-native-async-storage/async-storage': join(work, 'async-storage-stub.js'),
    // The app has its own copy of React; two Reacts in one bundle means hooks
    // throw on the first render. Everything resolves to the root copy.
    react: join(ROOT, 'node_modules/react'),
    'react-dom': join(ROOT, 'node_modules/react-dom'),
  },
  nodePaths: [join(ROOT, 'node_modules')],
  absWorkingDir: ROOT,
  logLevel: 'warning',
});

writeFileSync(join(work, 'index.html'), `<!doctype html>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body, #root { height: 100%; margin: 0; background: #0b0d12; }
  #root { display: flex; flex-direction: column; }
</style>
<div id="root"></div>
<script src="app.js"></script>
`);

/* ---------- serve it ---------- */

const server = createServer((req, res) => {
  const file = req.url.startsWith('/app.js') ? 'app.js' : 'index.html';
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(readFileSync(join(work, file)));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

/* ---------- drive it ---------- */

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `app-${name}.jpg`), type: 'jpeg', quality: 72 });
  console.log(`  app-${name}.jpg`);
}

try {
  /* The overlay: what Android's service puts over a blocked app. */
  const overlay = await context.newPage();
  await overlay.goto(`${base}/?view=overlay`, { waitUntil: 'load' });
  await overlay.waitForTimeout(800);
  await shot(overlay, '01-overlay');

  await overlay.getByPlaceholder(/what/i).first().fill(POST);
  await overlay.waitForTimeout(400);
  await shot(overlay, '02-earning');
  await overlay.close();

  /* The app itself: write, then home with the window running, then settings. */
  const app = await context.newPage();
  await app.goto(base, { waitUntil: 'load' });
  await app.waitForTimeout(800);

  await app.getByText('Write something').click();
  await app.waitForTimeout(400);
  await app.getByPlaceholder(/what/i).first().fill(POST);
  await app.waitForTimeout(300);
  await app.getByText(/^Post & open/).first().click();
  await app.waitForTimeout(900);
  await shot(app, '03-home');

  await app.getByText('Settings').first().click();
  await app.waitForTimeout(600);
  await shot(app, '04-settings');
} finally {
  await browser.close();
  server.close();
}
