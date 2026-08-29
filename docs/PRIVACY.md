# Privacy

## What is stored

Three keys in `chrome.storage.local`, in your browser profile:

- `settings` — your window length, minimums, toggles.
- `session` — the current window: a timestamp and the id of the post that
  bought it.
- `journal` — the posts you wrote through the gate, capped at 500 entries.
- `draft` — whatever is currently in the compose box, so a reload does not eat it.

The journal is the only thing here with real content in it, and it is there so
the extension can (a) refuse a repeat and (b) show you what you made this week.
Export it or delete it from the options page.

## What leaves your machine

Nothing. There is no server, no analytics, no telemetry, no remote config, no
account. The extension makes no network requests of its own — grep the source.

The one thing that navigates anywhere is "help me publish it": it opens the
network's own composer in a new tab with your text in the URL, because that is
how a share intent works. That is you posting to the site you were already on.

## What the extension can see

Its content scripts run on the ten social networks in `core/platforms.js` and
nowhere else — `manifest.json` lists exactly those hosts. On those pages it
reads the URL to decide whether the route is a feed, and it hides things. It
does not read your timeline, your messages, or your account.

## The one part that touches the page

With **require proof of publishing** turned on, `extension/content/probe.js`
runs in the page's own JavaScript context and wraps `fetch` and
`XMLHttpRequest`, watching for the request a successful post makes. It records
nothing: no bodies are stored, responses are checked for a status code and
discarded, and the only thing it emits is a single `postMessage` saying "a post
went out".

Two honest consequences:

1. Because it necessarily runs in the page's world, a hostile page could send
   the same message and start your timer. This is an accountability tool, not a
   security boundary — the threat model is your own thumb, not an attacker.
2. Those endpoints are private APIs. When a network changes one, detection stops
   working, and the escape hatch ("I posted it anyway", after 90 seconds) is
   what keeps you unstuck. Turn the setting off if a network drifts.

It is off by default.

## Permissions, and why

| Permission | Why |
| --- | --- |
| `storage` | the four keys above |
| `alarms` | wake up when a window expires to re-block and repaint the badge |
| `tabs` | open the composer in a new tab |
| `scripting` | declared for content-script registration |
| host access to 10 sites | the sites it gates, listed one by one, no wildcards |

`optional_host_permissions` is declared but never requested; it is the seam for
user-added sites (self-hosted Mastodon and the like) and grants nothing unless
you explicitly approve a host.
