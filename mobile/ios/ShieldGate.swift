//  REFERENCE IMPLEMENTATION — the iOS half of the port.
//
//  iOS has no equivalent of an Android overlay: no app may draw over another.
//  Trying to reproduce the extension's approach on iOS does not fail at the
//  polish stage, it fails at the platform stage. The supported mechanism is
//  Screen Time — FamilyControls, ManagedSettings and DeviceActivity — which
//  Apple built for exactly this and which requires the Family Controls
//  entitlement (request it from Apple; it is granted to wellbeing apps).
//
//  The shape of the port:
//
//    locked   -> ManagedSettingsStore.shield.applications = the blocked set.
//                iOS shows a system shield over the app. The shield's action
//                button opens Free Radicals, where the user writes their post.
//    unlocked -> clear the shield, and schedule a DeviceActivity event at
//                `unlockedUntil` that puts it straight back.
//
//  The gate logic is unchanged: core/ decides, this file only applies. The
//  session's absolute `endsAt` is what makes that possible — the schedule below
//  needs a timestamp, not a running timer.

import DeviceActivity
import FamilyControls
import ManagedSettings

/// Written by mobile/bridge/gateController.js through a small native module,
/// into the App Group both the app and the shield extension can read.
struct GateState: Codable {
    let status: String        // "locked" | "pending" | "unlocked"
    let unlockedUntil: Double // epoch ms, 0 when locked

    var isOpen: Bool { Date().timeIntervalSince1970 * 1000 < unlockedUntil }

    static let suite = UserDefaults(suiteName: "group.app.freeradicals")!

    static func load() -> GateState {
        guard let data = suite.data(forKey: "gate"),
              let state = try? JSONDecoder().decode(GateState.self, from: data)
        else { return GateState(status: "locked", unlockedUntil: 0) }
        return state
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) { Self.suite.set(data, forKey: "gate") }
    }
}

enum FeedGate {
    static let store = ManagedSettingsStore()
    static let center = DeviceActivityCenter()
    private static let window = DeviceActivityName("freeradicals.window")

    /// The user picks the apps themselves in a FamilyActivityPicker; iOS never
    /// hands their identities to the app, so the selection is an opaque token.
    /// This is why blockedAppIds() from the shared registry is Android-only —
    /// on iOS the same list is a default the picker is seeded with, not a
    /// set the app can apply directly.
    static func apply(selection: FamilyActivitySelection, state: GateState) {
        if state.isOpen {
            store.shield.applications = nil
            scheduleRelock(at: state.unlockedUntil)
        } else {
            store.shield.applications = selection.applicationTokens
            center.stopMonitoring([window])
        }
    }

    /// Put the shield back when the window ends, without the app being running.
    private static func scheduleRelock(at unlockedUntil: Double) {
        let end = Date(timeIntervalSince1970: unlockedUntil / 1000)
        let cal = Calendar.current
        let schedule = DeviceActivitySchedule(
            intervalStart: cal.dateComponents([.hour, .minute, .second], from: Date()),
            intervalEnd: cal.dateComponents([.hour, .minute, .second], from: end),
            repeats: false
        )
        try? center.startMonitoring(window, during: schedule)
    }
}

/// In the DeviceActivityMonitor extension: the window ended, shield it again.
final class GateMonitor: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        GateState(status: "locked", unlockedUntil: 0).save()
        // The shield extension re-reads GateState and re-applies on next launch.
    }
}

/// In the ShieldActionExtension: the button on the system shield. It cannot
/// show a compose box itself — extensions are limited — so it defers, which
/// sends the user into the app where BlockScreen.jsx is waiting.
final class GateShieldAction: ShieldActionDelegate {
    override func handle(action: ShieldAction,
                         for application: ApplicationToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.defer) // "Write a post" -> opens Free Radicals
        default:
            completionHandler(.close)
        }
    }
}
