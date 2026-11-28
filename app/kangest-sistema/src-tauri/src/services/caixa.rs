// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Row, SqliteConnection};

use super::catalogo::IdIn;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

async fn sessao_aberta(st: &AppState) -> AppResult<Option<i64>> {
    Ok(sqlx::query_scalar("SELECT id FROM caixa_sessoes WHERE posto_id = ? AND estado = 'ABERTA' ORDER BY id DESC LIMIT 1")
        .bind(st.posto().id)
        .fetch_optional(&st.pool)
        .await?)
}

/// O relatório de uma sessão calculado agora, na ligação dada: uma do pool (o caixa aberto, o X) ou a transacção do
/// fecho (o Z que fica arquivado, services/caixa_fechos.rs). Sem o fecho cego nem as vendas online: quem chama
/// acrescenta-os.
pub(super) async fn calcular(con: &mut SqliteConnection, sid: i64) -> AppResult<Value> {
    let s = sqlx::query(
        "SELECT c.*, u.nome AS utilizador, ps.descricao AS posto, ps.armazem_id AS armazem_id, a.nome AS armazem, uf.nome AS fechado_por
         FROM caixa_sessoes c JOIN utilizadores u ON u.id = c.utilizador_id LEFT JOIN postos ps ON ps.id = c.posto_id
         LEFT JOIN armazens a ON a.id = ps.armazem_id LEFT JOIN utilizadores uf ON uf.id = c.fechada_por WHERE c.id = ?",
    )
    .bind(sid)
    .fetch_optional(&mut *con)
    .await?
    .ok_or(AppError::NaoEncontrado)?;
    let por_modo = sqlx::query(
        // parte dos documentos da sessão (índice por sessão); ao contrário, o SQLite indexava todos os pagamentos
        "SELECT m.codigo, m.descricao, COALESCE(x.total, 0) AS total
         FROM modos_pagamento m
         LEFT JOIN (SELECT dp.modo_codigo, SUM(dp.valor) AS total
                    FROM documentos d JOIN documento_pagamentos dp ON dp.documento_id = d.id
                    WHERE d.caixa_sessao_id = ?1 AND d.estado = 'N' GROUP BY dp.modo_codigo) x ON x.modo_codigo = m.codigo
         ORDER BY m.ordem",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let (docs, vendido): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM documentos WHERE caixa_sessao_id = ? AND estado = 'N' AND tipo_codigo IN ('FR','RC')",
    )
    .bind(sid)
    .fetch_one(&mut *con)
    .await?;
    let (entradas, saidas): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN valor END), 0), COALESCE(SUM(CASE WHEN tipo='SAIDA' THEN valor END), 0)
         FROM caixa_movimentos WHERE sessao_id = ? AND COALESCE(modo_codigo, 'NU') = 'NU'",
    )
    .bind(sid)
    .fetch_one(&mut *con)
    .await?;
    let movimentos = sqlx::query("SELECT * FROM caixa_movimentos WHERE sessao_id = ? ORDER BY id").bind(sid).fetch_all(&mut *con).await?;
    // Artigos vendidos na sessão (o talão de fecho do KIGEST lista-os), com o sinal das notas de crédito: uma
    // devolução abate a quantidade e o valor do artigo
    let artigos = sqlx::query(
        "SELECT l.referencia, l.descricao,
                SUM(CASE WHEN t.credito = 1 THEN -l.quantidade ELSE l.quantidade END) AS quantidade,
                SUM(CASE WHEN t.credito = 1 THEN -l.total ELSE l.total END) AS total
         FROM documento_linhas l JOIN documentos d ON d.id = l.documento_id JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'
         GROUP BY l.referencia, l.descricao ORDER BY total DESC",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    // os documentos da sessão, um a um: o número, o cliente, o total (com o sinal das notas de crédito) e como se pagou
    let lista = sqlx::query(
        "SELECT d.id, d.numero_doc, d.tipo_codigo, d.data_hora, d.entidade_nome AS cliente, d.estado,
                CASE WHEN t.credito = 1 THEN -d.total ELSE d.total END AS total,
                (SELECT group_concat(COALESCE(m.descricao, dp.modo_codigo), ', ') FROM documento_pagamentos dp
                   LEFT JOIN modos_pagamento m ON m.codigo = dp.modo_codigo WHERE dp.documento_id = d.id) AS pagamento
         FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? ORDER BY d.data_hora, d.id",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    // numerário recebido noutras moedas: fica na gaveta em dólares/euros, não em kwanzas; o troco desses
    // pagamentos saiu dos kwanzas (Kz na gaveta = numerário líquido − equivalente bruto do que entrou em moeda)
    let estrangeiras = sqlx::query(
        "SELECT dp.moeda, SUM(dp.valor_moeda) AS valor, CAST(SUM(ROUND(dp.valor_moeda * dp.cambio)) AS INTEGER) AS kz
         FROM documentos d JOIN documento_pagamentos dp ON dp.documento_id = d.id
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND dp.moeda IS NOT NULL GROUP BY dp.moeda ORDER BY dp.moeda",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let analise = analise_da_sessao(&mut *con, sid).await?;
    let em_moeda_kz: i64 = estrangeiras.iter().map(|r| r.get::<i64, _>("kz")).sum();
    let numerario: i64 = por_modo.iter().filter(|r| r.get::<String, _>("codigo") == "NU").map(|r| r.get::<i64, _>("total")).sum::<i64>() - em_moeda_kz;
    let inicial: i64 = s.get("valor_inicial");
    let esperado = inicial + numerario + entradas - saidas;
    let aberta = s.get::<String, _>("estado") == "ABERTA";
    let mut sessao = db::row_json(&s);
    for k in ["contagem", "contado_modos"] {
        if let Some(v) = sessao.get(k).and_then(|v| v.as_str()).and_then(|t| serde_json::from_str::<Value>(t).ok()) {
            sessao[k] = v;
        }
    }
    // conferência do fecho: o esperado de cada forma de pagamento face ao contado
    let contados = sessao["contado_modos"].clone();
    let conferencia: Vec<Value> = if aberta {
        Vec::new()
    } else {
        por_modo
            .iter()
            .filter_map(|r| {
                let codigo: String = r.get("codigo");
                let total: i64 = r.get("total");
                let (esp, cont) = if codigo == "NU" {
                    (esperado, s.get::<Option<i64>, _>("valor_contado"))
                } else {
                    (total, contados.get(&codigo).and_then(|v| v.as_i64()))
                };
                (codigo == "NU" || total != 0 || cont.is_some()).then(|| {
                    json!({ "codigo": codigo, "descricao": r.get::<String, _>("descricao"), "esperado": esp, "contado": cont, "diferenca": cont.map(|c| c - esp) })
                })
            })
            .collect()
    };
    Ok(json!({
        "sessao": sessao,
        "por_modo": db::rows_json(&por_modo),
        "documentos": docs,
        "documentos_lista": db::rows_json(&lista),
        "total_vendido": vendido,
        "entradas": entradas,
        "saidas": saidas,
        "movimentos": db::rows_json(&movimentos),
        "artigos": db::rows_json(&artigos),
        "numerario_esperado": esperado,
        "moedas_estrangeiras": db::rows_json(&estrangeiras),
        "conferencia": conferencia,
        "analise": analise,
        "cego": false,
    }))
}

/// As análises do relatório completo do fecho (pedido do dono a 27/11: «refinar o fecho da caixa com relatórios
/// extensivos e arquivar»):
/// - o resumo das vendas (quantas, quanto, as devoluções, os descontos, a primeira e a última);
/// - as vendas por tipo de documento (com os anulados), por operador, por hora e por família;
/// - o IVA por taxa;
/// - os documentos anulados, com o motivo.
///
/// As notas de crédito abatem. Ficam no instantâneo do Z (arquivado e selado), no documento A4 do arquivo e no resumo
/// que segue para o site. Não levam os nomes dos clientes.
async fn analise_da_sessao(con: &mut SqliteConnection, sid: i64) -> AppResult<Value> {
    let resumo = sqlx::query(
        "SELECT COALESCE(SUM(CASE WHEN t.credito = 0 THEN 1 ELSE 0 END), 0) AS vendas,
                COALESCE(SUM(CASE WHEN t.credito = 0 THEN d.total ELSE 0 END), 0) AS vendido,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN 1 ELSE 0 END), 0) AS devolucoes,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN d.total ELSE 0 END), 0) AS devolvido,
                COALESCE(SUM(CASE WHEN t.credito = 0 AND d.total_desconto > 0 THEN 1 ELSE 0 END), 0) AS com_desconto,
                COALESCE(SUM(CASE WHEN t.credito = 0 THEN d.total_desconto ELSE 0 END), 0) AS descontos,
                MIN(d.data_hora) AS primeira, MAX(d.data_hora) AS ultima
         FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'",
    )
    .bind(sid)
    .fetch_one(&mut *con)
    .await?;
    let por_tipo = sqlx::query(
        "SELECT d.tipo_codigo AS codigo, t.descricao,
                COALESCE(SUM(CASE WHEN d.estado <> 'A' THEN 1 ELSE 0 END), 0) AS documentos,
                COALESCE(SUM(CASE WHEN d.estado = 'A' THEN 1 ELSE 0 END), 0) AS anulados,
                COALESCE(SUM(CASE WHEN d.estado <> 'A' THEN CASE WHEN t.credito = 1 THEN -d.total ELSE d.total END ELSE 0 END), 0) AS total
         FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? GROUP BY d.tipo_codigo, t.descricao ORDER BY MIN(t.ordem), d.tipo_codigo",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let por_operador = sqlx::query(
        "SELECT COALESCE(u.nome, '—') AS nome, COUNT(*) AS documentos,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN -d.total ELSE d.total END), 0) AS total
         FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo LEFT JOIN utilizadores u ON u.id = d.utilizador_id
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'
         GROUP BY d.utilizador_id, u.nome ORDER BY total DESC",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let por_hora = sqlx::query(
        "SELECT substr(d.data_hora, 12, 2) AS hora, COUNT(*) AS documentos,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN -d.total ELSE d.total END), 0) AS total
         FROM documentos d JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'
         GROUP BY substr(d.data_hora, 12, 2) ORDER BY hora",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let por_familia = sqlx::query(
        "SELECT COALESCE(f.descricao, 'Sem família') AS familia,
                SUM(CASE WHEN t.credito = 1 THEN -l.quantidade ELSE l.quantidade END) AS quantidade,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN -l.total ELSE l.total END), 0) AS total
         FROM documento_linhas l JOIN documentos d ON d.id = l.documento_id JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         LEFT JOIN artigos a ON a.id = l.artigo_id LEFT JOIN familias f ON f.id = a.familia_id
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'
         GROUP BY COALESCE(f.descricao, 'Sem família') ORDER BY total DESC",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let iva = sqlx::query(
        "SELECT l.taxa_iva_pct AS taxa, COALESCE(l.motivo_isencao, '') AS motivo_isencao,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN -l.valor_liquido ELSE l.valor_liquido END), 0) AS base,
                COALESCE(SUM(CASE WHEN t.credito = 1 THEN -l.valor_iva ELSE l.valor_iva END), 0) AS iva
         FROM documento_linhas l JOIN documentos d ON d.id = l.documento_id JOIN tipos_documento t ON t.codigo = d.tipo_codigo
         WHERE d.caixa_sessao_id = ? AND d.estado = 'N' AND t.classe = 'VENDA'
         GROUP BY l.taxa_iva_pct, COALESCE(l.motivo_isencao, '') ORDER BY l.taxa_iva_pct DESC",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    let anulados = sqlx::query(
        "SELECT d.numero_doc, d.data_hora, d.total, COALESCE(d.motivo_anulacao, '') AS motivo
         FROM documentos d WHERE d.caixa_sessao_id = ? AND d.estado = 'A' ORDER BY d.data_hora, d.id",
    )
    .bind(sid)
    .fetch_all(&mut *con)
    .await?;
    Ok(json!({
        "resumo": db::row_json(&resumo),
        "por_tipo": db::rows_json(&por_tipo),
        "por_operador": db::rows_json(&por_operador),
        "por_hora": db::rows_json(&por_hora),
        "por_familia": db::rows_json(&por_familia),
        "iva": db::rows_json(&iva),
        "anulados": db::rows_json(&anulados),
    }))
}

