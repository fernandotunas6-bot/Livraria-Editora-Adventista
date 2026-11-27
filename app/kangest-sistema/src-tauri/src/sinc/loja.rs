// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A Loja online no KanGest (Livraria → Loja online; docs/LOJA-ONLINE.md): a cópia local das encomendas desta loja e
//! do catálogo do site, que chega com cada sincronização (`kangest_novidades` no site). Lê-se também sem Internet.
//!
//! Aqui só se lê a cópia. As alterações vão com a sessão do site de cada pessoa, com as regras do painel: as das
//! encomendas em pessoa.rs, as dos produtos e das colecções em produtos.rs.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_ENCOMENDAS: i64 = 200;
const MAX_PRODUTOS: i64 = 300;

fn texto(v: &Value, k: &str) -> String {
    match &v[k] {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        outro => outro.to_string(),
    }
}

fn numero(v: &Value, k: &str) -> f64 {
    v[k].as_f64().or_else(|| v[k].as_str().and_then(|s| s.trim().parse().ok())).unwrap_or(0.0)
}

/// Aplica as novidades de uma sincronização: as encomendas e os produtos novos ou alterados, e os cursores, tudo numa
/// transacção. Devolve quantas encomendas e quantos produtos mudaram.
pub async fn aplicar(pool: &SqlitePool, novidades: &Value) -> AppResult<(usize, usize)> {
    if !novidades.is_object() {
        return Ok((0, 0));
    }
    let mut tx = pool.begin().await?;
    let mut encomendas = 0;
    for e in novidades["encomendas"].as_array().into_iter().flatten() {
        let Some(id) = e["id"].as_str() else { continue };
        sqlx::query(
            "INSERT INTO loja_encomendas (id, numero, criada_em, actualizada_em, estado, pagamento, entrega, total, levantamento, cliente, telefone, dados)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET numero = excluded.numero, criada_em = excluded.criada_em, actualizada_em = excluded.actualizada_em,
               estado = excluded.estado, pagamento = excluded.pagamento, entrega = excluded.entrega, total = excluded.total,
               levantamento = excluded.levantamento, cliente = excluded.cliente, telefone = excluded.telefone, dados = excluded.dados",
        )
        .bind(id)
        .bind(texto(e, "numero"))
        .bind(texto(e, "criada_em"))
        .bind(texto(e, "actualizada_em"))
        .bind(texto(e, "estado"))
        .bind(texto(e, "pagamento"))
        .bind(texto(e, "entrega"))
        .bind(numero(e, "total"))
        .bind(e["levantamento"].as_bool().unwrap_or(false))
        .bind(texto(e, "cliente"))
        .bind(texto(e, "telefone"))
        .bind(e.to_string())
        .execute(&mut *tx)
        .await?;
        encomendas += 1;
    }
    let mut produtos = 0;
    for p in novidades["produtos"].as_array().into_iter().flatten() {
        let Some(id) = p["id"].as_str() else { continue };
        sqlx::query(
            "INSERT INTO loja_produtos (id, titulo, referencia, isbn, preco, stock, activo, actualizado_em, dados)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET titulo = excluded.titulo, referencia = excluded.referencia, isbn = excluded.isbn,
               preco = excluded.preco, stock = excluded.stock, activo = excluded.activo, actualizado_em = excluded.actualizado_em,
               dados = excluded.dados",
        )
        .bind(id)
        .bind(texto(p, "titulo"))
        .bind(texto(p, "referencia"))
        .bind(texto(p, "isbn"))
        .bind(numero(p, "preco"))
        .bind(numero(p, "stock"))
        .bind(p["activo"].as_bool().unwrap_or(true))
        .bind(texto(p, "actualizado_em"))
        .bind(p.to_string())
        .execute(&mut *tx)
        .await?;
        produtos += 1;
    }
    // as igrejas do registo da Igreja (o cliente criado a partir de uma fica ligado: entidade_id não se toca)
    for g in novidades["igrejas"].as_array().into_iter().flatten() {
        let Some(id) = g["id"].as_str() else { continue };
        sqlx::query(
            "INSERT INTO loja_igrejas (id, cn, nome, tipo, distrito, campo, provincia, municipio, morada, delegado, activa, actualizada_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET cn = excluded.cn, nome = excluded.nome, tipo = excluded.tipo, distrito = excluded.distrito,
               campo = excluded.campo, provincia = excluded.provincia, municipio = excluded.municipio, morada = excluded.morada,
               delegado = excluded.delegado, activa = excluded.activa, actualizada_em = excluded.actualizada_em",
        )
        .bind(id)
        .bind(texto(g, "cn"))
        .bind(texto(g, "nome"))
        .bind(texto(g, "tipo"))
        .bind(texto(g, "distrito"))
        .bind(texto(g, "campo"))
        .bind(texto(g, "provincia"))
        .bind(texto(g, "municipio"))
        .bind(texto(g, "morada"))
        .bind(texto(g, "delegado"))
        .bind(g["activa"].as_bool().unwrap_or(true))
        .bind(texto(g, "actualizada_em"))
        .execute(&mut *tx)
        .await?;
    }
    for nome in ["encomendas", "produtos", "igrejas"] {
        let cursor = &novidades["cursores"][nome];
        if cursor.is_object() {
            sqlx::query("INSERT INTO sinc_cursores (nome, valor) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor")
                .bind(nome)
                .bind(cursor.to_string())
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok((encomendas, produtos))
}

/// As encomendas das novidades que a cópia ainda não tinha («número · cliente»), para o aviso de encomenda nova.
pub async fn encomendas_novas(pool: &SqlitePool, novidades: &Value) -> AppResult<Vec<(String, String)>> {
    let mut novas = Vec::new();
    for e in novidades["encomendas"].as_array().into_iter().flatten() {
        let Some(id) = e["id"].as_str() else { continue };
        let existe: Option<i64> = sqlx::query_scalar("SELECT 1 FROM loja_encomendas WHERE id = ?").bind(id).fetch_optional(pool).await?;
        if existe.is_none() && e["estado"].as_str() != Some("cancelled") {
            novas.push((texto(e, "numero"), texto(e, "cliente")));
        }
    }
    Ok(novas)
}

/// Os cursores para o próximo pedido: `{"encomendas": {...}, "produtos": {...}}` (vazios na primeira vez).
pub async fn ler_cursores(pool: &SqlitePool) -> AppResult<Value> {
    let linhas: Vec<(String, String)> = sqlx::query_as("SELECT nome, valor FROM sinc_cursores").fetch_all(pool).await?;
    let mut c = json!({ "encomendas": {}, "produtos": {}, "igrejas": {} });
    for (nome, valor) in linhas {
        c[nome] = serde_json::from_str(&valor).unwrap_or(json!({}));
    }
    Ok(c)
}

/// Apaga a cópia (ao desligar, ou ao ligar a outro posto: os dados eram de outra loja).
pub async fn apagar(pool: &SqlitePool) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for t in ["loja_encomendas", "loja_produtos", "loja_igrejas", "sinc_cursores"] {
        sqlx::query(&format!("DELETE FROM {t}")).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Quem trabalha com a loja online: a API e Integrações, os relatórios ou quem factura ao balcão.
pub(crate) fn permitir(st: &AppState) -> AppResult<()> {
    let s = st.sessao()?;
    if ["sistema.api", "relatorios.ver", "vendas.fatura_recibo"].iter().any(|p| s.tem(p)) {
        Ok(())
    } else {
        Err(AppError::SemPermissao)
    }
}

#[derive(Deserialize, Default)]
struct Filtro {
    #[serde(default)]
    q: String,
    #[serde(default)]
    filtro: String,
}

#[derive(Deserialize)]
struct Id {
    id: String,
}

/// As condições de cada filtro (fixas, nunca vêm do ecrã como texto).
fn onde_encomendas(filtro: &str) -> &'static str {
    match filtro {
        "por_confirmar" => "estado = 'pending'",
        "em_curso" => "estado IN ('confirmed', 'shipped')",
        "levantamentos" => "levantamento = 1 AND estado NOT IN ('delivered', 'cancelled')",
        "concluidas" => "estado = 'delivered'",
        "canceladas" => "estado = 'cancelled'",
        _ => "1 = 1",
    }
}

fn onde_produtos(filtro: &str) -> &'static str {
    match filtro {
        "a_venda" => "p.activo = 1",
        "ocultos" => "p.activo = 0",
        "sem_stock" => "p.activo = 1 AND p.stock <= 0",
        "sem_referencia" => "p.referencia = ''",
        "nao_na_loja" => "p.referencia <> '' AND a.id IS NULL",
        _ => "1 = 1",
    }
}

async fn estado(st: &AppState) -> AppResult<Value> {
    permitir(st)?;
    let ligacao = sqlx::query("SELECT site_url, posto_nome, loja, ultima_sinc, ultimo_erro FROM sinc_ligacao WHERE id = 1")
        .fetch_optional(&st.pool)
        .await?
        .map(|r| db::row_json(&r));
    let e: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(estado = 'pending'), 0), COALESCE(SUM(estado IN ('confirmed', 'shipped')), 0),
                COALESCE(SUM(levantamento = 1 AND estado NOT IN ('delivered', 'cancelled')), 0),
                COALESCE(SUM(estado = 'delivered'), 0), COALESCE(SUM(estado = 'cancelled'), 0)
           FROM loja_encomendas",
    )
    .fetch_one(&st.pool)
    .await?;
    let p: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(activo = 1), 0), COALESCE(SUM(activo = 0), 0), COALESCE(SUM(referencia = ''), 0) FROM loja_produtos",
    )
    .fetch_one(&st.pool)
    .await?;
    Ok(json!({
        "ligada": ligacao.is_some(),
        "ligacao": ligacao,
        "encomendas": { "total": e.0, "por_confirmar": e.1, "em_curso": e.2, "levantamentos": e.3, "concluidas": e.4, "canceladas": e.5 },
        "produtos": { "total": p.0, "a_venda": p.1, "ocultos": p.2, "sem_referencia": p.3 },
    }))
}

