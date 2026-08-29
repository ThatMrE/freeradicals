import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CUSTOM_PLATFORM, DEFAULT_SETTINGS, REJECTIONS, blockPlan, composerUrlFor,
  createGate, createManualClock, createMemoryStorage, evaluate, formatBadge,
  formatCountdown, isDuplicate, matchPlatform, matchesPublishSignal,
  normalizeSettings, looksLikeFiller, stats,
} from '../core/index.js';

const MIN = 60_000;

function harness(settings = {}) {
  const clock = createManualClock(1_700_000_000_000);
  const storage = createMemoryStorage({
    settings: { ...DEFAULT_SETTINGS, ...settings },
  });
  const gate = createGate({ storage, clock, autoClear: true });
  return { clock, storage, gate };
}

const GOOD_POST = 'Shipping the gate today: produce before you consume, five minutes at a time.';

test('a fresh gate is locked', async () => {
  const { gate } = harness();
  await gate.load();
  assert.equal(gate.snapshot().status, 'locked');
  assert.equal(gate.snapshot().remainingMs, 0);
});

test('a valid post unlocks the feed for exactly the configured window', async () => {
  const { gate, clock } = harness({ unlockMinutes: 5 });
  await gate.load();

  const res = await gate.submitPost({ text: GOOD_POST, platformId: 'x' });
  assert.equal(res.ok, true);
  assert.equal(gate.snapshot().status, 'unlocked');
  assert.equal(gate.snapshot().remainingMs, 5 * MIN);

  clock.advance(5 * MIN - 1);
  assert.equal(gate.snapshot().status, 'unlocked', 'still open one ms before expiry');

  clock.advance(1);
  assert.equal(gate.snapshot().status, 'locked', 'locks the instant the clock hits zero');
  assert.equal(gate.snapshot().remainingMs, 0);
});

test('expiry demands a new post, not a repeat of the old one', async () => {
  const { gate, clock } = harness();
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });
  clock.advance(6 * MIN);
  await gate.reconcile();

  const repeat = await gate.submitPost({ text: GOOD_POST });
  assert.equal(repeat.ok, false);
  assert.equal(repeat.reason, REJECTIONS.DUPLICATE);

  const fresh = await gate.submitPost({ text: 'A different thought, written from scratch this time.' });
  assert.equal(fresh.ok, true);
  assert.equal(gate.snapshot().status, 'unlocked');
});

test('whitespace and case changes do not make a post new', async () => {
  const { gate, clock } = harness();
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });
  clock.advance(6 * MIN);
  await gate.reconcile();

  const res = await gate.submitPost({ text: `  ${GOOD_POST.toUpperCase()}\n\n ` });
  assert.equal(res.reason, REJECTIONS.DUPLICATE);
});

test('short posts and filler are refused', async () => {
  const { gate } = harness({ minChars: 25 });
  await gate.load();
  assert.equal((await gate.submitPost({ text: '' })).reason, REJECTIONS.EMPTY);
  assert.equal((await gate.submitPost({ text: 'hi' })).reason, REJECTIONS.TOO_SHORT);
  assert.equal(
    (await gate.submitPost({ text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).reason,
    REJECTIONS.FILLER,
  );
  assert.equal(
    (await gate.submitPost({ text: 'asdf asdf asdf asdf asdf asdf asdf' })).reason,
    REJECTIONS.FILLER,
  );
  assert.equal(gate.snapshot().status, 'locked');
});

test('you cannot bank time by posting while the feed is already open', async () => {
  const { gate, clock } = harness();
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });
  clock.advance(MIN);

  const second = await gate.submitPost({ text: 'Another perfectly good post about something else.' });
  assert.equal(second.ok, false);
  assert.equal(second.reason, REJECTIONS.ALREADY_OPEN);
  assert.equal(gate.snapshot().remainingMs, 4 * MIN, 'window is unchanged');
});

