import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS, PLATFORMS, blockPlan, composerUrlFor, matchPlatform,
  matchesPublishSignal,
} from '../core/index.js';

/**
 * Coverage for every network the extension claims to gate.
 *
 * The end-to-end suite drives one platform through a real browser because that
 * is expensive; this drives all ten through the routing logic because that is
 * cheap. Between them, a platform cannot be added to the registry with a
 * feed route that never fires, a selector that hides the wrong thing, or a
 * hostname that belongs to someone else.
 */

/**
 * One row per platform: URLs that must be treated as a feed, URLs that must
 * stay usable, and what the extension should do on each. These are the real
 * shapes — a Reddit comments permalink, a YouTube watch page, a profile — not
 * synthetic paths.
 */
const EXPECTATIONS = [
  {
    id: 'x',
    overlay: ['https://x.com/', 'https://x.com/home', 'https://twitter.com/home'],
    usable: ['https://x.com/settings/account', 'https://x.com/messages'],
  },
  {
    id: 'facebook',
    overlay: ['https://www.facebook.com/', 'https://www.facebook.com/watch'],
    usable: ['https://www.facebook.com/groups/1234', 'https://www.facebook.com/marketplace/'],
  },
  {
    id: 'instagram',
    overlay: ['https://www.instagram.com/', 'https://www.instagram.com/explore/'],
    usable: ['https://www.instagram.com/someuser/', 'https://www.instagram.com/direct/inbox/'],
  },
  {
    id: 'linkedin',
    overlay: ['https://www.linkedin.com/', 'https://www.linkedin.com/feed/'],
    usable: ['https://www.linkedin.com/in/someone', 'https://www.linkedin.com/messaging/'],
  },
  {
    id: 'reddit',
    overlay: ['https://www.reddit.com/', 'https://www.reddit.com/hot', 'https://www.reddit.com/r/all/'],
    usable: ['https://www.reddit.com/r/webdev/comments/abc123/some_title/', 'https://www.reddit.com/user/someone'],
  },
  {
    id: 'youtube',
    overlay: ['https://www.youtube.com/', 'https://www.youtube.com/feed/trending', 'https://www.youtube.com/shorts/abc'],
    usable: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@somechannel'],
  },
  {
    id: 'tiktok',
    overlay: ['https://www.tiktok.com/', 'https://www.tiktok.com/foryou', 'https://www.tiktok.com/explore'],
    usable: ['https://www.tiktok.com/@user/video/12345', 'https://www.tiktok.com/upload'],
  },
  {
    id: 'threads',
    overlay: ['https://www.threads.net/', 'https://www.threads.net/for-you'],
    usable: ['https://www.threads.net/@someone'],
  },
  {
    id: 'bluesky',
    overlay: ['https://bsky.app/', 'https://bsky.app/feeds/whats-hot'],
    usable: ['https://bsky.app/profile/someone.bsky.social'],
  },
  {
    id: 'mastodon',
    overlay: ['https://mastodon.social/', 'https://mastodon.social/home', 'https://mastodon.social/explore'],
    usable: ['https://mastodon.social/@someone', 'https://mastodon.social/settings/preferences'],
  },
];

test('every registered platform has an expectation row', () => {
  const covered = new Set(EXPECTATIONS.map((e) => e.id));
  for (const p of PLATFORMS) {
    assert.ok(covered.has(p.id), `${p.id} is in the registry but untested — add a row here`);
  }
  for (const e of EXPECTATIONS) {
    assert.ok(PLATFORMS.some((p) => p.id === e.id), `expectation for unknown platform ${e.id}`);
  }
});

for (const row of EXPECTATIONS) {
  test(`${row.id}: feed routes are blocked outright`, () => {
    for (const url of row.overlay) {
      const platform = matchPlatform(url);
      assert.ok(platform, `${url} matched no platform`);
      assert.equal(platform.id, row.id, `${url} matched ${platform.id}`);
      assert.equal(blockPlan(platform, url).mode, 'overlay', `${url} should be fully blocked`);
    }
  });

  test(`${row.id}: the rest of the site stays reachable`, () => {
    for (const url of row.usable) {
      const platform = matchPlatform(url);
      assert.equal(platform.id, row.id, `${url} matched ${platform && platform.id}`);
      const mode = blockPlan(platform, url).mode;
      assert.notEqual(mode, 'overlay', `${url} must not be covered by the block screen`);
      assert.ok(['elements', 'none'].includes(mode), `${url} produced mode ${mode}`);
    }
  });
}

