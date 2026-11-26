// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Cópias de segurança (Fr_CopiaSeguranca do KIGEST).
//!
//! - Automáticas: ao abrir o programa e de N em N horas enquanto está aberto (por omissão 4), e no
//!   fecho de caixa. Ficam em `copias/` na pasta de dados (guardam-se as últimas N, por omissão 30).
//! - Se houver uma pasta externa configurada (pen, disco de rede, pasta do OneDrive ou Google Drive),
//!   cada cópia é também gravada lá, opcionalmente cifrada com uma senha (AES-256-GCM).
//! - Cada cópia é verificada (`PRAGMA integrity_check`) logo depois de criada.
//! - Restauro pelo programa: a cópia é verificada, a base actual é guardada e a troca faz-se ao
//!   reiniciar, antes de a base de dados ser aberta (`aplicar_restauro_pendente`).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MANTER_PADRAO: usize = 30;
const INTERVALO_PADRAO: i64 = 4;
/// As cópias de antes de cada actualização (`copias/kangest-antes-de-<versão>.db`). A rotação das cópias automáticas
/// nunca as apaga: guardam-se à parte as das últimas `MANTER_ANTES` actualizações (`podar_antes`).
pub const PREFIXO_ANTES: &str = "kangest-antes-de-";
const MANTER_ANTES: usize = 5;
const MAGIA_CIFRADA: &[u8] = b"KGCOPIA1";
/// As cópias automáticas que ficam sempre, mesmo com o disco cheio (a rotação por espaço não passa daqui).
const MINIMO_COPIAS: usize = 3;
/// O espaço que fica livre no disco depois de uma cópia: o sistema e a própria base precisam dele para trabalhar.
const FOLGA_DO_DISCO: u64 = 200 * 1024 * 1024;
/// Uma cópia provisória (`.a-fazer`) com mais do que isto ficou de um fecho inesperado a meio de uma cópia.
const PROVISORIA_ESQUECIDA: std::time::Duration = std::time::Duration::from_secs(3600);
const MARCA_RESTAURO: &str = "restaurar.json";

/// Cópia consistente da base (mesmo com a aplicação em uso) via `VACUUM INTO`.
pub async fn copiar(pool: &SqlitePool, destino: &Path) -> AppResult<()> {
    if destino.exists() {
        std::fs::remove_file(destino).map_err(|e| AppError::msg(format!("Não foi possível substituir {}: {e}", destino.display())))?;
    }
    sqlx::query("VACUUM INTO ?").bind(destino.to_string_lossy().to_string()).execute(pool).await?;
    Ok(())
}

#[derive(Deserialize, Default)]
pub struct BackupIn {
    /// «Guardar como…»: o caminho escolhido na janela nativa (só no computador que guarda a base). Sem ele, vai para
    /// a pasta de transferências.
    #[serde(default)]
    destino: Option<String>,
}

/// O caminho escolhido em «Guardar como…»: absoluto, numa pasta que existe, com a extensão `.db`. Só se aceita no
/// próprio computador que guarda a base: um pedido de um posto em rede não grava em caminhos do servidor.
fn destino_escolhido(caminho: &str) -> AppResult<PathBuf> {
    if crate::state::contexto().is_some() || crate::rede::config().cliente() {
        return Err(AppError::msg("«Guardar como» só existe no computador que guarda a base de dados (o servidor)."));
    }
    let mut f = PathBuf::from(caminho.trim());
    if !f.is_absolute() {
        return Err(AppError::msg("Escolha onde guardar a cópia."));
    }
    if f.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("db")) != Some(true) {
        f.set_extension("db");
    }
    match f.parent() {
        Some(p) if p.is_dir() => Ok(f),
        _ => Err(AppError::msg(format!("A pasta de {} não existe (pen desligada?).", f.display()))),
    }
}

pub async fn backup(st: &AppState, i: BackupIn) -> AppResult<Value> {
    st.exigir_perm("sistema.backup")?;
    let destino = match i.destino.as_deref().filter(|d| !d.trim().is_empty()) {
        Some(d) => destino_escolhido(d)?,
        None => st.pasta_de("copias").join(format!("kangest-copia-{}.db", chrono::Local::now().format("%Y%m%d-%H%M%S"))),
    };
    // portátil (em claro): é a que se leva para outro computador; a base em uso e as cópias locais vão cifradas
    crate::db::exportar_em_claro(&st.pool, &destino).await?;
    let bytes = std::fs::metadata(&destino).map(|m| m.len()).unwrap_or(0);
    Ok(json!({ "ficheiro": destino.display().to_string(), "bytes": bytes }))
}

fn pasta_copias(pasta_dados: &Path) -> PathBuf {
    pasta_dados.join("copias")
}

// ------------------------------------------------------------------ configuração

struct Cfg {
    intervalo_horas: i64,
    manter: usize,
    pasta_externa: String,
    cifrar_externa: bool,
}

async fn cfg_valor(pool: &SqlitePool, k: &str) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(k).fetch_optional(pool).await?)
}

async fn cfg_gravar(pool: &SqlitePool, k: &str, v: &str) -> AppResult<()> {
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(k).bind(v).execute(pool).await?;
    Ok(())
}

async fn ler_cfg(pool: &SqlitePool) -> AppResult<Cfg> {
    Ok(Cfg {
        intervalo_horas: cfg_valor(pool, "copias.intervalo_horas").await?.and_then(|v| v.parse().ok()).unwrap_or(INTERVALO_PADRAO).clamp(0, 168),
        manter: cfg_valor(pool, "copias.manter").await?.and_then(|v| v.parse().ok()).unwrap_or(MANTER_PADRAO).clamp(3, 365),
        pasta_externa: cfg_valor(pool, "copias.pasta_externa").await?.unwrap_or_default(),
        cifrar_externa: cfg_valor(pool, "copias.cifrar_externa").await?.as_deref() == Some("1"),
    })
}

// ------------------------------------------------------------------ cifra das cópias externas

fn chave_senha(senha: &str, sal: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 32];
    ring::pbkdf2::derive(ring::pbkdf2::PBKDF2_HMAC_SHA256, std::num::NonZeroU32::new(100_000).unwrap(), sal, senha.as_bytes(), &mut k);
    k
}

