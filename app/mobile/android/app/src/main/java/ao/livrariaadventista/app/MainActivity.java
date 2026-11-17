package ao.livrariaadventista.app;

import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;

/**
 * O ecrã do app: o site publicado dentro do WebView do Capacitor (docs/APPS.md), mais os plugins
 * que vivem aqui no app (o Aparelho e o Trajeto). Os dos pacotes npm registam-se sozinhos.
 *
 * Puxar para actualizar, como no iPhone (MainViewController.swift): o WebView fica dentro de um
 * SwipeRefreshLayout, e quem decide o que é actualizar é o site (NativeAppBridge.jsx): recarrega a
 * página, ou avisa que há alterações por gravar e não perde nada.
 */
public class MainActivity extends BridgeActivity {

    /**
     * O site diz se puxar para baixo é actualizar (Aparelho.podePuxar): não com uma janela aberta
     * nem dentro de uma lista que já desceu, onde puxar é só deslizar. O topo da página vê-se aqui.
     */
    static volatile boolean podePuxar = true;

    private static final String PUXOU = "window.dispatchEvent(new CustomEvent('livraria:puxar-para-actualizar'))";

    private SwipeRefreshLayout puxar;
    private int tapadoPelaBarra = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AparelhoPlugin.class);
        registerPlugin(TrajetoPlugin.class);
        super.onCreate(savedInstanceState);
        prepararPuxarParaActualizar();
    }

    private void prepararPuxarParaActualizar() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null || !(webView.getParent() instanceof ViewGroup)) return;

        // O WebView passa para dentro do SwipeRefreshLayout, no mesmo lugar e com o mesmo tamanho.
        ViewGroup pai = (ViewGroup) webView.getParent();
        int lugar = pai.indexOfChild(webView);
        ViewGroup.LayoutParams tamanho = webView.getLayoutParams();
        pai.removeView(webView);
        puxar = new SwipeRefreshLayout(this);
        puxar.addView(webView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        pai.addView(puxar, lugar, tamanho);

        puxar.setColorSchemeColors(0xFF0C4A6E);
        puxar.setOnChildScrollUpCallback((parent, child) -> webView.getScrollY() > 0 || !podePuxar);
        puxar.setOnRefreshListener(() -> {
            webView.evaluateJavascript(PUXOU, null);
            puxar.postDelayed(() -> puxar.setRefreshing(false), 600);
        });
        puxar.addOnLayoutChangeListener((v, l, t, r, b, antesL, antesT, antesR, antesB) -> acertarRoda());
    }

    /**
     * O site ocupa o ecrã todo, por baixo da barra de estado (SystemBars no capacitor.config.json):
     * a roda do puxar desce o que a barra tapa, para não aparecer escondida atrás da hora.
     */
    private void acertarRoda() {
        WindowInsetsCompat margens = ViewCompat.getRootWindowInsets(puxar);
        if (margens == null) return;
        Insets barra = margens.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
        int[] onde = new int[2];
        puxar.getLocationInWindow(onde);
        int tapado = Math.max(0, barra.top - onde[1]);
        if (tapado == tapadoPelaBarra) return;
        tapadoPelaBarra = tapado;
        int descida = Math.round(64 * getResources().getDisplayMetrics().density);
        puxar.setProgressViewOffset(false, tapado - puxar.getProgressCircleDiameter(), tapado + descida);
    }
}
