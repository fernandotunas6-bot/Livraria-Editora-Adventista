/**
 * O cálculo do Painel de Vendas, num módulo puro: nada aqui toca no DOM, no Supabase ou no tempo.
 *
 * Vivia dentro de `mountPainel()` em painel.js, fechado no estado do ecrã. Saiu para aqui porque
 * passou a ter dois clientes — o painel de uma loja e o de todas as livrarias (consolidado.js) —
 * e os dois têm de dar exactamente os mesmos números: a mesma média, a mesma projecção, o mesmo
 * crescimento comparável. Sendo puro, também se testa (modelo.test.js) sem montar o painel.
 *
 * Toda a aritmética do dinheiro passa por cêntimos inteiros. Em Kwanzas, somar doze valores com
 * casas decimais em vírgula flutuante dava totais a terminar em 0,000000001 — e o total mostrado
 * deixava de bater com a soma das linhas (551 909,65 Kz era o caso que apareceu no relatório).
 */

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** O texto de cada critério de projecção, como aparece no ecrã, nos ficheiros e no vídeo. */
export const CRIT = {
  media: 'média dos meses fechados',
  tendencia: 'tendência face ao ano anterior',
  meta: 'meta anual',
};

/** Kz → cêntimos inteiros. Vazio conta zero (para somar); use `temValor` para distinguir. */
export const toC = (v) => (v == null || v === '' || !isFinite(Number(v)) ? 0 : Math.round(Number(v) * 100));
/** Cêntimos → Kz com duas casas, sem o lixo da vírgula flutuante. */
export const fromC = (c) => Math.round(c) / 100;
/** Soma em Kz de uma lista, pela chave ou função dada, passando por cêntimos. */
export const sumKz = (list, f) => fromC(list.reduce((s, r) => s + toC(typeof f === 'function' ? f(r) : r[f]), 0));
/** Média em Kz de um total por n parcelas (null quando não há parcelas). */
export const avgKz = (total, n) => (n ? fromC(toC(total) / n) : null);
/** Arredonda a duas casas, deixando passar o nulo. */
export const round2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
/** Crescimento de `a` face a `b` (null quando não dá para comparar). */
export const growth = (a, b) => ((a != null && b) ? a / b - 1 : null);

/** Os 12 meses de um registo de ano, sempre com 12 posições. */
export function mesesDoAno(Y) {
  const m = Y && Array.isArray(Y.meses) ? Y.meses : [];
  return Array.from({ length: 12 }, (_, i) => {
    const v = m[i];
    return (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v);
  });
}

/** Fechado / Em curso / Por preencher, pelas regras do painel (o mês em curso é o do registo). */
export function estadoDoMes(Y, i) {
  const v = mesesDoAno(Y)[i];
  if (v == null) return 'Por preencher';
  return Number(Y && Y.mes_em_curso) === i + 1 ? 'Em curso' : 'Fechado';
}

/**
 * O modelo de um ano de uma loja (ou de um conjunto já somado).
 *
 * `years` = { [ano]: { meses: [12], observacoes: [12], mes_em_curso, meta_anual, criterio, fonte } }
 * `ano` = o ano a mostrar; `comp` = o ano de comparação (ou null).
 *
 * Devolve `{ ano, comp, rows, fech, com2, crit, meta, R }`:
 *  · `rows[i]` = { i, mes, v1 (comparação), v2 (ano), est, projMes, dif, cresc, acum1, acum2, estado, obs }
 *  · `R` = os totais: ytd, períodos comparáveis, médias, melhor mês, projecção, meta, falta…
 */
