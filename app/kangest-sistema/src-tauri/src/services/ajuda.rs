// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O centro de ajuda do KanGest: o botão «Ajuda», o sino da barra e a tecla F1 (src/components/Ajuda.tsx).
//!
//! **Os avisos** dizem o que precisa de atenção, cada um com o botão que leva ao ecrã onde se resolve, e só a quem o
//! pode resolver (as permissões da pessoa). Vêm de três sítios:
//! - **o próprio KanGest:** as cópias de segurança, o espaço no disco, a verificação da base, a facturação
//!   electrónica, a ligação ao site, as actualizações e o caixa aberto de outro dia;
//! - **a loja online:** as encomendas por confirmar e os levantamentos por fazer (a cópia local que vem pelos postos);
//! - **a equipa do site:** os avisos da pessoa no painel (encomendas novas, mensagens de clientes), com a conta do site
//!   dela (`ajuda.avisosSite`, à parte, para o painel não esperar pelo site).
//!
//! Um aviso do KanGest tem um id que muda com o estado (`fe-rejeitados:3`): marcado como lido, volta a aparecer se o
//! estado mudar. Os lidos ficam por pessoa (`ajuda.lidos.<id>` na configuração); os do site, no próprio site.
//!
//! **O assistente** responde neste computador: as encomendas do site pelo número, com o mesmo cartão do assistente
//! do site, um resumo das encomendas e as perguntas sobre os dados da loja (services/assistente.rs). Não chama o
//! assistente público do site: esse é dos clientes, e cada pergunta abria uma conversa de cliente no atendimento.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Os lidos que se guardam por pessoa (os mais recentes).
const MAX_LIDOS: usize = 200;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Aviso {
    pub id: String,
    /// «kangest», «loja» ou «site»
    pub origem: &'static str,
    /// «grave», «atencao» ou «info»
    pub gravidade: &'static str,
    pub titulo: String,
    pub texto: String,
    pub quando: Option<String>,
    pub lido: bool,
    /// O ecrã do KanGest onde se resolve.
    pub destino: Option<String>,
    /// Ou a página do painel do site (endereço completo).
    pub site: Option<String>,
}

fn aviso(id: String, origem: &'static str, gravidade: &'static str, titulo: impl Into<String>, texto: impl Into<String>, destino: &str) -> Aviso {
    Aviso { id, origem, gravidade, titulo: titulo.into(), texto: texto.into(), quando: None, lido: false, destino: Some(destino.into()), site: None }
}

// ------------------------------------------------------------------ os lidos

fn chave_lidos(utilizador: i64) -> String {
    format!("ajuda.lidos.{utilizador}")
}

async fn lidos(st: &AppState, utilizador: i64) -> AppResult<Vec<String>> {
    let v: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = ?").bind(chave_lidos(utilizador)).fetch_optional(&st.pool).await?;
    Ok(v.and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default())
}

/// Junta `novos` aos lidos (sem repetir), e ficam os `MAX_LIDOS` mais recentes.
fn juntar_lidos(mut antes: Vec<String>, novos: &[String]) -> Vec<String> {
    for n in novos {
        antes.retain(|x| x != n);
        antes.push(n.clone());
    }
    let sobra = antes.len().saturating_sub(MAX_LIDOS);
    antes.drain(..sobra);
    antes
}

async fn gravar_lidos(st: &AppState, utilizador: i64, ids: &[String]) -> AppResult<()> {
    let v = juntar_lidos(lidos(st, utilizador).await?, ids);
    sqlx::query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(chave_lidos(utilizador))
        .bind(serde_json::to_string(&v)?)
        .execute(&st.pool)
        .await?;
    Ok(())
}

// ------------------------------------------------------------------ os avisos do KanGest e da loja online

/// Um resumo curto de um texto (FNV-1a), para o id de um aviso mudar quando o erro muda.
fn resumo(t: &str) -> u64 {
    t.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3))
}

/// «há 3 dias», «desde ontem»: há quanto tempo, em dias, a partir de um número de segundos.
fn ha_dias(segundos: u64) -> String {
    match segundos / 86_400 {
        0 => "há menos de um dia".into(),
        1 => "há um dia".into(),
        n => format!("há {n} dias"),
    }
}

