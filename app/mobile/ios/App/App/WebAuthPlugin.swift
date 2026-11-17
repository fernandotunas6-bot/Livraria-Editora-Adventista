import Foundation
import AuthenticationServices
import Capacitor

/// Login no navegador do sistema (ASWebAuthenticationSession), para a Google e outros OAuth.
///
/// A Google recusa o login dentro de um WKWebView. O site (app/web/src/lib/nativeAuth.js) pede o
/// endereço de login ao Supabase e chama `WebAuth.start({ url, scheme })`; a folha do sistema abre,
/// a pessoa entra, e o Supabase devolve-a a `ao.livrariaadventista.app://auth/callback`. A folha
/// fecha-se sozinha e o endereço de regresso volta ao site, que cria a sessão. Sem perguntas
/// «Abrir no app?» pelo caminho, que a folha do Safari (plugin Browser) faria.
///
/// A sessão não é privada (`prefersEphemeralWebBrowserSession = false`): quem já tem a conta
/// Google aberta no Safari não volta a escrever a palavra-passe.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              let scheme = call.getString("scheme"), !scheme.isEmpty else {
            call.reject("Endereço de login inválido.", "INVALID")
            return
        }
        DispatchQueue.main.async {
            self.session?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                    call.reject("Cancelado.", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "O login não terminou.", "FAILED", error)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Não foi possível abrir o login.", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
