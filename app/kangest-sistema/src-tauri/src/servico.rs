// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O KanGest ao serviço da loja: o computador de que outros dependem fica sempre a trabalhar.
//!
//! No computador servidor dos postos em rede, ou com o acesso pela Internet ligado, os postos, os telemóveis e as cópias
//! de segurança dependem de o KanGest estar aberto. Antes, fechar a janela terminava o programa, e o Windows podia pôr
//! o computador a dormir a meio do dia. Agora, com este computador ao serviço:
//!
//! - **fechar a janela deixa o KanGest na bandeja** (junto ao relógio; no Mac, na barra de menus), a trabalhar. A sessão
//!   fica bloqueada (só se retoma com a senha ou o PIN) e um aviso diz onde o programa ficou;
//! - **o computador não adormece** enquanto serve. O ecrã apaga-se como de costume;
//! - **«Sair do KanGest»**, no ícone da bandeja, pede confirmação, porque os postos deixam de vender.
//!
//! As duas são opções de quem usa o computador, cada uma à parte: «Automático» (por omissão: quando é o servidor da rede
//! ou tem o acesso pela Internet ligado), «Sempre» ou «Nunca». Ficam em `servico.json`, na pasta de dados (cada computador
//! tem as suas; Configurações → Rede).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const FICHEIRO: &str = "servico.json";
/// O id do ícone e das opções do menu dele (o tratamento dos menus do Tauri recebe os de todos os menus).
const ABRIR: &str = "kangest-abrir";
const SAIR: &str = "kangest-sair";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modo {
    /// Ao serviço quando outros dependem deste computador (servidor da rede ou acesso pela Internet).
    Automatico,
    Sempre,
    Nunca,
}

impl Modo {
    fn de(s: &str) -> Modo {
        match s {
            "sempre" => Modo::Sempre,
            "nunca" => Modo::Nunca,
            _ => Modo::Automatico,
        }
    }
    fn nome(self) -> &'static str {
        match self {
            Modo::Automatico => "automatico",
            Modo::Sempre => "sempre",
            Modo::Nunca => "nunca",
        }
    }
}

/// As duas escolhas deste computador.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Escolhas {
    /// Fechar a janela deixa o KanGest na bandeja.
    bandeja: Modo,
    /// O computador não adormece.
    acordado: Modo,
}

static PASTA: OnceLock<PathBuf> = OnceLock::new();
static ESCOLHAS: Mutex<Escolhas> = Mutex::new(Escolhas { bandeja: Modo::Automatico, acordado: Modo::Automatico });
/// O sistema está impedido de adormecer agora (para o ecrã).
static ACORDADO: AtomicBool = AtomicBool::new(false);

/// Ao serviço com este modo: «Sempre» e «Nunca» mandam; no automático, quando há outros a depender deste computador.
pub fn activo_com(modo: Modo, servidor: bool, acesso_web: bool) -> bool {
    match modo {
        Modo::Sempre => true,
        Modo::Nunca => false,
        Modo::Automatico => servidor || acesso_web,
    }
}

fn escolhas() -> Escolhas {
    *ESCOLHAS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Quem depende deste computador agora: (servidor dos postos em rede, acesso pela Internet a correr).
fn dependentes() -> (bool, bool) {
    (crate::rede::config().modo == "servidor", crate::services::acesso_web::a_correr())
}

/// Há outros a depender deste computador agora (os postos em rede, o acesso pela Internet)?
fn servem_se_dele() -> bool {
    let (servidor, web) = dependentes();
    servidor || web
}

/// Fechar a janela deixa o KanGest na bandeja (pela escolha «bandeja»)?
pub fn fecha_para_a_bandeja() -> bool {
    let (servidor, web) = dependentes();
    activo_com(escolhas().bandeja, servidor, web)
}

/// O computador não deve adormecer (pela escolha «acordado»)?
pub fn nao_adormece() -> bool {
    let (servidor, web) = dependentes();
    activo_com(escolhas().acordado, servidor, web)
}

/// As escolhas gravadas em `servico.json` (o que faltar fica no automático).
fn ler(v: &Value) -> Escolhas {
    let m = |k: &str| v[k].as_str().map(Modo::de).unwrap_or(Modo::Automatico);
    Escolhas { bandeja: m("bandeja"), acordado: m("acordado") }
}

/// Lê as escolhas deste computador (no arranque, antes de abrir a janela).
pub fn carregar(pasta: &Path) {
    let _ = PASTA.set(pasta.to_path_buf());
    let v = std::fs::read_to_string(pasta.join(FICHEIRO)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).unwrap_or(Value::Null);
    *ESCOLHAS.lock().unwrap_or_else(|e| e.into_inner()) = ler(&v);
}

/// O ícone na bandeja e a vigia do sono (no fim do arranque).
pub fn iniciar(app: &tauri::AppHandle) {
    if let Err(e) = bandeja(app) {
        eprintln!("O ícone do KanGest na bandeja não foi criado: {e}");
    }
    acordado::vigiar();
}

fn bandeja(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let abrir = MenuItem::with_id(app, ABRIR, "Abrir o KanGest", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let sair = MenuItem::with_id(app, SAIR, "Sair do KanGest", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &separador, &sair])?;
    let mut b = TrayIconBuilder::with_id("kangest")
        .tooltip("KanGest Livraria")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            ABRIR => mostrar(app),
            SAIR => pedir_para_sair(app),
            _ => {}
        })
        .on_tray_icon_event(|icone, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                mostrar(icone.app_handle());
            }
        });
    if let Some(i) = app.default_window_icon() {
        b = b.icon(i.clone());
    }
    b.build(app)?;
    Ok(())
}

