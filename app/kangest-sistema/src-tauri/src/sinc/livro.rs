// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O livro único de stock (KANGEST ONE, fase B1; migração 0071). Cada movimento de stock deste KanGest
//! (`movimentos_stock`) segue para o livro central do site (`public.stock_movimentos`), no mesmo pedido que os
//! documentos e o catálogo, com a chave de idempotência do id local: um movimento repetido não conta duas vezes.
//!
//! - **A abertura:** na primeira volta com o livro, ao ligar a outro posto e depois de desligar, a existência de cada
//!   artigo em cada armazém fica por enviar, numa transacção que começa por escrever (nenhum movimento se mete a meio).
//!   O site grava a diferença para o livro: a existência toda na primeira vez, só o que faltava ao voltar a ligar.
//! - **Os movimentos** seguem só depois das aberturas todas, para a diferença sair certa.
//! - **Em sombra:** o stock à venda no site continua a sair do item `stock` do catálogo (catalogo.rs) até à fase B3. O
//!   painel mostra se o livro bate certo com isso.
//!
//! Seguem o armazém, a referência, a quantidade com sinal, o tipo (venda, compra, devolução, transferência, acerto), o
//! número do documento e a hora. Nunca o cliente, o custo nem a descrição livre.

use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::AppResult;

/// Aberturas ou movimentos por pedido.
pub const LOTE: i64 = 500;

/// Abre o livro deste posto, se ainda não abriu. Devolve `true` se abriu agora.
pub async fn abrir_se_preciso(pool: &SqlitePool, posto_id: &str) -> AppResult<bool> {
    let actual: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'stock_livro.posto'").fetch_optional(pool).await?;
    if actual.as_deref() == Some(posto_id) {
        return Ok(false);
    }
    let momento = crate::db::agora();
    let epoca = chrono::Local::now().format("%Y%m%dT%H%M%S").to_string();
    let mut tx = pool.begin().await?;
    // a primeira instrução escreve: a partir daqui, nenhum outro movimento entra até ao fim
    sqlx::query("DELETE FROM sinc_stock_abertura").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM sinc_stock_livro").execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO sinc_stock_abertura (armazem_id, artigo_id, quantidade, momento)
         SELECT s.armazem_id, s.artigo_id, s.quantidade, ?
           FROM stock s JOIN artigos a ON a.id = s.artigo_id
          WHERE a.controla_stock = 1 AND a.composto = 0 AND TRIM(COALESCE(a.referencia, '')) <> ''",
    )
    .bind(&momento)
    .execute(&mut *tx)
    .await?;
    for (chave, valor) in [("stock_livro.posto", posto_id.to_string()), ("stock_livro.epoca", epoca)] {
        sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
            .bind(chave)
            .bind(valor)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(true)
}

/// Ao desligar do site: a fila e a abertura esvaziam-se, e a ligação seguinte abre o livro outra vez.
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sinc_stock_livro").execute(pool).await?;
    sqlx::query("DELETE FROM sinc_stock_abertura").execute(pool).await?;
    sqlx::query("DELETE FROM config WHERE chave IN ('stock_livro.posto', 'stock_livro.epoca', 'stock_livro.adiar_ate')").execute(pool).await?;
    Ok(())
}

/// O que segue nesta volta.
#[derive(Default)]
pub struct Devidos {
    /// (armazém, artigo) das aberturas enviadas
    pub aberturas: Vec<(i64, i64)>,
    /// (movimento, tentativas) dos movimentos enviados
    pub movimentos: Vec<(i64, i64)>,
    /// `dados.stock_livro`, ou `Null` se não há nada
    pub dados: Value,
}

impl Devidos {
    pub fn cheio(&self) -> bool {
        self.aberturas.len() as i64 == LOTE || self.movimentos.len() as i64 == LOTE
    }
}

#[derive(sqlx::FromRow)]
struct Abertura {
    armazem_id: i64,
    artigo_id: i64,
    referencia: String,
    quantidade: f64,
    momento: String,
}

#[derive(sqlx::FromRow)]
struct Movimento {
    mov_id: i64,
    tentativas: i64,
    armazem_id: i64,
    referencia: String,
    quantidade: f64,
    data_hora: String,
    tipo_codigo: Option<String>,
    classe: Option<String>,
    numero_doc: Option<String>,
}