/// Os avisos do KanGest e da loja online para esta pessoa, com os lidos marcados.
pub async fn avisos(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let p = &st.pool;
    let mut v: Vec<Aviso> = Vec::new();

    // as cópias de segurança e o espaço no disco (no computador que guarda a base)
    if s.tem("sistema.backup") {
        let erro: Option<String> = sqlx::query_scalar("SELECT valor FROM config WHERE chave = 'copias.erro_externa'").fetch_optional(p).await?;
        if let Some(e) = erro.filter(|e| !e.trim().is_empty()) {
            let id = format!("copia-externa:{:x}", resumo(&e));
            v.push(aviso(id, "kangest", "grave", "A cópia externa não foi gravada", e, "/configuracoes?aba=sistema"));
        }
        let (ultima, livre, precisa) = super::sistema::estado_das_copias(&st.pasta_dados);
        let idade = ultima.and_then(|t| t.elapsed().ok()).map(|d| d.as_secs());
        match idade {
            Some(seg) if seg > 2 * 86_400 => v.push(aviso(
                format!("copia-antiga:{}", seg / 86_400),
                "kangest",
                "atencao",
                "Sem cópia de segurança recente",
                format!("A última cópia foi feita {}. Faça uma agora em Configurações → Sistema.", ha_dias(seg)),
                "/configuracoes?aba=sistema",
            )),
            None if !crate::rede::config().cliente() => v.push(aviso(
                "copia-nenhuma".into(),
                "kangest",
                "atencao",
                "Ainda não há cópias de segurança",
                "Faça a primeira em Configurações → Sistema.",
                "/configuracoes?aba=sistema",
            )),
            _ => {}
        }
        if let Some(l) = livre.filter(|l| *l < precisa) {
            v.push(aviso(
                format!("disco-cheio:{}", l / (100 * 1024 * 1024)),
                "kangest",
                "grave",
                "Disco quase cheio",
                format!(
                    "No disco dos dados há {} livres, e a próxima cópia de segurança precisa de {}. Liberte espaço.",
                    crate::recursos::tamanho_legivel(l),
                    crate::recursos::tamanho_legivel(precisa)
                ),
                "/sobre",
            ));
        }
    }

    // a verificação da base (a última, se encontrou problemas)
    if s.tem("sistema.configuracoes") {
        let r = sqlx::query("SELECT id, feita_em, ok, graves, resumo FROM verificacoes_base ORDER BY id DESC LIMIT 1").fetch_optional(p).await?;
        if let Some(r) = r.filter(|r| r.get::<i64, _>("ok") == 0) {
            let graves: i64 = r.get("graves");
            let mut a = aviso(
                format!("verificacao:{}", r.get::<i64, _>("id")),
                "kangest",
                if graves > 0 { "grave" } else { "atencao" },
                "A verificação da base encontrou problemas",
                r.get::<String, _>("resumo"),
                "/sobre",
            );
            a.quando = Some(r.get("feita_em"));
            v.push(a);
        }
    }

    // a facturação electrónica: documentos rejeitados pela AGT
    if s.tem("sistema.fe") {
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM fe_envios WHERE estado = 'INVALIDO'").fetch_one(p).await?;
        if n > 0 {
            let texto = if n == 1 { "Um documento foi rejeitado pela AGT: corrija-o e envie outra vez.".to_string() } else { format!("{n} documentos foram rejeitados pela AGT: corrija-os e envie outra vez.") };
            v.push(aviso(format!("fe-rejeitados:{n}"), "kangest", "grave", "Facturação electrónica com rejeitados", texto, "/facturacao-electronica"));
        }
    }

    // a ligação ao site (os postos)
    if s.tem("sistema.api") {
        let erro: Option<String> = sqlx::query_scalar("SELECT ultimo_erro FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(p).await?;
        let falhados: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sinc_saida WHERE estado = 'erro'").fetch_one(p).await?;
        if let Some(e) = erro.filter(|e| !e.trim().is_empty()) {
            v.push(aviso(format!("sinc-erro:{:x}", resumo(&e)), "kangest", "atencao", "A ligação ao site tem um erro", e, "/ligacao-site"));
        }
        if falhados > 0 {
            v.push(aviso(
                format!("sinc-falhados:{falhados}"),
                "kangest",
                "atencao",
                "Documentos por enviar ao site",
                format!("{falhados} documento(s) não chegaram ao site. Em Livraria → Ligação ao site, «Repetir» volta a enviá-los."),
                "/ligacao-site",
            ));
        }
    }

    // uma versão nova do KanGest
    if s.tem("sistema.atualizacoes") {
        if let Some(nova) = super::atualizacao::ler_cfg(&st.pasta_dados).disponivel.filter(|n| super::atualizacao::mais_recente(n, env!("CARGO_PKG_VERSION"))) {
            v.push(aviso(
                format!("versao:{nova}"),
                "kangest",
                "info",
                format!("Há uma versão nova: {nova}"),
                "Instale-a em Sobre o KanGest → Actualizações. Antes, o KanGest faz uma cópia de segurança.",
                "/sobre",
            ));
        }
    }

    // o caixa deste posto aberto de outro dia
    if s.tem("pos.fecho_caixa") {
        let aberta: Option<String> = sqlx::query_scalar(
            "SELECT aberta_em FROM caixa_sessoes WHERE posto_id = ? AND estado = 'ABERTA' AND aberta_em < date('now', 'localtime') ORDER BY id DESC LIMIT 1",
        )
        .bind(st.posto().id)
        .fetch_optional(p)
        .await?;
        if let Some(a) = aberta {
            let dia = a.get(..10).unwrap_or(&a).to_string();
            v.push(aviso(
                format!("caixa-aberto:{dia}"),
                "kangest",
                "atencao",
                "O caixa está aberto de outro dia",
                format!("O caixa deste posto está aberto desde {}. Feche-o para o fecho do dia ficar certo.", data_pt(&dia)),
                "/caixa",
            ));
        }
    }

    // a loja online (a cópia local das encomendas desta loja)
    if crate::sinc::loja::permitir(st).is_ok() {
        let (pendentes, levantar): (i64, i64) = sqlx::query_as(
            "SELECT COALESCE(SUM(estado = 'pending'), 0), COALESCE(SUM(levantamento = 1 AND estado NOT IN ('delivered', 'cancelled')), 0) FROM loja_encomendas",
        )
        .fetch_one(p)
        .await?;
        if pendentes > 0 {
            let texto = if pendentes == 1 { "Uma encomenda do site espera que a loja a confirme.".to_string() } else { format!("{pendentes} encomendas do site esperam que a loja as confirme.") };
            v.push(aviso(format!("loja-pendentes:{pendentes}"), "loja", "atencao", "Encomendas por confirmar", texto, "/loja-online?filtro=por_confirmar"));
        }
        if levantar > 0 {
            let texto = if levantar == 1 { "Um cliente vem levantar uma encomenda à loja.".to_string() } else { format!("{levantar} clientes vêm levantar encomendas à loja.") };
            v.push(aviso(format!("loja-levantamentos:{levantar}"), "loja", "info", "Levantamentos por fazer", texto, "/loja-online?filtro=levantamentos"));
        }
    }

    let ja_lidos = lidos(st, s.id).await?;
    for a in &mut v {
        a.lido = ja_lidos.contains(&a.id);
    }
    Ok(json!(v))
}

/// «2026-11-20» → «20/11/2026».
fn data_pt(d: &str) -> String {
    match (d.get(..4), d.get(5..7), d.get(8..10)) {
        (Some(a), Some(m), Some(dia)) => format!("{dia}/{m}/{a}"),
        _ => d.to_string(),
    }
}

/// Os avisos da equipa no site (à parte: podem demorar, e sem Internet não impedem os outros), e o endereço do site
/// (para «Abrir o painel do site», mesmo sem a conta ligada).
pub async fn avisos_site(st: &AppState) -> AppResult<Value> {
    let s = st.sessao()?;
    let site: String = sqlx::query_scalar("SELECT site_url FROM sinc_ligacao WHERE id = 1 AND ativa = 1").fetch_optional(&st.pool).await?.unwrap_or_default();
    let site = site.trim_end_matches('/').to_string();
    match crate::sinc::avisos::da_pessoa(&st.pool, s.id).await {
        Ok(linhas) => Ok(json!({ "ligado": true, "site": site, "avisos": linhas.iter().map(|n| do_site(n, &site)).collect::<Vec<_>>() })),
        Err(motivo) => Ok(json!({ "ligado": false, "site": site, "motivo": motivo, "avisos": [] })),
    }
}

/// Um aviso do site como aviso do centro de ajuda: uma encomenda abre na Loja online do KanGest; uma mensagem de cliente,
/// no atendimento do painel.
fn do_site(n: &Value, site: &str) -> Aviso {
    let txt = |k: &str| n[k].as_str().unwrap_or_default().to_string();
    let encomenda = n["order_id"].as_str().filter(|o| crate::sinc::pessoa::id_valido(o));
    let mensagem = n["thread_id"].as_str().is_some() || txt("kind") == "support";
    Aviso {
        id: format!("site:{}", txt("id")),
        origem: "site",
        gravidade: if mensagem { "atencao" } else { "info" },
        titulo: txt("title"),
        texto: txt("body"),
        quando: n["created_at"].as_str().map(str::to_string),
        lido: !n["read_at"].is_null(),
        destino: if mensagem { None } else { encomenda.map(|o| format!("/loja-online?encomenda={o}")) },
        site: if mensagem && !site.is_empty() { Some(format!("{site}/admin?tab=support")) } else { None },
    }
}

#[derive(Deserialize)]
pub struct LidoIn {
    ids: Vec<String>,
}

/// Marca avisos como lidos: os do site no site, os outros nesta pessoa.
pub async fn lido(st: &AppState, i: LidoIn) -> AppResult<Value> {
    let s = st.sessao()?;
    let (do_site, locais): (Vec<String>, Vec<String>) = i.ids.into_iter().filter(|x| !x.is_empty() && x.len() <= 120).partition(|x| x.starts_with("site:"));
    if !locais.is_empty() {
        gravar_lidos(st, s.id, &locais).await?;
    }
    for id in &do_site {
        if let Err(e) = crate::sinc::avisos::marcar_lido(&st.pool, s.id, &id["site:".len()..]).await {
            return Err(AppError::msg(e));
        }
    }
    Ok(json!({ "ok": true }))
}

// ------------------------------------------------------------------ o assistente

#[derive(Deserialize)]
pub struct PerguntarIn {
    texto: String,
}

/// Os números de encomenda que a pergunta pode ter («ENC-6W05J5GH6», «a 6W05J5GH6»): palavras com letras e
/// algarismos, sem acentos, com pelo menos 6 caracteres e um algarismo.
fn numeros_de_encomenda(texto: &str) -> Vec<String> {
    let mut v: Vec<String> = texto
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .map(|p| p.trim_matches('-').to_ascii_uppercase())
        .filter(|p| p.len() >= 6 && p.len() <= 40 && p.chars().any(|c| c.is_ascii_digit()))
        .collect();
    v.dedup();
    v.truncate(3);
    v
}

/// A etapa da encomenda com as regras do site (supabase/functions/app/orderWatch.ts, `orderStage`).
fn etapa(estado: &str, pagamento: &str, entrega: &str) -> &'static str {
    if estado == "cancelled" || entrega == "cancelled" {
        return "cancelled";
    }
    if entrega == "delivered" || estado == "delivered" {
        return "delivered";
    }
    match entrega {
        "shipped" => "shipped",
        "in_transit" => "in_transit",
        "out_for_delivery" => "out_for_delivery",
        "preparing" => "preparing",
        _ if pagamento == "paid" => "paid",
        _ => "awaiting_payment",
    }
}

