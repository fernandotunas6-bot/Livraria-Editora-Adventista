// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A cópia de cada fecho de caixa no site (migração 0063; docs/FECHO-DE-CAIXA.md, «A cópia no site»).
//!
//! Cada fecho arquivado (services/caixa_fechos.rs) entra na fila `sinc_fechos` e segue no mesmo pedido que os
//! documentos e o catálogo. No site fica uma cópia que não se altera (`public.kangest_fechos`), para a direcção e o
//! gerente da loja consultarem no painel.
//!
//! **Sem dados pessoais:** os nomes dos clientes (da lista dos documentos e das vendas online) saem do resumo que vai
//! para o site, como nas cópias dos documentos (onde vão cifrados). Leva o selo do arquivo original, para se saber
//! a que fecho corresponde, e o selo do resumo que seguiu.

use std::collections::HashMap;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::error::AppResult;

/// Fechos num lote.
pub const LOTE: i64 = 20;

/// Uma linha da fila com o fecho: o id, as tentativas, a sessão, o n.º Z, o instantâneo, o selo e se é reconstruído.
type Linha = (i64, i64, i64, Option<i64>, String, String, i64);

/// Os fechos que ainda não seguiram, para a primeira ligação (ou depois de ligar a outro posto).
pub async fn enfileirar_tudo(pool: &SqlitePool) -> AppResult<i64> {
    let r = sqlx::query(
        "INSERT OR IGNORE INTO sinc_fechos (fecho_id)
         SELECT f.id FROM caixa_fechos f JOIN caixa_sessoes s ON s.id = f.sessao_id WHERE s.id_origem IS NULL ORDER BY f.id",
    )
    .execute(pool)
    .await?;
    Ok(r.rows_affected() as i64)
}

/// Ao ligar a outro posto ou desligar: a fila esvazia-se, e tudo volta a seguir na ligação seguinte.
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sinc_fechos").execute(pool).await?;
    Ok(())
}

/// O resumo que vai para o site: o fecho como ficou arquivado, sem os nomes dos clientes.
pub fn resumo_sem_dados_pessoais(instantaneo: &Value) -> Value {
    let mut v = instantaneo.clone();
    if let Some(l) = v["documentos_lista"].as_array_mut() {
        for d in l {
            if let Some(o) = d.as_object_mut() {
                o.remove("cliente");
            }
        }
    }
    for lista in ["documentos", "encomendas"] {
        if let Some(l) = v["online"][lista].as_array_mut() {
            for d in l {
                if let Some(o) = d.as_object_mut() {
                    o.remove("cliente");
                }
            }
        }
    }
    // a ficha da empresa e o arquivo local (impressões, quem as fez, o ficheiro) não interessam ao site
    if let Some(o) = v.as_object_mut() {
        o.remove("empresa");
        o.remove("arquivo");
    }
    v
}

