import ManagedSettings

/// The button on the system shield.
///
/// An extension cannot host a compose box — it is too limited, deliberately —
/// so the primary button defers, which sends the user into Free Radicals where
/// the block screen is waiting. That is the whole flow on iOS: shield, defer,
/// write, publish, shield lowers.
class ShieldActionExtension: ShieldActionDelegate {

    override func handle(action: ShieldAction,
                         for application: ApplicationToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.defer)
        case .secondaryButtonPressed:
            completionHandler(.close)
        @unknown default:
            completionHandler(.close)
        }
    }

    override func handle(action: ShieldAction,
                         for category: ActivityCategoryToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        handle(action: action, for: ApplicationToken?.none ?? unsafeBitCast(category, to: ApplicationToken.self),
               completionHandler: completionHandler)
    }
}
