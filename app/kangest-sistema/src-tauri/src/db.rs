// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

use std::path::Path;

use serde_json::{Map, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteRow, SqliteSynchronous};
use sqlx::{Column, Row, SqlitePool, TypeInfo, ValueRef};

use crate::error::{AppError, AppResult};

/// O início de uma base SQLite em claro. Uma base cifrada (SQLCipher) começa por bytes aleatórios.
const CABECALHO: &[u8; 16] = b"SQLite format 3\0";

/// A base (ou cópia) está em claro: o ficheiro começa pelo cabeçalho do SQLite.
pub fn em_claro(f: &Path) -> bool {
    use std::io::Read;
    let mut b = [0u8; 16];
    std::fs::File::open(f).and_then(|mut x| x.read_exact(&mut b)).is_ok() && &b == CABECALHO
}

/// O OpenSSL (o SQLCipher usa-o no Windows e no Linux; no macOS usa o CommonCrypto da Apple) inicializa-se sem a
/// limpeza à saída do programa (`OPENSSL_INIT_NO_ATEXIT`, que o `openssl_sys::init` pede): com ligações à base ainda a
/// fechar noutras threads, essa limpeza libertava memória que ainda estava em uso («double free or corruption» no fim
/// dos testes, de vez em quando). O sistema recupera essa memória de qualquer forma. Tem de vir antes do primeiro
/// uso do OpenSSL, por isso está aqui, por onde passam todas as ligações cifradas.
fn iniciar_cripto() {
    #[cfg(not(target_os = "macos"))]
    openssl_sys::init();
}

/// As opções de uma ligação à base cifrada com a chave (`PRAGMA key` vai sempre primeiro: o sqlx põe-no à cabeça).
pub fn com_chave(o: SqliteConnectOptions, chave: &str) -> SqliteConnectOptions {
    iniciar_cripto();
    o.pragma("key", format!("\"x'{chave}'\""))
}

/// A base abre com esta chave (lê o catálogo: com a chave errada o SQLCipher responde «file is not a database»).
async fn abre_com(f: &Path, chave: &str) -> bool {
    use sqlx::{ConnectOptions, Connection};
    let Ok(mut c) = com_chave(SqliteConnectOptions::new().filename(f).read_only(true), chave).connect().await else { return false };
    let ok = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sqlite_master").fetch_one(&mut c).await.is_ok();
    c.close().await.ok();
    ok
}

/// As tabelas e o número de linhas de cada uma (para conferir uma base copiada).
async fn contagens(c: &mut sqlx::SqliteConnection, esquema: &str) -> AppResult<Vec<(String, i64)>> {
    let tabelas: Vec<String> =
        sqlx::query_scalar(&format!("SELECT name FROM {esquema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
            .fetch_all(&mut *c)
            .await?;
    let mut v = Vec::new();
    for t in tabelas {
        let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {esquema}.\"{}\"", t.replace('"', "\"\""))).fetch_one(&mut *c).await?;
        v.push((t, n));
    }
    Ok(v)
}

/// Copia a base ligada em `c` (o esquema `main`) para `destino`, com a chave `chave_destino` (`None`: em claro), com
/// o `sqlcipher_export`. Confere que a cópia tem as mesmas tabelas e linhas, e devolve-as.
async fn exportar(c: &mut sqlx::SqliteConnection, destino: &Path, chave_destino: Option<&str>) -> AppResult<Vec<(String, i64)>> {
    if destino.exists() {
        std::fs::remove_file(destino).map_err(|e| AppError::msg(format!("Não foi possível substituir {}: {e}", destino.display())))?;
    }
    let chave = chave_destino.map(|k| format!("x'{k}'")).unwrap_or_default();
    sqlx::query("ATTACH DATABASE ?1 AS destino KEY ?2").bind(destino.to_string_lossy().to_string()).bind(chave).execute(&mut *c).await?;
    let r = async {
        sqlx::query("BEGIN").execute(&mut *c).await?;
        sqlx::query("SELECT sqlcipher_export('destino')").execute(&mut *c).await?;
        let versao: i64 = sqlx::query_scalar("PRAGMA main.user_version").fetch_one(&mut *c).await?;
        sqlx::query(&format!("PRAGMA destino.user_version = {versao}")).execute(&mut *c).await?;
        let (a, b) = (contagens(c, "main").await?, contagens(c, "destino").await?);
        sqlx::query("COMMIT").execute(&mut *c).await?;
        if a != b {
            return Err(AppError::msg("A cópia da base não ficou igual ao original."));
        }
        Ok(a)
    }
    .await;
    if r.is_err() {
        let _ = sqlx::query("ROLLBACK").execute(&mut *c).await;
    }
    let _ = sqlx::query("DETACH DATABASE destino").execute(&mut *c).await;
    if r.is_err() {
        let _ = std::fs::remove_file(destino);
    }
    r
}

