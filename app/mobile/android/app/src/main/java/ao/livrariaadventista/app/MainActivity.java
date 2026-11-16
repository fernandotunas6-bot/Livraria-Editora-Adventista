package ao.livrariaadventista.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * O ecrã do app: o site publicado dentro do WebView do Capacitor (docs/APPS.md), mais o plugin
 * que vive aqui no app. Os dos pacotes npm registam-se sozinhos.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AparelhoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