/// Traz a janela principal para a frente (do ícone da bandeja, do Dock no Mac).
pub fn mostrar(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(j) = app.get_webview_window("main") {
        let _ = j.unminimize();
        let _ = j.show();
        let _ = j.set_focus();
    }
}

/// «Sair do KanGest»: com outros a depender deste computador, só depois de confirmar (os postos deixam de vender).
fn pedir_para_sair(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    if !servem_se_dele() {
        app.exit(0);
        return;
    }
    let a = app.clone();
    app.dialog()
        .message(
            "Os postos da loja, o acesso pela Internet e as cópias de segurança deixam de funcionar enquanto o KanGest estiver \
             fechado neste computador.",
        )
        .title("Sair do KanGest?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Sair".into(), "Continuar a trabalhar".into()))
        .show(move |sair| {
            if sair {
                a.exit(0);
            }
        });
}

/// A janela `janela` vai fechar. Com a escolha «bandeja», a principal esconde-se (o programa continua na bandeja) e a
/// sessão fica bloqueada. Devolve se o fecho deve ser travado.
pub fn esconder_em_vez_de_fechar(janela: &tauri::Window) -> bool {
    use tauri::{Emitter, Manager};
    if janela.label() != "main" || !fecha_para_a_bandeja() {
        return false;
    }
    let _ = janela.hide();
    let app = janela.app_handle().clone();
    let st = app.try_state::<Arc<AppState>>().map(|s| s.inner().clone());
    // primeiro o bloqueio, depois o aviso ao ecrã (que confere a sessão e mostra o ecrã bloqueado)
    tauri::async_runtime::spawn(async move {
        if let Some(st) = st.filter(|s| s.sessao().is_ok()) {
            let _ = crate::services::bloquear_sessao(&st).await;
        }
        let _ = app.emit_to("main", "sessao-bloqueada", ());
    });
    crate::nativo::notificar(
        "bandeja",
        "O KanGest continua a trabalhar",
        "Os postos, as cópias e a ligação ao site continuam. Para o abrir ou sair, use o ícone do KanGest junto ao relógio.",
    );
    true
}

/// Para Configurações → Rede: as duas escolhas e o que valem agora.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.sessao()?;
    let (servidor, web) = dependentes();
    let e = escolhas();
    Ok(json!({
        "bandeja": e.bandeja.nome(),
        "acordado": e.acordado.nome(),
        "fecha_para_a_bandeja": activo_com(e.bandeja, servidor, web),
        "nao_adormece": activo_com(e.acordado, servidor, web),
        "acordado_agora": ACORDADO.load(Ordering::Relaxed),
        "servidor": servidor,
        "acesso_web": web,
    }))
}

#[derive(Deserialize)]
pub struct GuardarIn {
    #[serde(default)]
    bandeja: Option<String>,
    #[serde(default)]
    acordado: Option<String>,
}

pub async fn guardar(st: &AppState, i: GuardarIn) -> AppResult<Value> {
    st.exigir_perm("sistema.configuracoes")?;
    let valido = |m: &Option<String>| m.as_deref().is_none_or(|m| matches!(m, "automatico" | "sempre" | "nunca"));
    if !valido(&i.bandeja) || !valido(&i.acordado) {
        return Err(AppError::msg("Escolha automático, sempre ou nunca."));
    }
    let pasta = PASTA.get().ok_or_else(|| AppError::msg("Esta função só existe na aplicação instalada."))?;
    let mut e = escolhas();
    if let Some(m) = &i.bandeja {
        e.bandeja = Modo::de(m);
    }
    if let Some(m) = &i.acordado {
        e.acordado = Modo::de(m);
    }
    std::fs::write(pasta.join(FICHEIRO), json!({ "bandeja": e.bandeja.nome(), "acordado": e.acordado.nome() }).to_string())
        .map_err(|e| AppError::msg(format!("Não foi possível gravar a escolha: {e}")))?;
    *ESCOLHAS.lock().unwrap_or_else(|e| e.into_inner()) = e;
    estado(st).await
}

/// O sono do computador: de minuto a minuto, ao serviço o sistema não adormece; fora dele, volta ao normal. O ecrã
/// continua a apagar-se. Windows: `SetThreadExecutionState` na própria thread. macOS: uma asserção do IOKit.
mod acordado {
    use super::*;

