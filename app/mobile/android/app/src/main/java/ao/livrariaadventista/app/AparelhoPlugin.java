package ao.livrariaadventista.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * O mesmo plugin «Aparelho» do iPhone (AparelhoPlugin.swift), na versão Android.
 *
 * - numeroNoIcone: no Android o número no ícone é o das notificações por ler, que o sistema conta
 *   sozinho; aqui não há nada a fazer.
 * - pushConfigurado: as notificações do Android vêm pelo Firebase, que só existe se o build levou o
 *   google-services.json (segredo GOOGLE_SERVICES_JSON no GitHub, docs/APPS.md). Sem ele, pedir
 *   o registo derrubava o app; o site pergunta primeiro (lib/pushNotifications.js).
 */
@CapacitorPlugin(name = "Aparelho")
public class AparelhoPlugin extends Plugin {

    @PluginMethod
    public void numeroNoIcone(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void pushConfigurado(PluginCall call) {
        // O plugin do google-services gera este recurso; sem o ficheiro, ele não existe.
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject resposta = new JSObject();
        resposta.put("configurado", id != 0);
        call.resolve(resposta);
    }
}
