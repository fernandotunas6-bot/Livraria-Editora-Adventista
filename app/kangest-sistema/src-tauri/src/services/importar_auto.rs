// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A importação automática do KIGEST (docs/MIGRACAO-KIGEST.md §Importação automática).
//!
//! Enquanto uma loja ainda usa o KIGEST, o KanGest vai buscar sozinho o que lá entrou: os documentos, os pagamentos,
//! os fechos de caixa, o stock, os clientes. A importação já é repetível (o que já entrou não se duplica), por isso cada
//! volta é a importação normal, com a ligação guardada.
//!
//! - **Automático:** de `intervalo_min` em `intervalo_min` minutos (por omissão 60) e pouco depois de arrancar. Só no
//!   servidor da loja, em nome de quem a ligou. Cada volta fica com o relatório e a conferência dia a dia, e avisa no
//!   computador quando há diferenças ou um erro.
//! - **Manual:** ligar e desligar, o intervalo, o que se importa, «Importar agora» e a importação de sempre no ecrã.
//! - A senha do SQL Server fica cifrada com a chave mestra deste computador (segredos.rs); nunca volta ao ecrã.
//! - Por omissão não mexe na empresa, nos utilizadores nem nos recursos humanos (acertam-se uma vez, à mão): pode mudar-se.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::state::{AppState, Contexto, CONTEXTO};

const CHAVE: &str = "importar.automatico";
const PERMISSAO: &str = "sistema.importar";
pub const INTERVALO_OMISSAO: i64 = 60;
const INTERVALO_MIN: i64 = 15;
const INTERVALO_MAX: i64 = 1440;

/// Uma importação de cada vez (o ciclo e o «Importar agora» podiam cruzar-se).
static A_CORRER: AtomicBool = AtomicBool::new(false);

async fn ler(pool: &SqlitePool) -> AppResult<Value> {
    let v: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(CHAVE).fetch_optional(pool).await?;
    Ok(v.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null))
}

async fn gravar(pool: &SqlitePool, v: &Value) -> AppResult<()> {
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(CHAVE)
        .bind(v.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

/// O intervalo pedido, dentro dos limites (15 minutos a 24 horas).
pub fn intervalo(pedido: Option<i64>) -> i64 {
    pedido.unwrap_or(INTERVALO_OMISSAO).clamp(INTERVALO_MIN, INTERVALO_MAX)
}

/// Está na hora: ligada e passaram `intervalo_min` minutos desde a última volta (ou nunca correu).
pub fn devida(cfg: &Value, agora: chrono::NaiveDateTime) -> bool {
    if cfg["ativo"].as_bool() != Some(true) {
        return false;
    }
    let Some(ultima) = cfg["ultima"].as_str().and_then(|t| chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S").ok()) else {
        return true;
    };
    agora - ultima >= chrono::Duration::minutes(intervalo(cfg["intervalo_min"].as_i64())) || agora < ultima
}

/// O estado para o ecrã: sem a senha.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let cfg = ler(&st.pool).await?;
    let utilizador: Option<String> = match cfg["utilizador_id"].as_i64() {
        Some(id) => sqlx::query_scalar("SELECT nome FROM utilizadores WHERE id = ?").bind(id).fetch_optional(&st.pool).await?,
        None => None,
    };
    Ok(json!({
        "ativo": cfg["ativo"].as_bool() == Some(true),
        "intervalo_min": intervalo(cfg["intervalo_min"].as_i64()),
        "servidor": cfg["conexao"]["servidor"],
        "base": cfg["conexao"]["base"],
        "com_senha": cfg["senha_cifrada"].as_str().is_some_and(|s| !s.is_empty()) || cfg["conexao"]["ini"].is_string(),
        "opcoes": cfg["opcoes"],
        "utilizador": utilizador,
        "ultima": cfg["ultima"],
        "ultimo": cfg["ultimo"],
        "a_correr": A_CORRER.load(Ordering::Relaxed),
        "servidor_da_loja": !crate::rede::config().cliente(),
    }))
}

#[derive(Deserialize)]
pub struct GuardarIn {
    ativo: bool,
    /// A ligação do ecrã (servidor, instância, porta, base, utilizador, senha ou o Conexao.ini). Sem ela, fica a guardada.
    #[serde(default)]
    conexao: Option<Value>,
    /// O que se importa (as opções da importação). Sem elas, as de omissão da importação automática.
    #[serde(default)]
    opcoes: Option<Value>,
    #[serde(default)]
    intervalo_min: Option<i64>,
}

/// As opções de omissão: tudo menos a empresa, os utilizadores e os recursos humanos.
fn opcoes_de_omissao() -> Value {
    json!({ "empresa": false, "utilizadores": false, "rh": false, "simular": false })
}

/// Liga, desliga ou muda a importação automática. Quem a liga fica como quem importa (a auditoria fica em nome dele).
pub async fn guardar(st: &AppState, g: GuardarIn) -> AppResult<Value> {
    let s = st.exigir_perm(PERMISSAO)?;
    let mut cfg = ler(&st.pool).await?;
    if !cfg.is_object() {
        cfg = json!({});
    }
    if let Some(mut c) = g.conexao.filter(|c| c.is_object()) {
        if c["servidor"].as_str().unwrap_or_default().trim().is_empty() || c["base"].as_str().unwrap_or_default().trim().is_empty() {
            return Err(AppError::msg("Indique o servidor e a base do KIGEST (ex.: DESKTOP-LOJA e KigestGC)."));
        }
        // a senha sai da ligação e fica cifrada à parte; sem senha nova, fica a anterior
        let senha = c["senha"].as_str().unwrap_or_default().to_string();
        if let Some(m) = c.as_object_mut() {
            m.remove("senha");
        }
        if !senha.is_empty() {
            cfg["senha_cifrada"] = json!(crate::segredos::cifrar(&senha));
        }
        cfg["conexao"] = c;
    }
    if g.ativo && !cfg["conexao"].is_object() {
        return Err(AppError::msg("Primeiro ligue e analise a base do KIGEST, acima: a importação automática usa essa ligação."));
    }
    if let Some(o) = g.opcoes.filter(|o| o.is_object()) {
        cfg["opcoes"] = o;
    } else if !cfg["opcoes"].is_object() {
        cfg["opcoes"] = opcoes_de_omissao();
    }
    cfg["opcoes"]["simular"] = json!(false);
    cfg["ativo"] = json!(g.ativo);
    cfg["intervalo_min"] = json!(intervalo(g.intervalo_min.or(cfg["intervalo_min"].as_i64())));
    cfg["utilizador_id"] = json!(s.id);
    gravar(&st.pool, &cfg).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'IMPORTAR', ?)")
        .bind(s.id)
        .bind(if g.ativo {
            format!("Importação automática do KIGEST ligada, de {} em {} minutos", cfg["intervalo_min"], cfg["intervalo_min"])
        } else {
            "Importação automática do KIGEST desligada".to_string()
        })
        .execute(&st.pool)
        .await?;
    estado(st).await
}

