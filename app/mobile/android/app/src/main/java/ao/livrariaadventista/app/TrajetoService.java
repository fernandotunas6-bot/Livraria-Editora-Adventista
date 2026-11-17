package ao.livrariaadventista.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * O trajeto de quem entrega com o ecrã apagado, no Android (docs/TRAJETO_GPS.md).
 *
 * O mesmo que o TrajetoPlugin.swift faz no iPhone: o telemóvel lê o GPS e manda a posição ao
 * Supabase, pela mesma função que o site usa (`delivery_share_position`), com a sessão de quem
 * entrega. No Android isso pede um serviço em primeiro plano, com a notificação «A partilhar a
 * localização» na barra enquanto dura. Começa sempre com o app à frente (o botão «Partilhar»),
 * por isso basta a permissão de localização «Durante a utilização da app»: sem localização em
 * segundo plano, que a Google revê à parte.
 *
 * As regras de quando mandar são as do site (app/web/src/lib/deliveryTracking.js): de 10 em 10
 * segundos quando anda pelo menos 25 m, ou de 30 em 30 segundos parado.
 *
 * O plugin (TrajetoPlugin.java) começa e pára o serviço e ouve o que ele vai fazendo. Tudo o que é
 * estado partilhado entre os dois mexe-se só na thread principal.
 */
public class TrajetoService extends Service implements LocationListener {

    /** O que o plugin recebe do serviço, para passar ao site. */
    interface Ouvinte {
        void acontecimento(String nome, JSObject dados);
    }

    /** O que o site pediu: a encomenda, o endereço da função, a chave pública e a sessão. */
    static final class Pedido {
        final String encomenda;
        final String endereco;
        final String chave;
        String sessao;

        Pedido(String encomenda, String endereco, String chave, String sessao) {
            this.encomenda = encomenda;
            this.endereco = endereco;
            this.chave = chave;
            this.sessao = sessao;
        }
    }

    private static final long ENVIAR_ANDANDO_MS = 10_000;
    private static final long ENVIAR_PARADO_MS = 30_000;
    private static final float DISTANCIA_MINIMA_M = 25f;
    /** Depois de um envio falhado; sem sessão espera-se mais, porque só o site a renova. */
    private static final long ESPERA_APOS_ERRO_MS = 10_000;
    private static final long ESPERA_SEM_SESSAO_MS = 60_000;
    private static final long TIQUE_MS = 5_000;
    /** Com o GPS a dar leituras, as da rede (menos precisas) não contam. */
    private static final long GPS_RECENTE_MS = 20_000;

    private static final int ID_NOTIFICACAO = 4711;
    private static final int ID_AVISO_SESSAO = 4712;
    private static final String CANAL = "trajeto";
    private static final String CANAL_AVISOS = "trajeto-avisos";

    private static final String[] MENSAGENS_DE_FIM = { "terminou", "não está a caminho", "só quem entrega", "não tem entrega" };

    // ---------- Estado partilhado com o plugin (só na thread principal) ----------

    private static TrajetoService activo;
    private static Pedido pedido;
    private static Ouvinte ouvinte;

    static void definirOuvinte(Ouvinte o) {
        ouvinte = o;
    }

    static void largarOuvinte(Ouvinte o) {
        if (ouvinte == o) ouvinte = null;
    }

    /** Começa (ou recomeça, com outra encomenda) a partilha. */
    static void iniciar(Context ctx, Pedido novo) {
        pedido = novo;
        ContextCompat.startForegroundService(ctx, new Intent(ctx, TrajetoService.class));
    }

    /** O site renovou a sessão (de hora a hora, com o app à frente): os próximos envios usam-na. */
    static void actualizarSessao(String sessao) {
        if (pedido != null) pedido.sessao = sessao;
        if (activo != null) {
            activo.proximaTentativa = 0;
            activo.avisouSessao = false;
        }
    }

    static void parar() {
        pedido = null;
        if (activo != null) activo.pararTudo();
    }

