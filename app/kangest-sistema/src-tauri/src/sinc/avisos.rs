// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Os avisos da equipa no site (`staff_notifications`: encomendas novas e mensagens de clientes) para o centro de ajuda
//! do KanGest (services/ajuda.rs). Vêm com a conta do site da pessoa (pessoa.rs): o RLS do site só lhe dá os dela, e
//! marcá-los como lidos aqui é o mesmo que no sino do painel.

use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::pessoa;

const CAMPOS: &str = "id,kind,title,body,order_id,thread_id,read_at,created_at";

/// Os avisos da pessoa no site (os 30 mais recentes). `Err`: porque não há (sem ligação, sem a conta do site, a sessão
/// acabou).
pub async fn da_pessoa(pool: &SqlitePool, utilizador: i64) -> Result<Vec<Value>, String> {
    let a = pessoa::auth(pool).await.map_err(|e| e.to_string())?;
    let token = pessoa::token_valido(pool, &a, utilizador).await.map_err(|e| e.texto())?;
    let url = format!("{}/rest/v1/staff_notifications?select={CAMPOS}&order=created_at.desc&limit=30", a.url);
    match pessoa::pedido("GET", url, pessoa::cabecalhos(&a.apikey, Some(&token)), None).await {
        Ok((200, Value::Array(v))) => Ok(v),
        Ok((estado, v)) => Err(pessoa::mensagem(&v, estado)),
        Err(e) => Err(e.texto()),
    }
}

/// Marca um aviso da equipa como lido no site.
pub async fn marcar_lido(pool: &SqlitePool, utilizador: i64, id: &str) -> Result<(), String> {
    if !pessoa::id_valido(id) {
        return Err("Aviso desconhecido.".into());
    }
    let a = pessoa::auth(pool).await.map_err(|e| e.to_string())?;
    let token = pessoa::token_valido(pool, &a, utilizador).await.map_err(|e| e.texto())?;
    let url = format!("{}/rest/v1/rpc/staff_mark_notification_read", a.url);
    match pessoa::pedido("POST", url, pessoa::cabecalhos(&a.apikey, Some(&token)), Some(json!({ "p_notification_id": id }))).await {
        Ok((estado, _)) if estado < 300 => Ok(()),
        Ok((estado, v)) => Err(pessoa::mensagem(&v, estado)),
        Err(e) => Err(e.texto()),
    }
}