/// Cópia da base **em claro** (portátil): a cópia exportada e as cópias externas (pen, OneDrive), que têm de se
/// poder restaurar noutro computador, onde a chave deste não existe. As cópias locais (`VACUUM INTO`) saem cifradas.
pub async fn exportar_em_claro(pool: &SqlitePool, destino: &Path) -> AppResult<()> {
    let mut c = pool.acquire().await?;
    exportar(&mut c, destino, None).await?;
    Ok(())
}

/// Copia a base `origem` (cifrada com `chave_origem`, ou em claro) para `destino`, cifrada com `chave_destino`: o
/// `sqlcipher_export` conferido tabela a tabela e, depois, o destino aberto outra vez, só com a chave nova, e contado
/// de novo. A origem tem de ser uma cópia: abre-se para escrita (o ATTACH do destino precisa dela) e o que estiver no
/// WAL dela entra antes na base. Devolve as tabelas e as linhas de cada uma.
pub async fn recifrar(origem: &Path, chave_origem: Option<&str>, destino: &Path, chave_destino: &str) -> AppResult<Vec<(String, i64)>> {
    use sqlx::{ConnectOptions, Connection};
    if !origem.is_file() {
        return Err(AppError::msg(format!("Não encontro {}.", origem.display())));
    }
    // create_if_missing: sem ele o ATTACH não pode criar o ficheiro novo
    let mut o = SqliteConnectOptions::new().filename(origem).create_if_missing(true);
    if let Some(k) = chave_origem {
        o = com_chave(o, k);
    }
    let mut c = o.connect().await?;
    let r = exportar_copia(&mut c, destino, chave_destino).await;
    c.close().await.ok();
    if r.is_err() {
        let _ = std::fs::remove_file(destino);
    }
    let antes = r?;
    let depois = match com_chave(SqliteConnectOptions::new().filename(destino).read_only(true), chave_destino).connect().await {
        Ok(mut d) => {
            let n = contagens(&mut d, "main").await;
            d.close().await.ok();
            n.ok()
        }
        Err(_) => None,
    };
    if depois.as_ref() != Some(&antes) {
        let _ = std::fs::remove_file(destino);
        return Err(AppError::msg("A cópia da base, aberta com a chave nova, não ficou igual ao original."));
    }
    Ok(antes)
}

/// Na ligação à cópia: confere que abre (com a chave errada o SQLCipher responde «file is not a database», e aí não
/// se cria destino nenhum), passa o WAL para a base e exporta.
async fn exportar_copia(c: &mut sqlx::SqliteConnection, destino: &Path, chave_destino: &str) -> AppResult<Vec<(String, i64)>> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sqlite_master").fetch_one(&mut *c).await?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut *c).await?;
    exportar(c, destino, Some(chave_destino)).await
}

/// Cifra uma base em claro no próprio sítio (versões anteriores, ou uma cópia em claro restaurada): exporta para um
/// ficheiro ao lado, confere-o, e troca-o pelo original (um corte a meio deixa o original intacto).
async fn cifrar_em_sitio(f: &Path, chave: &str) -> AppResult<()> {
    use sqlx::{ConnectOptions, Connection};
    let novo = f.with_extension("db-cifrando");
    {
        // create_if_missing: sem ele o ATTACH não pode criar o ficheiro novo
        let mut c = SqliteConnectOptions::new().filename(f).create_if_missing(true).connect().await?;
        // o que estiver no WAL entra na base antes de a copiar
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut c).await?;
        let r = exportar(&mut c, &novo, Some(chave)).await;
        c.close().await.ok();
        r?;
    }
    if !abre_com(&novo, chave).await {
        let _ = std::fs::remove_file(&novo);
        return Err(AppError::msg("A base cifrada não abriu com a chave: fica como estava."));
    }
    for ext in ["db-wal", "db-shm"] {
        let _ = std::fs::remove_file(f.with_extension(ext));
    }
    std::fs::rename(&novo, f).map_err(|e| AppError::msg(format!("Não foi possível trocar a base pela cifrada: {e}")))?;
    eprintln!("Base de dados cifrada: {}", f.display());
    Ok(())
}

/// Uma base cifrada com outra chave (a pasta de dados veio de outro computador ou de outro utilizador do sistema)
/// não abre aqui. Fica de parte, nunca apagada, e o programa arranca com uma base nova, onde se restaura uma cópia
/// externa ou exportada (que são portáteis). Devolve o nome com que ficou.
fn por_de_parte(f: &Path) -> AppResult<std::path::PathBuf> {
    let carimbo = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let destino = f.with_extension(format!("db.ilegivel-{carimbo}"));
    std::fs::rename(f, &destino).map_err(|e| AppError::msg(format!("A base não abre com a chave deste computador e não foi possível pô-la de parte: {e}")))?;
    for ext in ["db-wal", "db-shm"] {
        let w = f.with_extension(ext);
        if w.exists() {
            let _ = std::fs::rename(&w, destino.with_extension(format!("{}-{ext}", destino.extension().and_then(|x| x.to_str()).unwrap_or(""))));
        }
    }
    eprintln!("A base não abre com a chave deste computador: ficou em {}. Restaure uma cópia externa ou exportada.", destino.display());
    Ok(destino)
}