test('proof mode holds the clock until a publish is observed', async () => {
  const { gate, clock } = harness({ requirePublishProof: true, proofOverrideAfterSeconds: 90 });
  await gate.load();

  await gate.submitPost({ text: GOOD_POST, platformId: 'x' });
  assert.equal(gate.snapshot().status, 'pending', 'submitting alone does not open the feed');
  assert.equal(gate.snapshot().proofOverrideAvailable, false);

  clock.advance(10 * MIN);
  assert.equal(gate.snapshot().status, 'pending', 'pending never expires on its own');

  await gate.notePublish({ platformId: 'x' });
  assert.equal(gate.snapshot().status, 'unlocked');
  assert.equal(gate.snapshot().remainingMs, 5 * MIN, 'the clock starts at publish, not at submit');
  assert.equal(gate.snapshot().journal[0].verified, true);
});

test('a publish on the wrong platform does not start the clock', async () => {
  const { gate } = harness({ requirePublishProof: true });
  await gate.load();
  await gate.submitPost({ text: GOOD_POST, platformId: 'x' });

  const res = await gate.notePublish({ platformId: 'reddit' });
  assert.equal(res.ok, false);
  assert.equal(gate.snapshot().status, 'pending');
});

test('the manual proof override unlocks only after the waiting period', async () => {
  const { gate, clock } = harness({ requirePublishProof: true, proofOverrideAfterSeconds: 90 });
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });

  assert.equal((await gate.overrideProof()).ok, false, 'too early');
  clock.advance(90_000);
  assert.equal(gate.snapshot().proofOverrideAvailable, true);
  assert.equal((await gate.overrideProof()).ok, true);
  assert.equal(gate.snapshot().status, 'unlocked');
  assert.equal(gate.snapshot().journal[0].verified, false, 'an override is never marked verified');
});

test('lockNow ends the session early', async () => {
  const { gate } = harness();
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });
  await gate.lockNow();
  assert.equal(gate.snapshot().status, 'locked');
});

test('state survives a restart because it lives in storage', async () => {
  const { gate, storage, clock } = harness();
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });

  const revived = createGate({ storage, clock });
  await revived.load();
  assert.equal(revived.snapshot().status, 'unlocked');
  assert.equal(revived.snapshot().remainingMs, 5 * MIN);

  clock.advance(6 * MIN);
  assert.equal(revived.snapshot().status, 'locked', 'a killed worker cannot leave the feed open');
});

test('two views of the same storage stay in sync', async () => {
  const { gate, storage, clock } = harness();
  const mirror = createGate({ storage, clock });
  await Promise.all([gate.load(), mirror.load()]);

  const seen = [];
  mirror.subscribe((s) => seen.push(s.status));
  await gate.submitPost({ text: GOOD_POST });

  assert.ok(seen.includes('unlocked'), `mirror saw ${JSON.stringify(seen)}`);
  assert.equal(mirror.snapshot().status, 'unlocked');
});

test('settings are clamped to sane ranges', () => {
  assert.equal(normalizeSettings({ unlockMinutes: 9999 }).unlockMinutes, 120);
  assert.equal(normalizeSettings({ unlockMinutes: 0 }).unlockMinutes, 1);
  assert.equal(normalizeSettings({ unlockMinutes: 'abc' }).unlockMinutes, DEFAULT_SETTINGS.unlockMinutes);
  assert.equal(normalizeSettings(null).minChars, DEFAULT_SETTINGS.minChars);
});

test('settings changes apply to the next window, not the current one', async () => {
  const { gate, clock } = harness({ unlockMinutes: 5 });
  await gate.load();
  await gate.submitPost({ text: GOOD_POST });
  await gate.updateSettings({ unlockMinutes: 30 });
  assert.equal(gate.snapshot().remainingMs, 5 * MIN);
  clock.advance(6 * MIN);
  await gate.submitPost({ text: 'A second, entirely different thought for the next window.' });
  assert.equal(gate.snapshot().remainingMs, 30 * MIN);
});

