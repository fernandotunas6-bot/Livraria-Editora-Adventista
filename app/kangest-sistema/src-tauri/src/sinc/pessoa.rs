// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As pessoas no KanGest com a conta do site (Livraria → Loja online; docs/LOJA-ONLINE.md).
//!
//! Para alterar uma encomenda a partir do KanGest, cada pessoa entra com a **sua** conta do site: o email, a senha e o
//! código MFA, se o tiver. Cada alteração vai com a sessão dela, pelos mesmos caminhos do painel do site, com as
//! permissões dela e os avisos ao cliente:
//! - confirmar, pelo PostgREST (com a RLS);
//! - os passos da entrega, o «entregue» com o pagamento recebido e o cancelamento, por `POST /delivery-event`.
//!
//! A sessão é de cada utilizador deste KanGest, cifrada com a chave mestra (segredos.rs). Renova-se sozinha e acaba ao
//! fim de 12 horas (um turno), ao sair ou ao desligar a ligação. Sem Internet, a alteração fica em `loja_comandos`, em
//! nome de quem a fez, e sai quando a ligação voltar (o ciclo de mod.rs chama `enviar_comandos`).

use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Quanto dura uma sessão do site no KanGest: um turno.
pub const TURNO: i64 = 12 * 3600;

/// As alterações que se podem pedir e o estado da entrega de cada uma (o mesmo do painel; «pronta» é o `shipped` de
/// uma encomenda de levantamento, como o site a mostra ao cliente). `confirmar` vai pelo PostgREST.
pub fn estado_da_entrega(accao: &str) -> Option<&'static str> {
    match accao {
        "preparar" => Some("preparing"),
        "pronta" | "enviada" => Some("shipped"),
        "entregue" => Some("delivered"),
        "cancelar" => Some("cancelled"),
        _ => None,
    }
}

pub fn accao_valida(accao: &str) -> bool {
    accao == "confirmar" || estado_da_entrega(accao).is_some()
}

/// O id de uma encomenda do site só tem letras e algarismos: vai num endereço do PostgREST.
pub fn id_valido(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn turno_acabou(entrou_em: i64, agora: i64) -> bool {
    agora - entrou_em > TURNO
}

/// O nível de autenticação (`aal1`, `aal2`) que vem no token do Supabase.
pub fn aal(token: &str) -> String {
    token
        .split('.')
        .nth(1)
        .and_then(|p| URL_SAFE_NO_PAD.decode(p.trim_end_matches('=')).ok())
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v["aal"].as_str().map(str::to_string))
        .unwrap_or_default()
}

/// A mensagem do Supabase Auth ou do site, em português para os casos mais comuns.
pub fn mensagem(v: &Value, estado: u16) -> String {
    let m = ["error_description", "msg", "message", "error"].iter().find_map(|k| v[*k].as_str()).unwrap_or_default().to_string();
    let baixo = m.to_ascii_lowercase();
    if baixo.contains("invalid login credentials") {
        "Email ou senha errados.".into()
    } else if baixo.contains("email not confirmed") {
        "Confirme primeiro o email da conta do site.".into()
    } else if baixo.contains("invalid totp") || baixo.contains("invalid mfa") || (baixo.contains("code") && baixo.contains("invalid")) {
        "Código errado ou fora de tempo: use o código que a aplicação mostra agora.".into()
    } else if m.is_empty() {
        format!("O site respondeu {estado}.")
    } else {
        m
    }
}

fn agora_s() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tokens {
    pub access: String,
    pub refresh: String,
    /// segundos Unix
    pub expira: i64,
}

pub(super) fn tokens_da_resposta(v: &Value) -> Option<Tokens> {
    Some(Tokens {
        access: v["access_token"].as_str()?.to_string(),
        refresh: v["refresh_token"].as_str()?.to_string(),
        expira: agora_s() + v["expires_in"].as_i64().unwrap_or(3600),
    })
}

/// Porque é que uma alteração não foi.
#[derive(Debug)]
pub enum Erro {
    /// Sem resposta: fica na fila.
    SemLigacao(String),
    /// Sem sessão do site (ou acabou): a pessoa tem de entrar outra vez.
    SemSessao(String),
    /// O site respondeu que não (permissões, estado da encomenda, falta o pagamento…).
    Recusado(String),
}

