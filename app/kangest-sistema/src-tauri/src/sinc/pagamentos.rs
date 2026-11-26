// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Os pagamentos da loja online no KanGest (Livraria → Loja online → Pagamentos): o mesmo relatório do painel do site
//! («Pagamentos e caixa», `public.payments_report`), pedido com a conta do site da pessoa (pessoa.rs). Valem as regras do
//! site: só quem lá pode ler os pagamentos (`can_read_payments`) os vê aqui. **Só se lê:** confirmar um pagamento ou
//! reembolsar faz-se no painel (um pagamento só fica confirmado pelo gateway ou por quem tem «Confirmar pagamentos»).

use chrono::NaiveDate;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::pessoa;

/// O período pedido, conferido como no site: datas válidas, a de fim depois da de início, no máximo 400 dias.
pub fn periodo_valido(de: &str, ate: &str) -> Result<(NaiveDate, NaiveDate), String> {
    let ler = |s: &str| NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map_err(|_| format!("Data inválida: «{s}»."));
    let (a, b) = (ler(de)?, ler(ate)?);
    if b < a {
        return Err("A data de fim é anterior à de início.".into());
    }
    if (b - a).num_days() > 400 {
        return Err("Período demasiado longo (máximo 400 dias).".into());
    }
    Ok((a, b))
}

/// O relatório de pagamentos do site para o período, com a conta do site da pessoa.
pub async fn relatorio(pool: &SqlitePool, utilizador: i64, de: &str, ate: &str) -> Result<Value, String> {
    let (a, b) = periodo_valido(de, ate)?;
    let auth = pessoa::auth(pool).await.map_err(|e| e.to_string())?;
    let token = pessoa::token_valido(pool, &auth, utilizador).await.map_err(|e| e.texto())?;
    let url = format!("{}/rest/v1/rpc/payments_report", auth.url);
    let corpo = json!({ "p_from": a.to_string(), "p_to": b.to_string() });
    match pessoa::pedido("POST", url, pessoa::cabecalhos(&auth.apikey, Some(&token)), Some(corpo)).await {
        Ok((200, v)) if v.is_object() => Ok(v),
        Ok((estado, v)) => Err(pessoa::mensagem(&v, estado)),
        Err(e) => Err(e.texto()),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_periodo_confere_se_como_no_site() {
        assert!(periodo_valido("2026-11-01", "2026-11-26").is_ok());
        assert!(periodo_valido("2026-11-26", "2026-11-26").is_ok(), "um dia só");
        assert!(periodo_valido("2026-11-26", "2026-11-01").unwrap_err().contains("anterior"));
        assert!(periodo_valido("2025-01-01", "2026-11-26").unwrap_err().contains("400 dias"));
        assert!(periodo_valido("26/11/2026", "2026-11-26").unwrap_err().contains("inválida"));
    }
}
