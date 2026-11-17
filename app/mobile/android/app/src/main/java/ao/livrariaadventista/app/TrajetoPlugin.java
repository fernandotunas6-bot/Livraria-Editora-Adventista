package ao.livrariaadventista.app;

import android.Manifest;
import android.content.Context;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * O plugin «Trajeto» do Android: o mesmo do iPhone (TrajetoPlugin.swift), para o site
 * (app/web/src/lib/trajetoNativo.js). Quem lê o GPS e manda a posição é o TrajetoService.java;
 * aqui pede-se a permissão, começa-se e pára-se a partilha, e os acontecimentos do serviço seguem
 * para o site: `leitura`, `enviado`, `erro` e `terminou`.
 */
@CapacitorPlugin(
    name = "Trajeto",
    permissions = {
        // No Android 12 ou mais recente, pedir a precisa sozinha não faz nada: pedem-se as duas.
        @Permission(alias = "localizacao", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public class TrajetoPlugin extends Plugin implements TrajetoService.Ouvinte {

    private static final String SUFIXO_DA_FUNCAO = "/rest/v1/rpc/delivery_share_position";

    private final Handler principal = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        principal.post(() -> TrajetoService.definirOuvinte(this));
    }

    @Override
    protected void handleOnDestroy() {
        principal.post(() -> TrajetoService.largarOuvinte(this));
    }

    @Override
    public void acontecimento(String nome, JSObject dados) {
        notifyListeners(nome, dados);
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        String encomenda = call.getString("encomenda", "");
        String supabase = call.getString("supabaseUrl", "");
        String chave = call.getString("chave", "");
        String sessao = call.getString("sessao", "");
        if (encomenda == null || encomenda.isEmpty() || encomenda.length() > 64
            || supabase == null || !supabase.startsWith("https://")
            || chave == null || chave.isEmpty() || sessao == null || sessao.isEmpty()) {
            call.reject("Pedido de partilha inválido.", "INVALID");
            return;
        }
        if (getPermissionState("localizacao") != PermissionState.GRANTED) {
            requestPermissionForAlias("localizacao", call, "depoisDaPermissao");
            return;
        }
        comecar(call);
    }

    @PermissionCallback
    private void depoisDaPermissao(PluginCall call) {
        if (getPermissionState("localizacao") == PermissionState.GRANTED) {
            comecar(call);
        } else {
            call.reject(
                "A app precisa da localização exacta para mostrar o caminho ao cliente. Ligue-a em Definições → Apps → Livraria Adventista → Permissões → Localização.",
                "SEM_PERMISSAO"
            );
        }
    }

    private void comecar(PluginCall call) {
        Context ctx = getContext();
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null || !LocationManagerCompat.isLocationEnabled(lm)) {
            call.reject("A localização do telemóvel está desligada. Ligue-a e toque outra vez em «Partilhar».", "LOCALIZACAO_DESLIGADA");
            return;
        }
        String supabase = call.getString("supabaseUrl", "").replaceAll("/+$", "");
        TrajetoService.Pedido pedido = new TrajetoService.Pedido(
            call.getString("encomenda", ""),
            supabase + SUFIXO_DA_FUNCAO,
            call.getString("chave", ""),
            call.getString("sessao", "")
        );
        principal.post(() -> {
            try {
                TrajetoService.iniciar(ctx, pedido);
                call.resolve();
            } catch (Exception e) {
                call.reject("Não foi possível começar a partilha. Abra a app e tente outra vez.", "FALHOU", e);
            }
        });
    }

    /** O site renovou a sessão: os próximos envios usam a nova. */
    @PluginMethod
    public void actualizarSessao(PluginCall call) {
        String sessao = call.getString("sessao", "");
        if (sessao == null || sessao.isEmpty()) {
            call.reject("Sessão inválida.", "INVALID");
            return;
        }
        principal.post(() -> {
            TrajetoService.actualizarSessao(sessao);
            call.resolve();
        });
    }

    @PluginMethod
    public void parar(PluginCall call) {
        principal.post(() -> {
            TrajetoService.parar();
            call.resolve();
        });
    }

    /** `{ activa, encomenda?, enviadoEm? }`: a partilha que o telemóvel tem em curso. */
    @PluginMethod
    public void estado(PluginCall call) {
        principal.post(() -> call.resolve(TrajetoService.estado()));
    }
}
