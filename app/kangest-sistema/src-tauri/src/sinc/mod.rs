// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A ligação do KanGest Livraria à base central da livraria (docs/SINCRONIZACAO.md; docs/KANGEST-SINCRONIZACAO.md
//! na raiz da livraria; fase 4 de docs/ECOSSISTEMA.md).
//!
//! - **A fila.** Cada documento emitido, anulado ou facturado entra em `sinc_saida` por um gatilho, na mesma
//!   transacção que o grava (migração 0053). A fila sobrevive a um fecho inesperado e a dias sem Internet.
//! - **O envio.** De 30 em 30 segundos, havendo ligação, até 100 documentos saem num lote assinado com a chave Ed25519
//!   deste posto e selado para o centro (`cifra.rs`). O centro não grava nada em dobro, por isso repetir um lote é
//!   seguro.
//! - **Sem Internet**, a loja vende como sempre e a fila espera; volta a tentar na volta seguinte. Um documento que o
//!   centro recusa fica com erro e volta a tentar ao fim de 1, 2, 4… minutos (até 6 horas).
//! - As facturas são emitidas e assinadas aqui (AGT); o centro guarda uma cópia que não se altera.
//! - Só o servidor da loja corre o ciclo: num posto em rede, a base e a fila estão no servidor.

pub mod cifra;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Documentos por lote (o centro aceita até 200).
const LOTE: i64 = 100;
/// Segundos entre voltas.
pub const INTERVALO: u64 = 30;
/// Permissão para ligar, ver e desligar (a mesma da API e Integrações).
const PERMISSAO: &str = "sistema.api";

/// Uma volta de cada vez (o ciclo e o «Sincronizar agora» podiam cruzar-se).
static A_CORRER: AtomicBool = AtomicBool::new(false);

/// A vez de correr: enquanto existir, ninguém mais entra; ao sair (mesmo com erro), solta.
struct Vez(&'static AtomicBool);

impl Vez {
    fn tentar(bandeira: &'static AtomicBool) -> Option<Vez> {
        bandeira.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).ok().map(|_| Vez(bandeira))
    }
}

impl Drop for Vez {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn agora_s() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Quando volta a tentar um documento que o centro recusou: 1, 2, 4… minutos, até 6 horas.
pub fn proxima_tentativa(tentativas: i64, agora: i64) -> i64 {
    let minutos = (1i64 << tentativas.clamp(0, 9)).min(360);
    agora + minutos * 60
}

/// O endereço que o painel do site mostra («https://<projecto>.supabase.co/functions/v1/app»), sem a barra do fim.
pub fn normalizar_url(url: &str) -> AppResult<String> {
    let u = url.trim().trim_end_matches('/');
    let u = u.strip_suffix("/kangest/sinc").or_else(|| u.strip_suffix("/kangest/emparelhar")).unwrap_or(u);
    let local = u.starts_with("http://127.0.0.1") || u.starts_with("http://localhost");
    if !(u.starts_with("https://") || local) || u.contains(char::is_whitespace) {
        return Err(AppError::msg("O endereço da ligação começa por https://: copie-o do painel do site (Sistema → Ligação ao KanGest → Postos)."));
    }
    Ok(u.to_string())
}

/// A mensagem de erro que o site mandou, ou o código HTTP.
fn mensagem_do_site(v: &Value, estado: u16) -> String {
    v["message"].as_str().or_else(|| v["error"].as_str()).map(str::to_string).unwrap_or_else(|| format!("O site respondeu {estado}."))
}

struct Ligacao {
    url: String,
    posto_id: String,
    semente: [u8; 32],
    kid: String,
    centro: String,
}

async fn ligacao(pool: &SqlitePool) -> AppResult<Option<Ligacao>> {
    let Some((url, posto_id, chave, kid, centro)) = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT url, posto_id, chave_assinatura, centro_kid, centro_chave FROM sinc_ligacao WHERE id = 1 AND ativa = 1",
    )
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    let semente = crate::segredos::decifrar(&chave)
        .ok()
        .and_then(|s| B64.decode(s.trim()).ok())
        .and_then(|v| <[u8; 32]>::try_from(v).ok())
        .ok_or_else(|| AppError::msg("A chave deste posto não se abre (o cofre do sistema mudou?): desligue e emparelhe outra vez."))?;
    Ok(Some(Ligacao { url, posto_id, semente, kid, centro }))
}

