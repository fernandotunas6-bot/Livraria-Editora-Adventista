// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { aplicarSistema, anosDisponiveis, buildConsolidado, diapositivosConjunto, linhasTodosOsAnos, matrizLojasMeses } from './consolidado';
import { buildYearModel, toC } from './modelo';

const HUAMBO_2025 = [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 911316, 1101450];
const HUAMBO_2026 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 1332925, null, null];
// O Lubango ainda não registou Outubro de 2026.
const LUBANGO_2025 = [300000, 280000.5, 410000, 395000, 420000, 380000, 360000, 610000, 450000, 520000, 480000, 700000];
const LUBANGO_2026 = [420000, 390000, 560000.25, 510000, 600000, 470000, 530000, 820000, 640000, null, null, null];

const lojas = () => [
  { id: 'huambo000000001', name: 'Livraria do Huambo', province: 'Huambo', active: true, years: {
    2025: { meses: HUAMBO_2025, observacoes: Array(12).fill('') },
    2026: { meses: HUAMBO_2026, mes_em_curso: 11, observacoes: [...Array(9).fill(''), 'Valor parcial.', '', ''], fonte: 'Relatório Síntese 2025/26' },
  } },
  { id: 'lubango00000001', name: 'Livraria do Lubango', province: 'Huíla', active: true, years: {
    2025: { meses: LUBANGO_2025 },
    2026: { meses: LUBANGO_2026 },
  } },
  { id: 'catumbela000001', name: 'Livraria de Catumbela', province: 'Benguela', active: true, years: {} },
  { id: 'luanda000000001', name: 'Livraria de Luanda (fechada)', province: 'Luanda', active: false, years: {} },
];

