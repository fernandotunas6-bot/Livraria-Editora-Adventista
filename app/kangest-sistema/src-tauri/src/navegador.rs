// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Navegador integrado da edição da livraria (docs/NAVEGADOR.md; fase 5 de docs/ECOSSISTEMA.md na raiz da livraria).
//!
//! Cada separador é uma janela `web-<n>` com um site da Internet e **sem acesso ao programa**:
//! - nenhuma capability (`capabilities/*.json`) inclui as janelas `web-*`, por isso não têm permissões do Tauri;
//! - os comandos do programa (`rpc`, `navegador`, `imprimir`, `reiniciar`) recusam pedidos dessas janelas
//!   (`janela_do_programa`), mesmo que uma delas chegue a carregar uma página do próprio programa;
//! - a navegação só vai para `https:` e `http:` na Internet. Nunca para o programa (`tauri:`, `ipc:`, `asset:`,
//!   `*.localhost`), para ficheiros, nem para a rede local (IP privados, `.local`, nomes sem domínio);
//! - as janelas que um site abre (`window.open`) são outros separadores, com as mesmas regras;
//! - os dados dos sites (cookies, sessões) ficam numa pasta própria, longe dos do programa; a sessão privada não
//!   guarda nada, nem no histórico.
//!
//! O histórico, os favoritos e as transferências ficam em `navegador.json`, na pasta de dados desta máquina, e não
//! na base da empresa: num posto em rede, cada computador tem os seus.

use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Prefixo das janelas dos separadores.
pub const PREFIXO: &str = "web-";
/// Onde vai o que se escreve na barra e não é um endereço.
const PESQUISA: &str = "https://duckduckgo.com/";
const MAX_HISTORICO: usize = 500;
const MAX_TRANSFERENCIAS: usize = 100;

static PROXIMO: AtomicU32 = AtomicU32::new(1);
/// Uma escrita de cada vez em `navegador.json` (as páginas carregam em várias janelas ao mesmo tempo).
static FICHEIRO: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pagina {
    pub url: String,
    #[serde(default)]
    pub titulo: String,
    #[serde(default)]
    pub em: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Transferencia {
    pub url: String,
    pub ficheiro: String,
    pub ok: bool,
    pub em: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dados {
    #[serde(default = "favoritos_de_origem")]
    pub favoritos: Vec<Pagina>,
    #[serde(default)]
    pub historico: Vec<Pagina>,
    #[serde(default)]
    pub transferencias: Vec<Transferencia>,
}

impl Default for Dados {
    fn default() -> Self {
        Dados { favoritos: favoritos_de_origem(), historico: Vec::new(), transferencias: Vec::new() }
    }
}

/// Os favoritos com que o navegador começa: a loja, o painel da livraria e o Painel de Gestão.
fn favoritos_de_origem() -> Vec<Pagina> {
    [
        ("https://livrariaadventista.ao/", "Livraria Adventista"),
        ("https://livrariaadventista.ao/admin", "Painel da livraria"),
        ("https://gestao.livrariaadventista.ao/", "Painel de Gestão"),
    ]
    .into_iter()
    .map(|(url, titulo)| Pagina { url: url.into(), titulo: titulo.into(), em: String::new() })
    .collect()
}

// ---------------------------------------------------------------------------------------------------------------
// Regras (puras, testadas abaixo)
// ---------------------------------------------------------------------------------------------------------------

/// Uma janela pode usar os comandos do programa? Os separadores do navegador não.
pub fn janela_do_programa(label: &str) -> bool {
    !label.starts_with(PREFIXO)
}

fn ip_da_rede_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            v.is_private() || v.is_loopback() || v.is_link_local() || v.is_unspecified() || v.is_broadcast() || (o[0] == 100 && (64..128).contains(&o[1]))
        }
        IpAddr::V6(v) => {
            let s = v.segments();
            v.is_loopback()
                || v.is_unspecified()
                || (s[0] & 0xfe00) == 0xfc00
                || (s[0] & 0xffc0) == 0xfe80
                || v.to_ipv4_mapped().is_some_and(|m| ip_da_rede_local(IpAddr::V4(m)))
        }
    }
}

/// Pode um separador abrir este endereço? Só a Internet, por `https:` ou `http:`. O próprio programa, os ficheiros
/// e a rede local não.
pub fn endereco_permitido(url: &Url) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if !matches!(url.scheme(), "https" | "http") || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let Some(host) = url.host_str() else { return false };
    let host = host.trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase();
    if let Ok(ip) = host.parse::<IpAddr>() {
        return !ip_da_rede_local(ip);
    }
    let host = host.trim_end_matches('.');
    !(host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") || host.ends_with(".internal") || !host.contains('.'))
}

