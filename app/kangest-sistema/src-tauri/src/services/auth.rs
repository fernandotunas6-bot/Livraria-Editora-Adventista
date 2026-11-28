// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Utilizadores, perfis de acesso e autenticação.
//!
//! - Senhas e PIN guardados com argon2.
//! - Bloqueio temporário da conta após N tentativas falhadas (política em `config`, chaves `seguranca.*`).
//! - Senha provisória (utilizadores importados ou senha redefinida): obrigatório mudá-la no primeiro acesso;
//!   até lá a sessão só serve para mudar a senha ou sair (ver `services::dispatch`).
//! - Sessão bloqueada (inactividade ou pedido do operador): retoma-se com a senha ou o PIN do próprio.
//! - Registo de acessos na tabela `acessos`; as operações continuam na `auditoria`.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::Rng;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::{permissoes_efectivas, permissoes_perfil, AppState, Sessao, PERMISSOES};

pub fn hash_senha(senha: &str) -> AppResult<String> {
    let sal = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(senha.as_bytes(), &sal)
        .map(|h| h.to_string())
        .map_err(|e| AppError::msg(e.to_string()))
}

/// A senha confere com o resumo guardado (para confirmar a identidade antes de mudar a segurança da conta).
pub(super) fn senha_confere(senha: &str, hash: &str) -> bool {
    verificar(senha, hash)
}

