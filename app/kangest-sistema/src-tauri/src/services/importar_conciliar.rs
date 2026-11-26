// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! As conciliações do KIGEST com o KanGest, na conferência de cada importação (docs/MIGRACAO-KIGEST.md, «As
//! conciliações»):
//!
//! - **Documento a documento:** cada documento do KIGEST ao lado do que dele ficou no KanGest (se falta, o total e o
//!   estado), e os importados que já não estão no KIGEST.
//! - **A conta corrente, fatura a fatura** (`tbContasCorrente`): o que falta pagar de cada factura no KIGEST ao lado
//!   do pendente dela no KanGest.
//!
//! A terceira, a bancária, é a do KanGest (services/conciliacao.rs): as contas de banco do KIGEST e os movimentos
//! delas entram na tesouraria (importar.rs, `n_tesouraria`) e aparecem lá para casar com o extracto.
//!
//! Cada uma é um item da conferência (o total comparado e os que batem certo) com a lista das diferenças, até
//! `MAX_DIFERENCAS`, para o ecrã mostrar.

use std::collections::{BTreeMap, HashMap};

use serde_json::{json, Value};
use sqlx::{Sqlite, Transaction};

use super::{anulado_kigest, kz, t, Registo};
use crate::error::AppResult;

/// Quantas diferenças cada lista mostra.
pub(super) const MAX_DIFERENCAS: usize = 200;

/// Um documento do lado do KIGEST: o total (cêntimos) e se está anulado.
type DocKigest = (i64, bool);

/// As diferenças entre os documentos do KIGEST e os importados no KanGest (pelo número). Pura, para os testes.
pub(super) fn diferencas_documentos(kigest: &BTreeMap<String, DocKigest>, kangest: &HashMap<String, DocKigest>) -> (usize, Vec<Value>) {
    let mut iguais = 0;
    let mut dif = Vec::new();
    for (numero, (total, anulado)) in kigest {
        let motivo = match kangest.get(numero) {
            None => Some("falta no KanGest"),
            Some((_, a)) if a != anulado => Some(if *anulado { "anulado só no KIGEST" } else { "anulado só no KanGest" }),
            Some((tk, _)) if tk != total => Some("total diferente"),
            Some(_) => None,
        };
        match motivo {
            None => iguais += 1,
            Some(m) => dif.push(json!({
                "documento": numero, "motivo": m,
                "kigest": { "total": total, "anulado": anulado },
                "kangest": kangest.get(numero).map(|(tk, a)| json!({ "total": tk, "anulado": a })),
            })),
        }
    }
    // os importados que já não estão no KIGEST (apagados lá, ou de outra base)
    let mut so_kangest: Vec<(&String, &DocKigest)> = kangest.iter().filter(|(n, _)| !kigest.contains_key(*n)).collect();
    so_kangest.sort_by_key(|x| x.0);
    for (numero, (total, anulado)) in so_kangest {
        dif.push(json!({ "documento": numero, "motivo": "só no KanGest", "kigest": null, "kangest": { "total": total, "anulado": anulado } }));
    }
    dif.truncate(MAX_DIFERENCAS);
    (iguais, dif)
}

/// Documento a documento: o item «Documentos iguais, um a um» da conferência.
pub(super) async fn documento_a_documento(tx: &mut Transaction<'_, Sqlite>, docs: &[Registo]) -> AppResult<Value> {
    let kigest: BTreeMap<String, DocKigest> = docs
        .iter()
        .filter_map(|d| Some((t(d, &["RefDocumento", "NumDocumento"])?, (kz(d, &["ValTotal", "Total", "ValTotal_Com_Imposto"]), anulado_kigest(d)))))
        .collect();
    let kangest: HashMap<String, DocKigest> = sqlx::query_as::<_, (String, i64, String)>("SELECT numero_doc, total, estado FROM documentos WHERE importado = 1")
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(|(n, total, estado)| (n, (total, estado == "A")))
        .collect();
    let (iguais, dif) = diferencas_documentos(&kigest, &kangest);
    Ok(json!({ "item": "Documentos iguais, um a um", "unidade": "n", "kigest": kigest.len(), "kigest_novo": iguais, "por_documento": dif }))
}