/// O que se escreve na barra: um endereço, com ou sem `https://`, ou, se não parecer um, uma pesquisa.
pub fn endereco_da_barra(texto: &str) -> Option<Url> {
    let t = texto.trim();
    if t.is_empty() {
        return None;
    }
    let parece_endereco = !t.contains(char::is_whitespace) && (t.contains("://") || t.contains('.'));
    let endereco = parece_endereco
        .then(|| if t.contains("://") { t.to_string() } else { format!("https://{t}") })
        .and_then(|e| Url::parse(&e).ok());
    endereco.or_else(|| Url::parse_with_params(PESQUISA, &[("q", t)]).ok())
}

/// Nome de ficheiro que se pode gravar em qualquer sistema: sem pastas, sem caracteres proibidos no Windows, sem
/// pontos no princípio (ficheiros escondidos) nem no fim.
pub fn nome_seguro(nome: &str) -> String {
    let limpo: String = nome
        .chars()
        .map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
        .take(150)
        .collect();
    let limpo = limpo.trim_start_matches(['.', ' ']).trim_end_matches(['.', ' ']);
    if limpo.is_empty() {
        "transferencia".into()
    } else {
        limpo.into()
    }
}

/// O caminho para gravar `nome` em `pasta` sem apagar um ficheiro que lá esteja: «x.pdf», «x (2).pdf», «x (3).pdf»…
pub fn caminho_livre(pasta: &Path, nome: &str) -> PathBuf {
    let primeiro = pasta.join(nome);
    if !primeiro.exists() {
        return primeiro;
    }
    let (base, ext) = match nome.rsplit_once('.') {
        Some((b, e)) if !b.is_empty() => (b.to_string(), format!(".{e}")),
        _ => (nome.to_string(), String::new()),
    };
    (2..1000).map(|n| pasta.join(format!("{base} ({n}){ext}"))).find(|p| !p.exists()).unwrap_or(primeiro)
}

/// Põe a página no topo do histórico, sem a repetir.
pub fn registar(historico: &mut Vec<Pagina>, url: &str, titulo: &str, em: &str) {
    let titulo = if titulo.is_empty() { historico.iter().find(|p| p.url == url).map(|p| p.titulo.clone()).unwrap_or_default() } else { titulo.to_string() };
    historico.retain(|p| p.url != url);
    historico.insert(0, Pagina { url: url.into(), titulo, em: em.into() });
    historico.truncate(MAX_HISTORICO);
}

// ---------------------------------------------------------------------------------------------------------------
// navegador.json
// ---------------------------------------------------------------------------------------------------------------

fn ficheiro(dir: &Path) -> PathBuf {
    dir.join("navegador.json")
}

