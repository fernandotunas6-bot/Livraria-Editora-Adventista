// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O Centro de Integrações (parte D do plano): numa só vista, cada ligação do KanGest com o mundo, com o estado, o que
//! está por enviar ou falhou, e o ecrã onde se resolve: o site da livraria (os postos), a API de integração, os avisos
//! automáticos (webhooks), a facturação electrónica da AGT, a importação automática do KIGEST e o acesso pela Internet.
//!
//! **Só lê a base deste computador**: rápido, sem esperar por ninguém, e funciona sem Internet. «Repetir» e «Testar»
//! ficam nos ecrãs de cada ligação, onde já estavam. Cada pessoa só vê as ligações das suas permissões.

use serde_json::{json, Value};

use crate::error::AppResult;
use crate::state::AppState;

/// O estado de uma ligação, do pior para o melhor (para ordenar e para a cor).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Estado {
    Erro,
    Atencao,
    Ok,
    Desligada,
}

impl Estado {
    fn nome(self) -> &'static str {
        match self {
            Estado::Erro => "erro",
            Estado::Atencao => "atencao",
            Estado::Ok => "ok",
            Estado::Desligada => "desligada",
        }
    }
}

fn cartao(id: &str, nome: &str, estado: Estado, resumo: String, detalhes: Vec<String>, destino: &str) -> (Estado, Value) {
    (estado, json!({ "id": id, "nome": nome, "estado": estado.nome(), "resumo": resumo, "detalhes": detalhes, "destino": destino }))
}

/// O estado do site da livraria pelas filas: erro com um erro da ligação ou documentos com erro; atenção com muito por
/// enviar ou alterações de encomendas à espera.
pub fn estado_do_site(activa: bool, erro_ligacao: bool, com_erro: i64, por_enviar: i64, comandos: i64) -> Estado {
    if !activa {
        Estado::Desligada
    } else if erro_ligacao || com_erro > 0 {
        Estado::Erro
    } else if por_enviar > 50 || comandos > 0 {
        Estado::Atencao
    } else {
        Estado::Ok
    }
}