/// Os fechos devidos, já como itens do lote.
pub async fn devidos(pool: &SqlitePool, agora: i64, limite: i64) -> AppResult<(Vec<(i64, i64)>, Vec<Value>)> {
    let linhas: Vec<Linha> = sqlx::query_as(
        "SELECT q.fecho_id, q.tentativas, f.sessao_id, f.numero_z, f.instantaneo, f.selo, f.reconstruido
         FROM sinc_fechos q JOIN caixa_fechos f ON f.id = q.fecho_id
         WHERE q.estado = 'pendente' AND q.proximo_em <= ? ORDER BY q.fecho_id LIMIT ?",
    )
    .bind(agora)
    .bind(limite)
    .fetch_all(pool)
    .await?;
    let mut pendentes = Vec::with_capacity(linhas.len());
    let mut itens = Vec::with_capacity(linhas.len());
    for (fecho_id, tentativas, sessao_id, numero_z, texto, selo, reconstruido) in linhas {
        let instantaneo: Value = serde_json::from_str(&texto).unwrap_or(Value::Null);
        let resumo = resumo_sem_dados_pessoais(&instantaneo);
        let s = &instantaneo["sessao"];
        // as encomendas que este Z fechou: o site marca-as como fechadas
        let encomendas: Vec<Value> = instantaneo["online"]["encomendas"].as_array().into_iter().flatten().filter_map(|e| e["numero"].as_str()).map(|n| json!(n)).collect();
        itens.push(json!({
            "tipo": "fecho",
            "fecho": {
                "fecho_id": fecho_id,
                "sessao_id": sessao_id,
                "numero_z": numero_z,
                "posto": s["posto"],
                "armazem_id": s["armazem_id"],
                "aberta_em": s["aberta_em"],
                "fechada_em": s["fechada_em"],
                "operador": s["utilizador"],
                "fechado_por": s["fechado_por"],
                "total_vendido": instantaneo["total_vendido"],
                "numerario_esperado": instantaneo["numerario_esperado"],
                "valor_contado": s["valor_contado"],
                "online_total": instantaneo["online"]["total"],
                "online_incluidas": instantaneo["online"]["incluidas"],
                "reconstruido": reconstruido == 1,
                "selo": selo,
                "selo_resumo": Sha256::digest(resumo.to_string().as_bytes()).iter().map(|b| format!("{b:02x}")).collect::<String>(),
                "resumo": resumo,
                "encomendas": encomendas,
            },
        }));
        pendentes.push((fecho_id, tentativas));
    }
    Ok((pendentes, itens))
}

/// Os erros que o centro devolveu para fechos (pela chave `fecho_id`).
pub fn erros_do_resultado(resultado: &Value) -> HashMap<i64, String> {
    resultado["erros"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|e| e["tipo"] == "fecho")
        .filter_map(|e| Some((e["fecho_id"].as_i64()?, e["erro"].as_str().unwrap_or("erro").to_string())))
        .collect()
}

/// Depois de o centro responder: os que seguiram ficam feitos; os recusados esperam cada vez mais.
pub async fn concluir(pool: &SqlitePool, pendentes: &[(i64, i64)], erros: &HashMap<i64, String>, agora: i64) -> AppResult<()> {
    let feito = crate::db::agora();
    for (fecho_id, tentativas) in pendentes {
        match erros.get(fecho_id) {
            Some(erro) => {
                sqlx::query("UPDATE sinc_fechos SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE fecho_id = ?")
                    .bind(super::proxima_tentativa(*tentativas, agora))
                    .bind(erro.chars().take(300).collect::<String>())
                    .bind(fecho_id)
                    .execute(pool)
                    .await?;
            }
            None => {
                sqlx::query("UPDATE sinc_fechos SET estado = 'feito', feito_em = ?, erro = '' WHERE fecho_id = ?")
                    .bind(&feito)
                    .bind(fecho_id)
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

    #[test]
    fn o_resumo_para_o_site_vai_sem_os_nomes_dos_clientes() {
        let v = json!({
            "sessao": { "numero_z": 3 },
            "empresa": { "nome": "Loja" },
            "arquivo": { "selo": "x" },
            "documentos_lista": [{ "numero_doc": "FR A/1", "cliente": "Ana Silva", "total": 100 }],
            "online": { "documentos": [{ "numero_doc": "FR W/1", "cliente": "Rui" }], "encomendas": [{ "numero": "LIV-1", "cliente": "Rui" }], "total": 5 },
        });
        let r = resumo_sem_dados_pessoais(&v);
        let texto = r.to_string();
        assert!(!texto.contains("Ana Silva") && !texto.contains("Rui"), "{texto}");
        assert_eq!(r["documentos_lista"][0]["numero_doc"], "FR A/1");
        assert_eq!(r["online"]["encomendas"][0]["numero"], "LIV-1");
        assert!(r.get("empresa").is_none() && r.get("arquivo").is_none());
    }

    #[test]
    fn os_erros_dos_fechos_pela_chave_do_fecho() {
        let r = json!({ "erros": [{ "tipo": "fecho", "fecho_id": 7, "erro": "mau" }, { "tipo": "documento", "documento_id": 7, "erro": "outro" }] });
        let e = erros_do_resultado(&r);
        assert_eq!(e.len(), 1);
        assert_eq!(e.get(&7).map(String::as_str), Some("mau"));
    }
}
