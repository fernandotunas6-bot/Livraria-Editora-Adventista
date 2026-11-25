// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A verificação da base depois de cada actualização (docs/BASE-DE-DADOS.md, «Verificações»).
//!
//! No arranque, `registar_arranque` compara a versão do programa com a do arranque anterior (`sistema.versao_arranque`,
//! na configuração). Se mudou, fica marcada uma verificação por fazer (`verificacao.pendente`) e `iniciar` fá-la em
//! segundo plano, sem sessão, sem parar o arranque nem as vendas:
//!
//! - a base: `PRAGMA quick_check` e `PRAGMA foreign_key_check`;
//! - a cadeia de assinaturas da AGT e os gatilhos da 0018 que protegem os documentos assinados (services/integridade.rs);
//! - a cadeia dos selos da auditoria (src/auditoria.rs);
//! - o stock gravado face aos movimentos (services/catalogo.rs);
//! - o caixa: sessões abertas há mais de um dia, mais de uma aberta no mesmo posto, documentos ligados a um caixa que não
//!   existe.
//!
//! O resultado fica na tabela `verificacoes_base` (migração 0060) e na auditoria; com problemas, avisa no computador.
//! **Só avisa**: nunca pára a emissão nem restaura nada sozinho. Em Sobre o KanGest vê-se o resultado, verifica-se à
//! mão («Verificar agora») e, com problemas graves, restaura-se à mão a cópia de antes da actualização.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// A versão do programa no último arranque.
pub const CHAVE_VERSAO: &str = "sistema.versao_arranque";
/// A verificação por fazer depois de uma actualização (JSON: de, para, em).
pub const CHAVE_PENDENTE: &str = "verificacao.pendente";
/// Verificar sozinho depois de cada actualização («1», por omissão; «0» desliga e fica só o «Verificar agora»).
pub const CHAVE_AUTOMATICA: &str = "verificacao.depois_de_actualizar";

/// Quantas verificações se guardam.
const GUARDAR: i64 = 50;
/// Linhas de pormenor guardadas por verificação (o resto só conta).
const PORMENOR: usize = 20;
/// Quanto espera a verificação automática depois de o programa abrir.
const ESPERA_SEGUNDOS: u64 = 45;

/// Uma verificação de cada vez (a automática e a do botão não correm juntas).
static A_CORRER: AtomicBool = AtomicBool::new(false);

/// Tira a marca «a correr» no fim, mesmo quando a verificação falha.
struct Marca;

impl Drop for Marca {
    fn drop(&mut self) {
        A_CORRER.store(false, Ordering::SeqCst);
    }
}

/// Marca a verificação como a correr, se nenhuma estiver. Sem `then_some`: a `Marca` criada à toa caía logo e tirava a
/// marca à verificação que já estava a correr.
fn marcar() -> Option<Marca> {
    if A_CORRER.swap(true, Ordering::SeqCst) {
        None
    } else {
        Some(Marca)
    }
}

async fn cfg(pool: &SqlitePool, chave: &str) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(chave).fetch_optional(pool).await?)
}

async fn cfg_gravar<'e, E: sqlx::SqliteExecutor<'e>>(e: E, chave: &str, valor: &str) -> AppResult<()> {
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(chave).bind(valor).execute(e).await?;
    Ok(())
}

// ------------------------------------------------------------------ a versão do arranque

/// O programa mudou de versão desde o último arranque? Sem registo (bases de antes da 1.4.5) conta como mudança.
pub fn actualizou(anterior: Option<&str>, atual: &str) -> bool {
    anterior.map(str::trim).is_none_or(|a| a != atual.trim())
}