fn verificar(senha: &str, hash: &str) -> bool {
    // a senha provisória de um funcionário criado no site (conta da empresa): resumo PBKDF2, mudado no primeiro acesso
    if let Some(resto) = hash.strip_prefix("pbkdf2-sha256$") {
        return verificar_pbkdf2(senha, resto);
    }
    PasswordHash::new(hash)
        .map(|h| Argon2::default().verify_password(senha.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

/// «<iterações>$<sal>$<resumo>» (base64url sem preenchimento), como o servidor de licenças os gera.
fn verificar_pbkdf2(senha: &str, resto: &str) -> bool {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let partes: Vec<&str> = resto.split('$').collect();
    let [it, sal, res] = partes[..] else { return false };
    let Some(it) = it.parse::<u32>().ok().filter(|n| (10_000..=1_000_000).contains(n)).and_then(std::num::NonZeroU32::new) else { return false };
    let (Ok(sal), Ok(res)) = (URL_SAFE_NO_PAD.decode(sal), URL_SAFE_NO_PAD.decode(res)) else { return false };
    ring::pbkdf2::verify(ring::pbkdf2::PBKDF2_HMAC_SHA256, it, &sal, senha.as_bytes(), &res).is_ok()
}

// ============================== política de segurança ==============================

#[derive(Debug, Clone, serde::Serialize)]
pub struct Politica {
    /// comprimento mínimo das senhas novas
    pub senha_min: usize,
    /// tentativas falhadas seguidas até bloquear a conta (0 = nunca bloqueia)
    pub tentativas: i64,
    /// minutos de bloqueio da conta
    pub bloqueio_min: i64,
    /// minutos sem actividade até bloquear a sessão (0 = nunca)
    pub inatividade_min: i64,
    /// permitir entrar só com o PIN (terminais POS)
    pub login_pin: bool,
    /// exigir a verificação em dois passos a quem entra pela Internet (acesso por subdomínio)
    pub dois_passos_internet: bool,
}

pub async fn politica(st: &AppState) -> AppResult<Politica> {
    let rows = sqlx::query("SELECT chave, valor FROM config WHERE chave LIKE 'seguranca.%'").fetch_all(&st.pool).await?;
    let v = |k: &str| rows.iter().find(|r| r.get::<String, _>("chave") == k).map(|r| r.get::<String, _>("valor")).unwrap_or_default();
    let n = |k: &str, d: i64| v(k).trim().parse::<i64>().unwrap_or(d);
    Ok(Politica {
        senha_min: n("seguranca.senha_min", 6).clamp(4, 32) as usize,
        tentativas: n("seguranca.tentativas", 5).clamp(0, 20),
        bloqueio_min: n("seguranca.bloqueio_min", 15).clamp(1, 1440),
        inatividade_min: n("seguranca.inatividade_min", 0).clamp(0, 480),
        login_pin: v("seguranca.login_pin") == "1",
        dois_passos_internet: v("seguranca.dois_passos_internet") == "1",
    })
}

/// Política visível antes de entrar (o ecrã de entrada precisa de saber se há entrada por PIN).
pub async fn politica_publica(st: &AppState) -> AppResult<Value> {
    let p = politica(st).await?;
    // pela Internet, num endereço do KanGest: a chave do widget «não sou um robô» (Cloudflare Turnstile)
    let humano = super::humano::chave_site(st).await;
    Ok(json!({ "login_pin": p.login_pin, "senha_min": p.senha_min, "inatividade_min": p.inatividade_min, "humano": humano }))
}

pub async fn seguranca_obter(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.utilizadores")?;
    Ok(serde_json::to_value(politica(st).await?)?)
}

#[derive(Deserialize)]
pub struct PoliticaIn {
    senha_min: i64,
    tentativas: i64,
    bloqueio_min: i64,
    inatividade_min: i64,
    login_pin: bool,
    #[serde(default)]
    dois_passos_internet: bool,
}

pub async fn seguranca_guardar(st: &AppState, p: PoliticaIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.utilizadores")?;
    let valores = [
        ("seguranca.senha_min", p.senha_min.clamp(4, 32).to_string()),
        ("seguranca.tentativas", p.tentativas.clamp(0, 20).to_string()),
        ("seguranca.bloqueio_min", p.bloqueio_min.clamp(1, 1440).to_string()),
        ("seguranca.inatividade_min", p.inatividade_min.clamp(0, 480).to_string()),
        ("seguranca.login_pin", if p.login_pin { "1" } else { "0" }.to_string()),
        ("seguranca.dois_passos_internet", if p.dois_passos_internet { "1" } else { "0" }.to_string()),
    ];
    let mut tx = crate::db::transacao(&st.pool).await?;
    for (k, v) in valores {
        sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(k).bind(v).execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'SEGURANCA', 'Política de segurança alterada')").bind(s.id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(serde_json::to_value(politica(st).await?)?)
}

// ============================== registo de acessos ==============================

async fn registar(st: &AppState, utilizador_id: Option<i64>, login: &str, evento: &str, detalhe: Option<String>) {
    let _ = sqlx::query("INSERT INTO acessos (utilizador_id, login, evento, posto_id, detalhe) VALUES (?, ?, ?, ?, ?)")
        .bind(utilizador_id)
        .bind(login)
        .bind(evento)
        .bind(st.posto().id)
        .bind(detalhe)
        .execute(&st.pool)
        .await;
}

#[derive(Deserialize)]
pub struct RegistoIn {
    de: String,
    ate: String,
    #[serde(default)]
    utilizador_id: Option<i64>,
    #[serde(default)]
    evento: Option<String>,
}

pub async fn acessos_listar(st: &AppState, f: RegistoIn) -> AppResult<Value> {
    st.exigir_perm("sistema.auditoria")?;
    let rows = sqlx::query(
        "SELECT a.id, a.data_hora, a.evento, a.detalhe, COALESCE(u.nome, a.login) AS utilizador, a.login, p.descricao AS posto
         FROM acessos a LEFT JOIN utilizadores u ON u.id = a.utilizador_id LEFT JOIN postos p ON p.id = a.posto_id
         WHERE a.data_hora >= ?1 AND a.data_hora < date(?2, '+1 day')
           AND (?3 IS NULL OR a.utilizador_id = ?3) AND (?4 IS NULL OR a.evento = ?4)
         ORDER BY a.id DESC LIMIT 2000",
    )
    .bind(&f.de)
    .bind(&f.ate)
    .bind(f.utilizador_id)
    .bind(f.evento.filter(|e| !e.is_empty()))
    .fetch_all(&st.pool)
    .await?;
    Ok(db::rows_json(&rows))
}

// ============================== autenticação ==============================

/// KANGEST ONE (fase A): o estado de uma conta local num KanGest ligado ao site.
#[derive(Debug, PartialEq, Eq)]
pub enum ContaLocal {
    /// Sem restrição: conta do site, o ADMIN de recurso, ou um KanGest que não está ligado ao site.
    Normal,
    /// Uma conta local: tem de se ligar à conta do site até esta data (vazia: sem data marcada).
    Avisar(String),
    /// Passou a data: só lê.
    SoLeitura(String),
}

/// Num KanGest ligado ao site, a identidade é a conta do site. Uma conta local que não é ADMIN (o ADMIN fica como
/// recurso) recebe um aviso até à data-limite (`identidade.contas_locais_ate`) e, depois dela, só lê. Um KanGest isolado,
/// sem posto, continua com as suas contas locais.
pub fn conta_local(ligado: bool, conta_site: Option<&str>, perfil: &str, limite: Option<&str>, hoje: &str) -> ContaLocal {
    if !ligado || conta_site.is_some_and(|c| !c.is_empty()) || perfil == "ADMIN" {
        return ContaLocal::Normal;
    }
    match limite.filter(|l| l.len() == 10) {
        Some(l) if hoje > l => ContaLocal::SoLeitura(l.to_string()),
        Some(l) => ContaLocal::Avisar(l.to_string()),
        None => ContaLocal::Avisar(String::new()),
    }
}

/// A data-limite das contas locais e se este KanGest está ligado ao site (Utilizadores).
pub async fn contas_locais(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.utilizadores")?;
    let ate: Option<String> =
        sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'identidade.contas_locais_ate'").fetch_optional(&st.pool).await?;
    let por_ligar: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM utilizadores WHERE ativo = 1 AND perfil <> 'ADMIN' AND conta_site IS NULL")
        .fetch_one(&st.pool)
        .await?;
    let lista = db::query_json(
        &st.pool,
        "SELECT id, nome, login, perfil, ligar_conta_site FROM utilizadores
          WHERE ativo = 1 AND perfil <> 'ADMIN' AND conta_site IS NULL ORDER BY nome",
    )
    .await?;
    Ok(json!({ "ligado": ligado_ao_site(&st.pool).await, "ate": ate, "por_ligar": por_ligar, "contas": lista }))
}

#[derive(Deserialize)]
pub struct ContasLocaisIn {
    ate: String,
}

/// O administrador muda a data-limite das contas locais (fica na auditoria).
pub async fn contas_locais_guardar(st: &AppState, i: ContasLocaisIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.utilizadores")?;
    let ate = i.ate.trim();
    if chrono::NaiveDate::parse_from_str(ate, "%Y-%m-%d").is_err() {
        return Err(AppError::msg("Escolha uma data válida."));
    }
    sqlx::query("INSERT INTO config (chave, valor) VALUES ('identidade.contas_locais_ate', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(ate)
        .execute(&st.pool)
        .await?;
    registar(st, Some(s.id), &s.login, "CONTAS_LOCAIS", Some(format!("data-limite das contas locais: {ate}"))).await;
    contas_locais(st).await
}

/// Ao ligar ao site (o primeiro emparelhamento, ou outra vez depois de desligar): o prazo das contas locais conta a partir
/// daqui, não da actualização do programa (a migração 0070 pôs 30 dias na altura da actualização, que pode ter sido há
/// meses). Fica a 30 dias de hoje, a menos que o administrador já tenha escolhido uma data mais tarde.
pub(crate) async fn prazo_das_contas_locais_ao_ligar(pool: &sqlx::SqlitePool) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO config (chave, valor) VALUES ('identidade.contas_locais_ate', date('now', 'localtime', '+30 days'))
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor WHERE config.valor < excluded.valor",
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// A conta local que o administrador mandou ligar a este email (ainda sem conta do site): (id, perfil).
async fn pendente_de_ligar(pool: &sqlx::SqlitePool, email: &str) -> AppResult<Option<(i64, String)>> {
    Ok(sqlx::query_as("SELECT id, perfil FROM utilizadores WHERE ligar_conta_site = ? AND conta_site IS NULL")
        .bind(email.trim().to_lowercase())
        .fetch_optional(pool)
        .await?)
}

#[derive(Deserialize)]
pub struct LigarContaIn {
    id: i64,
    /// o email da conta do site da pessoa; vazio ou nulo desfaz o pedido
    email: Option<String>,
}

/// O administrador manda ligar uma conta local à conta do site da pessoa (KANGEST ONE, fase A): na primeira entrada com
/// esse email, a conta local fica a ser a da pessoa, com o histórico. Fica na auditoria.
pub async fn ligar_conta_site(st: &AppState, i: LigarContaIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.utilizadores")?;
    let row: Option<(String, String, Option<String>)> =
        sqlx::query_as("SELECT login, perfil, conta_site FROM utilizadores WHERE id = ?").bind(i.id).fetch_optional(&st.pool).await?;
    let Some((login, perfil, conta_site)) = row else { return Err(AppError::msg("Esse utilizador não existe.")) };
    if perfil == "ADMIN" {
        return Err(AppError::msg("A conta ADMIN de recurso fica local: não se liga a uma conta do site."));
    }
    if conta_site.is_some_and(|c| !c.is_empty()) {
        return Err(AppError::msg("Esta conta já é de uma conta do site."));
    }
    let email = i.email.map(|e| e.trim().to_lowercase()).filter(|e| !e.is_empty());
    if let Some(e) = &email {
        let valido = e.len() <= 200 && e.split_once('@').is_some_and(|(a, d)| !a.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.'));
        if !valido || e.contains(char::is_whitespace) {
            return Err(AppError::msg("Escreva o email da conta do site da pessoa."));
        }
    }
    sqlx::query("UPDATE utilizadores SET ligar_conta_site = ? WHERE id = ?")
        .bind(&email)
        .bind(i.id)
        .execute(&st.pool)
        .await
        .map_err(|e| if e.to_string().contains("UNIQUE") { AppError::msg("Esse email já está pedido para outra conta local.") } else { e.into() })?;
    let detalhe = match &email {
        Some(e) => format!("{login}: ligar à conta do site {e} na primeira entrada"),
        None => format!("{login}: pedido de ligação desfeito"),
    };
    registar(st, Some(s.id), &s.login, "LIGAR_CONTA_SITE", Some(detalhe)).await;
    contas_locais(st).await
}

/// Este KanGest está ligado ao site (o posto emparelhado e activo)?
async fn ligado_ao_site(pool: &sqlx::SqlitePool) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT 1 FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(pool).await.ok().flatten().is_some()
}

pub(crate) async fn sessao_de(st: &AppState, row: &sqlx::sqlite::SqliteRow) -> Sessao {
    let perfil: String = row.get("perfil");
    let proprias: Option<String> = row.get("permissoes");
    let (nivel, mut permissoes) = permissoes_efectivas(&st.pool, &perfil, proprias.as_deref()).await;
    let perfil_descricao = sqlx::query_scalar("SELECT descricao FROM perfis WHERE codigo = ?").bind(&perfil).fetch_optional(&st.pool).await.ok().flatten();
    let limite: Option<String> =
        sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'identidade.contas_locais_ate'").fetch_optional(&st.pool).await.ok().flatten();
    let conta_site: Option<String> = row.try_get("conta_site").ok().flatten();
    let estado = conta_local(ligado_ao_site(&st.pool).await, conta_site.as_deref(), &perfil, limite.as_deref(), &db::hoje());
    let (ligar_ate, so_leitura) = match estado {
        ContaLocal::Normal => (None, false),
        ContaLocal::Avisar(l) => (Some(l), false),
        ContaLocal::SoLeitura(l) => {
            permissoes.retain(|p| p == "relatorios.ver");
            (Some(l), true)
        }
    };
    // abaixo da versão mínima do site: só consultar e actualizar (sinc/versao.rs)
    let desactualizado = crate::sinc::versao::desactualizado(&st.pool).await;
    if desactualizado.is_some() {
        permissoes.retain(|p| p == "relatorios.ver" || p == "sistema.atualizacoes");
    }
    Sessao {
        id: row.get("id"),
        nome: row.get("nome"),
        login: row.get("login"),
        permissoes,
        limite_desconto: row.get("limite_desconto"),
        perfil,
        nivel,
        mudar_senha: row.get::<i64, _>("mudar_senha") == 1,
        bloqueada: false,
        perfil_descricao,
        armazem_id: row.try_get::<Option<i64>, _>("armazem_id").ok().flatten(),
        offline: false,
        ligar_ate,
        so_leitura,
        desactualizado,
    }
}

/// "2026-11-12T10:15:00" → "10:15"
fn hora(s: &str) -> String {
    s.get(11..16).unwrap_or(s).to_string()
}

/// Mais um falhanço de um utilizador conhecido: conta e, no limite, bloqueia a conta.
/// Devolve a mensagem de erro para o ecrã.
async fn falhou(st: &AppState, pol: &Politica, id: i64, login: &str, tentativas: i64, motivo: &str) -> AppResult<AppError> {
    let n = tentativas + 1;
    if pol.tentativas > 0 && n >= pol.tentativas {
        let ate = (chrono::Local::now() + chrono::Duration::minutes(pol.bloqueio_min)).format("%Y-%m-%dT%H:%M:%S").to_string();
        sqlx::query("UPDATE utilizadores SET tentativas = 0, bloqueado_ate = ? WHERE id = ?").bind(&ate).bind(id).execute(&st.pool).await?;
        registar(st, Some(id), login, "FALHA", Some(motivo.into())).await;
        registar(st, Some(id), login, "BLOQUEIO", Some(format!("{n} tentativas falhadas; bloqueada até às {}", hora(&ate)))).await;
        return Ok(AppError::msg(format!(
            "Conta bloqueada por {n} tentativas falhadas. Tente de novo às {} ou peça ao administrador para a desbloquear.",
            hora(&ate)
        )));
    }
    sqlx::query("UPDATE utilizadores SET tentativas = ? WHERE id = ?").bind(n).bind(id).execute(&st.pool).await?;
    registar(st, Some(id), login, "FALHA", Some(motivo.into())).await;
    let restam = pol.tentativas - n;
    Ok(AppError::msg(if pol.tentativas > 0 && restam <= 2 {
        format!("Utilizador ou senha incorrectos. Resta(m) {restam} tentativa(s) antes de a conta ser bloqueada.")
    } else {
        "Utilizador ou senha incorrectos.".into()
    }))
}

/// Conta bloqueada por tentativas falhadas? (o bloqueio termina sozinho)
fn bloqueada_ate(row: &sqlx::sqlite::SqliteRow) -> Option<String> {
    row.get::<Option<String>, _>("bloqueado_ate").filter(|ate| *ate > db::agora())
}

async fn entrar(st: &AppState, row: &sqlx::sqlite::SqliteRow, como: &str) -> AppResult<Value> {
    let id: i64 = row.get("id");
    let login: String = row.get("login");
    // um utilizador de uma loja só entra nos postos dessa loja
    if let Some(loja) = row.try_get::<Option<i64>, _>("armazem_id").ok().flatten() {
        if st.posto().armazem_id != loja {
            let nome: String = sqlx::query_scalar("SELECT nome FROM armazens WHERE id = ?").bind(loja).fetch_optional(&st.pool).await?.unwrap_or_default();
            return Err(AppError::msg(format!("Este utilizador é da loja «{nome}»: entre num posto dessa loja.")));
        }
    }
    sqlx::query("UPDATE utilizadores SET tentativas = 0, bloqueado_ate = NULL, ultimo_acesso = ? WHERE id = ?")
        .bind(db::agora())
        .bind(id)
        .execute(&st.pool)
        .await?;
    let mut s = sessao_de(st, row).await;
    // a cópia local da conta do site, sem Internet: o modo limitado
    s.offline = como.contains("sem Internet");
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao) VALUES (?, 'LOGIN')").bind(id).execute(&st.pool).await?;
    registar(st, Some(id), &login, "LOGIN", Some(como.into())).await;
    st.definir_sessao(Some(s.clone()));
    Ok(serde_json::to_value(s)?)
}

#[derive(Deserialize)]
pub struct LoginIn {
    login: String,
    senha: String,
    /// Código da verificação em dois passos (da aplicação ou de recuperação), na segunda volta.
    #[serde(default)]
    codigo: Option<String>,
    /// «Sair e trocar de conta»: confirma a troca quando o aparelho tem a sessão de outra pessoa.
    #[serde(default)]
    trocar: bool,
    /// O token do widget «não sou um robô» (Cloudflare Turnstile), na entrada pela Internet.
    #[serde(default)]
    humano: Option<String>,
}

pub async fn login(st: &AppState, i: LoginIn) -> AppResult<Value> {
    // antes de tudo, como no Claude: pela Internet, primeiro a verificação de humano (trava as tentativas automáticas)
    super::humano::confirmar(st, i.humano.as_deref()).await?;
    let pol = politica(st).await?;
    let login = i.login.trim();
    let local = sqlx::query("SELECT * FROM utilizadores WHERE login = ? AND conta_site IS NULL").bind(login).fetch_optional(&st.pool).await?;
    // um email que não é um utilizador local: a conta do site (src/sinc/entrada.rs)
    if local.is_none() && login.contains('@') {
        return login_site(st, &pol, &login.to_lowercase(), &i).await;
    }
    let Some(row) = local else {
        registar(st, None, login, "FALHA", Some("utilizador inexistente".into())).await;
        return Err(AppError::msg("Utilizador ou senha incorrectos."));
    };
    let id: i64 = row.get("id");
    if let Some(ate) = bloqueada_ate(&row) {
        registar(st, Some(id), login, "FALHA", Some("conta bloqueada".into())).await;
        return Err(AppError::msg(format!("Conta bloqueada por tentativas falhadas até às {}. Peça ao administrador para a desbloquear.", hora(&ate))));
    }
    if !verificar(&i.senha, &row.get::<String, _>("senha_hash")) {
        return Err(falhou(st, &pol, id, login, row.get("tentativas"), "senha errada").await?);
    }
    if row.get::<i64, _>("ativo") != 1 {
        registar(st, Some(id), login, "FALHA", Some("conta desactivada".into())).await;
        return Err(AppError::msg("Esta conta está desactivada. Fale com o administrador."));
    }
    // antes do código de dois passos, para não o gastar numa volta que vai ser recusada
    conta_diferente(st, id, login, i.trocar).await?;
    match super::dois_passos::no_login(st, &row, i.codigo.as_deref()).await? {
        super::dois_passos::NoLogin::Seguir => {}
        // senha certa: o ecrã pede o código e volta a entrar com ele
        super::dois_passos::NoLogin::PedirCodigo => return Ok(json!({ "dois_passos": true })),
        super::dois_passos::NoLogin::Errado => return Err(falhou(st, &pol, id, login, row.get("tentativas"), "código de dois passos errado").await?),
    }
    entrar(st, &row, if crate::state::pela_internet() { "senha (Internet)" } else { "senha" }).await
}

/// Entrar com a conta do site (parte J): o site confirma a senha (e o código dos dois passos) e diz o perfil; sem
/// Internet, vale a cópia local até 7 dias depois da última confirmação. O perfil é o mesmo papel do site.
async fn login_site(st: &AppState, pol: &Politica, email: &str, i: &LoginIn) -> AppResult<Value> {
    use crate::sinc::entrada::{self, Validacao};
    let guardada = sqlx::query("SELECT * FROM utilizadores WHERE login = ? AND conta_site IS NOT NULL").bind(email).fetch_optional(&st.pool).await?;
    if let Some(row) = &guardada {
        if let Some(ate) = bloqueada_ate(row) {
            registar(st, Some(row.get("id")), email, "FALHA", Some("conta bloqueada".into())).await;
            return Err(AppError::msg(format!("Conta bloqueada por tentativas falhadas até às {}. Peça ao administrador para a desbloquear.", hora(&ate))));
        }
    }
    let (row, com_internet) = match entrada::validar(&st.pool, email, &i.senha, i.codigo.as_deref()).await? {
        Validacao::PedirCodigo => return Ok(json!({ "dois_passos": true })),
        Validacao::Recusada(m) => {
            if let Some(row) = &guardada {
                // conta a tentativa (e bloqueia, no limite), mas mostra o que o site disse
                let e = falhou(st, pol, row.get("id"), email, row.get("tentativas"), "conta do site recusada").await?;
                return Err(if e.to_string().contains("bloqueada") { e } else { AppError::msg(m) });
            }
            registar(st, None, email, "FALHA", Some("conta do site recusada".into())).await;
            return Err(AppError::msg(m));
        }
        Validacao::SemLigacao(m) => {
            // sem o site: a cópia local, se a há, ainda vale e a senha confere
            let Some(row) = guardada else {
                return Err(AppError::msg(format!(
                    "Sem ligação ao site ({m}), e esta conta ainda não entrou neste KanGest. Entre com a Internet, ou com a conta ADMIN local."
                )));
            };
            let validada: Option<String> = row.get("conta_site_validada_em");
            if !entrada::copia_vale(validada.as_deref(), &db::agora()) {
                registar(st, Some(row.get("id")), email, "FALHA", Some("conta do site: cópia local sem validade".into())).await;
                return Err(AppError::msg(format!(
                    "Sem ligação ao site, e a cópia local desta conta já não vale ({} dias desde a última entrada com Internet). Entre com a Internet, ou com a conta ADMIN local.",
                    entrada::DIAS_DA_COPIA
                )));
            }
            if !verificar(&i.senha, &row.get::<String, _>("senha_hash")) {
                return Err(falhou(st, pol, row.get("id"), email, row.get("tentativas"), "senha errada (cópia local da conta do site)").await?);
            }
            (row, false)
        }
        Validacao::Confirmada { pessoa, tokens } => (confirmar_conta_site(st, email, guardada.as_ref(), pessoa, tokens, Some(&i.senha)).await?, true),
    };
    let id: i64 = row.get("id");
    if row.get::<i64, _>("ativo") != 1 {
        registar(st, Some(id), email, "FALHA", Some("conta desactivada".into())).await;
        return Err(AppError::msg("Esta conta está desactivada neste KanGest. Fale com o administrador."));
    }
    conta_diferente(st, id, email, i.trocar).await?;
    entrar(st, &row, if com_internet { "conta do site" } else { "conta do site (sem Internet, cópia local)" }).await
}

/// Depois de o site confirmar a pessoa (pela senha ou pelo Google): o perfil que o site diz, a conta local ligada a ela
/// (criada, actualizada ou a que o administrador mandou ligar) e a sessão do site em memória para a Loja online. Com
/// `senha`, a cópia local da senha também muda; sem ela (o Google), fica a que havia.
async fn confirmar_conta_site(
    st: &AppState,
    email: &str,
    guardada: Option<&sqlx::sqlite::SqliteRow>,
    pessoa: crate::sinc::entrada::PessoaSite,
    tokens: crate::sinc::pessoa::Tokens,
    senha: Option<&str>,
) -> AppResult<sqlx::sqlite::SqliteRow> {
    use crate::sinc::entrada;
    let perfil = entrada::perfil_do_site(pessoa.perfil.as_deref());
    // sem acesso, ou como Caixa num posto que não é da loja da ficha: não entra, e a cópia local deixa de valer
    let recusa = match perfil {
        None if !pessoa.mfa => Some((
            "conta do site sem os dois passos",
            "A sua conta do site precisa dos dois passos: entre no painel do site, active-os (o painel pede-os) e volte a entrar aqui com o código.",
        )),
        None => Some((
            "conta do site sem acesso ao KanGest",
            "A sua conta do site não tem acesso ao KanGest: só a equipa do site (administradores e gestores) entra aqui.",
        )),
        Some("CAIXA") if pessoa.posto_na_ficha == Some(false) => Some((
            "conta do site: caixa de outra loja",
            "A sua ficha de funcionário é de outra loja: como Caixa, entra só nos postos da sua loja.",
        )),
        _ => None,
    };
    if let Some((motivo, mensagem)) = recusa {
        if let Some(row) = guardada {
            sqlx::query("UPDATE utilizadores SET conta_site_validada_em = NULL WHERE id = ?").bind(row.get::<i64, _>("id")).execute(&st.pool).await?;
        }
        registar(st, None, email, "FALHA", Some(motivo.into())).await;
        return Err(AppError::msg(mensagem));
    }
    let Some(perfil) = perfil else { return Err(AppError::msg("A sua conta do site não tem acesso ao KanGest.")) };
    let agora = db::agora();
    // a cópia local da senha (para o modo sem Internet) só muda numa entrada com a senha; com o Google fica a que havia
    let resumo = senha.map(hash_senha).transpose()?;
    let unico = |e: sqlx::Error| -> AppError {
        if e.to_string().contains("UNIQUE") {
            AppError::msg("Já há um utilizador local com este email como nome de acesso: o administrador tem de o mudar.")
        } else {
            e.into()
        }
    };
    let existente: Option<(i64, String)> = sqlx::query_as("SELECT id, perfil FROM utilizadores WHERE conta_site = ?").bind(&pessoa.id).fetch_optional(&st.pool).await?;
    // uma conta local que o administrador mandou ligar a este email (só se ainda não há conta ligada a esta pessoa)
    let pendente = if existente.is_none() { pendente_de_ligar(&st.pool, email).await? } else { None };
    let id = match (existente, pendente) {
        (Some((id, perfil_antes)), _) => {
            // o perfil manda o site; se mudou, as permissões próprias de cá deixam de valer (nunca ficam a mais)
            sqlx::query(
                "UPDATE utilizadores SET nome = ?, login = ?, email = ?, telefone = COALESCE(?, telefone), senha_hash = COALESCE(?, senha_hash), perfil = ?,
                   conta_site_validada_em = ?, mudar_senha = 0, permissoes = CASE WHEN ? THEN NULL ELSE permissoes END WHERE id = ?",
            )
            .bind(&pessoa.nome)
            .bind(email)
            .bind(&pessoa.email)
            .bind(&pessoa.telefone)
            .bind(&resumo)
            .bind(perfil)
            .bind(&agora)
            .bind(perfil_antes != perfil)
            .bind(id)
            .execute(&st.pool)
            .await
            .map_err(unico)?;
            id
        }
        // uma conta local que o administrador mandou ligar a este email: passa a ser a da pessoa, com o histórico
        (None, Some((id, perfil_antes))) => {
            sqlx::query(
                "UPDATE utilizadores SET nome = ?, login = ?, email = ?, telefone = COALESCE(?, telefone), senha_hash = COALESCE(?, senha_hash), perfil = ?, conta_site = ?,
                   conta_site_validada_em = ?, mudar_senha = 0, ligar_conta_site = NULL, permissoes = CASE WHEN ? THEN NULL ELSE permissoes END WHERE id = ?",
            )
            .bind(&pessoa.nome)
            .bind(email)
            .bind(&pessoa.email)
            .bind(&pessoa.telefone)
            .bind(&resumo)
            .bind(perfil)
            .bind(&pessoa.id)
            .bind(&agora)
            .bind(perfil_antes != perfil)
            .bind(id)
            .execute(&st.pool)
            .await
            .map_err(unico)?;
            registar(st, Some(id), email, "CONTA_SITE", Some(format!("conta local ligada à conta do site, como {perfil}"))).await;
            id
        }
        (None, None) => {
            let id = sqlx::query(
                "INSERT INTO utilizadores (nome, login, email, telefone, senha_hash, perfil, ativo, mudar_senha, conta_site, conta_site_validada_em)
                 VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)",
            )
            .bind(&pessoa.nome)
            .bind(email)
            .bind(&pessoa.email)
            .bind(&pessoa.telefone)
            .bind(match &resumo {
                Some(r) => r.clone(),
                None => hash_senha(&format!("{:032x}", rand::random::<u128>()))?,
            })
            .bind(perfil)
            .bind(&pessoa.id)
            .bind(&agora)
            .execute(&st.pool)
            .await
            .map_err(unico)?
            .last_insert_rowid();
            registar(st, Some(id), email, "CONTA_SITE", Some(format!("criado ao entrar com a conta do site, como {perfil}"))).await;
            id
        }
    };
    // a sessão do site fica para a Loja online (não pede a conta outra vez)
    crate::sinc::pessoa::guardar(&st.pool, id, &pessoa.email, &tokens, "", chrono::Utc::now().timestamp()).await?;
    Ok(sqlx::query("SELECT * FROM utilizadores WHERE id = ?").bind(id).fetch_one(&st.pool).await?)
}

#[derive(Deserialize)]
pub struct GoogleIn {
    /// o estado da entrada começada aqui (vem no retorno kangest://auth)
    estado: String,
    /// o código do retorno do Auth (a primeira volta)
    #[serde(default)]
    code: Option<String>,
    /// o código dos dois passos (a segunda volta)
    #[serde(default)]
    codigo: Option<String>,
    #[serde(default)]
    trocar: bool,
}

/// A entrada pelo navegador (o Google ou a sessão do site) é só no programa deste computador: abre o navegador do
/// sistema, e o retorno chega por uma ligação kangest://, que um posto ligado pela rede ou um browser não recebem.
fn so_neste_computador() -> AppResult<()> {
    if crate::state::contexto().is_some() {
        return Err(AppError::msg("A entrada pelo navegador é só no programa instalado neste computador. Aqui, entre com o email e a senha da conta do site."));
    }
    Ok(())
}

/// «Entrar com a sessão do site» (pedido do dono a 27/11: «o login deve funcionar para os dois»; sinc/entrada.rs): abre
/// a página do site no navegador do sistema; quem lá tem a sessão aberta confirma, e o KanGest entra com essa conta.
pub async fn site_iniciar(st: &AppState) -> AppResult<Value> {
    so_neste_computador()?;
    let url = crate::sinc::entrada::site_iniciar(&st.pool).await?;
    super::licenca::abrir_no_navegador(&url)?;
    Ok(json!({ "aberto": true }))
}

/// «Entrar com o Google» (KANGEST ONE, fase A; sinc/entrada.rs): abre a entrada do Google no navegador do sistema.
pub async fn google_iniciar(st: &AppState) -> AppResult<Value> {
    so_neste_computador()?;
    let url = crate::sinc::entrada::google_iniciar(&st.pool).await?;
    super::licenca::abrir_no_navegador(&url)?;
    Ok(json!({ "aberto": true }))
}

/// O retorno do navegador (o `code` do Google, ou o código de uso único do site) ou, na segunda volta, o código dos
/// dois passos. Depois de o site confirmar, é a mesma entrada da conta do site, sem mudar a cópia local da senha. Sem
/// Internet não há entrada pelo navegador.
pub async fn google_concluir(st: &AppState, i: GoogleIn) -> AppResult<Value> {
    use crate::sinc::entrada::{self, Validacao, Via};
    so_neste_computador()?;
    let via = entrada::via_em_curso().unwrap_or(Via::Google);
    let botao = via.botao();
    let (nome, como) = match via {
        Via::Google => ("Google", "com o Google"),
        Via::Site => ("Sessão do site", "pela sessão do site"),
    };
    if !entrada::estado_valido(&i.estado) {
        return Err(AppError::msg(format!("Esta entrada não é válida: carregue outra vez em {botao}.")));
    }
    match entrada::google_concluir(&st.pool, &i.estado, i.code.as_deref(), i.codigo.as_deref()).await? {
        Validacao::PedirCodigo => Ok(json!({ "dois_passos": true })),
        Validacao::Recusada(m) => {
            registar(st, None, nome, "FALHA", Some(format!("entrada {como} recusada: {m}"))).await;
            Err(AppError::msg(m))
        }
        Validacao::SemLigacao(m) => Err(AppError::msg(format!(
            "Sem ligação ao site ({m}): {botao} precisa de Internet. Sem Internet, entre com o email e a senha da conta do site."
        ))),
        Validacao::Confirmada { pessoa, tokens } => {
            let email = pessoa.email.trim().to_lowercase();
            if email.is_empty() {
                return Err(AppError::msg("A conta não deu o email: entre com o email e a senha da conta do site."));
            }
            let guardada = sqlx::query("SELECT * FROM utilizadores WHERE login = ? AND conta_site IS NOT NULL").bind(&email).fetch_optional(&st.pool).await?;
            if let Some(row) = &guardada {
                if let Some(ate) = bloqueada_ate(row) {
                    registar(st, Some(row.get("id")), &email, "FALHA", Some("conta bloqueada".into())).await;
                    return Err(AppError::msg(format!("Conta bloqueada por tentativas falhadas até às {}. Peça ao administrador para a desbloquear.", hora(&ate))));
                }
            }
            let row = confirmar_conta_site(st, &email, guardada.as_ref(), pessoa, tokens, None).await?;
            let id: i64 = row.get("id");
            if row.get::<i64, _>("ativo") != 1 {
                registar(st, Some(id), &email, "FALHA", Some("conta desactivada".into())).await;
                return Err(AppError::msg("Esta conta está desactivada neste KanGest. Fale com o administrador."));
            }
            conta_diferente(st, id, &email, i.trocar).await?;
            entrar(st, &row, if via == Via::Site { "conta do site (sessão do site)" } else { "conta do site (Google)" }).await
        }
    }
}

/// Falhas seguidas de entrada por PIN em cada posto (um PIN de 4 dígitos não pode ser adivinhado à força).
type FalhasPin = std::sync::Mutex<Option<std::collections::HashMap<i64, (u32, chrono::DateTime<chrono::Local>)>>>;
static FALHAS_PIN: FalhasPin = std::sync::Mutex::new(None);

#[derive(Deserialize)]
pub struct PinIn {
    pin: String,
    #[serde(default)]
    trocar: bool,
}

/// O início da mensagem de «Conta diferente» (o ecrã de entrada reconhece-a e mostra «Sair e trocar de conta»).
pub const CONTA_DIFERENTE: &str = "Conta diferente: este aparelho tem a sessão de ";

/// «Incompatibilidade de conta», como no Claude: este aparelho já tem a sessão de outra pessoa (por exemplo, noutra aba
/// do mesmo browser, que partilha a ligação). Entrar com outra conta substituía-a sem ninguém saber; agora a troca tem
/// de ser confirmada e fica na auditoria.
async fn conta_diferente(st: &AppState, novo: i64, login: &str, trocar: bool) -> AppResult<()> {
    // só nos postos e browsers ligados ao servidor: o programa no próprio computador tem uma janela e só mostra a
    // entrada sem sessão, por isso aí não há troca silenciosa a evitar
    if crate::state::contexto().is_none() {
        return Ok(());
    }
    let Some(actual) = st.sessao_opcional() else { return Ok(()) };
    if actual.id == novo {
        return Ok(());
    }
    if !trocar {
        return Err(AppError::msg(format!("{CONTA_DIFERENTE}{}.", actual.nome)));
    }
    registar(st, Some(novo), login, "CONTA_TROCADA", Some(format!("saiu {} ({}) deste aparelho", actual.nome, actual.login))).await;
    Ok(())
}

/// Entrada só com o PIN (terminais POS), se a política o permitir.
pub async fn login_pin(st: &AppState, i: PinIn) -> AppResult<Value> {
    let pol = politica(st).await?;
    if !pol.login_pin {
        return Err(AppError::msg("A entrada por PIN não está activada."));
    }
    // um PIN de 4 algarismos é para o balcão: de fora entra-se com o utilizador e a senha (e os dois passos)
    if crate::state::pela_internet() {
        return Err(AppError::msg("A entrada só com o PIN não se usa pela Internet. Entre com o utilizador e a senha."));
    }
    let posto = st.posto().id;
    {
        let mut g = FALHAS_PIN.lock().unwrap();
        let mapa = g.get_or_insert_with(Default::default);
        if let Some((n, quando)) = mapa.get(&posto) {
            if *n >= 5 && chrono::Local::now() - *quando < chrono::Duration::minutes(5) {
                return Err(AppError::msg("Demasiadas tentativas com PIN neste posto. Aguarde 5 minutos ou entre com a senha."));
            }
        }
    }
    let pin = i.pin.trim();
    let rows = sqlx::query("SELECT * FROM utilizadores WHERE ativo = 1 AND pin_hash IS NOT NULL").fetch_all(&st.pool).await?;
    let encontrado = rows.into_iter().find(|r| verificar(pin, &r.get::<String, _>("pin_hash")));
    let Some(row) = encontrado else {
        {
            let mut g = FALHAS_PIN.lock().unwrap();
            let e = g.get_or_insert_with(Default::default).entry(posto).or_insert((0, chrono::Local::now()));
            e.0 += 1;
            e.1 = chrono::Local::now();
        }
        registar(st, None, "", "FALHA", Some("PIN errado".into())).await;
        return Err(AppError::msg("PIN incorrecto."));
    };
    if let Some(ate) = bloqueada_ate(&row) {
        return Err(AppError::msg(format!("Conta bloqueada por tentativas falhadas até às {}.", hora(&ate))));
    }
    if let Some(m) = FALHAS_PIN.lock().unwrap().as_mut() {
        m.remove(&posto);
    }
    conta_diferente(st, row.get("id"), &row.get::<String, _>("login"), i.trocar).await?;
    entrar(st, &row, "PIN").await
}

pub async fn logout(st: &AppState) -> AppResult<Value> {
    if let Some(s) = st.sessao_opcional() {
        registar(st, Some(s.id), &s.login, "LOGOUT", None).await;
    }
    st.definir_sessao(None);
    Ok(Value::Null)
}

/// Bloqueia a sessão (inactividade ou o operador sai por momentos): o ecrã fica tapado e o servidor
/// recusa os pedidos até se retomar.
pub async fn bloquear(st: &AppState) -> AppResult<Value> {
    let mut s = st.sessao()?;
    if !s.bloqueada {
        s.bloqueada = true;
        registar(st, Some(s.id), &s.login, "SESSAO_BLOQUEADA", None).await;
        st.definir_sessao(Some(s.clone()));
    }
    Ok(serde_json::to_value(s)?)
}

#[derive(Deserialize)]
pub struct RetomarIn {
    #[serde(default)]
    senha: Option<String>,
    #[serde(default)]
    pin: Option<String>,
}

/// Retoma a sessão bloqueada com a senha ou o PIN do próprio utilizador.
pub async fn desbloquear(st: &AppState, i: RetomarIn) -> AppResult<Value> {
    let mut s = st.sessao()?;
    let pol = politica(st).await?;
    let row = sqlx::query("SELECT * FROM utilizadores WHERE id = ?").bind(s.id).fetch_one(&st.pool).await?;
    let ok = match (i.senha.as_deref().filter(|x| !x.is_empty()), i.pin.as_deref().map(str::trim).filter(|x| !x.is_empty())) {
        (Some(senha), _) => verificar(senha, &row.get::<String, _>("senha_hash")),
        (None, Some(pin)) => row.get::<Option<String>, _>("pin_hash").is_some_and(|h| verificar(pin, &h)),
        _ => false,
    };
    if !ok {
        let erro = falhou(st, &pol, s.id, &s.login, row.get("tentativas"), "retomar sessão").await?;
        // conta bloqueada: a sessão também termina
        if sqlx::query_scalar::<_, Option<String>>("SELECT bloqueado_ate FROM utilizadores WHERE id = ?").bind(s.id).fetch_one(&st.pool).await?.is_some_and(|a| a > db::agora()) {
            st.definir_sessao(None);
        }
        return Err(erro);
    }
    sqlx::query("UPDATE utilizadores SET tentativas = 0 WHERE id = ?").bind(s.id).execute(&st.pool).await?;
    s.bloqueada = false;
    registar(st, Some(s.id), &s.login, "SESSAO_RETOMADA", None).await;
    st.definir_sessao(Some(s.clone()));
    Ok(serde_json::to_value(s)?)
}

#[derive(Deserialize)]
pub struct SenhaIn {
    atual: String,
    nova: String,
}

/// Valida uma senha nova contra a política.
fn validar_senha(pol: &Politica, senha: &str) -> AppResult<()> {
    if senha.chars().count() < pol.senha_min {
        return Err(AppError::msg(format!("A senha deve ter pelo menos {} caracteres.", pol.senha_min)));
    }
    if senha.trim().is_empty() || senha.chars().all(|c| c == senha.chars().next().unwrap_or(' ')) {
        return Err(AppError::msg("Escolha uma senha menos previsível."));
    }
    Ok(())
}

pub async fn alterar_senha(st: &AppState, i: SenhaIn) -> AppResult<Value> {
    let mut s = st.sessao()?;
    let pol = politica(st).await?;
    let (hash, conta_site): (String, Option<String>) =
        sqlx::query_as("SELECT senha_hash, conta_site FROM utilizadores WHERE id = ?").bind(s.id).fetch_one(&st.pool).await?;
    if conta_site.is_some() {
        return Err(AppError::msg("Esta conta entra com a senha do site: mude-a no site (a próxima entrada com Internet actualiza a cópia daqui)."));
    }
    if !verificar(&i.atual, &hash) {
        return Err(AppError::msg("A senha actual está incorrecta."));
    }
    validar_senha(&pol, &i.nova)?;
    if i.nova == i.atual {
        return Err(AppError::msg("A nova senha tem de ser diferente da actual."));
    }
    sqlx::query("UPDATE utilizadores SET senha_hash = ?, mudar_senha = 0, senha_alterada_em = ? WHERE id = ?")
        .bind(hash_senha(&i.nova)?)
        .bind(db::agora())
        .bind(s.id)
        .execute(&st.pool)
        .await?;
    // como no Claude: mudar a senha termina as sessões nos outros aparelhos
    let terminadas = terminar_do_utilizador(st, s.id, Some(&id_actual()));
    registar(st, Some(s.id), &s.login, "SENHA", Some(format!("alterada pelo próprio; {terminadas} outra(s) sessão(ões) terminada(s)"))).await;
    s.mudar_senha = false;
    st.definir_sessao(Some(s.clone()));
    Ok(serde_json::to_value(s)?)
}

// ============================== o meu perfil ==============================

/// O perfil de quem está a usar o programa: nome, contactos e fotografia (menu do utilizador → O meu perfil).
pub async fn perfil(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let r = sqlx::query("SELECT nome, login, email, telefone, foto FROM utilizadores WHERE id = ?").bind(s.id).fetch_one(&st.pool).await?;
    Ok(json!({
        "nome": r.get::<String, _>("nome"),
        "login": r.get::<String, _>("login"),
        "email": r.get::<Option<String>, _>("email").unwrap_or_default(),
        "telefone": r.get::<Option<String>, _>("telefone").unwrap_or_default(),
        "foto": r.get::<Option<String>, _>("foto"),
        "perfil": s.perfil_descricao.clone().unwrap_or(s.perfil.clone()),
    }))
}

#[derive(Deserialize)]
pub struct MeuPerfilIn {
    nome: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    telefone: String,
    /// Fotografia em data URL (JPEG, PNG ou WebP, já reduzida); `""` tira-a; sem ela, fica como está.
    #[serde(default)]
    foto: Option<String>,
}

/// Cada um muda o seu nome, contactos e fotografia. O utilizador (login), o perfil e as permissões são do
/// administrador. A mudança do nome fica no registo de acessos (o antigo e o novo).
pub async fn guardar_perfil(st: &AppState, i: MeuPerfilIn) -> AppResult<Value> {
    let mut s = st.sessao()?;
    let nome = i.nome.trim();
    if nome.is_empty() || nome.chars().count() > 80 {
        return Err(AppError::msg("Escreva o seu nome (até 80 caracteres)."));
    }
    let email = i.email.trim();
    if !email.is_empty() && (email.len() > 120 || !email.contains('@') || email.contains(' ')) {
        return Err(AppError::msg("O email não parece certo."));
    }
    let telefone = i.telefone.trim();
    if telefone.chars().count() > 30 {
        return Err(AppError::msg("O telefone é demasiado comprido."));
    }
    if let Some(f) = i.foto.as_deref().filter(|f| !f.is_empty()) {
        let tipo_ok = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"].iter().any(|p| f.starts_with(p));
        if !tipo_ok || f.len() > 400_000 {
            return Err(AppError::msg("A fotografia deve ser JPEG, PNG ou WebP e pequena (até 300 KB)."));
        }
    }
    let antigo: String = sqlx::query_scalar("SELECT nome FROM utilizadores WHERE id = ?").bind(s.id).fetch_one(&st.pool).await?;
    sqlx::query("UPDATE utilizadores SET nome = ?, email = ?, telefone = ? WHERE id = ?")
        .bind(nome)
        .bind(Some(email).filter(|e| !e.is_empty()))
        .bind(Some(telefone).filter(|t| !t.is_empty()))
        .bind(s.id)
        .execute(&st.pool)
        .await?;
    if let Some(f) = i.foto.as_deref() {
        sqlx::query("UPDATE utilizadores SET foto = ? WHERE id = ?").bind(Some(f).filter(|f| !f.is_empty())).bind(s.id).execute(&st.pool).await?;
    }
    let detalhe = if antigo != nome { format!("nome: «{antigo}» → «{nome}»") } else { "contactos ou fotografia".into() };
    registar(st, Some(s.id), &s.login, "PERFIL", Some(detalhe)).await;
    s.nome = nome.to_string();
    st.definir_sessao(Some(s.clone()));
    Ok(serde_json::to_value(s)?)
}

// ============================== recuperar a senha ==============================

/// Autorizações para escolher a senha nova depois de conferido o código de dois passos: token → (utilizador, validade).
/// Ficam só na memória do servidor (reiniciar anula-as), valem 10 minutos e servem uma vez.
type Recuperacoes = std::sync::Mutex<Option<std::collections::HashMap<String, (i64, chrono::DateTime<chrono::Local>)>>>;
static RECUPERACOES: Recuperacoes = std::sync::Mutex::new(None);
const RECUPERACAO_MIN: i64 = 10;
const ERRO_RECUPERACAO: &str =
    "Utilizador ou código de verificação incorrectos. Sem a verificação em dois passos, peça ao administrador uma senha provisória.";
const RECUPERACAO_EXPIROU: &str = "O pedido para mudar a senha expirou. Comece de novo.";

/// Pela Internet (túnel) a senha não se recupera: só nos postos da loja, como o PIN.
fn recuperar_so_na_loja() -> AppResult<()> {
    if crate::state::pela_internet() {
        return Err(AppError::msg("A senha não se recupera pela Internet. Use um posto da loja, ou peça ao administrador uma senha provisória."));
    }
    Ok(())
}

/// O utilizador da autorização, se ainda for válida (sem a gastar).
fn autorizacao(token: &str) -> Option<i64> {
    let agora = chrono::Local::now();
    let mut g = RECUPERACOES.lock().unwrap();
    let mapa = g.get_or_insert_with(Default::default);
    mapa.retain(|_, (_, ate)| *ate > agora);
    mapa.get(token).map(|(id, _)| *id)
}

#[derive(Deserialize)]
pub struct RecuperarVerificarIn {
    login: String,
    codigo: String,
}

/// «Esqueci-me da senha», 1.º passo: o utilizador e o código da aplicação de autenticação (ou um código de
/// recuperação, que se gasta). Só para contas com a verificação em dois passos; as outras pedem ao administrador uma
/// senha provisória. A mensagem de erro é a mesma em todos os casos (não diz se o utilizador existe), e um código
/// errado conta como tentativa falhada para o bloqueio da conta. Devolve uma autorização de 10 minutos.
pub async fn recuperar_verificar(st: &AppState, i: RecuperarVerificarIn) -> AppResult<Value> {
    recuperar_so_na_loja()?;
    let pol = politica(st).await?;
    let login = i.login.trim();
    let Some(row) = sqlx::query("SELECT * FROM utilizadores WHERE login = ?").bind(login).fetch_optional(&st.pool).await? else {
        registar(st, None, login, "FALHA", Some("recuperação da senha: utilizador inexistente".into())).await;
        return Err(AppError::msg(ERRO_RECUPERACAO));
    };
    let id: i64 = row.get("id");
    if let Some(ate) = bloqueada_ate(&row) {
        registar(st, Some(id), login, "FALHA", Some("recuperação da senha: conta bloqueada".into())).await;
        return Err(AppError::msg(format!("Conta bloqueada por tentativas falhadas até às {}. Peça ao administrador para a desbloquear.", hora(&ate))));
    }
    if row.get::<i64, _>("ativo") == 0 {
        registar(st, Some(id), login, "FALHA", Some("recuperação da senha: conta desactivada".into())).await;
        return Err(AppError::msg(ERRO_RECUPERACAO));
    }
    match super::dois_passos::conferir_conta(st, &row, &i.codigo, "Recuperação da senha").await? {
        None => {
            registar(st, Some(id), login, "FALHA", Some("recuperação da senha: conta sem dois passos".into())).await;
            Err(AppError::msg(ERRO_RECUPERACAO))
        }
        Some(false) => {
            let e = falhou(st, &pol, id, login, row.get("tentativas"), "recuperação da senha: código errado").await?;
            // o aviso do bloqueio interessa; o de «senha incorrecta» não se aplica aqui
            Err(if e.to_string().contains("bloqueada") { e } else { AppError::msg(ERRO_RECUPERACAO) })
        }
        Some(true) => {
            let token: String = rand::thread_rng().gen::<[u8; 32]>().iter().map(|b| format!("{b:02x}")).collect();
            {
                let agora = chrono::Local::now();
                let mut g = RECUPERACOES.lock().unwrap();
                let mapa = g.get_or_insert_with(Default::default);
                mapa.retain(|_, (_, ate)| *ate > agora);
                mapa.insert(token.clone(), (id, agora + chrono::Duration::minutes(RECUPERACAO_MIN)));
            }
            registar(st, Some(id), login, "RECUPERACAO", Some("código de dois passos conferido".into())).await;
            Ok(json!({ "token": token, "nome": row.get::<String, _>("nome"), "minutos": RECUPERACAO_MIN }))
        }
    }
}

#[derive(Deserialize)]
pub struct RecuperarConcluirIn {
    token: String,
    nova: String,
}

/// «Esqueci-me da senha», 2.º passo: a senha nova (com a política de senhas), com a autorização do 1.º passo. A conta
/// fica sem senha provisória e desbloqueada; a autorização gasta-se.
pub async fn recuperar_concluir(st: &AppState, i: RecuperarConcluirIn) -> AppResult<Value> {
    recuperar_so_na_loja()?;
    let token = i.token.trim();
    let id = autorizacao(token).ok_or_else(|| AppError::msg(RECUPERACAO_EXPIROU))?;
    let pol = politica(st).await?;
    // uma senha que não serve não gasta a autorização: escolhe-se outra
    validar_senha(&pol, &i.nova)?;
    let row = sqlx::query("SELECT login, senha_hash, ativo FROM utilizadores WHERE id = ?").bind(id).fetch_one(&st.pool).await?;
    if row.get::<i64, _>("ativo") == 0 {
        return Err(AppError::msg("Esta conta está desactivada. Fale com o administrador."));
    }
    if verificar(&i.nova, &row.get::<String, _>("senha_hash")) {
        return Err(AppError::msg("A nova senha tem de ser diferente da actual."));
    }
    let gasta = RECUPERACOES.lock().unwrap().as_mut().and_then(|m| m.remove(token)).is_some();
    if !gasta {
        return Err(AppError::msg(RECUPERACAO_EXPIROU));
    }
    sqlx::query("UPDATE utilizadores SET senha_hash = ?, mudar_senha = 0, senha_alterada_em = ?, tentativas = 0, bloqueado_ate = NULL WHERE id = ?")
        .bind(hash_senha(&i.nova)?)
        .bind(db::agora())
        .bind(id)
        .execute(&st.pool)
        .await?;
    let login: String = row.get("login");
    registar(st, Some(id), &login, "SENHA", Some("recuperada com a verificação em dois passos".into())).await;
    Ok(json!({ "ok": true }))
}

// ============================== utilizadores ==============================

pub async fn listar(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.utilizadores")?;
    let rows = sqlx::query("SELECT u.*, p.descricao AS perfil_descricao FROM utilizadores u LEFT JOIN perfis p ON p.codigo = u.perfil ORDER BY u.nome")
        .fetch_all(&st.pool)
        .await?;
    let agora = db::agora();
    let mut lista = Vec::with_capacity(rows.len());
    for r in &rows {
        let perfil: String = r.get("perfil");
        let proprias: Option<String> = r.get("permissoes");
        let (_, permissoes) = permissoes_efectivas(&st.pool, &perfil, proprias.as_deref()).await;
        let bloqueado: Option<String> = r.get::<Option<String>, _>("bloqueado_ate").filter(|a| *a > agora);
        lista.push(json!({
            "id": r.get::<i64, _>("id"),
            "nome": r.get::<String, _>("nome"),
            "login": r.get::<String, _>("login"),
            "ativo": r.get::<i64, _>("ativo"),
            "criado_em": r.get::<String, _>("criado_em"),
            "permissoes_proprias": proprias.is_some(),
            "permissoes": permissoes,
            "limite_desconto": r.get::<f64, _>("limite_desconto"),
            "armazem_id": r.try_get::<Option<i64>, _>("armazem_id").ok().flatten(),
            "tem_pin": r.get::<Option<String>, _>("pin_hash").is_some(),
            "dois_passos": r.get::<Option<String>, _>("totp_segredo").is_some_and(|x| !x.is_empty()),
            "perfil": perfil,
            "perfil_descricao": r.get::<Option<String>, _>("perfil_descricao"),
            "mudar_senha": r.get::<i64, _>("mudar_senha") == 1,
            "ultimo_acesso": r.get::<Option<String>, _>("ultimo_acesso"),
            "bloqueado_ate": bloqueado,
            "tentativas": r.get::<i64, _>("tentativas"),
            "importado": r.get::<Option<String>, _>("id_origem").is_some(),
            // entra com a conta do site (o perfil vem de lá; a senha é a do site)
            "conta_site": r.try_get::<Option<String>, _>("conta_site").ok().flatten().is_some(),
            // as permissões vieram do KIGEST (aproximadas) e o administrador ainda não as confirmou (migração 0064)
            "rever_permissoes": r.try_get::<Option<String>, _>("permissoes_kigest").ok().flatten().as_deref() == Some("rever"),
            "foto": r.try_get::<Option<String>, _>("foto").ok().flatten(),
        }));
    }
    Ok(Value::Array(lista))
}

#[derive(Deserialize)]
pub struct UtilizadorIn {
    id: Option<i64>,
    nome: String,
    login: String,
    perfil: String,
    ativo: Option<bool>,
    senha: Option<String>,
    /// PIN de autorização (4–8 dígitos). Vazio = manter; "-" = remover.
    pin: Option<String>,
    /// Lista de permissões; `null` = usar as do perfil.
    permissoes: Option<Vec<String>>,
    limite_desconto: Option<f64>,
    /// Obrigar a mudar a senha no próximo acesso (por omissão nos utilizadores novos).
    mudar_senha: Option<bool>,
    /// A loja (armazém) do utilizador; vazio = todas.
    #[serde(default)]
    armazem_id: Option<i64>,
}

/// O PIN identifica a pessoa (entrada por PIN e autorizações de supervisor): não pode repetir-se.
async fn pin_em_uso(st: &AppState, pin: &str, excepto: Option<i64>) -> AppResult<bool> {
    let rows = sqlx::query("SELECT id, pin_hash FROM utilizadores WHERE pin_hash IS NOT NULL AND ativo = 1").fetch_all(&st.pool).await?;
    Ok(rows.iter().any(|r| Some(r.get::<i64, _>("id")) != excepto && verificar(pin, &r.get::<String, _>("pin_hash"))))
}

pub async fn guardar(st: &AppState, u: UtilizadorIn) -> AppResult<Value> {
    let quem = st.exigir_perm("sistema.utilizadores")?;
    let pol = politica(st).await?;
    let existe: Option<i64> = sqlx::query_scalar("SELECT nivel FROM perfis WHERE codigo = ?").bind(&u.perfil).fetch_optional(&st.pool).await?;
    if existe.is_none() {
        return Err(AppError::msg("Perfil inválido."));
    }
    if u.nome.trim().is_empty() || u.login.trim().is_empty() {
        return Err(AppError::msg("Nome e utilizador são obrigatórios."));
    }
    // KANGEST ONE (fase A): num KanGest ligado ao site, as pessoas entram com a conta do site; contas locais novas só
    // de administrador (o recurso)
    if u.id.is_none() && u.perfil != "ADMIN" && ligado_ao_site(&st.pool).await {
        return Err(AppError::msg(
            "Este KanGest está ligado ao site: crie a conta da pessoa no painel do site (com a permissão «KanGest: caixa» ou «gestor») e ela entra aqui com o email e a senha do site.",
        ));
    }
    // o último administrador activo não pode perder o acesso
    if let Some(id) = u.id {
        let era_admin: bool = sqlx::query_scalar::<_, String>("SELECT perfil FROM utilizadores WHERE id = ?").bind(id).fetch_optional(&st.pool).await?.as_deref() == Some("ADMIN");
        let fica_admin = u.perfil == "ADMIN" && u.ativo.unwrap_or(true);
        if era_admin && !fica_admin {
            let outros: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM utilizadores WHERE perfil = 'ADMIN' AND ativo = 1 AND id <> ?").bind(id).fetch_one(&st.pool).await?;
            if outros == 0 {
                return Err(AppError::msg("Este é o único administrador activo: crie ou active outro antes de lhe retirar o acesso."));
            }
        }
    }
    let perms = match &u.permissoes {
        Some(p) => {
            if let Some(x) = p.iter().find(|x| !PERMISSOES.contains(&x.as_str())) {
                return Err(AppError::msg(format!("Permissão desconhecida: {x}")));
            }
            Some(serde_json::to_string(p)?)
        }
        None => None,
    };
    let pin = u.pin.as_deref().map(str::trim).unwrap_or("");
    if !pin.is_empty() && pin != "-" {
        if pin.len() < 4 || pin.len() > 8 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::msg("O PIN deve ter entre 4 e 8 dígitos."));
        }
        if pin_em_uso(st, pin, u.id).await? {
            return Err(AppError::msg("Este PIN já é usado por outro utilizador. Escolha outro."));
        }
    }
    if let Some(a) = u.armazem_id {
        let existe: Option<i64> = sqlx::query_scalar("SELECT id FROM armazens WHERE id = ?").bind(a).fetch_optional(&st.pool).await?;
        if existe.is_none() {
            return Err(AppError::msg("Loja (armazém) inválida."));
        }
        if u.perfil == "ADMIN" {
            return Err(AppError::msg("Um administrador vê todas as lojas: deixe a loja vazia."));
        }
    }
    let ativo = u.ativo.unwrap_or(true) as i64;
    let limite = u.limite_desconto.unwrap_or(0.0).clamp(0.0, 100.0);
    let mut tx = crate::db::transacao(&st.pool).await?;
    let id = match u.id {
        Some(id) => {
            sqlx::query(
                "UPDATE utilizadores SET nome = ?, login = ?, perfil = ?, ativo = ?, permissoes = ?, limite_desconto = ?,
                   permissoes_kigest = CASE WHEN permissoes_kigest IS NULL THEN NULL ELSE 'revisto' END WHERE id = ?",
            )
                .bind(u.nome.trim())
                .bind(u.login.trim())
                .bind(&u.perfil)
                .bind(ativo)
                .bind(&perms)
                .bind(limite)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| if e.to_string().contains("UNIQUE") { AppError::msg("Já existe um utilizador com este nome de acesso.") } else { e.into() })?;
            if let Some(s) = u.senha.as_deref().filter(|s| !s.is_empty()) {
                validar_senha(&pol, s)?;
                sqlx::query("UPDATE utilizadores SET senha_hash = ?, senha_alterada_em = ?, mudar_senha = ? WHERE id = ?")
                    .bind(hash_senha(s)?)
                    .bind(db::agora())
                    .bind(u.mudar_senha.unwrap_or(true) as i64)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            } else if let Some(m) = u.mudar_senha {
                sqlx::query("UPDATE utilizadores SET mudar_senha = ? WHERE id = ?").bind(m as i64).bind(id).execute(&mut *tx).await?;
            }
            id
        }
        None => {
            let senha = u.senha.as_deref().unwrap_or("");
            validar_senha(&pol, senha)?;
            sqlx::query(
                "INSERT INTO utilizadores (nome, login, senha_hash, perfil, ativo, permissoes, limite_desconto, mudar_senha, senha_alterada_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(u.nome.trim())
            .bind(u.login.trim())
            .bind(hash_senha(senha)?)
            .bind(&u.perfil)
            .bind(ativo)
            .bind(&perms)
            .bind(limite)
            .bind(u.mudar_senha.unwrap_or(true) as i64)
            .bind(db::agora())
            .execute(&mut *tx)
            .await
            .map_err(|e| if e.to_string().contains("UNIQUE") { AppError::msg("Já existe um utilizador com este nome de acesso.") } else { e.into() })?
            .last_insert_rowid()
        }
    };
    match pin {
        "-" => {
            sqlx::query("UPDATE utilizadores SET pin_hash = NULL WHERE id = ?").bind(id).execute(&mut *tx).await?;
        }
        p if !p.is_empty() => {
            sqlx::query("UPDATE utilizadores SET pin_hash = ? WHERE id = ?").bind(hash_senha(p)?).bind(id).execute(&mut *tx).await?;
        }
        _ => {}
    }
    sqlx::query("UPDATE utilizadores SET armazem_id = ? WHERE id = ?").bind(u.armazem_id).bind(id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'UTILIZADOR', ?)")
        .bind(quem.id)
        .bind(format!("{} {} ({})", if u.id.is_some() { "Alterado" } else { "Criado" }, u.login.trim(), u.perfil))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(json!({ "id": id }))
}

