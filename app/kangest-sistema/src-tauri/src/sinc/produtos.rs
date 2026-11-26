// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O editor dos produtos e das colecções do site, no KanGest (Livraria → Loja online; parte C do plano;
//! docs/LOJA-ONLINE.md, «Os produtos»).
//!
//! Faz-se tudo como no painel: criar, duplicar, editar, publicar ou ocultar e eliminar produtos, e criar e editar
//! colecções. Cada alteração vai com a sessão do site da própria pessoa (pessoa.rs), pelo PostgREST, e por isso com as
//! regras do painel: só passa com a permissão «Gerir Catálogo» no site. No KanGest, pede-se «artigos.editar».
//!
//! **O preço e o stock de um produto ligado a um artigo do KanGest ficam bloqueados:** vêm do KanGest, pela
//! sincronização do catálogo (catalogo.rs). O que o ecrã mandar para esses campos não segue (e a ligação também não
//! se desfaz por aqui, que seria uma forma de os soltar).
//!
//! Precisa de Internet (não há fila, como nas encomendas). Eliminar pede confirmação, e tudo fica na auditoria.

use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::SqlitePool;

use super::pessoa::{self, Auth, Erro};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// O que o KanGest pode mudar num produto (as colunas de `public.stock_books`).
pub const CAMPOS_PRODUTO: &[&str] = &[
    "title", "author", "genre", "description", "featured", "isbn", "book_code", "sku", "publisher", "language", "pages", "year",
    "collection_id", "marketing_hook", "cover_image", "active", "product_type", "digital", "video_url", "price", "sale_price",
    "sale_starts_at", "sale_ends_at", "stock", "kigest_ref",
];
/// Os que, num produto ligado a um artigo do KanGest, vêm do KanGest e não se mudam aqui.
pub const CAMPOS_DO_KANGEST: &[&str] = &["price", "sale_price", "sale_starts_at", "sale_ends_at", "stock", "kigest_ref"];
/// O que se pode mudar numa colecção (`public.book_collections`).
pub const CAMPOS_COLECCAO: &[&str] = &["title", "slug", "description", "cover_image", "sort_order", "active", "featured", "marketing_tagline"];

/// Só os campos conhecidos; num produto ligado, sem os do KanGest. Devolve também os que ficaram de fora por isso.
pub fn limpar(campos: &Value, conhecidos: &[&str], ligado: bool) -> (Map<String, Value>, Vec<String>) {
    let mut out = Map::new();
    let mut bloqueados = Vec::new();
    for (k, v) in campos.as_object().into_iter().flatten() {
        if !conhecidos.contains(&k.as_str()) {
            continue;
        }
        if ligado && CAMPOS_DO_KANGEST.contains(&k.as_str()) {
            bloqueados.push(k.clone());
            continue;
        }
        out.insert(k.clone(), v.clone());
    }
    (out, bloqueados)
}

/// O que não pode seguir: um título vazio, um preço ou um stock negativo.
pub fn validar(campos: &Map<String, Value>, novo: bool) -> Result<(), String> {
    match campos.get("title").and_then(Value::as_str).map(str::trim) {
        Some(t) if t.chars().count() < 2 || t.chars().count() > 200 => return Err("O título tem de 2 a 200 letras.".into()),
        None if novo => return Err("Escreva o título.".into()),
        _ => {}
    }
    for k in ["price", "sale_price", "stock", "pages", "year"] {
        if let Some(v) = campos.get(k).filter(|v| !v.is_null()) {
            if v.as_f64().is_none_or(|n| n < 0.0 || !n.is_finite()) {
                return Err(format!("O campo «{k}» tem de ser um número igual ou maior que zero."));
            }
        }
    }
    Ok(())
}

/// A cópia de um produto: os mesmos textos, oculta, sem a ligação ao KanGest e sem stock (para não contar duas vezes).
pub fn copia(produto: &Value) -> Map<String, Value> {
    let (mut c, _) = limpar(produto, CAMPOS_PRODUTO, false);
    let titulo = produto["title"].as_str().unwrap_or("Produto");
    c.insert("title".into(), json!(format!("{titulo} (cópia)").chars().take(200).collect::<String>()));
    c.insert("active".into(), json!(false));
    c.insert("kigest_ref".into(), json!(""));
    c.insert("stock".into(), json!(0));
    c
}

