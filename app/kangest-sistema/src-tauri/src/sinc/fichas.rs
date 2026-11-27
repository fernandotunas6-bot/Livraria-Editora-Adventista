// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! Os dados dos livros do site nas fichas dos artigos (KANGEST ONE, integração total; pedido do dono a 27/11).
//!
//! A cópia da Loja online (`loja_produtos`) traz, de cada livro do site, o autor, a editora, o idioma, o ano, as páginas
//! e o ISBN. Um artigo activo com a mesma referência que não os tenha recebe-os:
//! - **os dados do ramo** (`atributos`, os mesmos campos da ficha de uma livraria): o autor, a editora, o idioma, o ano
//!   e as páginas, só os que faltam (o ano e as páginas só quando o site tem mais do que 0);
//! - **o código de barras:** o ISBN do site (em ISBN-13), se o artigo não tiver nenhum, se o ISBN for válido e se nenhum
//!   outro artigo já o usar. Não volta ao site, que é de onde veio.
//!
//! Nunca se substitui o que está na ficha. O que veio fica em `fichas_do_site` (migração 0075), campo a campo: um campo
//! que já veio uma vez não volta, e se alguém o apagar à mão fica apagado. Cada vez que se completam fichas fica uma
//! linha na auditoria.
//!
//! Automático com opção manual: corre depois de cada volta da sincronização que traga produtos; na Loja online há o
//! cartão com «Completar agora» e o interruptor para o desligar neste computador (`sinc.dados_dos_livros` = "0").

use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::error::AppResult;
use crate::services::ramos;
use crate::state::AppState;

/// A chave na `config` deste computador: "0" desliga.
pub const CHAVE: &str = "sinc.dados_dos_livros";

/// Os dados do ramo que vêm do site (o mesmo nome na ficha e nas novidades): os de texto e os de número.
const TEXTOS: [&str; 3] = ["autor", "editora", "idioma"];
const NUMEROS: [&str; 2] = ["ano", "paginas"];
/// O campo de `fichas_do_site` para o código de barras.
pub const CODIGO_BARRAS: &str = "codigo_barras";
const MAX_TEXTO: usize = 300;

/// O que uma ficha recebe do site.
#[derive(Debug, Default, PartialEq)]
pub struct Falta {
    /// os dados do ramo, pela ordem da ficha
    pub dados: Vec<(String, Value)>,
    /// o ISBN-13 para o código de barras
    pub codigo_barras: Option<String>,
}

impl Falta {
    pub fn vazia(&self) -> bool {
        self.dados.is_empty() && self.codigo_barras.is_none()
    }
}

/// Um dado do ramo conta como vazio quando não está, é texto vazio ou é o número 0.
fn vazio(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Number(n)) => n.as_f64() == Some(0.0),
        _ => false,
    }
}

/// Um número do site (pode vir como número ou como texto), só se for maior do que 0.
fn numero_do_site(v: &Value) -> Option<i64> {
    let n = v.as_i64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))?;
    (n > 0).then_some(n)
}

/// O que falta a uma ficha, com o que o site tem do livro. `ja_veio`: os campos que já vieram uma vez (não voltam).
pub fn o_que_falta(atributos: &Map<String, Value>, codigo_barras: Option<&str>, site: &Value, ja_veio: &HashSet<String>) -> Falta {
    let mut f = Falta::default();
    for c in TEXTOS {
        if ja_veio.contains(c) || !vazio(atributos.get(c)) {
            continue;
        }
        let t = site[c].as_str().unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" ");
        if !t.is_empty() {
            f.dados.push((c.to_string(), Value::String(t.chars().take(MAX_TEXTO).collect())));
        }
    }
    for c in NUMEROS {
        if ja_veio.contains(c) || !vazio(atributos.get(c)) {
            continue;
        }
        if let Some(n) = numero_do_site(&site[c]) {
            f.dados.push((c.to_string(), json!(n)));
        }
    }
    let sem_codigo = codigo_barras.is_none_or(|c| c.trim().is_empty());
    if sem_codigo && !ja_veio.contains(CODIGO_BARRAS) {
        let isbn = site["isbn"].as_str().unwrap_or("");
        if ramos::parece_isbn(isbn) {
            f.codigo_barras = ramos::isbn13(isbn);
        }
    }
    f
}

/// Uma ficha a completar.
struct Plano {
    artigo_id: i64,
    atributos: Map<String, Value>,
    falta: Falta,
}