/// `KGCOPIA1` + sal (16) + nonce (12) + base de dados cifrada (AES-256-GCM).
fn cifrar_bytes(dados: &[u8], senha: &str) -> Vec<u8> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    use ring::rand::{SecureRandom, SystemRandom};
    let mut sal = [0u8; 16];
    let mut n = [0u8; 12];
    SystemRandom::new().fill(&mut sal).expect("aleatório");
    SystemRandom::new().fill(&mut n).expect("aleatório");
    let k = LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &chave_senha(senha, &sal)).expect("chave"));
    let mut c = dados.to_vec();
    k.seal_in_place_append_tag(Nonce::assume_unique_for_key(n), Aad::from(MAGIA_CIFRADA), &mut c).expect("cifrar");
    let mut out = Vec::with_capacity(c.len() + 36);
    out.extend_from_slice(MAGIA_CIFRADA);
    out.extend_from_slice(&sal);
    out.extend_from_slice(&n);
    out.extend_from_slice(&c);
    out
}

fn decifrar_bytes(dados: &[u8], senha: &str) -> AppResult<Vec<u8>> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    let m = MAGIA_CIFRADA.len();
    if dados.len() < m + 28 + 16 || &dados[..m] != MAGIA_CIFRADA {
        return Err(AppError::msg("O ficheiro não é uma cópia cifrada do KanGest."));
    }
    let (sal, resto) = dados[m..].split_at(16);
    let (n, c) = resto.split_at(12);
    let k = LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &chave_senha(senha, sal)).expect("chave"));
    let mut buf = c.to_vec();
    let nonce = Nonce::try_assume_unique_for_key(n).map_err(|_| AppError::msg("Cópia cifrada danificada."))?;
    let t = k
        .open_in_place(nonce, Aad::from(MAGIA_CIFRADA), &mut buf)
        .map_err(|_| AppError::msg("Senha errada (ou cópia danificada)."))?;
    Ok(t.to_vec())
}

fn e_cifrada(f: &Path) -> bool {
    std::fs::File::open(f)
        .and_then(|mut x| {
            use std::io::Read;
            let mut b = [0u8; 8];
            x.read_exact(&mut b).map(|_| b)
        })
        .map(|b| b == MAGIA_CIFRADA)
        .unwrap_or(false)
}

// ------------------------------------------------------------------ verificação

/// Abre a cópia só para leitura e confirma que é uma base do KanGest íntegra.
pub async fn verificar_ficheiro(f: &Path) -> AppResult<()> {
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{ConnectOptions, Connection};
    // as cópias locais vão cifradas com a chave deste computador; as exportadas e as externas, em claro
    let cifrada = !crate::db::em_claro(f);
    let mut o = SqliteConnectOptions::new().filename(f).read_only(true);
    if cifrada {
        o = crate::db::com_chave(o, &crate::segredos::chave_base()?);
    }
    let mut c = o.connect().await.map_err(|e| AppError::msg(format!("{} não é uma cópia de segurança do KanGest ({e}).", f.display())))?;
    let r: String = sqlx::query_scalar("PRAGMA integrity_check").fetch_one(&mut c).await.map_err(|e| {
        if cifrada {
            AppError::msg(format!(
                "{} não é uma cópia de segurança do KanGest, ou está cifrada com a chave de outro computador. Para passar \
                 a loja para outro computador, use uma cópia externa (pen, OneDrive) ou a cópia exportada em \
                 Configurações → Sistema.",
                f.display()
            ))
        } else {
            AppError::msg(format!("{} não é uma cópia de segurança do KanGest ({e}).", f.display()))
        }
    })?;
    let tabelas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('documentos', 'config', 'empresa', '_sqlx_migrations')")
        .fetch_one(&mut c)
        .await?;
    let estranhas = if tabelas == 4 { Some(crate::db::migracoes_estranhas(&mut c).await) } else { None };
    c.close().await.ok();
    if r != "ok" {
        return Err(AppError::msg(format!("A cópia está danificada ({r}).")));
    }
    if tabelas < 4 {
        return Err(AppError::msg("O ficheiro não é uma cópia de segurança do KanGest."));
    }
    // com migrações que esta versão não conhece (pela versão e pelo checksum), a base não voltaria a abrir depois do
    // restauro e o programa não arrancava
    let estranhas = estranhas.transpose()?.unwrap_or_default();
    if !estranhas.is_empty() {
        return Err(AppError::msg(format!(
            "A cópia é de uma versão mais recente do KanGest, ou de outro ramo dele (por exemplo, um KanGest oficial mais \
             recente do que esta edição): tem migrações que esta versão não conhece ({}; esta vai até à {:04}). Depois do \
             restauro, a base não voltaria a abrir. Actualize este KanGest antes de a restaurar.",
            estranhas.join(", "),
            crate::db::ultima_migracao()
        )));
    }
    Ok(())
}

// ------------------------------------------------------------------ cópias automáticas

fn listar_db(dir: &Path, prefixo: &str) -> Vec<(std::time::SystemTime, PathBuf)> {
    let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.starts_with(prefixo) && (n.ends_with(".db") || n.ends_with(".kgc"))
                })
                .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path()))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

/// Uma cópia de antes de uma actualização (não entra na rotação das cópias automáticas).
fn de_antes(f: &Path) -> bool {
    f.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(PREFIXO_ANTES))
}

/// Apaga as cópias mais antigas com o `prefixo` até ficarem `manter`. As de antes das actualizações ficam sempre
/// (têm a sua conta em `podar_antes`): são as que se oferecem se a verificação depois da actualização falhar.
fn podar(dir: &Path, prefixo: &str, manter: usize) {
    let mut v: Vec<_> = listar_db(dir, prefixo).into_iter().filter(|(_, f)| !de_antes(f)).collect();
    while v.len() > manter {
        let f = v.remove(0).1;
        let _ = std::fs::remove_file(&f);
        let _ = std::fs::remove_file(f.with_extension("verificada"));
    }
}

/// Das cópias de antes das actualizações, ficam as das últimas `MANTER_ANTES` (cada uma é uma base inteira).
pub fn podar_antes(dir: &Path) {
    let mut v = listar_db(dir, PREFIXO_ANTES);
    while v.len() > MANTER_ANTES {
        let f = v.remove(0).1;
        let _ = std::fs::remove_file(&f);
        let _ = std::fs::remove_file(f.with_extension("verificada"));
    }
}

