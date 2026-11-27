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
//!
//! **Entrar com o Google** (KANGEST ONE, fase A; o Google está ligado no Supabase Auth do site): o KanGest abre a
//! entrada do Google no navegador do sistema, com PKCE. O Auth devolve o código à página `/kangest/entrar` do site, que
//! o passa ao KanGest pela ligação `kangest://auth`. Só uma entrada começada neste computador, com o mesmo `estado` e há
//! menos de dez minutos, troca o código pela sessão: o verificador do PKCE nunca sai daqui, e fica só em memória. Os dois
//! passos e a pergunta «quem é» são os da entrada com a senha.

use std::sync::Mutex;

use base64::Engine;
use chrono::NaiveDateTime;
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::pessoa::{self, Erro, Tokens};
use crate::error::{AppError, AppResult};

/// Sem Internet, a cópia local de uma conta do site vale estes dias desde a última entrada confirmada pelo site.
pub const DIAS_DA_COPIA: i64 = 7;

/// A pessoa, como o site a conhece.
#[derive(Debug, Clone)]
pub struct PessoaSite {
    pub id: String,
    pub nome: String,
    pub email: String,
    /// GESTOR, CAIXA ou nenhum (sem acesso ao KanGest, ou faltam os dois passos)
    pub perfil: Option<String>,
    /// Os dois passos estão cumpridos (falso: a conta tem de os activar no site; o perfil vem então vazio)
    pub mfa: bool,
    /// Este posto é da loja da ficha de funcionário? `None` sem ficha com loja (decisão do dono, 2026-11-26: como
    /// Caixa, só se entra nos postos da loja da ficha)
    pub posto_na_ficha: Option<bool>,
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
pub(super) fn factor_totp(v: &Value) -> Option<String> {
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
    let Some(tokens) = pessoa::tokens_da_resposta(&v).filter(|_| estado == 200) else {
        return Ok(Validacao::Recusada(pessoa::mensagem(&v, estado)));
    };
    concluir(pool, &a, tokens, &v, codigo, email).await
}

/// Com a sessão do site já dada (pela senha ou pelo Google): os dois passos, se a conta os tem, e quem é a pessoa.
async fn concluir(pool: &SqlitePool, a: &pessoa::Auth, mut tokens: Tokens, v: &Value, codigo: Option<&str>, email: &str) -> AppResult<Validacao> {
    // com os dois passos, a sessão só serve depois do código (aal2), como no painel
    if let Some(factor) = factor_totp(v) {
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
    // o posto deste KanGest, para o site dizer se é da loja da ficha da pessoa
    let posto: Option<String> = sqlx::query_scalar("SELECT posto_id FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(pool).await?;
    let (estado, eu) = match pedir("POST", format!("{}/rest/v1/rpc/kangest_eu", a.url), &a.apikey, Some(&tokens.access), json!({ "p_posto": posto })).await {
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
        mfa: eu["mfa"].as_bool().unwrap_or(true),
        posto_na_ficha: eu["posto_na_ficha"].as_bool(),
    };
    Ok(Validacao::Confirmada { pessoa, tokens })
}

// -----------------------------------------------------------------------------------------------------------------
// Entrar com o Google (PKCE pelo navegador do sistema)
// -----------------------------------------------------------------------------------------------------------------

/// Uma entrada com o Google começada aqui vale estes segundos.
pub const GOOGLE_VALIDADE: i64 = 10 * 60;

/// Por onde se entra pelo navegador: a conta Google, ou a sessão que a pessoa já tem aberta no site («Entrar com a
/// sessão do site», pedido do dono a 27/11: «o login deve funcionar para os dois»).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Via {
    Google,
    Site,
}

impl Via {
    /// O nome do botão, para as mensagens.
    pub fn botao(self) -> &'static str {
        match self {
            Via::Google => "«Entrar com o Google»",
            Via::Site => "«Entrar com a sessão do site»",
        }
    }
}

/// A entrada pelo navegador que está a decorrer neste computador: uma de cada vez, e só em memória.
#[derive(Clone)]
enum Google {
    /// À espera do retorno do navegador.
    Iniciada { via: Via, verificador: String, estado: String, em: i64 },
    /// O site já deu a sessão; falta o código dos dois passos.
    PorCodigo { via: Via, estado: String, tokens: Tokens, resposta: Value, em: i64 },
}

static GOOGLE: Mutex<Option<Google>> = Mutex::new(None);

fn agora_s() -> i64 {
    chrono::Utc::now().timestamp()
}

/// O desafio do PKCE (S256): o SHA-256 do verificador, em base64url sem `=` (RFC 7636).
pub fn desafio_pkce(verificador: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verificador.as_bytes()))
}

