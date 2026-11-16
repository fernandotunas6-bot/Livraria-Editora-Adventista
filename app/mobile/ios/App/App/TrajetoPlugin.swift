import Foundation
import CoreLocation
import UserNotifications
import Capacitor

/// O trajeto de quem entrega, com o ecrã apagado ou o app em segundo plano (docs/TRAJETO_GPS.md).
///
/// No site, a posição só se manda com a página aberta: o JavaScript pára quando o ecrã se apaga.
/// Aqui é o iPhone que lê o GPS e manda a posição ao Supabase, pela mesma função que o site usa
/// (`delivery_share_position`), com a sessão de quem entrega. Começa sempre com o app à frente
/// (o botão «Partilhar»), por isso basta a permissão «Durante a utilização»: o iOS deixa continuar
/// em segundo plano e mostra o indicador azul no topo do ecrã.
///
/// A sessão do Supabase dura uma hora e renova-se no site, com o app à frente
/// (`actualizarSessao`). Se caducar em segundo plano, o envio pára e o iPhone avisa para abrir o
/// app. A partilha acaba sozinha quando o servidor diz que a encomenda já não vai a caminho.
///
/// As regras de quando mandar são as do site (app/web/src/lib/deliveryTracking.js):
/// de 10 em 10 segundos quando anda pelo menos 25 m, ou de 30 em 30 segundos parado.
@objc(TrajetoPlugin)
public class TrajetoPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "TrajetoPlugin"
    public let jsName = "Trajeto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "iniciar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "actualizarSessao", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "parar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "estado", returnType: CAPPluginReturnPromise)
    ]

    private static let enviarAndandoCada: TimeInterval = 10
    private static let enviarParadoCada: TimeInterval = 30
    private static let distanciaMinima: CLLocationDistance = 25

    private let gestor = CLLocationManager()
    private var encomenda: String?
    private var endereco: URL?
    private var chave = ""
    private var sessao = ""
    private var ultimaLeitura: CLLocation?
    private var ultimoEnvio: (posicao: CLLocation, quando: Date)?
    private var aEnviar = false
    private var avisouSessao = false
    private var temporizador: Timer?

    override public func load() {
        gestor.delegate = self
        gestor.desiredAccuracy = kCLLocationAccuracyBest
        gestor.distanceFilter = 5
        gestor.activityType = .otherNavigation
        gestor.pausesLocationUpdatesAutomatically = false
    }

    @objc func iniciar(_ call: CAPPluginCall) {
        guard let encomenda = call.getString("encomenda"), !encomenda.isEmpty, encomenda.count <= 64,
              let supabase = call.getString("supabaseUrl"), let base = URL(string: supabase), base.scheme == "https",
              let chave = call.getString("chave"), !chave.isEmpty,
              let sessao = call.getString("sessao"), !sessao.isEmpty else {
            call.reject("Pedido de partilha inválido.", "INVALID")
            return
        }
        DispatchQueue.main.async {
            let permissao = self.gestor.authorizationStatus
            if permissao == .denied || permissao == .restricted {
                call.reject("A localização está desligada para a app. Ligue-a em Definições → Livraria Adventista → Localização.", "SEM_PERMISSAO")
                return
            }
            self.encomenda = encomenda
            self.endereco = base.appendingPathComponent("rest/v1/rpc/delivery_share_position")
            self.chave = chave
            self.sessao = sessao
            self.ultimaLeitura = nil
            self.ultimoEnvio = nil
            self.avisouSessao = false
            if permissao == .notDetermined { self.gestor.requestWhenInUseAuthorization() }
            self.gestor.allowsBackgroundLocationUpdates = true
            self.gestor.showsBackgroundLocationIndicator = true
            self.gestor.startUpdatingLocation()
            self.temporizador?.invalidate()
            self.temporizador = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                self?.enviarSeParado()
            }
            call.resolve()
        }
    }

    /// O site renovou a sessão (de hora a hora, com o app à frente): os próximos envios usam-na.
    @objc func actualizarSessao(_ call: CAPPluginCall) {
        guard let sessao = call.getString("sessao"), !sessao.isEmpty else {
            call.reject("Sessão inválida.", "INVALID")
            return
        }
        DispatchQueue.main.async {
            self.sessao = sessao
            self.avisouSessao = false
            call.resolve()
        }
    }

    @objc func parar(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pararTudo()
            call.resolve()
        }
    }

    /// Para o site saber, ao voltar à página da entrega, se a partilha continua.
    @objc func estado(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var resposta: [String: Any] = ["activa": self.encomenda != nil]
            if let encomenda = self.encomenda { resposta["encomenda"] = encomenda }
            if let envio = self.ultimoEnvio { resposta["enviadoEm"] = envio.quando.timeIntervalSince1970 * 1000 }
            call.resolve(resposta)
        }
    }

    private func pararTudo() {
        gestor.stopUpdatingLocation()
        gestor.allowsBackgroundLocationUpdates = false
        temporizador?.invalidate()
        temporizador = nil
        encomenda = nil
        endereco = nil
        sessao = ""
        ultimaLeitura = nil
        ultimoEnvio = nil
    }

    // MARK: - GPS

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard encomenda != nil, let leitura = locations.last, leitura.horizontalAccuracy >= 0 else { return }
        ultimaLeitura = leitura
        notifyListeners("leitura", data: [
            "lat": leitura.coordinate.latitude,
            "lng": leitura.coordinate.longitude,
            "accuracy": leitura.horizontalAccuracy
        ])
        guard let ultimo = ultimoEnvio else {
            enviar(leitura)
            return
        }
        let passou = Date().timeIntervalSince(ultimo.quando)
        if passou < Self.enviarAndandoCada { return }
        if leitura.distance(from: ultimo.posicao) >= Self.distanciaMinima || passou >= Self.enviarParadoCada {
            enviar(leitura)
        }
    }

    /// Parado, o GPS não manda leituras novas: de 30 em 30 segundos, a última outra vez (o cliente
    /// vê que quem entrega continua ali, e não "última posição há 10 min").
    private func enviarSeParado() {
        guard encomenda != nil, let leitura = ultimaLeitura, let ultimo = ultimoEnvio else { return }
        if Date().timeIntervalSince(ultimo.quando) >= Self.enviarParadoCada { enviar(leitura) }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard encomenda != nil else { return }
        notifyListeners("erro", data: ["codigo": "GPS", "mensagem": "Sem sinal de GPS: tente ao ar livre."])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard encomenda != nil else { return }
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            pararTudo()
            notifyListeners("terminou", data: ["mensagem": "A localização foi desligada para a app: a partilha parou."])
        }
    }

    // MARK: - Envio

    private func enviar(_ leitura: CLLocation) {
        guard !aEnviar, let encomenda = encomenda, let endereco = endereco, !sessao.isEmpty else { return }
        aEnviar = true

        var corpo: [String: Any] = [
            "p_order_id": encomenda,
            "p_lat": leitura.coordinate.latitude,
            "p_lng": leitura.coordinate.longitude,
            "p_accuracy": leitura.horizontalAccuracy
        ]
        if leitura.course >= 0 { corpo["p_heading"] = leitura.course }
        if leitura.speed >= 0 { corpo["p_speed"] = leitura.speed }

        var pedido = URLRequest(url: endereco, timeoutInterval: 20)
        pedido.httpMethod = "POST"
        pedido.setValue("application/json", forHTTPHeaderField: "Content-Type")
        pedido.setValue(chave, forHTTPHeaderField: "apikey")
        pedido.setValue("Bearer \(sessao)", forHTTPHeaderField: "Authorization")
        pedido.httpBody = try? JSONSerialization.data(withJSONObject: corpo)

        URLSession.shared.dataTask(with: pedido) { [weak self] dados, resposta, erro in
            DispatchQueue.main.async {
                self?.recebeu(leitura: leitura, encomenda: encomenda, dados: dados, resposta: resposta, erro: erro)
            }
        }.resume()
    }

    private func recebeu(leitura: CLLocation, encomenda: String, dados: Data?, resposta: URLResponse?, erro: Error?) {
        aEnviar = false
        // Entretanto parou, ou começou outra entrega: esta resposta já não interessa.
        guard self.encomenda == encomenda else { return }
        let codigo = (resposta as? HTTPURLResponse)?.statusCode ?? 0

        if erro == nil && (200...299).contains(codigo) {
            ultimoEnvio = (leitura, Date())
            notifyListeners("enviado", data: ["quando": Date().timeIntervalSince1970 * 1000])
            return
        }

        var mensagem = ""
        if let dados = dados, let json = try? JSONSerialization.jsonObject(with: dados) as? [String: Any] {
            mensagem = (json["message"] as? String) ?? ""
        }

        if codigo == 401 || mensagem.localizedCaseInsensitiveContains("JWT") {
            // A sessão caducou em segundo plano: espera pela renovação do site, e avisa uma vez.
            notifyListeners("erro", data: ["codigo": "SESSAO", "mensagem": "A sessão caducou: abra a app para continuar a partilhar."])
            avisarSessaoCaducada()
            return
        }

        let terminou = ["terminou", "não está a caminho", "Só quem entrega", "não tem entrega"]
            .contains { mensagem.localizedCaseInsensitiveContains($0) }
        if terminou {
            pararTudo()
            notifyListeners("terminou", data: ["mensagem": mensagem])
            return
        }

        // Sem rede ou um erro passageiro: tenta-se com a próxima leitura.
        notifyListeners("erro", data: ["codigo": "ENVIO", "mensagem": mensagem.isEmpty ? "Sem rede: a posição segue quando voltar." : mensagem])
    }

    private func avisarSessaoCaducada() {
        guard !avisouSessao else { return }
        avisouSessao = true
        let conteudo = UNMutableNotificationContent()
        conteudo.title = "A partilha da localização parou"
        conteudo.body = "Abra a app para o cliente continuar a ver o caminho da entrega."
        conteudo.sound = .default
        let pedido = UNNotificationRequest(identifier: "livraria-trajeto-sessao", content: conteudo, trigger: nil)
        UNUserNotificationCenter.current().add(pedido) { _ in }
    }
}
