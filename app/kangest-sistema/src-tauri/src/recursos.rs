// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Os recursos deste computador: os núcleos, a memória e o espaço livre no disco. O KanGest adapta-se à máquina onde
//! está instalado, em vez de valores fixos que eram curtos num servidor de loja e pesados num portátil antigo:
//!
//! - **a base de dados** (db.rs): o número de ligações cresce com os núcleos (mais postos a ler ao mesmo tempo) e a
//!   cache de cada ligação com a memória. Com a base cifrada, cada página lida do disco tem de ser decifrada: o que já
//!   está na cache não se decifra outra vez;
//! - **as cópias de segurança e as actualizações** (services/sistema.rs, db.rs): antes de uma cópia, confere-se o espaço
//!   livre. Antes, um disco quase cheio enchia a meio da cópia.
//!
//! Windows: `GlobalMemoryStatusEx` e `GetDiskFreeSpaceExW` (kernel32). macOS: `sysctl hw.memsize` e `statvfs`. Linux:
//! `/proc/meminfo` e `statvfs`.

use std::path::Path;

use serde_json::{json, Value};

/// Os núcleos que o programa pode usar.
pub fn nucleos() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2)
}

/// A memória física, em bytes (`None` se o sistema não a disser).
pub fn memoria_total() -> Option<u64> {
    sistema::memoria_total().filter(|m| *m > 0)
}

/// O espaço livre para este utilizador no disco onde está `p` (ou a pasta mais próxima que exista), em bytes.
pub fn espaco_livre(p: &Path) -> Option<u64> {
    let pasta = p.ancestors().find(|a| a.is_dir())?;
    sistema::espaco_livre(pasta)
}

/// Como a base de dados se configura neste computador.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PerfilBase {
    /// Ligações à base (o SQLite em WAL lê em paralelo; as escritas fazem fila).
    pub ligacoes: u32,
    /// A cache de páginas de cada ligação, em KiB (o `cache_size` negativo do SQLite).
    pub cache_kib: i64,
    /// As ordenações e os agrupamentos grandes em memória, em vez de ficheiros temporários (no Windows, o antivírus
    /// examina cada ficheiro temporário). Só com memória que chegue.
    pub temporarios_em_memoria: bool,
}

const MIB: u64 = 1024 * 1024;

/// A configuração da base para um computador com estes núcleos e esta memória (sem ela, conta-se com 4 GB):
/// - ligações: o dobro dos núcleos, entre 4 e 12;
/// - cache: 1/64 da memória, entre 16 MB e 256 MB no total, repartida pelas ligações (entre 2 MB, o valor do SQLite,
///   e 32 MB cada). É um máximo: cada ligação só ocupa o que a base precisar.
pub fn perfil_base(nucleos: usize, memoria: Option<u64>) -> PerfilBase {
    let memoria = memoria.unwrap_or(4096 * MIB);
    let ligacoes = (nucleos.saturating_mul(2)).clamp(4, 12) as u32;
    let total = (memoria / 64).clamp(16 * MIB, 256 * MIB);
    let cada = (total / u64::from(ligacoes)).clamp(2 * MIB, 32 * MIB);
    PerfilBase { ligacoes, cache_kib: (cada / 1024) as i64, temporarios_em_memoria: memoria >= 3 * 1024 * MIB }
}

/// O perfil deste computador.
pub fn perfil_deste() -> PerfilBase {
    perfil_base(nucleos(), memoria_total())
}

/// Para «Sobre o KanGest» e o diagnóstico: o que o programa encontrou nesta máquina e como se configurou.
pub fn resumo(pasta_dados: &Path) -> Value {
    let p = perfil_deste();
    json!({
        "nucleos": nucleos(),
        "memoria": memoria_total(),
        "espaco_livre": espaco_livre(pasta_dados),
        "ligacoes": p.ligacoes,
        "cache_kib": p.cache_kib,
        "temporarios_em_memoria": p.temporarios_em_memoria,
    })
}

/// Um tamanho em bytes para ler: «850 MB», «12,4 GB».
pub fn tamanho_legivel(b: u64) -> String {
    let gb = b as f64 / (1024.0 * MIB as f64);
    if gb >= 1.0 {
        format!("{gb:.1} GB").replace('.', ",")
    } else {
        format!("{} MB", b.div_ceil(MIB))
    }
}

#[cfg(windows)]
mod sistema {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    /// MEMORYSTATUSEX: dwLength, dwMemoryLoad e sete contadores de 64 bits (o primeiro é a memória física total).
    #[repr(C)]
    struct EstadoMemoria {
        tamanho: u32,
        _carga: u32,
        valores: [u64; 7],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(estado: *mut EstadoMemoria) -> i32;
        fn GetDiskFreeSpaceExW(pasta: *const u16, livre: *mut u64, total: *mut u64, total_livre: *mut u64) -> i32;
    }

