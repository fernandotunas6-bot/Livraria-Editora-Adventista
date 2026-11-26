// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Entrar no KanGest Livraria com a conta do site (parte J; docs/ENTRADA-COM-A-CONTA-DO-SITE.md).
//!
//! Quem tem no site a permissão «KanGest: caixa» ou «KanGest: gestor» entra aqui com o email, a senha e, se a conta
//! tem os dois passos, o código. Este módulo só fala com o site: confirma a senha e o código no Supabase Auth e
//! pergunta quem é a pessoa (`public.kangest_eu`, com a sessão dela). A sessão do programa, a cópia local e as regras
//! de sempre (bloqueio por tentativas, conta desactivada, troca de conta) ficam em services/auth.rs.
//!
//! O perfil Administrador nunca vem do site: fica sempre a conta ADMIN local de recurso.

use chrono::NaiveDateTime;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::pessoa::{self, Erro, Tokens};
use crate::error::AppResult;

/// Sem Internet, a cópia local de uma conta do site vale estes dias desde a última entrada confirmada pelo site.
pub const DIAS_DA_COPIA: i64 = 7;

/// A pessoa, como o site a conhece.
#[derive(Debug, Clone)]
pub struct PessoaSite {
    pub id: String,
    pub nome: String,
    pub email: String,
    /// GESTOR, CAIXA ou nenhum (sem acesso ao KanGest)
    pub perfil: Option<String>,
    pub lojas: Vec<String>,
}

/// O que o site disse.
#[derive(Debug)]
pub enum Validacao {
    /// A senha (e o código) estão certos: a pessoa e a sessão do site (que fica para a Loja online).
    Confirmada { pessoa: PessoaSite, tokens: Tokens },
    /// A conta tem os dois passos: falta o código.
    PedirCodigo,
    /// O site disse que não (senha, código, conta por confirmar…).
    Recusada(String),
    /// Sem resposta do site, ou este KanGest não está ligado: a cópia local decide.
    SemLigacao(String),
}

/// O perfil do KanGest que vem do site: só Gestor ou Caixa. Qualquer outro valor (incluindo ADMIN) não dá acesso.
pub fn perfil_do_site(p: Option<&str>) -> Option<&'static str> {
    match p {
        Some("GESTOR") => Some("GESTOR"),
        Some("CAIXA") => Some("CAIXA"),
        _ => None,
    }
}

/// A cópia local ainda vale? Até `DIAS_DA_COPIA` dias depois da última confirmação pelo site. Um relógio atrasado
/// em relação a essa confirmação não conta a seu favor: a cópia deixa de valer.
pub fn copia_vale(validada_em: Option<&str>, agora: &str) -> bool {
    let ler = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").ok();
    let (Some(v), Some(a)) = (validada_em.and_then(ler), ler(agora)) else { return false };
    a >= v && a - v <= chrono::Duration::days(DIAS_DA_COPIA)
}

/// O factor TOTP verificado da conta, se o tem.
fn factor_totp(v: &Value) -> Option<String> {
    v["user"]["factors"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|f| f["status"] == "verified" && f["factor_type"] == "totp")
        .and_then(|f| f["id"].as_str())
        .map(str::to_string)
}

/// Porque é que um pedido ao site não teve resposta que sirva.
enum Falha {
    SemLigacao(String),
    Recusada(String),
}

impl From<Falha> for Validacao {
    fn from(f: Falha) -> Self {
        match f {
            Falha::SemLigacao(m) => Validacao::SemLigacao(m),
            Falha::Recusada(m) => Validacao::Recusada(m),
        }
    }
}

/// Um pedido ao site; sem resposta (ou com o site em baixo, 5xx), «sem ligação».
async fn pedir(metodo: &'static str, url: String, apikey: &str, token: Option<&str>, corpo: Value) -> Result<(u16, Value), Falha> {
    match pessoa::pedido(metodo, url, pessoa::cabecalhos(apikey, token), Some(corpo)).await {
        Ok((estado, _)) if estado >= 500 => Err(Falha::SemLigacao(format!("o site respondeu {estado}"))),
        Ok(r) => Ok(r),
        Err(Erro::SemLigacao(m)) => Err(Falha::SemLigacao(m)),
        Err(e) => Err(Falha::Recusada(e.texto())),
    }
}