/// O relatório de uma sessão como está agora (o X do caixa aberto; num fecho sem arquivo, os valores de hoje). Com o
/// caixa aberto, leva também as vendas online que o fecho incluiria e, no fecho cego, esconde os totais.
pub(crate) async fn resumo(st: &AppState, sid: i64) -> AppResult<Value> {
    let mut con = st.pool.acquire().await?;
    let mut v = calcular(&mut con, sid).await?;
    let aberta = v["sessao"]["estado"] == "ABERTA";
    if aberta {
        // as vendas online que o fecho incluiria (à parte: o dinheiro não passou pela gaveta); quem fecha decide no
        // diálogo, e a opção do posto diz o que vem marcado
        let armazem = v["sessao"]["armazem_id"].as_i64();
        let desde = v["sessao"]["aberta_em"].as_str().unwrap_or_default().to_string();
        let vendas = super::caixa_fechos::online(&mut con, armazem, &desde, &db::agora()).await?;
        v["online"] = super::caixa_fechos::online_json(&vendas, fecho_online(st));
    }
    drop(con);
    // fecho cego: com o caixa aberto, quem conta não vê o que o sistema espera
    if aberta && fecho_cego(st) && !st.sessao().map(|u| u.tem("caixa.ver_totais")).unwrap_or(false) {
        v["cego"] = json!(true);
        v["numerario_esperado"] = Value::Null;
        v["total_vendido"] = Value::Null;
        v["artigos"] = json!([]);
        v["documentos_lista"] = json!([]);
        v["moedas_estrangeiras"] = json!([]);
        v["analise"] = json!({});
        if let Some(modos) = v["por_modo"].as_array_mut() {
            for m in modos {
                m["total"] = Value::Null;
            }
        }
        // as vendas online também: só fica o que vem marcado
        v["online"] = json!({ "incluidas": fecho_online(st), "cego": true });
    }
    Ok(v)
}

