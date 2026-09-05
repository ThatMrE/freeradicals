import ManagedSettings
import ManagedSettingsUI
import UIKit

/// What the shield looks like. It should read like the extension's block
/// screen, because it is the same product saying the same thing.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func configuration() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 0.043, green: 0.051, blue: 0.071, alpha: 1),
            icon: nil,
            title: ShieldConfiguration.Label(
                text: "Post before you scroll.",
                color: .white
            ),
            subtitle: ShieldConfiguration.Label(
                text: "Write something worth publishing and this opens for a while. "
                    + "The longer the post, the longer the window.",
                color: UIColor(red: 0.659, green: 0.690, blue: 0.761, alpha: 1)
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "Write a post",
                color: UIColor(red: 0.043, green: 0.051, blue: 0.071, alpha: 1)
            ),
            primaryButtonBackgroundColor: UIColor(red: 0.486, green: 0.549, blue: 1, alpha: 1),
            secondaryButtonLabel: ShieldConfiguration.Label(
                text: "Not now",
                color: UIColor(red: 0.545, green: 0.576, blue: 0.652, alpha: 1)
            )
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        configuration()
    }

    override func configuration(shielding application: Application,
                                in category: ActivityCategory) -> ShieldConfiguration {
        configuration()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        configuration()
    }

    override func configuration(shielding webDomain: WebDomain,
                                in category: ActivityCategory) -> ShieldConfiguration {
        configuration()
    }
}