/// O WAL volta a este tamanho depois de cada checkpoint (sem limite, ficava com o tamanho do maior pico de gravações).
const LIMITE_DO_WAL: i64 = 64 * 1024 * 1024;

/// As opções das ligações à base. O número de ligações e a cache vêm do computador (recursos.rs).
///
/// Não se corre `ANALYZE` nem `PRAGMA optimize`. Com as estatísticas, o SQLite passava a ler a lista de documentos por
/// outra ordem: de 6 ms para 0,9 s com 150 mil documentos (docs/BASE-DE-DADOS.md). As consultas do dia-a-dia estão feitas
/// para os índices, e os planos delas estão num teste (`os_planos_das_consultas_do_dia_a_dia`).
fn opcoes(caminho: &Path, chave: &str, perfil: &crate::recursos::PerfilBase) -> SqliteConnectOptions {
    // filename() evita problemas com espaços no caminho (ex.: "Application Support").
    com_chave(SqliteConnectOptions::new(), chave)
        .filename(caminho)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(10))
        .pragma("cache_size", format!("-{}", perfil.cache_kib))
        .pragma("temp_store", if perfil.temporarios_em_memoria { "MEMORY" } else { "DEFAULT" })
        .pragma("journal_size_limit", LIMITE_DO_WAL.to_string())
}

/// Há migrações desta versão por aplicar numa base que já tinha dados? Então faz a cópia de antes desta versão e
/// devolve-a. É a `copias/kangest-antes-de-<versão>.db`, a mesma que a actualização pelo programa faz, aqui com o
/// estado deste momento. Não há cópia com uma base nova, com uma base em dia, ou sem espaço no disco para ela.
async fn copia_antes_de_migrar(pool: &SqlitePool, caminho: &Path) -> Option<std::path::PathBuf> {
    let aplicada: Option<i64> =
        sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations WHERE success = 1").fetch_one(pool).await.ok().flatten();
    if aplicada? >= ultima_migracao() {
        return None;
    }
    let pasta = caminho.parent()?;
    let destino = crate::services::sistema::copia_antes_de(pasta, env!("CARGO_PKG_VERSION"));
    match crate::services::sistema::copia_com_espaco(pool, pasta, &destino).await {
        Ok(()) => {
            eprintln!("Cópia de antes de actualizar a base: {}", destino.display());
            Some(destino)
        }
        Err(e) => {
            eprintln!("A base vai ser actualizada sem a cópia de antes ({e}).");
            None
        }
    }
}

/// Uma migração não passou. A base volta à cópia de antes, e a que falhou fica ao lado para o suporte. A mensagem diz o
/// que aconteceu e o que fazer. Sem cópia, a base fica como o SQLite a deixou: cada migração ou se aplica toda ou não
/// se aplica, mas as anteriores desta versão já lá estão.
fn falha_na_migracao(caminho: &Path, copia: Option<&Path>, e: &sqlx::migrate::MigrateError) -> AppError {
    use sqlx::migrate::MigrateError;
    let versao = env!("CARGO_PKG_VERSION");
    if matches!(e, MigrateError::VersionMissing(_) | MigrateError::VersionMismatch(_)) {
        return AppError::msg(format!(
            "Esta base de dados é de uma versão do KanGest mais recente do que a {versao}, ou de outro ramo dele ({e}). \
             Instale a versão mais recente do KanGest Livraria: os dados estão intactos."
        ));
    }
    match copia.map(|c| voltar_a_copia(caminho, c).map_err(|x| (c, x))) {
        Some(Ok(falhada)) => AppError::msg(format!(
            "O KanGest {versao} não conseguiu actualizar a base de dados ({e}). A base voltou ao que era antes desta \
             versão, sem perder nada, e a que falhou ficou em {} para o suporte. Pode abrir o KanGest outra vez (volta a \
             tentar) ou instalar a versão anterior.",
            falhada.display()
        )),
        Some(Err((c, x))) => AppError::msg(format!(
            "O KanGest {versao} não conseguiu actualizar a base de dados ({e}) nem voltar à cópia de antes ({x}). A cópia \
             está em {}: contacte o suporte com esta mensagem.",
            c.display()
        )),
        None => AppError::msg(format!(
            "O KanGest {versao} não conseguiu actualizar a base de dados ({e}). Os dados não foram apagados: cada passo \
             da actualização ou se faz todo ou não se faz. Contacte o suporte com esta mensagem."
        )),
    }
}

/// O ficheiro `f` com mais um sufixo (`kigest.db` → `kigest.db-wal`), sem passar o nome por texto.
fn com_sufixo(f: &Path, sufixo: &str) -> std::path::PathBuf {
    let mut s = f.as_os_str().to_os_string();
    s.push(sufixo);
    s.into()
}

