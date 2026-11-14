/**
 * O relatório conjunto: as vendas de todas as livrarias, somadas mês a mês, e cada loja ao lado
 * das outras. Puro (sem DOM nem Supabase): o ecrã (consolidado-ui.js), as exportações e o vídeo
 * (video.js) leem todos o que `buildConsolidado` devolve, e os testes (consolidado.test.js)
 * conferem-no sem montar nada.
 *
 * As regras da soma:
 *  · Cada loja é calculada pelo mesmo modelo do painel de uma loja (modelo.js): os mesmos meses
 *    fechados, a mesma média, a mesma projecção, com o critério que cada loja escolheu.
 *  · O mês da rede é a soma das lojas que o registaram. Só está FECHADO quando todas as lojas com
 *    vendas no ano o têm fechado; se faltar alguma, fica EM CURSO (parcial) — e a loja que falta
 *    aparece nos «meses por registar». Assim a média da rede usa só meses completos.
 *  · A projecção da rede é a soma das projecções das lojas (cada uma pelo seu critério), e a
 *    estimativa de um mês por fechar é a soma do que cada loja tem ou estima para esse mês.
 *  · O crescimento da rede é o das LOJAS COMPARÁVEIS: em cada mês e no acumulado, só entram as
 *    lojas com valor nos dois anos. Sem isto, uma loja nova (sem o ano anterior) inflacionava o
 *    crescimento, e um mês que uma loja ainda não lançou comparava-se com o mesmo mês completo
 *    do ano anterior (Outubro de 2026 com 2 lojas contra Outubro de 2025 com 3 dava −48,7%).
 *    O total do ano anterior (R.total1) continua a ser o da rede inteira.
 *  · A meta da rede é a soma das metas, só quando todas as lojas com vendas têm meta.
 *  · Uma loja sem vendas no ano nem no ano de comparação não entra nas somas; se está activa,
 *    aparece como «sem registos» nos meses por registar.
 */
import { MESES, buildYearModel, fromC, growth, mesesDoAno, toC } from './modelo.js';

/** As cores das lojas, no ecrã e no vídeo. Cada loja fica com a sua pela ordem das lojas (não pelo ranking). */
export const CORES_LOJAS = ['#E0679A', '#22A6A9', '#F2B705', '#7C83F2', '#3DBA82', '#F28C38', '#5BB6F2', '#C77DDB', '#9AA8BC', '#E86060'];

/** Os anos que alguma loja tem, do mais antigo ao mais recente. */
export function anosDisponiveis(lojas) {
  const set = new Set();
  (lojas || []).forEach((l) => Object.keys(l.years || {}).forEach((a) => { if (isFinite(Number(a))) set.add(Number(a)); }));
  return [...set].sort((a, b) => a - b);
}

const somaOuNulo = (vals) => (vals.some((v) => v != null) ? fromC(vals.reduce((s, v) => s + toC(v), 0)) : null);

/**
 * `lojas` = [{ id, name, province, active, fotos?, years: { [ano]: { meses, observacoes, mes_em_curso, meta_anual, criterio, fonte, actualizado } } }]
 * pela ordem em que devem aparecer (a do separador Lojas). `fotos` é a galeria da loja (modo apresentação).
 */