pub async fn resumo(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let p = &st.pool;
    let mut v: Vec<(Estado, Value)> = Vec::new();

    if s.tem("sistema.api") {
        // o site da livraria (os postos: documentos, catálogo, fechos e as alterações das encomendas)
        let lig: Option<(i64, String, String, Option<String>, String)> =
            sqlx::query_as("SELECT ativa, posto_nome, loja, ultima_sinc, ultimo_erro FROM sinc_ligacao WHERE id = 1").fetch_optional(p).await?;
        let (pendentes, com_erro): (i64, i64) =
            sqlx::query_as("SELECT COALESCE(SUM(estado = 'pendente'), 0), COALESCE(SUM(estado = 'erro'), 0) FROM sinc_saida").fetch_one(p).await?;
        let catalogo: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_catalogo WHERE erro <> ''").fetch_one(p).await?;
        let fechos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_fechos WHERE erro <> '' AND feito_em IS NULL").fetch_one(p).await?;
        let comandos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM loja_comandos WHERE estado <> 'feito'").fetch_one(p).await?;
        let activa = lig.as_ref().is_some_and(|l| l.0 == 1);
        let erro_ligacao = lig.as_ref().map(|l| l.4.trim().to_string()).filter(|e| !e.is_empty());
        let estado = estado_do_site(activa, erro_ligacao.is_some(), com_erro + catalogo + fechos, pendentes, comandos);
        let resumo = match &lig {
            Some(l) if activa => format!("Posto «{}»{} · última sincronização {}", l.1, if l.2.is_empty() { String::new() } else { format!(" ({})", l.2) }, l.3.as_deref().unwrap_or("ainda nenhuma")),
            _ => "Este KanGest não está ligado ao site.".into(),
        };
        let mut d = Vec::new();
        if let Some(e) = erro_ligacao.filter(|_| activa) {
            d.push(format!("Erro da ligação: {e}"));
        }
        for (n, texto) in [
            (pendentes, "documento(s) por enviar"),
            (com_erro, "documento(s) com erro"),
            (catalogo, "artigo(s) do catálogo com erro"),
            (fechos, "fecho(s) de caixa com erro"),
            (comandos, "alteração(ões) de encomendas à espera"),
        ] {
            if n > 0 && activa {
                d.push(format!("{n} {texto}"));
            }
        }
        v.push(cartao("site", "Site da livraria", estado, resumo, d, "/ligacao-site"));

        // o servidor central (KANGEST ONE): a versão mínima que o site aceita e o livro único de stock
        if activa {
            let minima: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'site.kangest_min_version'").fetch_optional(p).await?;
            let abaixo = crate::sinc::versao::desactualizado(p).await;
            let livro = crate::sinc::livro::contagem(p).await?;
            let erros_livro = livro["com_erro"].as_i64().unwrap_or(0);
            let estado = if abaixo.is_some() {
                Estado::Erro
            } else if erros_livro > 0 {
                Estado::Atencao
            } else {
                Estado::Ok
            };
            let resumo = match &abaixo {
                Some(m) => format!("Este KanGest ({}) está abaixo da versão mínima do site ({m}): só consulta até ser actualizado.", crate::sinc::versao::ESTA),
                None => format!("KanGest {}{}", crate::sinc::versao::ESTA, minima.as_deref().map(|m| format!(" · o site pede {m} ou mais recente")).unwrap_or_default()),
            };
            let mut d = Vec::new();
            if livro["aberto"].as_bool() != Some(true) {
                d.push("Livro de stock: à espera da abertura (na volta seguinte)".to_string());
            } else {
                let abertura = livro["abertura"].as_i64().unwrap_or(0);
                if abertura > 0 {
                    d.push(format!("Livro de stock: {abertura} abertura(s) por enviar"));
                }
                d.push(format!("Livro de stock: {} movimento(s) na fila", livro["fila"].as_i64().unwrap_or(0)));
            }
            if erros_livro > 0 {
                d.push(format!("{erros_livro} movimento(s) de stock recusado(s) pelo site"));
            }
            v.push(cartao("servidor", "Servidor central", estado, resumo, d, if abaixo.is_some() { "/sobre" } else { "/ligacao-site" }));
        }

        // a API de integração
        let chaves: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_chaves WHERE ativa = 1 AND revogada_em IS NULL").fetch_one(p).await?;
        let (pedidos, falhados): (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(SUM(estado >= 500), 0) FROM api_pedidos WHERE data_hora >= strftime('%Y-%m-%d', 'now', 'localtime', '-1 day')",
        )
        .fetch_one(p)
        .await?;
        let estado = if chaves == 0 { Estado::Desligada } else if falhados > 0 { Estado::Atencao } else { Estado::Ok };
        let mut d = vec![format!("{pedidos} pedido(s) desde ontem")];
        if falhados > 0 {
            d.push(format!("{falhados} com erro do KanGest (5xx)"));
        }
        v.push(cartao("api", "API de integração", estado, format!("{chaves} chave(s) activa(s)"), d, "/integracoes"));

        // os avisos automáticos (webhooks)
        let (activos, a_falhar): (i64, i64) =
            sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(falhas_seguidas >= 3), 0) FROM api_webhooks WHERE ativo = 1").fetch_one(p).await?;
        let (falhadas, por_entregar): (i64, i64) =
            sqlx::query_as("SELECT COALESCE(SUM(estado = 'FALHADA'), 0), COALESCE(SUM(estado = 'PENDENTE'), 0) FROM api_entregas").fetch_one(p).await?;
        let estado = if activos == 0 {
            Estado::Desligada
        } else if a_falhar > 0 {
            Estado::Erro
        } else if falhadas > 0 || por_entregar > 20 {
            Estado::Atencao
        } else {
            Estado::Ok
        };
        let mut d = Vec::new();
        for (n, texto) in [(a_falhar, "aviso(s) a falhar seguidos"), (falhadas, "entrega(s) falhada(s)"), (por_entregar, "entrega(s) por fazer")] {
            if n > 0 {
                d.push(format!("{n} {texto}"));
            }
        }
        v.push(cartao("avisos", "Avisos automáticos (webhooks)", estado, format!("{activos} aviso(s) activo(s)"), d, "/integracoes"));
    }

    // a facturação electrónica da AGT
    if s.tem("sistema.fe") {
        let (pendentes, enviados, rejeitados, validos): (i64, i64, i64, i64) = sqlx::query_as(
            "SELECT COALESCE(SUM(estado = 'PENDENTE'), 0), COALESCE(SUM(estado = 'ENVIADO'), 0), COALESCE(SUM(estado = 'INVALIDO'), 0),
                    COALESCE(SUM(estado = 'VALIDO'), 0) FROM fe_envios",
        )
        .fetch_one(p)
        .await?;
        let total = pendentes + enviados + rejeitados + validos;
        let estado = if total == 0 {
            Estado::Desligada
        } else if rejeitados > 0 {
            Estado::Erro
        } else if pendentes > 20 {
            Estado::Atencao
        } else {
            Estado::Ok
        };
        let mut d = Vec::new();
        for (n, texto) in [(rejeitados, "rejeitado(s) pela AGT"), (pendentes, "por enviar"), (enviados, "à espera da validação")] {
            if n > 0 {
                d.push(format!("{n} {texto}"));
            }
        }
        v.push(cartao("fe", "Facturação electrónica (AGT)", estado, format!("{validos} documento(s) validado(s)"), d, "/facturacao-electronica"));
    }

    // a importação automática do KIGEST
    if s.tem("sistema.importar") {
        let cfg: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'importar.automatico'").fetch_optional(p).await?;
        let cfg: Value = cfg.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
        let ativo = cfg["ativo"].as_bool() == Some(true);
        let erro = cfg["ultimo"]["erro"].as_str().filter(|e| !e.trim().is_empty()).map(str::to_string);
        let estado = if !ativo { Estado::Desligada } else if erro.is_some() { Estado::Erro } else { Estado::Ok };
        let resumo = if ativo { format!("Última importação: {}", cfg["ultima"].as_str().unwrap_or("ainda nenhuma")) } else { "Desligada.".into() };
        v.push(cartao("kigest", "Importação do KIGEST", estado, resumo, erro.into_iter().map(|e| format!("Erro: {e}")).collect(), "/importar"));
    }

    // o acesso pela Internet (o túnel do modo web)
    if s.tem("sistema.configuracoes") {
        let a_correr = super::acesso_web::a_correr();
        let estado = if a_correr { Estado::Ok } else { Estado::Desligada };
        let resumo = if a_correr { "O túnel está a correr neste computador." } else { "Desligado." };
        v.push(cartao("web", "Acesso pela Internet", estado, resumo.into(), vec![], "/internet"));
    }

    // do pior para o melhor
    v.sort_by_key(|(e, _)| *e);
    Ok(json!(v.into_iter().map(|(_, c)| c).collect::<Vec<_>>()))
}