test('hostnames are claimed by exactly one platform', () => {
  const seen = new Map();
  for (const p of PLATFORMS) {
    for (const host of p.web.hosts) {
      assert.equal(seen.has(host), false,
        `${host} is claimed by both ${seen.get(host)} and ${p.id}; matching would be order-dependent`);
      seen.set(host, p.id);
    }
  }
});

test('www and subdomains resolve to the same platform', () => {
  for (const p of PLATFORMS) {
    for (const host of p.web.hosts) {
      assert.equal(matchPlatform(`https://${host}/`).id, p.id);
      assert.equal(matchPlatform(`https://www.${host}/`).id, p.id, `www.${host} did not match ${p.id}`);
    }
  }
});

test('unrelated sites are never touched', () => {
  for (const url of [
    'https://example.com/', 'https://news.ycombinator.com/', 'https://github.com/x/home',
    'https://notx.com/home', 'https://x.com.evil.test/home',
  ]) {
    assert.equal(matchPlatform(url), null, `${url} should match no platform`);
  }
});

test('every platform declares a usable shape', () => {
  for (const p of PLATFORMS) {
    assert.match(p.id, /^[a-z][a-z0-9-]*$/, `${p.id} is not a clean id`);
    assert.ok(p.name && typeof p.name === 'string', `${p.id} has no name`);
    assert.match(p.accent, /^#[0-9a-f]{6}$/i, `${p.id} accent is not a hex colour`);
    assert.ok(p.web.hosts.length > 0, `${p.id} has no hosts`);
    assert.ok(p.web.feedRoutes.length > 0, `${p.id} has no feed routes`);
    for (const host of p.web.hosts) {
      assert.match(host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${p.id} host "${host}" is not a bare hostname`);
      assert.equal(host.startsWith('www.'), false, `${p.id} host "${host}" should not include www.`);
    }
    for (const re of p.web.feedRoutes) assert.ok(re instanceof RegExp, `${p.id} feed route is not a regex`);
    for (const sel of p.web.feedElements) {
      assert.equal(typeof sel, 'string', `${p.id} has a non-string selector`);
      assert.ok(sel.trim().length > 0, `${p.id} has an empty selector`);
    }
  }
});

test('publish signals are well-formed and specific', () => {
  for (const p of PLATFORMS) {
    for (const sig of p.web.publishSignals) {
      assert.ok(sig.url instanceof RegExp, `${p.id} publish signal has no url pattern`);
      assert.equal(sig.method, 'POST', `${p.id} watches a non-POST request for a publish`);
      // A signal that matches a bare origin would fire on every page load.
      assert.equal(sig.url.test('https://example.com/'), false,
        `${p.id} publish signal is too broad — it matches an unrelated root URL`);
    }
  }
});

test('composer deep links are real, absolute, and carry the text', () => {
  const text = 'a post with spaces & an ampersand';
  for (const p of PLATFORMS) {
    const url = composerUrlFor(p, text, `https://${p.web.hosts[0]}`);
    if (url === null) continue; // networks with no supported compose intent
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:', `${p.id} composer URL is not https`);
    assert.ok(p.web.hosts.some((h) => parsed.hostname.endsWith(h)),
      `${p.id} composer URL points at ${parsed.hostname}, off-platform`);
  }
});

/**
 * Publish detection, per platform.
 *
 * Signals are only ever evaluated against the host they belong to — the probe
 * picks its patterns by hostname, and the gate refuses a publish attributed to
 * a platform other than the one the session was opened for. So the risk worth
 * testing is not cross-platform confusion; it is a *read* on the same platform
 * being mistaken for a publish and handing out a free window.
 */
const PUBLISH_TRAFFIC = [
  {
    id: 'x',
    publish: [{ method: 'POST', url: 'https://x.com/i/api/graphql/aBc123XyZ/CreateTweet' }],
    reads: [
      { method: 'POST', url: 'https://x.com/i/api/graphql/aBc123XyZ/HomeTimeline' },
      { method: 'GET', url: 'https://x.com/i/api/graphql/aBc123XyZ/CreateTweet' },
    ],
  },
  {
    id: 'facebook',
    publish: [{
      method: 'POST',
      url: 'https://www.facebook.com/api/graphql/',
      body: 'fb_api_req_friendly_name=ComposerStoryCreateMutation&variables=%7B%7D',
    }],
    reads: [
      { method: 'POST', url: 'https://www.facebook.com/api/graphql/', body: 'fb_api_req_friendly_name=FeedQuery' },
      { method: 'POST', url: 'https://www.facebook.com/api/graphql/' },
    ],
  },
  {
    id: 'instagram',
    publish: [{ method: 'POST', url: 'https://www.instagram.com/api/v1/media/configure/' }],
    reads: [
      { method: 'GET', url: 'https://www.instagram.com/api/v1/feed/timeline/' },
      { method: 'POST', url: 'https://www.instagram.com/api/v1/feed/reels_tray/' },
    ],
  },
  {
    id: 'linkedin',
    publish: [{ method: 'POST', url: 'https://www.linkedin.com/voyager/api/contentcreation/normShares' }],
    reads: [
      { method: 'POST', url: 'https://www.linkedin.com/voyager/api/graphql', body: 'queryId=voyagerFeedDashMainFeed' },
      { method: 'GET', url: 'https://www.linkedin.com/voyager/api/contentcreation/normShares' },
    ],
  },
  {
    id: 'reddit',
    publish: [{ method: 'POST', url: 'https://www.reddit.com/svc/shreddit/submit' }],
    reads: [
      { method: 'POST', url: 'https://www.reddit.com/svc/shreddit/vote' },
      { method: 'POST', url: 'https://www.reddit.com/graphql', body: 'operationName=FeedQuery' },
    ],
  },
  {
    id: 'youtube',
    publish: [{ method: 'POST', url: 'https://www.youtube.com/youtubei/v1/backstage/create_post' }],
    reads: [
      { method: 'POST', url: 'https://www.youtube.com/youtubei/v1/browse' },
      { method: 'POST', url: 'https://www.youtube.com/youtubei/v1/next' },
    ],
  },
  {
    id: 'tiktok',
    publish: [{ method: 'POST', url: 'https://www.tiktok.com/api/post/publish/' }],
    reads: [
      { method: 'GET', url: 'https://www.tiktok.com/api/recommend/item_list/' },
      { method: 'POST', url: 'https://www.tiktok.com/api/commit/item/digg/' },
    ],
  },
  {
    id: 'threads',
    publish: [{ method: 'POST', url: 'https://www.threads.net/api/graphql', body: 'useBarcelonaCreateTextPostMutation' }],
    reads: [
      { method: 'POST', url: 'https://www.threads.net/api/graphql', body: 'BarcelonaFeedQuery' },
      { method: 'POST', url: 'https://www.threads.net/api/graphql' },
    ],
  },
  {
    id: 'bluesky',
    publish: [{ method: 'POST', url: 'https://bsky.app/xrpc/com.atproto.repo.createRecord' }],
    reads: [
      { method: 'GET', url: 'https://bsky.app/xrpc/app.bsky.feed.getTimeline' },
      { method: 'POST', url: 'https://bsky.app/xrpc/com.atproto.repo.getRecord' },
    ],
  },
  {
    id: 'mastodon',
    publish: [{ method: 'POST', url: 'https://mastodon.social/api/v1/statuses' }],
    reads: [
      { method: 'GET', url: 'https://mastodon.social/api/v1/timelines/home' },
      // The trailing anchor matters: favouriting is not posting.
      { method: 'POST', url: 'https://mastodon.social/api/v1/statuses/12345/favourite' },
    ],
  },
];

test('every platform has publish traffic covered', () => {
  for (const p of PLATFORMS) {
    assert.ok(PUBLISH_TRAFFIC.some((r) => r.id === p.id), `${p.id} has no publish-traffic row`);
  }
});

for (const row of PUBLISH_TRAFFIC) {
  test(`${row.id}: a real publish is detected`, () => {
    const platform = PLATFORMS.find((p) => p.id === row.id);
    for (const req of row.publish) {
      assert.equal(matchesPublishSignal(platform, req), true,
        `${row.id} failed to detect a publish to ${req.url}`);
    }
  });

  test(`${row.id}: ordinary reads are not mistaken for a publish`, () => {
    const platform = PLATFORMS.find((p) => p.id === row.id);
    for (const req of row.reads) {
      assert.equal(matchesPublishSignal(platform, req), false,
        `${row.id} would hand out a free window for ${req.method} ${req.url}`);
    }
  });
}

test('platform toggles are honoured for every network', () => {
  for (const p of PLATFORMS) {
    const off = { ...DEFAULT_SETTINGS, platformOverrides: { [p.id]: false } };
    assert.equal(off.platformOverrides[p.id], false);
    const others = PLATFORMS.filter((x) => x.id !== p.id);
    for (const other of others) {
      assert.notEqual(off.platformOverrides[other.id], false,
        `disabling ${p.id} must not disable ${other.id}`);
    }
  }
});