/// O posto fecha o caixa às cegas (opção do posto «Fecho de caixa cego»).
fn fecho_cego(st: &AppState) -> bool {
    st.posto().opcoes.get("fecho_cego").and_then(|v| v.as_bool()).unwrap_or(false)
}

/// O fecho inclui as vendas online da loja (opção do posto «Incluir as vendas online no fecho»; ligada por omissão).
/// Ao lado, quem fecha escolhe no diálogo só para esse fecho (`FecharIn::incluir_online`).
fn fecho_online(st: &AppState) -> bool {
    st.posto().opcoes.get("fecho_online").and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Notas e moedas de kwanza aceites na contagem.
pub const DENOMINACOES: [i64; 12] = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    match sessao_aberta(st).await? {
        Some(id) => resumo(st, id).await,
        None => Ok(Value::Null),
    }
}

/// Uma sessão para ver ou reimprimir: um fecho lê o arquivo (o Z como ficou no fecho, services/caixa_fechos.rs); o
/// caixa aberto, o X de agora.
pub async fn obter(st: &AppState, i: IdIn) -> AppResult<Value> {
    st.sessao()?;
    if let Some(v) = super::caixa_fechos::obter(st, i.id).await? {
        return Ok(v);
    }
    // um fecho ainda sem arquivo (importado do KIGEST depois de abrir a base): arquiva-se já, reconstruído
    let estado: Option<String> = sqlx::query_scalar("SELECT estado FROM caixa_sessoes WHERE id = ?").bind(i.id).fetch_optional(&st.pool).await?;
    if estado.as_deref() == Some("FECHADA") {
        super::caixa_fechos::arquivar_reconstruido(&st.pool, i.id).await?;
        if let Some(v) = super::caixa_fechos::obter(st, i.id).await? {
            return Ok(v);
        }
    }
    resumo(st, i.id).await
}

