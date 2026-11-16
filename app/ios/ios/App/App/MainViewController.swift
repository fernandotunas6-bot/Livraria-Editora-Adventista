import UIKit
import Capacitor

/// O ecrã do app: o site dentro do WKWebView do Capacitor, mais os plugins que vivem aqui no app
/// (os dos pacotes npm registam-se sozinhos) e os gestos de um app do iPhone.
class MainViewController: CAPBridgeViewController {
    private let puxarParaActualizar = UIRefreshControl()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(AparelhoPlugin())

        guard let webView = webView else { return }

        // Deslizar do bordo esquerdo volta à página anterior, como no Safari. As páginas do site
        // entram no histórico do WKWebView (React Router), por isso voltar é voltar no site.
        webView.allowsBackForwardNavigationGestures = true

        // Puxar para actualizar. O Capacitor tira o «elástico» ao WKWebView; sem ele não há puxar.
        webView.scrollView.bounces = true
        puxarParaActualizar.addTarget(self, action: #selector(puxou), for: .valueChanged)
        webView.scrollView.refreshControl = puxarParaActualizar
    }

    /// O site decide o que é actualizar (NativeAppBridge.jsx): recarrega a página, ou avisa que há
    /// alterações por gravar e não perde nada. A página sem rede tenta outra vez.
    @objc private func puxou() {
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('livraria:puxar-para-actualizar'))") { _, _ in }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.puxarParaActualizar.endRefreshing()
        }
    }
}
