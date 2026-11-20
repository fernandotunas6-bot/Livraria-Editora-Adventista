// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Filtros avançados dos relatórios (painel de cada loja e relatório conjunto): o período (ano,
 * trimestre, semestre, até ao último mês registado ou de um mês a outro), só os meses fechados e,
 * no conjunto, as lojas que entram.
 *
 * Não muda as contas do modelo (modelo.js e consolidado.js, já testados): recorta o modelo pronto.
 * As linhas ficam as 12 (os gráficos e o resto do ecrã contam com elas) e as que ficam de fora
 * levam `fora: true` — o ecrã esbate-as. Os totais (R) refazem-se só com os meses do período, com
 * as mesmas regras: comparam-se só os meses que existem nos dois anos, a média é a dos meses
 * fechados, a projecção soma o que está fechado e a estimativa dos meses por fechar do período, e a
 * meta passa a ser a parte do período (proporcional aos meses).
 *
 * Puro: sem DOM nem Supabase (testado em filtros.test.js).
 */
import { MESES_CURTOS, avgKz, fromC, growth, round2, sumKz, toC } from './modelo.js';

export const PERIODOS = {
  ano: 'Ano inteiro',
  t1: '1.º trimestre',
  t2: '2.º trimestre',
  t3: '3.º trimestre',
  t4: '4.º trimestre',
  s1: '1.º semestre',
  s2: '2.º semestre',
  ate: 'Até ao último mês registado',
  pers: 'Personalizado (de … até …)',
};

const INTERVALOS = { t1: [0, 2], t2: [3, 5], t3: [6, 8], t4: [9, 11], s1: [0, 5], s2: [6, 11] };

export const FILTRO_VAZIO = Object.freeze({ periodo: 'ano', de: 0, ate: 11, soFechados: false, lojas: null });

/** Um filtro válido a partir do que vier (do localStorage, por exemplo). */
export function normalizarFiltro(f) {
  const x = { ...FILTRO_VAZIO, ...(f && typeof f === 'object' ? f : {}) };
  if (!PERIODOS[x.periodo]) x.periodo = 'ano';
  const mes = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 11 ? Number(v) : d);
  x.de = mes(x.de, 0);
  x.ate = mes(x.ate, 11);
  if (x.de > x.ate) [x.de, x.ate] = [x.ate, x.de];
  x.soFechados = !!x.soFechados;
  x.lojas = Array.isArray(x.lojas) ? x.lojas.map(String) : null;
  return x;
}

