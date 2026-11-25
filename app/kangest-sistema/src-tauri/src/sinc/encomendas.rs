// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Os documentos das encomendas online (docs/SINCRONIZACAO.md §Encomendas online; parte B do plano do ecossistema).
//!
//! - **O que o site manda.** Com «Emitir os documentos das encomendas online» ligado no painel, a resposta selada da
//!   sincronização traz `tarefas`: a NE de cada encomenda da loja, a FR quando o pagamento é confirmado no site, a NC
//!   dos reembolsos e a anulação das canceladas. Os corpos são os da ligação antiga (kangest.ts no site), no formato
//!   da API deste KanGest.
//! - **Quem emite.** A própria API, por dentro (`api::chamar_interno`), com a chave interna «Loja online (ligação ao
//!   site)»: as mesmas validações, permissões e `Idempotency-Key` de um pedido pela rede. A chave age em nome do
//!   utilizador e do posto escolhidos em Livraria → Ligação ao site, e vê-se (e desactiva-se) em API e Integrações.
//! - **O resultado** fica em `sinc_tarefas` e segue no pedido seguinte. Uma tarefa já feita não se emite outra vez; se
//!   o site a mandar de novo (o resultado perdeu-se), segue o mesmo resultado.
//! - Um pagamento nunca se confirma aqui: a FR só chega como tarefa depois de o site dizer que está pago.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Permissão para escolher quem emite (a mesma da ligação).
const PERMISSAO: &str = "sistema.api";
/// Resultados por lote (o centro aceita até 200 itens).
pub const LOTE: i64 = 100;

const SEM_QUEM_EMITA: &str = "Este KanGest ainda não tem quem emita as encomendas online: em Livraria → Ligação ao site, escolha o utilizador e o posto.";

/// Uma tarefa do site, já conferida.
#[derive(Debug, Clone, PartialEq)]
pub struct Tarefa {
    pub id: i64,
    pub accao: String,
    pub caminho: String,
    pub corpo: Value,
    pub idem: Option<String>,
}

/// Confere uma tarefa do site: só os pedidos que a ligação faz (`POST /documentos` com uma NE, uma FR ou uma NC, e
/// `POST /documentos/{id}/anular`). O canal já vem assinado e selado; isto é a defesa a seguir.
pub fn conferir(t: &Value) -> Result<Tarefa, String> {
    let id = t["id"].as_i64().filter(|i| *i > 0).ok_or_else(|| "Tarefa sem número.".to_string())?;
    let accao = t["accao"].as_str().unwrap_or_default();
    let caminho = t["caminho"].as_str().unwrap_or_default();
    if t["metodo"].as_str() != Some("POST") {
        return Err("Só se emitem documentos (POST).".into());
    }
    let corpo = t["corpo"].clone();
    if !corpo.is_object() {
        return Err("Tarefa sem corpo.".into());
    }
    match accao {
        "ne" | "fr" | "nc" => {
            let tipo = match accao {
                "ne" => "NE",
                "fr" => "FR",
                _ => "NC",
            };
            if caminho != "/documentos" || corpo["tipo"].as_str() != Some(tipo) {
                return Err(format!("A tarefa «{accao}» não é a emissão de um documento {tipo}."));
            }
        }
        "anular" => {
            let numero = caminho.strip_prefix("/documentos/").and_then(|r| r.strip_suffix("/anular")).unwrap_or_default();
            if numero.is_empty() || !numero.bytes().all(|b| b.is_ascii_digit()) {
                return Err("A anulação é para outro caminho.".into());
            }
        }
        _ => return Err(format!("Tarefa desconhecida: «{accao}».")),
    }
    let idem = t["idem"].as_str().map(str::trim).filter(|k| !k.is_empty()).map(str::to_string);
    Ok(Tarefa { id, accao: accao.to_string(), caminho: caminho.to_string(), corpo, idem })
}

