// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Trazer os dados do KanGest oficial deste computador para o KanGest Livraria (docs/COPIAS.md, «Trazer os dados do
//! KanGest oficial»).
//!
//! O oficial guarda os dados na pasta irmã desta, com o identificador dele (`ao.kigest.app`): o mesmo `kigest.db`,
//! cifrado com a chave que vem da chave mestra dele (o `kangest.chave` dele, ou o cofre do sistema com o serviço
//! dele). **Nada se cria nem se grava lá**: copia-se a base (com o WAL) para uma pasta temporária desta, abre-se a
//! cópia com a chave do oficial e exporta-se com a desta edição, conferida tabela a tabela. Os segredos (`kgs1:`)
//! passam da chave mestra do oficial para a desta. A troca faz-se no arranque seguinte, como num restauro
//! (sistema.rs). Do resto da pasta do oficial vem só o n.º do posto (posto.json): a rede, a Internet e a pasta dos
//! documentos ficam, porque podiam chocar com o oficial ainda aberto.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{ConnectOptions, Connection, SqlitePool};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// O identificador do KanGest oficial: o nome da pasta de dados dele.
pub const IDENTIFICADOR: &str = "ao.kigest.app";
const BASE: &str = "kigest.db";
const WAL: &str = "kigest.db-wal";
const SHM: &str = "kigest.db-shm";
/// A pasta da cópia, dentro da pasta de dados desta edição (apaga-se no fim, com ou sem erro).
const TEMPORARIA: &str = "importar-oficial";

/// O caminho à mão, sempre ao lado: a cópia exportada do oficial, restaurada aqui.
const A_MAO: &str = "Pode fazê-lo à mão: no KanGest oficial, Configurações → Sistema → «Exportar para Transferências» (a \
     cópia exportada) e, aqui, «Já tem uma cópia de segurança do KanGest?» no primeiro arranque, ou Configurações → \
     Sistema → «Restaurar outro ficheiro», com essa cópia.";

/// O aviso do fim: o oficial não pode continuar a emitir nas mesmas séries.
const AVISO_AGT: &str = "O KanGest oficial deste computador não pode continuar a emitir: as facturas dele e as deste \
     KanGest Livraria seguiam nas mesmas séries, com duas cadeias de assinaturas da AGT a divergir (e a Facturação \
     Electrónica enviaria os mesmos documentos duas vezes). Feche-o e deixe-o só para consulta, ou desinstale-o.";

/// Onde o KanGest guarda valores cifrados com a chave mestra (`kgs1:`), nas tabelas que o oficial também tem: a
/// tabela, a coluna e como se chama cada um quando não abre.
const CIFRADOS: [(&str, &str, &str); 3] = [
    ("config", "valor", "chave"),
    ("utilizadores", "totp_segredo", "'os dois passos de ' || login"),
    ("api_webhooks", "segredo", "'o aviso automático ' || nome"),
];

/// Uma importação de cada vez.
static VEZ: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// A pasta de dados do KanGest oficial neste computador (a irmã da desta edição), se lá houver uma base.
pub fn pasta_oficial(pasta_dados: &Path) -> Option<PathBuf> {
    let p = pasta_dados.parent()?.join(IDENTIFICADOR);
    let tem_base = std::fs::metadata(p.join(BASE)).is_ok_and(|m| m.is_file() && m.len() > 0);
    (tem_base && p != pasta_dados).then_some(p)
}

fn procura_em(pasta_dados: &Path) -> String {
    pasta_dados.parent().map(|p| p.join(IDENTIFICADOR).display().to_string()).unwrap_or_default()
}

/// O KanGest oficial encontrado (onde, o tamanho e a última alteração da base dele), ou `Null`.
pub fn descrever(pasta_dados: &Path) -> Value {
    let Some(p) = pasta_oficial(pasta_dados) else { return Value::Null };
    let metas: Vec<std::fs::Metadata> = [BASE, WAL].iter().filter_map(|n| std::fs::metadata(p.join(n)).ok()).collect();
    let alterada = metas.iter().filter_map(|m| m.modified().ok()).max().map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S").to_string());
    json!({
        "pasta": p.display().to_string(),
        "bytes": metas.iter().map(|m| m.len()).sum::<u64>(),
        "alterada_em": alterada,
        // com o WAL ao lado, o oficial está aberto (ou não fechou bem): o que ele gravou está lá e vem também
        "aberto": p.join(WAL).exists(),
        // o ecrã mostra-o antes de se confirmar (e outra vez no fim)
        "aviso": AVISO_AGT,
    })
}

