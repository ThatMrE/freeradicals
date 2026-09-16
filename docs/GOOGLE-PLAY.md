# Shipping to Google Play

Everything needed to submit the Android app, in the order you will need it.

> **The same caveat as the Chrome document.** This environment cannot reach
> `support.google.com` or `play.google.com`, so the thresholds below are from
> knowledge, not from today's pages. Two in particular change and are worth
> checking before you start: the **testing requirement for personal developer
> accounts** (a minimum number of testers opted in continuously for a number of
> days before production access) and the **target API level** deadline. The
> second one this repository already tracks in `mobile/release.config.json`,
> where `tools/deploy/mobile.mjs` turns it into a failing check rather than a
> rejection email.

## Where the app actually is

| | |
| --- | --- |
| Compiles | Yes — `.github/workflows/android.yml`, every push |
| Sideloadable APK | Yes — arm only, debug-signed, published as the `android-latest` pre-release |
| Play bundle | Yes — `app-release.aab`, built in the same job, **debug-signed** |
| Run on a device | **No.** Nothing here has been installed on a phone |
| iOS | Not built at all; two Screen Time extension targets still need Xcode |

That third row is the one that matters for a submission. A build is not a
working app, and Play's reviewers install it. **Before you upload anything
public, run it on a real device** and grant both special permissions by hand.
The app tells you which are missing on its own settings screen — that screen is
also the first thing a reviewer will see, so it had better be honest, and it is.

## Before you can publish anything

1. **A Google account, and a decision: personal or organisation.** An
   organisation account needs a D-U-N-S number and takes longer to verify; a
   personal account is faster but carries the closed-testing requirement before
   production. Pick deliberately — changing it later means a new account.
2. **Pay the one-time registration fee** (US $25).
3. **Identity verification**: legal name, address, phone, and a document. This
   can take days. Start it before you need it.
4. **Set up Play App Signing and an upload key.** Generate an upload keystore
   that lives nowhere near this repository:
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
   Base64 it into a CI secret. `tests/app.test.js` asserts no `.jks`, `.p8`,
   `.p12` or `.mobileprovision` is ever committed — a key committed once is
   committed forever, and the only fix is a new key.

   The debug keystore in the repository is the standard React Native one with
   the public password `android`. It signs local builds and the sideload APK. It
   must never sign an upload.

## The submission, field by field

Everything is in `store/play/listing.json`; paste from there.

- **App name** (`Free Radicals`), **short description**, **full description**.
- **Category** Productivity, plus tags.
- **Icon** `store/play/icon-512.png` — the same analytic mark as the launcher
  icon, at 512, composited onto the product's own background because Play does
  not want transparency showing through.
- **Feature graphic** `store/play/feature-graphic-1024x500.png`.
- **Phone screenshots** — four, portrait, 1080×2340, rendered from the app's own
  screens. Play wants at least two; more is better, and the first two are what
  show in search results.
- **Privacy policy URL** — required, and checked. Ours is live.
- **Contact details** — email is mandatory and public.

Then the forms, which is where the real work is:

- **Data safety.** No data collected, none shared. The posts the user writes
  never leave the device, and under Play's definitions that is not collection.
  Say so; do not leave the section blank.
- **Content rating** questionnaire (IARC). No violence, no user-to-user
  communication, no purchases. Expect Everyone / PEGI 3.
- **Target audience**: 18 and over, which keeps the app outside the Families
  policy and its extra review surface.
- **Ads**: none.
- **Government / financial / health declarations**: none apply.

## The three things a reviewer will stop on

This app asks for exactly the permissions that malware asks for. That is not a
reason to hide them; it is a reason to explain them first, in the listing, on
the app's own first screen, and in the review notes.

1. **`PACKAGE_USAGE_STATS` (usage access).** Reading which app is in front is
   the core feature — there is no gate without it. Nothing about usage is
   stored or sent. The user grants it by hand in Settings, and the app links
   them there rather than pretending it can prompt.
