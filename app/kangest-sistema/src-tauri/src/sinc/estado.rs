// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O estado deste computador, que segue em cada volta da sincronização (dentro do envelope assinado e cifrado), para o
//! painel do site mostrar por posto: a versão, o sistema, os núcleos, a memória, o espaço livre, o tamanho da base, a
//! última cópia de segurança, os documentos rejeitados pela AGT e por enviar, a última verificação da base e as opções
//! da bandeja e do sono. **Só números e marcas do computador:** nunca nomes, NIF, caminhos de pastas nem dados da loja.
//! A excepção é o endereço do modo web na rede da loja (um IPv4 privado), e só num servidor com o modo web a correr,
//! para o painel abrir o KanGest por ele.
//! O site ainda filtra por uma lista fechada de campos (supabase/functions/app/kangestSinc.ts, `limparEstadoComputador`).

use serde_json::{json, Value};

use crate::state::AppState;

/// O estado deste computador agora. O que não se conseguir ler fica de fora (nunca impede a volta).
pub async fn do_computador(st: &AppState) -> Value {
    let p = &st.pool;
    let pasta = &st.pasta_dados;
    let (ultima, livre, _) = crate::services::sistema::estado_das_copias(pasta);
    let base = std::fs::metadata(pasta.join("kigest.db")).map(|m| m.len()).ok();
    let erro_externa: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'copias.erro_externa'").fetch_optional(p).await.ok().flatten();
    let fe: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM fe_envios WHERE estado = 'INVALIDO'").fetch_one(p).await.ok();
    let por_enviar: Option<i64> = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_saida WHERE estado IN ('pendente', 'erro')").fetch_one(p).await.ok();
    let verificacao: Option<(i64, i64)> = sqlx::query_as("SELECT ok, graves FROM verificacoes_base ORDER BY id DESC LIMIT 1").fetch_optional(p).await.ok().flatten();
    let modo = crate::rede::config().modo;
    json!({
        "versao": format!("{} Livraria", env!("CARGO_PKG_VERSION")),
        "sistema": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "nucleos": crate::recursos::nucleos(),
        "memoria": crate::recursos::memoria_total(),
        "espaco_livre": livre,
        "base_bytes": base,
        "ultima_copia": ultima.map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
        "copia_externa_erro": erro_externa.is_some_and(|e| !e.trim().is_empty()),
        "modo": if ["sozinho", "servidor", "cliente"].contains(&modo.as_str()) { Value::from(modo) } else { Value::Null },
        "fe_rejeitados": fe,
        "por_enviar": por_enviar,
        "verificacao": verificacao.map(|(ok, graves)| if ok == 1 { "ok" } else if graves > 0 { "graves" } else { "avisos" }),
        "bandeja": crate::servico::fecha_para_a_bandeja(),
        "acordado": crate::servico::nao_adormece(),
        "endereco_web": endereco_web(),
    })
}

/// O endereço do modo web deste KanGest na rede da loja, se for o servidor com o modo web ligado e a correr. O painel
/// do site abre por ele os ecrãs do KanGest, sem a ligação kangest:// (pedido do dono a 27/11: «pelo servidor da
/// loja»). Só um IPv4 privado; o site confere outra vez (`enderecoWebDaLoja`).
fn endereco_web() -> Option<String> {
    let c = crate::rede::config();
    let porta = crate::rede::servidor_activo()?;
    if c.modo != "servidor" || !c.web || !crate::web::disponivel() {
        return None;
    }
    endereco_privado(&crate::rede::enderecos_locais(), porta)
}

/// O primeiro IPv4 privado da lista, com a porta: `http://192.168.1.10:7799`.
fn endereco_privado(enderecos: &[String], porta: u16) -> Option<String> {
    enderecos
        .iter()
        .filter_map(|e| e.parse::<std::net::Ipv4Addr>().ok())
        .find(|ip| ip.is_private())
        .map(|ip| format!("http://{ip}:{porta}"))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_endereco_do_modo_web_so_na_rede_da_loja() {
        let l = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(endereco_privado(&l(&["192.168.1.10", "2001:db8::1"]), 7799).as_deref(), Some("http://192.168.1.10:7799"));
        assert_eq!(endereco_privado(&l(&["41.63.0.5", "10.0.0.7"]), 8000).as_deref(), Some("http://10.0.0.7:8000"));
        assert_eq!(endereco_privado(&l(&["41.63.0.5", "fe80::1"]), 7799), None, "um endereço público nunca segue");
        assert_eq!(endereco_privado(&[], 7799), None);
    }
}