pub fn ler(dir: &Path) -> Dados {
    std::fs::read_to_string(ficheiro(dir)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn mudar(dir: &Path, f: impl FnOnce(&mut Dados)) -> AppResult<()> {
    let _vez = FICHEIRO.lock().unwrap_or_else(|e| e.into_inner());
    let mut d = ler(dir);
    f(&mut d);
    d.historico.truncate(MAX_HISTORICO);
    d.transferencias.truncate(MAX_TRANSFERENCIAS);
    std::fs::write(ficheiro(dir), serde_json::to_string_pretty(&d)?).map_err(|e| AppError::msg(format!("Não foi possível gravar o navegador: {e}")))
}

// ---------------------------------------------------------------------------------------------------------------
// Separadores
// ---------------------------------------------------------------------------------------------------------------

fn proximo_label() -> String {
    format!("{PREFIXO}{}", PROXIMO.fetch_add(1, Ordering::Relaxed))
}

/// Uma janela de separador com todas as regras. As janelas que o site abrir passam por aqui também.
fn construtor<'a>(app: &'a AppHandle, label: &str, url: WebviewUrl, privado: bool, dir: PathBuf) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let b = WebviewWindowBuilder::new(app, label, url)
        .title(if privado { "Internet (sessão privada) — KanGest Livraria" } else { "Internet — KanGest Livraria" })
        .inner_size(1200.0, 800.0)
        .on_navigation(endereco_permitido)
        // window.open: outro separador, com as mesmas regras (e a mesma pasta de dados, como o WebView2 exige)
        .on_new_window({
            let app = app.clone();
            let dir = dir.clone();
            move |url, caracteristicas| {
                if !endereco_permitido(&url) {
                    return NewWindowResponse::Deny;
                }
                match construtor(&app, &proximo_label(), WebviewUrl::External(url), privado, dir.clone()).window_features(caracteristicas).build() {
                    Ok(window) => NewWindowResponse::Create { window },
                    Err(_) => NewWindowResponse::Deny,
                }
            }
        })
        // transferências: para a pasta Transferências do utilizador, sem apagar o que lá estiver
        .on_download({
            let app = app.clone();
            let dir = dir.clone();
            move |_webview, evento| match evento {
                DownloadEvent::Requested { url, destination } => {
                    if matches!(url.scheme(), "https" | "http") && !endereco_permitido(&url) {
                        return false;
                    }
                    let nome = destination.file_name().and_then(|n| n.to_str()).map(nome_seguro).unwrap_or_else(|| "transferencia".into());
                    let pasta = app.path().download_dir().unwrap_or_else(|_| dir.join("transferencias"));
                    let _ = std::fs::create_dir_all(&pasta);
                    *destination = caminho_livre(&pasta, &nome);
                    true
                }
                DownloadEvent::Finished { url, path, success } => {
                    let ficheiro = path.map(|p| p.display().to_string()).unwrap_or_default();
                    let _ = mudar(&dir, |d| d.transferencias.insert(0, Transferencia { url: url.to_string(), ficheiro, ok: success, em: crate::db::agora() }));
                    true
                }
                _ => true,
            }
        })
        // histórico (nunca na sessão privada)
        .on_page_load({
            let dir = dir.clone();
            move |janela, carga| {
                if privado || !matches!(carga.event(), PageLoadEvent::Finished) || !matches!(carga.url().scheme(), "https" | "http") {
                    return;
                }
                let titulo = janela.title().unwrap_or_default();
                let url = carga.url().to_string();
                let _ = mudar(&dir, |d| registar(&mut d.historico, &url, &titulo, &crate::db::agora()));
            }
        })
        .on_document_title_changed({
            let dir = dir.clone();
            move |janela, titulo| {
                let _ = janela.set_title(&format!("{titulo} — Internet"));
                if privado {
                    return;
                }
                if let Ok(url) = janela.url() {
                    let _ = mudar(&dir, |d| {
                        if let Some(p) = d.historico.iter_mut().find(|p| p.url == url.as_str()) {
                            p.titulo = titulo.clone();
                        }
                    });
                }
            }
        });
    if privado {
        b.incognito(true)
    } else {
        b.data_directory(dir.join("navegador").join("perfil"))
    }
}

fn separador(app: &AppHandle, url: Url, privado: bool, dir: PathBuf) -> AppResult<WebviewWindow> {
    construtor(app, &proximo_label(), WebviewUrl::External(url), privado, dir).build().map_err(|e| AppError::msg(format!("Não foi possível abrir o separador: {e}")))
}

/// Uma janela de separador já aberta (nunca a do programa).
fn janela(app: &AppHandle, label: &str) -> AppResult<WebviewWindow> {
    if janela_do_programa(label) {
        return Err(AppError::msg("Isso não é um separador do navegador."));
    }
    app.get_webview_window(label).ok_or_else(|| AppError::msg("Esse separador já foi fechado."))
}

fn estado(app: &AppHandle, dir: &Path) -> Value {
    let mut abertos: Vec<(u32, Value)> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| !janela_do_programa(label))
        .map(|(label, j)| {
            let n = label.trim_start_matches(PREFIXO).parse().unwrap_or(0);
            (n, json!({ "label": label, "titulo": j.title().unwrap_or_default(), "url": j.url().map(|u| u.to_string()).unwrap_or_default() }))
        })
        .collect();
    abertos.sort_by_key(|(n, _)| *n);
    let d = ler(dir);
    json!({
        "separadores": abertos.into_iter().map(|(_, v)| v).collect::<Vec<_>>(),
        "favoritos": d.favoritos,
        "historico": d.historico.iter().take(100).collect::<Vec<_>>(),
        "transferencias": d.transferencias,
    })
}

#[derive(Deserialize)]
struct Abrir {
    texto: String,
    #[serde(default)]
    privado: bool,
}

#[derive(Deserialize)]
struct Alvo {
    label: String,
}