async fn encomendas(st: &AppState, f: Filtro) -> AppResult<Value> {
    permitir(st)?;
    let q = f.q.trim().to_string();
    let sql = format!(
        "SELECT id, numero, criada_em, estado, pagamento, entrega, total, levantamento, cliente, telefone,
                COALESCE(json_array_length(json_extract(dados, '$.itens')), 0) AS artigos
           FROM loja_encomendas
          WHERE ({}) AND (?1 = '' OR numero LIKE ?2 OR cliente LIKE ?2 OR telefone LIKE ?2)
          ORDER BY criada_em DESC, numero DESC LIMIT {MAX_ENCOMENDAS}",
        onde_encomendas(&f.filtro)
    );
    let linhas = sqlx::query(&sql).bind(&q).bind(format!("%{q}%")).fetch_all(&st.pool).await?;
    Ok(Value::Array(linhas.iter().map(db::row_json).collect()))
}

async fn encomenda(st: &AppState, i: Id) -> AppResult<Value> {
    permitir(st)?;
    let dados: Option<String> = sqlx::query_scalar("SELECT dados FROM loja_encomendas WHERE id = ?").bind(&i.id).fetch_optional(&st.pool).await?;
    let dados = dados.ok_or(AppError::NaoEncontrado)?;
    Ok(serde_json::from_str(&dados).unwrap_or(Value::Null))
}

