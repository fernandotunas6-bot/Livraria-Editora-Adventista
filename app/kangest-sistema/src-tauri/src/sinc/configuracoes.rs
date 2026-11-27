// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As configurações deste KanGest na base central (pedido do dono a 27/11: «migrar todos os dados actuais da loja
//! Huambo… configurações todas… permita que as configurações sejam guardadas no banco de dados»).
//!
//! Uma fotografia de tudo o que se configura:
//! - a empresa (com o logótipo, se for pequeno);
//! - as chaves da `config`;
//! - as tabelas de referência: armazéns, séries, famílias, taxas, modos de pagamento, moedas, tipos de documento,
//!   perfis, postos, contas, cupões, regras…
//!
//! **Nunca seguem:**
//! - os segredos: as chaves de `segredos::CHAVES`, as senhas, os PIN, os tokens e as chaves privadas
//!   (`auditoria::secreto`);
//! - o que é interno (a licença, o selo da auditoria);
//! - o que muda sozinho: o último número e o último hash das séries, as utilizações dos cupões, os últimos acessos.
//!
//! **Quando segue:** só quando muda, ou seja, quando o resumo SHA-256 da fotografia é diferente do último que o site
//! guardou. Sem Internet, espera. O site guarda as versões (`kangest_configuracoes`).

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::db;
use crate::error::AppResult;
use crate::services::auditoria;

/// As tabelas de referência que vão na fotografia (todas pequenas: dezenas ou centenas de linhas).
pub const TABELAS: [&str; 22] = [
    "armazens",
    "series",
    "familias",
    "subfamilias",
    "taxas_iva",
    "modos_pagamento",
    "moedas",
    "unidades",
    "prazos_pagamento",
    "motivos_isencao",
    "retencoes",
    "centros_custo",
    "tipos_documento",
    "tipos_custo",
    "perfis",
    "postos",
    "contas",
    "cupoes",
    "comissao_taxas",
    "regras_aprovacao",
    "promocao_regras",
    "relatorio_modelos",
];

/// Colunas que mudam sozinhas (a cada venda, a cada uso): ficam de fora, senão a fotografia mudava a cada documento.
const VOLATEIS: [&str; 4] = ["ultimo_numero", "ultimo_hash", "data_ultimo", "utilizacoes"];

/// Um texto maior do que isto (uma imagem, um ficheiro) segue só como marca. O logótipo da empresa tem o seu limite.
const MAX_TEXTO: usize = 20_000;
const MAX_LOGO: usize = 200_000;

/// A fotografia toda nunca passa disto: sem o logótipo, se for preciso.
pub const MAX_FOTOGRAFIA: usize = 300_000;

/// Uma chave da `config` que não segue: segredo, interna, ou estado que muda sozinho.
pub fn chave_fora(chave: &str) -> bool {
    let c = chave.to_ascii_lowercase();
    auditoria::secreto(&c)
        || auditoria::config_interna(&c)
        || ["agt.", "stock_livro.", "copias.ultima", "copias.erro", "teste", "sinc."].iter().any(|p| c.starts_with(p))
}

/// Uma coluna de uma tabela que não segue.
fn coluna_fora(nome: &str) -> bool {
    auditoria::secreto(nome) || auditoria::ignorado(nome) || VOLATEIS.contains(&nome)
}

/// O valor como segue: um texto grande vira marca (com o tamanho), excepto o logótipo até ao seu limite.
fn valor(nome: &str, v: Value) -> Value {
    match v {
        Value::String(t) if t.len() > MAX_TEXTO && (nome != "logo" || t.len() > MAX_LOGO) => json!(format!("(ficheiro com {} bytes)", t.len())),
        outro => outro,
    }
}

/// Uma linha sem as colunas que não seguem.
fn linha_limpa(v: Value) -> Value {
    match v {
        Value::Object(o) => Value::Object(o.into_iter().filter(|(k, _)| !coluna_fora(k)).map(|(k, v)| {
            let v = valor(&k, v);
            (k, v)
        }).collect()),
        outro => outro,
    }
}

/// A fotografia das configurações de agora.
pub async fn fotografia(pool: &SqlitePool) -> AppResult<Value> {
    let empresa = db::query_json(pool, "SELECT * FROM empresa WHERE id = 1").await?;
    let empresa = empresa.as_array().and_then(|l| l.first().cloned()).map(linha_limpa).unwrap_or(Value::Null);
    let pares: Vec<(String, String)> = sqlx::query_as("SELECT chave, valor FROM config ORDER BY chave").fetch_all(pool).await?;
    let mut config = Map::new();
    for (chave, v) in pares {
        if !chave_fora(&chave) {
            let v = valor(&chave, Value::String(v));
            config.insert(chave, v);
        }
    }
    let mut tabelas = Map::new();
    for t in TABELAS {
        let linhas = db::query_json(pool, &format!("SELECT * FROM {t} ORDER BY rowid")).await?;
        let linhas: Vec<Value> = linhas.as_array().cloned().unwrap_or_default().into_iter().map(linha_limpa).collect();
        tabelas.insert(t.to_string(), Value::Array(linhas));
    }
    let mut f = json!({ "versao": 1, "empresa": empresa, "config": config, "tabelas": tabelas });
    if serde_json::to_string(&f).map(|t| t.len()).unwrap_or(usize::MAX) > MAX_FOTOGRAFIA {
        if let Some(e) = f["empresa"].as_object_mut() {
            e.insert("logo".into(), json!("(logótipo grande: fica no computador)"));
        }
    }
    Ok(f)
}