async fn post(url: String, cabecalhos: Vec<(&'static str, String)>, corpo: Vec<u8>) -> AppResult<crate::http::Resposta> {
    tokio::task::spawn_blocking(move || crate::http::pedido("POST", &url, &cabecalhos, Some(corpo.as_slice()), Duration::from_secs(30)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

// ---------------------------------------------------------------------------------------------------------------
// A fila e o lote
// ---------------------------------------------------------------------------------------------------------------

/// Põe na fila todos os documentos deste KanGest que ainda não seguiram (os importados do KIGEST ficam de fora, como
/// nos avisos). O centro ignora os que já tiver.
pub async fn enfileirar_tudo(pool: &SqlitePool) -> AppResult<i64> {
    let r = sqlx::query(
        "INSERT INTO sinc_saida (documento_id, operacao)
         SELECT d.id, 'emitido' FROM documentos d
          WHERE d.importado = 0
            AND NOT EXISTS (SELECT 1 FROM sinc_saida s WHERE s.documento_id = d.id AND s.operacao = 'emitido')
          ORDER BY d.id",
    )
    .execute(pool)
    .await?;
    Ok(r.rows_affected() as i64)
}

/// Um documento como vai no lote: o que foi assinado, o `hash_anterior` (o hash do anterior da mesma série, para o
/// centro conferir a cadeia) e as linhas. O estado é o de agora: uma anulação que ainda não seguiu vai já com ele.
pub async fn item_do_documento(pool: &SqlitePool, id: i64) -> AppResult<Option<Value>> {
    let Some(d) = sqlx::query(
        "SELECT d.id, d.tipo_codigo, t.grupo, d.serie, d.numero, d.numero_doc, d.data_emissao, d.data_hora, d.entidade_nif,
                d.entidade_nome, d.total_liquido, d.total_iva, d.total, d.estado, d.motivo_anulacao, d.referencia, d.hash,
                d.hash_controlo, d.hash_versao, d.armazem_id,
                COALESCE((SELECT a.hash FROM documentos a
                           WHERE a.tipo_codigo = d.tipo_codigo AND a.serie = d.serie AND a.numero = d.numero - 1), '') AS hash_anterior
           FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
          WHERE d.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    let linhas = db::query_json_bind(
        pool,
        "SELECT linha, referencia, descricao, quantidade, preco_unitario, desconto_pct, taxa_iva_pct, valor_liquido, valor_iva, total
           FROM documento_linhas WHERE documento_id = ? ORDER BY linha",
        id,
    )
    .await?;
    Ok(Some(json!({ "tipo": "documento", "documento": db::row_json(&d), "linhas": linhas })))
}

enum Falha {
    /// Sem resposta (sem Internet, o site em baixo): tenta-se na volta seguinte, sem contar como tentativa.
    SemLigacao(String),
    /// O site respondeu, mas recusou o pedido inteiro.
    Recusado(String),
}

impl std::fmt::Display for Falha {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Falha::SemLigacao(m) => write!(f, "Sem ligação ao site: {m}"),
            Falha::Recusado(m) => write!(f, "{m}"),
        }
    }
}

/// Um pedido ao centro: assinado, selado, e a resposta aberta com a chave da sessão.
async fn enviar(l: &Ligacao, dados: &Value) -> Result<Value, Falha> {
    let recusa = |e: AppError| Falha::Recusado(e.to_string());
    let hora = agora_s().to_string();
    let nonce = cifra::nonce().map_err(recusa)?;
    let claro = serde_json::to_vec(dados).map_err(|e| Falha::Recusado(e.to_string()))?;
    let (envelope, chave_resposta) = cifra::selar(&l.centro, &l.kid, &cifra::aad_do_pedido(&l.posto_id, &hora, &nonce), &claro).map_err(recusa)?;
    let corpo = serde_json::to_vec(&envelope).map_err(|e| Falha::Recusado(e.to_string()))?;
    let assinatura = cifra::assinar(&l.semente, &cifra::mensagem_assinada(&l.posto_id, &hora, &nonce, &corpo)).map_err(recusa)?;
    let cabecalhos = vec![
        ("Content-Type", "application/json".to_string()),
        ("Accept", "application/json".to_string()),
        ("x-kangest-posto", l.posto_id.clone()),
        ("x-kangest-hora", hora),
        ("x-kangest-nonce", nonce.clone()),
        ("x-kangest-assinatura", assinatura),
    ];
    let r = post(format!("{}/kangest/sinc", l.url), cabecalhos, corpo).await.map_err(|e| Falha::SemLigacao(e.to_string()))?;
    let v: Value = serde_json::from_slice(&r.corpo).unwrap_or(Value::Null);
    if r.estado != 200 {
        return Err(Falha::Recusado(mensagem_do_site(&v, r.estado)));
    }
    let selado: cifra::Selado = serde_json::from_value(v).map_err(|_| Falha::Recusado("O site respondeu sem a resposta selada.".into()))?;
    let aberto = cifra::abrir_resposta(&chave_resposta, &nonce, &selado).map_err(recusa)?;
    serde_json::from_slice(&aberto).map_err(|_| Falha::Recusado("A resposta do site não é JSON.".into()))
}

async fn anotar_erro(pool: &SqlitePool, erro: &str) -> AppResult<()> {
    sqlx::query("UPDATE sinc_ligacao SET ultimo_erro = ? WHERE id = 1").bind(erro.chars().take(300).collect::<String>()).execute(pool).await?;
    Ok(())
}

/// Uma volta: os documentos devidos saem num lote; cada um fica feito ou com erro, conforme a resposta do centro.
pub async fn ciclo(st: &AppState) -> AppResult<Value> {
    let Some(_vez) = Vez::tentar(&A_CORRER) else {
        return Ok(json!({ "ocupado": true }));
    };
    let pool = &st.pool;
    let Some(l) = ligacao(pool).await? else {
        return Ok(json!({ "ligada": false }));
    };
    let agora = agora_s();
    let fila: Vec<(i64, i64, i64)> = sqlx::query_as(
        "SELECT id, documento_id, tentativas FROM sinc_saida WHERE estado IN ('pendente', 'erro') AND proximo_em <= ? ORDER BY id LIMIT ?",
    )
    .bind(agora)
    .bind(LOTE)
    .fetch_all(pool)
    .await?;
    if fila.is_empty() {
        return Ok(json!({ "ligada": true, "enviados": 0 }));
    }
    let mut ids: Vec<i64> = fila.iter().map(|f| f.1).collect();
    ids.sort_unstable();
    ids.dedup();
    let mut lote = Vec::with_capacity(ids.len());
    for id in &ids {
        if let Some(item) = item_do_documento(pool, *id).await? {
            lote.push(item);
        }
    }
    match enviar(&l, &json!({ "lote": lote })).await {
        Ok(r) => {
            let erros: HashMap<i64, String> = r["resultado"]["erros"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|e| Some((e["documento_id"].as_i64()?, e["erro"].as_str().unwrap_or("erro").to_string())))
                .collect();
            let feito = db::agora();
            for (fila_id, documento_id, tentativas) in &fila {
                match erros.get(documento_id) {
                    Some(erro) => {
                        sqlx::query("UPDATE sinc_saida SET estado = 'erro', tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE id = ?")
                            .bind(proxima_tentativa(*tentativas, agora))
                            .bind(erro.chars().take(300).collect::<String>())
                            .bind(fila_id)
                            .execute(pool)
                            .await?;
                    }
                    None => {
                        sqlx::query("UPDATE sinc_saida SET estado = 'feito', feito_em = ?, erro = '' WHERE id = ?").bind(&feito).bind(fila_id).execute(pool).await?;
                    }
                }
            }
            sqlx::query("UPDATE sinc_ligacao SET ultima_sinc = ?, ultimo_erro = '', posto_nome = COALESCE(?, posto_nome), loja = COALESCE(?, loja) WHERE id = 1")
                .bind(&feito)
                .bind(r["posto"]["nome"].as_str())
                .bind(r["posto"]["loja"].as_str())
                .execute(pool)
                .await?;
            // o que já seguiu há mais de 30 dias sai da fila
            sqlx::query("DELETE FROM sinc_saida WHERE estado = 'feito' AND feito_em < strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-30 days')").execute(pool).await?;
            Ok(json!({ "ligada": true, "enviados": ids.len(), "resultado": r["resultado"] }))
        }
        Err(Falha::SemLigacao(m)) => {
            let erro = Falha::SemLigacao(m).to_string();
            anotar_erro(pool, &erro).await?;
            Ok(json!({ "ligada": true, "enviados": 0, "erro": erro }))
        }
        Err(Falha::Recusado(m)) => {
            // o pedido inteiro foi recusado (posto revogado, relógio errado…): os documentos esperam, cada vez mais
            for (fila_id, _, tentativas) in &fila {
                sqlx::query("UPDATE sinc_saida SET tentativas = tentativas + 1, proximo_em = ? WHERE id = ?")
                    .bind(proxima_tentativa(*tentativas, agora))
                    .bind(fila_id)
                    .execute(pool)
                    .await?;
            }
            anotar_erro(pool, &m).await?;
            Ok(json!({ "ligada": true, "enviados": 0, "erro": m }))
        }
    }
}

/// O ciclo em segundo plano, como os avisos da API (webhooks.rs): só no servidor da loja.
pub fn iniciar(st: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(INTERVALO)).await;
            if crate::rede::config().cliente() {
                continue;
            }
            if let Err(e) = ciclo(&st).await {
                eprintln!("Ligação à livraria: {e}");
            }
        }
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Os métodos do ecrã (Livraria → Ligação ao site)
// ---------------------------------------------------------------------------------------------------------------

#[derive(Deserialize)]
struct EmparelharIn {
    url: String,
    codigo: String,
}

/// Emparelha este KanGest com um posto criado no painel do site: gera a chave Ed25519 (só a pública sai), regista-a
/// com o código de uso único e guarda a chave do centro. A semente fica cifrada com a chave mestra (segredos.rs).
async fn emparelhar(st: &AppState, e: EmparelharIn) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let url = normalizar_url(&e.url)?;
    let codigo: String = e.codigo.chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_uppercase();
    if codigo.len() != 8 {
        return Err(AppError::msg("Escreva o código de 8 letras que o painel do site mostrou."));
    }
    let semente = cifra::nova_semente()?;
    let corpo = serde_json::to_vec(&json!({
        "codigo": codigo,
        "chave_publica": cifra::chave_publica(&semente)?,
        "versao": format!("{} Livraria", env!("CARGO_PKG_VERSION")),
    }))?;
    let cabecalhos = vec![("Content-Type", "application/json".to_string()), ("Accept", "application/json".to_string())];
    let r = post(format!("{url}/kangest/emparelhar"), cabecalhos, corpo).await.map_err(|e| AppError::msg(format!("Sem ligação ao site: {e}")))?;
    let v: Value = serde_json::from_slice(&r.corpo).unwrap_or(Value::Null);
    if r.estado != 200 {
        return Err(AppError::msg(mensagem_do_site(&v, r.estado)));
    }
    let (Some(posto_id), Some(kid), Some(centro)) = (v["posto"]["id"].as_str(), v["centro"]["kid"].as_str(), v["centro"]["chave_publica"].as_str()) else {
        return Err(AppError::msg("O site respondeu sem o posto ou sem a chave do centro."));
    };
    if B64.decode(centro).map(|c| c.len()).unwrap_or(0) != 32 {
        return Err(AppError::msg("A chave do centro que o site mandou não é válida."));
    }
    let anterior: Option<String> = sqlx::query_scalar("SELECT posto_id FROM sinc_ligacao WHERE id = 1").fetch_optional(&st.pool).await?;
    sqlx::query(
        "INSERT INTO sinc_ligacao (id, url, posto_id, posto_nome, loja, chave_assinatura, centro_kid, centro_chave, ativa, emparelhado_em, ultimo_erro)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, ?, '')
         ON CONFLICT(id) DO UPDATE SET url = excluded.url, posto_id = excluded.posto_id, posto_nome = excluded.posto_nome, loja = excluded.loja,
           chave_assinatura = excluded.chave_assinatura, centro_kid = excluded.centro_kid, centro_chave = excluded.centro_chave, ativa = 1,
           emparelhado_em = excluded.emparelhado_em, ultimo_erro = ''",
    )
    .bind(&url)
    .bind(posto_id)
    .bind(v["posto"]["nome"].as_str().unwrap_or_default())
    .bind(v["posto"]["loja"].as_str().unwrap_or_default())
    .bind(crate::segredos::cifrar(&B64.encode(semente)))
    .bind(kid)
    .bind(centro)
    .bind(db::agora())
    .execute(&st.pool)
    .await?;
    // outro posto: o que já tinha seguido foi para o anterior, por isso volta tudo à fila
    if anterior.as_deref().is_some_and(|a| a != posto_id) {
        sqlx::query("DELETE FROM sinc_saida").execute(&st.pool).await?;
    }
    enfileirar_tudo(&st.pool).await?;
    let mut e = estado(st).await?;
    let hora = v["hora"].as_i64().unwrap_or(0);
    if hora > 0 && (agora_s() - hora).abs() > 120 {
        e["aviso"] = json!("A hora deste computador está diferente da hora certa: acerte o relógio, senão o site recusa os envios.");
    }
    Ok(e)
}

async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let ligacao = sqlx::query(
        "SELECT url, posto_id, posto_nome, loja, ativa, emparelhado_em, ultima_sinc, ultimo_erro FROM sinc_ligacao WHERE id = 1",
    )
    .fetch_optional(&st.pool)
    .await?
    .map(|r| db::row_json(&r));
    let contagem: Vec<(String, i64)> = sqlx::query_as("SELECT estado, COUNT(*) FROM sinc_saida GROUP BY estado").fetch_all(&st.pool).await?;
    let conta = |e: &str| contagem.iter().find(|(k, _)| k == e).map(|(_, n)| *n).unwrap_or(0);
    let erros = db::query_json(
        &st.pool,
        "SELECT s.id, s.documento_id, d.numero_doc, s.operacao, s.tentativas, s.erro, s.proximo_em
           FROM sinc_saida s LEFT JOIN documentos d ON d.id = s.documento_id
          WHERE s.estado = 'erro' ORDER BY s.id DESC LIMIT 20",
    )
    .await?;
    Ok(json!({
        "ligada": ligacao.is_some(),
        "ligacao": ligacao,
        "pendentes": conta("pendente") + conta("erro"),
        "com_erro": conta("erro"),
        "feitos": conta("feito"),
        "erros": erros,
        "intervalo": INTERVALO,
    }))
}