/// As fichas dos artigos activos com um livro do site pela referência, e o que falta a cada uma.
async fn planear(pool: &SqlitePool) -> AppResult<Vec<Plano>> {
    let pares: Vec<(i64, Option<String>, Option<String>, String)> = sqlx::query_as(
        "SELECT a.id, a.atributos, a.codigo_barras, MAX(p.dados)
           FROM artigos a JOIN loja_produtos p ON TRIM(p.referencia) = TRIM(a.referencia)
          WHERE TRIM(COALESCE(a.referencia, '')) <> '' AND a.ativo = 1
          GROUP BY a.id ORDER BY a.id",
    )
    .fetch_all(pool)
    .await?;
    // um código de barras que outro artigo já usa não serve (o leitor só encontraria um deles)
    let codigos: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT TRIM(codigo_barras) FROM artigos WHERE TRIM(COALESCE(codigo_barras, '')) <> ''").fetch_all(pool).await?.into_iter().collect();
    let mut vieram: HashMap<i64, HashSet<String>> = HashMap::new();
    for (a, c) in sqlx::query_as::<_, (i64, String)>("SELECT artigo_id, campo FROM fichas_do_site").fetch_all(pool).await? {
        vieram.entry(a).or_default().insert(c);
    }
    let nada = HashSet::new();
    let mut planos = Vec::new();
    for (artigo_id, atributos, codigo_barras, dados) in pares {
        let atributos = atributos
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        let site: Value = serde_json::from_str(&dados).unwrap_or(Value::Null);
        let mut falta = o_que_falta(&atributos, codigo_barras.as_deref(), &site, vieram.get(&artigo_id).unwrap_or(&nada));
        if falta.codigo_barras.as_ref().is_some_and(|c| codigos.contains(c)) {
            falta.codigo_barras = None;
        }
        if !falta.vazia() {
            planos.push(Plano { artigo_id, atributos, falta });
        }
    }
    Ok(planos)
}

/// O que se completou numa vez.
#[derive(Debug, Default, PartialEq)]
pub struct Completadas {
    pub fichas: i64,
    pub dados: i64,
    pub codigos: i64,
}