test('platform matching and block planning', () => {
  assert.equal(matchPlatform('https://x.com/home').id, 'x');
  assert.equal(matchPlatform('https://www.twitter.com/home').id, 'x');
  assert.equal(matchPlatform('https://example.com'), null);

  assert.equal(blockPlan(matchPlatform('https://x.com/home'), 'https://x.com/home').mode, 'overlay');
  assert.equal(
    blockPlan(matchPlatform('https://x.com/settings'), 'https://x.com/settings').mode,
    'elements',
    'non-feed routes stay usable',
  );
  assert.equal(
    blockPlan(matchPlatform('https://www.youtube.com/'), 'https://www.youtube.com/').mode,
    'overlay',
  );
  assert.equal(
    blockPlan(matchPlatform('https://www.youtube.com/watch?v=x'), 'https://www.youtube.com/watch?v=x').mode,
    'elements',
    'watching a chosen video is not feed consumption',
  );
  assert.equal(blockPlan(CUSTOM_PLATFORM, 'https://my.instance/home').mode, 'overlay');
});

test('publish signals match real request shapes', () => {
  const x = matchPlatform('https://x.com/home');
  assert.equal(
    matchesPublishSignal(x, { method: 'POST', url: 'https://x.com/i/api/graphql/abc123/CreateTweet' }),
    true,
  );
  assert.equal(matchesPublishSignal(x, { method: 'GET', url: '/i/api/graphql/abc/CreateTweet' }), false);
  assert.equal(matchesPublishSignal(x, { method: 'POST', url: '/i/api/graphql/abc/HomeTimeline' }), false);

  const fb = matchPlatform('https://www.facebook.com/');
  assert.equal(
    matchesPublishSignal(fb, {
      method: 'POST',
      url: 'https://www.facebook.com/api/graphql/',
      body: 'fb_api_req_friendly_name=ComposerStoryCreateMutation&x=1',
    }),
    true,
    'body matching catches networks that route everything through one endpoint',
  );
  assert.equal(
    matchesPublishSignal(fb, { method: 'POST', url: '/api/graphql/', body: 'FeedQuery' }),
    false,
  );
});

test('composer deep links carry the text', () => {
  const url = composerUrlFor(matchPlatform('https://x.com/home'), 'hello world');
  assert.match(url, /^https:\/\/x\.com\/compose\/post\?text=hello%20world$/);
  assert.equal(composerUrlFor(matchPlatform('https://www.facebook.com/'), 'x'), null);
});

test('evaluate is pure and clock-driven', () => {
  const s = { phase: 'open', startedAt: 0, endsAt: 1000, durationMs: 1000, submittedAt: 0 };
  assert.equal(evaluate(s, 999).status, 'unlocked');
  assert.equal(evaluate(s, 1000).status, 'locked');
  assert.equal(evaluate(null, 0).status, 'locked');
});

test('journal stats and formatting', () => {
  const now = Date.now();
  const j = [
    { id: 'a', at: now, text: 'one two three', fp: 'a' },
    { id: 'b', at: now - 86_400_000, text: 'four five', fp: 'b' },
  ];
  const s = stats(j, now);
  assert.equal(s.total, 2);
  assert.equal(s.today, 1);
  assert.equal(s.words, 5);
  assert.equal(s.streak, 2);

  assert.equal(formatCountdown(5 * MIN), '5:00');
  assert.equal(formatCountdown(61_000), '1:01');
  assert.equal(formatCountdown(-5), '0:00');
  assert.equal(formatBadge(5 * MIN), '5m');
  assert.equal(formatBadge(45_000), '45s');
});

test('duplicate lookback is bounded and disableable', () => {
  const journal = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, at: 0, text: `post ${i}`, fp: `fp${i}` }));
  assert.equal(isDuplicate(journal, 'nope', 0), false, 'lookback 0 disables the check');
  assert.equal(looksLikeFiller('...'), true);
  assert.equal(looksLikeFiller('A genuine sentence about the work.'), false);
});
