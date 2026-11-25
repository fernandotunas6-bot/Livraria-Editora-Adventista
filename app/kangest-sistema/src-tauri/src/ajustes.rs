// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Ajustes de dados entre versões (docs/BASE-DE-DADOS.md, «Ajustes de dados»).
//!
//! As migrações (`migrations/`) mudam o esquema e o que se faz em SQL. O que precisa do programa (preencher um valor
//! novo, recalcular, recifrar) vai aqui, numa lista por ordem, e corre no arranque, logo depois das migrações:
//!
//! - cada ajuste corre **uma vez**, na sua transacção, e fica na tabela `ajustes_dados` (migração 0060) e na auditoria;
//! - antes do primeiro ajuste por fazer tira-se uma cópia de segurança da base;
//! - um ajuste que falhe desfaz o que fez, fica com o erro e volta a tentar-se no arranque seguinte (ou no «Tentar outra
//!   vez» de Sobre o KanGest), sem impedir o programa de abrir; os que vêm depois dele esperam por ele.
//!
//! Para acrescentar um ajuste: vai para o fim de `AJUSTES`, com um nome que nunca muda; tem de servir a uma base nova
//! (sem dados) e a uma antiga; e nunca mexe em documentos assinados — os gatilhos da 0018 recusam, e bem.

use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use serde_json::{json, Value};
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::AppResult;

/// O que um ajuste devolve: o que fez, em poucas palavras (fica na tabela e na auditoria).
type Futuro<'a> = Pin<Box<dyn Future<Output = AppResult<String>> + Send + 'a>>;

pub struct Ajuste {
    /// A chave na tabela: nunca muda depois de publicado.
    pub nome: &'static str,
    /// A versão do KanGest que trouxe o ajuste.
    pub versao: &'static str,
    /// O que faz, para o ecrã.
    pub descricao: &'static str,
    /// Corre dentro da transacção do ajuste.
    correr: for<'a> fn(&'a mut SqliteConnection) -> Futuro<'a>,
}

/// Os ajustes, pela ordem em que correm. Os novos vão para o fim.
pub const AJUSTES: &[Ajuste] = &[Ajuste {
    nome: "1.4.5-verificacao-depois-de-actualizar",
    versao: "1.4.5",
    descricao: "Liga a verificação da base depois de cada actualização (opção nova da 1.4.5), se ainda ninguém a escolheu.",
    correr: verificacao_ligada,
}];

/// 1.4.5: a opção nova «Verificar sozinho depois de cada actualização» fica escrita na configuração, ligada, como as
/// outras opções por omissão. Quem já a escolheu (ligada ou desligada) fica como estava.
fn verificacao_ligada(c: &mut SqliteConnection) -> Futuro<'_> {
    Box::pin(async move {
        let n = sqlx::query("INSERT OR IGNORE INTO config (chave, valor) VALUES (?, '1')")
            .bind(crate::services::verificacao::CHAVE_AUTOMATICA)
            .execute(&mut *c)
            .await?
            .rows_affected();
        Ok(if n > 0 { "Ligada, por omissão." } else { "Já estava escolhida: ficou como estava." }.to_string())
    })
}

/// Os ajustes já aplicados nesta base.
async fn aplicados(pool: &SqlitePool) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT nome FROM ajustes_dados WHERE aplicado_em IS NOT NULL").fetch_all(pool).await?)
}

/// Corre os ajustes por aplicar, por ordem. Com `pasta_dados`, faz antes uma cópia de segurança da base. Um ajuste que
/// falhe não faz falhar a chamada: o erro fica na tabela e devolve-se no resumo.
pub async fn aplicar(pool: &SqlitePool, pasta_dados: Option<&Path>) -> AppResult<Value> {
    aplicar_lista(pool, AJUSTES, pasta_dados).await
}

async fn aplicar_lista(pool: &SqlitePool, lista: &[Ajuste], pasta_dados: Option<&Path>) -> AppResult<Value> {
    let feitos = aplicados(pool).await?;
    let pendentes: Vec<&Ajuste> = lista.iter().filter(|a| !feitos.iter().any(|f| f == a.nome)).collect();
    if pendentes.is_empty() {
        return Ok(json!({ "aplicados": 0, "pendentes": 0 }));
    }
    // numa base ainda por configurar (sem empresa) não há nada a guardar
    let empresa: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM empresa").fetch_one(pool).await?;
    if let Some(dir) = pasta_dados.filter(|_| empresa > 0) {
        // a cópia é uma garantia a mais (cada ajuste já se desfaz sozinho se falhar): sem ela, os ajustes correm na mesma
        if let Err(e) = crate::services::sistema::fazer_copia(pool, dir, "Cópia antes dos ajustes de dados").await {
            eprintln!("Ajustes de dados: a cópia de antes não se fez ({e}).");
        }
    }
    let mut n = 0;
    let mut falha = None;
    for a in &pendentes {
        if let Err(e) = correr_um(pool, a).await {
            let erro = e.to_string();
            registar_falha(pool, a, &erro).await;
            falha = Some((a.nome, erro));
            break;
        }
        n += 1;
    }
    if let Err(e) = crate::auditoria::selar(pool).await {
        eprintln!("Ajustes de dados: as linhas da auditoria ficaram por selar ({e}).");
    }
    Ok(match falha {
        Some((nome, erro)) => json!({ "aplicados": n, "pendentes": pendentes.len() - n, "falhou": nome, "erro": erro }),
        None => json!({ "aplicados": n, "pendentes": 0 }),
    })
}

