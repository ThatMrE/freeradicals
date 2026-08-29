# Porting the gate to mobile

The Chrome extension is one shell over `core/`. A mobile app is another. This
directory holds the parts of that second shell that already exist as real
JavaScript, plus reference implementations in Kotlin and Swift for the parts
that must be native.

## What ports for free

`core/` decides everything: whether a post counts, when the window opens, how
long it lasts, when it slams shut, whether a repeat is allowed. It imports
nothing — no DOM, no `chrome.*`, no React Native. `tests/portability.test.js`
fails the build if that ever stops being true.

So the mobile app reuses, unchanged:

| Shared piece | What it gives the app |
| --- | --- |
| `core/gate.js` | the state machine and every rule |
| `core/session.js` | `locked` / `pending` / `unlocked` and the countdown |
| `core/journal.js` | what you wrote, streaks, repeat detection |
| `core/platforms.js` | app package names, bundle ids, compose deep links |
| `core/quotes.js`, `core/format.js` | the same copy and the same `4:31` |

And this directory adds:

| File | Role |
| --- | --- |
| `bridge/storage.js` | `core/storage.js` on AsyncStorage |
| `bridge/gateController.js` | the app's single gate owner + native mirror |
| `bridge/useGate.js` | React hook — `snapshot`, `submitPost`, `lockNow` |
| `bridge/BlockScreen.jsx` | the block screen, translated to RN primitives |
| `bridge/appIds.js` | registry → package names / bundle ids |

## The one thing native code needs

`setGateState({ status, unlockedUntil, blockedApps })`.

That is the entire native API surface, and it works because a session stores an
absolute `endsAt` timestamp rather than a running countdown. Native code that
has to block apps while JavaScript is asleep — or not running at all — never
runs gate logic and never keeps a timer. It compares one number to the clock.

```js
import { createMobileGate } from './bridge/gateController.js';
import { NativeModules } from 'react-native';

const gate = createMobileGate({ native: NativeModules.FreeRadicals, os: 'android' });
```

## Android

Reference: `android/GateBridgeModule.kt`, `android/FeedGateService.kt`.

Android can genuinely do what the extension does — draw over another app.

- **`PACKAGE_USAGE_STATS`** to see which app is in the foreground.
- **`SYSTEM_ALERT_WINDOW`** to draw the block screen over it.
- A **foreground service** polling once a second, so Android does not kill it.

Use `UsageStatsManager`, not an `AccessibilityService`. Accessibility APIs read
the foreground app more precisely and land the overlay a beat sooner, but Play
policy restricts them to accessibility purposes and wellbeing apps have been
pulled for exactly this pattern. The cost of doing it the compliant way is that
the overlay appears shortly after the app opens instead of before its first
frame.

The overlay hosts `BlockScreen.jsx` in a `TYPE_APPLICATION_OVERLAY` window. It
must be focusable — the user has to be able to type in it.

## iOS

Reference: `ios/ShieldGate.swift`.

**iOS cannot do the overlay approach, at all.** No app may draw over another.
This is not a polish problem to solve later; it is the platform. Do not plan
around it.

The supported path is Screen Time, which Apple built for this:

- **FamilyControls** — the user picks the apps in a `FamilyActivityPicker`. iOS
  never tells your app what they picked; you get opaque tokens. This is why
  `blockedAppIds()` is Android-only. On iOS the shared registry is the *default
  selection you seed the picker with*, not a list you can apply.
- **ManagedSettings** — `store.shield.applications = tokens` puts a system
  shield over those apps. Clearing it opens them.
- **DeviceActivity** — schedules the re-shield at `unlockedUntil`, so the window
  closes on time whether or not the app ever runs again.
- **ShieldActionExtension** — the button on the shield. It cannot host a compose
  box (extensions are too limited), so it returns `.defer`, which sends the user
  into Free Radicals where `BlockScreen.jsx` is waiting.

Shipping this requires the **Family Controls entitlement**, requested from
Apple. Budget for that in the timeline; it is a review, not a checkbox.

## What the port looks like end to end

1. User opens Instagram.
2. Native watcher sees the package (Android) or the shield is already up (iOS).
3. `GateState.isOpen()` is false → block screen.
4. User writes; `submitPost()` runs the same `core/gate.js` validation the
   extension runs, and appends to the same journal shape.
5. `attachNativeMirror` pushes `unlockedUntil = now + 5min` to native storage.
6. Native clears the block. Instagram opens.
7. At `unlockedUntil` the Android poll blocks again; iOS's `DeviceActivity`
   schedule re-applies the shield. Either way the next window costs another post.

## Honest limits

Same as the extension, plus:

- Android's poll interval means a second or two of feed before the overlay lands.
- iOS shields the whole app, not the feed inside it. The finer distinction the
  extension makes — block the home feed, leave DMs and the profile usable —
  cannot be made on iOS by any third-party app.
- Both platforms let a determined user turn the whole thing off in Settings.
  That is by design; this is a speed bump aimed at habit, not a lock aimed at
  an adversary.
