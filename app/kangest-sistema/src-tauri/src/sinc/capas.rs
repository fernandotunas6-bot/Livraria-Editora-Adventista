// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As capas dos livros do site como fotografias dos artigos (KANGEST ONE, integração total; pedido do dono a 27/11).
//!
//! A cópia da Loja online (`loja_produtos`) já traz a capa de cada produto do site. Um artigo sem fotografia cuja
//! referência tem um produto com capa recebe-a:
//! - **aqui descarrega-se** (só de origens conhecidas: o Supabase e o site da livraria, e o Google Drive), e confere-se que
//!   é mesmo uma imagem;
//! - **o ecrã reduz-a** como a qualquer fotografia (`prepararFoto`: miniatura e imagem) e guarda-a (`fotos.guardar`).
//!
//! O que falha fica em `capas_tentadas` (migração 0073) e só se tenta outra vez quando o endereço da capa mudar. Uma
//! fotografia escolhida à mão nunca é substituída.

use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Uma capa com mais do que isto não se traz.
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// De onde se descarrega a capa: um endereço do Google Drive passa à descarga directa; o resto fica como está.
pub fn endereco_da_capa(capa: &str) -> Option<String> {
    let c = capa.trim();
    if !(c.starts_with("https://") || c.starts_with("http://")) {
        return None;
    }
    if c.contains("drive.google.com") {
        let id = c
            .split("/d/")
            .nth(1)
            .map(|r| r.split(['/', '?', '#']).next().unwrap_or(""))
            .or_else(|| c.split("id=").nth(1).map(|r| r.split(['&', '#']).next().unwrap_or("")))
            .filter(|i| !i.is_empty() && i.chars().all(|x| x.is_ascii_alphanumeric() || x == '-' || x == '_'))?;
        return Some(format!("https://drive.google.com/uc?export=download&id={id}"));
    }
    Some(c.to_string())
}

/// O anfitrião (com a porta, se a tiver) de um endereço.
fn anfitriao(url: &str) -> Option<(bool, String)> {
    let (https, resto) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else {
        (false, url.strip_prefix("http://")?)
    };
    let h = resto.split(['/', '?', '#']).next().unwrap_or("").to_ascii_lowercase();
    (!h.is_empty()).then_some((https, h))
}

/// A capa vem de uma origem conhecida? O site e o Supabase da livraria (os anfitriões da ligação) e o Google Drive. Sem
/// HTTPS, só os da ligação (num ensaio local).
pub fn origem_permitida(url: &str, permitidos: &[String]) -> bool {
    let Some((https, h)) = anfitriao(url) else { return false };
    if permitidos.iter().any(|p| p == &h) {
        return true;
    }
    https && (h == "drive.google.com" || h.ends_with(".googleusercontent.com"))
}

/// O tipo da imagem pelos primeiros bytes (o servidor nem sempre o diz bem).
pub fn tipo_da_imagem(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(b"\x89PNG") {
        Some("image/png")
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if b.len() > 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if b.starts_with(b"GIF8") {
        Some("image/gif")
    } else {
        None
    }
}

/// Os anfitriões da ligação ao site (o Supabase e o site), de onde as capas podem vir.
async fn permitidos(pool: &SqlitePool) -> Vec<String> {
    let l: Option<(String, String, String)> =
        sqlx::query_as("SELECT url, auth_url, site_url FROM sinc_ligacao WHERE id = 1").fetch_optional(pool).await.ok().flatten();
    let Some((a, b, c)) = l else { return Vec::new() };
    [a, b, c].iter().filter_map(|u| anfitriao(u).map(|x| x.1)).collect()
}

/// A capa do produto do site com a referência deste artigo.
async fn capa_do_artigo(pool: &SqlitePool, artigo_id: i64) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT json_extract(p.dados, '$.capa') FROM artigos a JOIN loja_produtos p ON TRIM(p.referencia) = TRIM(a.referencia)
          WHERE a.id = ? AND TRIM(COALESCE(a.referencia, '')) <> '' AND TRIM(COALESCE(json_extract(p.dados, '$.capa'), '')) <> ''
          LIMIT 1",
    )
    .bind(artigo_id)
    .fetch_optional(pool)
    .await?)
}

