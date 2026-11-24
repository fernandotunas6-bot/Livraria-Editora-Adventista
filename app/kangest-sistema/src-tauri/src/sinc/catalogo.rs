// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O catálogo para o site: o stock de cada armazém, o preço e os artigos novos (docs/SINCRONIZACAO.md §Catálogo;
//! parte A do plano do ecossistema). Substitui o que os avisos da API faziam pela ligação antiga.
//!
//! - **O que mudou.** Os gatilhos da migração 0057 marcam o artigo em `sinc_catalogo` na mesma transacção que muda o
//!   stock, as reservas (NE) ou o artigo. É um conjunto, não uma fila de movimentos: dez vendas do mesmo livro dão uma
//!   linha, e o `mudou` sobe a cada mudança.
//! - **O que segue.** O estado de agora, montado como nos avisos da API (`webhooks::dados_evento`): o centro grava o
//!   estado e não soma nada, por isso repetir é seguro.
//! - **Feito.** A linha só sai se não mudou entretanto (`mudou` igual ao que se leu); se mudou, segue na volta seguinte
//!   com o estado novo.
//! - Quem decide o que o site faz com isto são os interruptores do posto no painel (stock à venda, catálogo): aqui só se
//!   manda.

use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::AppResult;

/// Artigos por lote (com os documentos, o centro aceita até 200 itens).
pub const LOTE: i64 = 100;

/// Uma linha de `sinc_catalogo` que entrou num lote.
#[derive(Debug, Clone, PartialEq)]
pub struct Pendente {
    pub artigo_id: i64,
    pub tipo: String,
    pub mudou: i64,
    pub tentativas: i64,
}

/// Todo o catálogo activo para a fila (ao emparelhar): o artigo e, se controla stock, o stock.
pub async fn enfileirar_tudo(pool: &SqlitePool) -> AppResult<i64> {
    let a = sqlx::query(
        "INSERT INTO sinc_catalogo (artigo_id, tipo)
         SELECT id, 'artigo' FROM artigos WHERE ativo = 1 AND COALESCE(referencia, '') <> ''
         ON CONFLICT (artigo_id, tipo) DO NOTHING",
    )
    .execute(pool)
    .await?;
    let s = sqlx::query(
        "INSERT INTO sinc_catalogo (artigo_id, tipo)
         SELECT id, 'stock' FROM artigos WHERE ativo = 1 AND controla_stock = 1 AND composto = 0 AND COALESCE(referencia, '') <> ''
         ON CONFLICT (artigo_id, tipo) DO NOTHING",
    )
    .execute(pool)
    .await?;
    Ok((a.rows_affected() + s.rows_affected()) as i64)
}

/// O artigo como vai no lote: só o que o site usa (o centro volta a limpar).
fn item_do_artigo(id: i64, dados: &Value) -> Value {
    json!({
        "tipo": "artigo",
        "artigo_id": id,
        "artigo": {
            "referencia": dados["referencia"],
            "descricao": dados["descricao"],
            "tipo": dados["tipo"],
            "preco1_iva": dados["preco1_iva"],
            "ativo": dados["ativo"],
            "codigo_barras": dados["codigo_barras"],
        },
    })
}

/// O stock como vai no lote: o de cada armazém (existência, reservado pelas NE por facturar e disponível).
fn item_do_stock(id: i64, dados: &Value) -> Value {
    let armazens: Vec<Value> = dados["armazens"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|a| json!({ "armazem_id": a["armazem_id"], "quantidade": a["quantidade"], "reservado": a["reservado"], "disponivel": a["disponivel"] }))
        .collect();
    json!({ "tipo": "stock", "artigo_id": id, "referencia": dados["referencia"], "armazens": armazens })
}

