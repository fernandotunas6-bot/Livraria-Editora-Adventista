// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As fichas para a base central (pedido do dono a 27/11; migração 0079; docs/KANGEST-SINCRONIZACAO.md §22).
//!
//! - **O que segue:** as entidades (clientes e fornecedores), os artigos com todos os campos e os utilizadores com as
//!   permissões. Nunca as senhas, os PIN nem os segredos dos dois passos: escolhem-se as colunas, não se manda a linha.
//! - **Como:** os gatilhos da 0079 marcam a ficha em `sinc_registos`. Cada volta leva até `LOTE`, no campo `registos`,
//!   com o estado de agora; o site guarda a cópia do posto (`public.kangest_registos`) e cifra os dados pessoais dos
//!   clientes (o NIF, os telefones, o email, a morada).
//! - **Sem Internet:** as linhas esperam na tabela; a volta seguinte manda o estado de então.
//! - **Feito:** a linha só sai se não mudou entretanto (`mudou` igual); um erro espera cada vez mais.

use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::AppResult;

/// Fichas por volta (o site aceita até 200).
pub const LOTE: i64 = 100;

/// Uma linha de `sinc_registos` que entrou num lote.
#[derive(Debug, Clone, PartialEq)]
pub struct Pendente {
    pub tipo: String,
    pub chave: i64,
    pub mudou: i64,
    pub tentativas: i64,
}

const ENTIDADE: &str = "SELECT id, tipo, nome, nif, endereco, localidade, provincia, pais, telefone, telefone2, email, pessoa_contacto,
        limite_credito, desconto, nivel_preco, ativo, observacoes, criado_em, alterado_em
   FROM entidades WHERE id = ?";

const ARTIGO: &str = "SELECT a.id, a.referencia, a.codigo_barras, a.codigo_balanca, a.descricao, a.descricao_curta, a.tipo,
        f.descricao AS familia, sf.descricao AS subfamilia, u.abreviatura AS unidade, t.percentagem AS taxa_iva,
        a.custo, a.custo_medio, a.preco1, a.preco2, a.preco3, a.preco4, a.qtd_minima, a.qtd_maxima, a.controla_stock,
        a.permite_negativo, a.controla_lote, a.composto, a.ativo, a.atributos, a.promo_desconto, a.promo_inicio, a.promo_fim,
        (SELECT COALESCE(SUM(s.quantidade), 0) FROM stock s WHERE s.artigo_id = a.id) AS stock_total, a.criado_em, a.alterado_em
   FROM artigos a
   LEFT JOIN familias f ON f.id = a.familia_id
   LEFT JOIN subfamilias sf ON sf.id = a.subfamilia_id
   LEFT JOIN unidades u ON u.id = a.unidade_id
   LEFT JOIN taxas_iva t ON t.id = a.taxa_iva_id
  WHERE a.id = ?";

const UTILIZADOR: &str = "SELECT u.id, u.nome, u.login, u.email, u.telefone, u.perfil, u.ativo, ar.nome AS loja, u.conta_site, u.permissoes,
        u.limite_desconto, u.ultimo_acesso, u.criado_em
   FROM utilizadores u LEFT JOIN armazens ar ON ar.id = u.armazem_id
  WHERE u.id = ?";

/// A ficha de agora, só com as colunas escolhidas (`None` se já não existe).
async fn ficha(pool: &SqlitePool, tipo: &str, chave: i64) -> AppResult<Option<Value>> {
    let sql = match tipo {
        "entidade" => ENTIDADE,
        "artigo" => ARTIGO,
        "utilizador" => UTILIZADOR,
        _ => return Ok(None),
    };
    let linha = sqlx::query(sql).bind(chave).fetch_optional(pool).await?;
    Ok(linha.map(|l| {
        let mut v = db::row_json(&l);
        // os dados do ramo e as permissões vêm em texto JSON: seguem como objecto
        for campo in ["atributos", "permissoes"] {
            if let Some(t) = v.get(campo).and_then(Value::as_str) {
                v[campo] = serde_json::from_str(t).unwrap_or(Value::Null);
            }
        }
        v
    }))
}

/// Todas as fichas para a fila (ao ligar).
pub async fn enfileirar_tudo(pool: &SqlitePool) -> AppResult<i64> {
    let mut n = 0;
    for (tipo, sql) in [
        ("entidade", "SELECT id FROM entidades WHERE id <> 1"),
        ("artigo", "SELECT id FROM artigos"),
        ("utilizador", "SELECT id FROM utilizadores"),
    ] {
        let r = sqlx::query(&format!("INSERT INTO sinc_registos (tipo, chave) SELECT '{tipo}', id FROM ({sql}) ON CONFLICT (tipo, chave) DO NOTHING"))
            .execute(pool)
            .await?;
        n += r.rows_affected() as i64;
    }
    Ok(n)
}

