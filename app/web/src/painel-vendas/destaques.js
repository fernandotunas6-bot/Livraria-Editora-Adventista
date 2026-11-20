// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Os mais vendidos dos vídeos: o que o site vendeu (public.produtos_mais_vendidos) e o que se
 * lançou à mão (public.vendas_produtos), por loja, por mês e no ano — e somados para a rede.
 * Puro: o ecrã busca os dados, aqui só se decide e se soma (testado em destaques.test.js).
 *
 * Regras:
 *  · Para uma loja e um mês, se há lançamentos à mão para esse mês, valem esses (são as vendas do
 *    balcão, que o site não vê); senão, as encomendas do site.
 *  · Para o ano de uma loja, se há lançamentos à mão para o ano inteiro (mês vazio), valem esses;
 *    senão, a soma dos 12 meses escolhidos pela regra de cima.
 *  · A rede soma as lojas (e as encomendas do site sem loja, que não são de nenhuma).
 *  · Um produto é o mesmo pelo id do catálogo; sem id, pelo título sem maiúsculas.
 *  · Ordem: unidades, depois valor, depois título.
 */

export const MAX_LISTA = 10;

const chaveDe = (r) => (r.book_id ? 'id:' + r.book_id : 'tt:' + String(r.titulo || '').trim().toLowerCase());
const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? 0 : Number(v));
const cents = (v) => Math.round(num(v) * 100);

// Os endereços do próprio site. As capas do catálogo estão em https://livrariaadventista.com/
// images/capas/… (o domínio antigo, que agora redirecciona para o .ao): o site não manda CORS e o
// vídeo não pode desenhar uma imagem de outra origem sem ele. Pelo caminho, são da mesma origem.
const HOSTS_PROPRIOS = /^(www\.)?livrariaadventista\.(ao|com)$|^livraria-editora-adventista-ben\.pages\.dev$/i;
export function enderecoProprio(u) {
  try {
    const x = new URL(u);
    if (HOSTS_PROPRIOS.test(x.hostname)) return x.pathname + x.search;
  } catch { /* não é um endereço completo */ }
  return u;
}