/** Os meses (0–11) do período. `ultimo` = o índice do último mês registado (para «até ao último»). */
export function mesesDoPeriodo(f, ultimo = 11) {
  const x = normalizarFiltro(f);
  let [a, b] = [0, 11];
  if (INTERVALOS[x.periodo]) [a, b] = INTERVALOS[x.periodo];
  else if (x.periodo === 'ate') b = ultimo != null && ultimo >= 0 ? ultimo : 11;
  else if (x.periodo === 'pers') [a, b] = [x.de, x.ate];
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** Se o filtro muda alguma coisa (para mostrar «Limpar filtros» e o resumo). */
export function filtroActivo(f, nLojas = null) {
  const x = normalizarFiltro(f);
  const lojas = x.lojas != null && (nLojas == null || x.lojas.length < nLojas);
  return x.periodo !== 'ano' || x.soFechados || lojas;
}

/** «Jan–Mar», «Mai» ou «Jan–Dez». */
export function rotuloMeses(meses) {
  if (!meses || !meses.length) return '—';
  const a = meses[0];
  const b = meses[meses.length - 1];
  return a === b ? MESES_CURTOS[a] : `${MESES_CURTOS[a]}–${MESES_CURTOS[b]}`;
}

/** O resumo do filtro, para o ecrã e as exportações: «1.º trimestre (Jan–Mar) · só meses fechados · 2 de 3 lojas». */
export function rotuloFiltro(f, { ultimo = 11, nLojas = null } = {}) {
  const x = normalizarFiltro(f);
  const meses = mesesDoPeriodo(x, ultimo);
  const partes = [];
  if (x.periodo === 'pers') partes.push(rotuloMeses(meses));
  else if (x.periodo !== 'ano') partes.push(`${PERIODOS[x.periodo]} (${rotuloMeses(meses)})`);
  if (x.soFechados) partes.push('só meses fechados');
  if (x.lojas != null && nLojas != null && x.lojas.length < nLojas) partes.push(`${x.lojas.length} de ${nLojas} lojas`);
  return partes.join(' · ');
}

/**
 * O modelo de um ano (buildYearModel) recortado aos `meses`. `soFechados`: os meses em curso e
 * por preencher também ficam de fora. `comparaveis`: no conjunto, o ano anterior comparável de
 * cada mês vem de `v1c`/`v2c` (só as lojas com o mês nos dois anos).
 */
export function recortarModelo(M, meses, { soFechados = false, comparaveis = false } = {}) {
  const dentro = new Set(meses);
  const rows = M.rows.map((r) => ({ ...r, fora: !dentro.has(r.i) || (soFechados && r.estado !== 'Fechado') }));
  const inP = rows.filter((r) => !r.fora);
  const fech = inP.filter((r) => r.estado === 'Fechado');
  const com2 = inP.filter((r) => r.v2 != null);
  const naoF = inP.filter((r) => r.estado !== 'Fechado');
  const temB = inP.filter((r) => r.v1 != null);

  let ytd1;
  let ytd2c;
  if (comparaveis) {
    const pares = com2.filter((r) => r.v1c != null);
    ytd1 = pares.length ? sumKz(pares, 'v1c') : null;
    ytd2c = sumKz(pares, 'v2c');
  } else {
    const pares = com2.filter((r) => r.v1 != null);
    ytd1 = pares.length ? sumKz(pares, 'v1') : null;
    ytd2c = sumKz(pares, 'v2');
  }
  const ytd2 = sumKz(com2, 'v2');
  const fechC = fech.filter((r) => r.v1 != null);
  const fech2 = sumKz(fech, 'v2');
  const fech2c = sumKz(fechC, 'v2');
  const fech1 = fechC.length ? sumKz(fechC, 'v1') : null;
  const media2 = avgKz(fech2, fech.length);
  const total1 = temB.length ? sumKz(temB, 'v1') : null;
  const media1 = avgKz(total1, temB.length);
  const melhor = fech.length ? fech.reduce((b, r) => (r.v2 > b.v2 ? r : b), fech[0]) : null;
  const pior = fech.length ? fech.reduce((b, r) => (r.v2 < b.v2 ? r : b), fech[0]) : null;
  const projeccao = !naoF.length
    ? fech2
    : (naoF.every((r) => r.projMes != null) ? fromC(toC(fech2) + naoF.reduce((t, r) => t + toC(r.projMes), 0)) : null);
  const meta = M.meta ? round2((M.meta * inP.length) / 12) : null;

  let acc = 0;
  let ultrapassa = null;
  if (total1) {
    for (const r of com2) { acc += toC(r.v2); if (!ultrapassa && acc > toC(total1)) ultrapassa = r.mes; }
  }
  const ordem = [...fech].sort((a, b) => b.v2 - a.v2);
  rows.forEach((r) => {
    r.peso = !r.fora && r.v2 != null && ytd2 ? r.v2 / ytd2 : null;
    const pos = ordem.indexOf(r);
    r.posicao = pos < 0 ? null : pos + 1;
    r.deMeses = ordem.length;
  });

  return {
    ...M,
    rows,
    fech,
    com2,
    meta,
    filtro: { meses: [...meses], soFechados, rotulo: rotuloMeses(meses) },
    R: {
      ...M.R,
      total1, ytd1, ytd2, ytd2c,
      dif_ytd: ytd1 != null ? fromC(toC(ytd2c) - toC(ytd1)) : null,
      cresc_ytd: growth(ytd2c, ytd1),
      fech1, fech2, fech2c, cresc_fech: growth(fech2c, fech1),
      media1, media2, cresc_media: growth(media2, media1),
      melhor, pior, projeccao, cresc_proj: growth(projeccao, total1),
      progresso: projeccao ? ytd2 / projeccao : null,
      metaPct: meta ? ytd2 / meta : null,
      falta: projeccao != null ? fromC(Math.max(0, toC(projeccao) - toC(ytd2))) : null,
      metaFalta: meta != null ? fromC(Math.max(0, toC(meta) - toC(ytd2))) : null,
      ultrapassa,
      ultimo: com2.length ? com2[com2.length - 1] : null,
      nfech: fech.length,
      nregistados: com2.length,
      ultimoFech: fech.length ? fech[fech.length - 1] : null,
    },
  };
}

/**
 * O relatório conjunto (buildConsolidado) recortado aos `meses`: cada loja e a rede, com as regras
 * de consolidado.js — o crescimento da rede é o das lojas comparáveis, a projecção da rede é a soma
 * das projecções das lojas, e a quota e a posição de cada loja contam só o período.
 */
export function recortarConsolidado(c, meses, { soFechados = false } = {}) {
  const lojas = c.lojas.map((l) => ({ ...l, M: recortarModelo(l.M, meses, { soFechados }) }));
  const total = recortarModelo(c.total, meses, { soFechados, comparaveis: true });
  const comDados = lojas.filter((l) => l.temDados);
  const R = total.R;
  const comComp = lojas.filter((l) => l.M.R.ytd1 != null);
  R.ytd1 = comComp.length ? fromC(comComp.reduce((s, l) => s + toC(l.M.R.ytd1), 0)) : null;
  R.ytd2c = fromC(comComp.reduce((s, l) => s + toC(l.M.R.ytd2c), 0));
  R.dif_ytd = R.ytd1 != null ? fromC(toC(R.ytd2c) - toC(R.ytd1)) : null;
  R.cresc_ytd = growth(R.ytd2c, R.ytd1);
  R.lojasComparaveis = comComp.length;
  const projs = comDados.map((l) => l.M.R.projeccao);
  R.projeccao = comDados.length && projs.every((p) => p != null) ? fromC(projs.reduce((s, p) => s + toC(p), 0)) : null;
  R.cresc_proj = growth(R.projeccao, R.total1);
  R.progresso = R.projeccao ? R.ytd2 / R.projeccao : null;
  R.falta = R.projeccao != null ? fromC(Math.max(0, toC(R.projeccao) - toC(R.ytd2))) : null;
  total.crit = c.total.crit;
  total.critTxt = c.total.critTxt;
  const ordem = [...comDados].sort((a, b) => b.M.R.ytd2 - a.M.R.ytd2);
  lojas.forEach((l) => {
    l.quota = l.temDados && R.ytd2 ? l.M.R.ytd2 / R.ytd2 : null;
    const pos = ordem.indexOf(l);
    l.posicao = pos < 0 ? null : pos + 1;
  });
  return {
    ...c,
    lojas,
    total,
    filtro: total.filtro,
    melhorLoja: ordem[0] || null,
    maiorCrescimento: [...comDados].filter((l) => l.M.R.cresc_ytd != null).sort((a, b) => b.M.R.cresc_ytd - a.M.R.cresc_ytd)[0] || null,
  };
}