/// Só no computador que guarda a base: num posto em rede (ou no browser, pela rede) a pasta do oficial seria a de
/// outro computador.
fn nesta_maquina() -> bool {
    crate::state::contexto().is_none() && !crate::rede::config().cliente()
}

/// O oficial deste computador, para o ecrã do primeiro arranque (setup.estado), ou `Null`.
pub fn encontrado(st: &AppState) -> Value {
    if nesta_maquina() {
        descrever(&st.pasta_dados)
    } else {
        Value::Null
    }
}

/// O que esta edição já tem e se perderia com a troca. Vazio: pode trazer-se o oficial (o «Consumidor Final» e o
/// administrador da instalação vêm com qualquer base).
async fn dados_da_edicao(pool: &SqlitePool) -> AppResult<Vec<String>> {
    let mut v = Vec::new();
    for (sql, um, varios) in [
        ("SELECT COUNT(*) FROM documentos", "documento", "documentos"),
        ("SELECT COUNT(*) FROM artigos", "artigo", "artigos"),
        ("SELECT COUNT(*) FROM entidades WHERE id > 1", "cliente ou fornecedor", "clientes e fornecedores"),
        ("SELECT COUNT(*) FROM caixa_sessoes", "sessão de caixa", "sessões de caixa"),
        ("SELECT COUNT(*) - 1 FROM utilizadores", "utilizador além do administrador", "utilizadores além do administrador"),
    ] {
        let n: i64 = sqlx::query_scalar(sql).fetch_one(pool).await?;
        if n > 0 {
            v.push(format!("{n} {}", if n == 1 { um } else { varios }));
        }
    }
    Ok(v)
}

/// Configurações → Sistema: se o oficial está neste computador e se esta edição já tem dados.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.backup")?;
    Ok(json!({
        "oficial": encontrado(st),
        "procura_em": procura_em(&st.pasta_dados),
        "dados": dados_da_edicao(&st.pool).await?,
        "a_mao": A_MAO,
    }))
}

/// No primeiro arranque (sem sessão): só enquanto esta edição não tem empresa nem dados.
pub async fn importar_inicial(st: &AppState) -> AppResult<Value> {
    let empresa: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM empresa").fetch_one(&st.pool).await?;
    if empresa > 0 {
        return Err(AppError::msg("Este KanGest Livraria já está configurado: traga os dados do oficial em Configurações → Sistema."));
    }
    let dados = dados_da_edicao(&st.pool).await?;
    if !dados.is_empty() {
        return Err(AppError::msg(format!("Este KanGest Livraria já tem dados ({}): não se substituem sozinhos. {A_MAO}", dados.join(", "))));
    }
    importar(st, None).await
}

/// Em Configurações → Sistema: só se esta edição ainda não tem dados (nunca os substitui sozinha).
pub async fn importar_sistema(st: &AppState) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.backup")?;
    if !s.tem("sistema.configuracoes") {
        return Err(AppError::SemPermissao);
    }
    let dados = dados_da_edicao(&st.pool).await?;
    if !dados.is_empty() {
        return Err(AppError::msg(format!(
            "Este KanGest Livraria já tem dados ({}): trazer os do KanGest oficial substituía-os, por isso não se faz \
             sozinho. {A_MAO} Antes do restauro, guarda-se uma cópia da base actual.",
            dados.join(", ")
        )));
    }
    importar(st, Some(s.login.as_str())).await
}

async fn importar(st: &AppState, pedido_por: Option<&str>) -> AppResult<Value> {
    if !nesta_maquina() {
        return Err(AppError::msg("Os dados do KanGest oficial trazem-se no computador que guarda a base de dados (o servidor), não num posto em rede."));
    }
    let Some(oficial) = pasta_oficial(&st.pasta_dados) else {
        return Err(AppError::msg(format!("Não encontrei o KanGest oficial neste computador (procurei em {}).", procura_em(&st.pasta_dados))));
    };
    let _vez = VEZ.lock().await;
    let tmp = st.pasta_dados.join(TEMPORARIA);
    let r = preparar(st, &oficial, &tmp, pedido_por).await;
    let _ = std::fs::remove_dir_all(&tmp);
    r
}