2. **`SYSTEM_ALERT_WINDOW` (display over other apps).** The block screen is the
   app's own, clearly labelled, never imitates a system dialog or another app,
   appears only for apps the user chose, and can be left. Play's Device and
   Network Abuse policy is aimed at overlays that deceive or trap; the way to
   stay clear of it is to be obvious, which this screen is.
3. **`FOREGROUND_SERVICE_SPECIAL_USE`.** No standard foreground service type
   describes "watch the foreground app so a feed can be gated". The manifest
   declares `specialUse` with `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` spelling out
   the reason, and Play reviews that text by hand. Answer the console's question
   in the same words — divergence between the manifest and the console answer is
   itself a flag.

Worth stating explicitly in the notes: **the app uses no accessibility
service.** Apps that cover other apps usually do, and reviewers look for it.

## Review notes to paste in the submission

> Free Radicals blocks social feed apps the user has selected until they write
> and publish a post, then unblocks them for a timed window.
>
> Usage access is used solely to read which app is currently in the foreground
> and compare it against the user's own list; no usage history is stored or
> transmitted, and the app never enumerates installed packages
> (`QUERY_ALL_PACKAGES` is not requested). Display-over-other-apps is used to
> show the app's own, clearly labelled block screen over a selected app. The
> foreground service keeps that watcher alive and declares `specialUse` because
> no standard type fits; its subtype property explains the same thing.
>
> No accessibility service is used. There is no account, no server, no ads and
> no analytics; nothing the user writes leaves the device. Source:
> https://github.com/ThatMrE/freeradicals

## The plan

**Stage 1 — install it yourself.** Sideload the APK from the `android-latest`
pre-release onto a real phone. Grant both permissions. Open Instagram. This is
the step that turns "it compiles" into "it works", and nothing below is worth
doing before it passes.

**Stage 2 — internal testing.** Create the app in the console, upload the AAB
signed with the real upload key, and push it to the internal track. Up to 100
testers, available in minutes, no review wait. Fix what the first real
installations show.

**Stage 3 — closed testing.** For a personal developer account this is not
optional: production access requires a closed test with a minimum number of
testers opted in continuously for a set period. **Check the current numbers
before you start counting** — they have changed more than once. Recruit more
testers than the minimum; people opt out, and the clock is unforgiving.

**Stage 4 — production, staged.** Roll out to 10%. Watch Android vitals for
crash-free sessions and ANRs — an app running a foreground service and drawing
over other apps is exactly the shape that shows up in ANR reports. Widen when
it holds.

**Stage 5 — automation.** `mobile/fastlane/Fastfile` has the lanes; they need a
Play Console service account JSON with Release Manager scope, as a CI secret.
Automate the internal track first and leave production promotion manual for a
while: an automatic push to production is a fine way to ship a bad build to
everyone at three in the morning.

## Rejections to expect, and what each one means

| What they say | What it usually is |
| --- | --- |
| "Permission not justified" | The console answer for `specialUse` or usage access does not match the manifest, or is vaguer than it. |
| "Device and Network Abuse" | The overlay looked deceptive, or the app was hard to stop. Show the block screen's label and its exit in the screenshots. |
| "Data safety form inaccurate" | Something in the app looked like collection. Ours makes no network requests at all, which is easy to demonstrate. |
| "Target API level" | The deadline moved. `mobile/release.config.json` carries the date; `npm run preflight:mobile` checks it. |
| "Broken functionality" | The reviewer did not grant the special permissions, so nothing blocked. The first screen must make the two grants obvious — it does, and that is why it matters that it is the first screen. |

## What is still missing before a real launch

- **A device run.** Still the top of the list.
- **A real upload key**, and the CI secret to go with it.
- **Testers**, recruited before the closed-test clock starts.
- **iOS**, which is a different document and needs the two Screen Time
  extension targets added in Xcode first. See `mobile/app/ios/README.md`.