/// No arranque, depois das migrações: grava a versão deste programa e, se mudou, marca a verificação por fazer.
/// Uma base nova (sem empresa) só fica com a versão: não há nada que verificar. Devolve se o programa foi actualizado.
pub async fn registar_arranque(pool: &SqlitePool, atual: &str) -> AppResult<bool> {
    let anterior = cfg(pool, CHAVE_VERSAO).await?;
    if !actualizou(anterior.as_deref(), atual) {
        return Ok(false);
    }
    let empresa: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM empresa").fetch_one(pool).await?;
    let mudou = anterior.is_some() || empresa > 0;
    let mut tx = db::transacao(pool).await?;
    cfg_gravar(&mut *tx, CHAVE_VERSAO, atual.trim()).await?;
    if mudou {
        let pendente = json!({ "de": anterior, "para": atual.trim(), "em": db::agora() });
        cfg_gravar(&mut *tx, CHAVE_PENDENTE, &pendente.to_string()).await?;
    }
    tx.commit().await?;
    Ok(mudou)
}

async fn pendente(pool: &SqlitePool) -> AppResult<Option<Value>> {
    Ok(cfg(pool, CHAVE_PENDENTE).await?.and_then(|v| serde_json::from_str::<Value>(&v).ok()).filter(|v| v.is_object()))
}

async fn automatica(pool: &SqlitePool) -> AppResult<bool> {
    Ok(cfg(pool, CHAVE_AUTOMATICA).await?.as_deref() != Some("0"))
}

// ------------------------------------------------------------------ as verificações

/// O que uma verificação encontrou. As graves (o ficheiro, as ligações, a AGT, a auditoria) fazem oferecer a cópia de
/// antes da actualização; as outras (o stock, o caixa) corrigem-se nos ecrãs de sempre.
struct Resultado {
    id: &'static str,
    nome: &'static str,
    grave: bool,
    ok: bool,
    resumo: String,
    detalhe: Value,
}

impl Resultado {
    fn json(&self) -> Value {
        json!({ "id": self.id, "nome": self.nome, "grave": self.grave, "ok": self.ok, "resumo": self.resumo, "detalhe": self.detalhe })
    }
}

/// Uma verificação que não chegou a correr (a base recusou a consulta) conta como problema.
fn apanhar(id: &'static str, nome: &'static str, grave: bool, r: AppResult<(bool, String, Value)>) -> Resultado {
    match r {
        Ok((ok, resumo, detalhe)) => Resultado { id, nome, grave, ok, resumo, detalhe },
        Err(e) => Resultado { id, nome, grave, ok: false, resumo: format!("Não foi possível verificar: {e}"), detalhe: Value::Null },
    }
}

async fn estrutura(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    let linhas: Vec<String> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(pool).await?;
    let ok = matches!(linhas.as_slice(), [l] if l == "ok");
    let resumo = if ok { "Sem danos.".to_string() } else { format!("{} problema(s) na estrutura do ficheiro da base.", linhas.len()) };
    Ok((ok, resumo, if ok { Value::Null } else { json!(linhas.into_iter().take(PORMENOR).collect::<Vec<_>>()) }))
}

async fn ligacoes(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    let linhas = sqlx::query("PRAGMA foreign_key_check").fetch_all(pool).await?;
    let mut por: BTreeMap<String, i64> = BTreeMap::new();
    for r in &linhas {
        let tabela: String = r.try_get(0).unwrap_or_default();
        let pai: String = r.try_get(2).unwrap_or_default();
        *por.entry(format!("{tabela} → {pai}")).or_insert(0) += 1;
    }
    let ok = linhas.is_empty();
    let resumo = if ok { "Todas as ligações entre tabelas batem certo.".to_string() } else { format!("{} registo(s) ligado(s) a um registo que não existe.", linhas.len()) };
    let detalhe: Vec<Value> = por.into_iter().take(PORMENOR).map(|(ligacao, n)| json!({ "ligacao": ligacao, "registos": n })).collect();
    Ok((ok, resumo, if ok { Value::Null } else { json!(detalhe) }))
}

