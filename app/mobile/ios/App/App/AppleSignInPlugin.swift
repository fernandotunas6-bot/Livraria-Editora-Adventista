import Foundation
import AuthenticationServices
import Capacitor

/// «Iniciar sessão com a Apple» com a folha nativa do iOS.
///
/// O site chama `AppleSignIn.authorize({ nonce })` (app/web/src/lib/nativeApp.js), com o nonce já
/// cifrado em SHA-256; o site guarda o nonce original e entrega-o ao Supabase junto com o
/// `identityToken` (`signInWithIdToken`). O plugin é registado em MainViewController.swift.
///
/// Fica aqui no app, e não num pacote da comunidade, porque os pacotes que existem ainda pedem o
/// Capacitor 7 no Swift Package Manager.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    /// O pedido em curso: a resposta da Apple chega mais tarde, pelo delegate.
    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("Falta o nonce.", "INVALID")
            return
        }
        DispatchQueue.main.async {
            self.pendingCall?.reject("Outro pedido começou.", "CANCELLED")
            self.pendingCall = call

            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = pendingCall else { return }
        pendingCall = nil

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("A Apple não devolveu o token de identidade.", "FAILED")
            return
        }

        var result: [String: Any] = [
            "identityToken": identityToken,
            "user": credential.user
        ]
        // O nome e o email só vêm na primeira vez que a pessoa entra com a Apple neste app.
        if let email = credential.email { result["email"] = email }
        if let givenName = credential.fullName?.givenName { result["givenName"] = givenName }
        if let familyName = credential.fullName?.familyName { result["familyName"] = familyName }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil

        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Cancelado.", "CANCELLED")
        } else {
            call.reject(error.localizedDescription, "FAILED", error)
        }
    }
}