async fn marcar_falha(pool: &SqlitePool, artigo_id: i64, capa: &str, erro: &str) {
    let _ = sqlx::query(
        "INSERT INTO capas_tentadas (artigo_id, capa, erro, em) VALUES (?, ?, ?, ?)
         ON CONFLICT(artigo_id) DO UPDATE SET capa = excluded.capa, erro = excluded.erro, em = excluded.em",
    )
    .bind(artigo_id)
    .bind(capa)
    .bind(erro.chars().take(200).collect::<String>())
    .bind(db::agora())
    .execute(pool)
    .await;
}

/// Os artigos sem fotografia com uma capa no site por trazer (as que falharam com o mesmo endereço ficam de fora).
pub async fn pendentes(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let capas = db::query_json(
        &st.pool,
        "SELECT a.id AS artigo_id, a.referencia, a.descricao
           FROM artigos a JOIN loja_produtos p ON TRIM(p.referencia) = TRIM(a.referencia)
          WHERE TRIM(COALESCE(a.referencia, '')) <> '' AND a.ativo = 1
            AND TRIM(COALESCE(json_extract(p.dados, '$.capa'), '')) <> ''
            AND NOT EXISTS (SELECT 1 FROM artigo_fotos f WHERE f.artigo_id = a.id)
            AND NOT EXISTS (SELECT 1 FROM capas_tentadas t WHERE t.artigo_id = a.id AND t.capa = json_extract(p.dados, '$.capa'))
          GROUP BY a.id ORDER BY a.descricao LIMIT 1000",
    )
    .await?;
    let falhadas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM capas_tentadas").fetch_one(&st.pool).await?;
    Ok(json!({ "capas": capas, "falhadas": falhadas }))
}

#[derive(Deserialize)]
pub struct ArtigoIn {
    artigo_id: i64,
}

/// Descarrega a capa de um artigo e devolve-a como data URL (o ecrã reduz e guarda). Nunca um endereço vindo do ecrã:
/// só o da capa do produto do site com a referência deste artigo.
pub async fn descarregar(st: &AppState, i: ArtigoIn) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let Some(capa) = capa_do_artigo(&st.pool, i.artigo_id).await? else {
        return Err(AppError::msg("Este artigo não tem capa no site."));
    };
    let Some(url) = endereco_da_capa(&capa) else {
        marcar_falha(&st.pool, i.artigo_id, &capa, "endereço da capa inválido").await;
        return Err(AppError::msg("O endereço da capa no site não é válido."));
    };
    if !origem_permitida(&url, &permitidos(&st.pool).await) {
        marcar_falha(&st.pool, i.artigo_id, &capa, "origem não permitida").await;
        return Err(AppError::msg("A capa está num endereço de onde o KanGest não descarrega (só do site da livraria e do Google Drive)."));
    }
    let r = tokio::task::spawn_blocking(move || crate::http::pedido("GET", &url, &[], None, std::time::Duration::from_secs(30)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    let r = match r {
        Ok(r) => r,
        Err(e) => return Err(AppError::msg(format!("Sem ligação para trazer a capa: {e}"))),
    };
    if r.estado != 200 {
        marcar_falha(&st.pool, i.artigo_id, &capa, &format!("o servidor respondeu {}", r.estado)).await;
        return Err(AppError::msg(format!("A capa não se pôde trazer (o servidor respondeu {}).", r.estado)));
    }
    if r.corpo.len() > MAX_BYTES {
        marcar_falha(&st.pool, i.artigo_id, &capa, "grande demais").await;
        return Err(AppError::msg("A capa é grande demais (mais de 8 MB)."));
    }
    let Some(tipo) = tipo_da_imagem(&r.corpo) else {
        marcar_falha(&st.pool, i.artigo_id, &capa, "não é uma imagem").await;
        return Err(AppError::msg("O que veio do endereço da capa não é uma imagem."));
    };
    Ok(json!({ "dados": format!("data:{tipo};base64,{}", base64::engine::general_purpose::STANDARD.encode(&r.corpo)) }))
}

#[derive(Deserialize)]
pub struct FalhouIn {
    artigo_id: i64,
    erro: String,
}

/// O ecrã não conseguiu reduzir ou guardar a capa: fica registado, e só se tenta outra vez com outro endereço.
pub async fn falhou(st: &AppState, i: FalhouIn) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    if let Some(capa) = capa_do_artigo(&st.pool, i.artigo_id).await? {
        marcar_falha(&st.pool, i.artigo_id, &capa, &i.erro).await;
    }
    Ok(json!({ "ok": true }))
}

