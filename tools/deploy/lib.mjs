import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

export const DRY_RUN = process.argv.includes('--dry-run') || process.env.FR_DRY_RUN === '1';

/**
 * Shared plumbing for the store deployers.
 *
 * Every one of these scripts talks to a service that cannot be exercised
 * without real credentials and a real listing, so they are built to fail early
 * and legibly: missing credentials are reported as a list before a single byte
 * is sent, and `--dry-run` walks the whole flow — including reading and
 * measuring the package — without making a network call.
 */

export function log(step, detail = '') {
  console.log(`  ${step}${detail ? ` — ${detail}` : ''}`);
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * Read the named credentials from the environment, reporting *all* the missing
 * ones at once. A deploy that fails three times over three missing secrets
 * wastes three CI runs.
 */
export function credentials(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length && !DRY_RUN) {
    fail(`missing credentials: ${missing.join(', ')}\n  Set them as repository secrets; see docs/RELEASING.md`);
  }
  const out = {};
  for (const n of names) out[n] = process.env[n] || (DRY_RUN ? `<${n}>` : '');
  if (missing.length) log('dry run', `${missing.length} credential(s) absent, using placeholders`);
  return out;
}

/** Locate the built package for a target and refuse to ship an empty one. */
export function packageFor(target) {
  const path = join(ROOT, 'dist', `freeradicals-${target}-${version}.zip`);
  if (!existsSync(path)) fail(`${path} not found — run \`npm run build\` first`);
  const bytes = statSync(path).size;
  if (bytes < 1024) fail(`${path} is only ${bytes} bytes; that is not a real package`);
  return { path, bytes, buffer: readFileSync(path) };
}

/** fetch with a clear error on any non-2xx, since store APIs vary wildly. */
export async function call(label, url, options = {}) {
  if (DRY_RUN) {
    log(label, `DRY RUN ${options.method || 'GET'} ${url}`);
    return { dryRun: true };
  }
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    fail(`${label} failed: HTTP ${res.status} ${res.statusText}\n${text.slice(0, 1500)}`);
  }
  const location = res.headers.get('location');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* some endpoints return no body */ }
  return { json, text, location, status: res.status };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `check` returns a truthy result, or give up. Store pipelines are
 * asynchronous everywhere, and a deploy that returns before the store has
 * accepted the package reports success it has not earned.
 */
export async function poll(label, { attempts = 30, intervalMs = 10_000 }, check) {
  if (DRY_RUN) { log(label, 'DRY RUN skipping poll'); return { dryRun: true }; }
  for (let i = 1; i <= attempts; i += 1) {
    const result = await check(i);
    if (result) return result;
    log(label, `not ready (${i}/${attempts})`);
    await sleep(intervalMs);
  }
  fail(`${label} did not finish after ${attempts} attempts`);
  return null;
}
