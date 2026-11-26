// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A saúde do servidor central vista do KanGest (KANGEST ONE, fase E; o que faltava, verificado a 26/11): o Centro de
//! Integrações mostra o que o site diz de si (`GET /api/v1/system/health`: a base, as contas, os ficheiros, os emails e
//! os postos), pedido com a conta do site da pessoa. Só quem tem «Gerir configurações» no site o vê; sem a conta do site
//! nesta sessão, ou sem Internet, diz-se porquê.

use serde_json::Value;

use super::pessoa;
use crate::state::AppState;

/// A saúde do servidor (o `data` da rota), ou o motivo legível de não a ter.
pub async fn do_servidor(st: &AppState) -> Result<Value, String> {
    let s = st.sessao().map_err(|e| e.to_string())?;
    let a = pessoa::auth(&st.pool).await.map_err(|e| e.to_string())?;
    let base: String = sqlx::query_scalar("SELECT url FROM sinc_ligacao WHERE id = 1 AND ativa = 1")
        .fetch_optional(&st.pool)
        .await
        .ok()
        .flatten()
        .ok_or_else(|| "Este KanGest não está ligado ao site.".to_string())?;
    let token = pessoa::token_valido(&st.pool, &a, s.id).await.map_err(|e| e.texto())?;
    let url = format!("{}/api/v1/system/health", base.trim_end_matches('/'));
    let (estado, v) = pessoa::pedido("GET", url, pessoa::cabecalhos(&a.apikey, Some(&token)), None).await.map_err(|e| e.texto())?;
    match estado {
        200 => Ok(v["data"].clone()),
        401 | 403 => Err("A sua conta do site não vê a saúde do servidor (precisa de «Gerir configurações» no site).".into()),
        _ => Err(pessoa::mensagem(&v, estado)),
    }
}