#[derive(Deserialize)]
pub struct IdUtilizadorIn {
    id: i64,
    #[serde(default)]
    senha: Option<String>,
}

/// O administrador põe uma senha provisória (ou gera uma): o utilizador tem de a mudar ao entrar.
pub async fn redefinir_senha(st: &AppState, i: IdUtilizadorIn) -> AppResult<Value> {
    let quem = st.exigir_perm("sistema.utilizadores")?;
    let pol = politica(st).await?;
    let senha = match i.senha.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => {
            validar_senha(&pol, s)?;
            s.to_string()
        }
        None => {
            const ALFABETO: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
            let mut r = rand::thread_rng();
            (0..pol.senha_min.max(8)).map(|_| ALFABETO[r.gen_range(0..ALFABETO.len())] as char).collect()
        }
    };
    let login: Option<String> = sqlx::query_scalar("SELECT login FROM utilizadores WHERE id = ?").bind(i.id).fetch_optional(&st.pool).await?;
    let login = login.ok_or_else(|| AppError::msg("Utilizador não encontrado."))?;
    sqlx::query("UPDATE utilizadores SET senha_hash = ?, mudar_senha = 1, tentativas = 0, bloqueado_ate = NULL, senha_alterada_em = ? WHERE id = ?")
        .bind(hash_senha(&senha)?)
        .bind(db::agora())
        .bind(i.id)
        .execute(&st.pool)
        .await?;
    // a senha nova só vale a partir daqui: as sessões abertas dessa pessoa terminam (menos a de quem redefine)
    let actual = id_actual();
    let terminadas = terminar_do_utilizador(st, i.id, (i.id == quem.id).then_some(actual.as_str()));
    registar(st, Some(i.id), &login, "SENHA_REDEFINIDA", Some(format!("por {}; {terminadas} sessão(ões) terminada(s)", quem.nome))).await;
    Ok(json!({ "senha": senha, "login": login }))
}

