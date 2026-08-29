# Releasing

Free Radicals ships to four browser stores from one source tree, and is
designed to ship to two app stores once the mobile app exists. This is the
method, what it checks before anything goes live, and what it deliberately
cannot do yet.

## The short version

```bash
npm ci
npm run preflight          # everything that can be checked here
npm run build              # dist/<target>/ and a reproducible zip each
```

To ship: bump `version` in `package.json`, tag it, push the tag.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` re-runs the whole preflight against the exact
artifacts it is about to submit, then submits to each store it has credentials
for. A store with no credentials configured is skipped, not failed — not having
set up Edge should never block shipping to Chrome.

To rehearse without touching a store: run the workflow manually with
`dry_run: true`. Every deployer supports `--dry-run` locally too, and walks the
full flow including reading and measuring the package.

## What preflight actually checks

| Check | What it catches |
| --- | --- |
| Generated files match the registry | a network added to `core/platforms.js` without a rebuild, shipping a manifest whose host permissions don't match the networks it claims to gate |
| 119 unit tests | the gate's own logic, the earned window, anti-cheat, portability |
| All 10 platforms routed | a feed route that never fires, or one that blacks out a page that should stay usable (a YouTube watch page, your DMs) |
| All 10 platforms' publish signals | an ordinary read being mistaken for a publish and handing out a free window |
| Package validation, per target | a file the manifest references that isn't in the zip — the one bug this repo has actually shipped |
| End-to-end in real Chromium | the built package, not the repo: block → post → open → expire → re-block |
| Every CSS selector | invalid selectors fail silently at runtime, leaving feed modules visible |
| AMO lint | what Mozilla's reviewers will say, before they say it |
| Store deploy dry runs | a deployer that breaks on a missing credential or a renamed field |
| Mobile readiness | reported, and does not block an extension release |

A check that could not run is reported as **skipped**, and preflight prints
that skips are not passes. This matters most for Edge, which is not installable
on every machine.

## Browser support, and its limits

| Target | Built | Tested | How |
| --- | --- | --- | --- |
| Chrome | ✅ | ✅ runtime | Playwright drives the built package |
| Edge | ✅ | ✅ runtime in CI | same suite, `channel: msedge` |
| Firefox | ✅ | ⚠️ static only | **Playwright cannot load an extension into Firefox at all.** AMO's own linter (`web-ext lint`) plus manifest tests are the ceiling here; the first runtime check is a human running `web-ext run` |
| Safari | ✅ tree | ❌ | conversion needs `xcrun safari-web-extension-converter`, which is macOS + Xcode only |

Firefox is not the same package. It needs:

- **`background.scripts`, not `service_worker`.** Firefox has no MV3 service
  worker; without an event page the background never runs, so no alarms, no
  badge, and no window expiry. Chrome's key is omitted rather than carried
  along, because carrying it only earns a review warning.
- **`browser_specific_settings.gecko.id`.** AMO will not sign without it.
- **`data_collection_permissions: { required: ['none'] }`.** AMO now requires
  every add-on to state what it collects. This one collects nothing.
- **A floor of Firefox 140** (Android 142). MAIN-world content scripts — the
  publish probe — arrived in 128; the data-collection key in 140.

`tools/lint-firefox.json` holds the one accepted lint warning with its
justification. Anything new fails the build, and an exception that stops firing
is reported as stale so it gets deleted rather than carried forever.

## Chrome Web Store

**Use the v2 API.** The v1.1 endpoints that most tutorials and actions still
use (`www.googleapis.com/upload/chromewebstore/v1.1/…`) are deprecated and stop
working on **15 October 2026** — a pipeline written against them has a hard
expiry date. `tools/deploy/chrome.mjs` is built against v2, whose endpoints and
enums come from the discovery document:

```
https://chromewebstore.googleapis.com/$discovery/rest?version=v2
```

| | |
| --- | --- |
| Upload | `POST /upload/v2/publishers/{publisher}/items/{item}:upload?uploadType=media` |
| Publish | `POST /v2/publishers/{publisher}/items/{item}:publish` |
| Status | `GET /v2/publishers/{publisher}/items/{item}:fetchStatus` |
| Rollout | `POST /v2/…:setPublishedDeployPercentage` |
| Scope | `https://www.googleapis.com/auth/chromewebstore` |

Two v2 limitations, both deliberate on Google's part: **it cannot create a new
listing** (do the first submission by hand in the dashboard) and **it cannot
change item visibility**.

Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`,
`CWS_PUBLISHER_ID`, `CWS_ITEM_ID`. Optional variable
`CWS_DEPLOY_PERCENTAGE` — set it below 100 and the deployer switches to
`STAGED_PUBLISH` with that rollout.

> A Google refresh token stops working if unused for six months. A project that
> releases twice a year will find its pipeline broken by the calendar. Either
> release more often or re-mint it deliberately.

## Microsoft Edge Add-ons

Same package as Chrome, separate listing, separate review. The v1.1 API
authenticates with an API key rather than v1's OAuth secret, and **both**
headers are required:

```
Authorization: ApiKey $EDGE_API_KEY
X-ClientID: $EDGE_CLIENT_ID
```

Base `https://api.addons.microsoftedge.microsoft.com`:

