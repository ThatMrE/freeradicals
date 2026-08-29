# Architecture

## The shape

```
core/                  every rule. zero platform APIs. shared verbatim.
├── gate.js            the state machine — the only door into "unlocked"
├── session.js         locked / pending / unlocked, from a timestamp
├── journal.js         what you wrote; streaks; repeat detection
├── duration.js        how long a given post buys (the earned window)
├── platforms.js       one record per network: hosts, routes, selectors,
│                      publish signals, app ids, compose deep links
├── text.js            what counts as writing (length, filler, fingerprints)
├── config.js          settings shape + clamping
└── quotes.js, format.js, clock.js, storage.js

extension/             the Chrome shell
├── background/        single writer; alarms; badge
├── content/           boot → blocker → overlay, per tab
├── shared/            chrome.storage adapter; message contract
└── ui/                popup, options

mobile/                the second shell (see mobile/README.md)
├── bridge/            AsyncStorage adapter, gate controller, RN block screen
├── android/           overlay service + native bridge (reference Kotlin)
└── ios/               Screen Time shield (reference Swift)

tools/build-manifest.mjs   generates manifest.json + content-script tables
```

`manifest.json`, `extension/content/routes.generated.js` and
`extension/content/signals.generated.js` are generated. Edit `core/platforms.js`
and re-run `npm run build`.

## Three decisions worth knowing

### 1. A session is a timestamp, not a timer

An open window is `{ startedAt, endsAt, durationMs }`. Nothing counts down.
`durationMs` is priced once, at submit, from the post that bought it — so
changing a setting mid-window cannot stretch a window already running.
Every surface derives its answer by comparing `endsAt` to the clock, so:

- An MV3 service worker that gets killed for the whole five minutes still gives
  the right answer the instant anything asks.
- A tab that was asleep re-blocks on its first repaint.
- Android's overlay service and iOS's `DeviceActivity` schedule need one number
  from JavaScript and can then act with no JS running at all.

`evaluate(session, now)` is pure. Same inputs, same answer, on every platform —
which is what makes it testable without a browser.

### 2. One writer, many readers

Every context — service worker, each tab, the popup, the options page —
builds its own `Gate` over `chrome.storage.local` and re-renders from
`chrome.storage.onChanged`. Reads never involve messaging.

Writes go the other way: only the service worker calls `submitPost`, `lockNow`,
`notePublish`. Content scripts message it. Two tabs cannot race the journal, and
a tab cannot grant itself a window the worker did not issue.

### 3. Blocking is CSS, not DOM surgery

Feeds re-render constantly; removing nodes is a race you lose. The blocker sets
one attribute on `<html>` and one stylesheet, and `core/platforms.js#blockPlan`
picks the mode per URL:

- **overlay** — the route *is* a feed (`x.com/home`, `reddit.com/`). Hide
  `<body>`, cover it with the block screen, pause any playing media.
- **elements** — the route is useful but carries feed modules (a YouTube watch
  page's recommendation rail). Hide only those.
- **none** — nothing to do; your DMs and your own profile stay reachable.

Unblocking is removing one attribute. Nothing the site owns is ever destroyed.

## How long a window is

`core/duration.js#earnedMinutes(text, settings)` is the whole rule:

```
chars ≤ minChars          → base window
chars > minChars          → base + floor((chars − minChars) / earnPerChars) × step
                            capped at maxUnlockMinutes
durationMode === 'fixed'  → base window, always
```

Defaults: 25 characters buys 5:00, every 50 more buys a minute, ceiling 20:00.

`earnProgress(text, settings)` returns the same number plus what a compose box
needs to show the deal being struck — `charsToNext`, `nextMinutes`, `atCap`.
The extension's block screen, the popup and the React Native screen all call it
on every keystroke, so all three quote the same price for the same post. A
ceiling set below the base is ignored rather than obeyed: the base always wins,
because a setting that silently shortened your window would be a bug wearing a
config file.

## The state machine

```
                 submitPost() valid                   endsAt reached
   ┌────────┐   ──────────────────────► ┌──────────┐  ───────────────► ┌────────┐
   │ LOCKED │                           │ UNLOCKED │                   │ LOCKED │
   └────────┘  ◄── lockNow() ─────────  └──────────┘                   └────────┘
        │
        │ submitPost() valid, requirePublishProof = on
        ▼
   ┌─────────┐   publish observed (or override after N sec)
   │ PENDING │  ───────────────────────────────────────────► UNLOCKED
   └─────────┘   never expires on its own
```

`PENDING` is the strict mode. Writing in the block screen is not enough: the
clock starts when a real publish request is seen on the wire, so the window is
bought by publishing, not by typing. Getting there costs a `MAIN`-world content
script (`extension/content/probe.js`) that watches `fetch`/XHR for the request a
successful post makes — patterns generated from `core/platforms.js`. It is off
by default because those endpoints are private and change without notice.

## What stops the obvious cheats

| Cheat | What happens |
| --- | --- |
| Type `aaaaaaaaaa…` | `looksLikeFiller` rejects it (≤2 distinct characters) |
| Paste the same post again | fingerprint matches the journal → refused |
| Change casing/spacing and retry | fingerprints are normalized first → refused |
| Post again mid-window to bank time | `ALREADY_OPEN`; the window is unchanged |
| Pad a post with junk to earn more time | length is necessary, not sufficient — `looksLikeFiller` rejects repeated words and ≤2 distinct characters first |
| Reload the page | `endsAt` is in storage, not in the tab |
| Let the service worker die | state is a timestamp; nothing to lose |
| Sit on the block screen forever | fine — that costs nothing but a blocked feed |

What does *not* stop: disabling the extension. That is deliberate. The target is
the reflex to open a feed, not a determined adversary. A gate you can dismantle
in three deliberate clicks still changes behaviour; a gate that fights its owner
gets uninstalled.

## Adding a network

Add one record to `PLATFORMS` in `core/platforms.js`:

```js
{
  id: 'example',
  name: 'Example',
  accent: '#ff8800',
  web: {
    hosts: ['example.com'],
    feedRoutes: [/^\/$/, /^\/home/],      // overlay-blocked
    feedElements: ['[role="feed"]'],       // element-blocked elsewhere
    inlineComposer: '[data-compose]',      // optional
    composerUrl: (text) => `https://example.com/compose?text=${encodeURIComponent(text)}`,
    publishSignals: [{ method: 'POST', url: /\/api\/posts$/ }],
  },
  mobile: {
    android: 'com.example.app',
    ios: 'com.example.app',
    iosScheme: (text) => `example://post?text=${encodeURIComponent(text)}`,
    feedScreens: ['Home'],
  },
}
```

Then `npm run build` (regenerates the manifest, the route table and the signal
table) and `npm test` (the generated files are checked against the registry).

Both shells pick it up. Nothing else changes.