/// Confirma a senha (e o código) no site e pergunta quem é a pessoa.
pub async fn validar(pool: &SqlitePool, email: &str, senha: &str, codigo: Option<&str>) -> AppResult<Validacao> {
    let a = match pessoa::auth(pool).await {
        Ok(a) => a,
        Err(e) => return Ok(Validacao::SemLigacao(e.to_string())),
    };
    let (estado, v) = match pedir("POST", format!("{}/auth/v1/token?grant_type=password", a.url), &a.apikey, None, json!({ "email": email, "password": senha })).await {
        Ok(r) => r,
        Err(x) => return Ok(x.into()),
    };
    let Some(mut tokens) = pessoa::tokens_da_resposta(&v).filter(|_| estado == 200) else {
        return Ok(Validacao::Recusada(pessoa::mensagem(&v, estado)));
    };
    // com os dois passos, a sessão só serve depois do código (aal2), como no painel
    if let Some(factor) = factor_totp(&v) {
        let codigo: String = codigo.unwrap_or_default().chars().filter(char::is_ascii_digit).collect();
        if codigo.len() != 6 {
            return Ok(Validacao::PedirCodigo);
        }
        let base = format!("{}/auth/v1/factors/{factor}", a.url);
        let (estado, v) = match pedir("POST", format!("{base}/challenge"), &a.apikey, Some(&tokens.access), json!({})).await {
            Ok(r) => r,
            Err(x) => return Ok(x.into()),
        };
        let Some(desafio) = v["id"].as_str().filter(|_| estado == 200) else {
            return Ok(Validacao::Recusada(pessoa::mensagem(&v, estado)));
        };
        let (estado, v) = match pedir("POST", format!("{base}/verify"), &a.apikey, Some(&tokens.access), json!({ "challenge_id": desafio, "code": codigo })).await {
            Ok(r) => r,
            Err(x) => return Ok(x.into()),
        };
        match pessoa::tokens_da_resposta(&v).filter(|_| estado == 200) {
            Some(t) => tokens = t,
            None => return Ok(Validacao::Recusada(pessoa::mensagem(&v, estado))),
        }
    }
    let (estado, eu) = match pedir("POST", format!("{}/rest/v1/rpc/kangest_eu", a.url), &a.apikey, Some(&tokens.access), json!({})).await {
        Ok(r) => r,
        Err(x) => return Ok(x.into()),
    };
    if estado == 404 {
        return Ok(Validacao::Recusada("O site ainda não tem a entrada do KanGest: actualize o site (migração kangest_entrada_com_a_conta).".into()));
    }
    let Some(id) = eu["id"].as_str().filter(|_| estado == 200) else {
        return Ok(Validacao::Recusada(pessoa::mensagem(&eu, estado)));
    };
    let pessoa = PessoaSite {
        id: id.to_string(),
        nome: eu["nome"].as_str().filter(|n| !n.trim().is_empty()).unwrap_or(email).trim().to_string(),
        email: eu["email"].as_str().unwrap_or(email).trim().to_lowercase(),
        perfil: eu["perfil"].as_str().map(str::to_string),
        lojas: eu["lojas"].as_array().into_iter().flatten().filter_map(|l| l.as_str().map(str::to_string)).collect(),
    };
    Ok(Validacao::Confirmada { pessoa, tokens })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_perfil_do_site_so_e_gestor_ou_caixa() {
        assert_eq!(perfil_do_site(Some("GESTOR")), Some("GESTOR"));
        assert_eq!(perfil_do_site(Some("CAIXA")), Some("CAIXA"));
        assert_eq!(perfil_do_site(Some("ADMIN")), None, "o administrador nunca vem do site");
        assert_eq!(perfil_do_site(Some("gestor")), None);
        assert_eq!(perfil_do_site(None), None);
    }

    #[test]
    fn a_copia_local_vale_sete_dias_e_nao_com_o_relogio_atrasado() {
        let v = Some("2026-11-20T10:00:00");
        assert!(copia_vale(v, "2026-11-20T10:00:00"));
        assert!(copia_vale(v, "2026-11-27T10:00:00"));
        assert!(!copia_vale(v, "2026-11-27T10:00:01"), "passou dos 7 dias");
        assert!(!copia_vale(v, "2026-11-19T10:00:00"), "o relógio atrasado não conta a favor");
        assert!(!copia_vale(None, "2026-11-20T10:00:00"), "nunca confirmada pelo site");
        assert!(!copia_vale(Some("lixo"), "2026-11-20T10:00:00"));
    }

    #[test]
    fn o_factor_dos_dois_passos() {
        let v = json!({ "user": { "factors": [{ "id": "f1", "status": "unverified", "factor_type": "totp" }, { "id": "f2", "status": "verified", "factor_type": "totp" }] } });
        assert_eq!(factor_totp(&v).as_deref(), Some("f2"));
        assert_eq!(factor_totp(&json!({ "user": {} })), None);
    }
}