/// O ficheiro da cópia de antes de instalar a versão `versao`: `copias/kangest-antes-de-<versão>.db`.
pub fn copia_antes_de(pasta_dados: &Path, versao: &str) -> PathBuf {
    let v: String = versao.trim().trim_start_matches('v').chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+')).collect();
    pasta_copias(pasta_dados).join(format!("{PREFIXO_ANTES}{v}.db"))
}

/// Uma cópia verificada, como as automáticas: sai para um ficheiro ao lado, é conferida (`verificar_ficheiro`) e só
/// depois toma o lugar de `destino`, com a marca `.verificada`. Uma cópia que falhe não estraga a que lá estava.
pub async fn copia_verificada(pool: &SqlitePool, destino: &Path) -> AppResult<()> {
    if let Some(dir) = destino.parent() {
        std::fs::create_dir_all(dir).map_err(|e| AppError::msg(format!("Não foi possível criar {}: {e}", dir.display())))?;
    }
    let provisoria = destino.with_extension("a-fazer");
    copiar(pool, &provisoria).await?;
    if let Err(e) = verificar_ficheiro(&provisoria).await {
        let _ = std::fs::remove_file(&provisoria);
        return Err(e);
    }
    std::fs::rename(&provisoria, destino).map_err(|e| AppError::msg(format!("Não foi possível gravar {}: {e}", destino.display())))?;
    std::fs::write(destino.with_extension("verificada"), crate::db::agora()).ok();
    Ok(())
}

/// O espaço que uma cópia da base precisa: o tamanho dela (com o WAL), mais um décimo e a folga do disco.
fn espaco_para_copia(tamanho_base: u64) -> u64 {
    tamanho_base.saturating_add(tamanho_base / 10).saturating_add(FOLGA_DO_DISCO)
}

/// Quantas das cópias mais antigas (os tamanhos, da mais antiga para a mais recente) é preciso apagar para haver
/// `precisa` livres, deixando pelo menos `ficam`. `None`: nem apagando todas as que se podem apagar chega.
fn quantas_apagar(livre: u64, precisa: u64, antigas: &[u64], ficam: usize) -> Option<usize> {
    let podem = antigas.len().saturating_sub(ficam);
    let mut l = livre;
    for k in 0..=podem {
        if l >= precisa {
            return Some(k);
        }
        if let Some(t) = antigas.get(k).filter(|_| k < podem) {
            l = l.saturating_add(*t);
        }
    }
    None
}

/// Antes de uma cópia na pasta `dir`: há espaço para ela? Sem espaço, saem primeiro as cópias automáticas mais antigas,
/// e ficam sempre as `MINIMO_COPIAS` mais recentes e as de antes das actualizações. Sem espaço mesmo assim, a cópia não
/// se faz, com uma mensagem clara e um aviso do sistema (e nada se apaga, porque não chegaria).
fn garantir_espaco(pasta_dados: &Path, dir: &Path) -> AppResult<()> {
    use crate::recursos::tamanho_legivel;
    let base = pasta_dados.join("kigest.db");
    let tamanho: u64 = [base.clone(), base.with_extension("db-wal")].iter().filter_map(|f| std::fs::metadata(f).ok()).map(|m| m.len()).sum();
    let precisa = espaco_para_copia(tamanho);
    // o sistema não disse o espaço: tenta-se (se falhar, a cópia não fica partida: copia_verificada)
    let Some(livre) = crate::recursos::espaco_livre(dir) else { return Ok(()) };
    let antigas: Vec<(u64, PathBuf)> = listar_db(dir, "kangest-")
        .into_iter()
        .filter(|(_, f)| !de_antes(f))
        .map(|(_, f)| (std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0), f))
        .collect();
    let tamanhos: Vec<u64> = antigas.iter().map(|x| x.0).collect();
    match quantas_apagar(livre, precisa, &tamanhos, MINIMO_COPIAS) {
        Some(0) => Ok(()),
        Some(k) => {
            for (_, f) in &antigas[..k] {
                let _ = std::fs::remove_file(f);
                let _ = std::fs::remove_file(f.with_extension("verificada"));
            }
            eprintln!("Disco quase cheio: saíram as {k} cópias automáticas mais antigas para a nova caber.");
            Ok(())
        }
        None => {
            let msg = format!(
                "Não há espaço no disco para a cópia de segurança: a base tem {}, no disco há {} livres e são precisos {}. \
                 Liberte espaço (por exemplo, esvazie o lixo ou apague transferências antigas).",
                tamanho_legivel(tamanho),
                tamanho_legivel(livre),
                tamanho_legivel(precisa)
            );
            crate::nativo::notificar("disco-cheio", "Disco quase cheio", &msg);
            Err(AppError::msg(msg))
        }
    }
}