/// Põe a base que falhou de lado, com o WAL dela (aplicado à cópia, estragava-a), e a cópia no lugar dela. A cópia
/// prepara-se primeiro ao lado. Se uma troca de nome falhar, as anteriores desfazem-se: nunca fica a pasta sem a base,
/// que no arranque seguinte daria uma base vazia. Devolve onde ficou a que falhou.
fn voltar_a_copia(caminho: &Path, copia: &Path) -> std::io::Result<std::path::PathBuf> {
    let falhada = com_sufixo(caminho, &format!(".migracao-falhou-{}", chrono::Local::now().format("%Y%m%d-%H%M%S")));
    let nova = com_sufixo(caminho, "-a-voltar");
    std::fs::copy(copia, &nova)?;
    // (de, para) de cada troca feita, para as desfazer
    let mut feitas: Vec<(std::path::PathBuf, std::path::PathBuf)> = Vec::new();
    let mut trocas = vec![(caminho.to_path_buf(), falhada.clone())];
    for sufixo in ["-wal", "-shm"] {
        let f = com_sufixo(caminho, sufixo);
        if f.exists() {
            trocas.push((f, com_sufixo(&falhada, sufixo)));
        }
    }
    trocas.push((nova.clone(), caminho.to_path_buf()));
    for (de, para) in trocas {
        if let Err(e) = std::fs::rename(&de, &para) {
            for (de, para) in feitas.into_iter().rev() {
                let _ = std::fs::rename(&para, &de);
            }
            let _ = std::fs::remove_file(&nova);
            return Err(e);
        }
        feitas.push((de, para));
    }
    Ok(falhada)
}

pub async fn abrir(caminho: &Path) -> AppResult<SqlitePool> {
    let chave = crate::segredos::chave_base()?;
    if caminho.is_file() && std::fs::metadata(caminho).map(|m| m.len()).unwrap_or(0) > 0 {
        if em_claro(caminho) {
            cifrar_em_sitio(caminho, &chave).await?;
        } else if !abre_com(caminho, &chave).await {
            por_de_parte(caminho)?;
        }
    }
    let perfil = crate::recursos::perfil_deste();
    let pool = SqlitePoolOptions::new().max_connections(perfil.ligacoes).connect_with(opcoes(caminho, &chave, &perfil)).await?;
    // Antes de passar a base para esta versão, uma cópia dela como está (também quando o instalador novo se pôs à mão,
    // sem a actualização pelo programa). Se uma migração falhar, a base volta a essa cópia: a versão anterior do
    // KanGest abre-a outra vez e nada se perde.
    let copia = copia_antes_de_migrar(&pool, caminho).await;
    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        pool.close().await;
        return Err(falha_na_migracao(caminho, copia.as_deref(), &e));
    }
    // os fechos de caixa de antes do arquivo (0061) ficam arquivados, reconstruídos com os valores de hoje
    if let Err(e) = crate::services::caixa_fechos::arquivar_antigos(&pool).await {
        eprintln!("Fechos de caixa: os antigos ficaram por arquivar ({e}).");
    }
    // linhas de auditoria ainda sem selo (as de antes da 0037, na primeira vez): ver auditoria.rs
    if let Err(e) = crate::auditoria::selar(&pool).await {
        eprintln!("Auditoria: não foi possível selar o registo ao abrir ({e}).");
    }
    Ok(pool)
}

/// Transacção de escrita. Com `BEGIN IMMEDIATE` o bloqueio de escrita fica preso logo no início, à espera do
/// `busy_timeout` se outra ligação estiver a escrever. Com o `BEGIN` normal (diferido), uma transacção que já leu e
/// depois tenta escrever recebe logo «database is locked», sem esperar: acontecia com dois postos a gravar ao mesmo
/// tempo, ou numa gravação feita logo a seguir a outra recusada (que ainda se estava a desfazer noutra ligação).
pub async fn transacao(pool: &SqlitePool) -> AppResult<sqlx::Transaction<'static, sqlx::Sqlite>> {
    Ok(pool.begin_with("BEGIN IMMEDIATE").await?)
}

/// Número da migração mais recente que esta versão conhece. Uma base com migrações mais novas é de uma versão
/// posterior e não abre aqui (o `migrate` recusa migrações aplicadas que não conhece).
pub fn ultima_migracao() -> i64 {
    sqlx::migrate!("./migrations").migrations.iter().map(|m| m.version).max().unwrap_or(0)
}

/// O que, nas migrações de uma base, impede esta versão de a abrir: as aplicadas que ela não tem, as que tem com
/// outro conteúdo (outro checksum: outro ramo do programa, como um KanGest oficial mais recente do que esta edição,
/// com uma 0053 que não é a desta) e as que ficaram a meio. Vazio: a base abre aqui. Sem esta conferência, a troca de
/// um restauro deixava a loja sem programa: o `migrate` de `abrir` recusa a base e o arranque pára.
pub async fn migracoes_estranhas(c: &mut sqlx::SqliteConnection) -> AppResult<Vec<String>> {
    let aplicadas: Vec<(i64, Vec<u8>, i64)> =
        sqlx::query_as("SELECT version, checksum, success FROM _sqlx_migrations ORDER BY version").fetch_all(&mut *c).await?;
    let conhecidas: Vec<(i64, Vec<u8>)> = sqlx::migrate!("./migrations")
        .migrations
        .iter()
        .filter(|m| !m.migration_type.is_down_migration())
        .map(|m| (m.version, m.checksum.to_vec()))
        .collect();
    Ok(estranhas(&aplicadas, &conhecidas))
}