/// O documento como segue para o site: o que a fila de lá guarda (como na ligação antiga).
fn documento(d: &Value) -> Value {
    json!({
        "id": d["id"], "numero_doc": d["numero_doc"], "total": d["total"], "armazem_id": d["armazem_id"],
        "estado": d["estado"], "hash_controlo": d["hash_controlo"], "fe": d["fe"],
    })
}

/// Emite as tarefas que o site mandou e guarda o resultado de cada uma (segue no pedido seguinte). Devolve quantos
/// resultados ficaram por enviar.
pub async fn executar(st: &AppState, tarefas: &Value) -> AppResult<usize> {
    let Some(lista) = tarefas.as_array().filter(|l| !l.is_empty()) else {
        return Ok(0);
    };
    let pool = &st.pool;
    let chave: Option<i64> = sqlx::query_scalar("SELECT encomendas_chave_id FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await?.flatten();
    let mut n = 0;
    for t in lista {
        let id = t["id"].as_i64().unwrap_or(0);
        if id <= 0 {
            continue;
        }
        // já feita: não se emite outra vez, o resultado volta a seguir; uma que falhou tenta-se de novo
        let antes: Option<i64> = sqlx::query_scalar("SELECT ok FROM sinc_tarefas WHERE id = ?").bind(id).fetch_optional(pool).await?;
        match antes {
            Some(1) => {
                sqlx::query("UPDATE sinc_tarefas SET enviado = 0 WHERE id = ?").bind(id).execute(pool).await?;
                n += 1;
                continue;
            }
            Some(_) => {
                sqlx::query("DELETE FROM sinc_tarefas WHERE id = ?").bind(id).execute(pool).await?;
            }
            None => {}
        }
        let accao = t["accao"].as_str().unwrap_or_default().chars().take(10).collect::<String>();
        let (ok, resultado) = match conferir(t) {
            Err(m) => (false, json!({ "erro": m, "estado": 400 })),
            Ok(tarefa) => match chave {
                None => (false, json!({ "erro": SEM_QUEM_EMITA, "estado": 409 })),
                Some(c) => match crate::api::chamar_interno(st, c, "POST", &tarefa.caminho, &tarefa.corpo, tarefa.idem.as_deref()).await {
                    Ok(d) => (true, json!({ "documento": documento(&d) })),
                    Err((estado, m)) => (false, json!({ "erro": m, "estado": estado })),
                },
            },
        };
        sqlx::query("INSERT INTO sinc_tarefas (id, accao, ok, resultado) VALUES (?, ?, ?, ?)")
            .bind(id)
            .bind(&accao)
            .bind(ok)
            .bind(resultado.to_string())
            .execute(pool)
            .await?;
        n += 1;
    }
    Ok(n)
}

/// Os resultados por enviar, como itens do lote (`{ tipo: "tarefa", id, ok, documento | erro, estado }`).
pub async fn resultados(pool: &SqlitePool) -> AppResult<(Vec<i64>, Vec<Value>)> {
    let linhas: Vec<(i64, i64, String)> = sqlx::query_as("SELECT id, ok, resultado FROM sinc_tarefas WHERE enviado = 0 ORDER BY id LIMIT ?")
        .bind(LOTE)
        .fetch_all(pool)
        .await?;
    let mut ids = Vec::with_capacity(linhas.len());
    let mut itens = Vec::with_capacity(linhas.len());
    for (id, ok, resultado) in linhas {
        let mut item = serde_json::from_str::<Value>(&resultado).unwrap_or_else(|_| json!({}));
        if let Value::Object(m) = &mut item {
            m.insert("tipo".into(), json!("tarefa"));
            m.insert("id".into(), json!(id));
            m.insert("ok".into(), json!(ok == 1));
        }
        ids.push(id);
        itens.push(item);
    }
    Ok((ids, itens))
}

/// O site recebeu os resultados: ficam marcados (e os de mais de 30 dias saem).
pub async fn marcar_enviados(pool: &SqlitePool, ids: &[i64]) -> AppResult<()> {
    for id in ids {
        sqlx::query("UPDATE sinc_tarefas SET enviado = 1 WHERE id = ?").bind(id).execute(pool).await?;
    }
    sqlx::query("DELETE FROM sinc_tarefas WHERE enviado = 1 AND feito_em < strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-30 days')")
        .execute(pool)
        .await?;
    Ok(())
}

/// Quantos resultados esperam por seguir (para o ciclo saber se há que enviar).
pub async fn por_enviar(pool: &SqlitePool) -> AppResult<i64> {
    Ok(sqlx::query_scalar("SELECT COUNT(*) FROM sinc_tarefas WHERE enviado = 0").fetch_one(pool).await?)
}

/// Ao desligar do site: a chave interna desactiva-se e os resultados por enviar saem (eram para o posto anterior).
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    let chave: Option<i64> = sqlx::query_scalar("SELECT encomendas_chave_id FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await?.flatten();
    if let Some(c) = chave {
        sqlx::query("UPDATE api_chaves SET ativa = 0 WHERE id = ?").bind(c).execute(pool).await?;
    }
    sqlx::query("DELETE FROM sinc_tarefas").execute(pool).await?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------
// O ecrã (Livraria → Ligação ao site → Encomendas online)
// ---------------------------------------------------------------------------------------------------------------

/// O estado: quem emite, as listas para escolher, o que já se fez e os erros recentes.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let pool = &st.pool;
    let chave = db::query_json(
        pool,
        "SELECT c.id, c.ativa, c.utilizador_id, u.nome AS utilizador, c.posto_id, p.descricao AS posto
           FROM sinc_ligacao l JOIN api_chaves c ON c.id = l.encomendas_chave_id
           JOIN utilizadores u ON u.id = c.utilizador_id LEFT JOIN postos p ON p.id = c.posto_id
          WHERE l.id = 1",
    )
    .await?;
    let chave = chave.as_array().and_then(|v| v.first()).cloned().unwrap_or(Value::Null);
    let utilizadores = db::query_json(pool, "SELECT id, nome, login FROM utilizadores WHERE ativo = 1 ORDER BY nome").await?;
    let postos = db::query_json(pool, "SELECT id, descricao FROM postos ORDER BY id").await?;
    let (feitas, com_erro): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(ok = 1), 0), COALESCE(SUM(ok = 0), 0) FROM sinc_tarefas
          WHERE feito_em >= strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-30 days')",
    )
    .fetch_one(pool)
    .await?;
    let falhas: Vec<(i64, String, String, String)> =
        sqlx::query_as("SELECT id, accao, resultado, feito_em FROM sinc_tarefas WHERE ok = 0 ORDER BY feito_em DESC LIMIT 10").fetch_all(pool).await?;
    let erros: Vec<Value> = falhas
        .into_iter()
        .map(|(id, accao, resultado, feito_em)| {
            let erro = serde_json::from_str::<Value>(&resultado).ok().and_then(|v| v["erro"].as_str().map(str::to_string)).unwrap_or_default();
            json!({ "id": id, "accao": accao, "erro": erro, "feito_em": feito_em })
        })
        .collect();
    Ok(json!({
        "chave": chave,
        "utilizadores": utilizadores,
        "postos": postos,
        "feitas": feitas,
        "com_erro": com_erro,
        "erros": erros,
        "por_enviar": por_enviar(pool).await?,
    }))
}

