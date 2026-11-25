// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O fecho de caixa arquivado (migração 0062; docs/UTILIZADORES.md §Fecho de caixa).
//!
//! - **O instantâneo.** No fecho, o relatório Z inteiro (os pagamentos, a conferência, os artigos com as devoluções a
//!   abater, os documentos da sessão e as vendas online) fica gravado em `caixa_fechos`, na mesma transacção que fecha
//!   o caixa, com um selo SHA-256 do texto. Ver ou reimprimir um fecho lê o instantâneo: um documento anulado depois
//!   já não muda um Z antigo. Os gatilhos da 0062 não o deixam alterar nem apagar.
//! - **As vendas online**, à parte: os documentos emitidos pela API (sem caixa) e as encomendas pagas da cópia local
//!   da Loja online ainda sem FR, entre a abertura e o fecho. Não contam para o numerário da gaveta. Cada uma fecha uma
//!   só vez (`caixa_fecho_online`): o primeiro Z que a inclui fica com ela.
//! - **O ficheiro.** Cada fecho grava-se sozinho na pasta dos documentos, em «Fechos de caixa», num HTML pronto a
//!   imprimir (sem dependências novas não há PDF sem o diálogo). No histórico: «Abrir a pasta» e «Guardar outra vez».
//! - **A 2.ª via.** Cada impressão de um fecho fica na auditoria selada; a seguinte à primeira sai como 2.ª via, como
//!   nos documentos (impressao.rs).
//! - **Os fechos antigos** (de antes desta versão, ou importados do KIGEST) arquivam-se ao abrir a base com os valores
//!   desse dia e ficam marcados como reconstruídos.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqliteConnection, SqlitePool};

use super::catalogo::IdIn;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Uma venda online que um fecho pode incluir: um documento emitido pela API ou uma encomenda paga da cópia local.
pub(super) struct VendaOnline {
    pub documento_id: Option<i64>,
    pub encomenda_id: Option<String>,
    pub encomenda_numero: String,
    /// cêntimos; negativo numa nota de crédito
    pub valor: i64,
    /// como fica no instantâneo e na auditoria
    pub linha: Value,
}

impl VendaOnline {
    /// «FR W2026/3» ou «encomenda LIV-1234», para a auditoria.
    pub fn descricao(&self) -> String {
        match self.documento_id {
            Some(_) => self.linha["numero_doc"].as_str().unwrap_or("documento").to_string(),
            None => format!("encomenda {}", self.encomenda_numero),
        }
    }
}