/// O resumo de uma volta: as contagens, os dias conferidos e os dias com diferenças.
pub fn resumo(relatorio: &Value) -> Value {
    let conferencia = relatorio["conferencia"].as_array().cloned().unwrap_or_default();
    let dias = conferencia.iter().find(|c| c["item"] == "Dias com as mesmas vendas");
    let comparados = dias.and_then(|d| d["kigest"].as_i64()).unwrap_or(0);
    let iguais = dias.and_then(|d| d["kigest_novo"].as_i64()).unwrap_or(0);
    json!({
        "contagens": relatorio["contagens"].as_array().map(|c| c.iter().take(30).cloned().collect::<Vec<_>>()).unwrap_or_default(),
        "avisos": relatorio["avisos"].as_array().map(|a| a.iter().take(20).cloned().collect::<Vec<_>>()).unwrap_or_default(),
        "dias_conferidos": comparados,
        "dias_iguais": iguais,
        "dias_diferentes": comparados - iguais,
        "por_dia": dias.map(|d| d["por_dia"].clone()).unwrap_or(json!([])),
    })
}

/// Uma volta com a configuração guardada (já no contexto de quem importa).
async fn correr(st: &AppState, cfg: &Value) -> AppResult<Value> {
    let mut conexao = cfg["conexao"].clone();
    if let Some(c) = cfg["senha_cifrada"].as_str().filter(|c| !c.is_empty()) {
        conexao["senha"] = json!(crate::segredos::decifrar(c).map_err(AppError::msg)?);
    }
    let mut opcoes = if cfg["opcoes"].is_object() { cfg["opcoes"].clone() } else { opcoes_de_omissao() };
    opcoes["simular"] = json!(false);
    crate::services::importar::executar_guardado(st, conexao, opcoes).await
}

/// Corre uma volta e regista o resultado (ok ou erro). Uma de cada vez.
async fn volta(st: &AppState, cfg: Value) -> AppResult<Value> {
    if A_CORRER.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
        return Err(AppError::msg("Já está a decorrer uma importação do KIGEST."));
    }
    let r = correr(st, &cfg).await;
    A_CORRER.store(false, Ordering::Release);
    let mut novo = ler(&st.pool).await?;
    if !novo.is_object() {
        novo = cfg.clone();
    }
    novo["ultima"] = json!(crate::db::agora());
    novo["ultimo"] = match &r {
        Ok(rel) => json!({ "ok": true, "em": crate::db::agora(), "resumo": resumo(rel) }),
        Err(e) => json!({ "ok": false, "em": crate::db::agora(), "erro": e.to_string() }),
    };
    gravar(&st.pool, &novo).await?;
    r
}