export function buildConsolidado(lojas, ano, comp) {
  const todas = (lojas || []).map((l, idx) => {
    const M = buildYearModel(l.years || {}, ano, comp);
    const temDados = M.com2.length > 0;
    const temComp = M.comp != null && M.rows.some((r) => r.v1 != null);
    const Y = (l.years || {})[ano] || null;
    return {
      id: l.id, nome: l.name || 'Loja', provincia: l.province || '', activa: l.active !== false, fotos: l.fotos || [],
      cor: CORES_LOJAS[idx % CORES_LOJAS.length], M, temDados, temComp,
      fonte: M.fonte, actualizado: Y ? Y.actualizado || null : null, temRegisto: !!Y,
    };
  });
  // Entram as lojas com vendas num dos dois anos e as activas (estas, mesmo sem nada, para se ver que faltam).
  const lista = todas.filter((l) => l.temDados || l.temComp || l.activa);
  const comDados = lista.filter((l) => l.temDados);
  const compExiste = comp != null && lista.some((l) => l.temComp);

  // Os meses da rede: somas, meses parciais, observações juntas.
  const somaA = MESES.map((_, i) => somaOuNulo(comDados.map((l) => l.M.rows[i].v2)));
  const somaB = MESES.map((_, i) => somaOuNulo(lista.map((l) => l.M.rows[i].v1)));
  const parciais = [];
  MESES.forEach((_, i) => {
    if (somaA[i] != null && comDados.some((l) => l.M.rows[i].estado !== 'Fechado')) parciais.push(i + 1);
  });
  const observacoes = MESES.map((_, i) => comDados
    .filter((l) => l.M.rows[i].obs)
    .map((l) => `${l.nome}: ${l.M.rows[i].obs}`)
    .join(' · '));
  const metas = comDados.map((l) => l.M.meta);
  const meta = comDados.length && metas.every((m) => m) ? fromC(metas.reduce((s, m) => s + toC(m), 0)) : null;

  const anos = { [ano]: { meses: somaA, observacoes, parciais, meta_anual: meta, criterio: 'media', fonte: 'Soma das livrarias' } };
  if (compExiste) anos[comp] = { meses: somaB };
  const total = buildYearModel(anos, ano, compExiste ? comp : null);

  // A estimativa e a projecção da rede: a soma do que cada loja tem ou estima.
  total.rows.forEach((r) => {
    if (r.estado === 'Fechado') return;
    const partes = comDados.map((l) => {
      const q = l.M.rows[r.i];
      return q.estado === 'Fechado' ? q.v2 : q.projMes;
    });
    r.projMes = partes.length && partes.every((v) => v != null) ? fromC(partes.reduce((s, v) => s + toC(v), 0)) : null;
    r.est = r.v2 == null ? r.projMes : null;
  });
  // Lojas comparáveis, mês a mês: o ano anterior só das lojas que já têm o mês neste ano.
  total.rows.forEach((r) => {
    const pares = lista.filter((l) => l.M.rows[r.i].v2 != null && l.M.rows[r.i].v1 != null);
    r.v1c = pares.length ? fromC(pares.reduce((s, l) => s + toC(l.M.rows[r.i].v1), 0)) : null;
    r.v2c = pares.length ? fromC(pares.reduce((s, l) => s + toC(l.M.rows[r.i].v2), 0)) : null;
    r.dif = r.v1c != null ? fromC(toC(r.v2c) - toC(r.v1c)) : null;
    r.cresc = r.v1c ? r.v2c / r.v1c - 1 : null;
  });
  const projs = comDados.map((l) => l.M.R.projeccao);
  const R = total.R;
  // E no acumulado: a soma do período comparável de cada loja.
  const comComp = lista.filter((l) => l.M.R.ytd1 != null);
  R.ytd1 = comComp.length ? fromC(comComp.reduce((s, l) => s + toC(l.M.R.ytd1), 0)) : null;
  R.ytd2c = fromC(comComp.reduce((s, l) => s + toC(l.M.R.ytd2c), 0));
  R.dif_ytd = R.ytd1 != null ? fromC(toC(R.ytd2c) - toC(R.ytd1)) : null;
  R.cresc_ytd = growth(R.ytd2c, R.ytd1);
  R.lojasComparaveis = comComp.length;
  R.projeccao = comDados.length && projs.every((p) => p != null) ? fromC(projs.reduce((s, p) => s + toC(p), 0)) : null;
  R.cresc_proj = growth(R.projeccao, R.total1);
  R.progresso = R.projeccao ? R.ytd2 / R.projeccao : null;
  R.falta = R.projeccao != null ? fromC(Math.max(0, toC(R.projeccao) - toC(R.ytd2))) : null;
  total.crit = 'lojas';
  total.critTxt = 'soma das projecções de cada loja';

  // Cada loja: quota na rede e posição.
  const ordem = [...comDados].sort((a, b) => b.M.R.ytd2 - a.M.R.ytd2);
  lista.forEach((l) => {
    l.quota = l.temDados && R.ytd2 ? l.M.R.ytd2 / R.ytd2 : null;
    const pos = ordem.indexOf(l);
    l.posicao = pos < 0 ? null : pos + 1;
  });

  // Meses por registar: até ao último mês que alguma loja já registou.
  let ultimo = -1;
  somaA.forEach((v, i) => { if (v != null) ultimo = i; });
  const pendentes = [];
  if (ultimo >= 0) {
    lista.forEach((l) => {
      if (!l.temDados && !l.activa) return;
      const faltam = l.M.rows.slice(0, ultimo + 1).filter((r) => r.v2 == null).map((r) => r.mes);
      l.atrasados = faltam.length ? faltam : null;
      if (faltam.length) pendentes.push({ id: l.id, nome: l.nome, meses: l.temDados ? faltam : ['sem registos em ' + ano], semRegistos: !l.temDados });
    });
  }

  // Cada mês, loja a loja.
  const meses = total.rows.map((r) => ({
    i: r.i,
    mes: r.mes,
    registadas: comDados.filter((l) => l.M.rows[r.i].v2 != null).length,
    de: comDados.length,
    porLoja: comDados.map((l) => {
      const q = l.M.rows[r.i];
      return { id: l.id, nome: l.nome, cor: l.cor, v2: q.v2, v1: q.v1, est: q.est, estado: q.estado, dif: q.dif, cresc: q.cresc, obs: q.obs, quota: q.v2 != null && r.v2 ? q.v2 / r.v2 : null };
    }),
  }));

  return {
    ano, comp: compExiste ? comp : null, lojas: lista, total, meses, pendentes,
    ultimoMesRede: ultimo >= 0 ? MESES[ultimo] : null,
    nComDados: comDados.length,
    melhorLoja: ordem[0] || null,
    maiorCrescimento: [...comDados].filter((l) => l.M.R.cresc_ytd != null).sort((a, b) => b.M.R.cresc_ytd - a.M.R.cresc_ytd)[0] || null,
  };
}