describe('buildConsolidado', () => {
  const c = buildConsolidado(lojas(), 2026, 2025);

  it('entra quem tem vendas e quem está activo; a loja fechada sem vendas fica de fora', () => {
    expect(c.lojas.map((l) => l.nome)).toEqual(['Livraria do Huambo', 'Livraria do Lubango', 'Livraria de Catumbela']);
    expect(c.nComDados).toBe(2);
    expect(c.lojas[2].temDados).toBe(false);
  });

  it('cada loja tem o mesmo modelo que o painel dessa loja', () => {
    const hu = buildYearModel(lojas()[0].years, 2026, 2025);
    expect(c.lojas[0].M.R).toEqual(hu.R);
  });

  it('o total da rede é a soma das lojas, mês a mês e no ano', () => {
    expect(c.total.rows[0].v2).toBe(2171368 + 420000);
    expect(c.total.rows[2].v2).toBe(5516455.25);
    expect(c.total.rows[2].v1).toBe(1153550);
    const soma = c.lojas.reduce((s, l) => s + toC(l.M.R.ytd2), 0) / 100;
    expect(c.total.R.ytd2).toBe(soma);
    expect(c.total.R.total1).toBe(11959074.65 + 5305000.5);
  });

  it('um mês que só parte das lojas registou fica em curso, e a média usa só meses completos', () => {
    // Outubro: só o Huambo.
    expect(c.total.rows[9].v2).toBe(1332925);
    expect(c.total.rows[9].estado).toBe('Em curso');
    expect(c.meses[9].registadas).toBe(1);
    expect(c.meses[9].de).toBe(2);
    expect(c.total.R.nfech).toBe(9);
    const fechados = c.total.rows.slice(0, 9).reduce((s, r) => s + toC(r.v2), 0) / 100;
    expect(c.total.R.media2).toBe(Math.round((fechados / 9) * 100) / 100);
  });

  it('o crescimento da rede é o das lojas comparáveis, mês a mês e no acumulado', () => {
    // Outubro: o Lubango ainda não lançou, por isso compara-se só o Huambo com o Huambo.
    const out = c.total.rows[9];
    expect(out.v1).toBe(2623345 + 520000);
    expect(out.v1c).toBe(2623345);
    expect(out.cresc).toBeCloseTo(1332925 / 2623345 - 1, 10);
    expect(out.dif).toBe(1332925 - 2623345);
    // Acumulado: a soma do período comparável de cada loja (o Huambo até Outubro, o Lubango até Setembro).
    const [hu, lu] = c.lojas;
    expect(c.total.R.ytd1).toBe((toC(hu.M.R.ytd1) + toC(lu.M.R.ytd1)) / 100);
    expect(c.total.R.ytd2c).toBe((toC(hu.M.R.ytd2c) + toC(lu.M.R.ytd2c)) / 100);
    expect(c.total.R.cresc_ytd).toBeCloseTo(c.total.R.ytd2c / c.total.R.ytd1 - 1, 10);
    expect(c.total.R.lojasComparaveis).toBe(2);
    // Uma loja nova (sem o ano anterior) entra nas vendas, não no crescimento comparável.
    const ls = lojas();
    ls[2].years[2026] = { meses: [null, null, 150000, 210000, null, null, null, null, null, null, null, null] };
    const n = buildConsolidado(ls, 2026, 2025);
    expect(n.total.R.ytd2).toBe(c.total.R.ytd2 + 360000);
    expect(n.total.R.cresc_ytd).toBe(c.total.R.cresc_ytd);
    expect(n.total.rows[2].v2c).toBe(4956455 + 560000.25);
  });

  it('a projecção da rede é a soma das projecções de cada loja', () => {
    const p = c.lojas.filter((l) => l.temDados).reduce((s, l) => s + toC(l.M.R.projeccao), 0) / 100;
    expect(c.total.R.projeccao).toBe(p);
    expect(c.total.critTxt).toBe('soma das projecções de cada loja');
    // A estimativa de Outubro soma o valor do Huambo e a estimativa do Lubango.
    expect(c.total.rows[9].projMes).toBe(1332925 + c.lojas[1].M.rows[9].projMes);
    // Dezembro: a soma das duas estimativas.
    expect(c.total.rows[11].est).toBe(c.lojas[0].M.rows[11].est + c.lojas[1].M.rows[11].est);
    expect(c.total.R.falta).toBe((toC(c.total.R.projeccao) - toC(c.total.R.ytd2)) / 100);
  });

  it('diz que meses faltam registar, até ao último mês que alguma loja registou', () => {
    expect(c.ultimoMesRede).toBe('Outubro');
    expect(c.pendentes).toEqual([
      { id: 'lubango00000001', nome: 'Livraria do Lubango', meses: ['Outubro'], semRegistos: false },
      { id: 'catumbela000001', nome: 'Livraria de Catumbela', meses: ['sem registos em 2026'], semRegistos: true },
    ]);
    expect(c.lojas[0].atrasados).toBeNull();
    expect(c.lojas[1].atrasados).toEqual(['Outubro']);
  });

  it('quotas, posições e o mês loja a loja', () => {
    const [hu, lu] = c.lojas;
    expect(hu.posicao).toBe(1);
    expect(lu.posicao).toBe(2);
    expect(hu.quota + lu.quota).toBeCloseTo(1, 10);
    expect(c.melhorLoja.nome).toBe('Livraria do Huambo');
    const mar = c.meses[2].porLoja;
    expect(mar.map((p) => p.v2)).toEqual([4956455, 560000.25]);
    expect(mar[0].quota + mar[1].quota).toBeCloseTo(1, 10);
    expect(c.meses[9].porLoja[1].v2).toBeNull();
    // As cores seguem a ordem das lojas, não o ranking.
    expect(hu.cor).toBe('#E0679A');
    expect(lu.cor).toBe('#22A6A9');
  });

  it('junta as observações das lojas no mês da rede', () => {
    expect(c.total.rows[9].obs).toBe('Livraria do Huambo: Valor parcial.');
  });

  it('a meta da rede só existe quando todas as lojas com vendas têm meta', () => {
    expect(c.total.meta).toBeNull();
    const ls = lojas();
    ls[0].years[2026].meta_anual = 42000000;
    expect(buildConsolidado(ls, 2026, 2025).total.meta).toBeNull();
    ls[1].years[2026].meta_anual = 7000000;
    const m = buildConsolidado(ls, 2026, 2025);
    expect(m.total.meta).toBe(49000000);
    expect(m.total.R.metaPct).toBeCloseTo(m.total.R.ytd2 / 49000000, 10);
  });

  it('sem ano de comparação em nenhuma loja, não compara', () => {
    const s = buildConsolidado(lojas(), 2026, 2019);
    expect(s.comp).toBeNull();
    expect(s.total.R.total1).toBeNull();
    expect(s.total.R.cresc_ytd).toBeNull();
  });

  it('um ano sem vendas em nenhuma loja dá um relatório vazio, sem rebentar', () => {
    const v = buildConsolidado(lojas(), 2030, 2026);
    expect(v.nComDados).toBe(0);
    expect(v.total.R.ytd2).toBe(0);
    expect(v.total.R.projeccao).toBeNull();
    expect(v.pendentes).toEqual([]);
    expect(v.melhorLoja).toBeNull();
  });
});