/// `n` bytes aleatórios, em base64url sem `=`.
fn aleatorio(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

/// O estado de uma entrada: só letras, algarismos, `-` e `_`, com o tamanho dos que se geram aqui.
pub fn estado_valido(e: &str) -> bool {
    (20..=64).contains(&e.len()) && e.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// A página do site que recebe o retorno do Auth e o passa ao KanGest (`/kangest/entrar/`). Só um site em HTTPS (ou o
/// próprio computador, num ensaio).
pub fn pagina_de_retorno(site: &str, estado: &str) -> Option<String> {
    site_seguro(site).map(|site| format!("{site}/kangest/entrar/?e={estado}"))
}

/// O endereço do site sem a barra do fim, se é HTTPS (ou o próprio computador, num ensaio) e não traz pergunta nem
/// fragmento.
fn site_seguro(site: &str) -> Option<&str> {
    let site = site.trim().trim_end_matches('/');
    let local = site.starts_with("http://127.0.0.1") || site.starts_with("http://localhost");
    (!site.is_empty() && (site.starts_with("https://") || local) && !site.contains(['?', '#', ' '])).then_some(site)
}

/// A página do site que pede a confirmação da pessoa e devolve o código de uso único (`/kangest/entrar-com-o-site`), com o
/// estado e o desafio PKCE. Só um site em HTTPS (ou o próprio computador, num ensaio).
pub fn pagina_entrar_com_o_site(site: &str, estado: &str, desafio: &str) -> Option<String> {
    site_seguro(site).map(|site| format!("{site}/kangest/entrar-com-o-site?e={estado}&d={desafio}"))
}

/// Por onde vai a entrada que está a decorrer (para as mensagens e o registo de entradas).
pub fn via_em_curso() -> Option<Via> {
    GOOGLE.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|g| match g {
        Google::Iniciada { via, .. } | Google::PorCodigo { via, .. } => *via,
    })
}

/// «Entrar com a sessão do site»: guarda o verificador e o estado em memória e devolve a página do site que o navegador
/// do sistema abre. Lá, com a sessão da pessoa e depois de ela confirmar, o site devolve um código de uso único pela
/// ligação kangest://auth; só este KanGest o troca, porque só ele tem o verificador.
pub async fn site_iniciar(pool: &SqlitePool) -> AppResult<String> {
    pessoa::auth(pool).await.map_err(|_| AppError::msg("Para entrar com a sessão do site, este KanGest tem de estar ligado ao site."))?;
    let site: String = sqlx::query_scalar("SELECT site_url FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(pool).await?.unwrap_or_default();
    let verificador = aleatorio(32);
    let estado = aleatorio(18);
    let url = pagina_entrar_com_o_site(&site, &estado, &desafio_pkce(&verificador))
        .ok_or_else(|| AppError::msg("A ligação ao site não tem o endereço do site: ligue este KanGest outra vez em Livraria → Ligação ao site."))?;
    *GOOGLE.lock().unwrap_or_else(|e| e.into_inner()) = Some(Google::Iniciada { via: Via::Site, verificador, estado, em: agora_s() });
    Ok(url)
}

/// Troca o código de uso único do site por uma sessão própria: o site confere o verificador (PKCE) e dá o resumo de um
/// link de entrada da conta, que o Auth troca por uma sessão (só em memória).
async fn sessao_do_site(a: &pessoa::Auth, codigo: &str, verificador: &str, estado: &str) -> Result<(Tokens, Value), Falha> {
    let corpo = json!({ "codigo": codigo, "verificador": verificador, "estado": estado });
    let (st, v) = pedir("POST", format!("{}/kangest/entrar-com-o-site/trocar", a.funcoes.trim_end_matches('/')), &a.apikey, None, corpo).await?;
    let Some(resumo) = v["token_hash"].as_str().filter(|_| st == 200) else {
        return Err(Falha::Recusada(if st == 404 {
            "O site ainda não tem «Entrar com a sessão do site»: actualize o site.".into()
        } else {
            pessoa::mensagem(&v, st)
        }));
    };
    let (st, v) = pedir("POST", format!("{}/auth/v1/verify", a.url), &a.apikey, None, json!({ "type": "magiclink", "token_hash": resumo })).await?;
    match pessoa::tokens_da_resposta(&v).filter(|_| st == 200) {
        Some(t) => Ok((t, v)),
        None => Err(Falha::Recusada(pessoa::mensagem(&v, st))),
    }
}

/// Começa uma entrada com o Google: guarda o verificador e o estado em memória e devolve o endereço que o navegador do
/// sistema abre. Uma entrada que já estivesse a decorrer é substituída.
pub async fn google_iniciar(pool: &SqlitePool) -> AppResult<String> {
    let a = pessoa::auth(pool).await.map_err(|_| AppError::msg("Para entrar com o Google, este KanGest tem de estar ligado ao site."))?;
    let site: String = sqlx::query_scalar("SELECT site_url FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(pool).await?.unwrap_or_default();
    let verificador = aleatorio(32);
    let estado = aleatorio(18);
    let retorno = pagina_de_retorno(&site, &estado)
        .ok_or_else(|| AppError::msg("A ligação ao site não tem o endereço do site: ligue este KanGest outra vez em Livraria → Ligação ao site."))?;
    let url = tauri::Url::parse_with_params(
        &format!("{}/auth/v1/authorize", a.url),
        &[("provider", "google"), ("redirect_to", retorno.as_str()), ("code_challenge", desafio_pkce(&verificador).as_str()), ("code_challenge_method", "s256")],
    )
    .map_err(|e| AppError::msg(format!("O endereço do site não é válido ({e}).")))?;
    *GOOGLE.lock().unwrap_or_else(|e| e.into_inner()) = Some(Google::Iniciada { via: Via::Google, verificador, estado, em: agora_s() });
    Ok(url.to_string())
}

/// Conclui a entrada pelo navegador (o Google ou a sessão do site): com o `code` do retorno (a primeira volta) ou com o
/// código dos dois passos (a segunda). Só vale uma entrada começada aqui, com o mesmo estado e dentro do prazo; depois
/// de confirmada ou recusada, acaba.
pub async fn google_concluir(pool: &SqlitePool, estado: &str, code: Option<&str>, codigo: Option<&str>) -> AppResult<Validacao> {
    let actual = GOOGLE.lock().unwrap_or_else(|e| e.into_inner()).take();
    let fora = || Ok(Validacao::Recusada("Esta entrada não foi começada neste KanGest, ou já passou o tempo: carregue outra vez no botão de entrar.".into()));
    let fresca = |em: i64| agora_s() - em <= GOOGLE_VALIDADE;
    let a = match pessoa::auth(pool).await {
        Ok(a) => a,
        Err(e) => return Ok(Validacao::SemLigacao(e.to_string())),
    };
    let (via, tokens, resposta, em) = match actual {
        Some(Google::Iniciada { via: Via::Site, verificador, estado: e, em }) if e == estado && fresca(em) => {
            let Some(code) = code.map(str::trim).filter(|c| !c.is_empty() && c.len() <= 200) else { return fora() };
            match sessao_do_site(&a, code, &verificador, estado).await {
                Ok((t, v)) => (Via::Site, t, v, em),
                Err(x) => return Ok(x.into()),
            }
        }
        Some(Google::Iniciada { via: Via::Google, verificador, estado: e, em }) if e == estado && fresca(em) => {
            let Some(code) = code.map(str::trim).filter(|c| !c.is_empty() && c.len() <= 200) else { return fora() };
            let (st, v) = match pedir(
                "POST",
                format!("{}/auth/v1/token?grant_type=pkce", a.url),
                &a.apikey,
                None,
                json!({ "auth_code": code, "code_verifier": verificador }),
            )
            .await
            {
                Ok(r) => r,
                Err(x) => return Ok(x.into()),
            };
            let Some(t) = pessoa::tokens_da_resposta(&v).filter(|_| st == 200) else {
                return Ok(Validacao::Recusada(pessoa::mensagem(&v, st)));
            };
            (Via::Google, t, v, em)
        }
        Some(Google::PorCodigo { via, estado: e, tokens, resposta, em }) if e == estado && fresca(em) => (via, tokens, resposta, em),
        _ => return fora(),
    };
    let email = resposta["user"]["email"].as_str().unwrap_or_default().trim().to_lowercase();
    let r = concluir(pool, &a, tokens.clone(), &resposta, codigo, &email).await?;
    if matches!(r, Validacao::PedirCodigo) {
        // a sessão fica à espera do código, só em memória e só até ao fim do prazo
        *GOOGLE.lock().unwrap_or_else(|e| e.into_inner()) = Some(Google::PorCodigo { via, estado: estado.to_string(), tokens, resposta, em });
    }
    Ok(r)
}

/// Desiste da entrada pelo navegador que estiver a decorrer.
pub fn google_cancelar() {
    *GOOGLE.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_desafio_do_pkce_e_o_da_norma() {
        // o exemplo da RFC 7636, apêndice B
        assert_eq!(desafio_pkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let v = aleatorio(32);
        assert_eq!(v.len(), 43, "32 bytes dão 43 caracteres em base64url");
        assert_ne!(v, aleatorio(32));
    }

    #[test]
    fn o_estado_e_a_pagina_de_retorno() {
        let e = aleatorio(18);
        assert!(estado_valido(&e), "{e}");
        assert!(!estado_valido("curto"));
        assert!(!estado_valido("tem um espaço e é comprido demais para passar"));
        assert!(!estado_valido("aaaaaaaaaaaaaaaaaaaaaaaa&x=1"));
        assert_eq!(pagina_de_retorno("https://livrariaadventista.ao/", "abc").as_deref(), Some("https://livrariaadventista.ao/kangest/entrar/?e=abc"));
        assert_eq!(pagina_de_retorno("http://127.0.0.1:3010", "abc").as_deref(), Some("http://127.0.0.1:3010/kangest/entrar/?e=abc"));
        assert_eq!(pagina_de_retorno("http://livrariaadventista.ao", "abc"), None, "sem HTTPS, não");
        assert_eq!(pagina_de_retorno("", "abc"), None);
        assert_eq!(pagina_de_retorno("https://x.ao/?a=1", "abc"), None);
        // «Entrar com a sessão do site»: a página do site com o estado e o desafio
        assert_eq!(
            pagina_entrar_com_o_site("https://livrariaadventista.ao/", "abc", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM").as_deref(),
            Some("https://livrariaadventista.ao/kangest/entrar-com-o-site?e=abc&d=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        );
        assert_eq!(pagina_entrar_com_o_site("http://livrariaadventista.ao", "abc", "d"), None, "sem HTTPS, não");
    }

    #[tokio::test]
    async fn uma_entrada_com_o_google_que_nao_comecou_aqui_e_recusada() {
        google_cancelar();
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE sinc_ligacao (id INTEGER, url TEXT, auth_url TEXT, auth_apikey TEXT, ativa INTEGER)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sinc_ligacao VALUES (1, 'http://127.0.0.1:9/functions/v1/app', 'http://127.0.0.1:9', 'chave-publica', 1)").execute(&pool).await.unwrap();
        // sem nada começado: recusa, sem perguntar nada ao site
        let r = google_concluir(&pool, "estado-que-ninguem-pediu-aqui", Some("codigo"), None).await.unwrap();
        assert!(matches!(r, Validacao::Recusada(ref m) if m.contains("não foi começada")), "{r:?}");
        // começada com outro estado: também, e a entrada acaba
        *GOOGLE.lock().unwrap() = Some(Google::Iniciada { via: Via::Google, verificador: aleatorio(32), estado: "o-estado-certo-desta-vez".into(), em: agora_s() });
        let r = google_concluir(&pool, "outro-estado-qualquer-aqui", Some("codigo"), None).await.unwrap();
        assert!(matches!(r, Validacao::Recusada(_)), "{r:?}");
        assert!(GOOGLE.lock().unwrap().is_none());
        // fora do prazo: também
        *GOOGLE.lock().unwrap() = Some(Google::Iniciada { via: Via::Google, verificador: aleatorio(32), estado: "o-estado-certo-desta-vez".into(), em: agora_s() - GOOGLE_VALIDADE - 1 });
        let r = google_concluir(&pool, "o-estado-certo-desta-vez", Some("codigo"), None).await.unwrap();
        assert!(matches!(r, Validacao::Recusada(_)), "{r:?}");
        // pela sessão do site, sem o site a responder: «sem ligação», e a entrada acaba (o código gasta-se no site)
        *GOOGLE.lock().unwrap() = Some(Google::Iniciada { via: Via::Site, verificador: aleatorio(32), estado: "o-estado-certo-desta-vez".into(), em: agora_s() });
        assert_eq!(via_em_curso(), Some(Via::Site));
        let r = google_concluir(&pool, "o-estado-certo-desta-vez", Some("codigo-do-site"), None).await.unwrap();
        assert!(matches!(r, Validacao::SemLigacao(_)), "{r:?}");
        assert_eq!(via_em_curso(), None);
    }

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