/// As cópias provisórias (`.a-fazer`) que ficaram de um fecho inesperado a meio de uma cópia: ocupavam o disco para
/// sempre. Só as com mais de uma hora (uma cópia pode estar a decorrer agora).
fn limpar_provisorias(dir: &Path) {
    let Ok(it) = std::fs::read_dir(dir) else { return };
    for e in it.filter_map(|e| e.ok()) {
        let antiga = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|d| d > PROVISORIA_ESQUECIDA);
        if antiga && e.file_name().to_string_lossy().ends_with(".a-fazer") {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Uma cópia verificada para `destino` (`copia_verificada`), depois de conferir o espaço no disco (`garantir_espaco`).
/// Usam-na as cópias automáticas, a de antes de cada actualização e a de antes das migrações (db.rs).
pub async fn copia_com_espaco(pool: &SqlitePool, pasta_dados: &Path, destino: &Path) -> AppResult<()> {
    let dir = destino.parent().unwrap_or(pasta_dados);
    std::fs::create_dir_all(dir).map_err(|e| AppError::msg(format!("Não foi possível criar {}: {e}", dir.display())))?;
    limpar_provisorias(dir);
    garantir_espaco(pasta_dados, dir)?;
    copia_verificada(pool, destino).await?;
    if de_antes(destino) {
        podar_antes(dir);
    }
    Ok(())
}

/// Faz uma cópia agora: local, verificada e (se configurada) na pasta externa. Devolve o resumo.
pub async fn fazer_copia(pool: &SqlitePool, pasta_dados: &Path, motivo: &str) -> AppResult<Value> {
    let c = ler_cfg(pool).await?;
    let dir = pasta_copias(pasta_dados);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::msg(e.to_string()))?;
    let carimbo = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let destino = dir.join(format!("kangest-{carimbo}.db"));
    // o espaço primeiro; a cópia sai para um ficheiro ao lado e só ganha o nome dela depois de verificada (antes, uma
    // cópia que falhasse a meio, com o disco cheio, ficava como a mais recente e a rotação apagava uma boa)
    copia_com_espaco(pool, pasta_dados, &destino).await?;
    podar(&dir, "kangest-", c.manter);
    cfg_gravar(pool, "copias.ultima", &crate::db::agora()).await?;
    // pasta externa (a pen pode não estar ligada: fica registado o erro, a cópia local já está feita)
    let mut externa = Value::Null;
    if !c.pasta_externa.trim().is_empty() {
        let r = copiar_para_externa(pool, &destino, &c, &carimbo).await;
        match r {
            Ok(f) => {
                cfg_gravar(pool, "copias.ultima_externa", &crate::db::agora()).await?;
                cfg_gravar(pool, "copias.erro_externa", "").await?;
                externa = json!(f);
            }
            Err(e) => {
                cfg_gravar(pool, "copias.erro_externa", &format!("{} — {e}", crate::db::agora())).await?;
                crate::nativo::notificar(
                    "copia-externa",
                    "Cópia externa não gravada",
                    &format!("A cópia ficou neste computador, mas não na pasta externa: {e}. Veja em Configurações → Sistema."),
                );
            }
        }
    }
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (NULL, 'COPIA_SEGURANCA', ?)")
        .bind(format!("{motivo}: {}", destino.file_name().unwrap_or_default().to_string_lossy()))
        .execute(pool)
        .await?;
    Ok(json!({ "ficheiro": destino.display().to_string(), "externa": externa }))
}

/// A cópia externa (pen, OneDrive) é a que salva a loja quando o computador avaria: tem de abrir noutro computador,
/// por isso vai em claro (exportada da base, porque a cópia local está cifrada com a chave deste), e cifrada com a
/// senha das cópias quando está definida.
async fn copiar_para_externa(pool: &SqlitePool, local: &Path, c: &Cfg, carimbo: &str) -> AppResult<String> {
    let dir = PathBuf::from(c.pasta_externa.trim());
    if !dir.is_dir() {
        return Err(AppError::msg(format!("a pasta externa {} não está acessível (pen desligada?)", dir.display())));
    }
    let nif: String = sqlx::query_scalar("SELECT nif FROM empresa WHERE id = 1").fetch_optional(pool).await?.unwrap_or_default();
    let prefixo = format!("kangest-{}-", nif.trim());
    let portatil = local.with_extension("portatil.db");
    crate::db::exportar_em_claro(pool, &portatil).await?;
    let lido = std::fs::read(&portatil).map_err(|e| AppError::msg(e.to_string()));
    let _ = std::fs::remove_file(&portatil);
    let dados = lido?;
    let (nome, conteudo) = if c.cifrar_externa {
        let senha = crate::segredos::ler(pool, "copias.senha").await?.filter(|s| !s.is_empty()).ok_or_else(|| AppError::msg("falta a senha das cópias cifradas"))?;
        (format!("{prefixo}{carimbo}.kgc"), cifrar_bytes(&dados, &senha))
    } else {
        (format!("{prefixo}{carimbo}.db"), dados)
    };
    let destino = dir.join(&nome);
    std::fs::write(&destino, conteudo).map_err(|e| AppError::msg(format!("não foi possível gravar em {}: {e}", dir.display())))?;
    podar(&dir, &prefixo, c.manter);
    Ok(destino.display().to_string())
}

/// Ao abrir o programa: uma cópia se a última tem mais do que o intervalo (ou é de outro dia).
pub async fn backup_automatico(pool: &SqlitePool, pasta_dados: &Path) -> AppResult<Option<Value>> {
    if precisa_copia(pool, pasta_dados, true).await? {
        return Ok(Some(fazer_copia(pool, pasta_dados, "Cópia automática ao abrir").await?));
    }
    Ok(None)
}

async fn precisa_copia(pool: &SqlitePool, pasta_dados: &Path, ao_abrir: bool) -> AppResult<bool> {
    let c = ler_cfg(pool).await?;
    let ultima = listar_db(&pasta_copias(pasta_dados), "kangest-").last().map(|x| x.0);
    let Some(ultima) = ultima else { return Ok(true) };
    let idade = std::time::SystemTime::now().duration_since(ultima).unwrap_or_default();
    let dia = |t: std::time::SystemTime| chrono::DateTime::<chrono::Local>::from(t).date_naive();
    if ao_abrir && dia(ultima) != chrono::Local::now().date_naive() {
        return Ok(true);
    }
    Ok(c.intervalo_horas > 0 && idade >= std::time::Duration::from_secs(c.intervalo_horas as u64 * 3600))
}

/// Cópias periódicas enquanto o programa está aberto (só na máquina que guarda a base de dados).
pub fn iniciar_agendamento(st: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(10 * 60)).await;
            if crate::rede::config().cliente() {
                continue;
            }
            match precisa_copia(&st.pool, &st.pasta_dados, false).await {
                Ok(true) => {
                    if let Err(e) = fazer_copia(&st.pool, &st.pasta_dados, "Cópia automática periódica").await {
                        eprintln!("Cópia de segurança periódica falhou: {e}");
                        crate::nativo::notificar("copia", "Cópia de segurança falhou", &format!("{e}. Veja em Configurações → Sistema."));
                    }
                }
                Ok(false) => {}
                Err(e) => eprintln!("Cópia de segurança periódica: {e}"),
            }
        }
    });
}

/// Cópia num momento importante (ex.: fecho de caixa). Não impede a operação se falhar.
pub async fn copia_evento(st: &AppState, motivo: &str) {
    if crate::rede::config().cliente() {
        return;
    }
    if let Err(e) = fazer_copia(&st.pool, &st.pasta_dados, motivo).await {
        eprintln!("Cópia de segurança ({motivo}) falhou: {e}");
        crate::nativo::notificar("copia", "Cópia de segurança falhou", &format!("{motivo}: {e}. Veja em Configurações → Sistema."));
    }
}

// ------------------------------------------------------------------ RPC

