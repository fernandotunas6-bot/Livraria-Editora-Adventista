// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O ERP financeiro central (parte F do plano; migração 0068): os movimentos da tesouraria seguem para o site, no mesmo
//! pedido que os documentos, o catálogo e os fechos. No site fica uma cópia que não se altera
//! (`public.kangest_movimentos`), com o relatório por loja no painel. Uma anulação segue também: lá só marca o movimento.
//!
//! **Sem dados pessoais:** a descrição livre e o cliente ou fornecedor do movimento não seguem. Vão a conta, o tipo, o
//! valor, a data, o centro de custo e o número do documento.

use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::error::AppResult;

/// Movimentos por pedido.
pub const LOTE: i64 = 50;

/// Ao ligar o posto: os movimentos todos entram na fila, uma vez só (pedido do dono a 27/11: «migrar todos os dados
/// actuais da loja»; antes eram só os do último ano). O centro ignora os que já tiver.
pub async fn enfileirar_tudo(pool: &SqlitePool) -> AppResult<i64> {
    let r = sqlx::query("INSERT OR IGNORE INTO sinc_financeiro (movimento_id) SELECT id FROM movimentos_tesouraria ORDER BY id").execute(pool).await?;
    Ok(r.rows_affected() as i64)
}

/// Ao ligar a outro posto ou desligar: a fila esvazia-se.
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sinc_financeiro").execute(pool).await?;
    Ok(())
}

type Linha = (i64, i64, String, String, String, String, i64, Option<String>, Option<String>, i64);

/// Os movimentos devidos (os pendentes cuja hora chegou), como vão no lote.
pub async fn devidos(pool: &SqlitePool, agora: i64, limite: i64) -> AppResult<(Vec<(i64, i64)>, Vec<Value>)> {
    let linhas: Vec<Linha> = sqlx::query_as(
        "SELECT q.movimento_id, q.tentativas, m.data, m.data_hora, COALESCE(c.descricao, ''), m.tipo, m.valor,
                cc.descricao, m.documento, m.anulado
           FROM sinc_financeiro q
           JOIN movimentos_tesouraria m ON m.id = q.movimento_id
           LEFT JOIN contas c ON c.id = m.conta_id
           LEFT JOIN centros_custo cc ON cc.id = m.centro_custo_id
          WHERE q.estado = 'pendente' AND q.proximo_em <= ? ORDER BY q.movimento_id LIMIT ?",
    )
    .bind(agora)
    .bind(limite)
    .fetch_all(pool)
    .await?;
    let mut pendentes = Vec::with_capacity(linhas.len());
    let mut itens = Vec::with_capacity(linhas.len());
    for (id, tentativas, data, data_hora, conta, tipo, valor, categoria, documento, anulado) in linhas {
        itens.push(json!({
            "tipo": "movimento",
            "movimento": {
                "movimento_id": id,
                "data": data,
                "data_hora": data_hora,
                "conta": conta,
                "tipo": if tipo == "ENTRADA" { "entrada" } else { "saida" },
                "valor": valor,
                "categoria": categoria.unwrap_or_default(),
                "documento": documento.unwrap_or_default(),
                "anulado": anulado == 1,
            },
        }));
        pendentes.push((id, tentativas));
    }
    Ok((pendentes, itens))
}

/// Os erros que o centro devolveu para movimentos (pela chave `movimento_id`).
pub fn erros_do_resultado(resultado: &Value) -> HashMap<i64, String> {
    resultado["erros"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|e| e["tipo"] == "movimento")
        .filter_map(|e| Some((e["movimento_id"].as_i64()?, e["erro"].as_str().unwrap_or("erro").to_string())))
        .collect()
}

