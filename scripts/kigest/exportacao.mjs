#!/usr/bin/env node
// Leitor dos ficheiros .kigest — a exportação do KiGest, o programa de facturação que corre
// no computador da loja (DESKTOP-G26LDJM/KigestGC). É nele que se vende ao balcão, por isso é
// nele que está o stock verdadeiro e o preço que o cliente paga à porta.
//
// Formato (observado na exportação de 2026-11-12, versao 1): gzip de JSON por linhas.
//   linha 1   {"formato":"kigest-exportacao","versao":1,"origem":…,"data":…,"objectos":164}
//   depois    {"tabela":"tbArtigos","tipo":"TABELA"|"VISTA","colunas":[…]}
//             [valor, valor, …]            uma linha por registo, na ordem das colunas
//             {"fim":"tbArtigos","registos":410}
// Os valores binários (imagens, diagramas) vêm embrulhados em {"b64":"…"} e ficam como estão:
// nada aqui os descodifica.
//
// Deste todo só interessam duas tabelas:
//   tbArtigos       o catálogo da loja — referência, descrição, código de barras, preços
//   tbArtigosStock  a existência por armazém
// O resto (documentos, contas correntes, recursos humanos) traz dados de clientes e de
// facturação e não entra no site: `artigos()` devolve apenas produto, preço e quantidade.
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

// Armazém 1 é a loja. A exportação de 2026-11-12 só tem este.
export const ARMAZEM_LOJA = 1;

export function lerExportacao(caminho) {
  const bruto = readFileSync(caminho);
  // O ficheiro é gzip; aceita-se também o JSON já descomprimido, para os testes.
  const texto = (bruto[0] === 0x1f && bruto[1] === 0x8b ? gunzipSync(bruto) : bruto).toString('utf8');
  const linhas = texto.split('\n').filter((l) => l.trim() !== '');
  if (linhas.length === 0) throw new Error('exportação vazia');

  let meta = null;
  const tabelas = new Map();
  let actual = null;
  linhas.forEach((linha, i) => {
    let obj;
    try {
      obj = JSON.parse(linha);
    } catch {
      throw new Error(`linha ${i + 1} não é JSON`);
    }
    if (i === 0) {
      if (obj?.formato !== 'kigest-exportacao') throw new Error('não é uma exportação do KiGest');
      meta = obj;
      return;
    }
    if (Array.isArray(obj)) {
      if (!actual) throw new Error(`linha ${i + 1}: registo fora de uma tabela`);
      actual.registos.push(Object.fromEntries(actual.colunas.map((c, n) => [c, obj[n] ?? null])));
      return;
    }
    if (obj?.tipo === 'TABELA' || obj?.tipo === 'VISTA') {
      actual = { nome: obj.tabela, tipo: obj.tipo, colunas: obj.colunas ?? [], registos: [] };
      tabelas.set(obj.tabela, actual);
      return;
    }
    if (obj?.fim) {
      // O fecho diz quantos registos deviam ter vindo: se não bate, a exportação ficou a meio.
      const t = tabelas.get(obj.fim);
      if (t && t.registos.length !== obj.registos) {
        throw new Error(`${obj.fim}: vieram ${t.registos.length} registos e o fecho diz ${obj.registos}`);
      }
      actual = null;
    }
  });
  if (!meta) throw new Error('exportação sem cabeçalho');
  return { meta, tabelas };
}

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// O código de barras serve de chave entre os dois catálogos quando tem os 13 dígitos de um
// EAN-13. Começado em 978/979 é o ISBN do livro; começado em 2 é um código interno que a loja
// inventou para um produto sem código de fábrica (cartões, lenços) e que só existe no KiGest.
export function codigoEan(codigo) {
  const d = texto(codigo).replace(/\D/g, '');
  return d.length === 13 ? d : '';
}
export const eanInterno = (ean) => ean.startsWith('2');

// Produto, preço e existência — nada mais. Preco1 é o preço de venda ao público (os rows da
// exportação de 2026-11-12 têm Idtaxa 0 e Preco1Taxa igual a Preco1: preço final, sem IVA por
// cima). Preco2..4 são tabelas alternativas e estão a zero em todo o catálogo.
export function artigos(exportacao, { armazem = ARMAZEM_LOJA } = {}) {
  const tArt = exportacao.tabelas.get('tbArtigos');
  if (!tArt) throw new Error('a exportação não traz a tabela tbArtigos');
  const porArtigo = new Map();
  for (const s of exportacao.tabelas.get('tbArtigosStock')?.registos ?? []) {
    if (numero(s.IdArmazem) !== armazem) continue;
    porArtigo.set(numero(s.IdArtigo), s);
  }
  const familias = new Map(
    (exportacao.tabelas.get('tbArtigosSubFamilia')?.registos ?? []).map((f) => [numero(f.Id), texto(f.Descricao)]),
  );
  return tArt.registos.map((a) => {
    const s = porArtigo.get(numero(a.IdArtigo)) ?? {};
    const referencia = texto(a.Referencia);
    return {
      id: numero(a.IdArtigo),
      referencia,
      // A chave que o site guarda. Um artigo da exportação de 2026-11-12 está sem referência
      // («ADVENTISMO»); para esses serve o IdArtigo, que é a chave primária da tabela e não
      // muda. Se mais tarde lhe derem uma referência no KiGest, a ligação quebra e o artigo
      // volta a entrar como novo — o relatório di-lo.
      ref: referencia || `id-${numero(a.IdArtigo)}`,
      descricao: texto(a.Descricao),
      ean: codigoEan(a.CoBar),
      codigoBarras: texto(a.CoBar),
      preco: numero(a.Preco1),
      // QtdExistente é a contagem do armazém; QtdStock em tbArtigos é a mesma coisa guardada
      // em duplicado e nem sempre acompanha, por isso só serve de recurso.
      stock: s.QtdExistente == null ? numero(a.QtdStock) : numero(s.QtdExistente),
      subfamilia: familias.get(numero(a.IdSubFamilia)) ?? '',
      descontinuado: numero(a.Descontinuado) === 1 || texto(a.Bloqueio) === '1',
      ultimaSaida: texto(s.UltimaSaida) || '',
    };
  });
}