/// O artigo do KanGest a que o produto está ligado (pela referência), se o há.
async fn artigo_ligado(pool: &SqlitePool, referencia: &str) -> AppResult<Option<i64>> {
    if referencia.trim().is_empty() {
        return Ok(None);
    }
    Ok(sqlx::query_scalar("SELECT id FROM artigos WHERE referencia = ?").bind(referencia.trim()).fetch_optional(pool).await?)
}

/// O artigo volta à fila do catálogo: o preço e o stock dele seguem para o site na sincronização seguinte.
async fn reenviar_artigo(pool: &SqlitePool, artigo: i64) -> AppResult<()> {
    for tipo in ["artigo", "stock"] {
        sqlx::query("INSERT INTO sinc_catalogo (artigo_id, tipo) VALUES (?, ?) ON CONFLICT (artigo_id, tipo) DO NOTHING").bind(artigo).bind(tipo).execute(pool).await?;
    }
    Ok(())
}

fn permitir(st: &AppState) -> AppResult<i64> {
    let s = st.exigir_perm("artigos.editar")?;
    Ok(s.id)
}

/// Um pedido ao PostgREST com a sessão da pessoa. Sem sessão do site, ou sem Internet, diz o que fazer.
async fn rest(pool: &SqlitePool, utilizador: i64, metodo: &'static str, caminho: &str, corpo: Option<Value>) -> AppResult<Value> {
    let a: Auth = pessoa::auth(pool).await?;
    let token = pessoa::token_valido(pool, &a, utilizador).await.map_err(|e| AppError::msg(e.texto()))?;
    let mut cab = pessoa::cabecalhos(&a.apikey, Some(&token));
    cab.push(("Prefer", "return=representation".into()));
    let (estado, v) = pessoa::pedido(metodo, format!("{}/rest/v1/{caminho}", a.url), cab, corpo).await.map_err(|e| match e {
        Erro::SemLigacao(_) => AppError::msg("Sem ligação ao site: os produtos e as colecções mudam-se com Internet."),
        e => AppError::msg(e.texto()),
    })?;
    match estado {
        200..=299 => Ok(v),
        401 => {
            pessoa::apagar_sessao(pool, utilizador).await?;
            Err(AppError::msg("A sessão do site não vale: entre outra vez (Livraria → Loja online)."))
        }
        403 => Err(AppError::msg("O site não deixou: a sua conta do site não tem «Gerir Catálogo».")),
        _ => Err(AppError::msg(pessoa::mensagem(&v, estado))),
    }
}

/// A primeira linha de uma resposta do PostgREST (com «return=representation»); vazia quando a RLS não deixou.
fn primeira(v: Value) -> AppResult<Value> {
    v.as_array()
        .and_then(|l| l.first().cloned())
        .ok_or_else(|| AppError::msg("O site não deixou: a sua conta do site não tem «Gerir Catálogo» (ou o produto já não existe)."))
}

async fn auditar(pool: &SqlitePool, utilizador: i64, detalhe: String) -> AppResult<()> {
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'LOJA_PRODUTO', ?)").bind(utilizador).bind(detalhe).execute(pool).await?;
    Ok(())
}

fn id_de(id: &str) -> AppResult<&str> {
    if pessoa::id_valido(id) {
        Ok(id)
    } else {
        Err(AppError::msg("Produto desconhecido."))
    }
}

#[derive(Deserialize)]
struct IdIn {
    id: String,
}

#[derive(Deserialize)]
struct GuardarIn {
    #[serde(default)]
    id: Option<String>,
    campos: Value,
}

#[derive(Deserialize)]
struct PublicarIn {
    id: String,
    activo: bool,
}

#[derive(Deserialize)]
struct EliminarIn {
    id: String,
    /// O ecrã pede confirmação; sem ela, não se elimina.
    #[serde(default)]
    confirmar: bool,
}

/// O produto como está no site agora, e se está ligado a um artigo do KanGest (o preço e o stock bloqueados).
async fn obter(st: &AppState, i: IdIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let id = id_de(&i.id)?;
    let p = primeira(rest(&st.pool, u, "GET", &format!("stock_books?id=eq.{id}&select=*"), None).await?)?;
    let artigo = artigo_ligado(&st.pool, p["kigest_ref"].as_str().unwrap_or("")).await?;
    Ok(json!({ "produto": p, "ligado": artigo.is_some(), "artigo_id": artigo, "bloqueados": CAMPOS_DO_KANGEST }))
}

