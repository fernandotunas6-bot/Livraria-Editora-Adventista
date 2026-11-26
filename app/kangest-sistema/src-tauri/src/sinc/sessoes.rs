// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As sessões abertas neste KanGest, para o painel do site (KANGEST ONE, fase A): quem entrou, com que perfil, em que
//! aparelho e desde quando. Seguem em cada volta, dentro do envelope assinado e cifrado. **Nunca tokens nem senhas:** cada
//! sessão vai com uma chave de 16 letras tirada do aparelho, da pessoa e da hora de entrada.
//!
//! - **O ADMIN local de recurso** (o perfil Administrador sem conta do site) vai marcado `recurso`: o site regista cada
//!   entrada dele no registo de segurança e avisa os administradores (migração `20261126180000`).
//! - **O painel pode terminar uma sessão:** a resposta da volta traz as chaves em `sessoes_revogar`, e o KanGest termina-as
//!   aqui. Este computador volta ao ecrã de entrada, e um posto ou browser em rede também.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::state::{AppState, Sessao};

/// Uma sessão aberta, com a chave que a identifica no site.
struct Aberta {
    chave: String,
    utilizador: i64,
    /// `None` = este computador; `Some(id)` = a ligação de um posto ou browser em rede (rede.rs)
    ligacao: Option<String>,
    dados: Value,
}

/// A chave de uma sessão: 16 letras hexadecimais do aparelho, da pessoa e da hora de entrada (uma entrada nova dá uma
/// chave nova). Não deixa chegar ao token da ligação.
pub fn chave(aparelho: &str, utilizador: i64, entrada: &str) -> String {
    Sha256::digest(format!("kangest-sessao|{aparelho}|{utilizador}|{entrada}").as_bytes()).iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// A hora local (AAAA-MM-DDTHH:MM:SS, `db::agora`) com o fuso deste computador, para o site a ler certa.
fn com_fuso(local: &str) -> Option<String> {
    let n = chrono::NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M:%S").ok()?;
    n.and_local_timezone(chrono::Local).earliest().map(|d| d.to_rfc3339())
}

async fn abertas_todas(st: &AppState) -> Vec<Aberta> {
    let mut l: Vec<(Option<String>, i64, String, String, String, bool, bool)> = Vec::new();
    // este computador (a sessão do processo, nunca a de um pedido em rede)
    let local: Option<Sessao> = st.sessao.lock().map(|s| s.clone()).unwrap_or(None);
    if let Some(s) = local {
        let entrada = st.entrada_local.lock().map(|e| e.clone()).unwrap_or(None).unwrap_or_default();
        let posto = st.posto.read().map(|p| p.descricao.clone()).unwrap_or_default();
        l.push((None, s.id, entrada, format!("Programa KanGest ({posto})"), String::new(), false, s.offline));
    }
    // os postos e browsers em rede com sessão iniciada (num KanGest que é o servidor da loja)
    for x in crate::rede::sessoes_ligadas() {
        l.push((Some(x.id), x.utilizador_id, x.entrada.unwrap_or_default(), x.aparelho, x.local, x.pela_internet, x.offline));
    }
    let mut out = Vec::with_capacity(l.len());
    for (ligacao, utilizador, entrada, aparelho, local, pela_internet, offline) in l {
        let row: Option<(String, String, String, Option<String>)> =
            sqlx::query_as("SELECT nome, login, perfil, conta_site FROM utilizadores WHERE id = ?").bind(utilizador).fetch_optional(&st.pool).await.ok().flatten();
        let Some((nome, login, perfil, conta_site)) = row else { continue };
        let conta_site = conta_site.is_some_and(|c| !c.is_empty());
        let chave = chave(ligacao.as_deref().unwrap_or("local"), utilizador, &entrada);
        let dados = json!({
            "id": chave,
            "nome": nome.chars().take(80).collect::<String>(),
            "login": login.chars().take(120).collect::<String>(),
            "perfil": perfil.chars().take(40).collect::<String>(),
            "conta_site": conta_site,
            "recurso": perfil == "ADMIN" && !conta_site,
            "aparelho": aparelho.chars().take(80).collect::<String>(),
            "local": local.chars().take(80).collect::<String>(),
            "pela_internet": pela_internet,
            "offline": offline,
            "inicio": com_fuso(&entrada),
        });
        out.push(Aberta { chave, utilizador, ligacao, dados });
    }
    out
}

/// As sessões abertas agora, para a volta (no máximo 100).
pub async fn abertas(st: &AppState) -> Vec<Value> {
    abertas_todas(st).await.into_iter().take(100).map(|a| a.dados).collect()
}

/// Termina as sessões que o painel do site pediu (`sessoes_revogar` da resposta). Devolve quantas terminou.
pub async fn revogar(st: &AppState, pedidas: &Value) -> usize {
    let Some(lista) = pedidas.as_array().filter(|l| !l.is_empty()) else { return 0 };
    let pedidas: Vec<&str> = lista.iter().filter_map(|v| v.as_str()).collect();
    let mut feitas = 0;
    for a in abertas_todas(st).await.into_iter().filter(|a| pedidas.contains(&a.chave.as_str())) {
        let terminou = match &a.ligacao {
            None => {
                let mut s = st.sessao.lock().unwrap_or_else(|e| e.into_inner());
                let era = s.as_ref().is_some_and(|x| x.id == a.utilizador);
                if era {
                    *s = None;
                    *st.entrada_local.lock().unwrap_or_else(|e| e.into_inner()) = None;
                }
                era
            }
            Some(id) => crate::rede::terminar_ligacao(id).is_some(),
        };
        if !terminou {
            continue;
        }
        feitas += 1;
        // a sessão do site desta pessoa (a Loja online) também acaba
        let _ = super::pessoa::apagar_sessao(&st.pool, a.utilizador).await;
        let login = a.dados["login"].as_str().unwrap_or_default().to_string();
        let _ = sqlx::query("INSERT INTO acessos (utilizador_id, login, evento, posto_id, detalhe) VALUES (?, ?, 'SESSAO_REVOGADA', ?, ?)")
            .bind(a.utilizador)
            .bind(&login)
            .bind(st.posto.read().map(|p| p.id).unwrap_or(1))
            .bind(format!("terminada no painel do site ({})", a.dados["aparelho"].as_str().unwrap_or_default()))
            .execute(&st.pool)
            .await;
        if a.ligacao.is_none() {
            // o ecrã confere a sessão já (App.tsx) e volta à entrada
            crate::nativo::avisar_ecra("sessao-bloqueada");
            crate::nativo::notificar("sessao-revogada", "Sessão terminada", "A sua sessão no KanGest foi terminada no painel do site. Entre outra vez para continuar.");
        }
    }
    feitas
}