fn texto_da_etapa(etapa: &str, levantamento: bool, pagamento: &str) -> &'static str {
    match etapa {
        "awaiting_payment" if pagamento == "awaiting_confirmation" => "a aguardar a confirmação do pagamento",
        "awaiting_payment" => "a aguardar pagamento",
        "paid" => "paga e a ser preparada",
        "preparing" => "em preparação",
        "shipped" if levantamento => "pronta para levantamento",
        "shipped" => "expedida",
        "in_transit" => "em trânsito",
        "out_for_delivery" => "a caminho — saiu para entrega",
        "delivered" if levantamento => "levantada",
        "delivered" => "entregue",
        "cancelled" => "cancelada",
        _ => "em processamento",
    }
}

fn texto_do_pagamento(p: &str) -> &'static str {
    match p {
        "awaiting_confirmation" => "a aguardar a confirmação",
        "paid" => "confirmado",
        "failed" => "não confirmado",
        "refunded" => "devolvido",
        _ => "pendente",
    }
}

/// O dia (à hora de Angola) de um momento que o site manda em UTC: «07/11/2026».
fn dia_ao(momento: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(momento)
        .ok()
        .and_then(|d| chrono::FixedOffset::east_opt(3600).map(|tz| d.with_timezone(&tz).format("%d/%m/%Y").to_string()))
        .unwrap_or_else(|| data_pt(momento.get(..10).unwrap_or(momento)))
}