async fn produtos(st: &AppState, f: Filtro) -> AppResult<Value> {
    permitir(st)?;
    let q = f.q.trim().to_string();
    // o stock que esta loja tem do mesmo artigo (pela referência do KanGest), para comparar com o que o site mostra
    let sql = format!(
        "SELECT p.id, p.titulo, p.referencia, p.isbn, p.preco, p.stock, p.activo, a.id AS artigo_id,
                (SELECT COALESCE(SUM(s.quantidade), 0) FROM stock s WHERE s.artigo_id = a.id) AS stock_loja
           FROM loja_produtos p LEFT JOIN artigos a ON p.referencia <> '' AND a.referencia = p.referencia
          WHERE ({}) AND (?1 = '' OR p.titulo LIKE ?2 OR p.referencia LIKE ?2 OR p.isbn LIKE ?2)
          ORDER BY p.titulo COLLATE NOCASE LIMIT {MAX_PRODUTOS}",
        onde_produtos(&f.filtro)
    );
    let linhas = sqlx::query(&sql).bind(&q).bind(format!("%{q}%")).fetch_all(&st.pool).await?;
    Ok(Value::Array(linhas.iter().map(db::row_json).collect()))
}

/// Os clientes que encomendaram nesta loja pelo site, da cópia local das encomendas (sem Internet e só os desta loja):
/// quantas encomendas, quantas em aberto, o total (sem as canceladas) e a última. A mesma pessoa pelo nome e o telefone.
async fn clientes(st: &AppState, f: Filtro) -> AppResult<Value> {
    permitir(st)?;
    let q = f.q.trim().to_string();
    let linhas = sqlx::query(
        "SELECT MAX(cliente) AS cliente, telefone, COUNT(*) AS encomendas,
                COALESCE(SUM(estado NOT IN ('delivered', 'cancelled')), 0) AS em_aberto,
                COALESCE(SUM(CASE WHEN estado <> 'cancelled' THEN total ELSE 0 END), 0) AS total,
                MAX(criada_em) AS ultima
           FROM loja_encomendas
          WHERE TRIM(cliente) <> '' AND (?1 = '' OR cliente LIKE ?2 OR telefone LIKE ?2)
          GROUP BY LOWER(TRIM(cliente)), telefone
          ORDER BY ultima DESC LIMIT 500",
    )
    .bind(&q)
    .bind(format!("%{q}%"))
    .fetch_all(&st.pool)
    .await?;
    Ok(Value::Array(linhas.iter().map(db::row_json).collect()))
}