// ─── O sentido contrário: as fotografias dos artigos para os produtos do site sem capa (migração 0074) ───

/// A chave em `config` que desliga o envio neste computador ("0"). Por omissão está ligado.
pub const CHAVE_ENVIAR: &str = "sinc.fotos_para_o_site";
/// A maior fotografia que segue (a data URL): o pedido da volta tem 1 MB no site e vai cifrado.
pub const MAX_DATA_URL: i64 = 600_000;
/// O pedido inteiro da volta, já com a fotografia e antes de cifrar, não passa disto; senão a fotografia espera.
pub const MAX_PEDIDO: usize = 700_000;

/// Uma fotografia a caminho do site: o artigo, a versão (`artigo_fotos.alterado_em`) e o item do pedido.
pub struct ParaOSite {
    pub artigo_id: i64,
    pub versao: String,
    pub item: Value,
}

async fn envio_ligado(pool: &SqlitePool) -> bool {
    let v: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(CHAVE_ENVIAR).fetch_optional(pool).await.ok().flatten();
    v.as_deref() != Some("0")
}

/// As fotografias que podem ir para o site: um artigo activo, com referência e com fotografia que caiba, cujo produto do
/// site (na cópia da Loja online) não tem capa, e cuja fotografia ainda não foi com esta versão (os erros e as recusas
/// voltam quando passar o tempo de espera).
const CANDIDATAS: &str = "FROM artigo_fotos f JOIN artigos a ON a.id = f.artigo_id
     WHERE TRIM(COALESCE(a.referencia, '')) <> '' AND a.ativo = 1 AND LENGTH(f.imagem) <= ?
       AND EXISTS (SELECT 1 FROM loja_produtos p WHERE TRIM(p.referencia) = TRIM(a.referencia)
                    AND TRIM(COALESCE(json_extract(p.dados, '$.capa'), '')) = '')
       AND NOT EXISTS (SELECT 1 FROM capas_enviadas c WHERE c.artigo_id = f.artigo_id AND c.versao = f.alterado_em
                        AND (c.estado NOT IN ('erro', 'recusada') OR c.proximo_em > ?))";

/// A fotografia seguinte para o site, uma por volta (sinc/mod.rs junta-a ao pedido, se couber). Desligado neste
/// computador, nenhuma.
pub async fn para_o_site(pool: &SqlitePool, agora: i64) -> AppResult<Option<ParaOSite>> {
    if !envio_ligado(pool).await {
        return Ok(None);
    }
    let linha: Option<(i64, String, String, String)> =
        sqlx::query_as(&format!("SELECT f.artigo_id, TRIM(a.referencia), f.imagem, f.alterado_em {CANDIDATAS} ORDER BY f.artigo_id LIMIT 1"))
            .bind(MAX_DATA_URL)
            .bind(agora)
            .fetch_optional(pool)
            .await?;
    Ok(linha.map(|(artigo_id, referencia, imagem, versao)| ParaOSite {
        artigo_id,
        item: json!({ "artigo_id": artigo_id, "referencia": referencia, "versao": versao, "imagem": imagem }),
        versao,
    }))
}

/// O que o site respondeu à fotografia da volta. Sem resposta para ela (um site antigo), conta como erro e espera.
pub async fn concluir_envio(pool: &SqlitePool, enviada: &ParaOSite, resposta: &Value, agora: i64) -> AppResult<()> {
    let r = resposta.as_array().and_then(|l| l.iter().find(|x| x["artigo_id"].as_i64() == Some(enviada.artigo_id)));
    let (estado, erro) = match r {
        Some(x) => (x["estado"].as_str().unwrap_or("erro"), x["erro"].as_str().unwrap_or("")),
        None => ("erro", "O site não respondeu à fotografia."),
    };
    let estado = match estado {
        "posta" | "tem_capa" | "sem_produto" | "recusada" => estado,
        _ => "erro",
    };
    let antes: i64 = sqlx::query_scalar("SELECT tentativas FROM capas_enviadas WHERE artigo_id = ? AND versao = ?")
        .bind(enviada.artigo_id)
        .bind(&enviada.versao)
        .fetch_optional(pool)
        .await?
        .unwrap_or(0);
    let proximo = match estado {
        "erro" => super::proxima_tentativa(antes, agora),
        "recusada" => agora + 24 * 3600,
        _ => 0,
    };
    sqlx::query(
        "INSERT INTO capas_enviadas (artigo_id, versao, estado, erro, tentativas, proximo_em, em) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(artigo_id) DO UPDATE SET versao = excluded.versao, estado = excluded.estado, erro = excluded.erro,
           tentativas = excluded.tentativas, proximo_em = excluded.proximo_em, em = excluded.em",
    )
    .bind(enviada.artigo_id)
    .bind(&enviada.versao)
    .bind(estado)
    .bind(erro.chars().take(300).collect::<String>())
    .bind(antes + 1)
    .bind(proximo)
    .bind(db::agora())
    .execute(pool)
    .await?;
    Ok(())
}