/// Completa as fichas que podem receber alguma coisa do site, numa só transacção.
pub async fn completar(pool: &SqlitePool) -> AppResult<Completadas> {
    let planos = planear(pool).await?;
    let mut feito = Completadas::default();
    if planos.is_empty() {
        return Ok(feito);
    }
    let em = db::agora();
    let mut tx = pool.begin().await?;
    for p in planos {
        let mut vieram: Vec<(String, String)> = Vec::new();
        if !p.falta.dados.is_empty() {
            let mut a = p.atributos;
            for (c, v) in &p.falta.dados {
                a.insert(c.clone(), v.clone());
            }
            // a mesma validação da ficha: uma ficha que já não passe nela fica como está
            match ramos::validar_atributos(&Value::Object(a)) {
                Ok(texto) => {
                    sqlx::query("UPDATE artigos SET atributos = ? WHERE id = ?").bind(texto).bind(p.artigo_id).execute(&mut *tx).await?;
                    for (c, v) in &p.falta.dados {
                        vieram.push((c.clone(), v.as_str().map_or_else(|| v.to_string(), str::to_string)));
                    }
                    feito.dados += p.falta.dados.len() as i64;
                }
                Err(e) => eprintln!("Dados dos livros do site: a ficha do artigo {} fica como está ({e}).", p.artigo_id),
            }
        }
        if let Some(isbn) = &p.falta.codigo_barras {
            let usado: Option<i64> =
                sqlx::query_scalar("SELECT id FROM artigos WHERE codigo_barras = ? AND id <> ? LIMIT 1").bind(isbn).bind(p.artigo_id).fetch_optional(&mut *tx).await?;
            if usado.is_none() {
                // o gatilho do catálogo (0057) marcaria o artigo para ir ao site: o ISBN veio de lá, não volta
                let ja_ia: Option<i64> =
                    sqlx::query_scalar("SELECT 1 FROM sinc_catalogo WHERE artigo_id = ? AND tipo = 'artigo'").bind(p.artigo_id).fetch_optional(&mut *tx).await?;
                let r = sqlx::query("UPDATE artigos SET codigo_barras = ? WHERE id = ? AND TRIM(COALESCE(codigo_barras, '')) = ''")
                    .bind(isbn)
                    .bind(p.artigo_id)
                    .execute(&mut *tx)
                    .await?;
                if ja_ia.is_none() {
                    sqlx::query("DELETE FROM sinc_catalogo WHERE artigo_id = ? AND tipo = 'artigo'").bind(p.artigo_id).execute(&mut *tx).await?;
                }
                if r.rows_affected() > 0 {
                    vieram.push((CODIGO_BARRAS.to_string(), isbn.clone()));
                    feito.codigos += 1;
                }
            }
        }
        if vieram.is_empty() {
            continue;
        }
        for (c, v) in &vieram {
            sqlx::query("INSERT OR REPLACE INTO fichas_do_site (artigo_id, campo, valor, em) VALUES (?, ?, ?, ?)")
                .bind(p.artigo_id)
                .bind(c)
                .bind(v)
                .bind(&em)
                .execute(&mut *tx)
                .await?;
        }
        feito.fichas += 1;
    }
    if feito.fichas > 0 {
        sqlx::query("INSERT INTO auditoria (utilizador_id, acao, detalhe) VALUES (NULL, 'FICHA_DO_SITE', ?)")
            .bind(format!(
                "Completou {} ficha(s) de artigos com os dados dos livros do site: {} dado(s) do livro e {} código(s) de barras (ISBN).",
                feito.fichas, feito.dados, feito.codigos
            ))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(feito)
}

/// Um interruptor deste computador (por omissão, ligado; "0" desliga).
async fn interruptor(pool: &SqlitePool, chave: &str) -> bool {
    let v: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(chave).fetch_optional(pool).await.ok().flatten();
    v.as_deref() != Some("0")
}

/// Completa sozinho? (por omissão, sim)
pub async fn ligado(pool: &SqlitePool) -> bool {
    interruptor(pool, CHAVE).await
}

/// O cartão da Loja online: se está ligado, quantas fichas podem receber alguma coisa e quantas já receberam; e o
/// sentido contrário (`para_o_site`): quantos livros esperam, quantos já foram e o que o site recusou.
pub async fn estado(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let pool = &st.pool;
    let por_completar = planear(pool).await?.len();
    let (completadas, ultima): (i64, Option<String>) =
        sqlx::query_as("SELECT COUNT(DISTINCT artigo_id), MAX(em) FROM fichas_do_site").fetch_one(pool).await?;
    let por_enviar = escolher_livros(pool, super::agora_s(), usize::MAX).await?.len();
    let contar = |estados: &'static str| async move {
        sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM livros_enviados WHERE estado IN ({estados})")).fetch_one(pool).await
    };
    let erro: Option<String> =
        sqlx::query_scalar("SELECT erro FROM livros_enviados WHERE estado IN ('erro', 'recusado') AND erro <> '' ORDER BY em DESC LIMIT 1")
            .fetch_optional(pool)
            .await?;
    Ok(json!({
        "ligado": ligado(pool).await,
        "por_completar": por_completar,
        "completadas": completadas,
        "ultima": ultima,
        "para_o_site": {
            "ligado": interruptor(pool, CHAVE_PARA_O_SITE).await,
            "por_enviar": por_enviar,
            "enviados": contar("'feito'").await?,
            "recusados": contar("'recusado', 'erro'").await?,
            "ultimo_erro": erro,
        },
    }))
}

/// «Completar agora».
pub async fn completar_agora(st: &AppState) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    let f = completar(&st.pool).await?;
    let mut e = estado(st).await?;
    e["agora"] = json!({ "fichas": f.fichas, "dados": f.dados, "codigos": f.codigos });
    Ok(e)
}

#[derive(Deserialize)]
pub struct LigarIn {
    /// completar as fichas com os dados do site
    #[serde(default)]
    ligado: Option<bool>,
    /// mandar os dados das fichas para os produtos do site
    #[serde(default)]
    para_o_site: Option<bool>,
}

/// Liga ou desliga, neste computador, um sentido ou os dois.
pub async fn ligar(st: &AppState, i: LigarIn) -> AppResult<Value> {
    st.exigir_perm("artigos.editar")?;
    for (chave, valor) in [(CHAVE, i.ligado), (CHAVE_PARA_O_SITE, i.para_o_site)] {
        let Some(v) = valor else { continue };
        sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
            .bind(chave)
            .bind(if v { "1" } else { "0" })
            .execute(&st.pool)
            .await?;
    }
    estado(st).await
}

// -----------------------------------------------------------------------------------------------------------------
// O sentido contrário: os dados das fichas para os produtos do site que não os têm (KANGEST-SINCRONIZACAO §19).
// -----------------------------------------------------------------------------------------------------------------

/// A chave na `config` deste computador para o envio: "0" desliga.
pub const CHAVE_PARA_O_SITE: &str = "sinc.dados_para_o_site";
/// Livros por volta (o site aceita até 50).
pub const MAX_LIVROS: usize = 50;

/// Um texto da ficha numa linha, com o tamanho da coluna do site, ou nada.
fn texto_da_ficha(v: Option<&Value>) -> Option<String> {
    let t = v?.as_str()?.split_whitespace().collect::<Vec<_>>().join(" ");
    (!t.is_empty()).then(|| t.chars().take(MAX_TEXTO).collect())
}

