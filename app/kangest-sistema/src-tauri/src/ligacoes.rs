// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As ligações `kangest://`: o botão «Abrir no KanGest» do painel do site (e de um email da equipa) abre o ecrã certo
//! no KanGest deste computador. O instalador regista o esquema no sistema (tauri.conf.json → plugins → deep-link);
//! com o KanGest já aberto, a ligação vai para a janela aberta (o single-instance com «deep-link»).
//!
//! **Uma ligação só leva a um ecrã, nunca faz nada sozinha** (não confirma, não emite, não apaga): qualquer página da
//! Internet pode abrir uma ligação `kangest://`. Só os destinos desta lista valem, com os ids conferidos; o resto só traz
//! a janela para a frente. Sem sessão aberta, o destino fica guardado e abre-se depois de entrar.
//!
//! | Ligação | Ecrã |
//! |---|---|
//! | `kangest://loja-online/encomenda/<id>` | a encomenda na Loja online |
//! | `kangest://loja-online?filtro=por_confirmar` | a Loja online, filtrada |
//! | `kangest://loja-online` | a Loja online |
//! | `kangest://ajuda` | o centro de ajuda (avisos) |
//! | `kangest://` (ou outra) | só a janela |

use std::sync::Mutex;

/// Os filtros da Loja online que uma ligação pode pedir (sinc/loja.rs, `onde_encomendas`).
const FILTROS: [&str; 5] = ["por_confirmar", "em_curso", "levantamentos", "concluidas", "canceladas"];

/// O destino que espera pelo ecrã (até a pessoa entrar, ou até o ecrã o ir buscar).
static PENDENTE: Mutex<Option<String>> = Mutex::new(None);

/// O ecrã do KanGest para uma ligação, ou `None` (só a janela). Só o esquema `kangest`.
pub fn destino(url: &tauri::Url) -> Option<String> {
    if url.scheme() != "kangest" {
        return None;
    }
    // kangest://loja-online/encomenda/<id>: o «host» é a primeira parte
    let mut partes: Vec<&str> = std::iter::once(url.host_str().unwrap_or_default()).chain(url.path().split('/')).filter(|p| !p.is_empty()).collect();
    partes.truncate(4);
    let filtro = url.query_pairs().find(|(k, _)| k == "filtro").map(|(_, v)| v.to_string());
    match partes.as_slice() {
        ["loja-online", "encomenda", id] if crate::sinc::pessoa::id_valido(id) => Some(format!("/loja-online?encomenda={id}")),
        ["loja-online"] => Some(match filtro.filter(|f| FILTROS.contains(&f.as_str())) {
            Some(f) => format!("/loja-online?filtro={f}"),
            None => "/loja-online".into(),
        }),
        ["ajuda"] => Some("/?ajuda=avisos".into()),
        _ => None,
    }
}

/// O retorno da entrada com o Google (`kangest://auth?e=<estado>&code=<código>`, ou `&erro=…`), vindo da página
/// `/kangest/entrar` do site. Não faz nada sozinho: o ecrã de entrada recebe-o e pede a sessão
/// (`auth.google_concluir`), que só sai com uma entrada começada neste computador e com o mesmo estado.
pub fn retorno_google(url: &tauri::Url) -> Option<serde_json::Value> {
    if url.scheme() != "kangest" || url.host_str() != Some("auth") {
        return None;
    }
    let par = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.chars().take(300).collect::<String>());
    let estado = par("e").filter(|e| crate::sinc::entrada::estado_valido(e))?;
    let code = par("code").filter(|c| !c.is_empty() && c.chars().all(|x| x.is_ascii_alphanumeric() || "-_.".contains(x)));
    let erro = par("erro").map(|e| e.chars().filter(|c| !c.is_control()).take(200).collect::<String>());
    Some(serde_json::json!({ "estado": estado, "code": code, "erro": erro }))
}

