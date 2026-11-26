// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Msg(String),
    #[error("Sessão inválida. Inicie sessão novamente.")]
    NaoAutenticado,
    #[error("Sem permissão para esta operação.")]
    SemPermissao,
    #[error("Registo não encontrado.")]
    NaoEncontrado,
    #[error("{}", texto_da_base(.0))]
    Db(#[from] sqlx::Error),
    #[error("Erro de migração: {0}")]
    Migracao(#[from] sqlx::migrate::MigrateError),
    #[error("Parâmetros inválidos: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError::Msg(s.into())
    }
}

/// O que correu mal na base, para quem está ao balcão. Os problemas do computador (disco cheio, disco que falha, base
/// ocupada, só de leitura ou danificada) vêm explicados, com o que fazer e o código para o suporte. Os outros erros
/// (as regras da base, como «Documento assinado: …») ficam como o SQLite os dá.
fn texto_da_base(e: &sqlx::Error) -> String {
    let codigo = match e {
        sqlx::Error::Database(d) => d.code().and_then(|c| c.parse::<i64>().ok()),
        sqlx::Error::Io(io) if disco_cheio(io) => Some(13),
        _ => None,
    };
    let explicado = match codigo.map(|c| c & 0xff) {
        Some(13) => "O disco deste computador está cheio e a gravação não se fez (nada ficou a meio). Liberte espaço \
                     (por exemplo, esvazie o lixo ou apague transferências antigas) e tente outra vez.",
        Some(10) => "O computador não conseguiu ler ou gravar a base de dados: o disco, um antivírus ou uma pasta \
                     sincronizada (OneDrive, Dropbox) podem estar a bloqueá-la. A gravação não se fez. Tente outra vez e, \
                     se repetir, reinicie o computador.",
        Some(5 | 6) => "A base de dados está ocupada com outra gravação (outro posto ou uma cópia de segurança). Nada se \
                        gravou: tente outra vez dentro de instantes.",
        Some(8) => "A base de dados está só de leitura: a pasta dos dados não deixa gravar (permissões, disco protegido \
                    ou cheio). Nada se gravou.",
        Some(11) => "A base de dados tem uma falha (o ficheiro está danificado). Não desligue o computador à força e \
                     restaure a última cópia de segurança em Configurações → Sistema.",
        Some(14) => "O KanGest não conseguiu abrir o ficheiro da base de dados (a pasta mudou de sítio, ou um antivírus \
                     bloqueou-a).",
        _ => return format!("Erro de base de dados: {e}"),
    };
    format!("{explicado} (Código {}: {e})", codigo.unwrap_or_default())
}

/// O sistema disse «disco cheio»: ENOSPC no macOS e no Linux, ERROR_DISK_FULL e ERROR_HANDLE_DISK_FULL no Windows.
pub fn disco_cheio(e: &std::io::Error) -> bool {
    let c = e.raw_os_error();
    if cfg!(windows) {
        matches!(c, Some(112 | 39))
    } else {
        c == Some(28)
    }
}

// O frontend recebe sempre uma string legível em português.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn os_erros_do_computador_vem_explicados() {
        let cheio = AppError::Db(sqlx::Error::Io(std::io::Error::from_raw_os_error(if cfg!(windows) { 112 } else { 28 }))).to_string();
        assert!(cheio.starts_with("O disco deste computador está cheio"), "{cheio}");
        // os outros ficam como estavam
        let outro = AppError::Db(sqlx::Error::RowNotFound).to_string();
        assert!(outro.starts_with("Erro de base de dados: "), "{outro}");
    }

    /// Com a base a sério: uma base só de leitura dá a mensagem explicada; uma regra da base (gatilho), a dela.
    #[tokio::test]
    async fn erros_da_base_a_serio() {
        use sqlx::{ConnectOptions, Connection};
        let f = std::env::temp_dir().join(format!("kangest-erros-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&f);
        let o = sqlx::sqlite::SqliteConnectOptions::new().filename(&f).create_if_missing(true);
        let mut c = o.clone().connect().await.unwrap();
        sqlx::query("CREATE TABLE t (x INTEGER)").execute(&mut c).await.unwrap();
        sqlx::query("CREATE TRIGGER r BEFORE INSERT ON t WHEN NEW.x < 0 BEGIN SELECT RAISE(ABORT, 'Valor negativo.'); END")
            .execute(&mut c)
            .await
            .unwrap();
        let regra = AppError::from(sqlx::query("INSERT INTO t VALUES (-1)").execute(&mut c).await.unwrap_err()).to_string();
        assert!(regra.contains("Valor negativo."), "{regra}");
        c.close().await.unwrap();
        let mut so_leitura = o.read_only(true).connect().await.unwrap();
        let e = AppError::from(sqlx::query("INSERT INTO t VALUES (1)").execute(&mut so_leitura).await.unwrap_err()).to_string();
        assert!(e.starts_with("A base de dados está só de leitura"), "{e}");
        so_leitura.close().await.ok();
        let _ = std::fs::remove_file(&f);
    }
}