#[derive(Deserialize)]
pub struct ConfigurarIn {
    utilizador_id: i64,
    posto_id: i64,
}

/// Quem emite: cria (ou muda) a chave interna, em nome do utilizador e com a série do posto. Recusa um utilizador sem as
/// permissões que os documentos pedem (a API recusava-os depois, encomenda a encomenda).
pub async fn configurar(st: &AppState, c: ConfigurarIn) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let s = st.sessao()?;
    let pool = &st.pool;
    if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sinc_ligacao WHERE id = 1").fetch_one(pool).await? == 0 {
        return Err(AppError::msg("Ligue primeiro este KanGest ao site (acima)."));
    }
    let u: Option<(String, String, Option<String>, i64)> = sqlx::query_as("SELECT nome, perfil, permissoes, ativo FROM utilizadores WHERE id = ?")
        .bind(c.utilizador_id)
        .fetch_optional(pool)
        .await?;
    let Some((nome, perfil, proprias, ativo)) = u else {
        return Err(AppError::msg("Escolha um utilizador."));
    };
    if ativo == 0 {
        return Err(AppError::msg(format!("O utilizador {nome} está inactivo.")));
    }
    if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM postos WHERE id = ?").bind(c.posto_id).fetch_one(pool).await? == 0 {
        return Err(AppError::msg("Escolha o posto (a série e o armazém dos documentos)."));
    }
    let (_, tem) = crate::state::permissoes_efectivas(pool, &perfil, proprias.as_deref()).await;
    let faltam: Vec<&str> = crate::api::PERMISSOES_LOJA_ONLINE.iter().copied().filter(|p| !p.starts_with("api.") && !tem.iter().any(|t| t.as_str() == *p)).collect();
    if !faltam.is_empty() {
        return Err(AppError::msg(format!(
            "{nome} não tem todas as permissões dos documentos das encomendas online: falta {}. Dê-lhas em Utilizadores e Permissões, ou escolha outro.",
            faltam.join(", ")
        )));
    }
    let id = crate::api::chave_interna_loja(st, c.utilizador_id, c.posto_id, Some(s.id)).await?;
    sqlx::query("UPDATE sinc_ligacao SET encomendas_chave_id = ? WHERE id = 1").bind(id).execute(pool).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'SINC', ?)")
        .bind(s.id)
        .bind(format!("Encomendas online: emitidas em nome de {nome}, posto {}", c.posto_id))
        .execute(pool)
        .await?;
    estado(st).await
}