    /** Para o site saber, ao voltar à página da entrega, se a partilha continua. */
    static JSObject estado() {
        JSObject r = new JSObject();
        boolean activa = activo != null && activo.encomenda != null;
        r.put("activa", activa);
        if (activa) {
            r.put("encomenda", activo.encomenda);
            if (activo.ultimoEnvioEm > 0) r.put("enviadoEm", activo.ultimoEnvioEm);
        }
        return r;
    }

    // ---------- O serviço ----------

    private final Handler principal = new Handler(Looper.getMainLooper());
    private final ExecutorService rede = Executors.newSingleThreadExecutor();
    private final Runnable tique = new Runnable() {
        @Override
        public void run() {
            enviarSeParado();
            principal.postDelayed(this, TIQUE_MS);
        }
    };

    private String encomenda;
    private Location ultimaLeitura;
    private Location ultimoEnvio;
    private long ultimoEnvioRelogio;
    private long ultimoEnvioEm;
    private long ultimaGps;
    private long proximaTentativa;
    private boolean aEnviar;
    private boolean avisouSessao;
    private boolean aLer;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // O sistema exige o primeiro plano logo a seguir a startForegroundService, mesmo que o
        // pedido já tenha sido cancelado entretanto.
        try {
            entrarEmPrimeiroPlano("A partilhar a localização com o cliente.");
        } catch (Exception e) {
            emitir("terminou", mensagem("Não foi possível partilhar a localização em segundo plano."));
            pararTudo();
            return START_NOT_STICKY;
        }
        if (pedido == null) {
            pararTudo();
            return START_NOT_STICKY;
        }
        activo = this;
        encomenda = pedido.encomenda;
        ultimaLeitura = null;
        ultimoEnvio = null;
        ultimoEnvioRelogio = 0;
        ultimoEnvioEm = 0;
        proximaTentativa = 0;
        avisouSessao = false;
        pedirLeituras();
        principal.removeCallbacks(tique);
        principal.postDelayed(tique, TIQUE_MS);
        // Sem as credenciais guardadas, um telemóvel que reinicie o serviço não sabe a sessão.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        largarLeituras();
        principal.removeCallbacks(tique);
        rede.shutdownNow();
        if (activo == this) activo = null;
        super.onDestroy();
    }

    private void pararTudo() {
        encomenda = null;
        largarLeituras();
        principal.removeCallbacks(tique);
        if (activo == this) activo = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ---------- GPS ----------

    private void pedirLeituras() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return;
        largarLeituras();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
                LocationRequest pedidoGps = new LocationRequest.Builder(TIQUE_MS)
                    .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                    .setMinUpdateDistanceMeters(5f)
                    .build();
                lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, pedidoGps, ContextCompat.getMainExecutor(this), this);
            } else {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, TIQUE_MS, 5f, this, Looper.getMainLooper());
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, TIQUE_MS, 5f, this, Looper.getMainLooper());
                }
            }
            aLer = true;
        } catch (SecurityException e) {
            emitir("terminou", mensagem("A localização foi desligada para a app: a partilha parou."));
            pararTudo();
        }
    }

    private void largarLeituras() {
        if (!aLer) return;
        aLer = false;
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm != null) lm.removeUpdates(this);
    }

    @Override
    public void onLocationChanged(@NonNull Location leitura) {
        if (encomenda == null) return;
        long agora = SystemClock.elapsedRealtime();
        if (LocationManager.GPS_PROVIDER.equals(leitura.getProvider())) {
            ultimaGps = agora;
        } else if (LocationManager.NETWORK_PROVIDER.equals(leitura.getProvider()) && ultimaGps > 0 && agora - ultimaGps < GPS_RECENTE_MS) {
            return;
        }
        ultimaLeitura = leitura;
        JSObject dados = new JSObject();
        dados.put("lat", leitura.getLatitude());
        dados.put("lng", leitura.getLongitude());
        if (leitura.hasAccuracy()) dados.put("accuracy", leitura.getAccuracy());
        emitir("leitura", dados);

        if (ultimoEnvio == null) {
            enviar(leitura);
            return;
        }
        long passou = agora - ultimoEnvioRelogio;
        if (passou < ENVIAR_ANDANDO_MS) return;
        if (leitura.distanceTo(ultimoEnvio) >= DISTANCIA_MINIMA_M || passou >= ENVIAR_PARADO_MS) enviar(leitura);
    }

    // Antes do Android 11 estes três não têm corpo na interface: sem eles o app caía quando o
    // GPS se desligava.
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(@NonNull String provider) {}

    @Override
    public void onProviderDisabled(@NonNull String provider) {
        if (encomenda != null) emitir("erro", erro("GPS", "Sem sinal de GPS: ligue a localização do telemóvel."));
    }

    /**
     * Parado, o GPS não manda leituras novas: de 30 em 30 segundos, a última outra vez (o cliente
     * vê que quem entrega continua ali). Se ainda nenhuma seguiu (o primeiro envio falhou, sem
     * rede), tenta-se já: `enviar` espaça as tentativas.
     */
    private void enviarSeParado() {
        if (encomenda == null || ultimaLeitura == null) return;
        if (ultimoEnvio == null || SystemClock.elapsedRealtime() - ultimoEnvioRelogio >= ENVIAR_PARADO_MS) {
            enviar(ultimaLeitura);
        }
    }

    // ---------- Envio ----------

    private void enviar(final Location leitura) {
        final Pedido p = pedido;
        if (aEnviar || SystemClock.elapsedRealtime() < proximaTentativa || encomenda == null || p == null) return;
        if (!encomenda.equals(p.encomenda) || p.sessao == null || p.sessao.isEmpty()) return;
        final String corpo;
        try {
            JSONObject json = new JSONObject();
            json.put("p_order_id", p.encomenda);
            json.put("p_lat", leitura.getLatitude());
            json.put("p_lng", leitura.getLongitude());
            if (leitura.hasAccuracy()) json.put("p_accuracy", (double) leitura.getAccuracy());
            if (leitura.hasBearing()) json.put("p_heading", (double) leitura.getBearing());
            if (leitura.hasSpeed()) json.put("p_speed", (double) leitura.getSpeed());
            corpo = json.toString();
        } catch (Exception e) {
            return;
        }
        aEnviar = true;
        final String daEncomenda = p.encomenda;
        final String endereco = p.endereco;
        final String chave = p.chave;
        final String sessao = p.sessao;
        try {
            rede.execute(() -> {
                int codigo = 0;
                String resposta = "";
                HttpURLConnection ligacao = null;
                try {
                    ligacao = (HttpURLConnection) new URL(endereco).openConnection();
                    ligacao.setRequestMethod("POST");
                    ligacao.setConnectTimeout(15_000);
                    ligacao.setReadTimeout(20_000);
                    ligacao.setDoOutput(true);
                    ligacao.setRequestProperty("Content-Type", "application/json");
                    ligacao.setRequestProperty("apikey", chave);
                    ligacao.setRequestProperty("Authorization", "Bearer " + sessao);
                    try (OutputStream out = ligacao.getOutputStream()) {
                        out.write(corpo.getBytes(StandardCharsets.UTF_8));
                    }
                    codigo = ligacao.getResponseCode();
                    resposta = ler(codigo >= 400 ? ligacao.getErrorStream() : ligacao.getInputStream());
                } catch (IOException e) {
                    codigo = 0;
                } finally {
                    if (ligacao != null) ligacao.disconnect();
                }
                final int c = codigo;
                final String r = resposta;
                principal.post(() -> recebeu(leitura, daEncomenda, c, r));
            });
        } catch (Exception e) {
            // O serviço está a acabar: nada a mandar.
            aEnviar = false;
        }
    }

    private static String ler(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream entrada = in) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] bloco = new byte[4096];
            int n;
            while ((n = entrada.read(bloco)) != -1 && bytes.size() < 64_000) bytes.write(bloco, 0, n);
            return bytes.toString("UTF-8");
        }
    }

    private void recebeu(Location leitura, String daEncomenda, int codigo, String resposta) {
        aEnviar = false;
        // Entretanto parou, ou começou outra entrega: esta resposta já não interessa.
        if (encomenda == null || !encomenda.equals(daEncomenda)) return;
        long agora = SystemClock.elapsedRealtime();

        if (codigo >= 200 && codigo < 300) {
            ultimoEnvio = leitura;
            ultimoEnvioRelogio = agora;
            ultimoEnvioEm = System.currentTimeMillis();
            proximaTentativa = 0;
            JSObject dados = new JSObject();
            dados.put("quando", ultimoEnvioEm);
            emitir("enviado", dados);
            return;
        }

        String texto = "";
        try {
            texto = new JSONObject(resposta).optString("message", "");
        } catch (Exception ignorado) {
            // Sem corpo, ou não é JSON.
        }
        String minusculas = texto.toLowerCase(Locale.ROOT);

        if (codigo == 401 || minusculas.contains("jwt")) {
            // A sessão caducou em segundo plano: espera pela renovação do site, e avisa uma vez.
            proximaTentativa = agora + ESPERA_SEM_SESSAO_MS;
            emitir("erro", erro("SESSAO", "A sessão caducou: abra a app para continuar a partilhar."));
            avisarSessaoCaducada();
            return;
        }

        for (String fim : MENSAGENS_DE_FIM) {
            if (minusculas.contains(fim)) {
                emitir("terminou", mensagem(texto));
                pararTudo();
                return;
            }
        }

        // Sem rede ou um erro passageiro: tenta-se outra vez daqui a pouco.
        proximaTentativa = agora + ESPERA_APOS_ERRO_MS;
        emitir("erro", erro("ENVIO", texto.isEmpty() ? "Sem rede: a posição segue quando voltar." : texto));
    }

    // ---------- Notificações ----------

    private void criarCanais() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel partilha = new NotificationChannel(CANAL, "Partilha da localização", NotificationManager.IMPORTANCE_LOW);
        partilha.setDescription("Enquanto partilha o caminho da entrega com o cliente.");
        partilha.setShowBadge(false);
        nm.createNotificationChannel(partilha);
        NotificationChannel avisos = new NotificationChannel(CANAL_AVISOS, "Avisos da partilha", NotificationManager.IMPORTANCE_HIGH);
        avisos.setDescription("Quando a partilha da localização pára e precisa de abrir a app.");
        nm.createNotificationChannel(avisos);
    }

    @Nullable
    private PendingIntent abrirApp() {
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (abrir == null) return null;
        return PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void entrarEmPrimeiroPlano(String texto) {
        criarCanais();
        Notification n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_trajeto)
            .setContentTitle("A partilhar a localização")
            .setContentText(texto)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(abrirApp())
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID_NOTIFICACAO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_NOTIFICACAO, n);
        }
    }

    private void avisarSessaoCaducada() {
        if (avisouSessao) return;
        avisouSessao = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        criarCanais();
        Notification n = new NotificationCompat.Builder(this, CANAL_AVISOS)
            .setSmallIcon(R.drawable.ic_stat_trajeto)
            .setContentTitle("A partilha da localização parou")
            .setContentText("Abra a app para o cliente continuar a ver o caminho da entrega.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(abrirApp())
            .build();
        nm.notify(ID_AVISO_SESSAO, n);
    }

    // ---------- Para o site ----------

    private static void emitir(String nome, JSObject dados) {
        if (ouvinte != null) ouvinte.acontecimento(nome, dados);
    }

    private static JSObject mensagem(String texto) {
        JSObject dados = new JSObject();
        dados.put("mensagem", texto);
        return dados;
    }

    private static JSObject erro(String codigo, String texto) {
        JSObject dados = mensagem(texto);
        dados.put("codigo", codigo);
        return dados;
    }
}
