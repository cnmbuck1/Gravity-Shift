import UIKit
import Capacitor

/// The app's web view. Same as Capacitor's, plus the app's own plugins (Game Center).
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
