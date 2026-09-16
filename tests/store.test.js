import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = JSON.parse(readFileSync(join(ROOT, 'store/chrome/listing.json'), 'utf8'));
const play = JSON.parse(readFileSync(join(ROOT, 'store/play/listing.json'), 'utf8'));

/**
 * The store listings.
 *
 * Both consoles reject a listing for things a machine can check: a name two
 * characters too long, a screenshot at 1279 pixels, a promo tile that is not
 * exactly 440x280. Finding that out costs a round trip through a review queue,
 * so the copy and the images are checked here instead, against the limits each
 * listing file writes down next to the values.
 */

/** Width and height straight out of a PNG's IHDR. */
function pngSize(rel) {
  const file = join(ROOT, rel);
  assert.ok(existsSync(file), `${rel} is missing — run \`npm run store:assets\``);
  const head = readFileSync(file).subarray(0, 24);
  assert.equal(head.subarray(1, 4).toString('ascii'), 'PNG', `${rel} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const size = (spec) => spec.split('x').map(Number);

test('the Chrome listing fits the fields it goes into', () => {
  for (const field of ['itemName', 'summary', 'description']) {
    assert.ok(
      chrome[field].length <= chrome.limits[field],
      `${field} is ${chrome[field].length} characters, limit ${chrome.limits[field]}`,
    );
  }
  assert.ok(chrome.singlePurpose.length <= chrome.limits.singlePurpose);
  for (const [name, text] of Object.entries(chrome.permissionJustifications)) {
    assert.ok(
      text.length <= chrome.limits.permissionJustification,
      `${name} justification is ${text.length} characters`,
    );
  }
});

test('every permission in the manifest has a justification, and nothing else does', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const justified = Object.keys(chrome.permissionJustifications)
    .filter((k) => !k.startsWith('host') && !k.startsWith('optional'));
  assert.deepEqual(justified.sort(), [...manifest.permissions].sort());
  assert.ok(chrome.permissionJustifications.hostPermissions, 'host permissions need a justification too');
});

test('the Chrome screenshots and promo tiles are the sizes the store accepts', () => {
  const allowed = chrome.limits.screenshots.sizes.map(size);
  assert.ok(chrome.assets.screenshots.length >= chrome.limits.screenshots.min);
  assert.ok(chrome.assets.screenshots.length <= chrome.limits.screenshots.max);

  for (const shot of chrome.assets.screenshots) {
    const { width, height } = pngSize(shot);
    assert.ok(
      allowed.some(([w, h]) => w === width && h === height),
      `${shot} is ${width}x${height}; the store takes ${chrome.limits.screenshots.sizes.join(' or ')}`,
    );
  }

  const [tileW, tileH] = size(chrome.limits.smallPromoTile);
  assert.deepEqual(pngSize(chrome.assets.smallPromoTile), { width: tileW, height: tileH });
  const [marqueeW, marqueeH] = size(chrome.limits.marquee);
  assert.deepEqual(pngSize(chrome.assets.marquee), { width: marqueeW, height: marqueeH });
});

test('the Play listing fits the fields it goes into', () => {
  for (const field of ['appName', 'shortDescription', 'fullDescription']) {
    assert.ok(
      play[field].length <= play.limits[field],
      `${field} is ${play[field].length} characters, limit ${play.limits[field]}`,
    );
  }
});

test('the Play icon, feature graphic and screenshots are the sizes Play accepts', () => {
  const [iconW, iconH] = size(play.limits.icon);
  assert.deepEqual(pngSize(play.assets.icon), { width: iconW, height: iconH });
  const [featureW, featureH] = size(play.limits.featureGraphic);
  assert.deepEqual(pngSize(play.assets.featureGraphic), { width: featureW, height: featureH });

  const shots = play.assets.phoneScreenshots;
  const rule = play.limits.phoneScreenshots;
  assert.ok(shots.length >= rule.min && shots.length <= rule.max);
  for (const shot of shots) {
    const { width, height } = pngSize(shot);
    assert.ok(height > width, `${shot} is not portrait`);
    for (const side of [width, height]) {
      assert.ok(side >= rule.minSide && side <= rule.maxSide, `${shot} side ${side} is out of range`);
    }
  }
});

test('every Android permission the manifest asks for is answered in the listing', () => {
  const manifest = readFileSync(join(ROOT, 'mobile/app/android/app/src/main/AndroidManifest.xml'), 'utf8');
  const requested = [...manifest.matchAll(/<uses-permission android:name="android\.permission\.([A-Z_]+)"/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'INTERNET');

  const answers = Object.keys(play.declarations.permissions).join(' ');
  for (const permission of requested) {
    assert.ok(answers.includes(permission), `${permission} is requested but not explained to Play`);
  }
  // The one we promise not to use, kept as a promise rather than a comment.
  assert.ok(!requested.includes('QUERY_ALL_PACKAGES'));
});

test('both listings point at the privacy policy that is actually published', () => {
  const live = 'https://free-radicals.netlify.app/privacy.html';
  assert.equal(chrome.privacyPolicyUrl, live);
  assert.equal(play.privacyPolicyUrl, live);
});