/// Deixa de emitir: a chave interna desactiva-se. As tarefas seguintes voltam ao site com o erro de quem emita.
pub async fn desligar(st: &AppState) -> AppResult<Value> {
    st.exigir_perm(PERMISSAO)?;
    let pool = &st.pool;
    let chave: Option<i64> = sqlx::query_scalar("SELECT encomendas_chave_id FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await?.flatten();
    if let Some(c) = chave {
        sqlx::query("UPDATE api_chaves SET ativa = 0 WHERE id = ?").bind(c).execute(pool).await?;
    }
    sqlx::query("UPDATE sinc_ligacao SET encomendas_chave_id = NULL WHERE id = 1").execute(pool).await?;
    estado(st).await
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn so_os_pedidos_da_ligacao() {
        let t = |accao: &str, caminho: &str, tipo: &str| json!({ "id": 7, "accao": accao, "metodo": "POST", "caminho": caminho, "corpo": { "tipo": tipo }, "idem": " ne-LIV-1 " });
        let ne = conferir(&t("ne", "/documentos", "NE")).unwrap();
        assert_eq!((ne.id, ne.accao.as_str(), ne.idem.as_deref()), (7, "ne", Some("ne-LIV-1")));
        assert!(conferir(&t("fr", "/documentos", "FR")).is_ok());
        assert!(conferir(&t("nc", "/documentos", "NC")).is_ok());
        assert!(conferir(&t("anular", "/documentos/55/anular", "")).is_ok());
        // outro tipo, outra rota, outro método, sem número
        assert!(conferir(&t("ne", "/documentos", "FR")).is_err());
        assert!(conferir(&t("fr", "/artigos", "FR")).is_err());
        assert!(conferir(&t("anular", "/documentos/55/../../x/anular", "")).is_err());
        assert!(conferir(&t("anular", "/documentos//anular", "")).is_err());
        assert!(conferir(&t("apagar", "/documentos", "NE")).is_err());
        assert!(conferir(&json!({ "id": 7, "accao": "ne", "metodo": "DELETE", "caminho": "/documentos", "corpo": { "tipo": "NE" } })).is_err());
        assert!(conferir(&json!({ "accao": "ne", "metodo": "POST", "caminho": "/documentos", "corpo": { "tipo": "NE" } })).is_err());
        assert!(conferir(&json!({ "id": 7, "accao": "ne", "metodo": "POST", "caminho": "/documentos", "corpo": "NE" })).is_err());
    }
}