/// O resumo SHA-256 (hex) de uma fotografia.
pub fn resumo(f: &Value) -> String {
    let texto = serde_json::to_string(f).unwrap_or_default();
    Sha256::digest(texto.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// A fotografia a enviar nesta volta, se mudou desde a última que o site guardou e se não está à espera depois de um
/// erro. Devolve o resumo e a fotografia.
pub async fn para_enviar(pool: &SqlitePool, agora: i64) -> AppResult<Option<(String, Value)>> {
    let Some((enviado, proximo)): Option<(String, i64)> =
        sqlx::query_as("SELECT configuracoes_resumo, configuracoes_proximo_em FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(pool).await?
    else {
        return Ok(None);
    };
    if proximo > agora {
        return Ok(None);
    }
    let f = fotografia(pool).await?;
    let r = resumo(&f);
    if r == enviado || serde_json::to_string(&f).map(|t| t.len()).unwrap_or(usize::MAX) > MAX_FOTOGRAFIA {
        return Ok(None);
    }
    Ok(Some((r, f)))
}

/// Depois da resposta: guardada, fica o resumo (não volta a seguir até mudar); senão, espera um pouco (cada vez mais).
pub async fn concluir(pool: &SqlitePool, enviado: &str, resposta: &Value, agora: i64) -> AppResult<()> {
    if resposta["guardadas"].as_bool() == Some(true) {
        sqlx::query("UPDATE sinc_ligacao SET configuracoes_resumo = ?, configuracoes_em = ?, configuracoes_tentativas = 0, configuracoes_proximo_em = 0, configuracoes_erro = '' WHERE id = 1")
            .bind(enviado)
            .bind(db::agora())
            .execute(pool)
            .await?;
    } else {
        adiar(pool, agora, resposta["erro"].as_str().unwrap_or("O site não guardou as configurações (versão antiga do site?).")).await?;
    }
    Ok(())
}

/// Um erro (ou o pedido inteiro recusado): a fotografia espera, cada vez mais.
pub async fn adiar(pool: &SqlitePool, agora: i64, erro: &str) -> AppResult<()> {
    let tentativas: i64 = sqlx::query_scalar("SELECT configuracoes_tentativas FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await?.unwrap_or(0);
    sqlx::query("UPDATE sinc_ligacao SET configuracoes_tentativas = configuracoes_tentativas + 1, configuracoes_proximo_em = ?, configuracoes_erro = ? WHERE id = 1")
        .bind(super::proxima_tentativa(tentativas, agora))
        .bind(erro.chars().take(300).collect::<String>())
        .execute(pool)
        .await?;
    Ok(())
}

/// Para o ecrã: quando seguiram da última vez e o último erro.
pub async fn estado(pool: &SqlitePool) -> AppResult<Value> {
    let r: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT configuracoes_em, configuracoes_erro FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await?;
    Ok(match r {
        Some((em, erro)) => json!({ "guardadas_em": em, "erro": erro }),
        None => json!({ "guardadas_em": null, "erro": "" }),
    })
}

/// «Enviar outra vez»: a fotografia segue na volta seguinte, mesmo sem ter mudado.
pub async fn repetir(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("UPDATE sinc_ligacao SET configuracoes_resumo = '', configuracoes_tentativas = 0, configuracoes_proximo_em = 0, configuracoes_erro = '' WHERE id = 1")
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn os_segredos_e_o_que_muda_sozinho_ficam_de_fora() {
        for k in ["email.senha", "fe.senha", "agt.chave_privada", "licenca.segredo", "web.token", "agt.versao_chave", "stock_livro.epoca", "copias.ultima"] {
            assert!(chave_fora(k), "{k}");
        }
        for k in ["vendas.precos_com_iva", "stock.sem_stock", "empresa.ramo", "fe.ambiente", "email", "balanca.regras"] {
            assert!(!chave_fora(k), "{k}");
        }
        let l = linha_limpa(json!({ "serie": "FR 2026", "ultimo_numero": 812, "ultimo_hash": "abc", "senha_hash": "x", "pin": "1234", "descricao": "Balcão" }));
        assert_eq!(l, json!({ "serie": "FR 2026", "descricao": "Balcão" }));
    }

    #[test]
    fn os_ficheiros_grandes_seguem_so_como_marca() {
        assert_eq!(valor("modelo", json!("x".repeat(MAX_TEXTO + 1))), json!(format!("(ficheiro com {} bytes)", MAX_TEXTO + 1)));
        let logo = "y".repeat(MAX_TEXTO + 10);
        assert_eq!(valor("logo", json!(logo.clone())), json!(logo), "o logótipo segue até ao seu limite");
        assert_eq!(valor("logo", json!("z".repeat(MAX_LOGO + 1))), json!(format!("(ficheiro com {} bytes)", MAX_LOGO + 1)));
    }

    #[test]
    fn o_resumo_muda_com_a_fotografia() {
        let a = json!({ "config": { "vendas.precos_com_iva": "1" } });
        let b = json!({ "config": { "vendas.precos_com_iva": "0" } });
        assert_eq!(resumo(&a), resumo(&a.clone()));
        assert_ne!(resumo(&a), resumo(&b));
        assert_eq!(resumo(&a).len(), 64);
    }
}
