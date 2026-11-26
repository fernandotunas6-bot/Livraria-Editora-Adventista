// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! O que faltava importar do KIGEST (migração 0064; docs/MIGRACAO-KIGEST.md, «O que faltava»):
//!
//! - **As categorias dos artigos** (`tbArtigosCategoria`): passam a subfamília da família do artigo quando ele não
//!   tem subfamília própria.
//! - **As permissões dos utilizadores** (as ~70 colunas Front*/Pos*/FluxoCaixa_* de `tbUsuario` e o privilégio de
//!   `tbUsuarioPrivilegio`): aproximadas às do KanGest e marcadas «para rever». As permissões só de administrador
//!   nunca vêm do KIGEST (o administrador dá-as à mão), e o perfil ADMIN só se dá como antes (login «admin…»).
//! - **As vendas suspensas** (`tbDocsCabessalhoSuspenso` e `tbDocsDetalheSuspenso`): ficam suspensas no POS, prontas a
//!   retomar, com os artigos de cá.
//! - **As prestações sociais pagas** (`tbRhFuncSubsidioSocias`, os detalhes e `tbzconfigTiposPrestacao`): em Recursos
//!   Humanos → Prestações Sociais, com os meses pagos.

use std::collections::HashMap;

use serde_json::json;
use sqlx::{Sqlite, Transaction};

use super::{b, data, i, kz, n, t, Mapas, Registo, Relatorio};
use crate::error::AppResult;
use crate::state::SO_ADMIN;

// ------------------------------------------------------------------ categorias

/// As categorias do KIGEST (id → descrição).
pub(super) fn categorias(regs: &[Registo]) -> HashMap<i64, String> {
    regs.iter()
        .filter_map(|r| Some((i(r, &["IdCategoria", "Id"])?, t(r, &["Descricao", "Descritivo"])?)))
        .collect()
}

/// A subfamília de um artigo sem subfamília própria: a categoria dele, dentro da família dele (criada se faltar).
pub(super) async fn subfamilia_da_categoria(
    tx: &mut Transaction<'_, Sqlite>,
    feitas: &mut HashMap<(i64, String), i64>,
    categorias: &HashMap<i64, String>,
    familia: Option<i64>,
    categoria: Option<i64>,
) -> AppResult<Option<i64>> {
    let Some(desc) = categoria.and_then(|c| categorias.get(&c)) else { return Ok(None) };
    let familia = familia.unwrap_or(1);
    let chave = (familia, desc.to_lowercase());
    if let Some(id) = feitas.get(&chave) {
        return Ok(Some(*id));
    }
    let existente: Option<i64> = sqlx::query_scalar("SELECT id FROM subfamilias WHERE familia_id = ? AND descricao = ? COLLATE NOCASE LIMIT 1")
        .bind(familia)
        .bind(desc)
        .fetch_optional(&mut **tx)
        .await?;
    let id = match existente {
        Some(x) => x,
        None => sqlx::query("INSERT INTO subfamilias (familia_id, descricao) VALUES (?, ?)").bind(familia).bind(desc).execute(&mut **tx).await?.last_insert_rowid(),
    };
    feitas.insert(chave, id);
    Ok(Some(id))
}

// ------------------------------------------------------------------ permissões