#[derive(Deserialize)]
struct Favorito {
    url: String,
    #[serde(default)]
    titulo: String,
    #[serde(default)]
    remover: bool,
}

/// O comando do ecrã «Internet» (`invoke("navegador", { acao, dados })`). Só a janela do programa, com sessão.
#[tauri::command]
pub async fn navegador(app: AppHandle, webview: tauri::Webview, state: tauri::State<'_, Arc<AppState>>, acao: String, dados: Option<Value>) -> Result<Value, AppError> {
    if !janela_do_programa(webview.label()) {
        return Err(AppError::msg("Os separadores do navegador não usam o programa."));
    }
    state.sessao()?;
    let dir = state.pasta_dados.clone();
    let dados = dados.unwrap_or(Value::Null);
    match acao.as_str() {
        "estado" => Ok(estado(&app, &dir)),
        "abrir" => {
            let a: Abrir = serde_json::from_value(dados)?;
            let url = endereco_da_barra(&a.texto).ok_or_else(|| AppError::msg("Escreva um endereço ou o que quer pesquisar."))?;
            if !endereco_permitido(&url) {
                return Err(AppError::msg("Este endereço não abre no navegador do KanGest: só sites da Internet, nunca ficheiros, a rede local nem o próprio programa."));
            }
            let j = separador(&app, url, a.privado, dir)?;
            Ok(json!({ "label": j.label() }))
        }
        "focar" => {
            let a: Alvo = serde_json::from_value(dados)?;
            let j = janela(&app, &a.label)?;
            let _ = j.unminimize();
            j.set_focus().map_err(|e| AppError::msg(e.to_string()))?;
            Ok(Value::Null)
        }
        "fechar" => {
            let a: Alvo = serde_json::from_value(dados)?;
            janela(&app, &a.label)?.close().map_err(|e| AppError::msg(e.to_string()))?;
            Ok(Value::Null)
        }
        "favorito" => {
            let f: Favorito = serde_json::from_value(dados)?;
            let url = Url::parse(f.url.trim()).map_err(|_| AppError::msg("Endereço inválido."))?;
            if !endereco_permitido(&url) {
                return Err(AppError::msg("Só sites da Internet entram nos favoritos."));
            }
            let titulo = if f.titulo.trim().is_empty() { url.host_str().unwrap_or_default().to_string() } else { f.titulo.trim().to_string() };
            mudar(&dir, |d| {
                d.favoritos.retain(|p| p.url != url.as_str());
                if !f.remover {
                    d.favoritos.push(Pagina { url: url.to_string(), titulo, em: crate::db::agora() });
                }
            })?;
            Ok(estado(&app, &dir))
        }
        "limparHistorico" => {
            mudar(&dir, |d| d.historico.clear())?;
            Ok(estado(&app, &dir))
        }
        "limparTransferencias" => {
            mudar(&dir, |d| d.transferencias.clear())?;
            Ok(estado(&app, &dir))
        }
        _ => Err(AppError::msg(format!("Acção desconhecida do navegador: {acao}"))),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn so_a_internet() {
        for sim in ["https://livrariaadventista.ao/admin", "http://exemplo.ao/", "https://8.8.8.8/", "https://[2001:4860:4860::8888]/", "about:blank"] {
            assert!(endereco_permitido(&u(sim)), "{sim}");
        }
        for nao in [
            // o próprio programa
            "tauri://localhost/",
            "http://tauri.localhost/",
            "https://tauri.localhost/",
            "http://ipc.localhost/rpc",
            "asset://localhost/x",
            "http://localhost:1420/",
            // ficheiros e outros esquemas
            "file:///C:/Windows/win.ini",
            "javascript:alert(1)",
            "data:text/html,<b>x</b>",
            "ftp://exemplo.ao/",
            // a rede local (a API do KanGest, a impressora, o router)
            "http://127.0.0.1:8080/api/v1",
            "http://192.168.1.10/",
            "http://10.0.0.1/",
            "http://172.16.0.1/",
            "http://169.254.1.1/",
            "http://100.64.0.1/",
            "http://[::1]/",
            "http://[fe80::1]/",
            "http://[fd00::1]/",
            "http://[::ffff:192.168.0.1]/",
            "http://servidor/",
            "http://impressora.local/",
            // credenciais no endereço
            "https://utilizador:senha@exemplo.ao/",
        ] {
            assert!(!endereco_permitido(&u(nao)), "{nao}");
        }
    }

    #[test]
    fn barra_de_endereco() {
        assert_eq!(endereco_da_barra("livrariaadventista.ao").unwrap().as_str(), "https://livrariaadventista.ao/");
        assert_eq!(endereco_da_barra(" https://exemplo.ao/x?y=1 ").unwrap().as_str(), "https://exemplo.ao/x?y=1");
        assert_eq!(endereco_da_barra("livros de Ellen White").unwrap().as_str(), "https://duckduckgo.com/?q=livros+de+Ellen+White");
        assert!(endereco_da_barra("   ").is_none());
        // parece um endereço mas é da rede local: abre-se esse endereço, que depois é recusado (não vira pesquisa)
        assert!(!endereco_permitido(&endereco_da_barra("192.168.1.1").unwrap()));
    }

    #[test]
    fn separadores_nao_usam_o_programa() {
        assert!(janela_do_programa("main"));
        assert!(janela_do_programa("visor"));
        assert!(!janela_do_programa("web-1"));
        assert!(!janela_do_programa(&proximo_label()));
    }

    /// Nenhuma capability chega aos separadores: nem pelo nome (`web-*`, `*`) nem pelo endereço (`remote`).
    #[test]
    fn capabilities_sem_os_separadores() {
        let todas = [("default", include_str!("../capabilities/default.json")), ("nativo", include_str!("../capabilities/nativo.json"))];
        for (nome, texto) in todas {
            let v: Value = serde_json::from_str(texto).unwrap();
            assert!(v.get("remote").is_none(), "{nome}: remote");
            for campo in ["windows", "webviews"] {
                for j in v[campo].as_array().into_iter().flatten() {
                    let j = j.as_str().unwrap();
                    assert!(!j.contains('*') && janela_do_programa(j), "{nome}: {campo} {j}");
                }
            }
        }
        let n = std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities")).unwrap().count();
        assert_eq!(n, todas.len(), "há uma capability nova: junte-a a este teste");
    }

    #[test]
    fn nomes_das_transferencias() {
        assert_eq!(nome_seguro("relatório:final?.pdf"), "relatório_final_.pdf");
        assert_eq!(nome_seguro("a/b\\c.txt"), "a_b_c.txt");
        assert_eq!(nome_seguro("..escondido"), "escondido");
        assert_eq!(nome_seguro("nome. "), "nome");
        assert_eq!(nome_seguro(""), "transferencia");
        let pasta = std::env::temp_dir().join(format!("kangest-nav-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&pasta);
        std::fs::create_dir_all(&pasta).unwrap();
        assert_eq!(caminho_livre(&pasta, "x.pdf"), pasta.join("x.pdf"));
        std::fs::write(pasta.join("x.pdf"), b"1").unwrap();
        assert_eq!(caminho_livre(&pasta, "x.pdf"), pasta.join("x (2).pdf"));
        std::fs::write(pasta.join("LEIA"), b"1").unwrap();
        assert_eq!(caminho_livre(&pasta, "LEIA"), pasta.join("LEIA (2)"));
        let _ = std::fs::remove_dir_all(&pasta);
    }

    #[test]
    fn historico_sem_repetidos_e_o_mais_recente_primeiro() {
        let mut h = Vec::new();
        registar(&mut h, "https://a.ao/", "A", "1");
        registar(&mut h, "https://b.ao/", "B", "2");
        registar(&mut h, "https://a.ao/", "", "3");
        assert_eq!(h.iter().map(|p| (p.url.as_str(), p.titulo.as_str(), p.em.as_str())).collect::<Vec<_>>(), [("https://a.ao/", "A", "3"), ("https://b.ao/", "B", "2")]);
    }

    #[test]
    fn ficheiro_do_navegador() {
        let pasta = std::env::temp_dir().join(format!("kangest-nav-dados-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&pasta);
        std::fs::create_dir_all(&pasta).unwrap();
        // sem ficheiro: os favoritos de origem
        assert_eq!(ler(&pasta).favoritos.len(), 3);
        mudar(&pasta, |d| {
            d.favoritos.clear();
            for i in 0..(MAX_HISTORICO + 10) {
                registar(&mut d.historico, &format!("https://s{i}.ao/"), "", "x");
            }
        })
        .unwrap();
        let d = ler(&pasta);
        // sem favoritos fica sem favoritos (não volta aos de origem), e o histórico tem um limite
        assert!(d.favoritos.is_empty());
        assert_eq!(d.historico.len(), MAX_HISTORICO);
        let _ = std::fs::remove_dir_all(&pasta);
    }
}