/// O tipo do movimento para o livro, pelo documento: a saída de uma venda é «venda», a entrada de uma nota de crédito é
/// «devolucao», a entrada de uma compra é «compra», a transferência é «transferencia»; o resto (os acertos, o inventário,
/// as anulações) é «ajuste».
pub fn tipo_do_movimento(tipo_codigo: Option<&str>, classe: Option<&str>, quantidade: f64) -> &'static str {
    match (tipo_codigo, classe) {
        (Some("NC"), _) if quantidade > 0.0 => "devolucao",
        (Some("TS"), _) => "transferencia",
        (_, Some("VENDA")) if quantidade < 0.0 => "venda",
        (_, Some("COMPRA")) if quantidade > 0.0 => "compra",
        _ => "ajuste",
    }
}

/// A hora local (AAAA-MM-DDTHH:MM:SS) com o fuso deste computador.
fn com_fuso(local: &str) -> Value {
    chrono::NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M:%S")
        .ok()
        .and_then(|n| n.and_local_timezone(chrono::Local).earliest())
        .map(|d| Value::String(d.to_rfc3339()))
        .unwrap_or(Value::Null)
}

/// As aberturas por enviar (primeiro, e só elas) ou, depois delas todas, os movimentos devidos.
pub async fn devidos(pool: &SqlitePool, agora: i64) -> AppResult<Devidos> {
    let epoca: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'stock_livro.epoca'").fetch_optional(pool).await?;
    let Some(epoca) = epoca else { return Ok(Devidos::default()) };
    // o site ainda não tinha o livro na última volta: espera-se um pouco antes de mandar tudo outra vez
    let adiar: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'stock_livro.adiar_ate'").fetch_optional(pool).await?;
    if adiar.and_then(|a| a.parse::<i64>().ok()).is_some_and(|a| a > agora) {
        return Ok(Devidos::default());
    }
    let aberturas: Vec<Abertura> = sqlx::query_as(
        "SELECT b.armazem_id, b.artigo_id, a.referencia, b.quantidade, b.momento
           FROM sinc_stock_abertura b JOIN artigos a ON a.id = b.artigo_id
          ORDER BY b.armazem_id, b.artigo_id LIMIT ?",
    )
    .bind(LOTE)
    .fetch_all(pool)
    .await?;
    if !aberturas.is_empty() {
        let dados = json!({
            "epoca": epoca,
            "aberturas": aberturas.iter().map(|a| json!({
                "armazem_id": a.armazem_id, "referencia": a.referencia.trim(), "quantidade": a.quantidade, "momento": com_fuso(&a.momento),
            })).collect::<Vec<_>>(),
        });
        return Ok(Devidos { aberturas: aberturas.iter().map(|a| (a.armazem_id, a.artigo_id)).collect(), movimentos: Vec::new(), dados });
    }
    // os movimentos de artigos que o livro não segue (sem referência, sem controlo de stock ou compostos — os mesmos que a
    // abertura deixa de fora) saem da fila: o site recusá-los-ia sempre, e o «Servidor central» ficava em atenção sem motivo
    sqlx::query(
        "DELETE FROM sinc_stock_livro WHERE mov_id IN (
           SELECT m.id FROM movimentos_stock m JOIN artigos a ON a.id = m.artigo_id
            WHERE m.id IN (SELECT mov_id FROM sinc_stock_livro)
              AND (TRIM(COALESCE(a.referencia, '')) = '' OR a.controla_stock <> 1 OR a.composto <> 0))",
    )
    .execute(pool)
    .await?;
    let movimentos: Vec<Movimento> = sqlx::query_as(
        "SELECT f.mov_id, f.tentativas, m.armazem_id, COALESCE(a.referencia, '') AS referencia, m.quantidade, m.data_hora,
                d.tipo_codigo, t.classe, d.numero_doc
           FROM sinc_stock_livro f
           JOIN movimentos_stock m ON m.id = f.mov_id
           JOIN artigos a ON a.id = m.artigo_id
           LEFT JOIN documentos d ON d.id = m.documento_id
           LEFT JOIN tipos_documento t ON t.codigo = d.tipo_codigo
          WHERE f.proximo_em <= ?
          ORDER BY f.mov_id LIMIT ?",
    )
    .bind(agora)
    .bind(LOTE)
    .fetch_all(pool)
    .await?;
    if movimentos.is_empty() {
        return Ok(Devidos::default());
    }
    let dados = json!({
        "epoca": epoca,
        "movimentos": movimentos.iter().map(|m| json!({
            "mov_id": m.mov_id,
            "armazem_id": m.armazem_id,
            "referencia": m.referencia.trim(),
            "quantidade": m.quantidade,
            "tipo": tipo_do_movimento(m.tipo_codigo.as_deref(), m.classe.as_deref(), m.quantidade),
            "documento": m.numero_doc.clone().unwrap_or_default(),
            "momento": com_fuso(&m.data_hora),
        })).collect::<Vec<_>>(),
    });
    Ok(Devidos { aberturas: Vec::new(), movimentos: movimentos.iter().map(|m| (m.mov_id, m.tentativas)).collect(), dados })
}