/// Depois de o centro responder: os que seguiram ficam feitos; os recusados esperam cada vez mais.
pub async fn concluir(pool: &SqlitePool, pendentes: &[(i64, i64)], erros: &HashMap<i64, String>, agora: i64) -> AppResult<()> {
    let feito = crate::db::agora();
    for (id, tentativas) in pendentes {
        match erros.get(id) {
            Some(erro) => {
                sqlx::query("UPDATE sinc_financeiro SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE movimento_id = ?")
                    .bind(super::proxima_tentativa(*tentativas, agora))
                    .bind(erro.chars().take(300).collect::<String>())
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            None => {
                sqlx::query("UPDATE sinc_financeiro SET estado = 'feito', feito_em = ?, erro = '' WHERE movimento_id = ?")
                    .bind(&feito)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[tokio::test]
    async fn os_movimentos_seguem_sem_dados_pessoais_e_a_anulacao_volta_a_fila() {
        let d = std::env::temp_dir().join(format!("kangest-financeiro-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let pool = crate::db::abrir(&d.join("kigest.db")).await.unwrap();
        sqlx::query("INSERT INTO utilizadores (id, nome, login, senha_hash, perfil) VALUES (1, 'Admin', 'admin', 'x', 'ADMIN')").execute(&pool).await.unwrap();
        let conta: i64 = sqlx::query_scalar("INSERT INTO contas (descricao, tipo) VALUES ('Caixa da loja', 'CAIXA') RETURNING id").fetch_one(&pool).await.unwrap();
        let movimento = |valor: i64| {
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO movimentos_tesouraria (data, data_hora, conta_id, tipo, valor, descricao, documento, utilizador_id)
                 VALUES ('2026-11-26', '2026-11-26T10:00:00', ?, 'ENTRADA', ?, 'Pago pela Ana Domingos', 'FR 2026/7', 1) RETURNING id",
            )
            .bind(conta)
            .bind(valor)
            .fetch_one(&pool)
        };
        // sem o posto ligado, nada entra na fila
        movimento(1000).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_financeiro").fetch_one(&pool).await.unwrap();
        assert_eq!(n, 0);
        // ao ligar o posto, os de antes entram uma vez
        sqlx::query(
            "INSERT INTO sinc_ligacao (id, url, posto_id, chave_assinatura, centro_kid, centro_chave, ativa, emparelhado_em)
             VALUES (1, 'https://exemplo.ao', 'p', 'c', 'k', 'x', 1, '2026-11-26T10:00:00')",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(enfileirar_tudo(&pool).await.unwrap(), 1);
        assert_eq!(enfileirar_tudo(&pool).await.unwrap(), 0);
        // os novos entram sozinhos
        let id = movimento(570000).await.unwrap();
        let (pendentes, itens) = devidos(&pool, i64::MAX, LOTE).await.unwrap();
        assert_eq!(pendentes.len(), 2);
        let m = &itens.iter().find(|i| i["movimento"]["movimento_id"] == id).unwrap()["movimento"];
        assert_eq!((m["tipo"].as_str(), m["valor"].as_i64(), m["conta"].as_str(), m["documento"].as_str()), (Some("entrada"), Some(570000), Some("Caixa da loja"), Some("FR 2026/7")));
        let texto = serde_json::to_string(&itens).unwrap();
        assert!(!texto.contains("Ana") && !texto.contains("descricao"), "sem a descrição nem o cliente: {texto}");
        // seguiram; uma anulação volta a pô-lo na fila, já anulado
        concluir(&pool, &pendentes, &HashMap::new(), 0).await.unwrap();
        assert!(devidos(&pool, i64::MAX, LOTE).await.unwrap().0.is_empty());
        sqlx::query("UPDATE movimentos_tesouraria SET anulado = 1, motivo_anulacao = 'engano' WHERE id = ?").bind(id).execute(&pool).await.unwrap();
        let (p2, i2) = devidos(&pool, i64::MAX, LOTE).await.unwrap();
        assert_eq!(p2.len(), 1);
        assert_eq!(i2[0]["movimento"]["anulado"], true);
        // um erro do centro deixa-o à espera, com o erro
        let erros = erros_do_resultado(&json!({ "erros": [{ "tipo": "movimento", "movimento_id": id, "erro": "Movimento sem data válida." }] }));
        concluir(&pool, &p2, &erros, 100).await.unwrap();
        let erro: String = sqlx::query_scalar("SELECT erro FROM sinc_financeiro WHERE movimento_id = ?").bind(id).fetch_one(&pool).await.unwrap();
        assert!(erro.contains("data"));
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }
}