/// As devidas agora e os itens do lote. Uma ficha que já não existe sai da fila sem seguir.
pub async fn devidos(pool: &SqlitePool, agora: i64, limite: i64) -> AppResult<(Vec<Pendente>, Vec<Value>)> {
    let linhas: Vec<(String, i64, i64, i64)> =
        sqlx::query_as("SELECT tipo, chave, mudou, tentativas FROM sinc_registos WHERE proximo_em <= ? ORDER BY tentativas, tipo, chave LIMIT ?")
            .bind(agora)
            .bind(limite)
            .fetch_all(pool)
            .await?;
    let mut pendentes = Vec::with_capacity(linhas.len());
    let mut itens = Vec::with_capacity(linhas.len());
    for (tipo, chave, mudou, tentativas) in linhas {
        match ficha(pool, &tipo, chave).await? {
            Some(dados) => {
                itens.push(json!({ "registo": tipo, "chave": chave, "dados": dados }));
                pendentes.push(Pendente { tipo, chave, mudou, tentativas });
            }
            None => {
                sqlx::query("DELETE FROM sinc_registos WHERE tipo = ? AND chave = ? AND mudou = ?").bind(&tipo).bind(chave).bind(mudou).execute(pool).await?;
            }
        }
    }
    Ok((pendentes, itens))
}

/// Os erros do site, por ficha (`registos.erros`: `[{registo, chave, erro}]`).
pub fn erros_da_resposta(resposta: &Value) -> HashMap<(String, i64), String> {
    resposta["erros"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|e| Some(((e["registo"].as_str()?.to_string(), e["chave"].as_i64()?), e["erro"].as_str().unwrap_or("erro").to_string())))
        .collect()
}

/// Depois de o site responder: as que seguiram saem (se não mudaram entretanto); as recusadas esperam cada vez mais. Um
/// site sem resposta para as fichas (antigo) conta como erro de todas.
pub async fn concluir(pool: &SqlitePool, pendentes: &[Pendente], resposta: &Value, agora: i64) -> AppResult<()> {
    if !resposta.is_object() {
        return adiar(pool, pendentes, agora, "O site não respondeu às fichas.").await;
    }
    let erros = erros_da_resposta(resposta);
    for p in pendentes {
        match erros.get(&(p.tipo.clone(), p.chave)) {
            Some(erro) => {
                sqlx::query("UPDATE sinc_registos SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE tipo = ? AND chave = ?")
                    .bind(super::proxima_tentativa(p.tentativas, agora))
                    .bind(erro.chars().take(300).collect::<String>())
                    .bind(&p.tipo)
                    .bind(p.chave)
                    .execute(pool)
                    .await?;
            }
            None => {
                sqlx::query("DELETE FROM sinc_registos WHERE tipo = ? AND chave = ? AND mudou = ?").bind(&p.tipo).bind(p.chave).bind(p.mudou).execute(pool).await?;
            }
        }
    }
    Ok(())
}

/// O pedido inteiro foi recusado, ou o site não respondeu às fichas: as do lote esperam, cada vez mais.
pub async fn adiar(pool: &SqlitePool, pendentes: &[Pendente], agora: i64, erro: &str) -> AppResult<()> {
    for p in pendentes {
        sqlx::query("UPDATE sinc_registos SET tentativas = tentativas + 1, proximo_em = ?, erro = ? WHERE tipo = ? AND chave = ?")
            .bind(super::proxima_tentativa(p.tentativas, agora))
            .bind(erro)
            .bind(&p.tipo)
            .bind(p.chave)
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// Quantas estão devidas agora (para o ciclo saber se há que enviar).
pub async fn devidos_agora(pool: &SqlitePool, agora: i64) -> AppResult<i64> {
    Ok(sqlx::query_scalar("SELECT COUNT(*) FROM sinc_registos WHERE proximo_em <= ?").bind(agora).fetch_one(pool).await?)
}

/// Para o ecrã: as por enviar (por tipo) e as com erro.
pub async fn contagem(pool: &SqlitePool) -> AppResult<Value> {
    let (pendentes, com_erro): (i64, i64) = sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(erro <> ''), 0) FROM sinc_registos").fetch_one(pool).await?;
    Ok(json!({ "pendentes": pendentes, "com_erro": com_erro }))
}

/// «Repetir»: as que o site recusou voltam já.
pub async fn repetir(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("UPDATE sinc_registos SET tentativas = 0, proximo_em = 0, erro = '' WHERE erro <> ''").execute(pool).await?;
    Ok(())
}

/// Ao desligar, ou ao ligar a outro posto: o que estava por enviar era para o posto anterior.
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM sinc_registos").execute(pool).await?;
    Ok(())
}