/** A capa de um produto: o endereço (do próprio site, pelo caminho), ou o ficheiro no bucket media (stock_books/<id>/<ficheiro>). */
export function capaDe(r, mediaUrl) {
  const c = String(r?.capa || '').trim();
  if (/^\/[^/]/.test(c)) return c;
  if (/^https?:\/\//i.test(c)) return enderecoProprio(c);
  if (r?.capa_ficheiro && r?.book_id && typeof mediaUrl === 'function') return mediaUrl('stock_books', r.book_id, r.capa_ficheiro);
  return '';
}

/** Soma listas de produtos por produto e ordena. */
export function somar(listas, n = MAX_LISTA) {
  const m = new Map();
  for (const lista of listas) {
    for (const r of lista || []) {
      const k = r.chave || chaveDe(r);
      const a = m.get(k) || { chave: k, book_id: r.book_id || null, titulo: r.titulo || 'Produto', codigo: r.codigo || '', capa: r.capa || '', unidades: 0, valorC: 0, temValor: false, encomendas: 0, origens: new Set(), lojas: new Set() };
      a.unidades += num(r.unidades);
      if (r.valor != null && r.valor !== '') { a.valorC += cents(r.valor); a.temValor = true; }
      a.encomendas += num(r.encomendas);
      if (!a.capa && r.capa) a.capa = r.capa;
      if (r.origem) a.origens.add(r.origem);
      (r.lojas || (r.loja_id ? [r.loja_id] : [])).forEach((l) => a.lojas.add(l));
      m.set(k, a);
    }
  }
  return [...m.values()]
    .map((a) => ({
      chave: a.chave, book_id: a.book_id, titulo: a.titulo, codigo: a.codigo, capa: a.capa,
      unidades: Math.round(a.unidades * 100) / 100,
      valor: a.temValor ? a.valorC / 100 : null,
      encomendas: a.encomendas,
      origem: a.origens.size > 1 ? 'misto' : [...a.origens][0] || 'sistema',
      lojas: [...a.lojas],
    }))
    .filter((a) => a.unidades > 0 || (a.valor || 0) > 0)
    .sort((x, y) => y.unidades - x.unidades || (y.valor || 0) - (x.valor || 0) || x.titulo.localeCompare(y.titulo, 'pt'))
    .slice(0, n);
}

/**
 * sistema = linhas de produtos_mais_vendidos (loja_id, mes, book_id, titulo, codigo, capa,
 * capa_ficheiro, unidades, valor, encomendas); manual = linhas de vendas_produtos do ano (loja_id,
 * mes | null, book_id, titulo, unidades, valor); capas = { [book_id]: url } para os lançamentos à
 * mão; mediaUrl = a função que monta o endereço de um ficheiro do bucket media.
 *
 * Devolve { porLoja: { [id]: { ano, meses[12], origemAno } }, rede: { ano, meses[12] }, temDados }.
 */
export function buildDestaques({ sistema = [], manual = [], capas = {}, mediaUrl = null } = {}) {
  const sis = sistema.map((r) => ({ ...r, origem: 'sistema', capa: capaDe(r, mediaUrl), chave: chaveDe(r) }));
  const man = manual.map((r) => ({ ...r, origem: 'manual', capa: (r.book_id && capas[r.book_id]) || '', chave: chaveDe(r), encomendas: 0 }));
  const lojaIds = [...new Set([...sis.map((r) => r.loja_id), ...man.map((r) => r.loja_id)].filter(Boolean))];

  const porLoja = {};
  for (const id of lojaIds) {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const m = man.filter((r) => r.loja_id === id && Number(r.mes) === i + 1);
      const fonte = m.length ? m : sis.filter((r) => r.loja_id === id && Number(r.mes) === i + 1);
      return somar([fonte]);
    });
    const anoManual = man.filter((r) => r.loja_id === id && (r.mes == null || r.mes === ''));
    const ano = anoManual.length ? somar([anoManual]) : somar(meses.map((l) => l.map((x) => ({ ...x, lojas: [id] }))));
    porLoja[id] = { ano, meses, origemAno: anoManual.length ? 'manual' : (ano[0]?.origem || null) };
  }

  // As encomendas do site sem loja entram só na rede.
  const semLoja = Array.from({ length: 12 }, (_, i) => somar([sis.filter((r) => !r.loja_id && Number(r.mes) === i + 1)]));
  const redeMeses = Array.from({ length: 12 }, (_, i) => somar([
    ...lojaIds.map((id) => porLoja[id].meses[i].map((x) => ({ ...x, lojas: [id] }))),
    semLoja[i],
  ]));
  const redeAno = somar([...lojaIds.map((id) => porLoja[id].ano.map((x) => ({ ...x, lojas: [id] }))), ...semLoja]);

  return {
    porLoja,
    rede: { ano: redeAno, meses: redeMeses },
    temDados: redeAno.length > 0,
  };
}

/**
 * O destaque de um âmbito (uma loja ou a rede): o primeiro do ano, a sua quota nas unidades do
 * top, o mês em que mais vendeu e quantos meses foi o mais vendido.
 */
export function destaqueDe(ambito) {
  if (!ambito || !ambito.ano || !ambito.ano.length) return null;
  const top = ambito.ano[0];
  const totalUnid = ambito.ano.reduce((s, r) => s + r.unidades, 0);
  let melhorMes = null;
  let melhorUnid = 0;
  let mesesNoTopo = 0;
  (ambito.meses || []).forEach((lista, i) => {
    const r = lista.find((x) => x.chave === top.chave);
    if (r && r.unidades > melhorUnid) { melhorUnid = r.unidades; melhorMes = i; }
    if (lista[0] && lista[0].chave === top.chave) mesesNoTopo++;
  });
  return { ...top, pesoTop: totalUnid ? top.unidades / totalUnid : null, melhorMes, melhorUnid, mesesNoTopo };
}
