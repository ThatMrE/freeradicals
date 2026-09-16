#!/usr/bin/env node
/**
 * Draws the promotional images both stores ask for, at the exact sizes they
 * reject you for missing.
 *
 *   node tools/build-store-assets.mjs
 *
 *   store/chrome/small-tile-440x280.png     Chrome Web Store, listing tile
 *   store/chrome/marquee-1400x560.png       Chrome Web Store, featured spot
 *   store/play/icon-512.png                 Google Play, app icon
 *   store/play/feature-graphic-1024x500.png Google Play, top of the listing
 *
 * The screenshots are not here: those come from the harnesses that drive the
 * real extension and the real app (`npm run capture:demo store`,
 * `npm run capture:app -- --store`), because a store screenshot of something
 * other than the software is how a listing starts lying.
 *
 * The icon is rendered by tools/make-icons.mjs — the same analytic mark as the
 * toolbar icons, at 512 — rather than a redrawing of it that could drift.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { png, render } from './make-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = join(ROOT, 'store/chrome');
const PLAY = join(ROOT, 'store/play');

const BG = '#0b0d12';
const PANEL = '#12151d';
const TEXT = '#f4f4f5';
const MUTED = '#a8b0c2';
const ACCENT = '#7c8cff';

/** The ring with its unpaired electron, as markup for the composed graphics. */
const MARK = (size) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
  <path d="M50 18a32 32 0 1 0 22.6 9.4" fill="none" stroke="${ACCENT}" stroke-width="11" stroke-linecap="round"/>
  <circle cx="79" cy="21" r="11" fill="${ACCENT}"/>
</svg>`;

/**
 * One graphic. Kept deliberately plain: a mark, a name, the rule, and the
 * background gradient the product itself uses. Store art that promises a
 * different product than the screenshots is a review risk and a broken promise.
 */
function card({ width, height, markSize, title, rule, sub, titleSize, pad }) {
  return `<!doctype html><meta charset="utf-8" />
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; }
  body {
    background: radial-gradient(120% 120% at 18% 0%, #1b2030 0%, ${BG} 58%, #08090d 100%);
    color: ${TEXT};
    font: 400 16px/1.4 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; justify-content: center;
    padding: ${pad}px; box-sizing: border-box; gap: ${Math.round(markSize * 0.28)}px;
  }
  .row { display: flex; align-items: center; gap: ${Math.round(markSize * 0.34)}px; }
  h1 { font-size: ${titleSize}px; letter-spacing: -0.03em; font-weight: 680; margin: 0; }
  .rule {
    display: inline-flex; align-items: center; gap: ${Math.round(titleSize * 0.42)}px;
    background: ${PANEL}; border: 1px solid #232937; border-radius: ${Math.round(titleSize * 0.5)}px;
    padding: ${Math.round(titleSize * 0.36)}px ${Math.round(titleSize * 0.62)}px;
    font-size: ${Math.round(titleSize * 0.46)}px; color: ${MUTED}; align-self: flex-start;
    font-variant-numeric: tabular-nums;
  }
  .rule b { color: ${TEXT}; font-weight: 640; }
  .rule span { color: #6f7789; }
  p { margin: 0; color: ${MUTED}; font-size: ${Math.round(titleSize * 0.46)}px; max-width: 30ch; }
</style>
<div class="row">${MARK(markSize)}<h1>${title}</h1></div>
${rule ? `<div class="rule">${rule}</div>` : ''}
${sub ? `<p>${sub}</p>` : ''}`;
}

const GRAPHICS = [
  {
    file: join(CHROME, 'small-tile-440x280.png'),
    width: 440,
    height: 280,
    html: card({
      width: 440,
      height: 280,
      markSize: 38,
      titleSize: 30,
      pad: 30,
      title: 'Free Radicals',
      rule: '25 chars <span>→</span> <b>5:00</b>',
      sub: 'Post before you scroll.',
    }),
  },
  {
    file: join(CHROME, 'marquee-1400x560.png'),
    width: 1400,
    height: 560,
    html: card({
      width: 1400,
      height: 560,
      markSize: 92,
      titleSize: 76,
      pad: 84,
      title: 'Post before you scroll.',
      rule: '25 characters <span>→</span> <b>5:00</b> <span>·</span> +50 <span>→</span> <b>6:00</b> <span>·</span> up to <b>20:00</b>',
      sub: 'Feeds stay closed until you publish. The longer the post, the longer the window.',
    }),
  },
  {
    file: join(PLAY, 'feature-graphic-1024x500.png'),
    width: 1024,
    height: 500,
    html: card({
      width: 1024,
      height: 500,
      markSize: 70,
      titleSize: 58,
      pad: 72,
      title: 'Post before you scroll.',
      rule: '25 characters <span>→</span> <b>5:00</b> <span>·</span> up to <b>20:00</b>',
      sub: 'The feed app opens only after you have written something.',
    }),
  },
];

/* ---------- the icon ---------- */

mkdirSync(PLAY, { recursive: true });
mkdirSync(CHROME, { recursive: true });

// Play shows the icon on its own background, so the transparent mark is
// composited onto the product's own dark ground rather than shipped with alpha.
const SIZE = 512;
const mark = render(SIZE);
const ground = [0x0b, 0x0d, 0x12];
for (let i = 0; i < mark.length; i += 4) {
  const alpha = mark[i + 3] / 255;
  for (let channel = 0; channel < 3; channel += 1) {
    mark[i + channel] = Math.round(mark[i + channel] * alpha + ground[channel] * (1 - alpha));
  }
  mark[i + 3] = 255;
}
writeFileSync(join(PLAY, 'icon-512.png'), png(SIZE, mark));
console.log(`  store/play/icon-512.png                  ${SIZE}x${SIZE}`);

/* ---------- the composed graphics ---------- */

const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const graphic of GRAPHICS) {
    const context = await browser.newContext({
      viewport: { width: graphic.width, height: graphic.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(graphic.html, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    mkdirSync(dirname(graphic.file), { recursive: true });
    await page.screenshot({ path: graphic.file });
    console.log(`  ${graphic.file.slice(ROOT.length + 1).padEnd(40)} ${graphic.width}x${graphic.height}`);
    await context.close();
  }
} finally {
  await browser.close();
}