/// Depois da resposta (`stock_livro`): as aberturas e os movimentos aceites saem da fila; os recusados ficam com o erro
/// e tentam outra vez mais tarde. Sem resposta do livro (um site sem a migração, ou um erro da base), tudo espera.
pub async fn concluir(pool: &SqlitePool, d: &Devidos, r: &Value, agora: i64) -> AppResult<()> {
    if d.aberturas.is_empty() && d.movimentos.is_empty() {
        return Ok(());
    }
    let respondeu = r.is_object() && r.get("erro").is_none();
    if !respondeu {
        // tudo espera meia hora (as aberturas não têm tentativas próprias)
        sqlx::query("INSERT INTO config (chave, valor) VALUES ('stock_livro.adiar_ate', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
            .bind((agora + 1800).to_string())
            .execute(pool)
            .await?;
        for (mov, tentativas) in &d.movimentos {
            sqlx::query("UPDATE sinc_stock_livro SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE mov_id = ?")
                .bind(super::proxima_tentativa(*tentativas, agora))
                .bind(r["erro"].as_str().unwrap_or("o site ainda não tem o livro de stock").chars().take(300).collect::<String>())
                .bind(mov)
                .execute(pool)
                .await?;
        }
        return Ok(());
    }
    sqlx::query("DELETE FROM config WHERE chave = 'stock_livro.adiar_ate'").execute(pool).await?;
    for (armazem, artigo) in &d.aberturas {
        sqlx::query("DELETE FROM sinc_stock_abertura WHERE armazem_id = ? AND artigo_id = ?").bind(armazem).bind(artigo).execute(pool).await?;
    }
    let aceites: Vec<i64> = r["aceites"].as_array().into_iter().flatten().filter_map(|v| v.as_i64()).collect();
    for mov in &aceites {
        sqlx::query("DELETE FROM sinc_stock_livro WHERE mov_id = ?").bind(mov).execute(pool).await?;
    }
    for e in r["erros"].as_array().into_iter().flatten() {
        let Some(mov) = e["mov_id"].as_i64() else { continue };
        let tentativas = d.movimentos.iter().find(|(m, _)| *m == mov).map(|(_, t)| *t).unwrap_or(0);
        sqlx::query("UPDATE sinc_stock_livro SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE mov_id = ?")
            .bind(super::proxima_tentativa(tentativas, agora))
            .bind(e["erro"].as_str().unwrap_or("recusado").chars().take(300).collect::<String>())
            .bind(mov)
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// Para o ecrã da ligação: a abertura por enviar, os movimentos na fila e os com erro.
pub async fn contagem(pool: &SqlitePool) -> AppResult<Value> {
    let aberto: bool = sqlx::query_scalar("SELECT COUNT(*) > 0 FROM config WHERE chave = 'stock_livro.posto'").fetch_one(pool).await?;
    let abertura: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_stock_abertura").fetch_one(pool).await?;
    let (fila, com_erro): (i64, i64) = sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(erro <> ''), 0) FROM sinc_stock_livro").fetch_one(pool).await?;
    Ok(json!({ "aberto": aberto, "abertura": abertura, "fila": fila, "com_erro": com_erro }))
}