/// O que fica escrito na linha IMPORTAR_OFICIAL da auditoria.
struct Pedido<'a> {
    origem: &'a Path,
    por: Option<&'a str>,
    contagens: &'a [(String, i64)],
}

/// O que se ajustou na cópia: os segredos passados para a chave desta edição, os que não abriram e o posto.
struct Ajuste {
    recifrados: usize,
    ilegiveis: Vec<String>,
    posto: i64,
}

async fn preparar(st: &AppState, oficial: &Path, tmp: &Path, pedido_por: Option<&str>) -> AppResult<Value> {
    // a chave do oficial, só lida; uma base antiga, ainda em claro, abre sem ela (os segredos voltam a pedir-se)
    let em_claro = crate::db::em_claro(&oficial.join(BASE));
    let mestra = match crate::segredos::chave_mestra_oficial(oficial) {
        Ok(k) => Some(k),
        Err(_) if em_claro => None,
        Err(e) => return Err(AppError::msg(format!("Não consegui ler a chave do KanGest oficial: {e} {A_MAO}"))),
    };
    let chave_edicao = crate::segredos::chave_base()?;
    let _ = std::fs::remove_dir_all(tmp);
    std::fs::create_dir_all(tmp).map_err(|e| AppError::msg(format!("Não foi possível criar {}: {e}", tmp.display())))?;
    copiar_sem_tocar(oficial, tmp)?;
    let copia = tmp.join(BASE);
    let chave_oficial = match (crate::db::em_claro(&copia), &mestra) {
        (true, _) => None,
        (false, Some(k)) => Some(crate::segredos::chave_base_de(k)),
        (false, None) => return Err(AppError::msg(format!("A base do KanGest oficial está cifrada e não consegui ler a chave dele. {A_MAO}"))),
    };
    conferir(&copia, chave_oficial.as_deref()).await?;
    let pronto = super::sistema::ficheiro_pendente(&st.pasta_dados)?;
    let contagens = crate::db::recifrar(&copia, chave_oficial.as_deref(), &pronto, &chave_edicao).await?;
    let pedido = Pedido { origem: oficial, por: pedido_por, contagens: &contagens };
    let r = match ajustar(&pronto, &chave_edicao, mestra.as_ref(), crate::posto_local(oficial), &pedido).await {
        Ok(a) => super::sistema::verificar_ficheiro(&pronto).await.map(|_| a),
        Err(e) => Err(e),
    };
    if r.is_err() {
        let _ = std::fs::remove_file(&pronto);
    }
    let a = r?;
    let origem = format!("KanGest oficial ({})", oficial.display());
    // pedido em Configurações: a base actual fica guardada antes (no primeiro arranque não há nada a guardar)
    let seguranca = match super::sistema::marcar_restauro(st, &pronto, &origem, pedido_por.map(|_| "kangest-antes-da-importacao"), Some(a.posto)).await {
        Ok(s) => s,
        Err(e) => {
            let _ = std::fs::remove_file(&pronto);
            return Err(e);
        }
    };
    Ok(json!({
        "reiniciar": true,
        "origem": oficial.display().to_string(),
        "copia_da_base_atual": seguranca,
        "contagens": {
            "tabelas": contagens.len(),
            "linhas": contagens.iter().map(|(_, n)| n).sum::<i64>(),
            "documentos": contagem(&contagens, "documentos"),
            "artigos": contagem(&contagens, "artigos"),
            "entidades": contagem(&contagens, "entidades"),
            "utilizadores": contagem(&contagens, "utilizadores"),
        },
        "segredos": { "recifrados": a.recifrados, "ilegiveis": a.ilegiveis },
        "posto": a.posto,
        "aviso": AVISO_AGT,
    }))
}

fn contagem(c: &[(String, i64)], tabela: &str) -> i64 {
    c.iter().find(|(t, _)| t == tabela).map(|(_, n)| *n).unwrap_or(0)
}