export function buildYearModel(years, ano, comp) {
  const A = (years && years[ano]) || null;
  const B = (comp != null && years && years[comp]) || null;
  const curso = A && A.mes_em_curso ? Number(A.mes_em_curso) : null;
  // `parciais`: meses (1–12) que contam como em curso além do mês em curso. Só o consolidado os
  // usa: na rede, um mês que só parte das lojas registou ainda não está fechado.
  const parciais = A && Array.isArray(A.parciais) ? A.parciais.map(Number) : [];
  const mesesA = mesesDoAno(A);
  const mesesB = mesesDoAno(B);
  const rows = MESES.map((mes, i) => {
    const v2 = A ? mesesA[i] : null;
    const v1 = B ? mesesB[i] : null;
    const estado = v2 == null ? 'Por preencher' : (curso === i + 1 || parciais.includes(i + 1) ? 'Em curso' : 'Fechado');
    const obs = A && Array.isArray(A.observacoes) ? (A.observacoes[i] || '') : '';
    return { i, mes, v1, v2, estado, obs };
  });

  const fech = rows.filter((r) => r.estado === 'Fechado');
  const com2 = rows.filter((r) => r.v2 != null);
  const naoF = rows.filter((r) => r.estado !== 'Fechado');
  const media2 = avgKz(sumKz(fech, 'v2'), fech.length);
  const fechC = fech.filter((r) => r.v1 != null);
  const fech2 = sumKz(fech, 'v2');
  // O crescimento dos meses fechados compara só os meses que existem nos dois anos.
  const fech2c = sumKz(fechC, 'v2');
  const fech1 = fechC.length ? sumKz(fechC, 'v1') : null;
  const meta = A && A.meta_anual ? Number(A.meta_anual) : null;

  let crit = (A && A.criterio) || 'media';
  if (crit === 'meta' && !meta) crit = 'media';
  if (crit === 'tendencia' && !(B && fech1)) crit = 'media';
  const ratio = fech1 ? fech2c / fech1 : null;
  const metaRest = meta && naoF.length ? round2(Math.max(0, meta - fech2) / naoF.length) : null;

  rows.forEach((r) => {
    let e = null;
    if (r.estado !== 'Fechado') {
      if (crit === 'tendencia') e = r.v1 != null ? r.v1 * ratio : media2;
      else if (crit === 'meta') e = metaRest;
      else e = media2;
      // Mês em curso: o valor já registado é o mínimo garantido desse mês.
      if (r.estado === 'Em curso' && r.v2 != null) e = e == null ? r.v2 : Math.max(e, r.v2);
    }
    r.projMes = round2(e);
    r.est = r.v2 == null ? r.projMes : null;
    r.dif = (r.v2 != null && r.v1 != null) ? fromC(toC(r.v2) - toC(r.v1)) : null;
    r.cresc = (r.v2 != null && r.v1) ? r.v2 / r.v1 - 1 : null;
  });

  let a1 = 0;
  let a2 = 0;
  rows.forEach((r) => {
    a1 += toC(r.v1);
    r.acum1 = B ? fromC(a1) : null;
    if (r.v2 != null) { a2 += toC(r.v2); r.acum2 = fromC(a2); } else r.acum2 = null;
  });

  const temB = rows.filter((r) => r.v1 != null);
  const total1 = temB.length ? sumKz(temB, 'v1') : null;
  const comp1 = com2.filter((r) => r.v1 != null);
  const ytd2 = sumKz(com2, 'v2');
  const ytd1 = comp1.length ? sumKz(comp1, 'v1') : null;
  const ytd2c = sumKz(comp1, 'v2');
  const media1 = avgKz(total1, temB.length);
  const melhor = fech.length ? fech.reduce((b, r) => (r.v2 > b.v2 ? r : b), fech[0]) : null;
  const pior = fech.length ? fech.reduce((b, r) => (r.v2 < b.v2 ? r : b), fech[0]) : null;
  const projeccao = !naoF.length
    ? fech2
    : (naoF.every((r) => r.projMes != null) ? fromC(toC(fech2) + naoF.reduce((t, r) => t + toC(r.projMes), 0)) : null);

  let acc = 0;
  let ultrapassa = null;
  if (total1) {
    for (const r of com2) { acc += toC(r.v2); if (!ultrapassa && acc > toC(total1)) ultrapassa = r.mes; }
  }
  const ultimo = com2.length ? com2[com2.length - 1] : null;

  // O peso de cada mês no ano registado e a sua posição entre os meses fechados: dados que o
  // vídeo e o quadro mostram mês a mês, e que antes cada sítio calculava à sua maneira.
  const ordem = [...fech].sort((a, b) => b.v2 - a.v2);
  rows.forEach((r) => {
    r.peso = (r.v2 != null && ytd2) ? r.v2 / ytd2 : null;
    const pos = ordem.indexOf(r);
    r.posicao = pos < 0 ? null : pos + 1;
    r.deMeses = ordem.length;
  });

  return {
    ano, comp: B ? comp : null, rows, fech, com2, crit, critTxt: CRIT[crit], meta,
    fonte: (A && A.fonte) || '',
    R: {
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
      ultrapassa, ultimo,
      nfech: fech.length,
      nregistados: com2.length,
      ultimoFech: fech.length ? fech[fech.length - 1] : null,
    },
  };
}