impl From<AppError> for Erro {
    fn from(e: AppError) -> Self {
        Erro::Recusado(e.to_string())
    }
}

impl Erro {
    pub(super) fn texto(&self) -> String {
        match self {
            Erro::SemLigacao(m) => format!("Sem ligação ao site: {m}"),
            Erro::SemSessao(m) | Erro::Recusado(m) => m.clone(),
        }
    }
}

pub(super) struct Auth {
    pub(super) url: String,
    pub(super) apikey: String,
    funcoes: String,
}

pub(super) async fn auth(pool: &SqlitePool) -> AppResult<Auth> {
    let Some((funcoes, url, apikey)) =
        sqlx::query_as::<_, (String, String, String)>("SELECT url, auth_url, auth_apikey FROM sinc_ligacao WHERE id = 1 AND ativa = 1")
            .fetch_optional(pool)
            .await?
    else {
        return Err(AppError::msg("Este KanGest não está ligado ao site: ligue-o em Livraria → Ligação ao site."));
    };
    if url.is_empty() || apikey.is_empty() {
        return Err(AppError::msg(
            "O site ainda não mandou o que é preciso para entrar: sincronize em Livraria → Ligação ao site (e, no site, confirme o KANGEST_CHAVE_PUBLICA_SITE).",
        ));
    }
    Ok(Auth { url: url.trim_end_matches('/').to_string(), apikey, funcoes })
}

pub(super) async fn pedido(metodo: &'static str, url: String, cabecalhos: Vec<(&'static str, String)>, corpo: Option<Value>) -> Result<(u16, Value), Erro> {
    let corpo = corpo.map(|c| c.to_string().into_bytes());
    let r = tokio::task::spawn_blocking(move || crate::http::pedido(metodo, &url, &cabecalhos, corpo.as_deref(), Duration::from_secs(30)))
        .await
        .map_err(|e| Erro::SemLigacao(e.to_string()))?
        .map_err(|e| Erro::SemLigacao(e.to_string()))?;
    Ok((r.estado, serde_json::from_slice(&r.corpo).unwrap_or(Value::Null)))
}

pub(super) fn cabecalhos(apikey: &str, token: Option<&str>) -> Vec<(&'static str, String)> {
    let mut c = vec![("apikey", apikey.to_string()), ("Content-Type", "application/json".to_string()), ("Accept", "application/json".to_string())];
    if let Some(t) = token {
        c.push(("Authorization", format!("Bearer {t}")));
    }
    c
}

// ---------------------------------------------------------------------------------------------------------------
// A sessão de cada pessoa
// ---------------------------------------------------------------------------------------------------------------

pub(crate) async fn guardar(pool: &SqlitePool, utilizador: i64, email: &str, t: &Tokens, factor_id: &str, entrou_em: i64) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO sessoes_site (utilizador_id, email, sessao, factor_id, entrou_em, actualizada_em) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(utilizador_id) DO UPDATE SET email = excluded.email, sessao = excluded.sessao, factor_id = excluded.factor_id,
           entrou_em = excluded.entrou_em, actualizada_em = excluded.actualizada_em",
    )
    .bind(utilizador)
    .bind(email)
    .bind(crate::segredos::cifrar(&serde_json::to_string(t)?))
    .bind(factor_id)
    .bind(entrou_em)
    .bind(agora_s())
    .execute(pool)
    .await?;
    Ok(())
}

struct Sessao {
    email: String,
    tokens: Tokens,
    factor_id: String,
    entrou_em: i64,
}

async fn sessao_de(pool: &SqlitePool, utilizador: i64) -> AppResult<Option<Sessao>> {
    let Some((email, cifrada, factor_id, entrou_em)) =
        sqlx::query_as::<_, (String, String, String, i64)>("SELECT email, sessao, factor_id, entrou_em FROM sessoes_site WHERE utilizador_id = ?")
            .bind(utilizador)
            .fetch_optional(pool)
            .await?
    else {
        return Ok(None);
    };
    let Some(tokens) = crate::segredos::decifrar(&cifrada).ok().and_then(|s| serde_json::from_str::<Tokens>(&s).ok()) else {
        apagar_sessao(pool, utilizador).await?;
        return Ok(None);
    };
    Ok(Some(Sessao { email, tokens, factor_id, entrou_em }))
}