    pub fn vigiar() {
        let r = std::thread::Builder::new().name("kangest-acordado".into()).spawn(|| loop {
            let quer = super::nao_adormece();
            if quer != ACORDADO.load(Ordering::Relaxed) {
                ACORDADO.store(sistema::manter(quer), Ordering::Relaxed);
            }
            std::thread::sleep(Duration::from_secs(60));
        });
        if let Err(e) = r {
            eprintln!("A vigia do sono não arrancou: {e}");
        }
    }

    #[cfg(windows)]
    mod sistema {
        const ES_CONTINUOUS: u32 = 0x8000_0000;
        const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(estado: u32) -> u32;
        }

        /// Liga (ou desliga) o «não adormecer» desta thread; devolve se ficou ligado.
        pub fn manter(sim: bool) -> bool {
            let f = if sim { ES_CONTINUOUS | ES_SYSTEM_REQUIRED } else { ES_CONTINUOUS };
            // SAFETY: só muda o pedido de energia desta thread
            let r = unsafe { SetThreadExecutionState(f) };
            sim && r != 0
        }
    }

    #[cfg(target_os = "macos")]
    mod sistema {
        use std::ffi::{c_char, c_void};
        use std::sync::Mutex;

        type CFStringRef = *const c_void;

        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            fn CFStringCreateWithCString(alocador: *const c_void, texto: *const c_char, codificacao: u32) -> CFStringRef;
            fn CFRelease(cf: *const c_void);
        }

        #[link(name = "IOKit", kind = "framework")]
        extern "C" {
            fn IOPMAssertionCreateWithName(tipo: CFStringRef, nivel: u32, nome: CFStringRef, id: *mut u32) -> i32;
            fn IOPMAssertionRelease(id: u32) -> i32;
        }

        const UTF8: u32 = 0x0800_0100;
        const LIGADA: u32 = 255;
        static ASSERCAO: Mutex<Option<u32>> = Mutex::new(None);

        /// Cria (ou larga) a asserção «PreventUserIdleSystemSleep»; devolve se ficou ligada.
        pub fn manter(sim: bool) -> bool {
            let mut a = ASSERCAO.lock().unwrap_or_else(|e| e.into_inner());
            if sim && a.is_none() {
                // SAFETY: textos terminados em zero; cada CFString criada é largada; o id é um u32 válido
                unsafe {
                    let tipo = CFStringCreateWithCString(std::ptr::null(), c"PreventUserIdleSystemSleep".as_ptr(), UTF8);
                    let nome = CFStringCreateWithCString(std::ptr::null(), c"KanGest: a servir os postos da loja".as_ptr(), UTF8);
                    if !tipo.is_null() && !nome.is_null() {
                        let mut id = 0u32;
                        if IOPMAssertionCreateWithName(tipo, LIGADA, nome, &mut id) == 0 {
                            *a = Some(id);
                        }
                    }
                    for s in [tipo, nome] {
                        if !s.is_null() {
                            CFRelease(s);
                        }
                    }
                }
            } else if !sim {
                if let Some(id) = a.take() {
                    // SAFETY: o id veio do IOPMAssertionCreateWithName
                    unsafe { IOPMAssertionRelease(id) };
                }
            }
            a.is_some()
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    mod sistema {
        /// No Linux (CI, desenvolvimento), não se mexe no sono.
        pub fn manter(_sim: bool) -> bool {
            false
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn ao_servico_e_automatico_com_a_escolha_a_mao() {
        // automático: só quando há quem dependa deste computador
        assert!(!activo_com(Modo::Automatico, false, false), "sozinho: fechar a janela fecha o programa");
        assert!(activo_com(Modo::Automatico, true, false), "servidor dos postos");
        assert!(activo_com(Modo::Automatico, false, true), "acesso pela Internet");
        // à mão, manda a escolha
        assert!(activo_com(Modo::Sempre, false, false));
        assert!(!activo_com(Modo::Nunca, true, true));
        for m in [Modo::Automatico, Modo::Sempre, Modo::Nunca] {
            assert_eq!(Modo::de(m.nome()), m);
        }
        assert_eq!(Modo::de("outra coisa"), Modo::Automatico);
    }

    /// Cada escolha é à parte, e o que faltar no ficheiro fica no automático.
    #[test]
    fn as_duas_escolhas_lem_se_a_parte() {
        let e = ler(&json!({ "bandeja": "nunca", "acordado": "sempre" }));
        assert_eq!((e.bandeja, e.acordado), (Modo::Nunca, Modo::Sempre));
        let e = ler(&json!({ "acordado": "nunca" }));
        assert_eq!((e.bandeja, e.acordado), (Modo::Automatico, Modo::Nunca));
        assert_eq!(ler(&Value::Null), Escolhas { bandeja: Modo::Automatico, acordado: Modo::Automatico });
    }
}
