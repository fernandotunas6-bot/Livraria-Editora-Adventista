// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O atendimento do site no KanGest (o separador «Atendimento» do centro de ajuda, src/components/Ajuda.tsx): as
//! conversas dos clientes, ler e responder, e resolver ou pôr em espera. Tudo com a conta do site da pessoa (pessoa.rs),
//! pelas mesmas tabelas e funções do painel (app/web/src/lib/supportApi.js), por isso valem as regras do site: só quem
//! tem «Gerir encomendas» (`manage_orders`) as vê, cada resposta sai em nome de quem a escreve (`sender_id` é o
//! `auth.uid()`), e as notas internas da equipa nunca chegam ao cliente.

use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::pessoa;

const CAMPOS_CONVERSA: &str = "id,customer_id,order_id,subject,status,assigned_to,staff_last_read_at,last_sender_id,last_message_at,created_at,ticket_number,priority,channel";
const CAMPOS_MENSAGEM: &str = "id,thread_id,sender_id,body,created_at,author_kind";
/// Os estados que uma pessoa pode pôr aqui (a função do site aceita também «open»).
pub const ESTADOS: [&str; 3] = ["open", "pending", "closed"];

/// O token da pessoa e o endereço do Supabase.
async fn ligar(pool: &SqlitePool, utilizador: i64) -> Result<(pessoa::Auth, String), String> {
    let a = pessoa::auth(pool).await.map_err(|e| e.to_string())?;
    let t = pessoa::token_valido(pool, &a, utilizador).await.map_err(|e| e.texto())?;
    Ok((a, t))
}

async fn get(a: &pessoa::Auth, token: &str, caminho: &str) -> Result<Vec<Value>, String> {
    match pessoa::pedido("GET", format!("{}/rest/v1/{caminho}", a.url), pessoa::cabecalhos(&a.apikey, Some(token)), None).await {
        Ok((200, Value::Array(v))) => Ok(v),
        Ok((estado, v)) => Err(pessoa::mensagem(&v, estado)),
        Err(e) => Err(e.texto()),
    }
}

async fn post(a: &pessoa::Auth, token: &str, caminho: &str, corpo: Value) -> Result<Value, String> {
    match pessoa::pedido("POST", format!("{}/rest/v1/{caminho}", a.url), pessoa::cabecalhos(&a.apikey, Some(token)), Some(corpo)).await {
        Ok((estado, v)) if estado < 300 => Ok(v),
        Ok((estado, v)) => Err(pessoa::mensagem(&v, estado)),
        Err(e) => Err(e.texto()),
    }
}

/// `id=in.(a,b)` só com ids válidos (nunca texto vindo de fora dentro do filtro).
fn lista_de_ids<'a>(ids: impl Iterator<Item = &'a str>) -> String {
    let mut v: Vec<&str> = ids.filter(|i| pessoa::id_valido(i)).collect();
    v.sort_unstable();
    v.dedup();
    v.join(",")
}

/// Uma conversa por ler: a última mensagem é de outra pessoa e é depois da última leitura da equipa.
pub fn por_ler(c: &Value) -> bool {
    let ultima = c["last_message_at"].as_str().unwrap_or_default();
    let lida = c["staff_last_read_at"].as_str().unwrap_or_default();
    !ultima.is_empty() && c["last_sender_id"] != c["assigned_to"] && (lida.is_empty() || ultima > lida)
}

/// As conversas activas (abertas e em espera), as mais recentes primeiro, com o nome do cliente e o número da
/// encomenda.
pub async fn conversas(pool: &SqlitePool, utilizador: i64) -> Result<Vec<Value>, String> {
    let (a, t) = ligar(pool, utilizador).await?;
    let mut v = get(&a, &t, &format!("support_threads?select={CAMPOS_CONVERSA}&status=in.(open,pending)&order=last_message_at.desc&limit=50")).await?;
    let clientes = lista_de_ids(v.iter().filter_map(|c| c["customer_id"].as_str()));
    let encomendas = lista_de_ids(v.iter().filter_map(|c| c["order_id"].as_str()));
    let perfis = if clientes.is_empty() { vec![] } else { get(&a, &t, &format!("profiles?select=id,name,email&id=in.({clientes})")).await? };
    let ordens = if encomendas.is_empty() { vec![] } else { get(&a, &t, &format!("orders?select=id,order_number&id=in.({encomendas})")).await? };
    for c in &mut v {
        let p = perfis.iter().find(|p| p["id"] == c["customer_id"]);
        c["cliente"] = json!(p.and_then(|p| p["name"].as_str().filter(|n| !n.trim().is_empty()).or(p["email"].as_str())).unwrap_or("Cliente"));
        c["encomenda"] = json!(ordens.iter().find(|o| o["id"] == c["order_id"]).and_then(|o| o["order_number"].as_str()));
        c["por_ler"] = json!(por_ler(c));
    }
    Ok(v)
}