/// O ecossistema para o painel inicial (KANGEST ONE, fase G): a ligação ao servidor central, o que espera para ir para o
/// site, as encomendas do site por tratar, o livro de stock e a versão mínima. Num KanGest isolado, `ligado: false`.
pub async fn ecossistema(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let p = &st.pool;
    let lig: Option<(String, String, Option<String>, String, bool)> = sqlx::query_as(
        "SELECT posto_nome, loja, ultima_sinc, ultimo_erro,
                (ultimo_erro = '' AND COALESCE(ultima_sinc, '') >= strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime', '-10 minutes'))
           FROM sinc_ligacao WHERE id = 1 AND ativa = 1",
    )
    .fetch_optional(p)
    .await?;
    let Some((posto, loja, ultima_sinc, erro, em_linha)) = lig else { return Ok(json!({ "ligado": false })) };
    let conta = |sql: &'static str| async move { sqlx::query_scalar::<_, i64>(sql).fetch_one(p).await.unwrap_or(0) };
    let por_enviar = conta("SELECT COUNT(*) FROM sinc_saida WHERE estado IN ('pendente', 'erro')").await
        + conta("SELECT COUNT(*) FROM sinc_catalogo").await
        + conta("SELECT COUNT(*) FROM sinc_fechos WHERE feito_em IS NULL").await
        + conta("SELECT COUNT(*) FROM sinc_financeiro WHERE estado = 'pendente'").await
        + conta("SELECT COUNT(*) FROM sinc_stock_livro").await;
    let (novas, por_entregar, levantamento): (i64, i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(estado = 'pending'), 0), COALESCE(SUM(estado IN ('confirmed', 'shipped')), 0),
                COALESCE(SUM(levantamento = 1 AND estado NOT IN ('delivered', 'cancelled')), 0)
           FROM loja_encomendas",
    )
    .fetch_one(p)
    .await?;
    Ok(json!({
        "ligado": true,
        "posto": posto,
        "loja": loja,
        "ultima_sinc": ultima_sinc,
        "em_linha": em_linha,
        "erro": erro.chars().take(200).collect::<String>(),
        "por_enviar": por_enviar,
        "encomendas": { "novas": novas, "por_entregar": por_entregar, "levantamento": levantamento },
        "livro": crate::sinc::livro::contagem(p).await?,
        "desactualizado": crate::sinc::versao::desactualizado(p).await,
        "versao": crate::sinc::versao::ESTA,
    }))
}


#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_estado_do_site_pelas_filas() {
        assert_eq!(estado_do_site(false, true, 9, 9, 9), Estado::Desligada, "desligado, nada mais conta");
        assert_eq!(estado_do_site(true, true, 0, 0, 0), Estado::Erro);
        assert_eq!(estado_do_site(true, false, 1, 0, 0), Estado::Erro);
        assert_eq!(estado_do_site(true, false, 0, 51, 0), Estado::Atencao);
        assert_eq!(estado_do_site(true, false, 0, 0, 1), Estado::Atencao);
        assert_eq!(estado_do_site(true, false, 0, 10, 0), Estado::Ok);
        assert!(Estado::Erro < Estado::Atencao && Estado::Atencao < Estado::Ok, "a ordem do pior para o melhor");
    }
}