/// As migrações aplicadas (versão, checksum, se terminou) comparadas com as conhecidas (versão, checksum).
fn estranhas(aplicadas: &[(i64, Vec<u8>, i64)], conhecidas: &[(i64, Vec<u8>)]) -> Vec<String> {
    let mut v = Vec::new();
    for (versao, checksum, sucesso) in aplicadas {
        match conhecidas.iter().find(|(k, _)| k == versao) {
            None => v.push(format!("{versao:04} (que esta versão não tem)")),
            Some((_, c)) if c != checksum => v.push(format!("{versao:04} (diferente da desta versão)")),
            _ if *sucesso == 0 => v.push(format!("{versao:04} (ficou a meio)")),
            _ => {}
        }
    }
    v
}

/// Converte uma linha SQLite num objecto JSON (para leituras genéricas).
pub fn row_json(row: &SqliteRow) -> Value {
    let mut obj = Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let raw = match row.try_get_raw(i) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let v = if raw.is_null() {
            Value::Null
        } else {
            match raw.type_info().name() {
                "INTEGER" | "BOOLEAN" => row.try_get::<i64, _>(i).map(Value::from).unwrap_or(Value::Null),
                "REAL" | "NUMERIC" => row.try_get::<f64, _>(i).map(Value::from).unwrap_or(Value::Null),
                _ => row.try_get::<String, _>(i).map(Value::from).unwrap_or(Value::Null),
            }
        };
        obj.insert(col.name().to_string(), v);
    }
    Value::Object(obj)
}

pub fn rows_json(rows: &[SqliteRow]) -> Value {
    Value::Array(rows.iter().map(row_json).collect())
}

pub async fn query_json(pool: &SqlitePool, sql: &str) -> AppResult<Value> {
    let rows = sqlx::query(sql).fetch_all(pool).await?;
    Ok(rows_json(&rows))
}

pub fn agora() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn hoje() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn ontem() -> String {
    (chrono::Local::now().date_naive() - chrono::Duration::days(1)).format("%Y-%m-%d").to_string()
}

/// Consulta com um único parâmetro inteiro, devolvida em JSON.
pub async fn query_json_bind(pool: &SqlitePool, sql: &str, p: i64) -> AppResult<Value> {
    let rows = sqlx::query(sql).bind(p).fetch_all(pool).await?;
    Ok(rows_json(&rows))
}

#[cfg(test)]
mod testes_cifra {
    use super::*;
    use sqlx::{ConnectOptions, Connection};