/// «Importar agora», com a ligação guardada.
pub async fn agora(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let cfg = ler(&st.pool).await?;
    if !cfg["conexao"].is_object() {
        return Err(AppError::msg("Ainda não há ligação guardada para a importação automática."));
    }
    let r = volta(st, cfg).await?;
    Ok(json!({ "relatorio": r, "estado": estado(st).await? }))
}

/// A sessão de quem ligou a importação, para a volta em segundo plano correr em nome dele (as permissões e a auditoria).
async fn contexto_de(st: &AppState, utilizador_id: i64) -> AppResult<Contexto> {
    let row = sqlx::query("SELECT * FROM utilizadores WHERE id = ? AND ativo = 1")
        .bind(utilizador_id)
        .fetch_optional(&st.pool)
        .await?
        .ok_or_else(|| AppError::msg("O utilizador que ligou a importação automática já não está activo: ligue-a outra vez."))?;
    let sessao = crate::services::auth::sessao_de(st, &row).await;
    Ok(Contexto { sessao: Arc::new(Mutex::new(Some(sessao))), posto: st.posto(), api_chave: None, pela_internet: false, ligacao: None })
}

/// O ciclo em segundo plano: só no servidor da loja (num posto em rede, a base está no servidor).
pub fn iniciar(st: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        // deixa acabar o arranque antes da primeira volta
        tokio::time::sleep(std::time::Duration::from_secs(120)).await;
        loop {
            if !crate::rede::config().cliente() {
                if let Err(e) = uma_volta(&st).await {
                    eprintln!("Importação automática do KIGEST: {e}");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

async fn uma_volta(st: &AppState) -> AppResult<()> {
    let cfg = ler(&st.pool).await?;
    if !devida(&cfg, chrono::Local::now().naive_local()) {
        return Ok(());
    }
    let Some(uid) = cfg["utilizador_id"].as_i64() else { return Ok(()) };
    let ctx = match contexto_de(st, uid).await {
        Ok(c) => c,
        Err(e) => {
            // sem quem importe, desliga-se e diz-se porquê
            let mut novo = cfg.clone();
            novo["ativo"] = json!(false);
            novo["ultimo"] = json!({ "ok": false, "em": crate::db::agora(), "erro": e.to_string() });
            gravar(&st.pool, &novo).await?;
            crate::nativo::notificar("kigest-importacao", "Importação do KIGEST desligada", &e.to_string());
            return Ok(());
        }
    };
    let r = CONTEXTO.scope(ctx, volta(st, cfg)).await;
    match r {
        Ok(rel) => {
            let s = resumo(&rel);
            let diferentes = s["dias_diferentes"].as_i64().unwrap_or(0);
            if diferentes > 0 {
                crate::nativo::notificar(
                    "kigest-importacao",
                    "Importação do KIGEST: há diferenças",
                    &format!("{diferentes} dia(s) com vendas diferentes entre o KIGEST e o KanGest. Veja em Sistema → Importar dados."),
                );
            }
        }
        Err(e) => crate::nativo::notificar("kigest-importacao", "A importação do KIGEST falhou", &e.to_string()),
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    fn hora(t: &str) -> chrono::NaiveDateTime {
        chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S").unwrap()
    }

    #[test]
    fn quando_volta_a_importar() {
        let agora = hora("2026-11-25T12:00:00");
        assert!(!devida(&json!({}), agora), "desligada");
        assert!(devida(&json!({ "ativo": true }), agora), "nunca correu");
        assert!(!devida(&json!({ "ativo": true, "intervalo_min": 60, "ultima": "2026-11-25T11:30:00" }), agora));
        assert!(devida(&json!({ "ativo": true, "intervalo_min": 60, "ultima": "2026-11-25T11:00:00" }), agora));
        // o relógio andou para trás: corre já, para não ficar dias à espera
        assert!(devida(&json!({ "ativo": true, "intervalo_min": 60, "ultima": "2026-11-26T09:00:00" }), agora));
        assert_eq!((intervalo(None), intervalo(Some(1)), intervalo(Some(99999))), (60, 15, 1440));
    }

    #[test]
    fn resumo_da_volta() {
        let rel = json!({
            "contagens": [{ "conjunto": "Documentos", "registos": 12 }],
            "conferencia": [
                { "item": "Dias com as mesmas vendas", "kigest": 30, "kigest_novo": 29, "por_dia": [{ "dia": "2026-11-24" }] },
            ],
        });
        let s = resumo(&rel);
        assert_eq!((s["dias_conferidos"].as_i64(), s["dias_iguais"].as_i64(), s["dias_diferentes"].as_i64()), (Some(30), Some(29), Some(1)));
        assert_eq!(s["por_dia"][0]["dia"], "2026-11-24");
        assert_eq!(s["contagens"][0]["registos"], 12);
    }
}