/// Os devidos agora (`proximo_em` já passou) e os itens do lote. Um artigo que já não existe, sem referência ou que não
/// controla stock sai da fila sem seguir.
pub async fn devidos(pool: &SqlitePool, agora: i64, limite: i64) -> AppResult<(Vec<Pendente>, Vec<Value>)> {
    let linhas: Vec<(i64, String, i64, i64)> =
        sqlx::query_as("SELECT artigo_id, tipo, mudou, tentativas FROM sinc_catalogo WHERE proximo_em <= ? ORDER BY tentativas, artigo_id, tipo LIMIT ?")
            .bind(agora)
            .bind(limite)
            .fetch_all(pool)
            .await?;
    let mut pendentes = Vec::with_capacity(linhas.len());
    let mut itens = Vec::with_capacity(linhas.len());
    for (artigo_id, tipo, mudou, tentativas) in linhas {
        let a: Option<(String, i64, i64)> = sqlx::query_as("SELECT COALESCE(referencia, ''), controla_stock, composto FROM artigos WHERE id = ?")
            .bind(artigo_id)
            .fetch_optional(pool)
            .await?;
        let serve = match (&a, tipo.as_str()) {
            (Some((r, _, _)), "artigo") => !r.trim().is_empty(),
            (Some((r, controla, composto)), "stock") => !r.trim().is_empty() && *controla == 1 && *composto == 0,
            _ => false,
        };
        let evento = if tipo == "stock" { "stock.alterado" } else { "artigo.alterado" };
        let dados = if serve { crate::webhooks::dados_evento(pool, evento, Some(artigo_id)).await? } else { Value::Null };
        if dados.is_null() {
            sqlx::query("DELETE FROM sinc_catalogo WHERE artigo_id = ? AND tipo = ? AND mudou = ?").bind(artigo_id).bind(&tipo).bind(mudou).execute(pool).await?;
            continue;
        }
        itens.push(if tipo == "stock" { item_do_stock(artigo_id, &dados) } else { item_do_artigo(artigo_id, &dados) });
        pendentes.push(Pendente { artigo_id, tipo, mudou, tentativas });
    }
    Ok((pendentes, itens))
}

/// Os erros do centro para o catálogo, por artigo e tipo (`resultado.erros`, os que trazem `artigo_id`).
pub fn erros_do_resultado(resultado: &Value) -> HashMap<(i64, String), String> {
    resultado["erros"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|e| {
            let tipo = e["tipo"].as_str().filter(|t| *t == "stock" || *t == "artigo")?;
            Some(((e["artigo_id"].as_i64()?, tipo.to_string()), e["erro"].as_str().unwrap_or("erro").to_string()))
        })
        .collect()
}

/// Depois de o centro responder: os que seguiram saem (se não mudaram entretanto); os recusados esperam cada vez mais.
pub async fn concluir(pool: &SqlitePool, pendentes: &[Pendente], erros: &HashMap<(i64, String), String>, agora: i64) -> AppResult<()> {
    for p in pendentes {
        match erros.get(&(p.artigo_id, p.tipo.clone())) {
            Some(erro) => {
                sqlx::query("UPDATE sinc_catalogo SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE artigo_id = ? AND tipo = ?")
                    .bind(super::proxima_tentativa(p.tentativas, agora))
                    .bind(erro.chars().take(300).collect::<String>())
                    .bind(p.artigo_id)
                    .bind(&p.tipo)
                    .execute(pool)
                    .await?;
            }
            None => {
                sqlx::query("DELETE FROM sinc_catalogo WHERE artigo_id = ? AND tipo = ? AND mudou = ?")
                    .bind(p.artigo_id)
                    .bind(&p.tipo)
                    .bind(p.mudou)
                    .execute(pool)
                    .await?;
            }
        }
    }
    Ok(())
}

/// O pedido inteiro foi recusado (posto revogado, relógio errado…): os do lote esperam, cada vez mais.
pub async fn adiar(pool: &SqlitePool, pendentes: &[Pendente], agora: i64) -> AppResult<()> {
    for p in pendentes {
        sqlx::query("UPDATE sinc_catalogo SET tentativas = tentativas + 1, proximo_em = ? WHERE artigo_id = ? AND tipo = ?")
            .bind(super::proxima_tentativa(p.tentativas, agora))
            .bind(p.artigo_id)
            .bind(&p.tipo)
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// Quantos estão devidos agora (para o ciclo saber se há que enviar).
pub async fn devidos_agora(pool: &SqlitePool, agora: i64) -> AppResult<i64> {
    Ok(sqlx::query_scalar("SELECT COUNT(*) FROM sinc_catalogo WHERE proximo_em <= ?").bind(agora).fetch_one(pool).await?)
}

/// Para o ecrã: os por enviar e os com erro.
pub async fn contagem(pool: &SqlitePool) -> AppResult<Value> {
    let (pendentes, com_erro): (i64, i64) = sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(erro <> ''), 0) FROM sinc_catalogo").fetch_one(pool).await?;
    Ok(json!({ "pendentes": pendentes, "com_erro": com_erro }))
}

/// «Repetir»: os que o centro recusou voltam já.
pub async fn repetir(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("UPDATE sinc_catalogo SET tentativas = 0, proximo_em = 0, erro = '' WHERE erro <> ''").execute(pool).await?;
    Ok(())
}

/// Ao desligar, ou ao ligar a outro posto: o que estava por enviar era para o posto anterior.
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sinc_catalogo").execute(pool).await?;
    Ok(())
}