/// Cada coluna do KIGEST (com «S») e as permissões do KanGest que lhe correspondem. As do restaurante (Rest_*) e as
/// que não têm par (imprimir no POS, ver o preço) ficam de fora.
const MAPA_PERMISSOES: &[(&str, &[&str])] = &[
    ("PosOpcoes_Rel", &["pos.relatorio"]),
    ("PosOpcoes_Susp", &["pos.suspenso"]),
    ("PosOpcoes_Posto", &["pos.config_posto"]),
    ("PosDesconto", &["pos.desconto"]),
    ("PosFechoCaixa", &["pos.fecho_caixa"]),
    ("PosQuantidade", &["pos.quantidade"]),
    ("PosEliminarLinha", &["pos.eliminar_linha"]),
    ("FrontAd_Artigo", &["artigos.criar"]),
    ("FrontEd_Artigo", &["artigos.editar"]),
    ("FrontDl_Artigo", &["artigos.editar"]),
    ("FrontFatura", &["vendas.fatura"]),
    ("FrontFat_Recibo", &["vendas.fatura_recibo"]),
    ("FrontN_Credito", &["vendas.nota_credito"]),
    ("FrontRec_Cliente", &["tesouraria.recibo"]),
    ("FrontRec_Fornec", &["tesouraria.pagamento"]),
    ("FrontRh_Cadastro", &["rh.funcionarios"]),
    ("FrontRh_Editar", &["rh.funcionarios"]),
    ("FrontRh_Eliminar", &["rh.funcionarios"]),
    ("FrontRH_Visualizar", &["rh.funcionarios"]),
    ("FrontRh_Process", &["rh.processamento"]),
    ("FrontRh_AnProcess", &["rh.processamento"]),
    ("FrontRh_AnHonorario", &["rh.processamento"]),
    ("FrontCad_Cliente", &["clientes"]),
    ("FrontCad_Fornecedor", &["fornecedores"]),
    ("FrontAd_Stock", &["stock.entrada"]),
    ("FrontSd_Stock", &["stock.saida"]),
    ("FrontTr_Stock", &["stock.transferencia"]),
    ("FrontStock_Visualizar", &["stock.inventario"]),
    ("FrontVenda_Visualizar", &["relatorios.ver"]),
    ("FrontCompra_Visualizar", &["compras.fatura"]),
    ("FrontCadastro_Visualizar", &["sistema.tabelas"]),
    ("FrontExportSAFT", &["sistema.saft"]),
    ("FrontBackup", &["sistema.backup"]),
    ("FrontFluxoCaixa", &["tesouraria.fluxo"]),
    ("Frontesouraria_Visualizar", &["tesouraria.fluxo"]),
    ("Tesouraria_FluxoCaixa", &["tesouraria.fluxo"]),
    ("Tesouraria_ContaCorrente", &["tesouraria.recibo"]),
    ("FluxoCaixa_Inserir", &["tesouraria.fluxo"]),
    ("FluxoCaixa_Pagamento", &["tesouraria.pagamento"]),
    ("FluxoCaixa_Regularizacao", &["tesouraria.regularizar"]),
];

/// As permissões do KanGest que um utilizador do KIGEST tinha, sem as só de administrador; e o limite de desconto
/// (em %, 0 = sem limite, como no KanGest).
pub(super) fn permissoes_do_kigest(r: &Registo) -> (Vec<&'static str>, f64) {
    let mut lista: Vec<&'static str> = Vec::new();
    for &(coluna, perms) in MAPA_PERMISSOES {
        if b(r, &[coluna]) == Some(true) {
            for &p in perms {
                if !lista.contains(&p) && !SO_ADMIN.contains(&p) {
                    lista.push(p);
                }
            }
        }
    }
    let limite = n(r, &["posLimeteDesconto", "PosLimiteDesconto"]).filter(|x| *x > 0.0 && *x <= 100.0).unwrap_or(0.0);
    (lista, limite)
}

/// O perfil: GESTOR para quem tinha o privilégio de administrador no KIGEST, ou mexia no back-office (artigos,
/// facturas, stock, tesouraria); CAIXA para quem só usava o POS. O ADMIN nunca vem do KIGEST.
pub(super) fn perfil_do_kigest(privilegio: Option<&str>, permissoes: &[&str]) -> &'static str {
    let admin_la = privilegio.is_some_and(|p| p.to_lowercase().contains("admin"));
    let back_office = permissoes.iter().any(|p| !p.starts_with("pos.") && *p != "vendas.fatura_recibo" && *p != "clientes");
    if admin_la || back_office {
        "GESTOR"
    } else {
        "CAIXA"
    }
}

/// O privilégio de cada código (tbUsuarioPrivilegio: «Admin», «Vendedor»…).
pub(super) fn privilegios(regs: &[Registo]) -> HashMap<i64, String> {
    regs.iter().filter_map(|r| Some((i(r, &["Id", "IdPrivilegio"])?, t(r, &["Privilegio", "Descricao"])?))).collect()
}