    fn pasta(nome: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("kangest-cifra-{nome}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }
    fn contem(f: &Path, texto: &str) -> bool {
        std::fs::read(f).unwrap().windows(texto.len()).any(|w| w == texto.as_bytes())
    }

    #[tokio::test]
    async fn base_nova_sai_cifrada_e_so_abre_com_a_chave() {
        let d = pasta("nova");
        let f = d.join("kigest.db");
        let pool = abrir(&f).await.unwrap();
        sqlx::query("INSERT INTO config (chave, valor) VALUES ('teste', 'Cliente Exemplo Lda')").execute(&pool).await.unwrap();
        pool.close().await;
        assert!(!em_claro(&f), "sem o cabeçalho em claro");
        assert!(!contem(&f, "Cliente Exemplo Lda"), "os dados não se lêem no ficheiro");
        let k = crate::segredos::chave_base().unwrap();
        assert!(abre_com(&f, &k).await);
        assert!(!abre_com(&f, &"0".repeat(64)).await, "não abre com outra chave");
        let mut c = SqliteConnectOptions::new().filename(&f).read_only(true).connect().await.unwrap();
        assert!(sqlx::query("SELECT COUNT(*) FROM sqlite_master").fetch_one(&mut c).await.is_err(), "não abre sem chave");
        c.close().await.ok();
        // reabrir: os dados estão lá
        let pool = abrir(&f).await.unwrap();
        let v: String = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'teste'").fetch_one(&pool).await.unwrap();
        assert_eq!(v, "Cliente Exemplo Lda");
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }

    #[tokio::test]
    async fn base_antiga_em_claro_e_cifrada_ao_abrir_sem_perder_nada() {
        let d = pasta("antiga");
        let f = d.join("kigest.db");
        // uma base em claro, como a das versões anteriores (com WAL por aplicar)
        {
            let mut c = SqliteConnectOptions::new().filename(&f).create_if_missing(true).journal_mode(SqliteJournalMode::Wal).connect().await.unwrap();
            sqlx::query("CREATE TABLE clientes_antigos (nome TEXT)").execute(&mut c).await.unwrap();
            for i in 0..50 {
                sqlx::query("INSERT INTO clientes_antigos VALUES (?)").bind(format!("Mercearia Exemplo {i}")).execute(&mut c).await.unwrap();
            }
            sqlx::query("PRAGMA user_version = 7").execute(&mut c).await.unwrap();
            c.close().await.unwrap();
        }
        assert!(em_claro(&f));
        let pool = abrir(&f).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clientes_antigos").fetch_one(&pool).await.unwrap();
        assert_eq!(n, 50);
        let uv: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(uv, 7);
        pool.close().await;
        assert!(!em_claro(&f) && !contem(&f, "Mercearia Exemplo"));
        assert!(!f.with_extension("db-cifrando").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[tokio::test]
    async fn base_de_outra_chave_fica_de_parte_e_arranca_uma_nova() {
        let d = pasta("outra");
        let f = d.join("kigest.db");
        {
            let mut c = com_chave(SqliteConnectOptions::new(), &"ab".repeat(32)).filename(&f).create_if_missing(true).connect().await.unwrap();
            sqlx::query("CREATE TABLE x (y TEXT)").execute(&mut c).await.unwrap();
            c.close().await.unwrap();
        }
        let pool = abrir(&f).await.unwrap();
        pool.close().await;
        let partes: Vec<_> = std::fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
        let de_parte = partes.iter().find(|n| n.starts_with("kigest.db.ilegivel-")).expect("a base antiga ficou de parte");
        assert!(abre_com(&d.join(de_parte), &"ab".repeat(32)).await, "intacta: abre com a chave dela");
        assert!(abre_com(&f, &crate::segredos::chave_base().unwrap()).await, "a nova abre com a chave deste computador");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Uma base cifrada com uma chave (a do KanGest oficial) passa para outra (a desta edição): as mesmas tabelas e
    /// linhas, também as que só estavam no WAL; a cópia só abre com a chave nova e a origem fica como estava.
    #[tokio::test]
    async fn recifrar_de_uma_chave_para_outra_com_as_mesmas_contagens() {
        let d = pasta("recifrar");
        let (a, b) = ("a1".repeat(32), "b2".repeat(32));
        let origem = d.join("oficial.db");
        let o = com_chave(SqliteConnectOptions::new(), &a).filename(&origem).create_if_missing(true).journal_mode(SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(o).await.unwrap();
        sqlx::query("CREATE TABLE clientes (nome TEXT)").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE \"vendas do dia\" (total INTEGER)").execute(&pool).await.unwrap();
        for i in 0..120 {
            sqlx::query("INSERT INTO clientes VALUES (?)").bind(format!("Cliente Exemplo {i}")).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO \"vendas do dia\" VALUES (100), (250)").execute(&pool).await.unwrap();
        sqlx::query("PRAGMA user_version = 52").execute(&pool).await.unwrap();
        // o oficial aberto: o mais recente ainda está no WAL; copia-se a base e o WAL, como em services/oficial.rs
        assert!(d.join("oficial.db-wal").exists());
        let copia = d.join("copia.db");
        for (de, para) in [("oficial.db", "copia.db"), ("oficial.db-wal", "copia.db-wal")] {
            std::fs::copy(d.join(de), d.join(para)).unwrap();
        }
        let destino = d.join("edicao.db");
        let n = recifrar(&copia, Some(a.as_str()), &destino, &b).await.unwrap();
        assert_eq!(n, [("clientes".to_string(), 120), ("vendas do dia".to_string(), 2)]);
        assert!(!em_claro(&destino) && !contem(&destino, "Cliente Exemplo"));
        assert!(abre_com(&destino, &b).await, "abre com a chave nova");
        assert!(!abre_com(&destino, &a).await, "e já não com a antiga");
        let mut c = com_chave(SqliteConnectOptions::new().filename(&destino).read_only(true), &b).connect().await.unwrap();
        assert_eq!(contagens(&mut c, "main").await.unwrap(), n);
        let uv: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&mut c).await.unwrap();
        assert_eq!(uv, 52);
        c.close().await.ok();
        // a origem não mudou: continua a abrir com a chave dela, com tudo
        pool.close().await;
        assert!(abre_com(&origem, &a).await);
        // com a chave errada na origem não se copia nada
        let e = d.join("errada.db");
        assert!(recifrar(&copia, Some(b.as_str()), &e, &a).await.is_err());
        assert!(!e.exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    /// As migrações que impedem a base de abrir: as que esta versão não tem, as diferentes e as que ficaram a meio.
    #[test]
    fn migracoes_estranhas_por_versao_e_checksum() {
        let conhecidas = [(1, vec![1u8]), (2, vec![2u8]), (53, vec![53u8])];
        assert!(estranhas(&[(1, vec![1], 1), (2, vec![2], 1)], &conhecidas).is_empty(), "uma base mais antiga abre");
        assert!(estranhas(&[], &conhecidas).is_empty());
        let e = estranhas(&[(1, vec![1], 1), (53, vec![99], 1), (60, vec![60], 1), (2, vec![2], 0)], &conhecidas);
        assert_eq!(e, ["0053 (diferente da desta versão)", "0060 (que esta versão não tem)", "0002 (ficou a meio)"]);
    }

    #[tokio::test]
    async fn as_migracoes_desta_versao_nao_sao_estranhas() {
        let d = pasta("migracoes");
        let pool = abrir(&d.join("kigest.db")).await.unwrap();
        let mut c = pool.acquire().await.unwrap();
        assert!(migracoes_estranhas(&mut c).await.unwrap().is_empty());
        sqlx::query("UPDATE _sqlx_migrations SET checksum = x'00' WHERE version = 1").execute(&mut *c).await.unwrap();
        assert_eq!(migracoes_estranhas(&mut c).await.unwrap(), ["0001 (diferente da desta versão)"]);
        drop(c);
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }

    #[tokio::test]
    async fn exportacao_em_claro_e_portatil_e_vacuum_into_fica_cifrado() {
        let d = pasta("copias");
        let f = d.join("kigest.db");
        let pool = abrir(&f).await.unwrap();
        sqlx::query("INSERT INTO config (chave, valor) VALUES ('teste', 'Loja Exemplo')").execute(&pool).await.unwrap();
        let e = d.join("exportada.db");
        exportar_em_claro(&pool, &e).await.unwrap();
        assert!(em_claro(&e), "portátil: abre noutro computador");
        let mut c = SqliteConnectOptions::new().filename(&e).read_only(true).connect().await.unwrap();
        let v: String = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'teste'").fetch_one(&mut c).await.unwrap();
        assert_eq!(v, "Loja Exemplo");
        c.close().await.ok();
        let local = d.join("local.db");
        sqlx::query("VACUUM INTO ?").bind(local.to_string_lossy().to_string()).execute(&pool).await.unwrap();
        assert!(!em_claro(&local) && abre_com(&local, &crate::segredos::chave_base().unwrap()).await, "a cópia local sai cifrada");
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }

    /// O plano de uma consulta (as linhas do EXPLAIN QUERY PLAN juntas), com `n` parâmetros a NULL.
    async fn plano(pool: &SqlitePool, sql: &str, n: usize) -> String {
        let s = format!("EXPLAIN QUERY PLAN {sql}");
        let mut q = sqlx::query(&s);
        for _ in 0..n {
            q = q.bind(None::<String>);
        }
        q.fetch_all(pool).await.unwrap().iter().map(|r| r.get::<String, _>("detail")).collect::<Vec<_>>().join(" | ")
    }

    /// As consultas do dia-a-dia usam os índices, no motor a sério (o SQLCipher do programa). Com 150 mil documentos,
    /// cada uma destas chegou a levar segundos (docs/BASE-DE-DADOS.md). Confirma também a configuração da base e que ninguém
    /// correu o ANALYZE: com as estatísticas, a lista de documentos passava a ler-se por outra ordem (6 ms → 0,9 s).
    #[tokio::test]
    async fn os_planos_das_consultas_do_dia_a_dia() {
        let d = pasta("planos");
        let pool = abrir(&d.join("kigest.db")).await.unwrap();
        // a reposição parte dos tipos e da data, nunca das linhas todas (17,6 s → 0,6 s)
        let p = plano(&pool, crate::services::gestao::SQL_SUGESTAO, 2).await;
        assert!(!p.split(" | ").any(|x| x == "SCAN l" || x.starts_with("SCAN l ")), "{p}");
        assert!(p.contains("idx_doc_tipo_data"), "{p}");
        // os documentos de um cliente saem já ordenados (o Consumidor final tem quase todos: 1,9 s → 22 ms)
        let p = plano(
            &pool,
            "SELECT d.id FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo JOIN utilizadores u ON u.id = d.utilizador_id
             WHERE 1 = 1 AND d.entidade_id = ? ORDER BY d.data_hora DESC, d.id DESC LIMIT ?",
            2,
        )
        .await;
        assert!(p.contains("idx_docs_entidade_data") && !p.contains("TEMP B-TREE"), "{p}");
        // o saldo de um cliente (lista de clientes, limite de crédito em cada venda a crédito) só pelo índice
        let p = plano(
            &pool,
            "SELECT e.limite_credito, COALESCE((SELECT SUM(d.valor_pendente) - SUM(d.credito_disponivel) FROM documentos d
                                                WHERE d.entidade_id = e.id AND d.estado = 'N'), 0)
             FROM entidades e WHERE e.id = ?",
            1,
        )
        .await;
        assert!(p.contains("COVERING INDEX idx_docs_entidade_saldo"), "{p}");
        // o NIF ao gravar um cliente
        let p = plano(&pool, "SELECT nome FROM entidades WHERE nif = ? AND id <> ? AND ativo = 1", 2).await;
        assert!(p.contains("idx_entidades_nif"), "{p}");
        // a auditoria de um período longo pára nas primeiras linhas (sem ordenar o período todo: 1,2 s → 25 ms)
        let p = plano(
            &pool,
            "SELECT a.id FROM auditoria a LEFT JOIN utilizadores u ON u.id = a.utilizador_id
             WHERE a.data_hora >= ?1 AND a.data_hora < date(?2, '+1 day') AND (?3 IS NULL OR a.utilizador_id = ?3)
             ORDER BY a.data_hora DESC, a.id DESC LIMIT 1000",
            3,
        )
        .await;
        assert!(p.contains("idx_auditoria_data") && !p.contains("TEMP B-TREE"), "{p}");
        // sem estatísticas do planeador
        let stat: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'sqlite_stat%'").fetch_one(&pool).await.unwrap();
        assert_eq!(stat, 0, "ninguém pode correr o ANALYZE (ver opcoes)");
        // a configuração vem do computador
        let perfil = crate::recursos::perfil_deste();
        let cache: i64 = sqlx::query_scalar("PRAGMA cache_size").fetch_one(&pool).await.unwrap();
        assert_eq!(cache, -perfil.cache_kib);
        let wal: i64 = sqlx::query_scalar("PRAGMA journal_size_limit").fetch_one(&pool).await.unwrap();
        assert_eq!(wal, LIMITE_DO_WAL);
        let modo: String = sqlx::query_scalar("PRAGMA journal_mode").fetch_one(&pool).await.unwrap();
        assert_eq!(modo, "wal");
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Uma migração que falha a meio (aqui, a 0065 outra vez, com a coluna dela já criada): a base volta à cópia feita
    /// antes de migrar, com os dados, a que falhou fica ao lado e a mensagem explica. Numa base nova não há cópia.
    #[tokio::test]
    async fn uma_migracao_que_falha_deixa_a_base_como_estava() {
        let d = pasta("migracao-falha");
        let f = d.join("kigest.db");
        let copia = crate::services::sistema::copia_antes_de(&d, env!("CARGO_PKG_VERSION"));
        let pool = abrir(&f).await.unwrap();
        assert!(!copia.exists(), "base nova: sem cópia de antes");
        sqlx::query("INSERT INTO config (chave, valor) VALUES ('teste', 'Loja Exemplo')").execute(&pool).await.unwrap();
        // como se a 0065 e a 0066 estivessem por aplicar, mas com a coluna da 0065 já lá: a 0065 falha
        sqlx::query("DELETE FROM _sqlx_migrations WHERE version >= 65").execute(&pool).await.unwrap();
        pool.close().await;
        let e = abrir(&f).await.unwrap_err().to_string();
        assert!(e.contains("A base voltou ao que era antes desta versão"), "{e}");
        assert!(copia.is_file() && copia.with_extension("verificada").is_file(), "a cópia de antes, verificada");
        // a base é a da cópia: abre com a chave, tem os dados e está na 0064
        let k = crate::segredos::chave_base().unwrap();
        let mut c = com_chave(SqliteConnectOptions::new().filename(&f).read_only(true), &k).connect().await.unwrap();
        let v: String = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'teste'").fetch_one(&mut c).await.unwrap();
        assert_eq!(v, "Loja Exemplo");
        let ultima: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations").fetch_one(&mut c).await.unwrap();
        assert_eq!(ultima, 64);
        c.close().await.ok();
        let nomes: Vec<String> = std::fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
        assert!(nomes.iter().any(|n| n.starts_with("kigest.db.migracao-falhou-")), "a que falhou ficou ao lado: {nomes:?}");
        assert!(!nomes.iter().any(|n| n.ends_with("-a-voltar")), "{nomes:?}");
        // uma base de uma versão mais recente explica-se como tal
        let e = falha_na_migracao(&f, None, &sqlx::migrate::MigrateError::VersionMissing(900)).to_string();
        assert!(e.contains("mais recente") && e.contains("intactos"), "{e}");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// A troca leva o WAL da base que falhou (aplicado à cópia, estragava-a); sem a cópia, nada muda.
    #[test]
    fn voltar_a_copia_leva_o_wal_da_que_falhou() {
        let d = pasta("voltar");
        let f = d.join("kigest.db");
        std::fs::write(&f, b"falhou").unwrap();
        std::fs::write(d.join("kigest.db-wal"), b"wal").unwrap();
        let c = d.join("copia.db");
        std::fs::write(&c, b"antes").unwrap();
        let falhada = voltar_a_copia(&f, &c).unwrap();
        assert_eq!(std::fs::read(&f).unwrap(), b"antes");
        assert_eq!(std::fs::read(&falhada).unwrap(), b"falhou");
        assert_eq!(std::fs::read(com_sufixo(&falhada, "-wal")).unwrap(), b"wal");
        assert!(!d.join("kigest.db-wal").exists() && !d.join("kigest.db-a-voltar").exists());
        assert_eq!(std::fs::read(&c).unwrap(), b"antes", "a cópia fica");
        assert!(voltar_a_copia(&f, &d.join("nao-existe.db")).is_err());
        assert_eq!(std::fs::read(&f).unwrap(), b"antes", "sem a cópia, a base fica");
        let _ = std::fs::remove_dir_all(&d);
    }
}