/// Copia a base do oficial (e o WAL e o índice dele, se existirem) para `destino`, sem a abrir lá. Se o oficial
/// gravar a meio da cópia (aberto e em uso), repete-se; se não parar, pede-se para o fechar.
fn copiar_sem_tocar(oficial: &Path, destino: &Path) -> AppResult<()> {
    // o tamanho e a hora da base e do WAL (o índice muda com as leituras e o SQLite refá-lo do WAL ao abrir a cópia)
    let estado = || [BASE, WAL].map(|n| std::fs::metadata(oficial.join(n)).ok().map(|m| (m.len(), m.modified().ok())));
    for _ in 0..3 {
        let antes = estado();
        for n in [BASE, WAL, SHM] {
            let (o, d) = (oficial.join(n), destino.join(n));
            let _ = std::fs::remove_file(&d);
            if !o.is_file() {
                continue;
            }
            if let Err(e) = std::fs::copy(&o, &d) {
                let _ = std::fs::remove_file(&d);
                // o índice é dispensável (no Windows pode estar trancado pelo oficial aberto); a base e o WAL não
                if n != SHM {
                    return Err(AppError::msg(format!("Não foi possível copiar {} ({e}). Feche o KanGest oficial e tente outra vez.", o.display())));
                }
            }
        }
        if estado() == antes {
            return Ok(());
        }
    }
    Err(AppError::msg("O KanGest oficial está a gravar enquanto se copia a base dele. Feche-o e tente outra vez."))
}

/// Abre a cópia com a chave do oficial e confere que é uma base do KanGest que esta edição sabe abrir. Sem isto, a
/// troca deixava a loja sem programa: o `migrate` de `db::abrir` recusa migrações que não conhece.
async fn conferir(copia: &Path, chave: Option<&str>) -> AppResult<()> {
    let mut o = SqliteConnectOptions::new().filename(copia);
    if let Some(k) = chave {
        o = crate::db::com_chave(o, k);
    }
    let mut c = o.connect().await.map_err(|e| AppError::msg(format!("A base do KanGest oficial não abre ({e}). {A_MAO}")))?;
    let r = conferir_ligada(&mut c).await;
    c.close().await.ok();
    r
}

async fn conferir_ligada(c: &mut SqliteConnection) -> AppResult<()> {
    let tabelas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('documentos', 'config', 'empresa', '_sqlx_migrations')")
        .fetch_one(&mut *c)
        .await
        .map_err(|e| AppError::msg(format!("A base do KanGest oficial não abre com a chave dele ({e}). {A_MAO}")))?;
    if tabelas < 4 {
        return Err(AppError::msg(format!("A pasta {IDENTIFICADOR} não tem uma base do KanGest. {A_MAO}")));
    }
    let estranhas = crate::db::migracoes_estranhas(c).await?;
    if !estranhas.is_empty() {
        return Err(AppError::msg(format!(
            "O KanGest oficial deste computador é mais recente do que este KanGest Livraria: a base dele tem migrações \
             que esta edição não conhece ({}; esta vai até à {:04}). Depois da troca, a base não voltaria a abrir, por \
             isso não se trouxe nada. Actualize o KanGest Livraria (Sobre o KanGest → Actualizações) e tente outra vez.",
            estranhas.join(", "),
            crate::db::ultima_migracao()
        )));
    }
    let empresa: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM empresa").fetch_one(&mut *c).await?;
    if empresa == 0 {
        return Err(AppError::msg("O KanGest oficial deste computador ainda não foi configurado: não há dados para trazer."));
    }
    Ok(())
}

/// Na cópia já cifrada com a chave desta edição (é ela que fica depois da troca), numa transacção: os segredos passam
/// da chave mestra do oficial para a desta, confere-se o posto e fica a linha IMPORTAR_OFICIAL na auditoria (selada
/// ao abrir a base, como as outras).
async fn ajustar(pronto: &Path, chave: &str, mestra_oficial: Option<&[u8; 32]>, posto: i64, pedido: &Pedido<'_>) -> AppResult<Ajuste> {
    let mut c = crate::db::com_chave(SqliteConnectOptions::new().filename(pronto), chave).connect().await?;
    let r = ajustar_ligada(&mut c, mestra_oficial, posto, pedido).await;
    c.close().await.ok();
    r
}

async fn ajustar_ligada(c: &mut SqliteConnection, mestra_oficial: Option<&[u8; 32]>, posto: i64, pedido: &Pedido<'_>) -> AppResult<Ajuste> {
    let mut tx = c.begin().await?;
    let (recifrados, ilegiveis) = recifrar_segredos(&mut tx, mestra_oficial).await?;
    // um posto que a base do oficial não tem fica o 1 (o mesmo que o arranque faria)
    let existe: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM postos WHERE id = ?").bind(posto).fetch_one(&mut *tx).await?;
    let a = Ajuste { recifrados, ilegiveis, posto: if existe > 0 { posto } else { 1 } };
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (NULL, 'IMPORTAR_OFICIAL', ?)").bind(detalhe(pedido, &a)).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(a)
}

