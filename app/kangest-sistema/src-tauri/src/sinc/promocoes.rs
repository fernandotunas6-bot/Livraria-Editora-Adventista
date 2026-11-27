// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As promoções dos artigos no site (KANGEST ONE, integração total; docs/KANGEST-SINCRONIZACAO.md §20).
//!
//! A regra é a do preço: o KanGest que manda no catálogo manda também nas promoções dos produtos do site ligados aos
//! seus artigos. A promoção de um artigo (a percentagem entre duas datas, `promo_desconto`, `promo_inicio` e
//! `promo_fim`, a mesma que a venda aplica) segue na volta, no campo `promocoes`, até `MAX` de cada vez:
//! - **com promoção:** o site põe o preço promocional, calculado sobre o PVP com IVA, entre as mesmas datas;
//! - **sem promoção** (ou já acabada), depois de uma ter ido: o site retira a que o KanGest pôs.
//!
//! O site nunca substitui uma promoção posta no painel (responde `tem_promocao`), e só retira as do KanGest.
//!
//! O que o site respondeu fica em `promocoes_enviadas` (migração 0077), com a versão (a promoção e o PVP, em texto):
//! uma promoção ou um preço que mude volta a seguir. `tem_promocao` e `recusada` voltam a tentar um dia depois, e `erro`
//! cada vez mais tarde. Automático com opção manual: na Loja online, «Enviar sozinho» desliga-o neste computador.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::AppResult;
use crate::state::AppState;

/// A chave na `config` deste computador: "0" desliga.
pub const CHAVE: &str = "sinc.promocoes_para_o_site";
/// Promoções por volta (o site aceita até 50).
pub const MAX: usize = 50;

/// A promoção de um artigo como vai para o site: a percentagem (0 = sem promoção), as datas (AAAA-MM-DD, as duas
/// incluídas) e o PVP com IVA em cêntimos. Uma promoção que já acabou conta como nenhuma.
pub fn desejada(desconto: f64, inicio: Option<&str>, fim: Option<&str>, preco1_iva: i64, hoje: &str) -> Value {
    let data = |d: Option<&str>| d.map(str::trim).filter(|x| x.len() == 10).map(str::to_string);
    let (inicio, fim) = (data(inicio), data(fim));
    let acabou = fim.as_deref().is_some_and(|f| f < hoje);
    let valida = desconto > 0.0 && desconto < 100.0;
    if !valida || acabou {
        return json!({ "desconto": 0 });
    }
    json!({ "desconto": (desconto * 100.0).round() / 100.0, "inicio": inicio, "fim": fim, "preco1_iva": preco1_iva })
}

/// Uma promoção para o site: o artigo, a versão (o que vai, em texto) e o item do pedido.
#[derive(Debug, Clone)]
pub struct PromocaoParaOSite {
    pub artigo_id: i64,
    pub versao: String,
    pub item: Value,
}

async fn ligado(pool: &SqlitePool) -> bool {
    let v: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(CHAVE).fetch_optional(pool).await.ok().flatten();
    v.as_deref() != Some("0")
}

/// Um artigo com a promoção: o id, a referência, a percentagem, o início, o fim e o PVP com IVA em cêntimos.
type ArtigoComPromocao = (i64, String, f64, Option<String>, Option<String>, i64);

/// As promoções que podem ir: os artigos activos com um produto do site pela referência, cuja promoção (ou o PVP)
/// mudou desde a última que foi. Um artigo sem promoção só vai se já tiver ido uma (para a retirar).
async fn escolher(pool: &SqlitePool, agora: i64, hoje: &str, limite: usize) -> AppResult<Vec<PromocaoParaOSite>> {
    let artigos: Vec<ArtigoComPromocao> = sqlx::query_as(
        "SELECT a.id, TRIM(a.referencia), a.promo_desconto, a.promo_inicio, a.promo_fim,
                CAST(ROUND(a.preco1 * (1 + t.percentagem / 100.0)) AS INTEGER)
           FROM artigos a JOIN taxas_iva t ON t.id = a.taxa_iva_id
          WHERE TRIM(COALESCE(a.referencia, '')) <> '' AND a.ativo = 1
            AND EXISTS (SELECT 1 FROM loja_produtos p WHERE TRIM(p.referencia) = TRIM(a.referencia))
          ORDER BY a.id",
    )
    .fetch_all(pool)
    .await?;
    let mut enviadas: HashMap<i64, (String, String, i64)> = HashMap::new();
    for (a, v, e, p) in sqlx::query_as::<_, (i64, String, String, i64)>("SELECT artigo_id, versao, estado, proximo_em FROM promocoes_enviadas").fetch_all(pool).await? {
        enviadas.insert(a, (v, e, p));
    }
    let mut out = Vec::new();
    for (artigo_id, referencia, desconto, inicio, fim, pvp) in artigos {
        if out.len() >= limite {
            break;
        }
        let d = desejada(desconto, inicio.as_deref(), fim.as_deref(), pvp, hoje);
        let versao = d.to_string();
        let sem = d["desconto"].as_f64() == Some(0.0);
        match enviadas.get(&artigo_id) {
            // nunca foi nenhuma: sem promoção, não há nada a retirar
            None if sem => continue,
            // a mesma versão: já está (feita, retirada, sem produto), ou espera ainda (as outras)
            Some((v, estado, proximo))
                if *v == versao && (matches!(estado.as_str(), "feita" | "retirada" | "sem_produto") || *proximo > agora) =>
            {
                continue
            }
            _ => {}
        }
        let mut item = d;
        item["artigo_id"] = json!(artigo_id);
        item["referencia"] = json!(referencia);
        out.push(PromocaoParaOSite { artigo_id, versao, item });
    }
    Ok(out)
}

