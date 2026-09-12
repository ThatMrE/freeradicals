#!/usr/bin/env node
/**
 * Checks the built site: every local link resolves to a file that exists.
 *
 *   node tools/check-site.mjs      (after `npm run build:site`)
 *
 * The download links are the ones worth guarding. They point at generated
 * files, so a rename in the build script breaks them silently and the first
 * person to find out is someone clicking a 404 on the install page.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const pages = readdirSync(SITE).filter((f) => f.endsWith('.html'));
const problems = [];
let checked = 0;

// Anything netlify.toml answers with a redirect rather than a file.
const REDIRECTS = new Set(['/privacy', '/download', '/source']);

for (const pageName of pages) {
  const html = readFileSync(join(SITE, pageName), 'utf8');
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (!url.startsWith('/') || url.startsWith('//')) continue; // external or in-page
    const path = url.split('#')[0].split('?')[0];
    if (path === '/' || REDIRECTS.has(path)) continue;
    checked += 1;
    if (!existsSync(join(SITE, path))) problems.push(`${pageName} -> ${path}`);
  }
}

if (!pages.includes('privacy.html')) problems.push('privacy.html was not generated');
if (!existsSync(join(SITE, 'downloads/checksums.txt'))) problems.push('downloads/checksums.txt missing');

for (const p of problems) console.error(`broken: ${p}`);
console.log(`${pages.length} pages, ${checked} local links checked, ${problems.length} broken`);
process.exit(problems.length ? 1 : 0);
