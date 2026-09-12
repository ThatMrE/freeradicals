import DeviceActivity
import ManagedSettings

/// Closes the window on time, with nothing else running.
///
/// This is the piece that makes the iOS port honest: the timer does not depend
/// on the app being alive, or on JavaScript, or on the user coming back. iOS
/// wakes this extension at the scheduled end and the shield goes straight back
/// up.
class GateMonitorExtension: DeviceActivityMonitor {

    private let store = ManagedSettingsStore()

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)

        GateState(status: "locked", unlockedUntil: 0).save()

        if let selection = SelectionStore.load() {
            store.shield.applications = selection.applicationTokens
            store.shield.applicationCategories = .specific(selection.categoryTokens)
        }
    }
}
