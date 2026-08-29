/**
 * The platform registry: one declarative record per social network.
 *
 * `web` is consumed by the Chrome extension (hostnames, feed routes, DOM
 * selectors, publish-detection signals). `mobile` is consumed by the Android
 * overlay service and the iOS shield extension (package names, bundle ids,
 * share intents). Neither half imports anything platform-specific, so this file
 * is the single place a new network gets taught to the whole system.
 *
 * @typedef {object} Platform
 * @property {string} id
 * @property {string} name
 * @property {string} accent      Brand-ish accent used by the block screen.
 * @property {object} web
 * @property {object} mobile
 */

const enc = (t) => encodeURIComponent(String(t || '').slice(0, 800));

/** @type {Platform[]} */
export const PLATFORMS = [
  {
    id: 'x',
    name: 'X',
    accent: '#1d9bf0',
    web: {
      hosts: ['x.com', 'twitter.com'],
      feedRoutes: [/^\/$/, /^\/home\/?$/, /^\/i\/timeline/],
      feedElements: ['[data-testid="sidebarColumn"] [aria-label*="Trending" i]'],
      inlineComposer: '[data-testid="tweetTextarea_0"]',
      composerUrl: (text) => `https://x.com/compose/post?text=${enc(text)}`,
      publishSignals: [{ method: 'POST', url: /\/i\/api\/graphql\/[^/]+\/CreateTweet/i }],
    },
    mobile: {
      android: 'com.twitter.android',
      ios: 'com.atebits.Tweetie2',
      iosScheme: (text) => `twitter://post?message=${enc(text)}`,
      feedScreens: ['HomeTimeline', 'Home'],
    },
  },
  {
    id: 'facebook',
    name: 'Facebook',
    accent: '#0866ff',
    web: {
      hosts: ['facebook.com', 'fb.com'],
      feedRoutes: [/^\/$/, /^\/home\.php/, /^\/reels?\//, /^\/watch\/?$/],
      feedElements: ['[role="feed"]', '[data-pagelet^="FeedUnit"]', '[aria-label="Reels"]'],
      inlineComposer: '[role="button"][aria-label*="mind" i]',
      composerUrl: null, // Facebook has no supported prefilled-status intent.
      publishSignals: [
        { method: 'POST', url: /\/api\/graphql\//i, body: /ComposerStoryCreateMutation/i },
      ],
    },
    mobile: {
      android: 'com.facebook.katana',
      ios: 'com.facebook.Facebook',
      iosScheme: null,
      feedScreens: ['NewsFeed', 'Feed'],
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    accent: '#e1306c',
    web: {
      hosts: ['instagram.com'],
      feedRoutes: [/^\/$/, /^\/explore/, /^\/reels?\//],
      feedElements: ['main[role="main"] article', 'div[data-pagelet="story_tray"]'],
      inlineComposer: null,
      composerUrl: null,
      publishSignals: [
        { method: 'POST', url: /\/api\/v1\/media\/configure/i },
        { method: 'POST', url: /\/create\/configure/i },
      ],
    },
    mobile: {
      android: 'com.instagram.android',
      ios: 'com.burbn.instagram',
      iosScheme: null,
      feedScreens: ['Feed', 'Explore', 'Reels'],
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    accent: '#0a66c2',
    web: {
      hosts: ['linkedin.com'],
      feedRoutes: [/^\/$/, /^\/feed\/?$/],
      feedElements: ['.scaffold-finite-scroll', 'main .feed-outlet', '.feed-shared-update-v2'],
      inlineComposer: '.share-box-feed-entry__trigger',
      composerUrl: (text) =>
        `https://www.linkedin.com/feed/?shareActive=true&text=${enc(text)}`,
      publishSignals: [
        { method: 'POST', url: /\/voyager\/api\/contentcreation\/normShares/i },
        { method: 'POST', url: /\/voyager\/api\/graphql/i, body: /createShare|DashShares/i },
      ],
    },
    mobile: {
      android: 'com.linkedin.android',
      ios: 'com.linkedin.LinkedIn',
      iosScheme: null,
      feedScreens: ['Feed'],
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    accent: '#ff4500',
    web: {
      hosts: ['reddit.com'],
      feedRoutes: [/^\/$/, /^\/(best|hot|new|top|rising)\/?$/, /^\/r\/(all|popular)\//],
      feedElements: ['shreddit-feed', '.trending-searches-container'],
      inlineComposer: null,
      composerUrl: (text) =>
        `https://www.reddit.com/submit?title=${enc(String(text).split('\n')[0].slice(0, 280))}&text=${enc(text)}`,
      publishSignals: [
        { method: 'POST', url: /\/svc\/shreddit\/(submit|composer)/i },
        { method: 'POST', url: /\/graphql/i, body: /CreatePost|createSubredditPost/i },
      ],
    },
    mobile: {
      android: 'com.reddit.frontpage',
      ios: 'com.reddit.Reddit',
      iosScheme: null,
      feedScreens: ['Home', 'Popular'],
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    accent: '#ff0000',
    web: {
      hosts: ['youtube.com'],
      feedRoutes: [/^\/$/, /^\/feed\/(trending|explore|subscriptions)/, /^\/shorts/],
      feedElements: [
        'ytd-browse[page-subtype="home"] #contents',
        '#related',
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer',
      ],
      inlineComposer: null,
      composerUrl: () => 'https://studio.youtube.com/',
      publishSignals: [
        { method: 'POST', url: /\/youtubei\/v1\/backstage\/create_post/i },
        { method: 'POST', url: /\/upload\/youtube\/v3\/videos/i },
      ],
    },
    mobile: {
      android: 'com.google.android.youtube',
      ios: 'com.google.ios.youtube',
      iosScheme: null,
      feedScreens: ['Home', 'Shorts'],
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    accent: '#fe2c55',
    web: {
      hosts: ['tiktok.com'],
      feedRoutes: [/^\/$/, /^\/foryou/, /^\/following/, /^\/explore/],
      feedElements: ['[data-e2e="recommend-list-item-container"]'],
      inlineComposer: null,
      composerUrl: () => 'https://www.tiktok.com/upload',
      publishSignals: [
        { method: 'POST', url: /\/api\/post\/publish/i },
        { method: 'POST', url: /\/aweme\/v\d\/create/i },
      ],
    },
    mobile: {
      android: 'com.zhiliaoapp.musically',
      ios: 'com.zhiliaoapp.musically',
      iosScheme: null,
      feedScreens: ['ForYou', 'Following'],
    },
  },
  {
    id: 'threads',
    name: 'Threads',
    accent: '#000000',
    web: {
      hosts: ['threads.net', 'threads.com'],
      feedRoutes: [/^\/$/, /^\/for-you/, /^\/following/],
      feedElements: [],
      inlineComposer: null,
      composerUrl: (text) => `https://www.threads.net/intent/post?text=${enc(text)}`,
      publishSignals: [
        { method: 'POST', url: /\/api\/graphql/i, body: /useBarcelonaCreateText|CreateTextPost/i },
      ],
    },
    mobile: {
      android: 'com.instagram.barcelona',
      ios: 'com.burbn.barcelona',
      iosScheme: (text) => `barcelona://create?text=${enc(text)}`,
      feedScreens: ['ForYou', 'Following'],
    },
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    accent: '#0085ff',
    web: {
      hosts: ['bsky.app'],
      feedRoutes: [/^\/$/, /^\/feeds?\//],
      feedElements: [],
      inlineComposer: null,
      composerUrl: (text) => `https://bsky.app/intent/compose?text=${enc(text)}`,
      publishSignals: [
        { method: 'POST', url: /\/xrpc\/com\.atproto\.repo\.createRecord/i },
      ],
    },
    mobile: {
      android: 'xyz.blueskyweb.app',
      ios: 'xyz.blueskyweb.app',
      iosScheme: (text) => `bluesky://intent/compose?text=${enc(text)}`,
      feedScreens: ['Home'],
    },
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    accent: '#6364ff',
    web: {
      hosts: ['mastodon.social', 'mastodon.online', 'fosstodon.org', 'hachyderm.io'],
      feedRoutes: [/^\/$/, /^\/home/, /^\/public/, /^\/explore/],
      feedElements: ['.item-list[role="feed"]'],
      inlineComposer: '.compose-form__highlightable',
      composerUrl: (text, origin) => `${origin || 'https://mastodon.social'}/share?text=${enc(text)}`,
      publishSignals: [{ method: 'POST', url: /\/api\/v1\/statuses(\?|$)/i }],
    },
    mobile: {
      android: 'org.joinmastodon.android',
      ios: 'org.joinmastodon.ios',
      iosScheme: (text) => `mastodon://post?text=${enc(text)}`,
      feedScreens: ['Home', 'Local', 'Federated'],
    },
  },
];

/**
 * Fallback used for user-added hosts (self-hosted Mastodon, Lemmy, anything
 * with a "home feed at /"). Registered dynamically from the options page.
 * @type {Platform}
 */
export const CUSTOM_PLATFORM = {
  id: 'custom',
  name: 'Custom site',
  accent: '#8b5cf6',
  web: {
    hosts: [],
    feedRoutes: [/^\/$/, /^\/home/, /^\/feed/, /^\/timeline/, /^\/public/],
    feedElements: ['[role="feed"]'],
    inlineComposer: null,
    composerUrl: null,
    publishSignals: [{ method: 'POST', url: /\/api\/v\d\/(statuses|posts)/i }],
  },
  mobile: { android: null, ios: null, iosScheme: null, feedScreens: [] },
};

const byId = new Map(PLATFORMS.map((p) => [p.id, p]));

export function getPlatform(id) {
  return byId.get(id) || (id === CUSTOM_PLATFORM.id ? CUSTOM_PLATFORM : null);
}

/** Every hostname the extension ships static content scripts for. */
export function allHosts() {
  return PLATFORMS.flatMap((p) => p.web.hosts);
}

function hostMatches(hostname, host) {
  const h = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return h === host || h.endsWith(`.${host}`);
}

/**
 * @param {string|URL} url
 * @returns {Platform|null}
 */
export function matchPlatform(url) {
  let parsed;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.web.hosts.some((h) => hostMatches(parsed.hostname, h))) || null;
}

/**
 * Decide how a given URL should be blocked.
 *  - `overlay`  the whole page is a feed; cover it with the block screen.
 *  - `elements` the page has feed modules embedded in otherwise useful UI;
 *               hide just those (a YouTube watch page's recommendations).
 *  - `none`     nothing to do here.
 *
 * @returns {{ mode: 'overlay'|'elements'|'none', selectors: string[] }}
 */
export function blockPlan(platform, url) {
  if (!platform) return { mode: 'none', selectors: [] };
  let path = '/';
  try {
    path = (typeof url === 'string' ? new URL(url) : url).pathname || '/';
  } catch { /* keep default */ }

  if (platform.web.feedRoutes.some((re) => re.test(path))) {
    return { mode: 'overlay', selectors: [] };
  }
  const selectors = platform.web.feedElements || [];
  return selectors.length ? { mode: 'elements', selectors } : { mode: 'none', selectors: [] };
}

/** Build the prefilled composer URL for a platform, if it supports one. */
export function composerUrlFor(platform, text, origin) {
  if (!platform || typeof platform.web.composerUrl !== 'function') return null;
  try {
    return platform.web.composerUrl(text, origin);
  } catch {
    return null;
  }
}

/** Does a captured network request look like a successful publish? */
export function matchesPublishSignal(platform, { method, url, body }) {
  if (!platform) return false;
  const signals = platform.web.publishSignals || [];
  const m = String(method || 'GET').toUpperCase();
  return signals.some((sig) => {
    if (sig.method && sig.method.toUpperCase() !== m) return false;
    if (sig.url && !sig.url.test(String(url || ''))) return false;
    if (sig.body && !sig.body.test(String(body || ''))) return false;
    return true;
  });
}

export function isPlatformEnabled(settings, platformId) {
  const overrides = (settings && settings.platformOverrides) || {};
  return overrides[platformId] !== false;
}