    pub fn memoria_total() -> Option<u64> {
        let mut e = EstadoMemoria { tamanho: std::mem::size_of::<EstadoMemoria>() as u32, _carga: 0, valores: [0; 7] };
        // SAFETY: a estrutura tem o tamanho e a disposição de MEMORYSTATUSEX, com dwLength preenchido
        (unsafe { GlobalMemoryStatusEx(&mut e) } != 0).then_some(e.valores[0])
    }

    pub fn espaco_livre(pasta: &Path) -> Option<u64> {
        let w: Vec<u16> = pasta.as_os_str().encode_wide().chain(Some(0)).collect();
        let (mut livre, mut total, mut total_livre) = (0u64, 0u64, 0u64);
        // SAFETY: o caminho termina em zero e os três ponteiros são de u64 válidos
        (unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut livre, &mut total, &mut total_livre) } != 0).then_some(livre)
    }
}

#[cfg(unix)]
mod sistema {
    use std::path::Path;

    #[cfg(target_os = "macos")]
    pub fn memoria_total() -> Option<u64> {
        let mut v: u64 = 0;
        let mut n = std::mem::size_of::<u64>();
        // SAFETY: hw.memsize é um u64; o nome termina em zero
        let r = unsafe { libc::sysctlbyname(c"hw.memsize".as_ptr(), (&mut v as *mut u64).cast(), &mut n, std::ptr::null_mut(), 0) };
        (r == 0).then_some(v)
    }

    #[cfg(not(target_os = "macos"))]
    pub fn memoria_total() -> Option<u64> {
        let t = std::fs::read_to_string("/proc/meminfo").ok()?;
        let kb: u64 = t.lines().find_map(|l| l.strip_prefix("MemTotal:"))?.trim().trim_end_matches("kB").trim().parse().ok()?;
        Some(kb * 1024)
    }

    // os contadores do statvfs são u32 no macOS e u64 no Linux
    #[allow(clippy::unnecessary_cast)]
    pub fn espaco_livre(pasta: &Path) -> Option<u64> {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(pasta.as_os_str().as_bytes()).ok()?;
        // SAFETY: statvfs só escreve na estrutura; zeros são um valor válido para ela
        let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
        if unsafe { libc::statvfs(c.as_ptr(), &mut s) } != 0 {
            return None;
        }
        let bloco = if s.f_frsize > 0 { s.f_frsize as u64 } else { s.f_bsize as u64 };
        Some((s.f_bavail as u64).saturating_mul(bloco))
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_perfil_da_base_adapta_se_ao_computador() {
        let gb = |n: u64| Some(n * 1024 * MIB);
        // um portátil antigo: 2 núcleos, 2 GB
        let p = perfil_base(2, gb(2));
        assert_eq!(p.ligacoes, 4);
        assert_eq!(p.cache_kib, 8 * 1024, "32 MB no total, 8 MB por ligação");
        assert!(!p.temporarios_em_memoria, "com pouca memória, as ordenações grandes vão para o disco");
        // o computador típico de uma caixa: 4 núcleos, 8 GB
        let p = perfil_base(4, gb(8));
        assert_eq!((p.ligacoes, p.cache_kib), (8, 16 * 1024));
        assert!(p.temporarios_em_memoria);
        // um servidor de loja: 16 núcleos, 32 GB — limitado a 12 ligações e 256 MB
        let p = perfil_base(16, gb(32));
        assert_eq!(p.ligacoes, 12);
        assert_eq!(p.cache_kib, (256 * 1024) / 12);
        // um só núcleo e sem saber a memória: o mínimo de 4 ligações e as contas com 4 GB
        let p = perfil_base(1, None);
        assert_eq!((p.ligacoes, p.cache_kib), (4, 16 * 1024));
        // nunca abaixo da cache por omissão do SQLite (2 MB)
        assert!(perfil_base(64, Some(512 * MIB)).cache_kib >= 2 * 1024);
    }

    #[test]
    fn os_recursos_deste_computador() {
        assert!(nucleos() >= 1);
        let m = memoria_total().expect("a memória do computador");
        assert!(m >= 256 * MIB, "{m}");
        let d = std::env::temp_dir();
        assert!(espaco_livre(&d).is_some_and(|l| l > 0));
        // uma pasta que ainda não existe: conta a mais próxima que existe (o mesmo disco)
        assert!(espaco_livre(&d.join("kangest-ainda-nao-existe").join("copias")).is_some());
        assert!(resumo(&d)["ligacoes"].as_u64().unwrap() >= 4);
    }

    #[test]
    fn tamanhos_para_ler() {
        assert_eq!(tamanho_legivel(850 * MIB), "850 MB");
        assert_eq!(tamanho_legivel(1), "1 MB");
        assert_eq!(tamanho_legivel(12 * 1024 * MIB + 400 * MIB), "12,4 GB");
    }
}