/// O cartão da encomenda, como o do assistente do site (chatEngine.ts, `orderCard`), mais o cliente (a equipa vê-o).
fn cartao(r: &sqlx::sqlite::SqliteRow) -> Value {
    let (estado, pagamento, entrega): (String, String, String) = (r.get("estado"), r.get("pagamento"), r.get("entrega"));
    let levantamento = r.get::<i64, _>("levantamento") == 1;
    let dados: Value = serde_json::from_str(&r.get::<String, _>("dados")).unwrap_or(Value::Null);
    let e = etapa(&estado, &pagamento, &entrega);
    let cancelada = e == "cancelled";
    let em = match e {
        "awaiting_payment" => 0,
        "paid" => 1,
        "preparing" => 2,
        "delivered" => 4,
        "cancelled" => 0,
        _ => 3,
    };
    let nomes: [&str; 5] = if levantamento {
        ["Recebida", "Paga", "Em preparação", "Pronta a levantar", "Levantada"]
    } else {
        let quarto = match e {
            "in_transit" => "Em trânsito",
            "out_for_delivery" => "Saiu para entrega",
            _ => "Expedida",
        };
        ["Recebida", "Paga", "Em preparação", quarto, "Entregue"]
    };
    let passos: Vec<Value> = nomes
        .iter()
        .enumerate()
        .map(|(i, n)| json!({ "rotulo": n, "feito": !cancelada && (i < em || (i == em && e == "delivered")), "actual": !cancelada && i == em && e != "delivered" }))
        .collect();
    let livros: Vec<String> = dados["itens"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| {
            let t = x["title"].as_str()?.trim();
            let q = x["quantity"].as_f64().unwrap_or(1.0);
            (!t.is_empty()).then(|| if q > 1.0 { format!("{t} (×{q})") } else { t.to_string() })
        })
        .collect();
    let numero: String = r.get("numero");
    json!({
        "id": r.get::<String, _>("id"),
        "numero": numero,
        "feita": dia_ao(&r.get::<String, _>("criada_em")),
        "etapa": e,
        "etapa_texto": texto_da_etapa(e, levantamento, &pagamento),
        "cancelada": cancelada,
        "levantamento": levantamento,
        "passos": passos,
        "pagamento": if cancelada { String::new() } else { texto_do_pagamento(&pagamento).to_string() },
        "metodo_pagamento": dados["metodo_pagamento"].as_str().unwrap_or_default(),
        "cliente": r.get::<String, _>("cliente"),
        "telefone": r.get::<String, _>("telefone"),
        "livros": livros,
        "total": r.get::<f64, _>("total"),
    })
}