pub async fn copias(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.backup")?;
    let dir = pasta_copias(&st.pasta_dados);
    let c = ler_cfg(&st.pool).await?;
    let item = |(t, f): &(std::time::SystemTime, PathBuf)| {
        json!({
            "ficheiro": f.display().to_string(),
            "nome": f.file_name().unwrap_or_default().to_string_lossy(),
            "bytes": std::fs::metadata(f).map(|m| m.len()).unwrap_or(0),
            "data": chrono::DateTime::<chrono::Local>::from(*t).format("%Y-%m-%dT%H:%M:%S").to_string(),
            "verificada": f.with_extension("verificada").exists(),
            "cifrada": f.extension().is_some_and(|e| e == "kgc"),
        })
    };
    let mut locais: Vec<Value> = listar_db(&dir, "kangest").iter().map(item).collect();
    locais.reverse();
    let externa_dir = PathBuf::from(c.pasta_externa.trim());
    let mut externas: Vec<Value> = if !c.pasta_externa.trim().is_empty() && externa_dir.is_dir() {
        listar_db(&externa_dir, "kangest-").iter().map(item).collect()
    } else {
        Vec::new()
    };
    externas.reverse();
    Ok(json!({
        "pasta": dir.display().to_string(),
        "copias": locais,
        "externas": externas,
        "config": {
            "intervalo_horas": c.intervalo_horas, "manter": c.manter, "pasta_externa": c.pasta_externa,
            "cifrar_externa": c.cifrar_externa,
            "tem_senha": crate::segredos::ler(&st.pool, "copias.senha").await.ok().flatten().is_some_and(|s| !s.is_empty()),
        },
        "estado": {
            "ultima": cfg_valor(&st.pool, "copias.ultima").await?,
            "ultima_externa": cfg_valor(&st.pool, "copias.ultima_externa").await?,
            "erro_externa": cfg_valor(&st.pool, "copias.erro_externa").await?.filter(|e| !e.is_empty()),
            "pasta_externa_acessivel": !c.pasta_externa.trim().is_empty() && externa_dir.is_dir(),
        },
        "posto_cliente": crate::rede::config().cliente(),
    }))
}

#[derive(Deserialize)]
pub struct CopiasCfgIn {
    intervalo_horas: i64,
    manter: usize,
    #[serde(default)]
    pasta_externa: String,
    #[serde(default)]
    cifrar_externa: bool,
    /// `None` mantém a senha guardada.
    #[serde(default)]
    senha: Option<String>,
}

pub async fn copias_guardar(st: &AppState, g: CopiasCfgIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.backup")?;
    let pasta = g.pasta_externa.trim().to_string();
    if !pasta.is_empty() {
        let d = PathBuf::from(&pasta);
        if !d.is_dir() {
            return Err(AppError::msg(format!("A pasta {pasta} não existe ou não está acessível.")));
        }
        // confirma que se consegue escrever lá
        let teste = d.join(".kangest-teste");
        std::fs::write(&teste, b"ok").map_err(|e| AppError::msg(format!("Não é possível gravar em {pasta}: {e}")))?;
        let _ = std::fs::remove_file(teste);
    }
    if let Some(senha) = g.senha.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        if senha.chars().count() < 8 {
            return Err(AppError::msg("A senha das cópias cifradas tem de ter pelo menos 8 caracteres."));
        }
        crate::segredos::gravar(&st.pool, "copias.senha", senha).await?;
    }
    if g.cifrar_externa && crate::segredos::ler(&st.pool, "copias.senha").await?.is_none_or(|x| x.is_empty()) {
        return Err(AppError::msg("Indique a senha das cópias cifradas. Guarde-a num sítio seguro: sem ela a cópia não se restaura."));
    }
    cfg_gravar(&st.pool, "copias.intervalo_horas", &g.intervalo_horas.clamp(0, 168).to_string()).await?;
    cfg_gravar(&st.pool, "copias.manter", &g.manter.clamp(3, 365).to_string()).await?;
    cfg_gravar(&st.pool, "copias.pasta_externa", &pasta).await?;
    cfg_gravar(&st.pool, "copias.cifrar_externa", if g.cifrar_externa { "1" } else { "0" }).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'COPIAS_CONFIG', ?)")
        .bind(s.id)
        .bind(format!("De {} em {} h, manter {}, externa: {}", g.intervalo_horas, g.intervalo_horas, g.manter, if pasta.is_empty() { "não" } else { &pasta }))
        .execute(&st.pool)
        .await?;
    copias(st).await
}

pub async fn copia_agora(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.backup")?;
    if crate::rede::config().cliente() {
        return Err(AppError::msg("Neste posto os dados estão no servidor: as cópias fazem-se no servidor."));
    }
    fazer_copia(&st.pool, &st.pasta_dados, "Cópia manual").await
}

#[derive(Deserialize)]
pub struct RestaurarIn {
    ficheiro: String,
    #[serde(default)]
    senha: Option<String>,
}

/// Prepara o restauro de uma cópia: confere-a, guarda a base actual e marca a troca para o
/// próximo arranque (a base em uso não pode ser substituída com o programa aberto).
async fn preparar_restauro(st: &AppState, r: &RestaurarIn, guardar_atual: bool) -> AppResult<Value> {
    if crate::state::contexto().is_some() || crate::rede::config().cliente() {
        return Err(AppError::msg("O restauro faz-se na máquina que guarda a base de dados (o servidor), não num posto em rede."));
    }
    let origem = PathBuf::from(r.ficheiro.trim());
    if !origem.is_file() {
        return Err(AppError::msg(format!("Não encontro o ficheiro {}.", origem.display())));
    }
    let pronto = ficheiro_pendente(&st.pasta_dados)?;
    if e_cifrada(&origem) {
        let senha = match r.senha.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
            Some(x) => x.to_string(),
            None => crate::segredos::ler(&st.pool, "copias.senha").await.ok().flatten().filter(|x| !x.is_empty()).ok_or_else(|| AppError::msg("Esta cópia está cifrada: indique a senha."))?,
        };
        let dados = std::fs::read(&origem).map_err(|e| AppError::msg(e.to_string()))?;
        std::fs::write(&pronto, decifrar_bytes(&dados, &senha)?).map_err(|e| AppError::msg(e.to_string()))?;
    } else {
        std::fs::copy(&origem, &pronto).map_err(|e| AppError::msg(format!("Não foi possível copiar {}: {e}", origem.display())))?;
    }
    if let Err(e) = verificar_ficheiro(&pronto).await {
        let _ = std::fs::remove_file(&pronto);
        return Err(e);
    }
    let seguranca = marcar_restauro(st, &pronto, &origem.display().to_string(), guardar_atual.then_some("kangest-antes-do-restauro"), None).await?;
    Ok(json!({ "reiniciar": true, "copia_da_base_atual": seguranca }))
}