| | |
| --- | --- |
| Upload | `POST /v1/products/{product}/submissions/draft/package` (`Content-Type: application/zip`) |
| Upload status | `GET /v1/products/{product}/submissions/draft/package/operations/{operation}` |
| Publish | `POST /v1/products/{product}/submissions` |
| Publish status | `GET /v1/products/{product}/submissions/operations/{operation}` |

Everything is asynchronous: the API answers `202` and returns the operation id
**in the `Location` header**, not the body. The deployer polls both operations
to completion — a deploy that returns before the store accepted the package is
reporting success it has not earned.

Secrets: `EDGE_PRODUCT_ID`, `EDGE_API_KEY`, `EDGE_CLIENT_ID`.

## addons.mozilla.org

AMO uses a short-lived JWT signed with your API secret — there is no bearer
token to store, so `tools/deploy/firefox.mjs` mints one per run with
`node:crypto` (HS256, five-minute expiry, `jti` per request).

1. `POST /api/v5/addons/upload/` — multipart, `upload` file + `channel`
2. `GET /api/v5/addons/upload/{uuid}/` — poll until `processed`, check `valid`
3. `POST /api/v5/addons/addon/{id}/versions/` — attach the validated upload

Validation is asynchronous and can reject; there is no point attaching an
upload that has not passed, so the deployer waits and prints the validation
report on failure.

Secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`, `AMO_ADDON_ID`.

## Safari

Safari extensions are native apps wrapping the web extension, so this one
cannot be automated on Linux:

```bash
xcrun safari-web-extension-converter dist/safari \
  --project-location build/safari --app-name "Free Radicals" --bundle-identifier app.freeradicals.safari
```

Then it is an ordinary App Store submission (Xcode 26+, see below). `npm run
build` produces `dist/safari/` specifically so the converter has a stable,
reproducible tree to read.

## Mobile — the honest status

**The pipeline is written. There is no app to run it on yet.**

`node tools/deploy/mobile.mjs` is the gate that says so, and it exits non-zero
rather than letting a release look successful:

```
✓ shared bridge          gate, native mirror, storage adapter and block screen present
✓ app identifiers        10 Android packages, 10 iOS bundle ids for 10 platforms
✓ android reference      mobile/android/FeedGateService.kt
✓ ios reference          mobile/ios/ShieldGate.swift
✗ app scaffold           The React Native app is not in this repository yet
```

What *is* real and tested today: the shared gate logic, the native contract
(`mobile/bridge/nativeMirror.js`, covered by `tests/mobile.test.js`), the app
identifier mapping, and the two native reference implementations.

What is missing: the React Native app in `mobile/app`. Once it exists,
`mobile/fastlane/Fastfile` runs unchanged — `fastlane ios beta`,
`fastlane android beta`.

### Deadlines the pipeline enforces

Both are already in force. `tools/deploy/mobile.mjs` checks them against the
clock, so they surface as a failing check rather than a rejection email.

| | Requirement | Since |
| --- | --- | --- |
| Google Play | new submissions target **API 36** (Android 16); existing listings need API 35 to stay available to new users | 31 Aug 2026 (extension to 1 Nov available in Play Console) |
| App Store | builds made with the **iOS 26 SDK**, i.e. **Xcode 26** | 28 Apr 2026 |

The deployment target can still be lower than the build SDK, so supporting
older devices is unaffected.

### Credentials

| Platform | Secrets | Notes |
| --- | --- | --- |
| iOS | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | App Store Connect API key (.p8 contents, base64). No password, no 2FA session to keep alive |
| Android | `PLAY_SERVICE_ACCOUNT_JSON` | Play Console service account with the Release manager role |

### The one thing to plan around

iOS needs the **Family Controls entitlement**, which Apple grants on request.
Without it the Screen Time shield cannot ship, and signing fails. It is a
review, not a checkbox — request it before the app is otherwise ready, not
after. The Fastfile fails early with this message rather than letting signing
fail obscurely.

Android's rollout lane is deliberately staged at 10%: the overlay *is* the
product on Android, and a bad one is best halted before it reaches everyone.

## Reproducibility

`tools/zip.mjs` writes packages with fixed timestamps and sorted entries, so
the same source always produces byte-identical output. `dist/checksums.txt` is
published with each release, which makes "is the artifact in this release the
one that passed CI?" a question with an answer.

```bash
npm run build && sha256sum -c dist/checksums.txt
```
