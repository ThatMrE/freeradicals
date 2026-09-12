#!/usr/bin/env node
/**
 * Loads the built site in a real browser and checks how it actually renders.
 *
 *   node tools/check-site-render.mjs      (after `npm run build:site`)
 *
 * check-site.mjs reads the files; this one looks at the result. It exists
 * because a squashed screenshot is invisible to every check that does not
 * rasterise: the markup is valid, the link resolves, the file is the right
 * image — and the page still shows it at the wrong shape. That shipped once,
 * when `width`/`height` attributes meant to reserve layout space beat a CSS
 * width with no matching `height: auto`.
 *
 * Per page, per width, it asserts:
 *   - every image loaded
 *   - every image is drawn at its own aspect ratio, within 1%
 *   - nothing logs an error
 *   - the page does not scroll sideways
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PAGES = ['/', '/privacy.html'];
const WIDTHS = [1280, 768, 390];
const TOLERANCE = 0.01;

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain', '.zip': 'application/zip',
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(SITE, path);
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const problems = [];
let checks = 0;

const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      const where = `${path} @ ${width}px`;
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${where}: console error — ${m.text()}`); });
      page.on('pageerror', (e) => problems.push(`${where}: page error — ${e.message}`));
      page.on('requestfailed', (r) => problems.push(`${where}: request failed — ${r.url()}`));

      await page.goto(base + path, { waitUntil: 'load' });
      // Lazy images below the fold never load in a headless pass otherwise, and
      // an image that is never drawn is an image never checked.
      await page.evaluate(() => { for (const img of document.images) img.loading = 'eager'; });
      await page.waitForTimeout(1200);

      const images = await page.evaluate(() => [...document.images].map((img) => {
        const box = img.getBoundingClientRect();
        return {
          src: new URL(img.currentSrc, location.href).pathname,
          loaded: img.complete && img.naturalWidth > 0,
          natural: img.naturalWidth / img.naturalHeight,
          drawn: box.width / box.height,
          size: `${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      }));

      for (const img of images) {
        checks += 1;
        if (!img.loaded) {
          problems.push(`${where}: ${img.src} did not load`);
          continue;
        }
        const off = Math.abs(img.natural - img.drawn) / img.natural;
        if (off > TOLERANCE) {
          problems.push(
            `${where}: ${img.src} drawn at ${img.size}, ${(off * 100).toFixed(1)}% off its own aspect ratio`,
          );
        }
      }

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (sideways) problems.push(`${where}: the page scrolls sideways`);

      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

for (const problem of problems) console.error(`broken: ${problem}`);
console.log(
  `${PAGES.length} pages x ${WIDTHS.length} widths, ${checks} images drawn, ${problems.length} problems`,
);
process.exit(problems.length ? 1 : 0);