async fn agt(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    let v = super::integridade::verificar_cadeia(pool).await?;
    let verificados = v["verificados"].as_u64().unwrap_or(0);
    let com_erro = v["series_com_erro"].as_u64().unwrap_or(0);
    let protecao = v["protecao"]["ativa"].as_bool().unwrap_or(false);
    // sem documentos assinados ainda não há chave a conferir (numa base nova, por exemplo)
    let chaves = v["chaves"].as_u64().unwrap_or(0) > 0 || verificados == 0;
    let ok = com_erro == 0 && protecao && chaves;
    let resumo = if ok {
        format!("{verificados} documento(s) assinado(s) conferido(s): cadeia íntegra e protecções no lugar.")
    } else {
        let mut partes = Vec::new();
        if com_erro > 0 {
            partes.push(format!("{com_erro} série(s) com a cadeia de assinaturas quebrada"));
        }
        if !protecao {
            partes.push("faltam protecções dos documentos assinados".to_string());
        }
        if !chaves {
            partes.push("nenhuma chave conhecida confere as assinaturas".to_string());
        }
        format!("{}: veja em Configurações → Certificação AGT → «Verificar integridade».", partes.join("; "))
    };
    let series: Vec<Value> = v["series"]
        .as_array()
        .map(|s| s.iter().filter(|x| x["total_erros"].as_u64().unwrap_or(0) > 0).take(PORMENOR).cloned().collect())
        .unwrap_or_default();
    Ok((ok, resumo, if ok { Value::Null } else { json!({ "series": series, "em_falta": v["protecao"]["em_falta"] }) }))
}

async fn registo_auditoria(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    let v = crate::auditoria::verificar(pool).await?;
    let ok = v["integra"].as_bool().unwrap_or(false);
    let resumo = if ok {
        format!("{} linha(s) do registo de auditoria, todas com o selo certo.", v["total"].as_i64().unwrap_or(0))
    } else {
        format!(
            "O registo de auditoria foi mexido fora do KanGest ({}).",
            v["problema"]["motivo"].as_str().unwrap_or("veja em Sistema → Auditoria → «Verificar»")
        )
    };
    Ok((ok, resumo, if ok { Value::Null } else { v["problema"].clone() }))
}

async fn stock(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    let (diferencas, lotes) = super::catalogo::stock_diferencas(pool).await?;
    let (n, l) = (diferencas.as_array().map_or(0, |v| v.len()), lotes.as_array().map_or(0, |v| v.len()));
    let ok = n == 0 && l == 0;
    let resumo = if ok {
        "As existências e os lotes batem com os movimentos.".to_string()
    } else {
        format!("{n} existência(s) e {l} lote(s) diferentes dos movimentos: confira e corrija em Gestão de Stock → Recálculo de stock.")
    };
    let corta = |v: &Value| json!(v.as_array().map(|a| a.iter().take(PORMENOR).cloned().collect::<Vec<_>>()).unwrap_or_default());
    Ok((ok, resumo, if ok { Value::Null } else { json!({ "existencias": corta(&diferencas), "lotes": corta(&lotes) }) }))
}