/// Um número da ficha maior do que 0.
fn numero_da_ficha(v: Option<&Value>) -> Option<i64> {
    let v = v?;
    let n = v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64)).or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))?;
    (n > 0).then_some(n)
}

/// O que a ficha tem e o produto do site (na cópia da Loja online) não: os dados do livro e o ISBN, que é o código de
/// barras quando este for um ISBN válido.
pub fn para_o_site(atributos: &Map<String, Value>, codigo_barras: Option<&str>, site: &Value) -> Map<String, Value> {
    let mut m = Map::new();
    for c in TEXTOS {
        if let Some(t) = texto_da_ficha(atributos.get(c)).filter(|_| vazio(site.get(c))) {
            m.insert(c.to_string(), Value::String(t));
        }
    }
    for c in NUMEROS {
        if let Some(n) = numero_da_ficha(atributos.get(c)).filter(|_| vazio(site.get(c))) {
            m.insert(c.to_string(), json!(n));
        }
    }
    if let Some(isbn) = codigo_barras.filter(|c| ramos::parece_isbn(c)).and_then(ramos::isbn13).filter(|_| vazio(site.get("isbn"))) {
        m.insert("isbn".to_string(), Value::String(isbn));
    }
    m
}

/// Um livro para o site: o artigo, a versão (o que vai, em texto: muda quando a ficha muda) e o item do pedido.
#[derive(Debug, Clone)]
pub struct LivroParaOSite {
    pub artigo_id: i64,
    pub versao: String,
    pub item: Value,
}

/// Um artigo com o produto do site: o id, a referência, os dados do ramo, o código de barras e os dados do produto.
type ArtigoComProduto = (i64, String, Option<String>, Option<String>, String);

/// Os livros que podem ir: os artigos activos com um produto do site pela referência, a quem a ficha pode dar alguma
/// coisa, e que ainda não foram com esta versão (os recusados e os erros voltam quando passar a espera).
async fn escolher_livros(pool: &SqlitePool, agora: i64, limite: usize) -> AppResult<Vec<LivroParaOSite>> {
    let pares: Vec<ArtigoComProduto> = sqlx::query_as(
        "SELECT a.id, TRIM(a.referencia), a.atributos, a.codigo_barras, MAX(p.dados)
           FROM artigos a JOIN loja_produtos p ON TRIM(p.referencia) = TRIM(a.referencia)
          WHERE TRIM(COALESCE(a.referencia, '')) <> '' AND a.ativo = 1
          GROUP BY a.id ORDER BY a.id",
    )
    .fetch_all(pool)
    .await?;
    let mut enviados: HashMap<i64, (String, String, i64)> = HashMap::new();
    for (a, v, e, p) in sqlx::query_as::<_, (i64, String, String, i64)>("SELECT artigo_id, versao, estado, proximo_em FROM livros_enviados").fetch_all(pool).await? {
        enviados.insert(a, (v, e, p));
    }
    let mut livros = Vec::new();
    for (artigo_id, referencia, atributos, codigo_barras, dados) in pares {
        if livros.len() >= limite {
            break;
        }
        let atributos = atributos
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        let site: Value = serde_json::from_str(&dados).unwrap_or(Value::Null);
        let falta = para_o_site(&atributos, codigo_barras.as_deref(), &site);
        if falta.is_empty() {
            continue;
        }
        let versao = Value::Object(falta.clone()).to_string();
        if let Some((v, estado, proximo)) = enviados.get(&artigo_id) {
            // a mesma versão: já foi (feito, sem produto), ou espera ainda (recusado, erro)
            if *v == versao && (estado == "feito" || estado == "sem_produto" || *proximo > agora) {
                continue;
            }
        }
        let mut item = Value::Object(falta);
        item["artigo_id"] = json!(artigo_id);
        item["referencia"] = json!(referencia);
        livros.push(LivroParaOSite { artigo_id, versao, item });
    }
    Ok(livros)
}

/// Os livros desta volta (no máximo `MAX_LIVROS`), se o envio estiver ligado neste computador.
pub async fn livros_para_o_site(pool: &SqlitePool, agora: i64) -> AppResult<Vec<LivroParaOSite>> {
    if !interruptor(pool, CHAVE_PARA_O_SITE).await {
        return Ok(Vec::new());
    }
    escolher_livros(pool, agora, MAX_LIVROS).await
}

