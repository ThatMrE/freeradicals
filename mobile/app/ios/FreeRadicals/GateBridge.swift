import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

/// The native module. Mirrors the Android one method for method, because both
/// implement the same contract in mobile/bridge/nativeMirror.js.
///
/// iOS cannot draw over another app — no third-party app can — so enforcement
/// here is Screen Time: FamilyControls for authorization, a user-driven picker
/// for which apps, ManagedSettings to raise the shield, and DeviceActivity to
/// lower and re-raise it on schedule.
@objc(FreeRadicals)
class GateBridge: NSObject {

    private let store = ManagedSettingsStore()
    private let center = DeviceActivityCenter()
    private static let window = DeviceActivityName("freeradicals.window")

    /// Called from mobile/bridge/nativeMirror.js on every state change.
    @objc(setGateState:)
    func setGateState(_ state: NSDictionary) {
        let status = state["status"] as? String ?? "locked"
        let until = state["unlockedUntil"] as? Double ?? 0

        let next = GateState(status: status, unlockedUntil: until)
        next.save()
        apply(next)
    }

    /// Raise or lower the shield, and schedule the re-raise.
    private func apply(_ state: GateState) {
        guard let selection = SelectionStore.load() else { return }

        if state.isOpen {
            store.shield.applications = nil
            scheduleRelock(at: state.unlockedUntil)
        } else {
            store.shield.applications = selection.applicationTokens
            store.shield.applicationCategories = .specific(selection.categoryTokens)
            center.stopMonitoring([Self.window])
        }
    }

    /// The window must close on time whether or not the app ever runs again.
    private func scheduleRelock(at unlockedUntil: Double) {
        let end = Date(timeIntervalSince1970: unlockedUntil / 1000)
        guard end > Date() else { return }

        let calendar = Calendar.current
        let schedule = DeviceActivitySchedule(
            intervalStart: calendar.dateComponents([.hour, .minute, .second], from: Date()),
            intervalEnd: calendar.dateComponents([.hour, .minute, .second], from: end),
            repeats: false
        )
        try? center.startMonitoring(Self.window, during: schedule)
    }

    @objc(isAuthorized:rejecter:)
    func isAuthorized(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(AuthorizationCenter.shared.authorizationStatus == .approved)
    }

    @objc(requestAuthorization:rejecter:)
    func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                resolve(true)
            } catch {
                // Denial is an ordinary outcome, not an error to throw at JS:
                // the settings screen reports it and offers the button again.
                resolve(false)
            }
        }
    }

    /// iOS never tells the app which apps were chosen — the selection is a set
    /// of opaque tokens. This is why the shared platform registry is only a
    /// *default* to seed the picker with on iOS, and not a list the app applies
    /// itself the way Android does with package names.
    @objc
    func presentAppPicker() {
        DispatchQueue.main.async {
            guard let root = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
                .first?.rootViewController else { return }

            let picker = UIHostingController(rootView: AppPickerView())
            root.present(picker, animated: true)
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool { false }
}

/// The system picker, wrapped so UIKit can present it.
struct AppPickerView: View {
    @State private var selection = SelectionStore.load() ?? FamilyActivitySelection()

    var body: some View {
        FamilyActivityPicker(selection: $selection)
            .onChange(of: selection) { _, new in SelectionStore.save(new) }
    }
}

/// The chosen apps, shared with the extensions through the App Group.
enum SelectionStore {
    private static let key = "selection"

    static func load() -> FamilyActivitySelection? {
        guard let data = GateState.suite.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    static func save(_ selection: FamilyActivitySelection) {
        if let data = try? JSONEncoder().encode(selection) {
            GateState.suite.set(data, forKey: key)
        }
    }
}