/// As mensagens de uma conversa (até 200), e a conversa fica lida pela equipa.
pub async fn mensagens(pool: &SqlitePool, utilizador: i64, conversa: &str) -> Result<Vec<Value>, String> {
    if !pessoa::id_valido(conversa) {
        return Err("Conversa desconhecida.".into());
    }
    let (a, t) = ligar(pool, utilizador).await?;
    let v = get(&a, &t, &format!("support_messages?select={CAMPOS_MENSAGEM}&thread_id=eq.{conversa}&order=created_at.asc,id.asc&limit=200")).await?;
    // marcar como lida não impede de ver as mensagens
    if let Err(e) = post(&a, &t, "rpc/support_mark_read", json!({ "p_thread_id": conversa })).await {
        eprintln!("Atendimento: a conversa ficou por marcar como lida ({e}).");
    }
    Ok(v)
}

/// O texto de uma resposta, conferido como no painel (1 a 4000 caracteres).
pub fn texto_valido(texto: &str) -> Result<String, String> {
    let t = texto.trim();
    if t.is_empty() || t.chars().count() > 4000 {
        return Err("A mensagem deve ter entre 1 e 4000 caracteres.".into());
    }
    Ok(t.to_string())
}

/// Responde ao cliente, em nome da pessoa (o site põe o `sender_id`).
pub async fn responder(pool: &SqlitePool, utilizador: i64, conversa: &str, texto: &str) -> Result<(), String> {
    if !pessoa::id_valido(conversa) {
        return Err("Conversa desconhecida.".into());
    }
    let corpo = texto_valido(texto)?;
    let (a, t) = ligar(pool, utilizador).await?;
    post(&a, &t, "support_messages", json!({ "thread_id": conversa, "body": corpo })).await.map(|_| ())
}

/// Resolve a conversa ou põe-na em espera, sem mudar quem a tem (`responsavel`, o actual).
pub async fn mudar_estado(pool: &SqlitePool, utilizador: i64, conversa: &str, estado: &str, responsavel: Option<&str>) -> Result<(), String> {
    if !pessoa::id_valido(conversa) || !ESTADOS.contains(&estado) {
        return Err("Pedido inválido.".into());
    }
    let (a, t) = ligar(pool, utilizador).await?;
    let corpo = json!({
        "p_thread_id": conversa,
        "p_status": estado,
        "p_assigned_to": responsavel.filter(|r| pessoa::id_valido(r)),
        "p_priority": null,
        "p_category": null,
    });
    post(&a, &t, "rpc/support_update_ticket", corpo).await.map(|_| ())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn os_ids_do_filtro_sao_conferidos() {
        let ids = ["b-2", "a-1", "a-1", "x) or (1=1", ""];
        assert_eq!(lista_de_ids(ids.into_iter()), "a-1,b-2");
    }

    #[test]
    fn por_ler_e_a_resposta_que_a_equipa_ainda_nao_viu() {
        let c = json!({ "last_message_at": "2026-11-26T10:00:00Z", "staff_last_read_at": "2026-11-26T09:00:00Z", "last_sender_id": "cliente", "assigned_to": "eu" });
        assert!(por_ler(&c));
        let lida = json!({ "last_message_at": "2026-11-26T10:00:00Z", "staff_last_read_at": "2026-11-26T10:05:00Z", "last_sender_id": "cliente", "assigned_to": "eu" });
        assert!(!por_ler(&lida));
        let minha = json!({ "last_message_at": "2026-11-26T10:00:00Z", "staff_last_read_at": null, "last_sender_id": "eu", "assigned_to": "eu" });
        assert!(!por_ler(&minha), "a última foi de quem a tem");
    }

    #[test]
    fn o_texto_da_resposta() {
        assert_eq!(texto_valido("  Bom dia!  ").unwrap(), "Bom dia!");
        assert!(texto_valido("   ").is_err());
        assert!(texto_valido(&"a".repeat(4001)).is_err());
    }
}