async fn agora(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let r = ciclo(st).await?;
    let mut e = estado(st).await?;
    e["volta"] = r;
    Ok(e)
}

async fn repetir(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    sqlx::query("UPDATE sinc_saida SET estado = 'pendente', tentativas = 0, proximo_em = 0 WHERE estado = 'erro'").execute(&st.pool).await?;
    estado(st).await
}

/// Desliga este KanGest do site: a chave deste posto é apagada. O posto continua no painel do site até alguém o
/// revogar lá.
async fn desligar(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    sqlx::query("DELETE FROM sinc_ligacao").execute(&st.pool).await?;
    sqlx::query("DELETE FROM sinc_saida WHERE estado <> 'feito'").execute(&st.pool).await?;
    estado(st).await
}

/// Despachante próprio dos métodos `sinc.*` (services/mod.rs: o `match` grande já usa muita pilha).
pub async fn despachar(st: &AppState, metodo: &str, params: Value) -> AppResult<Value> {
    match metodo {
        "estado" => estado(st).await,
        "emparelhar" => emparelhar(st, serde_json::from_value(params)?).await,
        "agora" => agora(st).await,
        "repetir" => repetir(st).await,
        "desligar" => desligar(st).await,
        _ => Err(AppError::msg(format!("Método desconhecido: sinc.{metodo}"))),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn tentativas_cada_vez_mais_espacadas_ate_6_horas() {
        assert_eq!(proxima_tentativa(0, 1000), 1000 + 60);
        assert_eq!(proxima_tentativa(1, 1000), 1000 + 120);
        assert_eq!(proxima_tentativa(3, 1000), 1000 + 480);
        assert_eq!(proxima_tentativa(9, 1000), 1000 + 360 * 60);
        assert_eq!(proxima_tentativa(50, 1000), 1000 + 360 * 60);
    }

    #[test]
    fn endereco_do_painel() {
        let u = "https://abc.supabase.co/functions/v1/app";
        assert_eq!(normalizar_url(&format!(" {u}/ ")).unwrap(), u);
        assert_eq!(normalizar_url(&format!("{u}/kangest/sinc")).unwrap(), u);
        assert_eq!(normalizar_url(&format!("{u}/kangest/emparelhar")).unwrap(), u);
        assert!(normalizar_url("http://abc.supabase.co/functions/v1/app").is_err());
        assert!(normalizar_url("abc.supabase.co").is_err());
        assert!(normalizar_url("http://127.0.0.1:54321/functions/v1/app").is_ok());
    }

    #[test]
    fn mensagem_do_site_ou_o_codigo() {
        assert_eq!(mensagem_do_site(&json!({ "message": "Código inválido." }), 400), "Código inválido.");
        assert_eq!(mensagem_do_site(&Value::Null, 502), "O site respondeu 502.");
    }

    #[test]
    fn uma_volta_de_cada_vez() {
        // uma bandeira só deste teste: os testes correm em paralelo com o da fila (services/tests.rs)
        static TESTE: AtomicBool = AtomicBool::new(false);
        let a = Vez::tentar(&TESTE);
        assert!(a.is_some());
        assert!(Vez::tentar(&TESTE).is_none());
        drop(a);
        assert!(Vez::tentar(&TESTE).is_some());
    }
}