/// Uma factura na conta corrente do KIGEST: a entidade, o que se debitou, o que se creditou e o que falta.
#[derive(Debug, Default, Clone, PartialEq)]
pub(super) struct FacturaCc {
    pub entidade: String,
    pub debito: i64,
    pub credito: i64,
    /// o «ValorFalta» das linhas que não são a crédito, se o KIGEST o tem; senão débito − crédito
    pub falta: Option<i64>,
}

impl FacturaCc {
    pub fn em_falta(&self) -> i64 {
        self.falta.unwrap_or((self.debito - self.credito).max(0))
    }
}

/// As facturas da conta corrente, pelo documento (as linhas a débito e a crédito juntas).
pub(super) fn facturas_da_conta_corrente(cc: &[Registo]) -> BTreeMap<String, FacturaCc> {
    let mut m: BTreeMap<String, FacturaCc> = BTreeMap::new();
    for r in cc {
        let Some(doc) = t(r, &["Documento", "RefDocumento"]) else { continue };
        let f = m.entry(doc).or_default();
        if f.entidade.is_empty() {
            f.entidade = t(r, &["EntidadeNome", "Entidade"]).unwrap_or_default();
        }
        let (debito, credito) = (kz(r, &["Debito"]), kz(r, &["Credito"]));
        f.debito += debito;
        f.credito += credito;
        // o «ValorFalta» é o da factura: vem nas linhas que não são a crédito (sem TipoMovimento, as que não creditam)
        let a_credito = t(r, &["TipoMovimento"]).map(|x| x.eq_ignore_ascii_case("C")).unwrap_or(credito > 0 && debito == 0);
        if !a_credito {
            if let Some(v) = super::n(r, &["ValorFalta"]) {
                f.falta = Some(f.falta.unwrap_or(0).max((v * 100.0).round() as i64));
            }
        }
    }
    m
}

/// Fatura a fatura: o pendente de cada factura no KIGEST ao lado do do KanGest. Pura, para os testes.
pub(super) fn diferencas_conta_corrente(facturas: &BTreeMap<String, FacturaCc>, pendentes: &HashMap<String, i64>) -> (usize, Vec<Value>) {
    let mut iguais = 0;
    let mut dif = Vec::new();
    for (doc, f) in facturas {
        let kangest = pendentes.get(doc).copied();
        if kangest == Some(f.em_falta()) {
            iguais += 1;
            continue;
        }
        dif.push(json!({
            "documento": doc, "entidade": f.entidade,
            "motivo": if kangest.is_none() { "falta no KanGest" } else { "pendente diferente" },
            "kigest": { "debito": f.debito, "credito": f.credito, "falta": f.em_falta() },
            "kangest": kangest.map(|p| json!({ "pendente": p })),
        }));
    }
    dif.truncate(MAX_DIFERENCAS);
    (iguais, dif)
}