/// O ficheiro que a troca do arranque seguinte põe no lugar da base (`copias/restauro-pendente.db`).
pub(crate) fn ficheiro_pendente(pasta_dados: &Path) -> AppResult<PathBuf> {
    let dir = pasta_copias(pasta_dados);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::msg(e.to_string()))?;
    Ok(dir.join("restauro-pendente.db"))
}

/// Marca a troca da base por `pronto` (já conferido com `verificar_ficheiro`) no próximo arranque. Com
/// `guardar_atual`, guarda antes a base actual em `copias/<nome>-AAAAMMDD-HHMMSS.db` e devolve onde. `posto`: o n.º
/// do posto desta máquina depois da troca (o do KanGest oficial, services/oficial.rs), gravado no posto.json só
/// quando a troca se faz.
pub(crate) async fn marcar_restauro(st: &AppState, pronto: &Path, origem: &str, guardar_atual: Option<&str>, posto: Option<i64>) -> AppResult<Option<String>> {
    let seguranca = match guardar_atual {
        Some(nome) => {
            let f = pasta_copias(&st.pasta_dados).join(format!("{nome}-{}.db", chrono::Local::now().format("%Y%m%d-%H%M%S")));
            copiar(&st.pool, &f).await?;
            Some(f.display().to_string())
        }
        None => None,
    };
    let mut marca = json!({ "ficheiro": pronto.display().to_string(), "origem": origem, "pedido_em": crate::db::agora() });
    if let Some(p) = posto {
        marca["posto_id"] = json!(p);
    }
    std::fs::write(st.pasta_dados.join(MARCA_RESTAURO), marca.to_string()).map_err(|e| AppError::msg(e.to_string()))?;
    Ok(seguranca)
}

pub async fn restaurar(st: &AppState, r: RestaurarIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.backup")?;
    if !s.tem("sistema.configuracoes") {
        return Err(AppError::SemPermissao);
    }
    let v = preparar_restauro(st, &r, true).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'RESTAURO_PEDIDO', ?)")
        .bind(s.id)
        .bind(format!("Restauro de {} ao reiniciar", r.ficheiro.trim()))
        .execute(&st.pool)
        .await?;
    Ok(v)
}

/// Primeiro arranque num computador novo: restaurar uma cópia em vez de configurar do zero.
pub async fn restaurar_inicial(st: &AppState, r: RestaurarIn) -> AppResult<Value> {
    let empresa: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM empresa").fetch_one(&st.pool).await?;
    if empresa > 0 {
        return Err(AppError::msg("Este KanGest já está configurado: restaure em Configurações → Sistema."));
    }
    preparar_restauro(st, &r, false).await
}

/// Ao arrancar, antes de abrir a base: aplica um restauro marcado. Devolve a origem restaurada.
pub fn aplicar_restauro_pendente(pasta_dados: &Path) -> AppResult<Option<String>> {
    let marca = pasta_dados.join(MARCA_RESTAURO);
    let Ok(texto) = std::fs::read_to_string(&marca) else { return Ok(None) };
    let v: Value = serde_json::from_str(&texto).unwrap_or(Value::Null);
    let _ = std::fs::remove_file(&marca);
    let Some(pronto) = v["ficheiro"].as_str().map(PathBuf::from).filter(|p| p.is_file()) else { return Ok(None) };
    let base = pasta_dados.join("kigest.db");
    // o WAL e o índice da base antiga não podem ser aplicados à cópia restaurada
    for ext in ["db-wal", "db-shm"] {
        let _ = std::fs::remove_file(base.with_extension(ext));
    }
    // troca o ficheiro (rename) em vez de escrever por cima: uma ligação à base antiga que ainda esteja a
    // fechar escreve no ficheiro antigo, nunca na cópia restaurada
    let novo = base.with_extension("db-restaurar");
    std::fs::copy(&pronto, &novo).map_err(|e| AppError::msg(format!("Não foi possível restaurar a cópia: {e}")))?;
    std::fs::rename(&novo, &base).map_err(|e| AppError::msg(format!("Não foi possível restaurar a cópia: {e}")))?;
    let _ = std::fs::remove_file(&pronto);
    // o posto que vinha com os dados (o do KanGest oficial): só depois de a base ter sido trocada
    if let Some(posto) = v["posto_id"].as_i64() {
        if let Err(e) = std::fs::write(pasta_dados.join("posto.json"), json!({ "posto_id": posto }).to_string()) {
            eprintln!("Não foi possível gravar o posto {posto} desta máquina: {e}");
        }
    }
    Ok(v["origem"].as_str().map(String::from))
}

#[derive(serde::Deserialize)]
pub struct ExportarIn {
    nome: String,
    conteudo: String,
    /// A subpasta (AppState::pasta_de): por omissão, «Relatórios e listas».
    #[serde(default)]
    pasta: Option<String>,
}

// ---------------------------------------------------------------- a pasta dos documentos deste computador
//
// Tudo o que o KanGest grava para o utilizador (listas e relatórios em CSV e Excel, SAF-T, cópias portáteis) vai para
// uma pasta visível e organizada: por omissão «Documentos/KanGest Livraria», criada sozinha, com uma subpasta por tipo.
// Pode escolher-se outra à mão em Sobre o KanGest (fica em pastas.json, na pasta de dados deste computador).

/// O nome da pasta, dentro dos Documentos do utilizador.
pub const NOME_PASTA: &str = "KanGest Livraria";

/// A pasta de omissão: «Documentos/KanGest Livraria», criada aqui; sem Documentos, as Transferências; sem nada, a pasta
/// de dados.
pub fn pasta_de_omissao(documentos: Option<std::path::PathBuf>, transferencias: Option<std::path::PathBuf>, dados: &std::path::Path) -> std::path::PathBuf {
    if let Some(d) = documentos {
        let p = d.join(NOME_PASTA);
        if std::fs::create_dir_all(&p).is_ok() {
            return p;
        }
    }
    transferencias.unwrap_or_else(|| dados.to_path_buf())
}