// ============================== aparelhos com sessão ==============================

/// O aparelho que fez este pedido: a ligação do posto ou browser, ou «local» (o próprio computador).
fn id_actual() -> String {
    crate::state::contexto().and_then(|c| c.ligacao).unwrap_or_else(|| "local".into())
}

/// Termina as sessões de um utilizador em todos os aparelhos, menos `excepto`. Devolve quantas terminou.
fn terminar_do_utilizador(st: &AppState, id: i64, excepto: Option<&str>) -> usize {
    let mut n = 0;
    for x in crate::rede::sessoes_ligadas() {
        if x.utilizador_id == id && excepto != Some(x.id.as_str()) && crate::rede::terminar_ligacao(&x.id).is_some() {
            n += 1;
        }
    }
    if excepto != Some("local") {
        let mut local = st.sessao.lock().unwrap();
        if local.as_ref().is_some_and(|x| x.id == id) {
            *local = None;
            *st.entrada_local.lock().unwrap() = None;
            n += 1;
        }
    }
    n
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct SessoesIn {
    /// as de toda a gente (precisa de «Utilizadores»)
    todos: bool,
}

/// Onde há sessão iniciada, como em «Onde você fez login» do Claude: este computador e cada posto ou browser ligado
/// ao servidor, com o aparelho, o local aproximado, a entrada e a última actividade. O aparelho de quem pede vem
/// marcado como actual.
pub async fn sessoes(st: &AppState, i: SessoesIn) -> AppResult<Value> {
    let s = if i.todos { st.exigir_perm("sistema.utilizadores")? } else { st.sessao()? };
    let actual = id_actual();
    let mut lista: Vec<Value> = crate::rede::sessoes_ligadas()
        .into_iter()
        .filter(|x| i.todos || x.utilizador_id == s.id)
        .map(|x| {
            let eu = x.id == actual;
            let mut v = serde_json::to_value(x).unwrap_or_default();
            v["actual"] = json!(eu);
            v
        })
        .collect();
    let local = st.sessao.lock().unwrap().clone();
    if let Some(local) = local.filter(|l| i.todos || l.id == s.id) {
        lista.push(json!({
            "id": "local", "utilizador_id": local.id, "utilizador": local.nome, "aparelho": "Este computador (servidor)",
            "posto": "", "local": "No próprio computador", "endereco": "", "entrada": st.entrada_local.lock().unwrap().clone(),
            "ultimo": Value::Null, "pela_internet": false, "actual": actual == "local",
        }));
    }
    lista.sort_by(|a, b| {
        b["actual"].as_bool().cmp(&a["actual"].as_bool()).then_with(|| b["ultimo"].as_str().cmp(&a["ultimo"].as_str()))
    });
    Ok(json!({ "sessoes": lista }))
}

#[derive(Deserialize)]
pub struct TerminarSessaoIn {
    id: String,
}

/// Termina a sessão de um aparelho: a do próprio ou, com «Utilizadores», a de qualquer pessoa.
pub async fn terminar_sessao(st: &AppState, i: TerminarSessaoIn) -> AppResult<Value> {
    let s = st.sessao()?;
    let dono = if i.id == "local" {
        st.sessao.lock().unwrap().as_ref().map(|x| x.id)
    } else {
        crate::rede::sessoes_ligadas().into_iter().find(|x| x.id == i.id).map(|x| x.utilizador_id)
    };
    let dono = dono.ok_or_else(|| AppError::msg("Esta sessão já terminou."))?;
    if dono != s.id {
        st.exigir_perm("sistema.utilizadores")?;
    }
    if i.id == "local" {
        *st.sessao.lock().unwrap() = None;
        *st.entrada_local.lock().unwrap() = None;
    } else {
        crate::rede::terminar_ligacao(&i.id);
    }
    registar(st, Some(dono), &s.login, "SESSAO_TERMINADA", Some(format!("aparelho {} terminado por {}", i.id, s.nome))).await;
    Ok(json!({ "actual": i.id == id_actual() }))
}

/// «Sair em todos os aparelhos»: termina as outras sessões do próprio; fica só a deste aparelho.
pub async fn terminar_outras(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let n = terminar_do_utilizador(st, s.id, Some(&id_actual()));
    if n > 0 {
        registar(st, Some(s.id), &s.login, "SESSOES_TERMINADAS", Some(format!("{n} aparelho(s)"))).await;
    }
    Ok(json!({ "terminadas": n }))
}

/// Levanta o bloqueio por tentativas falhadas.
pub async fn desbloquear_conta(st: &AppState, i: IdUtilizadorIn) -> AppResult<Value> {
    let quem = st.exigir_perm("sistema.utilizadores")?;
    let login: Option<String> = sqlx::query_scalar("SELECT login FROM utilizadores WHERE id = ?").bind(i.id).fetch_optional(&st.pool).await?;
    let login = login.ok_or_else(|| AppError::msg("Utilizador não encontrado."))?;
    sqlx::query("UPDATE utilizadores SET tentativas = 0, bloqueado_ate = NULL WHERE id = ?").bind(i.id).execute(&st.pool).await?;
    registar(st, Some(i.id), &login, "DESBLOQUEIO", Some(format!("por {}", quem.nome))).await;
    Ok(Value::Null)
}

// ============================== perfis de acesso ==============================

pub async fn perfis_listar(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.utilizadores")?;
    let rows = sqlx::query(
        "SELECT p.*, (SELECT COUNT(*) FROM utilizadores u WHERE u.perfil = p.codigo) AS utilizadores
         FROM perfis p ORDER BY p.sistema DESC, p.nivel DESC, p.descricao",
    )
    .fetch_all(&st.pool)
    .await?;
    let mut lista = Vec::with_capacity(rows.len());
    for r in &rows {
        let codigo: String = r.get("codigo");
        let (_, permissoes) = permissoes_efectivas(&st.pool, &codigo, None).await;
        lista.push(json!({
            "codigo": codigo,
            "descricao": r.get::<String, _>("descricao"),
            "nivel": r.get::<i64, _>("nivel"),
            "sistema": r.get::<i64, _>("sistema") == 1,
            "personalizado": r.get::<Option<String>, _>("permissoes").is_some(),
            "permissoes": permissoes,
            "utilizadores": r.get::<i64, _>("utilizadores"),
        }));
    }
    Ok(Value::Array(lista))
}

#[derive(Deserialize)]
pub struct PerfilIn {
    /// vazio = perfil novo (o código nasce da descrição)
    #[serde(default)]
    codigo: Option<String>,
    descricao: String,
    nivel: i64,
    /// `null` num perfil de origem = repor as permissões de origem
    permissoes: Option<Vec<String>>,
}

pub async fn perfis_guardar(st: &AppState, p: PerfilIn) -> AppResult<Value> {
    let quem = st.exigir_perm("sistema.utilizadores")?;
    let descricao = p.descricao.trim();
    if descricao.is_empty() {
        return Err(AppError::msg("Indique o nome do perfil."));
    }
    let nivel = p.nivel.clamp(1, 2); // o escalão de administrador é só do perfil Administrador
    if let Some(x) = p.permissoes.iter().flatten().find(|x| !PERMISSOES.contains(&x.as_str())) {
        return Err(AppError::msg(format!("Permissão desconhecida: {x}")));
    }
    let lista = p.permissoes.as_ref().map(serde_json::to_string).transpose()?;
    let codigo = match p.codigo.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some("ADMIN") => return Err(AppError::msg("O perfil Administrador tem sempre todas as permissões.")),
        Some(c) => {
            let sistema: Option<i64> = sqlx::query_scalar("SELECT sistema FROM perfis WHERE codigo = ?").bind(c).fetch_optional(&st.pool).await?;
            let sistema = sistema.ok_or_else(|| AppError::msg("Perfil não encontrado."))?;
            // perfis de origem: muda-se a lista, não o nome nem o escalão
            if sistema == 1 {
                sqlx::query("UPDATE perfis SET permissoes = ? WHERE codigo = ?").bind(&lista).bind(c).execute(&st.pool).await?;
            } else {
                sqlx::query("UPDATE perfis SET descricao = ?, nivel = ?, permissoes = ? WHERE codigo = ?")
                    .bind(descricao)
                    .bind(nivel)
                    .bind(lista.clone().unwrap_or_else(|| "[]".into()))
                    .bind(c)
                    .execute(&st.pool)
                    .await?;
            }
            c.to_string()
        }
        None => {
            let base: String = descricao
                .to_uppercase()
                .chars()
                .map(|c| match c {
                    'Á' | 'À' | 'Â' | 'Ã' => 'A',
                    'É' | 'Ê' => 'E',
                    'Í' => 'I',
                    'Ó' | 'Ô' | 'Õ' => 'O',
                    'Ú' => 'U',
                    'Ç' => 'C',
                    c if c.is_ascii_alphanumeric() => c,
                    _ => '_',
                })
                .collect::<String>()
                .trim_matches('_')
                .chars()
                .take(20)
                .collect();
            let base = if base.is_empty() { "PERFIL".to_string() } else { base };
            let mut codigo = base.clone();
            let mut n = 2;
            while sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM perfis WHERE codigo = ?").bind(&codigo).fetch_one(&st.pool).await? > 0 {
                codigo = format!("{base}_{n}");
                n += 1;
            }
            sqlx::query("INSERT INTO perfis (codigo, descricao, nivel, permissoes, sistema) VALUES (?, ?, ?, ?, 0)")
                .bind(&codigo)
                .bind(descricao)
                .bind(nivel)
                .bind(lista.clone().unwrap_or_else(|| serde_json::to_string(&permissoes_perfil("CAIXA")).unwrap_or_default()))
                .execute(&st.pool)
                .await?;
            codigo
        }
    };
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'PERFIL', ?)")
        .bind(quem.id)
        .bind(format!("Perfil {codigo} guardado"))
        .execute(&st.pool)
        .await?;
    Ok(json!({ "codigo": codigo }))
}