/**
 * Os diapositivos do modo apresentação de todas as livrarias: a capa, as livrarias (uma fotografia
 * de cada), o resumo da rede, o ranking (com mais de uma loja), um por livraria com vendas, os mais
 * vendidos da rede (se os houver), o quadro e a perspectiva. Com o filtro de lojas, só as escolhidas.
 */
export function diapositivosConjunto(c, { maisVendidos = 0 } = {}) {
  const comDados = (c && c.lojas ? c.lojas : []).filter((l) => l.temDados);
  const lista = [{ k: 'capa' }];
  if (c && c.lojas && c.lojas.length) lista.push({ k: 'livrarias' });
  lista.push({ k: 'resumo' });
  if (comDados.length > 1) lista.push({ k: 'ranking' });
  [...comDados].sort((a, b) => (a.posicao || 99) - (b.posicao || 99)).forEach((l) => lista.push({ k: 'loja', l }));
  if (maisVendidos) lista.push({ k: 'mv' });
  lista.push({ k: 'quadro' }, { k: 'persp' });
  return lista;
}

/** Linhas de todas as lojas e todos os anos (CSV e a folha «Todos os anos»). */
export function linhasTodosOsAnos(lojas) {
  const rows = [['Loja', 'Província', 'Ano', 'Mês nº', 'Mês', 'Vendas (Kz)', 'Estado', 'Observação']];
  (lojas || []).forEach((l) => {
    Object.keys(l.years || {}).map(Number).sort((a, b) => a - b).forEach((ano) => {
      const Y = l.years[ano];
      const m = mesesDoAno(Y);
      MESES.forEach((mes, i) => {
        const v = m[i];
        const estado = v == null ? 'Por preencher' : Number(Y.mes_em_curso) === i + 1 ? 'Em curso' : 'Fechado';
        rows.push([l.name, l.province || '', ano, i + 1, mes, v, estado, Array.isArray(Y.observacoes) ? (Y.observacoes[i] || '') : '']);
      });
    });
  });
  return rows;
}

/** A matriz lojas × meses do ano (a folha «Lojas × meses» e o quadro do ecrã). */
export function matrizLojasMeses(c) {
  const head = ['Loja', ...MESES, 'Total ' + c.ano, c.comp != null ? 'Comparável ' + c.comp : 'Comparação', 'Crescimento', 'Quota', 'Projecção'];
  const rows = [head];
  c.lojas.forEach((l) => {
    rows.push([l.nome, ...l.M.rows.map((r) => r.v2), l.M.R.ytd2, l.M.R.ytd1, l.M.R.cresc_ytd, l.quota, l.M.R.projeccao]);
  });
  const R = c.total.R;
  rows.push(['Total da rede', ...c.total.rows.map((r) => r.v2), R.ytd2, R.ytd1, R.cresc_ytd, c.nComDados ? 1 : null, R.projeccao]);
  if (c.comp != null) rows.push(['Rede em ' + c.comp, ...c.total.rows.map((r) => r.v1), R.total1, null, null, null, null]);
  return rows;
}

/**
 * O que gravar quando se aplicam as vendas do sistema a uma loja.
 * `atual` = os 12 meses gravados; `sistema` = os 12 meses do sistema; `modo` = 'vazios' (só os meses
 * vazios) ou 'todos' (todos os meses com vendas no sistema). Devolve os 12 meses novos e o que mudou.
 */
export function aplicarSistema(atual, sistema, modo = 'vazios') {
  const novos = [];
  const mudou = [];
  for (let i = 0; i < 12; i++) {
    const a = atual && atual[i] != null ? Number(atual[i]) : null;
    const s = sistema && sistema[i] != null && Number(sistema[i]) > 0 ? Math.round(Number(sistema[i]) * 100) / 100 : null;
    let v = a;
    if (s != null && (modo === 'todos' || a == null)) v = s;
    novos.push(v);
    if (v !== a) mudou.push({ i, mes: MESES[i], de: a, para: v });
  }
  return { meses: novos, mudou };
}
