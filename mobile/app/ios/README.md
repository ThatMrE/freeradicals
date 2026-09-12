# iOS

The app target is complete and wired: `FreeRadicals.xcodeproj` builds, the
native module (`GateBridge.swift` + `GateBridge.m`) is in the app target, and
the entitlements request Family Controls and the App Group.

## Two targets still have to be added in Xcode

`ShieldAction/` and `DeviceActivityMonitor/` hold finished sources, but they
are **not yet targets in the Xcode project**. Adding an app-extension target
rewrites `project.pbxproj` in ways that are not safe to hand-author, so this
step is done once, in Xcode, by a person:

1. **File → New → Target → Shield Configuration Extension**, name it
   `ShieldAction`. Add `ShieldAction/ShieldActionExtension.swift` and
   `ShieldAction/ShieldConfigurationExtension.swift` to it, and set its
   `NSExtensionPrincipalClass` entries accordingly.
2. **File → New → Target → Device Activity Monitor Extension**, name it
   `DeviceActivityMonitor`, and add
   `DeviceActivityMonitor/GateMonitorExtension.swift`.
3. Give **all three targets** the App Group `group.com.freeradicals` and the
   Family Controls entitlement. The extensions read gate state through that
   group; without it the shield never lifts.
4. Add `GateState.swift` to all three targets — it is the shared read model.

`node ../../../tools/deploy/mobile.mjs` checks for these targets and reports
the iOS build as blocked until they exist, so this cannot be forgotten.

## Family Controls

Screen Time APIs need the `com.apple.developer.family-controls` entitlement,
which Apple grants on request. Signing fails without it. Request it before the
app is otherwise ready — it is a review, not a checkbox.

## Why not an overlay, like Android

No third-party app may draw over another on iOS. This is not a limitation to
work around later; it is the platform. Screen Time is the supported path and
the only one that will pass review.