/// O estado do envio para o ecrã (o cartão da Loja online): se está ligado, quantas esperam, e o que o site respondeu.
pub async fn envio(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let pool = &st.pool;
    let agora = super::agora_s();
    let por_enviar: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) {CANDIDATAS}")).bind(MAX_DATA_URL).bind(agora).fetch_one(pool).await?;
    let contar = |estado: &'static str| async move {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM capas_enviadas WHERE estado = ?").bind(estado).fetch_one(pool).await
    };
    let erro: Option<String> =
        sqlx::query_scalar("SELECT erro FROM capas_enviadas WHERE estado IN ('erro', 'recusada') AND erro <> '' ORDER BY em DESC LIMIT 1")
            .fetch_optional(pool)
            .await?;
    Ok(json!({
        "ligado": envio_ligado(pool).await,
        "por_enviar": por_enviar,
        "postas": contar("posta").await?,
        "recusadas": contar("recusada").await? + contar("erro").await?,
        "ultimo_erro": erro,
    }))
}

#[derive(Deserialize)]
pub struct LigarIn {
    ligado: bool,
}

/// Liga ou desliga o envio das fotografias para o site neste computador (o automático, com a opção manual ao lado).
pub async fn envio_ligar(st: &AppState, i: LigarIn) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(CHAVE_ENVIAR)
        .bind(if i.ligado { "1" } else { "0" })
        .execute(&st.pool)
        .await?;
    envio(st).await
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_endereco_da_capa() {
        assert_eq!(endereco_da_capa(" https://x.supabase.co/storage/v1/object/public/media/stock_books/1/c.jpg ").as_deref(), Some("https://x.supabase.co/storage/v1/object/public/media/stock_books/1/c.jpg"));
        assert_eq!(endereco_da_capa("https://drive.google.com/file/d/AbC_12-x/view?usp=sharing").as_deref(), Some("https://drive.google.com/uc?export=download&id=AbC_12-x"));
        assert_eq!(endereco_da_capa("https://drive.google.com/open?id=Zz9").as_deref(), Some("https://drive.google.com/uc?export=download&id=Zz9"));
        assert_eq!(endereco_da_capa("capa.jpg"), None);
        assert_eq!(endereco_da_capa("javascript:alert(1)"), None);
        assert_eq!(endereco_da_capa("https://drive.google.com/file/d/<script>/view"), None);
    }

    #[test]
    fn so_de_origens_conhecidas() {
        let p = vec!["bggqkjjqbjhbjsckzopj.supabase.co".to_string(), "livrariaadventista.ao".to_string(), "127.0.0.1:9".to_string()];
        assert!(origem_permitida("https://bggqkjjqbjhbjsckzopj.supabase.co/storage/v1/object/public/media/x.jpg", &p));
        assert!(origem_permitida("https://drive.google.com/uc?export=download&id=1", &p));
        assert!(origem_permitida("https://lh3.googleusercontent.com/abc", &p));
        assert!(origem_permitida("http://127.0.0.1:9/media/x.png", &p), "um ensaio local, só se for da ligação");
        assert!(!origem_permitida("http://drive.google.com/uc?id=1", &p), "o Drive só por HTTPS");
        assert!(!origem_permitida("https://outro.exemplo.com/x.jpg", &p));
        assert!(!origem_permitida("https://drive.google.com.mau.com/x", &p));
        assert!(!origem_permitida("http://192.168.1.1/admin", &p));
    }

    #[test]
    fn o_tipo_pela_assinatura() {
        assert_eq!(tipo_da_imagem(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(tipo_da_imagem(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(tipo_da_imagem(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(tipo_da_imagem(b"<html>"), None);
    }
}