pub(super) async fn apagar_sessao(pool: &SqlitePool, utilizador: i64) -> AppResult<()> {
    sqlx::query("DELETE FROM sessoes_site WHERE utilizador_id = ?").bind(utilizador).execute(pool).await?;
    Ok(())
}

/// Um token válido da pessoa: renova-o se faltar menos de um minuto; ao fim do turno, a sessão acaba.
pub(super) async fn token_valido(pool: &SqlitePool, a: &Auth, utilizador: i64) -> Result<String, Erro> {
    let Some(s) = sessao_de(pool, utilizador).await? else {
        return Err(Erro::SemSessao("Entre com a sua conta do site para alterar encomendas (Livraria → Loja online).".into()));
    };
    if !s.factor_id.is_empty() {
        return Err(Erro::SemSessao("Falta o código da aplicação de autenticação para acabar de entrar.".into()));
    }
    let agora = agora_s();
    if turno_acabou(s.entrou_em, agora) {
        apagar_sessao(pool, utilizador).await?;
        return Err(Erro::SemSessao("A sessão do site acabou (dura 12 horas): entre outra vez.".into()));
    }
    if s.tokens.expira - agora > 60 {
        return Ok(s.tokens.access);
    }
    let (estado, v) = pedido(
        "POST",
        format!("{}/auth/v1/token?grant_type=refresh_token", a.url),
        cabecalhos(&a.apikey, None),
        Some(json!({ "refresh_token": s.tokens.refresh })),
    )
    .await?;
    match (estado, tokens_da_resposta(&v)) {
        (200, Some(t)) => {
            guardar(pool, utilizador, &s.email, &t, "", s.entrou_em).await?;
            Ok(t.access)
        }
        _ => {
            apagar_sessao(pool, utilizador).await?;
            Err(Erro::SemSessao("A sessão do site já não vale: entre outra vez.".into()))
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// As alterações
// ---------------------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comando {
    pub encomenda_id: String,
    pub accao: String,
    /// `payment` ({amount, methodCode, reference, collectedBy}) ou `unpaidReason`, no «entregue»
    #[serde(default)]
    pub dados: Value,
}

/// Faz a alteração no site, em nome da pessoa.
async fn executar(pool: &SqlitePool, a: &Auth, utilizador: i64, c: &Comando) -> Result<Value, Erro> {
    if !id_valido(&c.encomenda_id) || !accao_valida(&c.accao) {
        return Err(Erro::Recusado("Alteração desconhecida.".into()));
    }
    let token = token_valido(pool, a, utilizador).await?;
    let (estado, v) = if c.accao == "confirmar" {
        let mut cab = cabecalhos(&a.apikey, Some(&token));
        cab.push(("Prefer", "return=representation".into()));
        pedido("PATCH", format!("{}/rest/v1/orders?id=eq.{}", a.url, c.encomenda_id), cab, Some(json!({ "status": "confirmed" }))).await?
    } else {
        let mut corpo = json!({ "orderId": c.encomenda_id, "status": estado_da_entrega(&c.accao) });
        for k in ["payment", "unpaidReason"] {
            if !c.dados[k].is_null() {
                corpo[k] = c.dados[k].clone();
            }
        }
        pedido("POST", format!("{}/delivery-event", a.funcoes), cabecalhos(&a.apikey, Some(&token)), Some(corpo)).await?
    };
    match estado {
        200 | 201 if c.accao == "confirmar" && v.as_array().is_some_and(|l| l.is_empty()) => {
            Err(Erro::Recusado("O site não deixou: a sua conta não pode mudar esta encomenda (ou ela já não existe).".into()))
        }
        200..=299 => Ok(v),
        401 => {
            apagar_sessao(pool, utilizador).await?;
            Err(Erro::SemSessao("A sessão do site não vale: entre outra vez.".into()))
        }
        _ => Err(Erro::Recusado(mensagem(&v, estado))),
    }
}

/// Envia as alterações que ficaram à espera de Internet, pela ordem em que foram feitas. Pára na primeira sem ligação.
pub async fn enviar_comandos(pool: &SqlitePool) -> AppResult<usize> {
    let pendentes: Vec<(i64, i64, String, String, String)> = sqlx::query_as(
        "SELECT id, utilizador_id, encomenda_id, accao, dados FROM loja_comandos WHERE estado = 'pendente' ORDER BY id LIMIT 20",
    )
    .fetch_all(pool)
    .await?;
    if pendentes.is_empty() {
        return Ok(0);
    }
    let a = auth(pool).await?;
    let mut feitos = 0;
    for (id, utilizador, encomenda_id, accao, dados) in pendentes {
        let c = Comando { encomenda_id, accao, dados: serde_json::from_str(&dados).unwrap_or(Value::Null) };
        match executar(pool, &a, utilizador, &c).await {
            Ok(_) => {
                sqlx::query("UPDATE loja_comandos SET estado = 'feito', feito_em = ?, erro = '' WHERE id = ?").bind(crate::db::agora()).bind(id).execute(pool).await?;
                feitos += 1;
            }
            Err(Erro::SemLigacao(_)) => break,
            Err(e) => {
                sqlx::query("UPDATE loja_comandos SET estado = 'erro', tentativas = tentativas + 1, erro = ? WHERE id = ?")
                    .bind(e.texto().chars().take(300).collect::<String>())
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
    }
    Ok(feitos)
}

/// Há alterações à espera (para o ciclo não esperar os 2 minutos da sondagem).
pub async fn ha_comandos(pool: &SqlitePool) -> AppResult<bool> {
    Ok(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM loja_comandos WHERE estado = 'pendente'").fetch_one(pool).await? > 0)
}

/// Ao desligar a ligação: as sessões e as alterações por enviar saem.
pub async fn apagar_tudo(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sessoes_site").execute(pool).await?;
    sqlx::query("DELETE FROM loja_comandos WHERE estado <> 'feito'").execute(pool).await?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------
// Os métodos do ecrã
// ---------------------------------------------------------------------------------------------------------------

#[derive(Deserialize)]
struct EntrarIn {
    email: String,
    senha: String,
}

#[derive(Deserialize)]
struct CodigoIn {
    codigo: String,
}

#[derive(Deserialize)]
struct AccaoIn {
    id: String,
    accao: String,
    #[serde(default)]
    pagamento: Value,
    #[serde(default)]
    motivo: String,
}

async fn conta(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let pendentes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM loja_comandos WHERE utilizador_id = ? AND estado = 'pendente'")
        .bind(s.id)
        .fetch_one(&st.pool)
        .await?;
    let sessao = sessao_de(&st.pool, s.id).await?;
    let valida = sessao.as_ref().is_some_and(|x| !turno_acabou(x.entrou_em, agora_s()));
    Ok(json!({
        "entrou": valida && sessao.as_ref().is_some_and(|x| x.factor_id.is_empty()),
        "falta_codigo": valida && sessao.as_ref().is_some_and(|x| !x.factor_id.is_empty()),
        "email": sessao.as_ref().map(|x| x.email.clone()),
        "aal": sessao.as_ref().map(|x| aal(&x.tokens.access)),
        "acaba_em": sessao.as_ref().map(|x| x.entrou_em + TURNO),
        "pendentes": pendentes,
    }))
}

async fn entrar(st: &AppState, e: EntrarIn) -> AppResult<Value> {
    super::loja::permitir(st)?;
    let s = st.sessao()?;
    let email = e.email.trim().to_lowercase();
    if !email.contains('@') || e.senha.is_empty() {
        return Err(AppError::msg("Escreva o email e a senha da sua conta do site."));
    }
    let a = auth(&st.pool).await?;
    let (estado, v) = pedido(
        "POST",
        format!("{}/auth/v1/token?grant_type=password", a.url),
        cabecalhos(&a.apikey, None),
        Some(json!({ "email": email, "password": e.senha })),
    )
    .await
    .map_err(|e| AppError::msg(e.texto()))?;
    let Some(t) = tokens_da_resposta(&v).filter(|_| estado == 200) else {
        return Err(AppError::msg(mensagem(&v, estado)));
    };
    // com MFA, a sessão só serve depois do código (aal2), como no painel
    let factor = v["user"]["factors"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|f| f["status"] == "verified" && f["factor_type"] == "totp")
        .and_then(|f| f["id"].as_str())
        .unwrap_or_default()
        .to_string();
    guardar(&st.pool, s.id, &email, &t, &factor, agora_s()).await?;
    conta(st).await
}

async fn codigo(st: &AppState, c: CodigoIn) -> AppResult<Value> {
    let s = st.sessao()?;
    let codigo: String = c.codigo.chars().filter(char::is_ascii_digit).collect();
    if codigo.len() != 6 {
        return Err(AppError::msg("O código tem 6 algarismos."));
    }
    let Some(x) = sessao_de(&st.pool, s.id).await?.filter(|x| !x.factor_id.is_empty()) else {
        return Err(AppError::msg("Entre primeiro com o email e a senha."));
    };
    let a = auth(&st.pool).await?;
    let base = format!("{}/auth/v1/factors/{}", a.url, x.factor_id);
    let (estado, v) = pedido("POST", format!("{base}/challenge"), cabecalhos(&a.apikey, Some(&x.tokens.access)), Some(json!({})))
        .await
        .map_err(|e| AppError::msg(e.texto()))?;
    let Some(desafio) = v["id"].as_str().filter(|_| estado == 200) else {
        return Err(AppError::msg(mensagem(&v, estado)));
    };
    let (estado, v) = pedido(
        "POST",
        format!("{base}/verify"),
        cabecalhos(&a.apikey, Some(&x.tokens.access)),
        Some(json!({ "challenge_id": desafio, "code": codigo })),
    )
    .await
    .map_err(|e| AppError::msg(e.texto()))?;
    let Some(t) = tokens_da_resposta(&v).filter(|_| estado == 200) else {
        return Err(AppError::msg(mensagem(&v, estado)));
    };
    guardar(&st.pool, s.id, &x.email, &t, "", x.entrou_em).await?;
    conta(st).await
}

async fn sair(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    if let (Some(x), Ok(a)) = (sessao_de(&st.pool, s.id).await?, auth(&st.pool).await) {
        // acaba também a sessão no site; sem Internet, acaba aqui na mesma
        let _ = pedido("POST", format!("{}/auth/v1/logout?scope=local", a.url), cabecalhos(&a.apikey, Some(&x.tokens.access)), None).await;
    }
    apagar_sessao(&st.pool, s.id).await?;
    conta(st).await
}

/// Uma alteração a uma encomenda: vai já, ou, sem Internet, fica na fila em nome desta pessoa.
async fn accao(st: &AppState, i: AccaoIn) -> AppResult<Value> {
    super::loja::permitir(st)?;
    let s = st.sessao()?;
    if !id_valido(&i.id) || !accao_valida(&i.accao) {
        return Err(AppError::msg("Alteração desconhecida."));
    }
    let mut dados = json!({});
    if i.accao == "entregue" {
        if i.pagamento.is_object() {
            dados["payment"] = i.pagamento.clone();
        } else if i.motivo.trim().chars().count() >= 5 {
            dados["unpaidReason"] = json!(i.motivo.trim());
        }
    }
    let c = Comando { encomenda_id: i.id.clone(), accao: i.accao.clone(), dados };
    let a = auth(&st.pool).await?;
    match executar(&st.pool, &a, s.id, &c).await {
        Ok(v) => {
            // a cópia local fica já com a alteração
            let _ = super::sincronizar_ja(st).await;
            Ok(json!({ "feito": true, "aviso": v["notice"].as_str() }))
        }
        Err(Erro::SemLigacao(_)) => {
            let numero: Option<String> = sqlx::query_scalar("SELECT numero FROM loja_encomendas WHERE id = ?").bind(&c.encomenda_id).fetch_optional(&st.pool).await?;
            sqlx::query("INSERT INTO loja_comandos (utilizador_id, encomenda_id, numero, accao, dados) VALUES (?, ?, ?, ?, ?)")
                .bind(s.id)
                .bind(&c.encomenda_id)
                .bind(numero.unwrap_or_default())
                .bind(&c.accao)
                .bind(c.dados.to_string())
                .execute(&st.pool)
                .await?;
            Ok(json!({ "feito": false, "na_fila": true }))
        }
        Err(e) => Err(AppError::msg(e.texto())),
    }
}

async fn comandos(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let linhas = sqlx::query(
        "SELECT id, numero, accao, estado, erro, criado_em, feito_em FROM loja_comandos
          WHERE utilizador_id = ? AND (estado <> 'feito' OR feito_em >= strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-1 day'))
          ORDER BY id DESC LIMIT 50",
    )
    .bind(s.id)
    .fetch_all(&st.pool)
    .await?;
    Ok(Value::Array(linhas.iter().map(crate::db::row_json).collect()))
}

async fn repetir(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    sqlx::query("UPDATE loja_comandos SET estado = 'pendente', erro = '' WHERE utilizador_id = ? AND estado = 'erro'").bind(s.id).execute(&st.pool).await?;
    let _ = super::sincronizar_ja(st).await;
    comandos(st).await
}

/// Os métodos de pagamento activos do site, para o «entregue» com o dinheiro recebido (rota pública do site).
async fn metodos(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let a = auth(&st.pool).await?;
    match pedido("GET", format!("{}/payment-methods", a.funcoes), vec![("Accept", "application/json".to_string())], None).await {
        Ok((200, v)) => Ok(v),
        _ => Ok(json!([])),
    }
}

/// Despachante dos métodos `loja.conta.*` (loja.rs).
pub async fn despachar(st: &AppState, metodo: &str, params: Value) -> AppResult<Value> {
    match metodo {
        "estado" => conta(st).await,
        "entrar" => entrar(st, serde_json::from_value(params)?).await,
        "codigo" => codigo(st, serde_json::from_value(params)?).await,
        "sair" => sair(st).await,
        "accao" => accao(st, serde_json::from_value(params)?).await,
        "comandos" => comandos(st).await,
        "repetir" => repetir(st).await,
        "metodos" => metodos(st).await,
        _ => Err(AppError::msg(format!("Método desconhecido: loja.conta.{metodo}"))),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn accoes_e_estados_da_entrega() {
        assert_eq!(estado_da_entrega("pronta"), Some("shipped"));
        assert_eq!(estado_da_entrega("entregue"), Some("delivered"));
        assert_eq!(estado_da_entrega("cancelar"), Some("cancelled"));
        assert_eq!(estado_da_entrega("confirmar"), None);
        assert!(accao_valida("confirmar") && accao_valida("preparar"));
        assert!(!accao_valida("apagar") && !accao_valida(""));
    }

    #[test]
    fn ids_que_podem_ir_num_endereco() {
        assert!(id_valido("abc123XYZ") && id_valido("o-1_2"));
        assert!(!id_valido("") && !id_valido("a&id=eq.b") && !id_valido("a b") && !id_valido(&"x".repeat(65)));
    }

    #[test]
    fn turno_de_12_horas() {
        assert!(!turno_acabou(1000, 1000 + TURNO));
        assert!(turno_acabou(1000, 1000 + TURNO + 1));
    }

    #[test]
    fn nivel_do_token() {
        let corpo = URL_SAFE_NO_PAD.encode(br#"{"sub":"u1","aal":"aal2"}"#);
        assert_eq!(aal(&format!("cabecalho.{corpo}.assinatura")), "aal2");
        assert_eq!(aal("nao-e-um-token"), "");
    }

    #[test]
    fn mensagens_em_portugues() {
        assert_eq!(mensagem(&json!({ "error_description": "Invalid login credentials" }), 400), "Email ou senha errados.");
        assert_eq!(mensagem(&json!({ "msg": "Invalid TOTP code entered" }), 422), "Código errado ou fora de tempo: use o código que a aplicação mostra agora.");
        assert_eq!(mensagem(&json!({ "message": "Esta encomenda tem 5 700 Kz por receber." }), 409), "Esta encomenda tem 5 700 Kz por receber.");
        assert_eq!(mensagem(&Value::Null, 502), "O site respondeu 502.");
    }
}