/// Filtros do histórico dos fechos: as datas (AAAA-MM-DD), o posto e o n.º Z.
#[derive(Deserialize, Default)]
pub struct SessoesIn {
    #[serde(default)]
    de: Option<String>,
    #[serde(default)]
    ate: Option<String>,
    #[serde(default)]
    posto_id: Option<i64>,
    #[serde(default)]
    numero: Option<i64>,
}

/// Fechos de caixa (menu "Fechos de Caixa (POS)" do GC), com o arquivo de cada um. O vendido de um fecho arquivado é o
/// do arquivo.
pub async fn sessoes(st: &AppState, f: SessoesIn) -> AppResult<Value> {
    st.sessao()?;
    let data = |d: Option<String>| d.map(|x| x.trim().to_string()).filter(|x| x.len() == 10);
    let rows = sqlx::query(
        "SELECT c.id, c.posto_id, ps.descricao AS posto, u.nome AS utilizador, c.aberta_em, c.fechada_em, c.valor_inicial,
                c.valor_contado, c.estado, c.numero_z,
                COALESCE(json_extract(f.instantaneo, '$.total_vendido'),
                         (SELECT COALESCE(SUM(total), 0) FROM documentos d WHERE d.caixa_sessao_id = c.id AND d.estado = 'N' AND d.tipo_codigo IN ('FR','RC'))) AS total_vendido,
                json_extract(f.instantaneo, '$.numerario_esperado') AS numerario_esperado,
                COALESCE(json_extract(f.instantaneo, '$.online.total'), 0) AS online_total,
                f.id AS fecho_id, f.reconstruido, f.selo, f.criado_em AS arquivado_em
         FROM caixa_sessoes c JOIN utilizadores u ON u.id = c.utilizador_id LEFT JOIN postos ps ON ps.id = c.posto_id
         LEFT JOIN caixa_fechos f ON f.sessao_id = c.id
         WHERE (?1 IS NULL OR COALESCE(c.fechada_em, c.aberta_em) >= ?1) AND (?2 IS NULL OR c.aberta_em < date(?2, '+1 day'))
           AND (?3 IS NULL OR c.posto_id = ?3) AND (?4 IS NULL OR c.numero_z = ?4)
         ORDER BY c.aberta_em DESC, c.id DESC LIMIT 500",
    )
    .bind(data(f.de))
    .bind(data(f.ate))
    .bind(f.posto_id)
    .bind(f.numero)
    .fetch_all(&st.pool)
    .await?;
    Ok(db::rows_json(&rows))
}

