#!/usr/bin/env node
/**
 * Runs AMO's own linter over the Firefox package and enforces a reviewed
 * baseline.
 *
 * `web-ext lint --warnings-as-errors` is all-or-nothing: either a single
 * accepted warning fails every build forever, or warnings are ignored and a
 * real one slips through. This sits in between — every warning must be listed
 * in tools/lint-firefox.json with a reason, and anything new fails.
 *
 * A stale entry is reported too: an exception nobody needs any more is an
 * exception that should be deleted, not carried.
 *
 *   node tools/lint-firefox.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(join(ROOT, 'tools/lint-firefox.json'), 'utf8'));

const res = spawnSync('npx', ['--no-install', 'web-ext', 'lint',
  '--source-dir', 'dist/firefox', '--output', 'json'], { cwd: ROOT, encoding: 'utf8' });

if (!res.stdout) {
  console.error('web-ext produced no output. Is it installed? (npm ci)');
  console.error(res.stderr || '');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error('could not parse web-ext output:\n', res.stdout.slice(0, 2000));
  process.exit(1);
}

const accepted = baseline.accepted || [];
const isAccepted = (issue) => accepted.some((a) => a.code === issue.code && a.file === issue.file);

const errors = report.errors || [];
const warnings = report.warnings || [];
const unexpected = warnings.filter((w) => !isAccepted(w));
const used = new Set(warnings.filter(isAccepted).map((w) => `${w.code}|${w.file}`));
const stale = accepted.filter((a) => !used.has(`${a.code}|${a.file}`));

console.log(`web-ext lint: ${errors.length} error(s), ${warnings.length} warning(s), `
  + `${unexpected.length} unexpected`);

for (const e of errors) console.error(`  ERROR   ${e.code} ${e.file || ''}:${e.line || ''} — ${e.message}`);
for (const w of unexpected) console.error(`  NEW     ${w.code} ${w.file || ''}:${w.line || ''} — ${w.message}`);
for (const a of stale) console.warn(`  STALE   ${a.code} ${a.file} is in the baseline but no longer fires — delete it`);
for (const w of warnings.filter(isAccepted)) console.log(`  accepted ${w.code} ${w.file}`);

if (errors.length || unexpected.length) {
  console.error('\n✗ Firefox package would not pass AMO review as-is\n');
  process.exit(1);
}
console.log('\n✓ Firefox package is clean against the reviewed baseline\n');
