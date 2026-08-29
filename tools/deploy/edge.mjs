#!/usr/bin/env node
/**
 * Publish to Microsoft Edge Add-ons, via the v1.1 REST API.
 *
 * Edge runs the same Chromium engine and takes the same package, but it is a
 * separate store, a separate listing and a separate review, so it gets its own
 * submission. v1.1 authenticates with an API key rather than the OAuth client
 * secret v1 used; both headers below are required.
 *
 * Every operation is asynchronous: the API answers 202 with a Location header
 * naming an operation to poll.
 *
 *   node tools/deploy/edge.mjs [--dry-run]
 */
import { DRY_RUN, call, credentials, log, packageFor, poll, version } from './lib.mjs';

const BASE = 'https://api.addons.microsoftedge.microsoft.com';

const env = credentials(['EDGE_PRODUCT_ID', 'EDGE_API_KEY', 'EDGE_CLIENT_ID']);

const headers = {
  Authorization: `ApiKey ${env.EDGE_API_KEY}`,
  'X-ClientID': env.EDGE_CLIENT_ID,
};

const product = `${BASE}/v1/products/${env.EDGE_PRODUCT_ID}`;

console.log(`\nMicrosoft Edge Add-ons — Free Radicals ${version}`);
const pkg = packageFor('edge');
log('package', `${pkg.path} (${Math.round(pkg.bytes / 1024)} KB)`);

/** Edge returns the operation id in the Location header, not the body. */
function operationId(res) {
  if (DRY_RUN) return '<operation-id>';
  const loc = res.location || '';
  const id = loc.split('/').filter(Boolean).pop();
  if (!id) throw new Error(`no operation id in Location header: "${loc}"`);
  return id;
}

/* 1. Upload the package into the draft submission. ------------------------- */
const upload = await call('upload', `${product}/submissions/draft/package`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/zip' },
  body: pkg.buffer,
});
const uploadOp = operationId(upload);
log('upload', `operation ${uploadOp}`);

await poll('upload', { attempts: 30, intervalMs: 10_000 }, async () => {
  const res = await call('upload status', `${product}/submissions/draft/package/operations/${uploadOp}`, { headers });
  const status = res.json && res.json.status;
  if (status === 'Succeeded') return res.json;
  if (status === 'Failed') {
    console.error(JSON.stringify(res.json, null, 2));
    process.exit(1);
  }
  return null;
});

/* 2. Submit the draft for certification. ----------------------------------- */
const notes = process.env.EDGE_NOTES
  || `Automated release of ${version}. No new permissions; see the repository CHANGELOG.`;

const publish = await call('publish', `${product}/submissions`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes }),
});
const publishOp = operationId(publish);
log('publish', `operation ${publishOp}`);

await poll('publish', { attempts: 30, intervalMs: 15_000 }, async () => {
  const res = await call('publish status', `${product}/submissions/operations/${publishOp}`, { headers });
  const status = res.json && res.json.status;
  if (status === 'Succeeded') return res.json;
  if (status === 'Failed') {
    console.error(JSON.stringify(res.json, null, 2));
    process.exit(1);
  }
  return null;
});

console.log(
  DRY_RUN
    ? `\n✓ dry run complete — would submit ${version} to Edge Add-ons\n`
    : `\n✓ submitted ${version} to Edge Add-ons for certification\n`,
);