/// As promoções desta volta (no máximo `MAX`), se o envio estiver ligado neste computador.
pub async fn para_o_site(pool: &SqlitePool, agora: i64) -> AppResult<Vec<PromocaoParaOSite>> {
    if !ligado(pool).await {
        return Ok(Vec::new());
    }
    escolher(pool, agora, &db::hoje(), MAX).await
}

/// Regista o que o site respondeu a cada promoção (`promocoes` na resposta). Uma sem resposta (um site antigo) conta
/// como erro.
pub async fn concluir(pool: &SqlitePool, enviadas: &[PromocaoParaOSite], resposta: &Value, agora: i64) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for p in enviadas {
        let r = resposta.as_array().and_then(|v| v.iter().find(|x| x["artigo_id"].as_i64() == Some(p.artigo_id)));
        let (estado, erro) = match r {
            Some(x) => (x["estado"].as_str().unwrap_or("erro"), x["erro"].as_str().unwrap_or("")),
            None => ("erro", "O site não respondeu à promoção."),
        };
        let estado = match estado {
            "feita" | "retirada" | "sem_produto" | "tem_promocao" | "recusada" => estado,
            _ => "erro",
        };
        let antes: i64 = sqlx::query_scalar("SELECT tentativas FROM promocoes_enviadas WHERE artigo_id = ? AND versao = ?")
            .bind(p.artigo_id)
            .bind(&p.versao)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(0);
        let proximo = match estado {
            "erro" => super::proxima_tentativa(antes, agora),
            "tem_promocao" | "recusada" => agora + 24 * 3600,
            _ => 0,
        };
        sqlx::query(
            "INSERT INTO promocoes_enviadas (artigo_id, versao, estado, erro, tentativas, proximo_em, em) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(artigo_id) DO UPDATE SET versao = excluded.versao, estado = excluded.estado, erro = excluded.erro,
               tentativas = excluded.tentativas, proximo_em = excluded.proximo_em, em = excluded.em",
        )
        .bind(p.artigo_id)
        .bind(&p.versao)
        .bind(estado)
        .bind(erro.chars().take(300).collect::<String>())
        .bind(antes + 1)
        .bind(proximo)
        .bind(db::agora())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// O cartão da Loja online: se está ligado, quantas esperam, quantas estão no site, quantas ficaram por causa de uma
/// promoção do painel e o que o site recusou.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let pool = &st.pool;
    let por_enviar = escolher(pool, super::agora_s(), &db::hoje(), usize::MAX).await?.len();
    let contar = |onde: &'static str| async move {
        sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM promocoes_enviadas WHERE {onde}")).fetch_one(pool).await
    };
    let erro: Option<String> = sqlx::query_scalar(
        "SELECT erro FROM promocoes_enviadas WHERE estado IN ('erro', 'recusada') AND erro <> '' ORDER BY em DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(json!({
        "ligado": ligado(pool).await,
        "por_enviar": por_enviar,
        "no_site": contar("estado = 'feita' AND json_extract(versao, '$.desconto') > 0").await?,
        "do_painel": contar("estado = 'tem_promocao'").await?,
        "recusadas": contar("estado IN ('recusada', 'erro')").await?,
        "ultimo_erro": erro,
    }))
}

#[derive(Deserialize)]
pub struct LigarIn {
    ligado: bool,
}

/// Liga ou desliga o envio neste computador.
pub async fn ligar(st: &AppState, i: LigarIn) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(CHAVE)
        .bind(if i.ligado { "1" } else { "0" })
        .execute(&st.pool)
        .await?;
    estado(st).await
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn a_promocao_desejada() {
        let hoje = "2026-12-10";
        assert_eq!(
            desejada(12.346, Some("2026-12-01"), Some(" 2026-12-24 "), 570000, hoje),
            json!({ "desconto": 12.35, "inicio": "2026-12-01", "fim": "2026-12-24", "preco1_iva": 570000 })
        );
        // sem datas: desde já e sem fim
        assert_eq!(desejada(10.0, None, Some(""), 1000, hoje), json!({ "desconto": 10.0, "inicio": null, "fim": null, "preco1_iva": 1000 }));
        // sem promoção, já acabada, ou de 100 %: nenhuma
        assert_eq!(desejada(0.0, None, None, 1000, hoje), json!({ "desconto": 0 }));
        assert_eq!(desejada(10.0, None, Some("2026-12-09"), 1000, hoje), json!({ "desconto": 0 }));
        assert_eq!(desejada(100.0, None, None, 1000, hoje), json!({ "desconto": 0 }));
        // o último dia ainda conta
        assert_eq!(desejada(10.0, None, Some(hoje), 1000, hoje)["desconto"], json!(10.0));
    }
}