#[derive(Deserialize)]
pub struct CodigoIn {
    codigo: String,
}

pub async fn perfis_eliminar(st: &AppState, c: CodigoIn) -> AppResult<Value> {
    let quem = st.exigir_perm("sistema.utilizadores")?;
    let sistema: Option<i64> = sqlx::query_scalar("SELECT sistema FROM perfis WHERE codigo = ?").bind(&c.codigo).fetch_optional(&st.pool).await?;
    match sistema {
        None => return Err(AppError::msg("Perfil não encontrado.")),
        Some(1) => return Err(AppError::msg("Os perfis de origem não se eliminam.")),
        _ => {}
    }
    let em_uso: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM utilizadores WHERE perfil = ?").bind(&c.codigo).fetch_one(&st.pool).await?;
    if em_uso > 0 {
        return Err(AppError::msg(format!("{em_uso} utilizador(es) usam este perfil: mude-lhes o perfil antes de o eliminar.")));
    }
    sqlx::query("DELETE FROM perfis WHERE codigo = ?").bind(&c.codigo).execute(&st.pool).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'PERFIL', ?)")
        .bind(quem.id)
        .bind(format!("Perfil {} eliminado", c.codigo))
        .execute(&st.pool)
        .await?;
    Ok(Value::Null)
}

