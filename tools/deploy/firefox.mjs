#!/usr/bin/env node
/**
 * Publish to addons.mozilla.org.
 *
 * AMO authenticates with a short-lived JWT signed with your API secret — not a
 * bearer token you can store — so the token is minted per run here. It is
 * signed with HMAC-SHA256 via node:crypto; no dependency required.
 *
 * Submission is two calls: upload the package and wait for AMO's validator to
 * pass, then attach the validated upload to the add-on as a new version. AMO
 * signs the result; unsigned add-ons will not install in release Firefox.
 *
 *   node tools/deploy/firefox.mjs [--dry-run]
 */
import { createHmac, randomUUID } from 'node:crypto';

import { DRY_RUN, call, credentials, log, packageFor, poll, version } from './lib.mjs';

const BASE = 'https://addons.mozilla.org/api/v5';

const env = credentials(['AMO_JWT_ISSUER', 'AMO_JWT_SECRET', 'AMO_ADDON_ID']);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** AMO requires the token to expire quickly; five minutes is the documented max. */
function amoToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: env.AMO_JWT_ISSUER,
    jti: randomUUID(),
    iat: now,
    exp: now + 300,
  }));
  const signature = createHmac('sha256', env.AMO_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const authHeader = () => ({ Authorization: `JWT ${DRY_RUN ? '<jwt>' : amoToken()}` });

console.log(`\naddons.mozilla.org — Free Radicals ${version}`);
const pkg = packageFor('firefox');
log('package', `${pkg.path} (${Math.round(pkg.bytes / 1024)} KB)`);

/* 1. Upload and wait for validation. --------------------------------------- */
let uploadUuid = '<upload-uuid>';

if (!DRY_RUN) {
  const form = new FormData();
  form.set('upload', new Blob([pkg.buffer], { type: 'application/zip' }), `freeradicals-${version}.zip`);
  form.set('channel', process.env.AMO_CHANNEL || 'listed');

  const res = await call('upload', `${BASE}/addons/upload/`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  uploadUuid = res.json.uuid;
  log('upload', `uuid ${uploadUuid}`);

  // AMO validates asynchronously and rejects the version if it fails; there is
  // no point attaching an upload that has not passed.
  const validated = await poll('validation', { attempts: 30, intervalMs: 10_000 }, async () => {
    const status = await call('validation', `${BASE}/addons/upload/${uploadUuid}/`, { headers: authHeader() });
    return status.json.processed ? status.json : null;
  });

  if (!validated.valid) {
    console.error(JSON.stringify(validated.validation, null, 2).slice(0, 4000));
    console.error('\n✗ AMO validation failed');
    process.exit(1);
  }
  log('validation', 'passed');
} else {
  log('upload', `DRY RUN POST ${BASE}/addons/upload/`);
  log('validation', 'DRY RUN skipping');
}

/* 2. Attach the validated upload as a new version. ------------------------- */
await call('version', `${BASE}/addons/addon/${env.AMO_ADDON_ID}/versions/`, {
  method: 'POST',
  headers: { ...authHeader(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ upload: uploadUuid }),
});

console.log(
  DRY_RUN
    ? `\n✓ dry run complete — would submit ${version} to AMO\n`
    : `\n✓ submitted ${version} to addons.mozilla.org for review\n`,
);