async fn caixa(pool: &SqlitePool) -> AppResult<(bool, String, Value)> {
    // o julianday lê as datas com «T» (as do KanGest) e com espaço (as importadas)
    let limite = (chrono::Local::now() - chrono::Duration::days(1)).format("%Y-%m-%dT%H:%M:%S").to_string();
    let antigas = db::rows_json(
        &sqlx::query(
            "SELECT c.id, c.posto_id, COALESCE(ps.descricao, '') AS posto, c.aberta_em, COALESCE(u.nome, '') AS utilizador
               FROM caixa_sessoes c LEFT JOIN postos ps ON ps.id = c.posto_id LEFT JOIN utilizadores u ON u.id = c.utilizador_id
              WHERE c.estado = 'ABERTA' AND julianday(c.aberta_em) < julianday(?)
              ORDER BY c.aberta_em LIMIT 20",
        )
        .bind(&limite)
        .fetch_all(pool)
        .await?,
    );
    let repetidas = db::rows_json(
        &sqlx::query("SELECT posto_id, COUNT(*) AS abertas FROM caixa_sessoes WHERE estado = 'ABERTA' GROUP BY posto_id HAVING COUNT(*) > 1 LIMIT 20")
            .fetch_all(pool)
            .await?,
    );
    let orfaos: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM documentos d
          WHERE d.caixa_sessao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM caixa_sessoes c WHERE c.id = d.caixa_sessao_id)",
    )
    .fetch_one(pool)
    .await?;
    let (a, r) = (antigas.as_array().map_or(0, |v| v.len()), repetidas.as_array().map_or(0, |v| v.len()));
    let ok = a == 0 && r == 0 && orfaos == 0;
    let resumo = if ok {
        "Sem caixas esquecidos nem documentos fora de um caixa.".to_string()
    } else {
        let mut partes = Vec::new();
        if a > 0 {
            partes.push(format!("{a} caixa(s) aberto(s) há mais de um dia (feche-os no POS)"));
        }
        if r > 0 {
            partes.push(format!("{r} posto(s) com mais de um caixa aberto"));
        }
        if orfaos > 0 {
            partes.push(format!("{orfaos} documento(s) ligado(s) a um caixa que não existe"));
        }
        format!("{}.", partes.join("; "))
    };
    Ok((ok, resumo, if ok { Value::Null } else { json!({ "abertas_ha_mais_de_um_dia": antigas, "postos_com_varias": repetidas, "documentos_sem_caixa": orfaos }) }))
}

/// A cópia de antes de instalar esta versão, se existir (`copias/kangest-antes-de-<versão>.db`).
fn copia_de_antes(pasta_dados: &Path) -> Option<std::path::PathBuf> {
    Some(super::sistema::copia_antes_de(pasta_dados, env!("CARGO_PKG_VERSION"))).filter(|f| f.is_file())
}

/// Corre todas as verificações, grava o resultado (as últimas `GUARDAR`), tira a marca de verificação por fazer,
/// deixa uma linha na auditoria e, com problemas, avisa no computador. Só lê a base (além do próprio registo).
pub async fn verificar_base(pool: &SqlitePool, pasta_dados: &Path, motivo: &str, anterior: Option<&str>, quem: Option<i64>) -> AppResult<Value> {
    let inicio = std::time::Instant::now();
    let lista = [
        apanhar("base", "Ficheiro da base de dados", true, estrutura(pool).await),
        apanhar("ligacoes", "Ligações entre tabelas", true, ligacoes(pool).await),
        apanhar("agt", "Cadeia de assinaturas da AGT", true, agt(pool).await),
        apanhar("auditoria", "Registo de auditoria", true, registo_auditoria(pool).await),
        apanhar("stock", "Stock face aos movimentos", false, stock(pool).await),
        apanhar("caixa", "Caixa", false, caixa(pool).await),
    ];
    let graves = lista.iter().filter(|v| v.grave && !v.ok).count();
    let avisos = lista.iter().filter(|v| !v.grave && !v.ok).count();
    let ok = graves == 0 && avisos == 0;
    let falhas: Vec<&str> = lista.iter().filter(|v| !v.ok).map(|v| v.nome).collect();
    let resumo = if ok {
        "Tudo certo: a base, a cadeia da AGT, a auditoria, o stock e o caixa.".to_string()
    } else {
        format!("{graves} problema(s) grave(s) e {avisos} aviso(s): {}.", falhas.join(", "))
    };
    let detalhe = Value::Array(lista.iter().map(Resultado::json).collect());
    let copia = copia_de_antes(pasta_dados).map(|f| f.display().to_string());
    let duracao = i64::try_from(inicio.elapsed().as_millis()).unwrap_or(i64::MAX);
    let versao = env!("CARGO_PKG_VERSION");
    let mut tx = db::transacao(pool).await?;
    let id = sqlx::query(
        "INSERT INTO verificacoes_base (feita_em, motivo, versao, versao_anterior, ok, graves, avisos, resumo, detalhe, copia, duracao_ms, utilizador_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(db::agora())
    .bind(motivo)
    .bind(versao)
    .bind(anterior)
    .bind(ok)
    .bind(graves as i64)
    .bind(avisos as i64)
    .bind(&resumo)
    .bind(detalhe.to_string())
    .bind(copia.as_deref())
    .bind(duracao)
    .bind(quem)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    sqlx::query("DELETE FROM verificacoes_base WHERE id NOT IN (SELECT id FROM verificacoes_base ORDER BY id DESC LIMIT ?)").bind(GUARDAR).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM config WHERE chave = ?").bind(CHAVE_PENDENTE).execute(&mut *tx).await?;
    let quando = if motivo == "actualizacao" { format!("Depois da actualização para a {versao}") } else { "Verificação à mão".to_string() };
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'VERIFICACAO_BASE', ?)")
        .bind(quem)
        .bind(format!("{quando}: {resumo}"))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    if let Err(e) = crate::auditoria::selar(pool).await {
        eprintln!("Verificação da base: a linha da auditoria ficou por selar ({e}).");
    }
    if !ok {
        let oferta = if graves > 0 && copia.is_some() { " Pode restaurar lá a cópia de antes da actualização." } else { "" };
        crate::nativo::notificar(
            "verificacao-base",
            if graves > 0 { "A verificação da base encontrou problemas" } else { "A verificação da base deixou avisos" },
            &format!("{resumo} Veja em Sobre o KanGest → Verificação da base.{oferta} As vendas continuam."),
        );
    }
    obter(pool, id).await
}

