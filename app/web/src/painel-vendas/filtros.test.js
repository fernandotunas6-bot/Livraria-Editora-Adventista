import { describe, expect, it } from 'vitest';
import { buildYearModel } from './modelo';
import { buildConsolidado } from './consolidado';
import { FILTRO_VAZIO, filtroActivo, mesesDoPeriodo, normalizarFiltro, recortarConsolidado, recortarModelo, rotuloFiltro, rotuloMeses } from './filtros';

const H25 = [218675, 189500, 743550, 1053650, 1018225, 551910, 211650, 2904902, 430902, 2623345, 911316, 1101450];
const H26 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null];
const M = buildYearModel({ 2025: { meses: H25 }, 2026: { meses: H26, mes_em_curso: 10, meta_anual: 48000000 } }, 2026, 2025);

describe('períodos', () => {
  it('trimestres, semestres, até ao último mês e personalizado', () => {
    expect(mesesDoPeriodo({ periodo: 'ano' })).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(mesesDoPeriodo({ periodo: 't2' })).toEqual([3, 4, 5]);
    expect(mesesDoPeriodo({ periodo: 's2' })).toEqual([6, 7, 8, 9, 10, 11]);
    expect(mesesDoPeriodo({ periodo: 'ate' }, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(mesesDoPeriodo({ periodo: 'pers', de: 2, ate: 4 })).toEqual([2, 3, 4]);
    // De e até trocados endireitam-se; valores fora de 0–11 voltam ao ano.
    expect(mesesDoPeriodo({ periodo: 'pers', de: 7, ate: 5 })).toEqual([5, 6, 7]);
    expect(normalizarFiltro({ periodo: 'xpto', de: 40, soFechados: 'sim' })).toEqual({ ...FILTRO_VAZIO, soFechados: true });
  });

  it('rótulos e se o filtro está activo', () => {
    expect(rotuloMeses([0, 1, 2])).toBe('Jan–Mar');
    expect(rotuloMeses([4])).toBe('Mai');
    expect(rotuloFiltro({ periodo: 't1', soFechados: true, lojas: ['a', 'b'] }, { nLojas: 3 })).toBe('1.º trimestre (Jan–Mar) · só meses fechados · 2 de 3 lojas');
    expect(rotuloFiltro({ periodo: 'pers', de: 3, ate: 5 })).toBe('Abr–Jun');
    expect(rotuloFiltro(FILTRO_VAZIO)).toBe('');
    expect(filtroActivo(FILTRO_VAZIO)).toBe(false);
    expect(filtroActivo({ periodo: 'ano', lojas: ['a', 'b', 'c'] }, 3)).toBe(false);
    expect(filtroActivo({ periodo: 'ano', lojas: ['a'] }, 3)).toBe(true);
    expect(filtroActivo({ soFechados: true })).toBe(true);
  });
});

describe('recortarModelo', () => {
  it('o ano inteiro dá os mesmos totais do modelo', () => {
    const R = recortarModelo(M, mesesDoPeriodo(FILTRO_VAZIO)).R;
    ['ytd1', 'ytd2', 'ytd2c', 'total1', 'fech2', 'media2', 'projeccao', 'cresc_ytd', 'nfech'].forEach((k) => expect(R[k]).toEqual(M.R[k]));
    expect(R.melhor.mes).toBe(M.R.melhor.mes);
  });

  it('1.º trimestre: vendas, comparação e médias só de Janeiro a Março', () => {
    const T = recortarModelo(M, mesesDoPeriodo({ periodo: 't1' }));
    expect(T.rows).toHaveLength(12);
    expect(T.rows.filter((r) => !r.fora).map((r) => r.mes)).toEqual(['Janeiro', 'Fevereiro', 'Março']);
    expect(T.R.ytd2).toBe(2171368 + 1976988 + 4956455);
    expect(T.R.ytd1).toBe(218675 + 189500 + 743550);
    expect(T.R.cresc_ytd).toBeCloseTo((9104811 / 1151725) - 1, 9);
    expect(T.R.media2).toBe(3034937);
    expect(T.R.melhor.mes).toBe('Março');
    expect(T.R.ultimo.mes).toBe('Março');
    expect(T.R.projeccao).toBe(9104811); // tudo fechado no período
    expect(T.meta).toBe(12000000); // 48 M × 3/12
    expect(T.rows[2].posicao).toBe(1);
    expect(T.rows[5].posicao).toBe(null);
    // O modelo original não muda.
    expect(M.rows[5].fora).toBeUndefined();
  });

  it('o último trimestre (Outubro em curso, Novembro e Dezembro por preencher): a projecção do período', () => {
    const T = recortarModelo(M, mesesDoPeriodo({ periodo: 't4' }));
    expect(T.R.ytd2).toBe(4908704); // só Outubro tem valor
    expect(T.R.nfech).toBe(0);
    // Nada fechado no período: a projecção é a estimativa dos três meses (Outubro, no mínimo, o registado).
    const proj = T.rows.filter((r) => !r.fora).reduce((s, r) => s + r.projMes, 0);
    expect(T.R.projeccao).toBeCloseTo(proj, 2);
    expect(T.rows[9].projMes).toBeGreaterThanOrEqual(4908704);
  });

  it('só meses fechados tira o mês em curso', () => {
    const MC = buildYearModel({ 2025: { meses: H25 }, 2026: { meses: [...H26.slice(0, 10), 1000000, null], mes_em_curso: 11 } }, 2026, 2025);
    const T = recortarModelo(MC, mesesDoPeriodo({ periodo: 't4' }), { soFechados: true });
    expect(T.rows.filter((r) => !r.fora).map((r) => r.mes)).toEqual(['Outubro']);
    expect(T.R.projeccao).toBe(4908704);
    expect(T.R.ytd2).toBe(4908704);
  });
});

describe('recortarConsolidado', () => {
  const L25 = [300000, 280000, 410000, 395000, 420000, 380000, 360000, 610000, 450000, 520000, 480000, 700000];
  const L26 = [420000, 390000, 560000, 510000, 600000, 470000, 530000, 820000, 640000, null, null, null];
  const lojas = [
    { id: 'h', name: 'Huambo', province: 'Huambo', active: true, years: { 2025: { meses: H25 }, 2026: { meses: H26 } } },
    { id: 'l', name: 'Lubango', province: 'Huíla', active: true, years: { 2025: { meses: L25 }, 2026: { meses: L26 } } },
    { id: 'c', name: 'Catumbela', province: 'Benguela', active: true, years: { 2026: { meses: [0, 0, 383770, null] } } },
  ];
  const c = buildConsolidado(lojas, 2026, 2025);

  it('o ano inteiro dá os totais do relatório conjunto', () => {
    const x = recortarConsolidado(c, mesesDoPeriodo(FILTRO_VAZIO));
    ['ytd1', 'ytd2', 'ytd2c', 'cresc_ytd', 'projeccao', 'lojasComparaveis'].forEach((k) => expect(x.total.R[k]).toEqual(c.total.R[k]));
    expect(x.lojas.map((l) => [l.id, l.posicao])).toEqual(c.lojas.map((l) => [l.id, l.posicao]));
  });

  it('1.º semestre: lojas comparáveis, quotas e posições do período', () => {
    const x = recortarConsolidado(c, mesesDoPeriodo({ periodo: 's1' }));
    const h = x.lojas.find((l) => l.id === 'h');
    const lu = x.lojas.find((l) => l.id === 'l');
    expect(h.M.R.ytd2).toBe(H26.slice(0, 6).reduce((s, v) => s + v, 0));
    expect(lu.M.R.ytd2).toBe(L26.slice(0, 6).reduce((s, v) => s + v, 0));
    // Catumbela não tem 2025: não entra no comparável da rede.
    expect(x.total.R.lojasComparaveis).toBe(2);
    expect(x.total.R.ytd1).toBe(H25.slice(0, 6).reduce((s, v) => s + v, 0) + L25.slice(0, 6).reduce((s, v) => s + v, 0));
    const soma = x.lojas.reduce((s, l) => s + (l.quota || 0), 0);
    expect(soma).toBeCloseTo(1, 9);
    expect(h.posicao).toBe(1);
    expect(x.filtro.rotulo).toBe('Jan–Jun');
  });
});