/// Um ajuste, na sua transacção: o ajuste, a linha na tabela e a da auditoria entram juntos ou não entra nada.
async fn correr_um(pool: &SqlitePool, a: &Ajuste) -> AppResult<()> {
    let mut tx = crate::db::transacao(pool).await?;
    // já dentro da transacção de escrita: dois arranques ao mesmo tempo não correm o mesmo ajuste duas vezes
    let feito: Option<Option<String>> = sqlx::query_scalar("SELECT aplicado_em FROM ajustes_dados WHERE nome = ?").bind(a.nome).fetch_optional(&mut *tx).await?;
    if matches!(feito, Some(Some(_))) {
        return Ok(());
    }
    let resultado = match (a.correr)(&mut *tx).await {
        Ok(r) => r,
        Err(e) => {
            tx.rollback().await.ok();
            return Err(e);
        }
    };
    let agora = crate::db::agora();
    sqlx::query(
        "INSERT INTO ajustes_dados (nome, versao, aplicado_em, resultado, erro, tentativas, tentado_em) VALUES (?1, ?2, ?3, ?4, NULL, 1, ?3)
         ON CONFLICT(nome) DO UPDATE SET versao = excluded.versao, aplicado_em = excluded.aplicado_em, resultado = excluded.resultado,
           erro = NULL, tentativas = ajustes_dados.tentativas + 1, tentado_em = excluded.tentado_em",
    )
    .bind(a.nome)
    .bind(a.versao)
    .bind(&agora)
    .bind(&resultado)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (NULL, 'AJUSTE_DADOS', ?)")
        .bind(format!("{} ({}): {resultado}", a.nome, a.versao))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// A falha fica registada (fora da transacção do ajuste, que se desfez) e volta a tentar-se no arranque seguinte.
async fn registar_falha(pool: &SqlitePool, a: &Ajuste, erro: &str) {
    eprintln!("Ajuste de dados {} falhou: {erro}. Volta a tentar-se no próximo arranque.", a.nome);
    let r = sqlx::query(
        "INSERT INTO ajustes_dados (nome, versao, aplicado_em, resultado, erro, tentativas, tentado_em) VALUES (?1, ?2, NULL, NULL, ?3, 1, ?4)
         ON CONFLICT(nome) DO UPDATE SET erro = excluded.erro, tentativas = ajustes_dados.tentativas + 1, tentado_em = excluded.tentado_em",
    )
    .bind(a.nome)
    .bind(a.versao)
    .bind(erro)
    .bind(crate::db::agora())
    .execute(pool)
    .await;
    let r2 = sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (NULL, 'AJUSTE_DADOS_FALHOU', ?)")
        .bind(format!("{} ({}): {erro}", a.nome, a.versao))
        .execute(pool)
        .await;
    if let Err(e) = r.and(r2) {
        eprintln!("Ajuste de dados {}: a falha não ficou registada ({e}).", a.nome);
    }
}

/// Para o ecrã: cada ajuste da lista com o seu estado (aplicado, falhou ou por aplicar), e os que a base conhece de
/// outra versão (uma base que já passou por uma versão mais recente).
pub async fn listar(pool: &SqlitePool) -> AppResult<Value> {
    let linhas = crate::db::query_json(pool, "SELECT nome, versao, aplicado_em, resultado, erro, tentativas, tentado_em FROM ajustes_dados ORDER BY nome").await?;
    let linhas = linhas.as_array().cloned().unwrap_or_default();
    let mut v: Vec<Value> = AJUSTES
        .iter()
        .map(|a| {
            let l = linhas.iter().find(|l| l["nome"] == a.nome).cloned().unwrap_or(Value::Null);
            let estado = if !l["aplicado_em"].is_null() {
                "aplicado"
            } else if !l["erro"].is_null() {
                "falhou"
            } else {
                "por_aplicar"
            };
            json!({
                "nome": a.nome, "versao": a.versao, "descricao": a.descricao, "estado": estado,
                "aplicado_em": l["aplicado_em"], "resultado": l["resultado"], "erro": l["erro"],
                "tentativas": l["tentativas"].as_i64().unwrap_or(0), "tentado_em": l["tentado_em"],
            })
        })
        .collect();
    for l in linhas.iter().filter(|l| !AJUSTES.iter().any(|a| l["nome"] == a.nome)) {
        let mut x = l.clone();
        x["estado"] = json!("desconhecido");
        x["descricao"] = json!("Ajuste de outra versão do KanGest.");
        v.push(x);
    }
    Ok(Value::Array(v))
}

#[cfg(test)]
mod testes {
    use super::*;

    fn pasta(nome: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("kangest-ajustes-{nome}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn conta_um(c: &mut SqliteConnection) -> Futuro<'_> {
        Box::pin(async move {
            sqlx::query("INSERT INTO config (chave, valor) VALUES ('teste.ajuste', '1') ON CONFLICT(chave) DO UPDATE SET valor = CAST(valor AS INTEGER) + 1")
                .execute(&mut *c)
                .await?;
            Ok("contado".to_string())
        })
    }

    /// Escreve antes de falhar: o que escreveu tem de se desfazer.
    fn falha(c: &mut SqliteConnection) -> Futuro<'_> {
        Box::pin(async move {
            sqlx::query("INSERT INTO config (chave, valor) VALUES ('teste.meio_feito', '1')").execute(&mut *c).await?;
            Err(crate::error::AppError::msg("falhou de propósito"))
        })
    }

    async fn valor(pool: &SqlitePool, chave: &str) -> Option<String> {
        sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(chave).fetch_optional(pool).await.unwrap()
    }

    /// Um ajuste que falha desfaz o que fez, fica com o erro, segura os que vêm depois e volta a tentar-se; quando passa,
    /// corre uma vez só.
    #[tokio::test]
    async fn um_ajuste_que_falha_volta_a_tentar_e_os_outros_esperam() {
        let d = pasta("falha");
        let pool = crate::db::abrir(&d.join("kigest.db")).await.unwrap();
        let com_falha = [
            Ajuste { nome: "t-1", versao: "9.9.9", descricao: "conta", correr: conta_um },
            Ajuste { nome: "t-2", versao: "9.9.9", descricao: "falha", correr: falha },
            Ajuste { nome: "t-3", versao: "9.9.9", descricao: "conta", correr: conta_um },
        ];
        let r = aplicar_lista(&pool, &com_falha, None).await.unwrap();
        assert_eq!(r["aplicados"], 1, "{r}");
        assert_eq!(r["falhou"], "t-2");
        assert_eq!(valor(&pool, "teste.ajuste").await.as_deref(), Some("1"), "o t-3 espera pelo t-2");
        assert!(valor(&pool, "teste.meio_feito").await.is_none(), "o que o t-2 escreveu desfez-se");
        let (erro, tentativas): (Option<String>, i64) = sqlx::query_as("SELECT erro, tentativas FROM ajustes_dados WHERE nome = 't-2' AND aplicado_em IS NULL").fetch_one(&pool).await.unwrap();
        assert!(erro.unwrap().contains("de propósito"));
        assert_eq!(tentativas, 1);
        // no arranque seguinte volta a tentar (e a falhar): mais uma tentativa, o t-1 não corre outra vez
        aplicar_lista(&pool, &com_falha, None).await.unwrap();
        let tentativas: i64 = sqlx::query_scalar("SELECT tentativas FROM ajustes_dados WHERE nome = 't-2'").fetch_one(&pool).await.unwrap();
        assert_eq!(tentativas, 2);
        assert_eq!(valor(&pool, "teste.ajuste").await.as_deref(), Some("1"));
        // corrigido o ajuste (a versão seguinte), passa; o t-3 corre a seguir; e nada corre duas vezes
        let corrigida = [
            Ajuste { nome: "t-1", versao: "9.9.9", descricao: "conta", correr: conta_um },
            Ajuste { nome: "t-2", versao: "9.9.10", descricao: "agora conta", correr: conta_um },
            Ajuste { nome: "t-3", versao: "9.9.9", descricao: "conta", correr: conta_um },
        ];
        let r = aplicar_lista(&pool, &corrigida, None).await.unwrap();
        assert_eq!(r["aplicados"], 2, "{r}");
        assert_eq!(valor(&pool, "teste.ajuste").await.as_deref(), Some("3"));
        let (erro, tentativas): (Option<String>, i64) = sqlx::query_as("SELECT erro, tentativas FROM ajustes_dados WHERE nome = 't-2' AND aplicado_em IS NOT NULL").fetch_one(&pool).await.unwrap();
        assert!(erro.is_none());
        assert_eq!(tentativas, 3);
        assert_eq!(aplicar_lista(&pool, &corrigida, None).await.unwrap()["aplicados"], 0);
        assert_eq!(valor(&pool, "teste.ajuste").await.as_deref(), Some("3"));
        let falhas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM auditoria WHERE acao = 'AJUSTE_DADOS_FALHOU'").fetch_one(&pool).await.unwrap();
        assert_eq!(falhas, 2);
        pool.close().await;
        let _ = std::fs::remove_dir_all(&d);
    }
}
