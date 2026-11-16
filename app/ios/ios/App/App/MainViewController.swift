import UIKit
import Capacitor

/// O ecrã do app: o site dentro do WKWebView do Capacitor, mais os plugins que vivem aqui no app
/// (os dos pacotes npm registam-se sozinhos).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}
