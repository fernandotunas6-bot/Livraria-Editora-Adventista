// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A versão mínima do KanGest que o site aceita (KANGEST ONE, fase E; `KANGEST_MIN_VERSION` no site). Chega em cada volta
//! da sincronização e fica em `config` (`site.kangest_min_version`). Um KanGest abaixo dela mostra um aviso e só lê: fica
//! com «Ver relatórios» e «Atualizações», para se poder actualizar (services/auth.rs, `sessao_de`).

use sqlx::SqlitePool;

use crate::error::AppResult;

/// A versão deste KanGest.
pub const ESTA: &str = env!("CARGO_PKG_VERSION");

/// `actual` está abaixo de `minima`? Compara os números («1.4.8», «1.4.8 Livraria»); uma versão que não se lê não conta.
pub fn abaixo_da_minima(actual: &str, minima: &str) -> bool {
    fn partes(v: &str) -> Option<Vec<u64>> {
        let n: String = v.trim().chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        let p: Vec<u64> = n.split('.').filter(|x| !x.is_empty()).map(|x| x.parse().unwrap_or(0)).collect();
        (!p.is_empty()).then_some(p)
    }
    let (Some(a), Some(m)) = (partes(actual), partes(minima)) else { return false };
    for i in 0..a.len().max(m.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), m.get(i).copied().unwrap_or(0));
        if x != y {
            return x < y;
        }
    }
    false
}

/// O que a volta trouxe (`kangest_min_version`): guarda-se, ou apaga-se se o site não pede nenhuma.
pub async fn guardar(pool: &SqlitePool, minima: Option<&str>) -> AppResult<()> {
    match minima.map(str::trim).filter(|m| !m.is_empty() && m.len() <= 20) {
        Some(m) => {
            sqlx::query("INSERT INTO config (chave, valor) VALUES ('site.kangest_min_version', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
                .bind(m)
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query("DELETE FROM config WHERE chave = 'site.kangest_min_version'").execute(pool).await?;
        }
    }
    Ok(())
}

/// A versão mínima, se este KanGest está abaixo dela (só num KanGest ligado ao site).
pub async fn desactualizado(pool: &SqlitePool) -> Option<String> {
    let ligado: bool = sqlx::query_scalar("SELECT COUNT(*) > 0 FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_one(pool).await.unwrap_or(false);
    if !ligado {
        return None;
    }
    let m: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'site.kangest_min_version'").fetch_optional(pool).await.ok().flatten();
    m.filter(|m| abaixo_da_minima(ESTA, m))
}

#[cfg(test)]
mod testes {
    use super::abaixo_da_minima;

    #[test]
    fn comparar_versoes() {
        assert!(abaixo_da_minima("1.4.8", "1.4.9"));
        assert!(abaixo_da_minima("1.4.8 Livraria", "1.5"));
        assert!(!abaixo_da_minima("1.4.9", "1.4.9"));
        assert!(!abaixo_da_minima("1.5.0", "1.4.9"));
        assert!(!abaixo_da_minima("1.4", "1.4.0"));
        assert!(!abaixo_da_minima("1.4.8", "lixo"), "uma versão que não se lê não conta");
    }
}