async fn obter(pool: &SqlitePool, id: i64) -> AppResult<Value> {
    let r = sqlx::query(
        "SELECT v.*, COALESCE(u.nome, '') AS utilizador FROM verificacoes_base v LEFT JOIN utilizadores u ON u.id = v.utilizador_id WHERE v.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NaoEncontrado)?;
    let mut v = db::row_json(&r);
    let detalhe: String = r.try_get("detalhe").unwrap_or_default();
    v["detalhe"] = serde_json::from_str(&detalhe).unwrap_or(Value::Array(Vec::new()));
    v["ok"] = json!(r.try_get::<i64, _>("ok").unwrap_or(0) == 1);
    let copia = v["copia"].as_str().map(std::path::PathBuf::from);
    if let Some(f) = copia {
        v["copia_existe"] = json!(f.is_file());
        v["copia_verificada"] = json!(f.with_extension("verificada").is_file());
    }
    Ok(v)
}

/// A verificação por fazer depois de uma actualização, se a automática estiver ligada. Devolve o resultado, ou `None`
/// quando não havia nada por fazer.
pub async fn correr_pendente(pool: &SqlitePool, pasta_dados: &Path) -> AppResult<Option<Value>> {
    let Some(p) = pendente(pool).await? else { return Ok(None) };
    if !automatica(pool).await? {
        return Ok(None);
    }
    let Some(_marca) = marcar() else { return Ok(None) };
    Ok(Some(verificar_base(pool, pasta_dados, "actualizacao", p["de"].as_str(), None).await?))
}

/// No arranque: a verificação por fazer corre uns segundos depois de o programa abrir, em segundo plano. Só na máquina
/// que guarda a base (num posto em rede, os dados estão no servidor).
pub fn iniciar(st: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(ESPERA_SEGUNDOS)).await;
        if crate::rede::config().cliente() {
            return;
        }
        if let Err(e) = correr_pendente(&st.pool, &st.pasta_dados).await {
            eprintln!("Verificação depois da actualização: {e}");
            crate::nativo::notificar("verificacao-base", "A verificação da base não correu", &format!("{e}. Verifique em Sobre o KanGest → Verificação da base."));
        }
    });
}

// ------------------------------------------------------------------ RPC (`verificacao.*`)

/// `verificacao.*` (ver o despachante em services/mod.rs).
pub async fn despachar(st: &AppState, metodo: &str, params: Value) -> AppResult<Value> {
    use super::p;
    match metodo {
        "estado" => estado(st).await,
        "agora" => agora(st).await,
        "automatica" => definir_automatica(st, p(params)?).await,
        "ajustesAplicar" => ajustes_aplicar(st).await,
        _ => Err(AppError::msg(format!("Método desconhecido: verificacao.{metodo}"))),
    }
}

