# The mobile app

The Chrome extension is one shell over `core/`. This is the other one: a React
Native app (`app/`) whose Android half puts the block screen over a feed app,
and whose iOS half raises a Screen Time shield.

```
bridge/   the shared JavaScript: storage adapter, gate controller, React hook,
          block screen, native contract
app/      the React Native app — src/, android/, ios/
fastlane/ the release lanes for both stores
```

**Neither platform has been built here.** There is no Android SDK and no Xcode
in this environment, so `tests/app.test.js` covers what can be checked without
compiling — that every source parses, every import resolves, and every native
method JavaScript calls actually exists and is exported on that platform. The
first `npm run android` is still the first real test.

## What ports for free

`core/` decides everything: whether a post counts, when the window opens, how
long it lasts, when it slams shut, whether a repeat is allowed. It imports
nothing — no DOM, no `chrome.*`, no React Native. `tests/portability.test.js`
fails the build if that ever stops being true.

So the mobile app reuses, unchanged:

| Shared piece | What it gives the app |
| --- | --- |
| `core/gate.js` | the state machine and every rule |
| `core/duration.js` | how long a post buys — the earned window |
| `core/session.js` | `locked` / `pending` / `unlocked` and the countdown |
| `core/journal.js` | what you wrote, streaks, repeat detection |
| `core/platforms.js` | app package names, bundle ids, compose deep links |
| `core/quotes.js`, `core/format.js` | the same copy and the same `4:31` |

And this directory adds:

| File | Role |
| --- | --- |
| `bridge/storage.js` | `core/storage.js` on AsyncStorage |
| `bridge/gateController.js` | the app's single gate owner |
| `bridge/nativeMirror.js` | the native contract — one call, three fields |
| `bridge/useGate.js` | React hook — `snapshot`, `submitPost`, `lockNow` |
| `bridge/BlockScreen.jsx` | the block screen, translated to RN primitives |
| `bridge/appIds.js` | registry → package names / bundle ids |
| `app/src/native.js` | the JS side of the bridge, with per-platform guards |
| `app/src/screens/` | home, write, settings |

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

Metro has to be told about this: `core/` and `bridge/` live outside `app/`, so
`app/metro.config.js` sets `watchFolders` to the repository root. Without it
the app cannot import the gate at all.

## Android

`app/android/app/src/main/java/com/freeradicals/`

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

`FeedGateService` polls for the foreground app and launches `BlockActivity` —
a normal React Native activity rendering the `FreeRadicalsBlock` surface — over
it. Launching an activity rather than managing a raw overlay window is what
`SYSTEM_ALERT_WINDOW` is really buying here: an activity gets a real React
surface, a keyboard that works, and a back stack the system understands,
none of which a hand-managed `View` gets for free. Back is overridden to leave
rather than dismiss, so the block screen is not merely a suggestion.

## iOS

`app/ios/` — see `app/ios/README.md` for the one step that needs Xcode.

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

**One step still needs Xcode.** The Screen Time shield and the activity monitor
are app *extensions*, and adding an extension target rewrites `project.pbxproj`
in ways that cannot be hand-authored safely. Their sources are written
(`app/ios/ShieldAction/`, `app/ios/DeviceActivityMonitor/`); the targets are
not. `node tools/deploy/mobile.mjs` reports the iOS build as blocked until they
exist, so it cannot be quietly forgotten.

## Running it

```bash
cd mobile/app
npm install
npm run android      # needs Android Studio + an emulator or device
npm run ios          # needs Xcode 26 and `npm run pods` first
```

On Android, grant **usage access** and **display over other apps** in Settings —
the app's settings screen links straight to both and reports their real state.
Nothing is blocked until they are granted, and the settings screen says so
rather than failing silently.

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

- **Nothing here has been compiled.** The tests cover syntax, imports and the
  native contract; they cannot cover whether it builds.
- Android's poll interval means a second or two of feed before the overlay lands.
- iOS shields the whole app, not the feed inside it. The finer distinction the
  extension makes — block the home feed, leave DMs and the profile usable —
  cannot be made on iOS by any third-party app.
- Both platforms let a determined user turn the whole thing off in Settings.
  That is by design; this is a speed bump aimed at habit, not a lock aimed at
  an adversary.
