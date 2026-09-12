#!/usr/bin/env node
/**
 * The gate before anything goes live.
 *
 *   node tools/preflight.mjs              everything that can run here
 *   node tools/preflight.mjs --mobile     also require mobile to be releasable
 *
 * Runs each check in turn, keeps going after a failure so one run tells you
 * everything that is wrong rather than the first thing, and exits non-zero if
 * any required check failed.
 *
 * Checks that need a browser this machine does not have (Edge, Firefox) are
 * reported as skipped rather than silently passing — a check you did not run is
 * not a check that passed, and pretending otherwise is how a broken build
 * reaches a store.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wantMobile = process.argv.includes('--mobile');
const results = [];

function run(name, command, args, { required = true, env = {} } = {}) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}\n`);
  const started = Date.now();
  const res = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  const ms = Date.now() - started;
  const ok = res.status === 0;
  results.push({ name, state: ok ? 'pass' : 'fail', required, ms });
  return ok;
}

function skip(name, why) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}\n  skipped: ${why}\n`);
  results.push({ name, state: 'skip', required: false, why });
}

const node = process.execPath;

/* 1. Everything is generated from the registry and committed. --------------- */
run('build', node, ['tools/build-manifest.mjs']);
run('generated files match the registry', 'git',
  ['diff', '--exit-code', '--', 'manifest.json', 'extension/content/routes.generated.js',
    'extension/content/signals.generated.js']);

/* 2. The logic, all ten platforms, and the packaging rules. ----------------- */
run('unit tests', node, ['--test',
  'tests/core.test.js', 'tests/platforms.test.js', 'tests/package.test.js',
  'tests/mobile.test.js', 'tests/app.test.js', 'tests/portability.test.js']);

/* 3. Build every store package. -------------------------------------------- */
run('package all targets', node, ['tools/build.mjs']);

/* 4. Drive the built package in a real browser, per engine. ----------------- */
if (existsSync(join(ROOT, 'node_modules', 'playwright'))) {
  run('end-to-end (Chromium, built package)', node, ['tests/extension.e2e.mjs'],
    { env: { FR_EXTENSION_ROOT: 'dist/chrome', FR_BROWSER_CHANNEL: 'chromium' } });

  if (process.env.FR_HAVE_EDGE === '1') {
    run('end-to-end (Edge, built package)', node, ['tests/extension.e2e.mjs'],
      { env: { FR_EXTENSION_ROOT: 'dist/edge', FR_BROWSER_CHANNEL: 'msedge' } });
  } else {
    skip('end-to-end (Edge)', 'msedge not installed — set FR_HAVE_EDGE=1 where it is');
  }
} else {
  skip('end-to-end', 'playwright not installed (npm ci)');
}

/* 5. Firefox: static validation only. -------------------------------------- */
// Playwright cannot load an extension into Firefox at all, so there is no
// runtime check to run here. web-ext lint is what AMO itself runs.
const webExt = spawnSync('npx', ['--no-install', 'web-ext', '--version'], { cwd: ROOT });
if (webExt.status === 0) {
  run('AMO lint (Firefox package)', node, ['tools/lint-firefox.mjs']);
} else {
  skip('AMO lint (Firefox)', 'web-ext not installed; manifest rules are covered by tests/package.test.js');
}

/* 6. Mobile. ---------------------------------------------------------------- */
run('mobile release readiness', node, ['tools/deploy/mobile.mjs'], { required: wantMobile });

/* 7. Store deployers reach the point of needing credentials. ---------------- */
for (const store of ['chrome', 'edge', 'firefox']) {
  run(`deploy dry run (${store})`, node, [`tools/deploy/${store}.mjs`, '--dry-run']);
}

/* --- summary --------------------------------------------------------------- */
const mark = { pass: '✓', fail: '✗', skip: '·' };
console.log(`\n${'═'.repeat(64)}\nPREFLIGHT\n`);
for (const r of results) {
  const time = r.ms === undefined ? '' : `${(r.ms / 1000).toFixed(1)}s`;
  const note = r.state === 'skip' ? r.why : (r.required ? '' : 'not required');
  console.log(`  ${mark[r.state]} ${r.name.padEnd(40)} ${time.padStart(6)}  ${note}`);
}

const failed = results.filter((r) => r.state === 'fail' && r.required);
const soft = results.filter((r) => r.state === 'fail' && !r.required);
const skipped = results.filter((r) => r.state === 'skip');

console.log('');
if (soft.length) console.log(`  ${soft.length} optional check(s) failed: ${soft.map((r) => r.name).join(', ')}`);
if (skipped.length) console.log(`  ${skipped.length} check(s) skipped — these are NOT passes`);

if (failed.length) {
  console.log(`\n✗ NOT READY TO SHIP — ${failed.length} required check(s) failed:`);
  for (const r of failed) console.log(`    ${r.name}`);
  console.log('');
  process.exit(1);
}
console.log('\n✓ ready to ship\n');