/// Sobre o KanGest → Verificação da base: a última verificação, as anteriores, a por fazer e os ajustes de dados.
async fn estado(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let p = &st.pool;
    let ultima: Option<i64> = sqlx::query_scalar("SELECT MAX(id) FROM verificacoes_base").fetch_one(p).await?;
    let ultima = match ultima {
        Some(id) => obter(p, id).await?,
        None => Value::Null,
    };
    let historico = db::query_json(
        p,
        "SELECT id, feita_em, motivo, versao, versao_anterior, ok = 1 AS ok, graves, avisos, resumo FROM verificacoes_base ORDER BY id DESC LIMIT 10",
    )
    .await?;
    let copia = copia_de_antes(&st.pasta_dados).map(|f| {
        json!({ "ficheiro": f.display().to_string(), "verificada": f.with_extension("verificada").is_file(), "versao": env!("CARGO_PKG_VERSION") })
    });
    Ok(json!({
        "versao": env!("CARGO_PKG_VERSION"),
        "versao_arranque": cfg(p, CHAVE_VERSAO).await?,
        "pendente": pendente(p).await?,
        "automatica": automatica(p).await?,
        "a_correr": A_CORRER.load(Ordering::SeqCst),
        "ultima": ultima,
        "historico": historico,
        "copia_antes": copia,
        "ajustes": crate::ajustes::listar(p).await?,
    }))
}

/// «Verificar agora»: corre em segundo plano (numa base grande demora) e o ecrã vai perguntando pelo `estado`.
async fn agora(st: &AppState) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.configuracoes")?;
    let Some(marca) = marcar() else { return Ok(json!({ "a_correr": true, "ja_estava": true })) };
    let (pool, pasta, quem) = (st.pool.clone(), st.pasta_dados.clone(), s.id);
    tauri::async_runtime::spawn(async move {
        let _marca = marca;
        if let Err(e) = verificar_base(&pool, &pasta, "manual", None, Some(quem)).await {
            eprintln!("Verificação da base: {e}");
        }
    });
    Ok(json!({ "a_correr": true }))
}

#[derive(Deserialize)]
struct AutomaticaIn {
    ligada: bool,
}

/// Liga ou desliga a verificação sozinha depois de cada actualização (o «Verificar agora» fica sempre).
async fn definir_automatica(st: &AppState, a: AutomaticaIn) -> AppResult<Value> {
    let s = st.exigir_perm("sistema.configuracoes")?;
    cfg_gravar(&st.pool, CHAVE_AUTOMATICA, if a.ligada { "1" } else { "0" }).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'CONFIG', ?)")
        .bind(s.id)
        .bind(if a.ligada { "Verificação da base depois de cada actualização: ligada" } else { "Verificação da base depois de cada actualização: desligada" })
        .execute(&st.pool)
        .await?;
    Ok(json!({ "automatica": a.ligada }))
}

/// «Tentar outra vez» os ajustes de dados que falharam (correm também sozinhos em cada arranque).
async fn ajustes_aplicar(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("sistema.configuracoes")?;
    // corre onde está a base: num posto em rede, este pedido segue para o servidor (rede.rs)
    let r = crate::ajustes::aplicar(&st.pool, Some(st.pasta_dados.as_path())).await?;
    Ok(json!({ "resultado": r, "ajustes": crate::ajustes::listar(&st.pool).await? }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn detecta_a_mudanca_de_versao() {
        assert!(!actualizou(Some("1.4.5"), "1.4.5"));
        assert!(!actualizou(Some(" 1.4.5 "), "1.4.5"));
        assert!(actualizou(Some("1.4.4"), "1.4.5"));
        // voltar atrás também conta: a base passou por outra versão
        assert!(actualizou(Some("1.4.6"), "1.4.5"));
        // sem registo (bases de antes da 1.4.5)
        assert!(actualizou(None, "1.4.5"));
    }
}