/// Os valores `kgs1:` decifram-se com a chave mestra do oficial e voltam a cifrar-se com a desta edição. Os que não
/// abrem (já vinham de outro computador) ficam como estão e voltam a pedir-se, como depois de um restauro.
async fn recifrar_segredos(c: &mut SqliteConnection, mestra_oficial: Option<&[u8; 32]>) -> AppResult<(usize, Vec<String>)> {
    let (mut n, mut ilegiveis) = (0, Vec::new());
    for (tabela, coluna, rotulo) in CIFRADOS {
        // o valor cifrado, ou uma configuração em JSON com valores cifrados lá dentro
        let linhas: Vec<(i64, String, String)> = sqlx::query_as(&format!(
            "SELECT rowid, IFNULL({rotulo}, '{tabela}'), {coluna} FROM {tabela}
             WHERE substr({coluna}, 1, 5) = 'kgs1:' OR instr({coluna}, '\"kgs1:') > 0"
        ))
        .fetch_all(&mut *c)
        .await?;
        for (id, nome, valor) in linhas {
            let novo = match mestra_oficial {
                Some(k) => recifrar_valor(&valor, k),
                None => Valor::Ilegivel,
            };
            match novo {
                Valor::Recifrado(v) => {
                    sqlx::query(&format!("UPDATE {tabela} SET {coluna} = ? WHERE rowid = ?")).bind(v).bind(id).execute(&mut *c).await?;
                    n += 1;
                }
                Valor::Ilegivel => ilegiveis.push(nome),
                Valor::SemSegredos => {}
            }
        }
    }
    Ok((n, ilegiveis))
}

/// Um valor da base depois de passado para a chave desta edição.
#[derive(Debug, PartialEq)]
enum Valor {
    Recifrado(String),
    /// Não abriu com a chave do oficial: fica como estava.
    Ilegivel,
    /// Não tem segredos (um texto qualquer que só fala em «kgs1:»).
    SemSegredos,
}

/// O valor com os segredos passados da chave mestra `k` (a do oficial) para a desta edição: o próprio valor `kgs1:`
/// ou, numa configuração em JSON (como a da importação automática do KIGEST), os textos `kgs1:` lá dentro.
fn recifrar_valor(valor: &str, k: &[u8; 32]) -> Valor {
    if crate::segredos::cifrado(valor) {
        return match crate::segredos::decifrar_com(k, valor) {
            Ok(texto) => Valor::Recifrado(crate::segredos::cifrar(&texto)),
            Err(_) => Valor::Ilegivel,
        };
    }
    let Ok(mut v) = serde_json::from_str::<Value>(valor) else { return Valor::SemSegredos };
    let (mut passados, mut falhados) = (0, 0);
    recifrar_json(&mut v, k, &mut passados, &mut falhados);
    match (passados, falhados) {
        (_, 1..) => Valor::Ilegivel,
        (0, _) => Valor::SemSegredos,
        _ => Valor::Recifrado(v.to_string()),
    }
}

fn recifrar_json(v: &mut Value, k: &[u8; 32], passados: &mut usize, falhados: &mut usize) {
    match v {
        Value::String(s) if crate::segredos::cifrado(s) => match crate::segredos::decifrar_com(k, s) {
            Ok(texto) => {
                *s = crate::segredos::cifrar(&texto);
                *passados += 1;
            }
            Err(_) => *falhados += 1,
        },
        Value::Array(a) => a.iter_mut().for_each(|x| recifrar_json(x, k, passados, falhados)),
        Value::Object(o) => o.values_mut().for_each(|x| recifrar_json(x, k, passados, falhados)),
        _ => {}
    }
}