fn ficheiro_pastas(dados: &std::path::Path) -> std::path::PathBuf {
    dados.join("pastas.json")
}

/// A pasta escolhida à mão (se ainda existir).
pub fn pasta_escolhida(dados: &std::path::Path) -> Option<std::path::PathBuf> {
    let v: Value = serde_json::from_str(&std::fs::read_to_string(ficheiro_pastas(dados)).ok()?).ok()?;
    let p = std::path::PathBuf::from(v["documentos"].as_str()?);
    p.is_dir().then_some(p)
}

#[derive(Deserialize)]
pub struct PastaIn {
    /// A pasta nova; vazio ou ausente volta à de omissão.
    #[serde(default)]
    caminho: Option<String>,
}

/// Muda a pasta dos documentos deste computador (ou volta à de omissão). Corre no próprio computador, como as
/// exportações («sistema.exportar…» é local numa rede de postos).
pub async fn exportar_pasta(st: &AppState, i: PastaIn) -> AppResult<Value> {
    st.sessao()?;
    let nova = match i.caminho.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => {
            let p = std::path::PathBuf::from(c);
            if !p.is_dir() {
                return Err(AppError::msg(format!("A pasta {} não existe.", p.display())));
            }
            Some(p)
        }
        None => None,
    };
    let v = json!({ "documentos": nova.as_ref().map(|p| p.display().to_string()) });
    std::fs::write(ficheiro_pastas(&st.pasta_dados), serde_json::to_string_pretty(&v)?)
        .map_err(|e| AppError::msg(format!("Não foi possível guardar a pasta escolhida: {e}")))?;
    *st.pasta_escolhida.write().unwrap() = nova;
    Ok(json!({ "pasta": st.pasta_raiz().display().to_string(), "escolhida": st.pasta_escolhida.read().unwrap().is_some() }))
}

#[derive(Deserialize, Default)]
pub struct AbrirIn {
    /// Uma subpasta (AppState::pasta_de) ou um ficheiro acabado de gravar (abre a pasta dele).
    #[serde(default)]
    pasta: Option<String>,
    #[serde(default)]
    ficheiro: Option<String>,
}