/// O SHA-256 (hex) do texto do instantâneo, como fica gravado.
pub(super) fn selo_de(texto: &str) -> String {
    Sha256::digest(texto.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// A hora de um pagamento do site (ISO 8601 com o fuso, em geral UTC) na hora deste computador, como as horas do
/// KanGest («2026-11-25T10:30:00»).
pub(super) fn hora_local(iso: &str) -> Option<String> {
    let t = iso.trim();
    let d = chrono::DateTime::parse_from_rfc3339(t)
        .or_else(|_| chrono::DateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .ok()?;
    Some(d.with_timezone(&chrono::Local).format("%Y-%m-%dT%H:%M:%S").to_string())
}

/// Um valor em kwanzas do site (número ou texto) em cêntimos.
fn centimos(v: &Value) -> i64 {
    let kz = v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())).unwrap_or(0.0);
    (kz * 100.0).round() as i64
}

/// As vendas online da loja (o armazém do posto) entre `de` e `ate` que nenhum fecho incluiu ainda:
/// - os documentos de venda emitidos pela API (a loja online), sem caixa, com o sinal das notas de crédito; uma FR de
///   uma encomenda que um fecho já incluiu fica de fora (é o mesmo dinheiro);
/// - as encomendas pagas da cópia local da Loja online ainda sem FR, marcadas quando são pagas na entrega.
pub(super) async fn online(con: &mut SqliteConnection, armazem: Option<i64>, de: &str, ate: &str) -> AppResult<Vec<VendaOnline>> {
    let mut vendas = Vec::new();
    let Some(armazem) = armazem else { return Ok(vendas) };
    let docs = sqlx::query(
        "SELECT d.id, d.numero_doc, d.tipo_codigo, d.data_hora, d.entidade_nome, COALESCE(d.referencia, '') AS referencia,
                CASE WHEN t.credito = 1 THEN -d.total ELSE d.total END AS total,
                (SELECT group_concat(COALESCE(m.descricao, dp.modo_codigo), ', ') FROM documento_pagamentos dp
                   LEFT JOIN modos_pagamento m ON m.codigo = dp.modo_codigo WHERE dp.documento_id = d.id) AS pagamento
           FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
          WHERE d.api_chave_id IS NOT NULL AND d.caixa_sessao_id IS NULL AND d.estado <> 'A' AND d.importado = 0
            AND d.armazem_id = ?1 AND d.data_hora >= ?2 AND d.data_hora <= ?3
            AND t.grupo = 'VENDAS' AND (t.pago_no_acto = 1 OR t.credito = 1)
            AND NOT EXISTS (SELECT 1 FROM caixa_fecho_online o WHERE o.documento_id = d.id)
            AND NOT (t.credito = 0 AND COALESCE(d.referencia, '') <> ''
                     AND EXISTS (SELECT 1 FROM caixa_fecho_online o WHERE o.encomenda_numero = d.referencia))
          ORDER BY d.data_hora, d.id",
    )
    .bind(armazem)
    .bind(de)
    .bind(ate)
    .fetch_all(&mut *con)
    .await?;
    for r in &docs {
        let total: i64 = r.get("total");
        vendas.push(VendaOnline {
            documento_id: Some(r.get("id")),
            encomenda_id: None,
            encomenda_numero: String::new(),
            valor: total,
            linha: json!({
                "documento_id": r.get::<i64, _>("id"),
                "numero_doc": r.get::<String, _>("numero_doc"),
                "tipo": r.get::<String, _>("tipo_codigo"),
                "data_hora": r.get::<String, _>("data_hora"),
                "cliente": r.get::<Option<String>, _>("entidade_nome").unwrap_or_default(),
                "referencia": r.get::<String, _>("referencia"),
                "pagamento": r.get::<Option<String>, _>("pagamento").unwrap_or_default(),
                "total": total,
            }),
        });
    }
    // as encomendas: a hora do pagamento vem do site com o fuso, por isso o SQL só aproxima (um dia de margem) e a
    // conta certa faz-se aqui, na hora deste computador
    let encs = sqlx::query(
        "SELECT e.id, e.numero, e.cliente, e.total, e.dados FROM loja_encomendas e
          WHERE e.pagamento = 'paid' AND e.estado <> 'cancelled'
            AND COALESCE(json_extract(e.dados, '$.pago_em'), '') >= date(?1, '-1 day')
            AND COALESCE(json_extract(e.dados, '$.pago_em'), '') < date(?2, '+2 day')
            AND NOT EXISTS (SELECT 1 FROM caixa_fecho_online o WHERE o.encomenda_id = e.id)
            AND NOT (e.numero <> '' AND EXISTS (SELECT 1 FROM documentos d
                                                 WHERE d.referencia = e.numero AND d.tipo_codigo = 'FR' AND d.estado <> 'A'))
          ORDER BY e.numero",
    )
    .bind(de)
    .bind(ate)
    .fetch_all(&mut *con)
    .await?;
    for r in &encs {
        let dados: Value = serde_json::from_str(&r.get::<String, _>("dados")).unwrap_or(Value::Null);
        let Some(pago_em) = dados["pago_em"].as_str().and_then(hora_local) else { continue };
        if pago_em.as_str() < de || pago_em.as_str() > ate {
            continue;
        }
        let pago = centimos(&dados["pago"]);
        let valor = if pago > 0 { pago } else { (r.get::<f64, _>("total") * 100.0).round() as i64 };
        let metodo = dados["metodo_pagamento"].as_str().unwrap_or_default().trim().to_string();
        let id: String = r.get("id");
        let numero: String = r.get("numero");
        vendas.push(VendaOnline {
            documento_id: None,
            encomenda_id: Some(id.clone()),
            encomenda_numero: numero.clone(),
            valor,
            linha: json!({
                "encomenda_id": id,
                "numero": numero,
                "pago_em": pago_em,
                "cliente": r.get::<String, _>("cliente"),
                "canal": dados["canal"].as_str().unwrap_or_default(),
                "pagamento": metodo,
                "na_entrega": metodo.to_lowercase().contains("entrega"),
                "total": valor,
            }),
        });
    }
    Ok(vendas)
}

/// A secção «Vendas online» do relatório: os documentos e as encomendas, os totais por forma de pagamento e o total
/// (que não entra no numerário esperado da gaveta). `incluidas`: o fecho incluiu-as (no caixa aberto, o que vem
/// marcado).
pub(super) fn online_json(vendas: &[VendaOnline], incluidas: bool) -> Value {
    let mut por_modo: BTreeMap<String, i64> = BTreeMap::new();
    let (mut documentos, mut encomendas) = (Vec::new(), Vec::new());
    for v in vendas {
        let modo = v.linha["pagamento"].as_str().filter(|m| !m.trim().is_empty()).unwrap_or("Sem forma de pagamento").to_string();
        *por_modo.entry(modo).or_insert(0) += v.valor;
        if v.documento_id.is_some() {
            documentos.push(v.linha.clone());
        } else {
            encomendas.push(v.linha.clone());
        }
    }
    json!({
        "incluidas": incluidas,
        "documentos": documentos,
        "encomendas": encomendas,
        "por_modo": por_modo.into_iter().map(|(descricao, total)| json!({ "descricao": descricao, "total": total })).collect::<Vec<_>>(),
        "total": vendas.iter().map(|v| v.valor).sum::<i64>(),
        "na_entrega": vendas.iter().filter(|v| v.linha["na_entrega"] == true).map(|v| v.valor).sum::<i64>(),
        "quantidade": vendas.len(),
    })
}

/// Os dados da empresa para o cabeçalho do fecho (o arquivo fica completo, mesmo que a ficha da empresa mude depois).
async fn empresa(con: &mut SqliteConnection) -> AppResult<Value> {
    let r = sqlx::query("SELECT nome, designacao_comercial, nif, endereco, localidade, provincia, telefone, rodape FROM empresa WHERE id = 1")
        .fetch_optional(&mut *con)
        .await?;
    Ok(r.map(|r| db::row_json(&r)).unwrap_or(Value::Null))
}

/// O fecho arquivado: o id, o selo, o instantâneo e as vendas online que ele fechou.
pub(super) struct Arquivado {
    pub id: i64,
    pub selo: String,
    pub v: Value,
    pub vendas: Vec<VendaOnline>,
}

/// Arquiva o fecho da sessão `sid`, na transacção de quem chama (o fecho, ou o arquivo dos fechos antigos): calcula o
/// relatório, junta as vendas online (se as incluir) e a empresa, grava o instantâneo com o selo e as vendas online
/// que este Z fecha. Um fecho reconstruído não fecha vendas online (o arquivo é de hoje, não do dia do fecho).
pub(super) async fn arquivar(con: &mut SqliteConnection, sid: i64, incluir_online: bool, criado_por: Option<i64>, reconstruido: bool) -> AppResult<Arquivado> {
    let mut v = super::caixa::calcular(&mut *con, sid).await?;
    let incluir = incluir_online && !reconstruido;
    let vendas = if incluir {
        let s = &v["sessao"];
        let de = s["aberta_em"].as_str().unwrap_or_default().to_string();
        let ate = s["fechada_em"].as_str().map(str::to_string).unwrap_or_else(db::agora);
        online(&mut *con, s["armazem_id"].as_i64(), &de, &ate).await?
    } else {
        Vec::new()
    };
    v["online"] = online_json(&vendas, incluir);
    v["empresa"] = empresa(&mut *con).await?;
    v["reconstruido"] = json!(reconstruido);
    v["versao"] = json!(env!("CARGO_PKG_VERSION"));
    let texto = serde_json::to_string(&v)?;
    let selo = selo_de(&texto);
    let id = sqlx::query(
        "INSERT INTO caixa_fechos (sessao_id, posto_id, numero_z, instantaneo, selo, reconstruido, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(sid)
    .bind(v["sessao"]["posto_id"].as_i64())
    .bind(v["sessao"]["numero_z"].as_i64())
    .bind(&texto)
    .bind(&selo)
    .bind(reconstruido as i64)
    .bind(criado_por)
    .execute(&mut *con)
    .await?
    .last_insert_rowid();
    for venda in &vendas {
        sqlx::query("INSERT INTO caixa_fecho_online (fecho_id, documento_id, encomenda_id, encomenda_numero, valor) VALUES (?, ?, ?, ?, ?)")
            .bind(id)
            .bind(venda.documento_id)
            .bind(venda.encomenda_id.as_deref())
            .bind(&venda.encomenda_numero)
            .bind(venda.valor)
            .execute(&mut *con)
            .await?;
    }
    Ok(Arquivado { id, selo, v, vendas })
}

/// Arquiva um fecho que ainda não tem arquivo (importado depois de abrir a base), reconstruído com os valores de hoje.
pub(super) async fn arquivar_reconstruido(pool: &SqlitePool, sid: i64) -> AppResult<()> {
    let mut tx = db::transacao(pool).await?;
    let existe: Option<i64> = sqlx::query_scalar("SELECT id FROM caixa_fechos WHERE sessao_id = ?").bind(sid).fetch_optional(&mut *tx).await?;
    if existe.is_none() {
        arquivar(&mut tx, sid, false, None, true).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Os fechos sem arquivo (os de antes da 0062 e os importados do KIGEST): arquivados com os valores de agora e marcados
/// como reconstruídos, com uma linha na auditoria. Corre ao abrir a base (db.rs), a seguir às migrações; os que
/// entrarem depois (a importação automática) arquivam-se ao abrir o fecho.
pub(crate) async fn arquivar_antigos(pool: &SqlitePool) -> AppResult<usize> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT c.id FROM caixa_sessoes c WHERE c.estado = 'FECHADA' AND NOT EXISTS (SELECT 1 FROM caixa_fechos f WHERE f.sessao_id = c.id) ORDER BY c.id",
    )
    .fetch_all(pool)
    .await?;
    if ids.is_empty() {
        return Ok(0);
    }
    let mut tx = db::transacao(pool).await?;
    let mut n = 0;
    for sid in &ids {
        match arquivar(&mut tx, *sid, false, None, true).await {
            Ok(_) => n += 1,
            Err(e) => eprintln!("Fecho de caixa: a sessão {sid} não ficou arquivada ({e})."),
        }
    }
    tx.commit().await?;
    crate::auditoria::registar(
        pool,
        crate::auditoria::Linha {
            utilizador_id: None,
            acao: "ARQUIVAR_FECHOS",
            detalhe: &format!("{n} fecho(s) de caixa anteriores arquivados com os valores de hoje (reconstruídos)."),
            entidade: Some("caixa_fechos"),
            registo_id: None,
            antes: None,
            depois: None,
            posto_id: None,
            origem: "local",
        },
    )
    .await?;
    Ok(n)
}

/// As impressões de um fecho (as linhas da auditoria selada), como as dos documentos: quantas, a primeira e a última.
async fn impressoes(pool: &SqlitePool, fecho_id: i64) -> AppResult<Value> {
    let linhas = sqlx::query(
        "SELECT a.data_hora AS em, COALESCE(u.nome, '') AS utilizador, a.acao
           FROM auditoria a LEFT JOIN utilizadores u ON u.id = a.utilizador_id
          WHERE a.entidade = 'caixa_fechos' AND a.registo_id = ? AND a.acao IN ('IMPRIMIR_FECHO', 'REIMPRIMIR_FECHO')
          ORDER BY a.id",
    )
    .bind(fecho_id.to_string())
    .fetch_all(pool)
    .await?;
    let lista = match db::rows_json(&linhas) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    Ok(super::impressao::resumo_das_impressoes(lista))
}

/// O fecho arquivado da sessão `sid`: o instantâneo, mais o arquivo (o id, o selo e se ainda confere, se é
/// reconstruído, quando e por quem, as impressões e o nome do ficheiro). `None` se a sessão não tem arquivo.
pub(super) async fn obter(st: &AppState, sid: i64) -> AppResult<Option<Value>> {
    let Some(r) = sqlx::query(
        "SELECT f.id, f.instantaneo, f.selo, f.reconstruido, f.criado_em, u.nome AS criado_por
           FROM caixa_fechos f LEFT JOIN utilizadores u ON u.id = f.criado_por WHERE f.sessao_id = ?",
    )
    .bind(sid)
    .fetch_optional(&st.pool)
    .await?
    else {
        return Ok(None);
    };
    let id: i64 = r.get("id");
    let texto: String = r.get("instantaneo");
    let selo: String = r.get("selo");
    let mut v: Value = serde_json::from_str(&texto).map_err(|e| AppError::msg(format!("O arquivo do fecho n.º {id} não se lê: {e}")))?;
    let ficheiro = nome_do_ficheiro(&v);
    v["arquivo"] = json!({
        "id": id,
        "selo": selo,
        "selo_confere": selo_de(&texto) == selo,
        "reconstruido": r.get::<i64, _>("reconstruido") == 1,
        "criado_em": r.get::<String, _>("criado_em"),
        "criado_por": r.get::<Option<String>, _>("criado_por"),
        "impressoes": impressoes(&st.pool, id).await?,
        "ficheiro": ficheiro,
    });
    Ok(Some(v))
}

#[derive(Deserialize)]
pub struct ImpressaoIn {
    /// a sessão do fecho
    id: i64,
    /// talao58 | talao80 | a4
    #[serde(default)]
    formato: String,
}

/// Regista uma impressão do fecho na auditoria selada (antes de imprimir): a primeira é a do fecho; as seguintes são
/// 2.ª via. Devolve as impressões e se esta é 2.ª via.
pub async fn impressao(st: &AppState, i: ImpressaoIn) -> AppResult<Value> {
    st.sessao()?;
    let fecho: Option<(i64, Option<i64>)> = sqlx::query_as("SELECT id, numero_z FROM caixa_fechos WHERE sessao_id = ?").bind(i.id).fetch_optional(&st.pool).await?;
    let (id, z) = fecho.ok_or_else(|| AppError::msg("Este caixa ainda não foi fechado."))?;
    let antes = impressoes(&st.pool, id).await?;
    let segunda = antes["total"].as_i64().unwrap_or(0) > 0;
    let formato: String = i.formato.chars().filter(|c| c.is_ascii_alphanumeric()).take(10).collect();
    let z = z.map(|n| format!("Z n.º {n}")).unwrap_or_else(|| format!("da sessão {}", i.id));
    super::auditoria::registar_evento(
        st,
        if segunda { "REIMPRIMIR_FECHO" } else { "IMPRIMIR_FECHO" },
        "caixa_fechos",
        id,
        &format!("{} do fecho {z}{}", if segunda { "2.ª via" } else { "Impressão" }, if formato.is_empty() { String::new() } else { format!(" ({formato})") }),
        Some(&json!({ "segunda_via": segunda, "formato": formato })),
    )
    .await?;
    let mut r = impressoes(&st.pool, id).await?;
    r["segunda_via"] = json!(segunda);
    Ok(r)
}

/// O ficheiro do fecho para gravar à mão neste computador («Guardar outra vez»: o ecrã grava-o com sistema.exportar,
/// que corre no próprio computador numa rede de postos).
pub async fn ficheiro(st: &AppState, i: IdIn) -> AppResult<Value> {
    st.sessao()?;
    let v = obter(st, i.id).await?.ok_or_else(|| AppError::msg("Este caixa ainda não foi fechado."))?;
    Ok(json!({ "nome": nome_do_ficheiro(&v), "conteudo": html(&v) }))
}

/// Grava o documento do fecho na pasta dos documentos, em «Fechos de caixa» (no computador que o arquiva: numa rede de
/// postos, o servidor). Devolve o caminho.
pub(super) fn guardar_ficheiro(st: &AppState, v: &Value) -> AppResult<String> {
    let caminho = st.pasta_de("fechos").join(nome_do_ficheiro(v));
    std::fs::write(&caminho, html(v)).map_err(|e| AppError::msg(format!("Não foi possível gravar {}: {e}", caminho.display())))?;
    Ok(caminho.display().to_string())
}

/// «Fecho Z-12 Caixa 1 2026-11-25.html», só com letras, algarismos, espaços, «-», «_» e «.» (como sistema.exportar).
pub(super) fn nome_do_ficheiro(v: &Value) -> String {
    let s = &v["sessao"];
    let z = s["numero_z"].as_i64().map(|n| format!("Z-{n}")).unwrap_or_else(|| format!("sessão {}", s["id"].as_i64().unwrap_or(0)));
    let posto = s["posto"].as_str().filter(|p| !p.trim().is_empty()).unwrap_or("Posto");
    let data = s["fechada_em"].as_str().or_else(|| s["aberta_em"].as_str()).and_then(|d| d.get(..10)).unwrap_or_default();
    let nome: String = format!("Fecho {z} {posto} {data}")
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') { c } else { '_' })
        .collect();
    format!("{}.html", nome.split_whitespace().collect::<Vec<_>>().join(" "))
}

// ------------------------------------------------------------------ o documento do fecho (HTML pronto a imprimir)

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn txt<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or_default()
}

fn kz(v: &Value) -> String {
    v.as_i64().map(crate::agt::valor_pt).unwrap_or_else(|| "—".into())
}

/// «2026-11-25T10:30:00» → «25/11/2026 10:30».
fn data_hora(s: &str) -> String {
    match (s.get(..4), s.get(5..7), s.get(8..10), s.get(11..16)) {
        (Some(a), Some(m), Some(d), Some(h)) => format!("{d}/{m}/{a} {h}"),
        (Some(a), Some(m), Some(d), None) => format!("{d}/{m}/{a}"),
        _ => s.to_string(),
    }
}

fn quantidade(v: &Value) -> String {
    let q = v.as_f64().unwrap_or(0.0);
    if q.fract() == 0.0 {
        format!("{}", q as i64)
    } else {
        format!("{q:.3}").trim_end_matches('0').replace('.', ",")
    }
}

fn linha(rotulo: &str, valor: &str, forte: bool) -> String {
    let c = if forte { " class=\"forte\"" } else { "" };
    format!("<tr{c}><td>{}</td><td class=\"n\">{}</td></tr>", esc(rotulo), esc(valor))
}

/// O relatório Z como documento: o mesmo que o ecrã mostra, numa página A4, com o selo e a marca de reconstruído.
pub(super) fn html(v: &Value) -> String {
    let s = &v["sessao"];
    let e = &v["empresa"];
    let a = &v["arquivo"];
    let mut h = String::with_capacity(16 * 1024);
    let titulo = nome_do_ficheiro(v);
    let titulo = titulo.trim_end_matches(".html");
    h.push_str(&format!(
        "<!doctype html><html lang=\"pt\"><head><meta charset=\"utf-8\"><title>{}</title><style>\
         @page{{size:A4;margin:12mm}}body{{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#111;margin:0 auto;max-width:760px}}\
         h1{{font-size:17px;margin:14px 0 6px}}h2{{font-size:13px;margin:16px 0 4px;border-bottom:1px solid #111;padding-bottom:2px}}\
         table{{width:100%;border-collapse:collapse}}td,th{{padding:2px 4px;text-align:left;vertical-align:top}}th{{border-bottom:1px solid #999}}\
         .n{{text-align:right;white-space:nowrap}}.forte td{{font-weight:bold}}.cab{{display:flex;justify-content:space-between;gap:12px}}\
         .nota{{color:#555;font-size:10.5px}}.anulado td{{color:#888;text-decoration:line-through}}.aviso{{border:1px solid #b45309;color:#b45309;padding:4px 6px;margin:8px 0}}\
         .online{{border:1px solid #0a748f;border-radius:6px;padding:4px 8px;margin-top:16px}}.online h2{{border-color:#0a748f;color:#0a748f}}\
         footer{{margin-top:18px;border-top:1px solid #999;padding-top:4px;color:#555;font-size:10px;word-break:break-all}}\
         </style></head><body>",
        esc(titulo)
    ));
    // cabeçalho: a empresa e o número do fecho
    let nome_empresa = [txt(e, "designacao_comercial"), txt(e, "nome")].into_iter().find(|x| !x.trim().is_empty()).unwrap_or_default();
    let morada = [txt(e, "endereco"), txt(e, "localidade"), txt(e, "provincia")].into_iter().filter(|x| !x.trim().is_empty()).collect::<Vec<_>>().join(", ");
    h.push_str("<div class=\"cab\"><div>");
    h.push_str(&format!("<strong style=\"font-size:14px\">{}</strong>", esc(nome_empresa)));
    if !morada.is_empty() {
        h.push_str(&format!("<br>{}", esc(&morada)));
    }
    if !txt(e, "nif").is_empty() {
        h.push_str(&format!("<br>NIF: {}", esc(txt(e, "nif"))));
    }
    if !txt(e, "telefone").is_empty() {
        h.push_str(&format!("<br>Tel. {}", esc(txt(e, "telefone"))));
    }
    h.push_str("</div></div>");
    let z = s["numero_z"].as_i64().map(|n| n.to_string()).unwrap_or_else(|| s["id"].as_i64().unwrap_or(0).to_string());
    h.push_str(&format!("<h1>FECHO DE CAIXA (Z) N.º {}</h1>", esc(&z)));
    if a["reconstruido"] == true || v["reconstruido"] == true {
        h.push_str("<p class=\"aviso\">Reconstruído: este fecho é de antes do arquivo dos fechos e foi refeito com os valores do dia em que se arquivou.</p>");
    }
    h.push_str("<table>");
    h.push_str(&linha("Abertura", &data_hora(txt(s, "aberta_em")), false));
    h.push_str(&linha("Fecho", &data_hora(txt(s, "fechada_em")), false));
    if !txt(s, "armazem").is_empty() {
        h.push_str(&linha("Armazém", txt(s, "armazem"), false));
    }
    h.push_str(&linha("Posto", txt(s, "posto"), false));
    h.push_str(&linha("Operador", txt(s, "utilizador"), false));
    if !txt(s, "fechado_por").is_empty() && txt(s, "fechado_por") != txt(s, "utilizador") {
        h.push_str(&linha("Fechado por", txt(s, "fechado_por"), false));
    }
    h.push_str("</table>");
    // os recebimentos por forma de pagamento e os totais
    h.push_str("<h2>Recebimentos por forma de pagamento</h2><table>");
    for m in v["por_modo"].as_array().into_iter().flatten() {
        h.push_str(&linha(txt(m, "descricao"), &kz(&m["total"]), false));
    }
    h.push_str("</table><table style=\"margin-top:6px\">");
    let n_docs = v["documentos"].as_i64().unwrap_or(0);
    h.push_str(&linha(&format!("Total de {n_docs} documento(s)"), &kz(&v["total_vendido"]), true));
    h.push_str(&linha("Fundo de maneio", &kz(&s["valor_inicial"]), false));
    h.push_str(&linha("Entradas", &kz(&v["entradas"]), false));
    h.push_str(&linha("Saídas", &kz(&v["saidas"]), false));
    h.push_str(&linha("Numerário esperado", &kz(&v["numerario_esperado"]), true));
    for m in v["moedas_estrangeiras"].as_array().into_iter().flatten() {
        let valor = m["valor"].as_f64().unwrap_or(0.0) / 100.0;
        h.push_str(&linha(&format!("Em {} (na gaveta)", txt(m, "moeda")), &format!("{valor:.2} {}", txt(m, "moeda")), false));
    }
    h.push_str(&linha("Valor físico", &kz(&s["valor_contado"]), true));
    if let (Some(c), Some(esp)) = (s["valor_contado"].as_i64(), v["numerario_esperado"].as_i64()) {
        let d = c - esp;
        let r = if d < 0 { "Diferença (falta)" } else if d > 0 { "Diferença (sobra)" } else { "Diferença" };
        h.push_str(&linha(r, &crate::agt::valor_pt(d), true));
    }
    h.push_str("</table>");
    if let Some(c) = s["contagem"].as_object().filter(|c| !c.is_empty()) {
        h.push_str("<h2>Contagem do numerário</h2><table>");
        let mut notas: Vec<(i64, i64)> = c.iter().map(|(k, q)| (k.parse().unwrap_or(0), q.as_i64().unwrap_or(0))).collect();
        notas.sort_by(|x, y| y.0.cmp(&x.0));
        for (face, q) in notas {
            h.push_str(&linha(&format!("{face} Kz × {q}"), &crate::agt::valor_pt(face * 100 * q), false));
        }
        h.push_str("</table>");
    }
    let conf: Vec<&Value> = v["conferencia"].as_array().into_iter().flatten().filter(|c| c["codigo"] != "NU" && !c["contado"].is_null()).collect();
    if !conf.is_empty() {
        h.push_str("<h2>Conferência (contado − sistema)</h2><table>");
        for c in conf {
            h.push_str(&linha(&format!("{}: {}", txt(c, "descricao"), kz(&c["contado"])), &kz(&c["diferenca"]), c["diferenca"].as_i64() != Some(0)));
        }
        h.push_str("</table>");
    }
    if !txt(s, "observacoes").is_empty() {
        h.push_str(&format!("<p>Obs.: {}</p>", esc(txt(s, "observacoes"))));
    }
    // os artigos vendidos (as devoluções abatem) e os documentos da sessão
    let artigos = v["artigos"].as_array().cloned().unwrap_or_default();
    if !artigos.is_empty() {
        h.push_str("<h2>Artigos vendidos</h2><table><tr><th>Referência</th><th>Descrição</th><th class=\"n\">Qtd.</th><th class=\"n\">Total</th></tr>");
        for l in &artigos {
            h.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td class=\"n\">{}</td><td class=\"n\">{}</td></tr>",
                esc(txt(l, "referencia")),
                esc(txt(l, "descricao")),
                quantidade(&l["quantidade"]),
                esc(&kz(&l["total"]))
            ));
        }
        h.push_str("</table>");
    }
    let lista = v["documentos_lista"].as_array().cloned().unwrap_or_default();
    if !lista.is_empty() {
        h.push_str("<h2>Documentos da sessão</h2><table><tr><th>Documento</th><th>Hora</th><th>Cliente</th><th>Pagamento</th><th class=\"n\">Total</th></tr>");
        for d in &lista {
            let anulado = txt(d, "estado") == "A";
            h.push_str(&format!(
                "<tr{}><td>{}{}</td><td>{}</td><td>{}</td><td>{}</td><td class=\"n\">{}</td></tr>",
                if anulado { " class=\"anulado\"" } else { "" },
                esc(txt(d, "numero_doc")),
                if anulado { " (anulado)" } else { "" },
                esc(txt(d, "data_hora").get(11..16).unwrap_or_default()),
                esc(txt(d, "cliente")),
                esc(txt(d, "pagamento")),
                esc(&kz(&d["total"]))
            ));
        }
        h.push_str("</table>");
    }
    let movs = v["movimentos"].as_array().cloned().unwrap_or_default();
    if !movs.is_empty() {
        h.push_str("<h2>Movimentos de caixa</h2><table>");
        for m in &movs {
            let saida = txt(m, "tipo") == "SAIDA";
            let valor = m["valor"].as_i64().map(|x| crate::agt::valor_pt(if saida { -x } else { x })).unwrap_or_default();
            h.push_str(&format!(
                "<tr><td>{}</td><td>Vale n.º {} — {}</td><td class=\"n\">{}</td></tr>",
                esc(&data_hora(txt(m, "data_hora"))),
                m["id"].as_i64().unwrap_or(0),
                esc(txt(m, "descricao")),
                esc(&valor)
            ));
        }
        h.push_str("</table>");
    }
    // as vendas online, à parte: não contam para a gaveta
    let o = &v["online"];
    if o["incluidas"] == true && o["quantidade"].as_i64().unwrap_or(0) > 0 {
        h.push_str("<div class=\"online\"><h2>Vendas online</h2><p class=\"nota\">Os documentos da loja online e as encomendas pagas no site para esta loja. O dinheiro não passou pela gaveta: não contam para o numerário esperado.</p><table>");
        for d in o["documentos"].as_array().into_iter().flatten() {
            h.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td class=\"n\">{}</td></tr>",
                esc(txt(d, "numero_doc")),
                esc(txt(d, "cliente")),
                esc(txt(d, "pagamento")),
                esc(&kz(&d["total"]))
            ));
        }
        for d in o["encomendas"].as_array().into_iter().flatten() {
            let entrega = if d["na_entrega"] == true { " (paga na entrega)" } else { "" };
            h.push_str(&format!(
                "<tr><td>Encomenda {}</td><td>{}</td><td>{}{}</td><td class=\"n\">{}</td></tr>",
                esc(txt(d, "numero")),
                esc(txt(d, "cliente")),
                esc(txt(d, "pagamento")),
                entrega,
                esc(&kz(&d["total"]))
            ));
        }
        h.push_str("</table><table style=\"margin-top:6px\">");
        for m in o["por_modo"].as_array().into_iter().flatten() {
            h.push_str(&linha(txt(m, "descricao"), &kz(&m["total"]), false));
        }
        if o["na_entrega"].as_i64().unwrap_or(0) != 0 {
            h.push_str(&linha("Das quais pagas na entrega", &kz(&o["na_entrega"]), false));
        }
        h.push_str(&linha(&format!("Total online ({} venda(s))", o["quantidade"].as_i64().unwrap_or(0)), &kz(&o["total"]), true));
        h.push_str("</table></div>");
    }
    if !txt(e, "rodape").is_empty() {
        h.push_str(&format!("<p style=\"text-align:center\">{}</p>", esc(txt(e, "rodape"))));
    }
    h.push_str(&format!(
        "<footer>Arquivado em {} · KanGest Livraria {} · Selo SHA-256 do arquivo: {}</footer></body></html>",
        esc(&data_hora(txt(a, "criado_em"))),
        esc(txt(v, "versao")),
        esc(txt(a, "selo"))
    ));
    h
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nome_do_ficheiro_limpo_com_o_z_o_posto_e_a_data() {
        let v = json!({ "sessao": { "id": 7, "numero_z": 12, "posto": "Caixa #1 / loja", "fechada_em": "2026-11-25T18:30:00" } });
        assert_eq!(nome_do_ficheiro(&v), "Fecho Z-12 Caixa _1 _ loja 2026-11-25.html");
        let sem_z = json!({ "sessao": { "id": 7, "aberta_em": "2026-11-20T08:00:00" } });
        assert_eq!(nome_do_ficheiro(&sem_z), "Fecho sessão 7 Posto 2026-11-20.html");
    }

    #[test]
    fn o_selo_e_o_sha256_do_texto() {
        assert_eq!(selo_de(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_ne!(selo_de("{\"a\":1}"), selo_de("{\"a\":2}"));
    }

    #[test]
    fn a_hora_do_site_passa_para_a_hora_local() {
        let agora = chrono::Local::now();
        let iso = agora.to_rfc3339();
        assert_eq!(hora_local(&iso).unwrap(), agora.format("%Y-%m-%dT%H:%M:%S").to_string());
        assert!(hora_local("2026-11-25 09:30:00.5+00").is_some(), "como o Postgres escreve sem os minutos do fuso");
        assert!(hora_local("ontem").is_none());
        assert_eq!(centimos(&json!(1140.5)), 114050);
        assert_eq!(centimos(&json!("2500")), 250000);
    }

    #[test]
    fn o_documento_escapa_os_nomes_e_marca_o_reconstruido() {
        let v = json!({
            "sessao": { "id": 1, "numero_z": 3, "posto": "Caixa 1", "utilizador": "Ana", "aberta_em": "2026-11-25T08:00:00",
                        "fechada_em": "2026-11-25T18:00:00", "valor_inicial": 0, "valor_contado": 1000 },
            "empresa": { "nome": "Loja <Teste>" },
            "por_modo": [], "documentos": 1, "total_vendido": 1000, "entradas": 0, "saidas": 0, "numerario_esperado": 1000,
            "documentos_lista": [{ "numero_doc": "FR A/1", "cliente": "<script>", "total": 1000, "estado": "N", "data_hora": "2026-11-25T09:00:00" }],
            "online": { "incluidas": true, "quantidade": 1, "total": 500, "na_entrega": 500, "documentos": [],
                        "encomendas": [{ "numero": "LIV-9", "cliente": "Rui", "pagamento": "Pagamento na entrega", "na_entrega": true, "total": 500 }],
                        "por_modo": [{ "descricao": "Pagamento na entrega", "total": 500 }] },
            "arquivo": { "reconstruido": true, "selo": "abc", "criado_em": "2026-11-25T18:00:00" },
        });
        let h = html(&v);
        assert!(h.contains("FECHO DE CAIXA (Z) N.º 3") && h.contains("Loja &lt;Teste&gt;") && h.contains("&lt;script&gt;"));
        assert!(!h.contains("<script>"));
        assert!(h.contains("Reconstruído") && h.contains("Vendas online") && h.contains("(paga na entrega)") && h.contains("Selo SHA-256 do arquivo: abc"));
    }
}