/// Chegaram ligações (no arranque ou com o KanGest aberto): a janela vem para a frente e o último destino fica à espera
/// do ecrã, que é avisado («kangest-ligacao») e o vai buscar (`tirar_pendente`). O retorno do Google vai para o ecrã de
/// entrada («kangest-google»).
pub fn abrir(app: &tauri::AppHandle, urls: &[tauri::Url]) {
    use tauri::Emitter;
    if let Some(r) = urls.iter().rev().find_map(retorno_google) {
        crate::servico::mostrar(app);
        let _ = app.emit_to("main", "kangest-google", r);
        return;
    }
    if let Some(d) = urls.iter().rev().find_map(destino) {
        *PENDENTE.lock().unwrap_or_else(|e| e.into_inner()) = Some(d);
    }
    crate::servico::mostrar(app);
    let _ = app.emit_to("main", "kangest-ligacao", ());
}

/// O destino à espera, uma vez só (`ligacao.pendente`; o ecrã chama-o ao abrir e quando é avisado).
pub fn tirar_pendente() -> Option<String> {
    PENDENTE.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[cfg(test)]
mod testes {
    use super::*;

    fn d(s: &str) -> Option<String> {
        destino(&tauri::Url::parse(s).unwrap())
    }

    #[test]
    fn so_os_destinos_da_lista_e_com_os_ids_conferidos() {
        assert_eq!(d("kangest://loja-online/encomenda/0b4c1a6e-1234-4f00-9abc-1234567890ab").as_deref(), Some("/loja-online?encomenda=0b4c1a6e-1234-4f00-9abc-1234567890ab"));
        assert_eq!(d("kangest://loja-online?filtro=por_confirmar").as_deref(), Some("/loja-online?filtro=por_confirmar"));
        assert_eq!(d("kangest://loja-online/").as_deref(), Some("/loja-online"));
        assert_eq!(d("kangest://ajuda").as_deref(), Some("/?ajuda=avisos"));
        // um filtro que não existe não passa para o endereço
        assert_eq!(d("kangest://loja-online?filtro=x%26y").as_deref(), Some("/loja-online"));
        // ids estranhos, outros ecrãs e outros esquemas: só a janela
        assert_eq!(d("kangest://loja-online/encomenda/..%2F..%2Fconfiguracoes"), None);
        assert_eq!(d("kangest://loja-online/encomenda/a b"), None);
        assert_eq!(d("kangest://configuracoes?aba=sistema"), None);
        assert_eq!(d("kangest://documentos/anular/12"), None);
        assert_eq!(d("https://loja-online/encomenda/abc"), None);
        assert_eq!(d("kangest://"), None);
    }

    #[test]
    fn o_retorno_do_google_so_com_um_estado_valido() {
        let r = |s: &str| retorno_google(&tauri::Url::parse(s).unwrap());
        let e = "aBcDeFgHiJkLmNoPqRsTuVwX";
        assert_eq!(
            r(&format!("kangest://auth?e={e}&code=0b4c1a6e-1234-4f00-9abc-1234567890ab")),
            Some(serde_json::json!({ "estado": e, "code": "0b4c1a6e-1234-4f00-9abc-1234567890ab", "erro": null }))
        );
        assert_eq!(r(&format!("kangest://auth?e={e}&erro=Acesso%20negado")).unwrap()["erro"], "Acesso negado");
        // um código com caracteres estranhos não passa; sem estado, ou com outro destino, não é retorno do Google
        assert_eq!(r(&format!("kangest://auth?e={e}&code=a%20b")).unwrap()["code"], serde_json::Value::Null);
        assert_eq!(r("kangest://auth?code=abc"), None);
        assert_eq!(r("kangest://auth?e=curto&code=abc"), None);
        assert_eq!(r(&format!("kangest://loja-online?e={e}&code=abc")), None);
        // e o retorno do Google não é um ecrã
        assert_eq!(destino(&tauri::Url::parse(&format!("kangest://auth?e={e}&code=abc")).unwrap()), None);
    }

    #[test]
    fn o_destino_pendente_sai_uma_vez() {
        *PENDENTE.lock().unwrap() = Some("/loja-online".into());
        assert_eq!(tirar_pendente().as_deref(), Some("/loja-online"));
        assert_eq!(tirar_pendente(), None);
    }
}