/// As igrejas do registo da Igreja (a cópia local), com o cliente do KanGest ligado a cada uma. `filtro`: «activas»
/// (por omissão), «todas» ou «sem_cliente».
async fn igrejas(st: &AppState, f: Filtro) -> AppResult<Value> {
    permitir(st)?;
    let q = f.q.trim().to_string();
    let onde = match f.filtro.as_str() {
        "todas" => "1 = 1",
        "sem_cliente" => "g.activa = 1 AND g.entidade_id IS NULL",
        _ => "g.activa = 1",
    };
    let sql = format!(
        "SELECT g.id, g.cn, g.nome, g.tipo, g.distrito, g.campo, g.provincia, g.municipio, g.morada, g.delegado, g.activa,
                g.entidade_id, e.nome AS cliente
           FROM loja_igrejas g LEFT JOIN entidades e ON e.id = g.entidade_id
          WHERE ({onde}) AND (?1 = '' OR g.nome LIKE ?2 OR g.cn LIKE ?2 OR g.distrito LIKE ?2 OR g.municipio LIKE ?2)
          ORDER BY g.nome COLLATE NOCASE LIMIT 500"
    );
    let linhas = sqlx::query(&sql).bind(&q).bind(format!("%{q}%")).fetch_all(&st.pool).await?;
    Ok(Value::Array(linhas.iter().map(db::row_json).collect()))
}

#[derive(Deserialize)]
struct IgrejaLigarIn {
    id: String,
    entidade_id: Option<i64>,
}

/// Liga (ou desliga, sem `entidade_id`) uma igreja a um cliente do KanGest: o que «Criar cliente» faz depois de o gravar.
async fn igreja_ligar(st: &AppState, i: IgrejaLigarIn) -> AppResult<Value> {
    st.exigir_perm("clientes")?;
    permitir(st)?;
    if let Some(e) = i.entidade_id {
        let existe: Option<i64> = sqlx::query_scalar("SELECT id FROM entidades WHERE id = ?").bind(e).fetch_optional(&st.pool).await?;
        if existe.is_none() {
            return Err(AppError::msg("Esse cliente não existe."));
        }
    }
    let r = sqlx::query("UPDATE loja_igrejas SET entidade_id = ? WHERE id = ?").bind(i.entidade_id).bind(&i.id).execute(&st.pool).await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NaoEncontrado);
    }
    Ok(json!({ "ok": true }))
}

#[derive(Deserialize)]
struct PeriodoIn {
    de: String,
    ate: String,
}

