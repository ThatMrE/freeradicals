#!/usr/bin/env node
/**
 * Builds the static site in site/ for Netlify.
 *
 *   node tools/build-site.mjs
 *
 * Two generated things, both kept out of git because they are derived:
 *
 *   site/privacy.html      rendered from docs/PRIVACY.md, so the policy the
 *                          Chrome Web Store links to and the policy in the
 *                          repository cannot drift apart.
 *   site/downloads/        the built packages under stable, unversioned names
 *                          (the links on the page never change) plus a
 *                          checksums.txt computed over exactly those bytes.
 *
 * Requires `npm run build` to have produced dist/ first; it refuses to publish
 * a page whose download links would 404.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');
const DOWNLOADS = join(SITE, 'downloads');
const TARGETS = ['chrome', 'edge', 'firefox'];

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/* ---------- markdown ---------- */

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline spans. Code is lifted out first so nothing rewrites its insides. */
function inline(text) {
  const code = [];
  const lifted = text.replace(/`([^`]+)`/g, (_, body) => {
    code.push(`<code>${escapeHtml(body)}</code>`);
    return `@@CODE${code.length - 1}@@`;
  });
  return escapeHtml(lifted)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/@@CODE(\d+)@@/g, (_, i) => code[Number(i)]);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const isTable = (l) => l.startsWith('|');
  const isBullet = (l) => /^[-*] /.test(l);
  const isOrdered = (l) => /^\d+\. /.test(l);
  const isBlockStart = (l) => !l.trim() || l.startsWith('#') || isTable(l) || isBullet(l) || isOrdered(l);
  const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i]); i += 1; }
      const header = cells(rows[0]);
      const body = rows.slice(/^\|[\s|:-]+\|$/.test(rows[1] ?? '') ? 2 : 1);
      out.push('<table>');
      out.push(`<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`);
      out.push('<tbody>');
      for (const row of body) out.push(`<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      out.push('</tbody></table>');
      continue;
    }

    if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const matches = ordered ? isOrdered : isBullet;
      const items = [];
      while (i < lines.length && matches(lines[i])) {
        let text = lines[i].replace(ordered ? /^\d+\. / : /^[-*] /, '');
        i += 1;
        // wrapped continuation lines sit indented under the marker
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) { text += ` ${lines[i].trim()}`; i += 1; }
        items.push(text);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlockStart(lines[i])) { para.push(lines[i].trim()); i += 1; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

/* ---------- page shell ---------- */

const BRAND = `<svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M50 18a32 32 0 1 0 22.6 9.4" fill="none" stroke="#7c8cff" stroke-width="11" stroke-linecap="round"/>
        <circle cx="79" cy="21" r="11" fill="#7c8cff"/>
      </svg>`;

function page({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/style.css" />
</head>
<body>

<header class="wrap">
  <nav class="nav">
    <a class="brand" href="/">
      ${BRAND}
      Free Radicals
    </a>
    <span>
      <a href="/#how">How it works</a>
      <a href="/#install">Install</a>
      <a href="https://github.com/ThatMrE/freeradicals">GitHub</a>
    </span>
  </nav>
</header>

<main class="wrap prose">
${body}
</main>

<footer class="wrap">
  <span>Free Radicals &mdash; free and open source.</span>
  <span>
    <a href="https://github.com/ThatMrE/freeradicals">GitHub</a>
    <a href="/">Home</a>
  </span>
</footer>

</body>
</html>
`;
}

/* ---------- run ---------- */

const privacyMd = readFileSync(join(ROOT, 'docs/PRIVACY.md'), 'utf8');
const sourceLink = 'https://github.com/ThatMrE/freeradicals/blob/main/docs/PRIVACY.md';
const privacyHtml = page({
  title: 'Privacy — Free Radicals',
  description: 'What Free Radicals stores, what it can see, and what leaves your machine (nothing).',
  body: [
    `<p class="updated">Version ${version} &middot; <a href="${sourceLink}">this page is rendered from the repository</a></p>`,
    renderMarkdown(privacyMd),
  ].join('\n'),
});
writeFileSync(join(SITE, 'privacy.html'), privacyHtml);

const missing = TARGETS.filter((t) => !existsSync(join(DIST, `freeradicals-${t}-${version}.zip`)));
if (missing.length) {
  console.error(`build-site: no package for ${missing.join(', ')} - run \`npm run build\` first.`);
  process.exit(1);
}

rmSync(DOWNLOADS, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });

const sums = [`# Free Radicals ${version} - SHA-256 of the files served from this directory.`, ''];
for (const target of TARGETS) {
  const bytes = readFileSync(join(DIST, `freeradicals-${target}-${version}.zip`));
  const name = `freeradicals-${target}.zip`;
  copyFileSync(join(DIST, `freeradicals-${target}-${version}.zip`), join(DOWNLOADS, name));
  const sum = createHash('sha256').update(bytes).digest('hex');
  sums.push(`${sum}  ${name}`);
  console.log(`${name.padEnd(26)} ${String(Math.round(bytes.length / 1024)).padStart(4)} KB  ${sum.slice(0, 16)}`);
}
writeFileSync(join(DOWNLOADS, 'checksums.txt'), `${sums.join('\n')}\n`);
console.log(`${'privacy.html'.padEnd(26)} ${String(Math.round(privacyHtml.length / 1024)).padStart(4)} KB`);
