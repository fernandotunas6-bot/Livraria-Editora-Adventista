// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O prefixo das séries que o site deu a este KanGest (pedido do dono a 28/11: «criar outras lojas sem riscos de
//! colisão tanto no KanGest como na livraria»). docs/LOJAS.md no repositório.
//!
//! As séries automáticas são «prefixo do posto + ano» (`documentos.rs`, `escolher_serie`): FR 2026/1 sem prefixo, FR
//! N2026/1 depois de importar o KIGEST. Duas lojas com o mesmo NIF e o mesmo prefixo emitiam os mesmos números, e para
//! a AGT eram documentos repetidos. O site dá a cada posto um prefixo único em toda a rede (HUA, LUB, HUA2…) e manda-o
//! em cada volta.
//!
//! **Automático:** os postos deste KanGest sem prefixo passam a usar o do site. É o caso de uma loja nova. Os postos
//! deste computador partilham o mesmo contador, por isso o mesmo prefixo não se repete aqui dentro.
//!
//! **Manual:** um posto que já tem outro prefixo (o «N» do KIGEST, um P2 escolhido à mão) fica como está, porque mudar a
//! série de uma loja que já factura é uma decisão. O ecrã da Ligação ao site mostra o aviso e o botão «Usar o prefixo do
//! site» (`usar_do_site`). Cada mudança fica na auditoria.

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Um prefixo como o site os dá: 1 a 8 letras maiúsculas ou algarismos.
pub fn prefixo_valido(p: &str) -> bool {
    !p.is_empty() && p.len() <= 8 && p.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

/// Depois de cada volta: guarda o prefixo que o site deu e põe-no nos postos sem prefixo. Devolve quantos mudaram.
pub async fn aplicar(st: &AppState, posto_do_site: &Value) -> AppResult<u64> {
    let Some(site) = posto_do_site["serie_prefixo"].as_str().filter(|p| prefixo_valido(p)) else {
        return Ok(0);
    };
    sqlx::query("UPDATE sinc_ligacao SET serie_prefixo_site = ? WHERE id = 1 AND serie_prefixo_site <> ?")
        .bind(site)
        .bind(site)
        .execute(&st.pool)
        .await?;
    let vazios: Vec<i64> = sqlx::query_scalar("SELECT id FROM postos WHERE TRIM(serie_prefixo) = '' ORDER BY id").fetch_all(&st.pool).await?;
    for id in &vazios {
        mudar(st, *id, "", site, "automático: o posto não tinha prefixo").await?;
    }
    Ok(vazios.len() as u64)
}

/// Muda o prefixo de um posto, com o registo na auditoria, e recarrega o posto desta máquina se for o dele.
async fn mudar(st: &AppState, id: i64, antes: &str, depois: &str, porque: &str) -> AppResult<()> {
    sqlx::query("UPDATE postos SET serie_prefixo = ? WHERE id = ?").bind(depois).bind(id).execute(&st.pool).await?;
    let detalhe = format!(
        "Prefixo das séries do posto {id}: «{}» → «{depois}» ({porque}). As séries automáticas novas começam em {depois}{}.",
        if antes.is_empty() { "sem prefixo" } else { antes },
        chrono::Local::now().format("%Y")
    );
    crate::services::auditoria::registar_evento(st, "SERIE_PREFIXO", "postos", id, &detalhe, Some(&json!({ "antes": antes, "depois": depois }))).await?;
    if id == st.posto().id {
        st.carregar_posto(id).await?;
    }
    Ok(())
}

/// Para o ecrã: o prefixo do site e cada posto deste KanGest, com o seu e se é o do site.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let site: Option<String> = sqlx::query_scalar("SELECT serie_prefixo_site FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(&st.pool).await?;
    let site = site.unwrap_or_default();
    let postos: Vec<(i64, String, String)> = sqlx::query_as("SELECT id, descricao, serie_prefixo FROM postos ORDER BY id").fetch_all(&st.pool).await?;
    let lista: Vec<Value> = postos
        .iter()
        .map(|(id, descricao, prefixo)| json!({ "id": id, "descricao": descricao, "serie_prefixo": prefixo, "igual": !site.is_empty() && prefixo == &site }))
        .collect();
    let diferentes = lista.iter().filter(|p| p["igual"].as_bool() != Some(true)).count();
    Ok(json!({ "site": site, "postos": lista, "diferentes": if site.is_empty() { 0 } else { diferentes } }))
}

/// «Usar o prefixo do site»: todos os postos deste KanGest passam a usá-lo nas séries automáticas novas. Os documentos já
/// emitidos ficam na série em que saíram.
pub async fn usar_do_site(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("pos.config_posto")?;
    let site: Option<String> = sqlx::query_scalar("SELECT serie_prefixo_site FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(&st.pool).await?;
    let Some(site) = site.filter(|s| prefixo_valido(s)) else {
        return Err(AppError::msg("O site ainda não deu um prefixo a este KanGest: sincronize primeiro."));
    };
    let outros: Vec<(i64, String)> = sqlx::query_as("SELECT id, serie_prefixo FROM postos WHERE serie_prefixo <> ? ORDER BY id").bind(&site).fetch_all(&st.pool).await?;
    for (id, antes) in &outros {
        mudar(st, *id, antes.trim(), &site, "à mão: «Usar o prefixo do site»").await?;
    }
    Ok(json!({ "mudados": outros.len(), "prefixo": site }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn so_prefixos_como_o_site_os_da() {
        for bom in ["HUA", "HUA2", "PST", "N", "ABCDEFGH"] {
            assert!(prefixo_valido(bom), "{bom}");
        }
        for mau in ["", "hua", "HU A", "HUA-2", "ABCDEFGHI", "HUÁ"] {
            assert!(!prefixo_valido(mau), "{mau}");
        }
    }
}