/// Os pagamentos da loja online (o relatório do painel), com a conta do site da pessoa (pagamentos.rs).
async fn pagamentos(st: &AppState, i: PeriodoIn) -> AppResult<Value> {
    let s = st.sessao()?;
    permitir(st)?;
    super::pagamentos::relatorio(&st.pool, s.id, &i.de, &i.ate).await.map_err(AppError::msg)
}

/// Despachante dos métodos `loja.*` (services/mod.rs).
pub async fn despachar(st: &AppState, metodo: &str, params: Value) -> AppResult<Value> {
    // a conta do site de cada pessoa e as alterações às encomendas (pessoa.rs); sem Internet, a mensagem diz porquê
    if let Some(resto) = metodo.strip_prefix("conta.") {
        let r = super::pessoa::despachar(st, resto, params).await;
        return if resto == "entrar" { r } else { super::explicar_sem_internet(st, r) };
    }
    // o editor dos produtos e das colecções do site (produtos.rs)
    if metodo.starts_with("produto.") || metodo.starts_with("coleccao.") {
        let r = super::produtos::despachar(st, metodo, params).await;
        return super::explicar_sem_internet(st, r);
    }
    let filtro = || -> AppResult<Filtro> { if params.is_null() { Ok(Filtro::default()) } else { Ok(serde_json::from_value(params.clone())?) } };
    match metodo {
        "estado" => estado(st).await,
        // as capas dos livros do site como fotografias dos artigos (capas.rs)
        "capas.pendentes" => super::capas::pendentes(st).await,
        "capas.descarregar" => super::capas::descarregar(st, serde_json::from_value(params.clone())?).await,
        "capas.falhou" => super::capas::falhou(st, serde_json::from_value(params.clone())?).await,
        "capas.envio" => super::capas::envio(st).await,
        "capas.envio_ligar" => super::capas::envio_ligar(st, serde_json::from_value(params.clone())?).await,
        // os dados dos livros do site nas fichas dos artigos (fichas.rs)
        "fichas.estado" => super::fichas::estado(st).await,
        "fichas.completar" => super::fichas::completar_agora(st).await,
        "fichas.ligar" => super::fichas::ligar(st, serde_json::from_value(params.clone())?).await,
        "fichas.generos" => super::fichas::generos_estado(st).await,
        "fichas.ligar_genero" => super::fichas::ligar_genero(st, serde_json::from_value(params.clone())?).await,
        // as promoções dos artigos no site (promocoes.rs)
        "promocoes.estado" => super::promocoes::estado(st).await,
        "promocoes.ligar" => super::promocoes::ligar(st, serde_json::from_value(params.clone())?).await,
        "encomendas" => encomendas(st, filtro()?).await,
        "encomenda" => encomenda(st, serde_json::from_value(params.clone())?).await,
        "produtos" => produtos(st, filtro()?).await,
        "clientes" => clientes(st, filtro()?).await,
        "igrejas" => igrejas(st, filtro()?).await,
        "igrejaLigar" => igreja_ligar(st, serde_json::from_value(params.clone())?).await,
        "pagamentos" => super::explicar_sem_internet(st, pagamentos(st, serde_json::from_value(params.clone())?).await),
        _ => Err(AppError::msg(format!("Método desconhecido: loja.{metodo}"))),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn filtros_fixos_e_o_resto_e_tudo() {
        assert_eq!(onde_encomendas("por_confirmar"), "estado = 'pending'");
        assert_eq!(onde_encomendas("'; DROP TABLE loja_encomendas; --"), "1 = 1");
        assert_eq!(onde_produtos("nao_na_loja"), "p.referencia <> '' AND a.id IS NULL");
        assert_eq!(onde_produtos(""), "1 = 1");
    }

    #[test]
    fn texto_e_numero_do_json() {
        let v = json!({ "a": "x", "n": 12.5, "s": "7", "nada": null, "b": true });
        assert_eq!(texto(&v, "a"), "x");
        assert_eq!(texto(&v, "nada"), "");
        assert_eq!(texto(&v, "falta"), "");
        assert_eq!(texto(&v, "b"), "true");
        assert_eq!(numero(&v, "n"), 12.5);
        assert_eq!(numero(&v, "s"), 7.0);
        assert_eq!(numero(&v, "a"), 0.0);
    }
}