/// A conta corrente, fatura a fatura: o item «Facturas da conta corrente que batem certo» da conferência.
pub(super) async fn conta_corrente(tx: &mut Transaction<'_, Sqlite>, cc: &[Registo]) -> AppResult<Value> {
    let facturas = facturas_da_conta_corrente(cc);
    let pendentes: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>("SELECT numero_doc, valor_pendente FROM documentos WHERE importado = 1")
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .collect();
    let (iguais, dif) = diferencas_conta_corrente(&facturas, &pendentes);
    let em_falta: i64 = facturas.values().map(FacturaCc::em_falta).sum();
    Ok(json!({
        "item": "Facturas da conta corrente que batem certo", "unidade": "n", "kigest": facturas.len(), "kigest_novo": iguais,
        "em_falta_kigest": em_falta, "por_fatura": dif,
    }))
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
    fn documento_a_documento_diz_o_que_falta_e_porque() {
        let kigest: BTreeMap<String, DocKigest> = [
            ("FR 2025/1".to_string(), (1000, false)),
            ("FR 2025/2".to_string(), (2000, false)),
            ("FR 2025/3".to_string(), (3000, true)),
            ("FT 2025/1".to_string(), (4000, false)),
        ]
        .into();
        let kangest: HashMap<String, DocKigest> =
            [("FR 2025/1".to_string(), (1000, false)), ("FR 2025/2".to_string(), (2100, false)), ("FR 2025/3".to_string(), (3000, false)), ("NC 2025/9".to_string(), (50, false))].into();
        let (iguais, dif) = diferencas_documentos(&kigest, &kangest);
        assert_eq!(iguais, 1);
        let motivos: Vec<(&str, &str)> = dif.iter().map(|d| (d["documento"].as_str().unwrap(), d["motivo"].as_str().unwrap())).collect();
        assert_eq!(
            motivos,
            vec![("FR 2025/2", "total diferente"), ("FR 2025/3", "anulado só no KIGEST"), ("FT 2025/1", "falta no KanGest"), ("NC 2025/9", "só no KanGest")]
        );
        assert!(dif[2]["kangest"].is_null());
    }

    #[test]
    fn a_conta_corrente_casa_fatura_a_fatura() {
        let cc = vec![
            // uma FR: o débito e o crédito iguais, nada em falta
            reg(&[("Documento", s("FR 2025/1")), ("Entidade", s("999999990")), ("TipoMovimento", s("D")), ("Debito", Val::F(2000.0)), ("Credito", Val::F(0.0)), ("ValorFalta", Val::F(0.0))]),
            reg(&[("Documento", s("FR 2025/1")), ("TipoMovimento", s("C")), ("Debito", Val::F(0.0)), ("Credito", Val::F(2000.0))]),
            // uma FT com 400 Kz em falta, segundo o KIGEST
            reg(&[("Documento", s("FT 2025/1")), ("EntidadeNome", s("Escola Kianda")), ("TipoMovimento", s("D")), ("Debito", Val::F(1000.0)), ("ValorFalta", Val::F(400.0))]),
            // uma FT sem ValorFalta: débito − crédito
            reg(&[("Documento", s("FT 2025/2")), ("TipoMovimento", s("D")), ("Debito", Val::F(500.0))]),
            reg(&[("Documento", s("FT 2025/2")), ("TipoMovimento", s("C")), ("Credito", Val::F(200.0))]),
            // como nas bases antigas: só o documento e o que falta
            reg(&[("Documento", s("FT 2025/3")), ("ValorFalta", Val::F(570.0))]),
        ];
        let f = facturas_da_conta_corrente(&cc);
        assert_eq!(f.len(), 4);
        assert_eq!(f["FT 2025/3"].em_falta(), 57000);
        assert_eq!(f["FR 2025/1"].em_falta(), 0);
        assert_eq!(f["FT 2025/1"].em_falta(), 40000);
        assert_eq!(f["FT 2025/1"].entidade, "Escola Kianda");
        assert_eq!(f["FT 2025/2"].em_falta(), 30000);
        let pendentes: HashMap<String, i64> = [("FR 2025/1".to_string(), 0), ("FT 2025/1".to_string(), 40000), ("FT 2025/3".to_string(), 57000)].into();
        let (iguais, dif) = diferencas_conta_corrente(&f, &pendentes);
        assert_eq!(iguais, 3);
        assert_eq!(dif.len(), 1);
        assert_eq!((dif[0]["documento"].as_str(), dif[0]["motivo"].as_str()), (Some("FT 2025/2"), Some("falta no KanGest")));
        let pendentes: HashMap<String, i64> =
            [("FR 2025/1".to_string(), 0), ("FT 2025/1".to_string(), 10000), ("FT 2025/2".to_string(), 30000), ("FT 2025/3".to_string(), 57000)].into();
        let (_, dif) = diferencas_conta_corrente(&f, &pendentes);
        assert_eq!((dif[0]["documento"].as_str(), dif[0]["motivo"].as_str(), dif[0]["kangest"]["pendente"].as_i64()), (Some("FT 2025/1"), Some("pendente diferente"), Some(10000)));
    }
}