const CAMPOS_ENCOMENDA: &str = "id, numero, criada_em, estado, pagamento, entrega, total, levantamento, cliente, telefone, dados";

/// Responde a uma pergunta: as encomendas do site, um resumo delas, e os dados da loja. Calculado neste computador.
pub async fn perguntar(st: &AppState, i: PerguntarIn) -> AppResult<Value> {
    let s = st.sessao()?;
    let texto = i.texto.trim();
    if texto.is_empty() {
        return Err(AppError::msg("Escreva a sua pergunta."));
    }
    let normal = super::assistente::normalizar(texto);
    if crate::sinc::loja::permitir(st).is_ok() {
        // uma encomenda pelo número
        for n in numeros_de_encomenda(texto) {
            let r = sqlx::query(&format!("SELECT {CAMPOS_ENCOMENDA} FROM loja_encomendas WHERE upper(numero) IN (?, ?) LIMIT 1"))
                .bind(&n)
                .bind(format!("ENC-{n}"))
                .fetch_optional(&st.pool)
                .await?;
            if let Some(r) = r {
                let c = cartao(&r);
                let texto = format!("A encomenda **{}** (feita a {}) está **{}**.", c["numero"].as_str().unwrap_or_default(), c["feita"].as_str().unwrap_or_default(), c["etapa_texto"].as_str().unwrap_or_default());
                return Ok(json!({ "tipo": "encomenda", "texto": texto, "encomenda": c }));
            }
        }
        // as encomendas em geral
        if normal.contains("encomenda") {
            let (pendentes, em_curso, levantar): (i64, i64, i64) = sqlx::query_as(
                "SELECT COALESCE(SUM(estado = 'pending'), 0), COALESCE(SUM(estado IN ('confirmed', 'shipped')), 0),
                        COALESCE(SUM(levantamento = 1 AND estado NOT IN ('delivered', 'cancelled')), 0) FROM loja_encomendas",
            )
            .fetch_one(&st.pool)
            .await?;
            let recentes = sqlx::query(&format!(
                "SELECT {CAMPOS_ENCOMENDA} FROM loja_encomendas WHERE estado NOT IN ('delivered', 'cancelled') ORDER BY criada_em DESC LIMIT 3"
            ))
            .fetch_all(&st.pool)
            .await?;
            let texto = format!(
                "Na loja online há **{pendentes}** por confirmar, **{em_curso}** em curso e **{levantar}** levantamento(s) por fazer.{}",
                if recentes.is_empty() { "" } else { " As mais recentes em aberto:" }
            );
            return Ok(json!({ "tipo": "encomendas", "texto": texto, "encomendas": recentes.iter().map(cartao).collect::<Vec<_>>() }));
        }
    }
    // os dados da loja: vendas, stock, devedores… (com a permissão de relatórios)
    if s.tem("relatorios.ver") {
        let r = super::assistente::perguntar(st, super::assistente::PerguntaIn { texto: texto.to_string() }).await?;
        if !r.is_null() {
            return Ok(json!({ "tipo": "dados", "resposta": r }));
        }
    }
    Ok(json!({
        "tipo": "nao_percebi",
        "texto": "Ainda não sei responder a isso. Pergunte por uma encomenda do site (o número), pelas vendas, pelo stock de um livro ou por quem deve à loja.",
    }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_id_de_um_aviso_muda_com_o_erro() {
        assert_eq!(resumo("sem ligação"), resumo("sem ligação"));
        assert_ne!(resumo("sem ligação"), resumo("recusado"));
    }

    #[test]
    fn os_lidos_nao_se_repetem_e_ficam_os_mais_recentes() {
        let v = juntar_lidos(vec!["a".into(), "b".into()], &["a".into(), "c".into()]);
        assert_eq!(v, ["b", "a", "c"]);
        let muitos: Vec<String> = (0..MAX_LIDOS + 5).map(|i| i.to_string()).collect();
        let v = juntar_lidos(vec![], &muitos);
        assert_eq!(v.len(), MAX_LIDOS);
        assert_eq!(v[0], "5", "saem os mais antigos");
    }

    #[test]
    fn numeros_de_encomenda_na_pergunta() {
        assert_eq!(numeros_de_encomenda("Onde está a encomenda ENC-6W05J5GH6?"), ["ENC-6W05J5GH6"]);
        assert_eq!(numeros_de_encomenda("e a 6w05j5gh6"), ["6W05J5GH6"]);
        assert!(numeros_de_encomenda("quanto vendi ontem?").is_empty(), "sem algarismos");
        assert!(numeros_de_encomenda("stock de 2026").is_empty(), "curto de mais");
    }

    #[test]
    fn a_etapa_e_a_do_site() {
        assert_eq!(etapa("pending", "pending", ""), "awaiting_payment");
        assert_eq!(etapa("confirmed", "paid", ""), "paid");
        assert_eq!(etapa("confirmed", "paid", "preparing"), "preparing");
        assert_eq!(etapa("shipped", "paid", "shipped"), "shipped");
        assert_eq!(etapa("delivered", "pending", ""), "delivered", "entregue, mesmo com o pagamento por confirmar");
        assert_eq!(etapa("cancelled", "paid", "preparing"), "cancelled");
        assert_eq!(texto_da_etapa("shipped", true, "paid"), "pronta para levantamento");
        assert_eq!(texto_da_etapa("awaiting_payment", false, "awaiting_confirmation"), "a aguardar a confirmação do pagamento");
        assert_eq!(dia_ao("2026-11-07T23:30:00Z"), "08/11/2026", "à hora de Angola");
        assert_eq!(dia_ao("2026-11-07"), "07/11/2026");
    }

    #[test]
    fn um_aviso_do_site_abre_no_sitio_certo() {
        let enc = do_site(&json!({ "id": "n1", "kind": "new_order", "title": "Encomenda nova", "body": "ENC-1", "order_id": "abc-123", "read_at": null }), "https://livrariaadventista.ao");
        assert_eq!(enc.destino.as_deref(), Some("/loja-online?encomenda=abc-123"));
        assert!(!enc.lido && enc.site.is_none());
        let msg = do_site(&json!({ "id": "n2", "kind": "support", "title": "Mensagem", "body": "…", "thread_id": "t1", "read_at": "2026-11-26T10:00:00Z" }), "https://livrariaadventista.ao");
        assert_eq!(msg.site.as_deref(), Some("https://livrariaadventista.ao/admin?tab=support"));
        assert!(msg.lido && msg.destino.is_none() && msg.id == "site:n2");
    }
}