fn detalhe(p: &Pedido<'_>, a: &Ajuste) -> String {
    let linhas: i64 = p.contagens.iter().map(|(_, n)| n).sum();
    format!(
        "Dados do KanGest oficial ({}){}: {} tabelas e {linhas} linhas, conferidas uma a uma ({} documentos, {} artigos, {} \
         clientes e fornecedores, {} utilizadores); {} segredos passados para a chave desta edição{}; posto {}.",
        p.origem.display(),
        p.por.map(|l| format!(", pedido por {l}")).unwrap_or_else(|| ", no primeiro arranque".into()),
        p.contagens.len(),
        contagem(p.contagens, "documentos"),
        contagem(p.contagens, "artigos"),
        contagem(p.contagens, "entidades"),
        contagem(p.contagens, "utilizadores"),
        a.recifrados,
        if a.ilegiveis.is_empty() { String::new() } else { format!(" ({} por introduzir de novo: {})", a.ilegiveis.len(), a.ilegiveis.join(", ")) },
        a.posto,
    )
}

#[cfg(test)]
mod testes {
    /// O oficial é a pasta irmã, com o identificador dele e uma base; nunca a própria pasta desta edição.
    #[test]
    fn pasta_do_oficial_e_a_irma_com_base() {
        let raiz = std::env::temp_dir().join(format!("kangest-pasta-oficial-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&raiz);
        let edicao = raiz.join("ao.livrariaadventista.kangest");
        let oficial = raiz.join(super::IDENTIFICADOR);
        std::fs::create_dir_all(&edicao).unwrap();
        assert_eq!(super::pasta_oficial(&edicao), None);
        assert!(super::descrever(&edicao).is_null());
        std::fs::create_dir_all(&oficial).unwrap();
        std::fs::write(oficial.join("kigest.db"), b"").unwrap();
        assert_eq!(super::pasta_oficial(&edicao), None, "uma base vazia não conta");
        std::fs::write(oficial.join("kigest.db"), b"conteudo").unwrap();
        assert_eq!(super::pasta_oficial(&edicao), Some(oficial.clone()));
        let d = super::descrever(&edicao);
        assert_eq!((d["bytes"].as_u64(), d["aberto"].as_bool()), (Some(8), Some(false)));
        std::fs::write(oficial.join("kigest.db-wal"), b"wal").unwrap();
        assert_eq!(super::descrever(&edicao)["aberto"], true);
        assert_eq!(super::pasta_oficial(&oficial), None, "o oficial não se importa a si próprio");
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Os segredos do oficial passam para a chave desta edição: o valor cifrado e os que estão dentro de uma
    /// configuração em JSON; o que não abre fica como estava.
    #[test]
    fn segredos_do_oficial_recifrados_tambem_dentro_de_json() {
        use super::{recifrar_valor, Valor};
        use crate::segredos::{cifrar_com, decifrar, decifrar_com};
        let (oficial, outra) = ([7u8; 32], [9u8; 32]);
        let v = cifrar_com(&oficial, "senha da FE");
        let Valor::Recifrado(novo) = recifrar_valor(&v, &oficial) else { panic!("devia passar para a chave desta edição") };
        assert_eq!(decifrar(&novo).unwrap(), "senha da FE");
        assert!(decifrar_com(&oficial, &novo).is_err());
        assert_eq!(recifrar_valor(&cifrar_com(&outra, "x"), &oficial), Valor::Ilegivel);
        // dentro de um JSON (a senha da importação automática do KIGEST)
        let cfg = serde_json::json!({ "ativo": true, "senha_cifrada": cifrar_com(&oficial, "sa-123"), "conexao": { "servidor": "LOJA" } }).to_string();
        let Valor::Recifrado(novo) = recifrar_valor(&cfg, &oficial) else { panic!("o JSON devia ser recifrado") };
        let n: serde_json::Value = serde_json::from_str(&novo).unwrap();
        assert_eq!(decifrar(n["senha_cifrada"].as_str().unwrap()).unwrap(), "sa-123");
        assert_eq!((n["ativo"].as_bool(), n["conexao"]["servidor"].as_str()), (Some(true), Some("LOJA")));
        let estragado = serde_json::json!({ "a": cifrar_com(&oficial, "1"), "b": cifrar_com(&outra, "2") }).to_string();
        assert_eq!(recifrar_valor(&estragado, &oficial), Valor::Ilegivel, "fica como estava");
        // textos que só falam em «kgs1:» não são segredos
        assert_eq!(recifrar_valor("nota sobre \"kgs1:\"", &oficial), Valor::SemSegredos);
        assert_eq!(recifrar_valor("{\"nota\": \"kgs1 não\"}", &oficial), Valor::SemSegredos);
    }
}