#[derive(Deserialize)]
pub struct AbrirIn {
    valor_inicial: i64,
}

pub async fn abrir(st: &AppState, i: AbrirIn) -> AppResult<Value> {
    let s = st.sessao()?;
    if sessao_aberta(st).await?.is_some() {
        return Err(AppError::msg("Já existe um caixa aberto neste posto."));
    }
    let posto = st.posto();
    let valor = i.valor_inicial.max(0);
    let mut tx = db::transacao(&st.pool).await?;
    let id = sqlx::query("INSERT INTO caixa_sessoes (posto_id, utilizador_id, aberta_em, valor_inicial) VALUES (?, ?, ?, ?)")
        .bind(posto.id)
        .bind(s.id)
        .bind(db::agora())
        .bind(valor)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
    // na auditoria selada, com a abertura (o selo põe-se no fim do pedido)
    super::auditoria::registar_evento_em(
        &mut tx,
        st,
        "ABRIR_CAIXA",
        "caixa_sessoes",
        id,
        &format!("Caixa aberto no posto {} com o fundo de maneio de {}", posto.descricao, crate::agt::valor_pt(valor)),
        Some(&json!({ "posto": posto.descricao, "valor_inicial": valor })),
    )
    .await?;
    tx.commit().await?;
    resumo(st, id).await
}

#[derive(Deserialize)]
pub struct MovLinhaIn {
    descricao: String,
    #[serde(default)]
    rubrica: Option<String>,
    /// cêntimos
    valor: i64,
}