/// Aplica as permissões do KIGEST a um utilizador (novo ou já importado), se ninguém lhes mexeu ainda: sem lista
/// própria e nunca vindas do KIGEST. O administrador continua ADMIN.
pub(super) async fn aplicar_permissoes(tx: &mut Transaction<'_, Sqlite>, id: i64, r: &Registo, privilegios: &HashMap<i64, String>) -> AppResult<bool> {
    let (perfil_actual, proprias, marca): (String, Option<String>, Option<String>) =
        sqlx::query_as("SELECT perfil, permissoes, permissoes_kigest FROM utilizadores WHERE id = ?").bind(id).fetch_one(&mut **tx).await?;
    if perfil_actual == "ADMIN" || proprias.is_some() || marca.is_some() {
        return Ok(false);
    }
    let (lista, limite) = permissoes_do_kigest(r);
    let privilegio = i(r, &["Privilegio", "IdPrivilegio"]).and_then(|p| privilegios.get(&p)).map(String::as_str);
    let perfil = perfil_do_kigest(privilegio, &lista);
    sqlx::query("UPDATE utilizadores SET perfil = ?, permissoes = ?, limite_desconto = ?, permissoes_kigest = 'rever' WHERE id = ?")
        .bind(perfil)
        .bind(json!(lista).to_string())
        .bind(limite)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(true)
}

// ------------------------------------------------------------------ vendas suspensas