/// Cria ou altera um produto. Num produto ligado, o preço e o stock não seguem: vêm do KanGest.
async fn guardar(st: &AppState, i: GuardarIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let (ligado_antes, titulo_antes) = match &i.id {
        Some(id) => {
            let p = primeira(rest(&st.pool, u, "GET", &format!("stock_books?id=eq.{}&select=kigest_ref,title", id_de(id)?), None).await?)?;
            (artigo_ligado(&st.pool, p["kigest_ref"].as_str().unwrap_or("")).await?, p["title"].as_str().unwrap_or("").to_string())
        }
        None => (None, String::new()),
    };
    // um produto novo (ou ainda sem ligação) que se liga a um artigo daqui: o preço e o stock vêm do artigo
    let liga_a = match ligado_antes {
        Some(_) => None,
        None => artigo_ligado(&st.pool, i.campos["kigest_ref"].as_str().unwrap_or("")).await?,
    };
    let (mut campos, bloqueados) = limpar(&i.campos, CAMPOS_PRODUTO, ligado_antes.is_some());
    if liga_a.is_some() {
        for k in CAMPOS_DO_KANGEST.iter().filter(|k| **k != "kigest_ref") {
            campos.remove(*k);
        }
    }
    validar(&campos, i.id.is_none()).map_err(AppError::msg)?;
    let produto = match &i.id {
        Some(id) => {
            if campos.is_empty() {
                return Err(AppError::msg("Não há nada para mudar."));
            }
            primeira(rest(&st.pool, u, "PATCH", &format!("stock_books?id=eq.{}", id_de(id)?), Some(Value::Object(campos))).await?)?
        }
        None => {
            // do KanGest, um produto novo entra oculto, salvo se se pedir o contrário (no site, o padrão é visível)
            campos.entry("active").or_insert(json!(false));
            primeira(rest(&st.pool, u, "POST", "stock_books", Some(Value::Object(campos))).await?)?
        }
    };
    if let Some(a) = liga_a {
        reenviar_artigo(&st.pool, a).await?;
    }
    let titulo = produto["title"].as_str().unwrap_or(&titulo_antes).to_string();
    auditar(&st.pool, u, format!("{} o produto «{titulo}» ({}) no site", if i.id.is_some() { "alterou" } else { "criou" }, produto["id"].as_str().unwrap_or(""))).await?;
    Ok(json!({ "produto": produto, "bloqueados": bloqueados, "ligado": ligado_antes.or(liga_a).is_some() }))
}

/// Duplica um produto: a cópia fica oculta, sem a ligação ao KanGest e sem stock.
async fn duplicar(st: &AppState, i: IdIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let p = primeira(rest(&st.pool, u, "GET", &format!("stock_books?id=eq.{}&select=*", id_de(&i.id)?), None).await?)?;
    let nova = primeira(rest(&st.pool, u, "POST", "stock_books", Some(Value::Object(copia(&p)))).await?)?;
    auditar(&st.pool, u, format!("duplicou o produto «{}» ({}) no site: {}", p["title"].as_str().unwrap_or(""), i.id, nova["id"].as_str().unwrap_or(""))).await?;
    Ok(json!({ "produto": nova }))
}

async fn publicar(st: &AppState, i: PublicarIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let p = primeira(rest(&st.pool, u, "PATCH", &format!("stock_books?id=eq.{}", id_de(&i.id)?), Some(json!({ "active": i.activo }))).await?)?;
    auditar(&st.pool, u, format!("{} o produto «{}» ({}) no site", if i.activo { "publicou" } else { "ocultou" }, p["title"].as_str().unwrap_or(""), i.id)).await?;
    Ok(json!({ "produto": p }))
}

/// Elimina um produto do site. Pede confirmação e fica na auditoria (com o título).
async fn eliminar(st: &AppState, i: EliminarIn) -> AppResult<Value> {
    let u = permitir(st)?;
    if !i.confirmar {
        return Err(AppError::msg("Confirme que quer eliminar o produto do site."));
    }
    let id = id_de(&i.id)?;
    let p = primeira(rest(&st.pool, u, "DELETE", &format!("stock_books?id=eq.{id}"), None).await?)?;
    sqlx::query("DELETE FROM loja_produtos WHERE id = ?").bind(id).execute(&st.pool).await?;
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'LOJA_PRODUTO_ELIMINADO', ?)")
        .bind(u)
        .bind(format!("eliminou o produto «{}» ({id}) do site", p["title"].as_str().unwrap_or("")))
        .execute(&st.pool)
        .await?;
    Ok(json!({ "eliminado": id }))
}

