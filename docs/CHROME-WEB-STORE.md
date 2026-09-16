# Shipping to the Chrome Web Store

Everything needed to submit, in the order you will need it. The mechanics of
the upload API live in [RELEASING.md](RELEASING.md); this is the listing, the
policy surface, and the plan.

> **A caveat worth reading first.** The environment this document was written
> in cannot reach `developer.chrome.com`, so every limit and deadline below is
> from knowledge rather than from today's page. The character limits and image
> sizes are asserted by `tests/store.test.js`, so if Google has changed one, the
> fix is to change the number in `store/chrome/listing.json` and let the test
> re-check the copy against it. Treat the policy dates the same way: verify,
> then correct here.

## What is already built

| | |
| --- | --- |
| Package | `dist/freeradicals-chrome-0.1.0.zip` — `npm run build`, byte-reproducible |
| Listing copy | `store/chrome/listing.json` — every field, within limits |
| Screenshots | `store/chrome/screenshots/*.png` — five, 1280×800, of the real extension |
| Small promo tile | `store/chrome/small-tile-440x280.png` |
| Marquee | `store/chrome/marquee-1400x560.png` |
| Privacy policy | <https://free-radicals.netlify.app/privacy.html> — live, and required |
| Upload automation | `npm run deploy:chrome` (v2 API), for updates after the first |

Regenerate the assets with `npm run store:assets`. The screenshots come from
driving the real extension in a real browser, not from a mockup — which is also
the rule the reviewers apply: screenshots must show the product doing what the
listing says.

## Before you can publish anything

1. **A Google account you are willing to keep.** The listing belongs to it
   forever; moving an item between accounts is possible but unpleasant.
2. **Register as a developer and pay the one-time fee** (US $5, non-refundable).
   Until it clears you can upload drafts but not publish.
3. **Verify your contact email**, and set the publisher display name. A name
   that is not obviously you or your organisation invites questions.
4. Optional but worth it: **verify the domain** `free-radicals.netlify.app` in
   Search Console under the same account. It links the listing to the site and
   removes a "who is this" question from the review.

## The submission, field by field

Everything below is in `store/chrome/listing.json`. Paste from there rather
than retyping, so the store and the repository never drift.

- **Package**: upload the ZIP. `manifest.json` must be at its root — it is; the
  build asserts it.
- **Item name**, **summary**, **description**, **category** (Productivity),
  **language**.
- **Icon**: taken from the package's own 128×128.
- **Screenshots**: all five. The first is the one people see, so it is the
  block screen — the product's whole idea in one image.
- **Small promo tile**: needed to be eligible for any placement beyond search.
- **Privacy practices tab**: this is the part that decides how long review
  takes.
  - *Single purpose*: one sentence, in `singlePurpose`.
  - *Permission justifications*: one per permission, plus host permissions.
    Written out in `permissionJustifications`; `tests/store.test.js` fails if
    the manifest asks for a permission the listing does not explain.
  - *Remote code*: **No**. The package contains every line it runs. Answering
    yes here is the single biggest review delay in the store.
  - *Data usage*: nothing is collected. Tick the three certifications.
  - *Privacy policy URL*: must be reachable and must actually describe this
    extension. Ours is rendered from `docs/PRIVACY.md`, so it cannot drift.
- **Distribution**: public, all regions, free.

## What will get this item looked at by a human

Not a reason to change anything — a reason to have the answers ready, and to
expect days rather than hours on the first review.

1. **Ten host permissions, all major social networks.** Broad host access is
   the most scrutinised thing in the store. What helps: the hosts are listed
   one by one with no wildcards, and the justification says exactly what is
   read (the URL) and what is not (the timeline, messages, the account).
2. **`tabs`.** Often assumed to be browsing-history access. The justification
   names the two things it does.
3. **Content scripts on sites with login state.** The reviewer will look for
   anything that touches credentials or page content. `extension/content/probe.js`
   is the one file that runs in the page's own world; it wraps `fetch` and
   `XMLHttpRequest` to notice that a post went out, records nothing, and is
   **off by default**. Say so in the notes to the reviewer, and point at the
   file — it is unminified and short.
4. **No obfuscation.** The store requires readable code. Nothing here is
   minified, which is worth mentioning because it is unusual enough to help.

## Review notes to paste in the submission

> This extension blocks the feed routes of ten named social networks until the
> user publishes a post, then unblocks them for a timed window. It has no
> server, no account, no analytics, and makes no network requests of its own.
> Host permissions are the ten sites it gates, listed individually. The only
> code that runs in a page's own JavaScript context is
> `extension/content/probe.js`, which is disabled by default and, when enabled,
> watches for the network request a successful post makes so the timer can start
> on a real publication. It stores nothing from those requests. Source:
> https://github.com/ThatMrE/freeradicals

## The plan

**Stage 1 — draft, by hand.** The v2 API cannot create a listing, only update
one. So the first submission is manual: upload the ZIP, fill the tabs from
`listing.json`, save as draft, read the whole thing back once. Note the **item
ID** from the URL; every automated update needs it.

**Stage 2 — publish to yourself first.** Set visibility to **Unlisted** and
publish. You get a real install from a real store listing, with none of the
consequences of a public mistake. Install it, run the loop once, look at the
permission prompt Chrome actually shows — that prompt is the first thing a user
sees and it is worth knowing its exact words.

**Stage 3 — public.** Flip visibility to Public and submit. Expect a few hours
if it goes well and several days if a human picks it up; the ten host
permissions make the second more likely. Do not resubmit while it is pending —
that resets the queue position.

**Stage 4 — updates, automated.** Once the item exists, `npm run deploy:chrome`
does upload → publish against the v2 API, with the secrets listed in
RELEASING.md. Bump `version` in `package.json` first; the store rejects a
re-upload of a version it already has. Use `CWS_DEPLOY_PERCENTAGE` for a staged
rollout on anything riskier than a copy change.

**Stage 5 — Edge and Firefox.** Same package for Edge (`npm run deploy:edge`),
a separate build for Firefox (`npm run deploy:firefox`, and `npm run
lint:firefox` first). Do them after Chrome is live, not in parallel: three
review queues at once means three chances to be confused about which feedback
applies to what.

## Rejections to expect, and what each one means

| What they say | What it usually is |
| --- | --- |
| "Requesting but not using permission X" | A permission in the manifest the justification did not cover, or one genuinely no longer used. `npm run preflight` compares the manifest against the code. |
| "Purpose not clear from the listing" | The description leads with mechanism instead of outcome. Ours leads with what happens when you open a feed. |
| "Privacy policy inaccessible" | The URL 404s, redirects oddly, or sits behind a consent wall. Check the live one after every site deploy. |
| "Screenshots do not show the extension" | Placeholder or marketing art in the screenshot slots. Ours are captures of the running extension. |
| "Excessive keywords in the description" | Repeating "focus app productivity blocker" to game search. Ours does not. |

## After it is live

- Watch the item's support tab; the store shows reviews and questions there.
- The extension makes no network calls, so there is no error reporting to
  watch. The only signal you will get is what people write in reviews.
- Keep the version in `package.json`, the tag in git, and the store's version in
  step. `npm run preflight` refuses a package whose version has already shipped.
