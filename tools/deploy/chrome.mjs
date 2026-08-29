#!/usr/bin/env node
/**
 * Publish to the Chrome Web Store.
 *
 * Built against the **v2** API. The v1.1 endpoints that every tutorial still
 * shows (`www.googleapis.com/upload/chromewebstore/v1.1/items`) are deprecated
 * and stop working on 15 October 2026, so a pipeline written against them has
 * a hard expiry date. The endpoints and enum values below come from the v2
 * discovery document at
 * https://chromewebstore.googleapis.com/$discovery/rest?version=v2
 *
 * Two v2 differences worth knowing: it cannot create a new listing (do the
 * first submission by hand in the dashboard), and it cannot change item
 * visibility. Both are deliberate on Google's part.
 *
 *   node tools/deploy/chrome.mjs [--dry-run]
 */
import { DRY_RUN, call, credentials, log, packageFor, poll, version } from './lib.mjs';

const BASE = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const env = credentials([
  'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN',
  'CWS_PUBLISHER_ID', 'CWS_ITEM_ID',
]);

/** Percentage rollout. 100 (or unset) publishes to everyone at once. */
const percentage = Number(process.env.CWS_DEPLOY_PERCENTAGE || 100);
const staged = percentage > 0 && percentage < 100;

console.log(`\nChrome Web Store — Free Radicals ${version}`);
const pkg = packageFor('chrome');
log('package', `${pkg.path} (${Math.round(pkg.bytes / 1024)} KB)`);

/* 1. Exchange the long-lived refresh token for an access token. ------------ */
const name = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_ITEM_ID}`;
let accessToken = '<dry-run-token>';

if (!DRY_RUN) {
  const res = await call('auth', 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
      scope: SCOPE,
    }),
  });
  accessToken = res.json.access_token;
  log('auth', 'access token acquired');
} else {
  log('auth', 'DRY RUN skipping token exchange');
}

const auth = { Authorization: `Bearer ${accessToken}` };

/* 2. Upload the package as a new draft revision. --------------------------- */
const upload = await call('upload', `${BASE}/upload/v2/${name}:upload?uploadType=media`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/zip' },
  body: pkg.buffer,
});

if (!DRY_RUN) {
  const state = upload.json.uploadState;
  // The upload can be accepted for processing and fail afterwards, so a 200
  // here is not by itself success.
  if (state === 'FAILED' || state === 'NOT_FOUND') {
    console.error(JSON.stringify(upload.json, null, 2));
    process.exit(1);
  }
  log('upload', `crxVersion ${upload.json.crxVersion}, state ${state}`);

  if (state === 'IN_PROGRESS') {
    await poll('upload', { attempts: 30, intervalMs: 10_000 }, async () => {
      const status = await call('status', `${BASE}/v2/${name}:fetchStatus`, { headers: auth });
      const s = status.json.lastAsyncUploadState;
      if (s === 'SUCCEEDED') return status.json;
      if (s === 'FAILED') {
        console.error(JSON.stringify(status.json, null, 2));
        process.exit(1);
      }
      return null;
    });
  }
}

/* 3. Submit for review and publish. ---------------------------------------- */
const body = {
  publishType: staged ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH',
  // A warning is usually a policy note worth reading before it reaches users.
  blockOnWarnings: process.env.CWS_IGNORE_WARNINGS !== '1',
  ...(staged ? { deployInfos: [{ deployPercentage: percentage }] } : {}),
};

const publish = await call('publish', `${BASE}/v2/${name}:publish`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!DRY_RUN) {
  const { state, warningInfo } = publish.json;
  for (const w of (warningInfo && warningInfo.warnings) || []) {
    console.warn(`  warning: ${w.reason} — ${w.description}`);
  }
  log('publish', `state ${state}${staged ? ` at ${percentage}%` : ''}`);
  if (state === 'REJECTED') process.exit(1);
  // PENDING_REVIEW is the normal outcome: Chrome reviews before going live.
  console.log(`\n✓ submitted ${version} to the Chrome Web Store (${state})\n`);
} else {
  console.log(`\n✓ dry run complete — would publish ${version} via ${name}\n`);
}