/// Abre a pasta dos documentos (ou uma subpasta, ou a de um ficheiro exportado) no Explorador / Finder.
pub async fn exportar_abrir(st: &AppState, i: AbrirIn) -> AppResult<Value> {
    st.sessao()?;
    let raiz = st.pasta_raiz();
    let alvo = match (i.ficheiro.as_deref(), i.pasta.as_deref()) {
        // só ficheiros dentro da pasta dos documentos
        (Some(f), _) => std::path::Path::new(f).parent().filter(|p| p.starts_with(&raiz)).map(|p| p.to_path_buf()).unwrap_or_else(|| raiz.clone()),
        (None, Some(t)) => st.pasta_de(t),
        (None, None) => raiz.clone(),
    };
    let programa = if cfg!(windows) {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(programa).arg(&alvo).spawn().map_err(|e| AppError::msg(format!("Não foi possível abrir {}: {e}", alvo.display())))?;
    Ok(json!({ "pasta": alvo.display().to_string() }))
}

/// Grava um ficheiro de texto (CSV, mapas) na pasta de exportação e devolve o caminho.
/// O nome é limpo de separadores para não sair da pasta.
pub async fn exportar(st: &AppState, e: ExportarIn) -> AppResult<Value> {
    st.sessao()?;
    let nome: String = e
        .nome
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') { c } else { '_' })
        .collect::<String>()
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .to_string();
    if nome.is_empty() || !nome.contains('.') {
        return Err(AppError::msg("Nome de ficheiro inválido."));
    }
    let caminho = st.pasta_de(e.pasta.as_deref().unwrap_or("relatorios")).join(&nome);
    // BOM UTF-8: o Excel abre os acentos correctamente
    let mut bytes = Vec::with_capacity(e.conteudo.len() + 3);
    if nome.to_lowercase().ends_with(".csv") {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(e.conteudo.as_bytes());
    std::fs::write(&caminho, bytes).map_err(|err| AppError::msg(format!("Não foi possível gravar {}: {err}", caminho.display())))?;
    Ok(json!({ "ficheiro": caminho.display().to_string() }))
}

/// Ecrã «Sobre»: versão, pasta de dados, tamanho da base e contagens principais.
pub async fn info(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let base = st.pasta_dados.join("kigest.db");
    let bytes = std::fs::metadata(&base).map(|m| m.len()).unwrap_or(0);
    let conta = |sql: &'static str| async move { sqlx::query_scalar::<_, i64>(sql).fetch_one(&st.pool).await };
    let sqlite: String = sqlx::query_scalar("SELECT sqlite_version()").fetch_one(&st.pool).await?;
    let migracoes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations").fetch_one(&st.pool).await.unwrap_or(0);
    let ultima_copia = listar_db(&pasta_copias(&st.pasta_dados), "kangest-").last().map(|x| x.1.file_name().unwrap_or_default().to_string_lossy().to_string());
    Ok(json!({
        "versao": env!("CARGO_PKG_VERSION"),
        "plataforma": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "sqlite": sqlite,
        "migracoes": migracoes,
        "pasta_dados": st.pasta_dados.display().to_string(),
        "pasta_exportacao": st.pasta_raiz().display().to_string(),
        "pasta_omissao": st.pasta_exportacao.display().to_string(),
        "pasta_escolhida": st.pasta_escolhida.read().unwrap().is_some(),
        "base_bytes": bytes,
        // o que o KanGest encontrou neste computador e como configurou a base (recursos.rs)
        "computador": crate::recursos::resumo(&st.pasta_dados),
        "ultima_copia": ultima_copia,
        "artigos": conta("SELECT COUNT(*) FROM artigos").await?,
        "entidades": conta("SELECT COUNT(*) FROM entidades").await?,
        "documentos": conta("SELECT COUNT(*) FROM documentos").await?,
        "importados": conta("SELECT COUNT(*) FROM documentos WHERE importado = 1").await?,
        "utilizadores": conta("SELECT COUNT(*) FROM utilizadores").await?,
    }))
}

#[cfg(test)]
mod testes {
    /// Com o disco cheio, saem só as cópias automáticas mais antigas que forem precisas, e ficam sempre as 3 mais
    /// recentes. Se nem assim chegar, não sai nenhuma (e a cópia não se faz, com a mensagem).
    #[test]
    fn com_o_disco_cheio_saem_so_as_copias_precisas() {
        use super::{espaco_para_copia, quantas_apagar};
        let cinco = [100, 100, 100, 100, 100];
        assert_eq!(quantas_apagar(500, 400, &cinco, 3), Some(0), "há espaço: não sai nenhuma");
        assert_eq!(quantas_apagar(250, 400, &cinco, 3), Some(2), "faltam 150: saem as duas mais antigas");
        assert_eq!(quantas_apagar(100, 400, &cinco, 3), None, "só 2 podem sair e não chega: nenhuma");
        assert_eq!(quantas_apagar(0, 1, &[100, 100], 3), None, "com 3 ou menos, nenhuma sai");
        assert_eq!(quantas_apagar(10, 1, &[], 3), Some(0));
        // uma base de 1000 MB precisa de 1100 MB e da folga de 200 MB
        let mb = 1024 * 1024;
        assert_eq!(espaco_para_copia(1000 * mb), 1300 * mb);
    }

    /// A rotação das cópias automáticas nunca apaga as de antes das actualizações, mesmo sendo as mais antigas; essas
    /// têm a sua própria conta (as das últimas 5 actualizações).
    #[test]
    fn podar_nao_apaga_as_copias_de_antes_das_actualizacoes() {
        use std::time::{Duration, SystemTime};
        let d = std::env::temp_dir().join(format!("kangest-podar-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let criar = |nome: &str, dias: u64| {
            let f = d.join(nome);
            std::fs::write(&f, b"copia").unwrap();
            std::fs::write(f.with_extension("verificada"), b"ok").unwrap();
            let quando = SystemTime::now() - Duration::from_secs(dias * 24 * 3600);
            std::fs::File::options().write(true).open(&f).unwrap().set_modified(quando).unwrap();
        };
        // a de antes da actualização é a mais antiga de todas: sem a protecção, era a primeira a sair
        criar("kangest-antes-de-1.4.5.db", 40);
        for i in 0..6 {
            criar(&format!("kangest-2026110{i}-120000.db"), 10 - i);
        }
        super::podar(&d, "kangest-", 3);
        let ficam: Vec<String> = super::listar_db(&d, "kangest-").iter().map(|(_, f)| f.file_name().unwrap().to_string_lossy().to_string()).collect();
        assert!(ficam.contains(&"kangest-antes-de-1.4.5.db".to_string()), "{ficam:?}");
        assert!(d.join("kangest-antes-de-1.4.5.verificada").exists());
        assert_eq!(ficam.len(), 4, "3 automáticas e a de antes da actualização: {ficam:?}");
        assert!(!ficam.contains(&"kangest-20261100-120000.db".to_string()), "as automáticas mais antigas saem: {ficam:?}");
        // a conta à parte: ficam as das últimas 5 actualizações
        for (i, v) in ["1.4.6", "1.4.7", "1.4.8", "1.4.9", "1.5.0"].iter().enumerate() {
            criar(&format!("kangest-antes-de-{v}.db"), 30 - i as u64);
        }
        super::podar_antes(&d);
        let antes: Vec<String> = super::listar_db(&d, super::PREFIXO_ANTES).iter().map(|(_, f)| f.file_name().unwrap().to_string_lossy().to_string()).collect();
        assert_eq!(antes.len(), 5, "{antes:?}");
        assert!(!antes.contains(&"kangest-antes-de-1.4.5.db".to_string()), "a mais antiga sai: {antes:?}");
        assert!(!d.join("kangest-antes-de-1.4.5.verificada").exists());
        // o nome da cópia vem da versão, limpo
        assert_eq!(super::copia_antes_de(&d, "v1.4.6").file_name().unwrap(), "kangest-antes-de-1.4.6.db");
        assert_eq!(super::copia_antes_de(&d, "1.4.6/../x").file_name().unwrap(), "kangest-antes-de-1.4.6..x.db");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn guardar_como_aceita_so_caminhos_validos() {
        let d = std::env::temp_dir().join(format!("kangest-guardar-como-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        // sem extensão: fica .db
        let f = super::destino_escolhido(&d.join("copia-da-loja").display().to_string()).unwrap();
        assert_eq!(f, d.join("copia-da-loja.db"));
        assert_eq!(super::destino_escolhido(&d.join("x.DB").display().to_string()).unwrap(), d.join("x.DB"));
        assert!(super::destino_escolhido("copia.db").unwrap_err().to_string().contains("Escolha onde"), "relativo: não");
        let e = super::destino_escolhido(&d.join("pen-desligada").join("copia.db").display().to_string()).unwrap_err();
        assert!(e.to_string().contains("não existe"), "{e}");
        let _ = std::fs::remove_dir_all(&d);
    }
}


#[cfg(test)]
mod testes_pasta_documentos {
    /// A pasta dos documentos: «Documentos/KanGest Livraria», criada; sem Documentos, as Transferências; a escolhida à
    /// mão só conta se existir.
    #[test]
    fn pasta_visivel_e_organizada() {
        let base = std::env::temp_dir().join(format!("kangest-pasta-documentos-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("Documentos")).unwrap();
        let p = super::pasta_de_omissao(Some(base.join("Documentos")), Some(base.join("Transferencias")), &base);
        assert_eq!(p, base.join("Documentos").join(super::NOME_PASTA));
        assert!(p.is_dir(), "a pasta é criada sozinha");
        assert_eq!(super::pasta_de_omissao(None, Some(base.join("T")), &base), base.join("T"));
        assert_eq!(super::pasta_de_omissao(None, None, &base), base);
        std::fs::write(base.join("pastas.json"), r#"{"documentos": "/esta/pasta/nao/existe"}"#).unwrap();
        assert!(super::pasta_escolhida(&base).is_none());
        std::fs::write(base.join("pastas.json"), format!(r#"{{"documentos": {:?}}}"#, p.display().to_string())).unwrap();
        assert_eq!(super::pasta_escolhida(&base), Some(p));
        let _ = std::fs::remove_dir_all(&base);
    }
}
