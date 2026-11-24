// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Tempo real da Loja online (docs/LOJA-ONLINE.md; docs/KANGEST-SINCRONIZACAO.md §9 na raiz da livraria).
//!
//! O servidor da loja fica ligado ao Realtime do site (Phoenix sobre WebSocket, com a chave pública) e ouve o tópico
//! secreto deste posto (`kangest:<topico>`). Quando muda uma encomenda da loja, o site manda «novidades», **sem dados**;
//! o KanGest vai logo buscá-las pelo canal assinado e cifrado (mod.rs), e a encomenda aparece em segundos. Se a ligação
//! cair, volta a tentar (5 s, 10 s… até 5 minutos); entretanto a sondagem de 2 em 2 minutos continua.

use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tokio_tungstenite::tungstenite::Message;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// O endereço do Realtime a partir do do Supabase: `https://x.supabase.co` → `wss://x.supabase.co/realtime/v1/websocket`.
pub fn endereco_ws(auth_url: &str, apikey: &str) -> Option<String> {
    let base = auth_url.trim().trim_end_matches('/');
    let ws = if let Some(resto) = base.strip_prefix("https://") {
        format!("wss://{resto}")
    } else if let Some(resto) = base.strip_prefix("http://") {
        format!("ws://{resto}")
    } else {
        return None;
    };
    if apikey.is_empty() || !apikey.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) {
        return None;
    }
    Some(format!("{ws}/realtime/v1/websocket?apikey={apikey}&vsn=1.0.0"))
}

/// Entrar no tópico deste posto (público, só broadcast).
pub fn mensagem_entrar(topico: &str, r: u64) -> String {
    json!({
        "topic": format!("realtime:kangest:{topico}"),
        "event": "phx_join",
        "payload": { "config": { "broadcast": { "self": false, "ack": false }, "presence": { "key": "" }, "postgres_changes": [], "private": false } },
        "ref": r.to_string(),
    })
    .to_string()
}

pub fn batimento(r: u64) -> String {
    json!({ "topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": r.to_string() }).to_string()
}

/// É o sinal «novidades»?
pub fn e_novidade(texto: &str) -> bool {
    serde_json::from_str::<Value>(texto).is_ok_and(|v| v["event"] == "broadcast" && v["payload"]["event"] == "novidades")
}

/// O tópico só tem letras e algarismos (32 hexadecimais).
fn topico_valido(t: &str) -> bool {
    (16..=64).contains(&t.len()) && t.chars().all(|c| c.is_ascii_alphanumeric())
}

#[derive(PartialEq)]
struct Config {
    ws: String,
    topico: String,
}

async fn configuracao(pool: &SqlitePool) -> AppResult<Option<Config>> {
    let r = sqlx::query_as::<_, (String, String, String)>(
        "SELECT auth_url, auth_apikey, tempo_real_topico FROM sinc_ligacao WHERE id = 1 AND ativa = 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(r.and_then(|(url, apikey, topico)| {
        if !topico_valido(&topico) {
            return None;
        }
        endereco_ws(&url, &apikey).map(|ws| Config { ws, topico })
    }))
}

/// Ouve o tópico até a ligação cair ou a configuração mudar.
async fn ouvir(st: &AppState, c: &Config) -> AppResult<()> {
    let (ligacao, _) = tokio_tungstenite::connect_async(c.ws.as_str()).await.map_err(|e| AppError::msg(format!("Realtime: {e}")))?;
    let (mut envio, mut recepcao) = ligacao.split();
    envio.send(Message::Text(mensagem_entrar(&c.topico, 1))).await.map_err(|e| AppError::msg(e.to_string()))?;
    let mut r = 2u64;
    let mut batida = tokio::time::interval(Duration::from_secs(25));
    let mut verificar = tokio::time::interval(Duration::from_secs(120));
    let mut ultimo_pedido = Instant::now().checked_sub(Duration::from_secs(60)).unwrap_or_else(Instant::now);
    loop {
        tokio::select! {
            _ = batida.tick() => {
                envio.send(Message::Text(batimento(r))).await.map_err(|e| AppError::msg(e.to_string()))?;
                r += 1;
            }
            _ = verificar.tick() => {
                // desligado, outro tópico (novo emparelhamento) ou outro endereço: volta a ligar com o que houver
                if configuracao(&st.pool).await?.as_ref() != Some(c) {
                    return Ok(());
                }
            }
            m = recepcao.next() => match m {
                Some(Ok(Message::Text(t))) => {
                    // vários sinais seguidos (uma encomenda paga muda várias vezes) dão um pedido só
                    if e_novidade(&t) && ultimo_pedido.elapsed() > Duration::from_secs(3) {
                        ultimo_pedido = Instant::now();
                        let _ = super::sincronizar_ja(st).await;
                    }
                }
                Some(Ok(Message::Close(_))) | None => return Err(AppError::msg("o Realtime fechou a ligação")),
                Some(Ok(_)) => {}
                Some(Err(e)) => return Err(AppError::msg(format!("Realtime: {e}"))),
            }
        }
    }
}

/// A ligação ao Realtime em segundo plano, só no servidor da loja e com o KanGest ligado ao site.
pub fn iniciar(st: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        let mut espera = 5u64;
        loop {
            let config = if crate::rede::config().cliente() { None } else { configuracao(&st.pool).await.ok().flatten() };
            match config {
                Some(c) => match ouvir(&st, &c).await {
                    Ok(()) => espera = 5,
                    Err(e) => {
                        eprintln!("Tempo real da livraria: {e}");
                        espera = (espera * 2).min(300);
                    }
                },
                None => espera = 60,
            }
            tokio::time::sleep(Duration::from_secs(espera)).await;
        }
    });
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn endereco_do_realtime() {
        assert_eq!(
            endereco_ws("https://abc.supabase.co/", "sb_publishable_x-Y.z").as_deref(),
            Some("wss://abc.supabase.co/realtime/v1/websocket?apikey=sb_publishable_x-Y.z&vsn=1.0.0")
        );
        assert_eq!(endereco_ws("http://127.0.0.1:54321", "k").as_deref(), Some("ws://127.0.0.1:54321/realtime/v1/websocket?apikey=k&vsn=1.0.0"));
        assert!(endereco_ws("abc.supabase.co", "k").is_none());
        assert!(endereco_ws("https://abc.supabase.co", "").is_none());
        assert!(endereco_ws("https://abc.supabase.co", "k&evil=1").is_none());
    }

    #[test]
    fn mensagens_do_phoenix() {
        let v: Value = serde_json::from_str(&mensagem_entrar("abc123", 1)).unwrap();
        assert_eq!(v["topic"], "realtime:kangest:abc123");
        assert_eq!(v["event"], "phx_join");
        assert_eq!(v["payload"]["config"]["private"], false);
        assert_eq!(serde_json::from_str::<Value>(&batimento(7)).unwrap()["ref"], "7");
    }

    #[test]
    fn so_o_sinal_das_novidades() {
        assert!(e_novidade(r#"{"topic":"realtime:kangest:x","event":"broadcast","payload":{"event":"novidades","payload":{}}}"#));
        assert!(!e_novidade(r#"{"event":"phx_reply","payload":{"status":"ok"}}"#));
        assert!(!e_novidade(r#"{"event":"broadcast","payload":{"event":"outra"}}"#));
        assert!(!e_novidade("não é json"));
    }

    #[test]
    fn topicos() {
        assert!(topico_valido("0123456789abcdef0123456789abcdef"));
        assert!(!topico_valido("curto") && !topico_valido("com espaço 0123456789abcdef") && !topico_valido(""));
    }
}
