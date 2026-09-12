import Foundation

/// The gate state, as native code sees it.
///
/// Written by JavaScript through `GateBridge`, read by the app and by both
/// Screen Time extensions — which run in their own processes, when no
/// JavaScript is alive. The App Group is what makes that sharing possible.
///
/// An open window is an absolute timestamp rather than a duration, so a reader
/// needs no clock of its own and no coordination: compare and act.
struct GateState: Codable {
    let status: String        // "locked" | "pending" | "unlocked"
    let unlockedUntil: Double // epoch milliseconds; 0 whenever the feed is shut

    var isOpen: Bool { Date().timeIntervalSince1970 * 1000 < unlockedUntil }

    static let appGroup = "group.com.freeradicals"
    static let key = "gate"

    static var suite: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    static func load() -> GateState {
        guard let data = suite.data(forKey: key),
              let state = try? JSONDecoder().decode(GateState.self, from: data)
        else { return GateState(status: "locked", unlockedUntil: 0) }
        return state
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            Self.suite.set(data, forKey: Self.key)
        }
    }
}