async fn coleccoes(st: &AppState) -> AppResult<Value> {
    let u = permitir(st)?;
    rest(&st.pool, u, "GET", "book_collections?select=id,title,slug,description,cover_image,sort_order,active,featured,marketing_tagline&order=sort_order,title", None).await
}

async fn guardar_coleccao(st: &AppState, i: GuardarIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let (campos, _) = limpar(&i.campos, CAMPOS_COLECCAO, false);
    validar(&campos, i.id.is_none()).map_err(AppError::msg)?;
    let c = match &i.id {
        Some(id) => primeira(rest(&st.pool, u, "PATCH", &format!("book_collections?id=eq.{}", id_de(id)?), Some(Value::Object(campos))).await?)?,
        None => primeira(rest(&st.pool, u, "POST", "book_collections", Some(Value::Object(campos))).await?)?,
    };
    sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (?, 'LOJA_COLECCAO', ?)")
        .bind(u)
        .bind(format!("{} a colecção «{}» ({}) no site", if i.id.is_some() { "alterou" } else { "criou" }, c["title"].as_str().unwrap_or(""), c["id"].as_str().unwrap_or("")))
        .execute(&st.pool)
        .await?;
    Ok(json!({ "coleccao": c }))
}

// --- KANGEST ONE, fase D: o artigo do KanGest no site, a partir da ficha do artigo ---------------------------------

