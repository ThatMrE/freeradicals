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

// netlify.toml serves the site under a CSP with no 'unsafe-inline' and no
// script-src at all. A browser silently ignores what that forbids, so the page
// renders subtly wrong in production and correctly on a local file:// open.
// Check the pages against the policy actually being served.
const csp = /Content-Security-Policy = "([^"]+)"/.exec(
  readFileSync(join(SITE, '..', 'netlify.toml'), 'utf8'),
)?.[1];
if (!csp) {
  problems.push('netlify.toml declares no Content-Security-Policy');
} else {
  const directive = (name) => new RegExp(`(?:^|;)\\s*${name} ([^;]+)`).exec(csp)?.[1] ?? '';
  const styleSrc = directive('style-src') || directive('default-src');
  const scriptSrc = directive('script-src') || directive('default-src');
  for (const pageName of pages) {
    const html = readFileSync(join(SITE, pageName), 'utf8');
    if (/ style="/.test(html) && !styleSrc.includes("'unsafe-inline'")) {
      problems.push(`${pageName} uses inline style attributes, which style-src (${styleSrc.trim()}) drops`);
    }
    if (/<script/i.test(html) && (scriptSrc.includes("'none'") || !scriptSrc)) {
      problems.push(`${pageName} has a script tag, which script-src (${scriptSrc.trim()}) blocks`);
    }
  }
}

if (!pages.includes('privacy.html')) problems.push('privacy.html was not generated');
if (!existsSync(join(SITE, 'downloads/checksums.txt'))) problems.push('downloads/checksums.txt missing');

for (const p of problems) console.error(`broken: ${p}`);
console.log(`${pages.length} pages, ${checked} local links checked, ${problems.length} broken`);
process.exit(problems.length ? 1 : 0);