describe('ajudantes', () => {
  it('anosDisponiveis junta os anos de todas as lojas', () => {
    expect(anosDisponiveis(lojas())).toEqual([2025, 2026]);
    expect(anosDisponiveis([])).toEqual([]);
  });

  it('linhasTodosOsAnos tem uma linha por loja, ano e mês', () => {
    const rows = linhasTodosOsAnos(lojas());
    expect(rows[0]).toEqual(['Loja', 'Província', 'Ano', 'Mês nº', 'Mês', 'Vendas (Kz)', 'Estado', 'Observação']);
    expect(rows).toHaveLength(1 + 4 * 12);
    expect(rows[1]).toEqual(['Livraria do Huambo', 'Huambo', 2025, 1, 'Janeiro', 218675, 'Fechado', '']);
    expect(rows[12 + 10]).toEqual(['Livraria do Huambo', 'Huambo', 2026, 10, 'Outubro', 1332925, 'Fechado', 'Valor parcial.']);
  });

  it('matrizLojasMeses fecha com o total da rede', () => {
    const c = buildConsolidado(lojas(), 2026, 2025);
    const m = matrizLojasMeses(c);
    expect(m[0][0]).toBe('Loja');
    expect(m[0]).toHaveLength(1 + 12 + 5);
    const tot = m.find((r) => r[0] === 'Total da rede');
    expect(tot[13]).toBe(c.total.R.ytd2);
    expect(m[m.length - 1][0]).toBe('Rede em 2025');
  });

  it('aplicarSistema preenche só os vazios, ou substitui os meses com vendas', () => {
    const atual = [100, null, 300, null, ...Array(8).fill(null)];
    const sis = [150, 200, 0, 400.555, ...Array(8).fill(0)];
    const vazios = aplicarSistema(atual, sis, 'vazios');
    expect(vazios.meses.slice(0, 4)).toEqual([100, 200, 300, 400.56]);
    expect(vazios.mudou.map((m) => m.mes)).toEqual(['Fevereiro', 'Abril']);
    const todos = aplicarSistema(atual, sis, 'todos');
    // Um mês sem vendas no sistema (0) não apaga o que está gravado.
    expect(todos.meses.slice(0, 4)).toEqual([150, 200, 300, 400.56]);
    expect(todos.mudou.map((m) => m.mes)).toEqual(['Janeiro', 'Fevereiro', 'Abril']);
  });
});

describe('diapositivosConjunto', () => {
  const ks = (l) => l.map((x) => (x.k === 'loja' ? 'loja:' + x.l.id : x.k));

  it('a rede, uma por livraria com vendas (pela posição) e o fecho', () => {
    const c = buildConsolidado(lojas(), 2026, 2025);
    expect(ks(diapositivosConjunto(c))).toEqual(['capa', 'livrarias', 'resumo', 'ranking', 'loja:huambo000000001', 'loja:lubango00000001', 'quadro', 'persp']);
  });

  it('com os mais vendidos, entram antes do quadro', () => {
    const c = buildConsolidado(lojas(), 2026, 2025);
    expect(ks(diapositivosConjunto(c, { maisVendidos: 3 }))).toContain('mv');
    expect(ks(diapositivosConjunto(c, { maisVendidos: 3 })).slice(-3)).toEqual(['mv', 'quadro', 'persp']);
  });

  it('as fotografias de cada loja chegam ao modelo', () => {
    const l = lojas();
    l[1].fotos = [{ url: '/images/lojas/lubango-1.webp', caption: 'A entrada' }];
    const c = buildConsolidado(l, 2026, 2025);
    expect(c.lojas.find((x) => x.id === 'lubango00000001').fotos).toEqual([{ url: '/images/lojas/lubango-1.webp', caption: 'A entrada' }]);
    expect(c.lojas.find((x) => x.id === 'huambo000000001').fotos).toEqual([]);
  });

  it('com uma só livraria não há ranking', () => {
    const c = buildConsolidado(lojas().slice(0, 1), 2026, 2025);
    expect(ks(diapositivosConjunto(c))).not.toContain('ranking');
  });
});