/// A referência para um filtro do PostgREST (`kigest_ref=eq.<ref>`): letras, algarismos e `-._~` passam; o resto vai
/// codificado.
pub fn ref_para_url(r: &str) -> String {
    r.trim()
        .bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

#[derive(Deserialize)]
struct ArtigoIn {
    artigo_id: i64,
}

#[derive(Deserialize)]
struct PublicarArtigoIn {
    artigo_id: i64,
    activo: bool,
}

/// O produto do site ligado ao artigo (pela referência): `None` se o artigo não tem referência ou não está no site.
async fn produto_do_artigo(st: &AppState, utilizador: i64, artigo_id: i64) -> AppResult<(String, Option<Value>)> {
    let referencia: Option<String> = sqlx::query_scalar("SELECT TRIM(COALESCE(referencia, '')) FROM artigos WHERE id = ?").bind(artigo_id).fetch_optional(&st.pool).await?;
    let Some(referencia) = referencia.filter(|r| !r.is_empty()) else { return Ok((String::new(), None)) };
    let l = rest(
        &st.pool,
        utilizador,
        "GET",
        &format!("stock_books?kigest_ref=eq.{}&select=id,title,active,price,sale_price,stock,cover_image,cover&order=id.asc&limit=1", ref_para_url(&referencia)),
        None,
    )
    .await?;
    Ok((referencia, l.as_array().and_then(|l| l.first().cloned())))
}

/// Para a ficha do artigo: está no site? Com que preço, e à vista ou oculto? Sem ligação ao site, `ligado: false`.
async fn do_artigo(st: &AppState, i: ArtigoIn) -> AppResult<Value> {
    let s = st.sessao()?;
    let ligado: bool = sqlx::query_scalar("SELECT COUNT(*) > 0 FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_one(&st.pool).await?;
    if !ligado {
        return Ok(json!({ "ligado": false }));
    }
    let (referencia, produto) = produto_do_artigo(st, s.id, i.artigo_id).await?;
    Ok(json!({ "ligado": true, "referencia": referencia, "produto": produto }))
}

/// Publica ou oculta no site o produto ligado ao artigo, com a conta do site da pessoa («Gerir Catálogo» lá, «artigos.editar»
/// cá). Nunca se publica a 0 Kz: o preço vem do posto que manda no catálogo, e tem de ter chegado ao site.
async fn publicar_artigo(st: &AppState, i: PublicarArtigoIn) -> AppResult<Value> {
    let u = permitir(st)?;
    let (referencia, produto) = produto_do_artigo(st, u, i.artigo_id).await?;
    if referencia.is_empty() {
        return Err(AppError::msg("Dê uma referência ao artigo: é por ela que o site o liga ao produto."));
    }
    let Some(p) = produto else {
        return Err(AppError::msg(
            "Este artigo ainda não está no site. O posto que manda no catálogo cria-o, oculto, na volta seguinte da sincronização; depois publique-o aqui.",
        ));
    };
    if i.activo && p["price"].as_f64().unwrap_or(0.0) <= 0.0 {
        return Err(AppError::msg(
            "O preço ainda não chegou ao site, e um produto não se publica a 0 Kz. O posto que manda no catálogo envia-o na volta seguinte.",
        ));
    }
    let id = p["id"].as_str().unwrap_or_default().to_string();
    let novo = primeira(rest(&st.pool, u, "PATCH", &format!("stock_books?id=eq.{}", id_de(&id)?), Some(json!({ "active": i.activo }))).await?)?;
    auditar(
        &st.pool,
        u,
        format!("{} no site o produto «{}» ({}) do artigo {}", if i.activo { "publicou" } else { "ocultou" }, p["title"].as_str().unwrap_or(""), id, referencia),
    )
    .await?;
    Ok(json!({ "produto": novo }))
}

/// Despachante dos métodos `loja.produto.*` e `loja.coleccao.*` (loja.rs).
pub async fn despachar(st: &AppState, metodo: &str, params: Value) -> AppResult<Value> {
    match metodo {
        "produto.obter" => obter(st, serde_json::from_value(params)?).await,
        "produto.guardar" => guardar(st, serde_json::from_value(params)?).await,
        "produto.duplicar" => duplicar(st, serde_json::from_value(params)?).await,
        "produto.publicar" => publicar(st, serde_json::from_value(params)?).await,
        "produto.doArtigo" => do_artigo(st, serde_json::from_value(params)?).await,
        "produto.publicarArtigo" => publicar_artigo(st, serde_json::from_value(params)?).await,
        "produto.eliminar" => eliminar(st, serde_json::from_value(params)?).await,
        "coleccao.listar" => coleccoes(st).await,
        "coleccao.guardar" => guardar_coleccao(st, serde_json::from_value(params)?).await,
        _ => Err(AppError::msg(format!("Método desconhecido: loja.{metodo}"))),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn num_produto_ligado_o_preco_e_o_stock_nao_seguem() {
        let campos = json!({ "title": "O Desejado", "price": 5700, "stock": 3, "sale_price": 5000, "kigest_ref": "OUTRO", "id": "x", "sales_count": 9 });
        let (livre, b) = limpar(&campos, CAMPOS_PRODUTO, false);
        assert_eq!(livre.len(), 5, "o id e os contadores nunca seguem: {livre:?}");
        assert!(b.is_empty());
        let (ligado, b) = limpar(&campos, CAMPOS_PRODUTO, true);
        assert_eq!(ligado.keys().collect::<Vec<_>>(), vec!["title"]);
        assert_eq!(b.len(), 4);
    }

    #[test]
    fn o_que_nao_pode_seguir() {
        let m = |v: Value| v.as_object().cloned().unwrap();
        assert!(validar(&m(json!({ "title": "O Desejado", "price": 10 })), true).is_ok());
        assert!(validar(&m(json!({ "price": 10 })), true).is_err(), "um produto novo precisa do título");
        assert!(validar(&m(json!({ "price": 10 })), false).is_ok());
        assert!(validar(&m(json!({ "title": "X" })), false).is_err());
        assert!(validar(&m(json!({ "title": "Livro", "price": -1 })), false).is_err());
        assert!(validar(&m(json!({ "title": "Livro", "stock": "muito" })), false).is_err());
        assert!(validar(&m(json!({ "title": "Livro", "sale_price": null })), false).is_ok());
    }

    #[test]
    fn a_referencia_no_filtro_do_site() {
        assert_eq!(ref_para_url(" LIV-001 "), "LIV-001");
        assert_eq!(ref_para_url("A B/1&x=2"), "A%20B%2F1%26x%3D2");
        assert_eq!(ref_para_url("Ação"), "A%C3%A7%C3%A3o");
    }

    #[test]
    fn a_copia_fica_oculta_sem_ligacao_e_sem_stock() {
        let c = copia(&json!({ "id": "p1", "title": "O Desejado", "price": 5700, "stock": 8, "kigest_ref": "LIV-001", "active": true, "views_count": 40 }));
        assert_eq!(c["title"], "O Desejado (cópia)");
        assert_eq!((c["active"].clone(), c["kigest_ref"].clone(), c["stock"].clone(), c["price"].clone()), (json!(false), json!(""), json!(0), json!(5700)));
        assert!(!c.contains_key("id") && !c.contains_key("views_count"));
    }
}