// ============================== autorização por PIN (supervisor) ==============================

/// Supervisor identificado por PIN que tem todas as permissões pedidas e limite de desconto suficiente.
pub struct Supervisor {
    pub id: i64,
    pub nome: String,
    pub limite_desconto: f64,
}

/// PIN de autorização errados seguidos, por quem pede, até ter de esperar; e quantos minutos (como a entrada por PIN).
const FALHAS_AUTORIZACAO: u32 = 5;
const ESPERA_AUTORIZACAO_MIN: i64 = 5;

pub async fn supervisor_por_pin(st: &AppState, pin: &str, perms: &[&str], desconto: f64) -> AppResult<Option<Supervisor>> {
    let pin = pin.trim();
    if pin.is_empty() {
        return Ok(None);
    }
    // quem pede: o utilizador da sessão (sem sessão, o posto). Cinco PIN errados seguidos obrigam a esperar: sem isto,
    // um PIN de 4 dígitos adivinhava-se à força de tentativas no pedido de aprovação.
    let sessao = st.sessao_opcional();
    let quem = sessao.as_ref().map(|s| s.id).unwrap_or(-st.posto().id);
    let espera = chrono::Duration::minutes(ESPERA_AUTORIZACAO_MIN);
    if let Some((n, quando)) = st.falhas_autorizacao.lock().unwrap().get(&quem) {
        if *n >= FALHAS_AUTORIZACAO && chrono::Local::now() - *quando < espera {
            return Err(AppError::msg(format!("Demasiados PIN errados seguidos. Aguarde {ESPERA_AUTORIZACAO_MIN} minutos e tente de novo.")));
        }
    }
    let rows = sqlx::query("SELECT id, nome, perfil, permissoes, limite_desconto, pin_hash FROM utilizadores WHERE ativo = 1 AND pin_hash IS NOT NULL")
        .fetch_all(&st.pool)
        .await?;
    for r in rows {
        let hash: String = r.get("pin_hash");
        if !verificar(pin, &hash) {
            continue;
        }
        let perfil: String = r.get("perfil");
        let json: Option<String> = r.get("permissoes");
        let (_, lista) = permissoes_efectivas(&st.pool, &perfil, json.as_deref()).await;
        let limite: f64 = r.get("limite_desconto");
        let tem_todas = perms.iter().all(|p| lista.iter().any(|x| x == p));
        let limite_ok = limite <= 0.0 || desconto <= limite + 1e-9;
        if tem_todas && limite_ok {
            st.falhas_autorizacao.lock().unwrap().remove(&quem);
            return Ok(Some(Supervisor { id: r.get("id"), nome: r.get("nome"), limite_desconto: limite }));
        }
        return Err(AppError::msg("O utilizador deste PIN não tem permissão (ou limite de desconto) para esta operação."));
    }
    // nenhum utilizador com este PIN: conta como tentativa falhada e fica no registo de acessos
    let n = {
        let mut m = st.falhas_autorizacao.lock().unwrap();
        let agora = chrono::Local::now();
        let e = m.entry(quem).or_insert((0, agora));
        e.0 += 1;
        e.1 = agora;
        e.0
    };
    let login = sessao.as_ref().map(|s| s.login.clone()).unwrap_or_default();
    registar(st, sessao.as_ref().map(|s| s.id), &login, "FALHA", Some(format!("PIN de autorização errado ({n}.ª tentativa seguida)"))).await;
    Ok(None)
}

#[derive(Deserialize)]
pub struct AutorizarIn {
    pin: String,
    permissao: String,
    #[serde(default)]
    desconto: f64,
}

/// Validação imediata do PIN no POS (ecrã "Autenticação" do KIGEST).
pub async fn autorizar(st: &AppState, a: AutorizarIn) -> AppResult<Value> {
    st.sessao()?;
    match supervisor_por_pin(st, &a.pin, &[a.permissao.as_str()], a.desconto).await? {
        Some(s) => Ok(json!({ "id": s.id, "nome": s.nome, "limite_desconto": s.limite_desconto })),
        None => Err(AppError::msg("PIN inválido.")),
    }
}