/// As vendas suspensas do POS do KIGEST, como suspensas do KanGest (o carrinho com os artigos de cá). Uma linha de
/// um artigo que não veio fica de fora (e conta no aviso); uma venda sem linhas não entra.
pub(super) async fn vendas_suspensas(
    tx: &mut Transaction<'_, Sqlite>,
    rel: &mut Relatorio,
    mapas: &Mapas,
    cabecalhos: &[Registo],
    linhas: &[Registo],
    utilizador: i64,
) -> AppResult<()> {
    if cabecalhos.is_empty() {
        return Ok(());
    }
    let (mut n_novas, mut sem_artigo) = (0, 0);
    for c in cabecalhos {
        if b(c, &["Eliminado"]) == Some(true) {
            continue;
        }
        let Some(referencia) = t(c, &["RefDocumento"]) else { continue };
        let origem = format!("{}:{}", i(c, &["ID", "Id"]).unwrap_or(0), referencia);
        // já veio uma vez (está suspensa ou já foi retomada no POS): não volta
        let ja: Option<String> = sqlx::query_scalar("SELECT id_origem FROM kigest_suspensos_importados WHERE id_origem = ?").bind(&origem).fetch_optional(&mut **tx).await?;
        if ja.is_some() {
            continue;
        }
        let mut carrinho = Vec::new();
        let mut total = 0i64;
        for l in linhas.iter().filter(|l| t(l, &["RefDocumento"]).as_deref() == Some(referencia.as_str()) && b(l, &["Eliminado"]) != Some(true)) {
            let artigo = i(l, &["IdArtigo"])
                .and_then(|a| mapas.artigos.get(&a).copied())
                .or_else(|| t(l, &["Referencia"]).and_then(|r| mapas.artigos_ref.get(&r).copied()));
            let Some(artigo) = artigo else {
                sem_artigo += 1;
                continue;
            };
            carrinho.push(json!({
                "artigo_id": artigo,
                "quantidade": n(l, &["Qtd", "Quantidade"]).unwrap_or(1.0),
                "preco": kz(l, &["ValorUnit", "PrecoUnitario"]),
                "pvp": null,
                "desconto": n(l, &["DescontoPercento"]).unwrap_or(0.0),
                "descricao": t(l, &["DescricaoLinha"]),
            }));
            total += kz(l, &["ValorTotal"]);
        }
        if carrinho.is_empty() {
            continue;
        }
        let sigla = t(c, &["SiglaDocumento"]).unwrap_or_default();
        let entidade = super::ent(c, &["IdEntidade"]).and_then(|k| mapas.clientes.get(&k).copied());
        let dono = i(c, &["IdUsuario"]).and_then(|u| mapas.utilizadores.get(&u).copied()).unwrap_or(utilizador);
        let quando = data(c, &["DataEmissao"]).unwrap_or_default();
        sqlx::query(
            "INSERT INTO vendas_suspensas (posto_id, utilizador_id, entidade_id, entidade_nome, descricao, total, dados, criado_em, id_origem)
             VALUES (1, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now','localtime')), ?)",
        )
        .bind(dono)
        .bind(entidade)
        .bind(t(c, &["Nome"]))
        .bind(format!("Do KIGEST: {} {referencia}", if sigla.is_empty() { "venda" } else { sigla.as_str() }))
        .bind(if total > 0 { total } else { kz(c, &["ValTotal"]) })
        .bind(json!({ "linhas": carrinho, "desc_global": { "tipo": "pct", "valor": n(c, &["Desconto"]).unwrap_or(0.0) }, "origem": null }).to_string())
        .bind(if quando.is_empty() { String::new() } else { format!("{quando} 00:00:00") })
        .bind(&origem)
        .execute(&mut **tx)
        .await?;
        sqlx::query("INSERT INTO kigest_suspensos_importados (id_origem) VALUES (?)").bind(&origem).execute(&mut **tx).await?;
        n_novas += 1;
    }
    rel.conta("Vendas suspensas", n_novas);
    if sem_artigo > 0 {
        rel.avisos.push(format!("{sem_artigo} linha(s) das vendas suspensas do KIGEST ficaram de fora: o artigo não veio na importação."));
    }
    if n_novas > 0 {
        rel.avisos.push(format!("{n_novas} venda(s) suspensa(s) do KIGEST ficaram no POS do Posto#1, prontas a retomar (Suspensos)."));
    }
    Ok(())
}

// ------------------------------------------------------------------ prestações sociais

/// As prestações sociais pagas (subsídio de maternidade, doença…), com os meses pagos. Uma prestação de um
/// funcionário que não veio fica de fora (e conta no aviso).
pub(super) async fn prestacoes(
    tx: &mut Transaction<'_, Sqlite>,
    rel: &mut Relatorio,
    cabecalhos: &[Registo],
    detalhes: &[Registo],
    tipos: &[Registo],
    utilizador: i64,
) -> AppResult<()> {
    if cabecalhos.is_empty() {
        return Ok(());
    }
    let tipos: HashMap<i64, String> = tipos.iter().filter_map(|r| Some((i(r, &["IdTipo", "Id"])?, t(r, &["Descritivo", "Descricao"])?))).collect();
    let (mut n_novas, mut sem_funcionario) = (0, 0);
    for c in cabecalhos {
        let Some(id_k) = i(c, &["ID", "Id"]) else { continue };
        let origem = id_k.to_string();
        let ja: Option<i64> = sqlx::query_scalar("SELECT id FROM rh_prestacoes WHERE id_origem = ?").bind(&origem).fetch_optional(&mut **tx).await?;
        if ja.is_some() {
            continue;
        }
        let Some(funcionario) = super::funcionario_k(tx, c, &["IDFuncionario", "IdFuncionario"]).await? else {
            sem_funcionario += 1;
            continue;
        };
        let meses: Vec<&Registo> = detalhes.iter().filter(|d| i(d, &["IdSubsidiosSociais", "IdSubsidioSocial"]) == Some(id_k)).collect();
        let total = kz(c, &["TotalLiquido"]);
        let n_meses = meses.len().max(1) as i64;
        let tipo = i(c, &["IdTipoPrestacao"]).and_then(|x| tipos.get(&x).cloned()).unwrap_or_else(|| "Prestação social".into());
        let inicio = data(c, &["DataInicial"]).or_else(|| data(c, &["DataProcessamento"])).unwrap_or_default();
        let id = sqlx::query(
            "INSERT INTO rh_prestacoes (funcionario_id, tipo, data_inicio, data_fim, liquido_mensal, meses, suspensao, observacoes, data, utilizador_id, id_origem)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
        )
        .bind(funcionario)
        .bind(&tipo)
        .bind(&inicio)
        .bind(data(c, &["DataFinal"]).unwrap_or_else(|| inicio.clone()))
        .bind(total / n_meses)
        .bind(n_meses)
        .bind(t(c, &["Observacao"]).map(|o| format!("{o} (do KIGEST)")).unwrap_or_else(|| "Do KIGEST".into()))
        .bind(data(c, &["DataProcessamento"]).unwrap_or_else(|| inicio.clone()))
        .bind(utilizador)
        .bind(&origem)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();
        for d in meses {
            sqlx::query("INSERT INTO rh_prestacao_pagamentos (prestacao_id, mes_referencia, data, valor) VALUES (?, ?, ?, ?)")
                .bind(id)
                .bind(t(d, &["MesReferencia"]).unwrap_or_default())
                .bind(data(d, &["DataProcessamento"]))
                .bind(kz(d, &["ValorLiquido"]))
                .execute(&mut **tx)
                .await?;
        }
        n_novas += 1;
    }
    rel.conta("Prestações sociais", n_novas);
    if sem_funcionario > 0 {
        rel.avisos.push(format!("{sem_funcionario} prestação(ões) social(is) do KIGEST ficaram de fora: o funcionário não veio na importação."));
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::super::Val;
    use super::*;

    fn reg(campos: &[(&str, Val)]) -> Registo {
        campos.iter().map(|(k, v)| (k.to_lowercase(), v.clone())).collect()
    }
    fn s(x: &str) -> Val {
        Val::S(x.into())
    }

    #[test]
    fn as_permissoes_do_kigest_sem_as_de_administrador() {
        let r = reg(&[
            ("PosDesconto", s("S")),
            ("PosQuantidade", s("S")),
            ("FrontFatura", s("S")),
            ("FrontEd_Artigo", s("S")),
            ("FrontDl_Artigo", s("S")),
            ("ForntCad_User", s("S")),
            ("FrontSistema_Visualizar", s("S")),
            ("Tesouraria_Estorno", s("N")),
            ("FluxoCaixa_Regularizacao", s("N")),
            ("Rest_Artigos", s("S")),
            ("posLimeteDesconto", Val::F(10.0)),
        ]);
        let (lista, limite) = permissoes_do_kigest(&r);
        assert_eq!(lista, vec!["pos.desconto", "pos.quantidade", "artigos.editar", "vendas.fatura"]);
        assert!(!lista.iter().any(|p| SO_ADMIN.contains(p)), "as de administrador nunca vêm: {lista:?}");
        assert_eq!(limite, 10.0);
        assert_eq!(permissoes_do_kigest(&reg(&[("posLimeteDesconto", Val::F(0.0))])).1, 0.0);
    }

    #[test]
    fn o_perfil_do_kigest_nunca_e_admin() {
        assert_eq!(perfil_do_kigest(Some("Admin"), &[]), "GESTOR");
        assert_eq!(perfil_do_kigest(Some("Vendedor"), &["pos.desconto", "vendas.fatura_recibo", "clientes"]), "CAIXA");
        assert_eq!(perfil_do_kigest(Some("Vendedor"), &["pos.desconto", "stock.entrada"]), "GESTOR");
        assert_eq!(perfil_do_kigest(None, &[]), "CAIXA");
    }

    #[test]
    fn as_categorias_e_os_privilegios() {
        let c = categorias(&[reg(&[("IdCategoria", Val::I(1)), ("Descricao", s("Produto"))]), reg(&[("IdCategoria", Val::I(2))])]);
        assert_eq!(c.len(), 1);
        assert_eq!(c.get(&1).map(String::as_str), Some("Produto"));
        let p = privilegios(&[reg(&[("Id", Val::I(0)), ("Privilegio", s("Vendedor"))]), reg(&[("Id", Val::I(1)), ("Privilegio", s("Admin"))])]);
        assert_eq!(p.get(&1).map(String::as_str), Some("Admin"));
    }
}