#[derive(Deserialize)]
pub struct MovIn {
    tipo: String,
    /// total (cêntimos); com linhas, é a soma delas
    #[serde(default)]
    valor: i64,
    #[serde(default)]
    descricao: String,
    rubrica: Option<String>,
    modo: Option<String>,
    /// a quem se entregou o dinheiro (saída) ou de quem se recebeu (entrada)
    #[serde(default)]
    beneficiario: Option<String>,
    /// vale com várias linhas (ex.: combustível, água, transporte)
    #[serde(default)]
    linhas: Vec<MovLinhaIn>,
    /// PIN de quem aprova, quando a regra de aprovação «vales» se aplica (services/aprovacoes.rs)
    #[serde(default)]
    autorizacao_pin: Option<String>,
}

const MAX_LINHAS_VALE: usize = 30;

fn limpo(s: &Option<String>) -> Option<&str> {
    s.as_deref().map(str::trim).filter(|x| !x.is_empty())
}

pub async fn movimento(st: &AppState, m: MovIn) -> AppResult<Value> {
    let s = st.exigir_perm("caixa.movimentos")?;
    let sid = sessao_aberta(st).await?.ok_or_else(|| AppError::msg("Não há caixa aberto."))?;
    if m.tipo != "ENTRADA" && m.tipo != "SAIDA" {
        return Err(AppError::msg("Tipo de movimento inválido."));
    }
    if m.linhas.len() > MAX_LINHAS_VALE {
        return Err(AppError::msg(format!("No máximo {MAX_LINHAS_VALE} linhas por vale.")));
    }
    for l in &m.linhas {
        if l.descricao.trim().is_empty() || l.valor <= 0 {
            return Err(AppError::msg("Cada linha precisa de uma descrição e de um valor."));
        }
    }
    // com linhas: o total é a soma; a descrição, a dada ou a da primeira linha; a rubrica, a comum a todas
    let (valor, descricao, rubrica) = if m.linhas.is_empty() {
        (m.valor, m.descricao.trim().to_string(), limpo(&m.rubrica).map(str::to_string))
    } else {
        let total: i64 = m.linhas.iter().map(|l| l.valor).sum();
        let descricao = match m.descricao.trim() {
            "" if m.linhas.len() == 1 => m.linhas[0].descricao.trim().to_string(),
            "" => format!("{} e mais {}", m.linhas[0].descricao.trim(), m.linhas.len() - 1),
            d => d.to_string(),
        };
        // rubrica comum: a mesma em todas as linhas (uma linha sem rubrica já não é comum)
        let primeira = limpo(&m.linhas[0].rubrica);
        let comum = primeira.filter(|r| m.linhas.iter().all(|l| limpo(&l.rubrica) == Some(*r)));
        let rubrica = limpo(&m.rubrica).or(comum).map(str::to_string);
        (total, descricao, rubrica)
    };
    if valor <= 0 || descricao.is_empty() {
        return Err(AppError::msg("Indique o valor e a descrição."));
    }
    let aprovacao = if m.tipo == "SAIDA" {
        super::aprovacoes::exigir(
            st,
            super::aprovacoes::Regra::Vales,
            valor,
            None,
            format!("Vale de caixa de {} ({descricao})", super::aprovacoes::kz(valor)),
            m.autorizacao_pin.as_deref(),
        )
        .await?
    } else {
        None
    };
    let mut tx = db::transacao(&st.pool).await?;
    let id = sqlx::query(
        "INSERT INTO caixa_movimentos (sessao_id, data_hora, tipo, valor, descricao, rubrica, modo_codigo, beneficiario, utilizador_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(sid)
    .bind(db::agora())
    .bind(&m.tipo)
    .bind(valor)
    .bind(&descricao)
    .bind(&rubrica)
    .bind(m.modo.as_deref().unwrap_or("NU"))
    .bind(limpo(&m.beneficiario))
    .bind(s.id)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    for l in &m.linhas {
        sqlx::query("INSERT INTO caixa_movimento_linhas (movimento_id, descricao, rubrica, valor) VALUES (?, ?, ?, ?)")
            .bind(id)
            .bind(l.descricao.trim())
            .bind(limpo(&l.rubrica))
            .bind(l.valor)
            .execute(&mut *tx)
            .await?;
    }
    super::aprovacoes::registar(&mut tx, aprovacao.as_ref(), &format!("Vale n.º {id}")).await?;
    let saida = m.tipo == "SAIDA";
    super::auditoria::registar_evento_em(
        &mut tx,
        st,
        if saida { "SAIDA_CAIXA" } else { "ENTRADA_CAIXA" },
        "caixa_movimentos",
        id,
        &format!("Vale n.º {id}: {} de {} ({descricao})", if saida { "saída" } else { "entrada" }, crate::agt::valor_pt(valor)),
        Some(&json!({
            "sessao_id": sid, "tipo": m.tipo, "valor": valor, "descricao": descricao, "rubrica": rubrica,
            "modo": m.modo.as_deref().unwrap_or("NU"), "beneficiario": limpo(&m.beneficiario), "linhas": m.linhas.len(),
        })),
    )
    .await?;
    tx.commit().await?;
    let mut r = resumo(st, sid).await?;
    r["movimento_id"] = json!(id);
    Ok(r)
}

/// Um movimento de caixa com as linhas e quem o registou, para o talão (vale de caixa) e a reimpressão.
pub async fn movimento_obter(st: &AppState, i: IdIn) -> AppResult<Value> {
    st.sessao()?;
    let r = sqlx::query(
        "SELECT m.*, COALESCE(u.nome, us.nome) AS utilizador, ps.descricao AS posto, mp.descricao AS modo
         FROM caixa_movimentos m JOIN caixa_sessoes c ON c.id = m.sessao_id
         LEFT JOIN utilizadores u ON u.id = m.utilizador_id LEFT JOIN utilizadores us ON us.id = c.utilizador_id
         LEFT JOIN postos ps ON ps.id = c.posto_id LEFT JOIN modos_pagamento mp ON mp.codigo = COALESCE(m.modo_codigo, 'NU')
         WHERE m.id = ?",
    )
    .bind(i.id)
    .fetch_optional(&st.pool)
    .await?
    .ok_or(AppError::NaoEncontrado)?;
    let mut v = db::row_json(&r);
    v["linhas"] = db::query_json_bind(&st.pool, "SELECT descricao, rubrica, valor FROM caixa_movimento_linhas WHERE movimento_id = ? ORDER BY id", i.id).await?;
    Ok(v)
}

#[derive(Deserialize)]
pub struct FecharIn {
    /// Total contado em numerário (cêntimos); dispensado quando vem a contagem por notas e moedas.
    #[serde(default)]
    valor_contado: Option<i64>,
    /// Notas e moedas contadas: valor facial em Kz → quantidade.
    #[serde(default)]
    contagem: Option<std::collections::BTreeMap<String, i64>>,
    /// Valores contados das outras formas de pagamento (talão do TPA, transferências…), em cêntimos.
    #[serde(default)]
    contado_modos: Option<std::collections::BTreeMap<String, i64>>,
    #[serde(default)]
    observacoes: Option<String>,
    /// Incluir as vendas online da loja neste fecho; sem ele, a opção do posto (ligada por omissão).
    #[serde(default)]
    incluir_online: Option<bool>,
}

pub async fn fechar(st: &AppState, f: FecharIn) -> AppResult<Value> {
    let s = st.exigir_perm("pos.fecho_caixa")?;
    let sid = sessao_aberta(st).await?.ok_or_else(|| AppError::msg("Não há caixa aberto."))?;
    // contagem por notas e moedas (o total sai daí) ou o total indicado
    let mut contagem = std::collections::BTreeMap::new();
    let valor_contado = match &f.contagem {
        Some(c) if !c.is_empty() => {
            let mut total = 0i64;
            for (face, qtd) in c {
                let kz: i64 = face.trim().parse().map_err(|_| AppError::msg(format!("Nota ou moeda inválida: {face}")))?;
                if !DENOMINACOES.contains(&kz) {
                    return Err(AppError::msg(format!("Não há notas nem moedas de {kz} Kz.")));
                }
                if *qtd < 0 {
                    return Err(AppError::msg("As quantidades contadas não podem ser negativas."));
                }
                if *qtd > 0 {
                    contagem.insert(kz.to_string(), *qtd);
                    total += kz * 100 * qtd;
                }
            }
            total
        }
        _ => f.valor_contado.ok_or_else(|| AppError::msg("Indique o numerário contado (por notas e moedas ou o total)."))?,
    };
    if valor_contado < 0 {
        return Err(AppError::msg("O valor contado não pode ser negativo."));
    }
    let modos: std::collections::BTreeMap<String, i64> = f.contado_modos.unwrap_or_default().into_iter().filter(|(k, v)| k != "NU" && *v >= 0).collect();
    let incluir_online = f.incluir_online.unwrap_or_else(|| fecho_online(st));
    let mut tx = crate::db::transacao(&st.pool).await?;
    // fecha e numera numa só instrução (o n.º Z do posto e a marca de fechado, com o bloqueio de escrita já preso)
    let feito = sqlx::query(
        "UPDATE caixa_sessoes SET estado = 'FECHADA', fechada_em = ?, valor_contado = ?,
                numero_z = (SELECT COALESCE(MAX(numero_z), 0) + 1 FROM caixa_sessoes WHERE posto_id IS ?),
                contagem = ?, contado_modos = ?, cego = ?, fechada_por = ?, observacoes = ?
          WHERE id = ? AND estado = 'ABERTA'",
    )
    .bind(db::agora())
    .bind(valor_contado)
    .bind(st.posto().id)
    .bind((!contagem.is_empty()).then(|| serde_json::to_string(&contagem).unwrap_or_default()))
    .bind((!modos.is_empty()).then(|| serde_json::to_string(&modos).unwrap_or_default()))
    .bind(fecho_cego(st) as i64)
    .bind(s.id)
    .bind(f.observacoes.as_deref().map(str::trim).filter(|x| !x.is_empty()))
    .bind(sid)
    .execute(&mut *tx)
    .await?;
    if feito.rows_affected() == 0 {
        return Err(AppError::msg("Este caixa já foi fechado."));
    }
    // o Z fica arquivado na mesma transacção (o instantâneo, o selo e as vendas online que ele fecha), e a auditoria
    // com ele: o fecho e cada venda online incluída
    let arquivo = super::caixa_fechos::arquivar(&mut tx, sid, incluir_online, Some(s.id), false).await?;
    let numero_z = arquivo.v["sessao"]["numero_z"].as_i64().unwrap_or(0);
    let dif = valor_contado - arquivo.v["numerario_esperado"].as_i64().unwrap_or(0);
    super::auditoria::registar_evento_em(
        &mut tx,
        st,
        "FECHO_CAIXA",
        "caixa_sessoes",
        sid,
        &format!("Z n.º {numero_z} (sessão {sid}): contado {}, diferença {}", crate::agt::total_fmt(valor_contado), crate::agt::total_fmt(dif)),
        Some(&json!({
            "numero_z": numero_z, "fecho_id": arquivo.id, "selo": arquivo.selo, "valor_contado": valor_contado, "diferenca": dif,
            "vendas_online": arquivo.vendas.len(), "online_incluidas": incluir_online,
        })),
    )
    .await?;
    for venda in &arquivo.vendas {
        super::auditoria::registar_evento_em(
            &mut tx,
            st,
            "FECHO_ONLINE",
            "caixa_fechos",
            arquivo.id,
            &format!("Z n.º {numero_z} fecha a venda online {} ({})", venda.descricao(), crate::agt::valor_pt(venda.valor)),
            Some(&venda.linha),
        )
        .await?;
    }
    tx.commit().await?;
    let mut r = super::caixa_fechos::obter(st, sid).await?.ok_or(AppError::NaoEncontrado)?;
    // o documento do fecho na pasta dos documentos («Fechos de caixa»); se falhar, o fecho está feito na mesma
    match super::caixa_fechos::guardar_ficheiro(st, &r) {
        Ok(f) => r["arquivo"]["ficheiro_gravado"] = json!(f),
        Err(e) => {
            eprintln!("Fecho de caixa: o ficheiro do Z n.º {numero_z} não ficou gravado ({e}).");
            r["arquivo"]["erro_ficheiro"] = json!(e.to_string());
        }
    }
    // o fecho de caixa é um bom momento para uma cópia de segurança
    super::sistema::copia_evento(st, "Cópia no fecho de caixa").await;
    Ok(r)
}
