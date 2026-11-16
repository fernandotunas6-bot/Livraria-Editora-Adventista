import Foundation
import UIKit
import UserNotifications
import Capacitor

/// O que o site pede ao iPhone e que não tem plugin oficial: o número no ícone do app.
///
/// O site (app/web/src/components/NativeAppBridge.jsx) põe no ícone os avisos por ler da conta;
/// com o app fechado, é o servidor que o põe em cada notificação (supabase/functions/app/apns.ts).
@objc(AparelhoPlugin)
public class AparelhoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AparelhoPlugin"
    public let jsName = "Aparelho"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "numeroNoIcone", returnType: CAPPluginReturnPromise)
    ]

    @objc func numeroNoIcone(_ call: CAPPluginCall) {
        let numero = max(0, min(call.getInt("numero") ?? 0, 999))
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(numero) { error in
                if let error = error {
                    call.reject(error.localizedDescription, "FAILED", error)
                } else {
                    call.resolve()
                }
            }
        } else {
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = numero
                call.resolve()
            }
        }
    }
}