/// Regista o que o site respondeu a cada livro (`livros` na resposta): feito, sem_produto, recusado (tenta outra vez um
/// dia depois) ou erro (cada vez mais tarde). Um livro sem resposta (um site antigo) conta como erro.
pub async fn concluir_livros(pool: &SqlitePool, enviados: &[LivroParaOSite], resposta: &Value, agora: i64) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for l in enviados {
        let r = resposta.as_array().and_then(|v| v.iter().find(|x| x["artigo_id"].as_i64() == Some(l.artigo_id)));
        let (estado, erro) = match r {
            Some(x) => (x["estado"].as_str().unwrap_or("erro"), x["erro"].as_str().unwrap_or("")),
            None => ("erro", "O site não respondeu aos dados do livro."),
        };
        let estado = match estado {
            "feito" | "sem_produto" | "recusado" => estado,
            _ => "erro",
        };
        let antes: i64 = sqlx::query_scalar("SELECT tentativas FROM livros_enviados WHERE artigo_id = ? AND versao = ?")
            .bind(l.artigo_id)
            .bind(&l.versao)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(0);
        let proximo = match estado {
            "erro" => super::proxima_tentativa(antes, agora),
            "recusado" => agora + 24 * 3600,
            _ => 0,
        };
        sqlx::query(
            "INSERT INTO livros_enviados (artigo_id, versao, estado, erro, tentativas, proximo_em, em) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(artigo_id) DO UPDATE SET versao = excluded.versao, estado = excluded.estado, erro = excluded.erro,
               tentativas = excluded.tentativas, proximo_em = excluded.proximo_em, em = excluded.em",
        )
        .bind(l.artigo_id)
        .bind(&l.versao)
        .bind(estado)
        .bind(erro.chars().take(300).collect::<String>())
        .bind(antes + 1)
        .bind(proximo)
        .bind(db::agora())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    fn obj(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap()
    }

    #[test]
    fn so_o_que_falta() {
        let site = json!({ "autor": "  Ellen   G. White ", "editora": "CPB", "idioma": "Português", "ano": 2024, "paginas": "0", "isbn": "978-85-345-2077-5" });
        let nada = HashSet::new();
        // a ficha vazia recebe tudo o que o site tem (as páginas a 0 não contam; o ISBN em ISBN-13)
        let f = o_que_falta(&Map::new(), None, &site, &nada);
        assert_eq!(
            f.dados,
            vec![
                ("autor".to_string(), json!("Ellen G. White")),
                ("editora".to_string(), json!("CPB")),
                ("idioma".to_string(), json!("Português")),
                ("ano".to_string(), json!(2024)),
            ]
        );
        assert_eq!(f.codigo_barras.as_deref(), Some("9788534520775"));
        // o que a ficha já tem nunca se substitui; o 0 e o texto vazio contam como vazios
        let f = o_que_falta(&obj(json!({ "autor": "Outro", "editora": "", "ano": 0 })), Some("5601234567890"), &site, &nada);
        assert_eq!(f.dados, vec![("editora".to_string(), json!("CPB")), ("idioma".to_string(), json!("Português")), ("ano".to_string(), json!(2024))]);
        assert_eq!(f.codigo_barras, None);
        // o que já veio uma vez não volta
        let veio: HashSet<String> = ["autor", "editora", "idioma", "ano", CODIGO_BARRAS].iter().map(|s| s.to_string()).collect();
        assert!(o_que_falta(&Map::new(), Some(" "), &site, &veio).vazia());
        // um ISBN que não bate certo não serve de código de barras
        let f = o_que_falta(&Map::new(), None, &json!({ "isbn": "9788534520776" }), &nada);
        assert!(f.vazia());
    }

    #[test]
    fn para_o_site_so_o_que_o_site_nao_tem() {
        let ficha = obj(json!({ "autor": " Ellen  G. White ", "editora": "CPB", "idioma": "", "ano": 2024.0, "paginas": "128" }));
        // o site sem nada: vai tudo o que a ficha tem (o ISBN do código de barras, em ISBN-13)
        let m = para_o_site(&ficha, Some("978-85-345-2077-5"), &json!({ "autor": null, "editora": "", "isbn": "" }));
        assert_eq!(
            Value::Object(m),
            json!({ "autor": "Ellen G. White", "editora": "CPB", "ano": 2024, "paginas": 128, "isbn": "9788534520775" })
        );
        // o site já tem o autor e o ISBN; um código de barras que não é ISBN não vai
        let m = para_o_site(&ficha, Some("5601234567890"), &json!({ "autor": "Outro", "editora": "Outra", "ano": 1999, "paginas": 0, "isbn": "" }));
        assert_eq!(Value::Object(m), json!({ "paginas": 128 }));
    }
}
