// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { buildYearModel, estadoDoMes, mesesDoAno, sumKz, periodoAte, previsaoDoAno } from './modelo';

// Os dados reais da Loja do Huambo (migração painel_vendas, Relatório Síntese 2025/26):
// 2025 completo e 2026 até Outubro, com Novembro em curso.
const M2025 = [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 911316, 1101450];
const M2026 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 1332925, null, null];

const anos = () => ({
  2025: { ano: 2025, meses: M2025, observacoes: Array(12).fill(''), mes_em_curso: null, criterio: 'media', fonte: 'Relatório Síntese 2025/26' },
  2026: { ano: 2026, meses: M2026, observacoes: Array(12).fill(''), mes_em_curso: 11, criterio: 'media' },
});

describe('buildYearModel', () => {
  it('soma os meses em cêntimos, sem o lixo da vírgula flutuante', () => {
    // Somados como números decimais, 218 675,10 + 189 500,20 dão 408175.30000000005.
    expect(218675.1 + 189500.2).not.toBe(408175.3);
    expect(sumKz([{ v: 218675.1 }, { v: 189500.2 }], 'v')).toBe(408175.3);
    const M = buildYearModel(anos(), 2025, null);
    expect(M.R.ytd2).toBe(11959074.65);
    expect(M.R.media2).toBe(996589.55);
  });

  it('distingue fechado, em curso e por preencher', () => {
    const M = buildYearModel(anos(), 2026, 2025);
    expect(M.rows.map((r) => r.estado)).toEqual([
      ...Array(10).fill('Fechado'), 'Por preencher', 'Por preencher',
    ]);
    // Com Novembro ainda sem valor, o «mês em curso» do registo não muda nada: só um mês com
    // valor pode estar em curso. Com valor, passa a «Em curso» e não entra nas médias.
    const comNov = anos();
    comNov[2026].meses = [...M2026.slice(0, 10), 500000, null];
    const N = buildYearModel(comNov, 2026, 2025);
    expect(N.rows[10].estado).toBe('Em curso');
    expect(N.R.nfech).toBe(10);
    expect(N.R.nregistados).toBe(11);
    expect(N.R.ytd2).toBe(34603374);
  });

  it('o crescimento comparável usa só os meses que existem nos dois anos', () => {
    const M = buildYearModel(anos(), 2026, 2025);
    expect(M.R.ytd2).toBe(34103374);
    expect(M.R.ytd2c).toBe(34103374);
    expect(M.R.ytd1).toBe(9946308.65);
    expect(M.R.total1).toBe(11959074.65);
    // Jan–Out: 34 103 374 contra 9 946 308,65 — mais 242,9 %.
    expect(M.R.cresc_ytd).toBeCloseTo(2.42875, 4);
    expect(M.R.dif_ytd).toBe(24157065.35);
  });

  it('projecta pela média dos meses fechados e diz o que falta', () => {
    const M = buildYearModel(anos(), 2026, 2025);
    expect(M.crit).toBe('media');
    expect(M.R.media2).toBe(3410337.4);
    expect(M.R.media1).toBe(996589.55);
    // Dois meses por preencher, cada um estimado pela média.
    expect(M.rows[10].est).toBe(3410337.4);
    expect(M.rows[11].est).toBe(3410337.4);
    expect(M.R.projeccao).toBe(40924048.8);
    expect(M.R.falta).toBe(6820674.8);
    expect(M.R.cresc_proj).toBeCloseTo(2.42201, 4);
  });

  it('projecta pela tendência face ao ano anterior quando é o critério escolhido', () => {
    const ys = anos();
    ys[2026].criterio = 'tendencia';
    const M = buildYearModel(ys, 2026, 2025);
    expect(M.crit).toBe('tendencia');
    // Novembro e Dezembro de 2025 vezes o rácio dos meses fechados (34 103 374 / 9 946 308,65).
    const ratio = 34103374 / 9946308.65;
    expect(M.rows[10].est).toBeCloseTo(911316 * ratio, 2);
    expect(M.rows[11].est).toBeCloseTo(1101450 * ratio, 2);
    // Sem ano de comparação não há tendência: volta à média.
    expect(buildYearModel(ys, 2026, null).crit).toBe('media');
  });

  it('projecta pela meta, reparte o que falta pelos meses que faltam', () => {
    const ys = anos();
    ys[2026].criterio = 'meta';
    ys[2026].meta_anual = 42000000;
    const M = buildYearModel(ys, 2026, 2025);
    expect(M.crit).toBe('meta');
    // (42 000 000 − 34 103 374) / 2 meses = 3 948 313.
    expect(M.rows[10].est).toBe(3948313);
    expect(M.R.projeccao).toBe(42000000);
    expect(M.R.metaPct).toBeCloseTo(0.81199, 4);
    expect(M.R.metaFalta).toBe(7896626);
    // Sem meta gravada, o critério «meta» volta à média.
    ys[2026].meta_anual = null;
    expect(buildYearModel(ys, 2026, 2025).crit).toBe('media');
  });

  it('acumula os dois anos mês a mês e diz quando o ano passado foi ultrapassado', () => {
    const M = buildYearModel(anos(), 2026, 2025);
    expect(M.rows[0].acum2).toBe(2171368);
    expect(M.rows[2].acum2).toBe(9104811);
    expect(M.rows[9].acum2).toBe(34103374);
    expect(M.rows[11].acum1).toBe(11959074.65);
    expect(M.rows[9].acum2).toBe(M.R.ytd2);
    // O acumulado de 2026 passa o total de 2025 em Abril (12 729 516 > 11 959 074,65).
    expect(M.R.ultrapassa).toBe('Abril');
  });

  it('dá a cada mês o crescimento, a diferença, o peso no ano e a posição', () => {
    const M = buildYearModel(anos(), 2026, 2025);
    const set = M.rows[8]; // Setembro
    expect(set.v2).toBe(6639756);
    expect(set.v1).toBe(430902);
    expect(set.dif).toBe(6208854);
    expect(set.cresc).toBeCloseTo(14.40897, 4);
    expect(set.peso).toBeCloseTo(0.19469, 4);
    expect(set.posicao).toBe(1);
    expect(set.deMeses).toBe(10);
    expect(M.R.melhor.mes).toBe('Setembro');
    expect(M.R.pior.mes).toBe('Outubro');
    // Um mês sem valor não tem posição nem peso.
    expect(M.rows[11].posicao).toBeNull();
    expect(M.rows[11].peso).toBeNull();
  });

  it('aguenta um ano vazio e um ano que não existe', () => {
    const M = buildYearModel(anos(), 2027, 2026);
    expect(M.R.ytd2).toBe(0);
    expect(M.R.nfech).toBe(0);
    expect(M.R.melhor).toBeNull();
    expect(M.R.projeccao).toBeNull();
    expect(M.rows).toHaveLength(12);
    const V = buildYearModel({}, 2030, null);
    expect(V.comp).toBeNull();
    expect(V.rows.every((r) => r.v2 == null && r.v1 == null)).toBe(true);
  });

  it('não compara com um ano que não existe', () => {
    const M = buildYearModel(anos(), 2026, 2024);
    expect(M.comp).toBeNull();
    expect(M.R.total1).toBeNull();
    expect(M.R.cresc_ytd).toBeNull();
  });
});

describe('mesesDoAno e estadoDoMes', () => {
  it('devolvem sempre 12 meses, com o lixo a nulo', () => {
    expect(mesesDoAno({ meses: [1, '', null, 'abc', 5] })).toEqual([1, null, null, null, 5, null, null, null, null, null, null, null]);
    expect(mesesDoAno(null)).toHaveLength(12);
    expect(mesesDoAno({})).toEqual(Array(12).fill(null));
  });

  it('o estado de cada mês é o mesmo que o do modelo', () => {
    const Y = { meses: [100, null, 300], mes_em_curso: 3 };
    expect(estadoDoMes(Y, 0)).toBe('Fechado');
    expect(estadoDoMes(Y, 1)).toBe('Por preencher');
    expect(estadoDoMes(Y, 2)).toBe('Em curso');
    const M = buildYearModel({ 2026: Y }, 2026, null);
    expect(M.rows.slice(0, 3).map((r) => r.estado)).toEqual(['Fechado', 'Por preencher', 'Em curso']);
  });
});

describe('periodoAte (o «período em apresentação» do PowerPoint)', () => {
  // Os valores dos diapositivos de Janeiro a Outubro do «Painel de Vendas» do Huambo.
  const H25 = [218675, 189500, 743550, 1053650, 1018225, 551910, 211650, 2904902, 430902, 2623345, null, null];
  const H26 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null];
  const MH = buildYearModel({ 2025: { meses: H25 }, 2026: { meses: H26 } }, 2026, 2025);

  it('Janeiro: vendas, médias, crescimento e diferenças como no diapositivo', () => {
    const p = periodoAte(MH, 0);
    expect(p.ate).toBe('Janeiro');
    expect([p.venda1, p.venda2, p.media1, p.media2]).toEqual([218675, 2171368, 218675, 2171368]);
    expect(p.crescimento * 100).toBeCloseTo(893.0, 1);
    expect(p.difMensal).toBe(1952693);
    expect(p.difPeriodica).toBe(1952693);
  });

  it('Fevereiro: a média do período (204 087,5 Kz em 2025)', () => {
    const p = periodoAte(MH, 1);
    expect(p.media1).toBe(204087.5);
    expect(p.media2).toBe(2074178);
    expect(p.venda2).toBe(4148356);
    expect(p.crescimento * 100).toBeCloseTo(916.3, 1);
    expect(p.difMensal).toBe(1787488);
    expect(p.difPeriodica).toBe(3740181);
  });

  it('Outubro: o diapositivo do mês fechado', () => {
    const p = periodoAte(MH, 9);
    expect([p.venda1, p.venda2]).toEqual([9946309, 37679153]);
    expect(p.media1).toBe(994630.9);
    expect(p.media2).toBe(3767915.3);
    expect(p.crescimento * 100).toBeCloseTo(278.8, 1);
    expect(p.crescMensal * 100).toBeCloseTo(87.1, 1);
    expect(p.difMensal).toBe(2285359);
    expect(p.difPeriodica).toBe(27732844);
  });

  it('um mês sem valor num dos anos não entra na comparação periódica', () => {
    const M = buildYearModel({ 2025: { meses: [100, null, 300] }, 2026: { meses: [150, 200, 330] } }, 2026, 2025);
    const p = periodoAte(M, 2);
    expect([p.venda1, p.venda2, p.n1, p.n2]).toEqual([400, 680, 2, 3]);
    expect([p.venda1c, p.venda2c, p.comparaveis]).toEqual([400, 480, 2]);
    expect(p.crescimento).toBeCloseTo(0.2, 6);
    expect(p.difPeriodica).toBe(80);
    expect(p.media1).toBe(200);
  });

  it('sem ano de comparação, só o ano', () => {
    const M = buildYearModel({ 2026: { meses: [10, 20] } }, 2026, null);
    const p = periodoAte(M, 1);
    expect([p.venda1, p.venda2, p.crescimento, p.difPeriodica, p.difMensal]).toEqual([null, 30, null, null, null]);
  });
});

describe('previsaoDoAno', () => {
  // Os números do Huambo em Novembro de 2026: Outubro fechado (4 908 704), Novembro em curso
  // (1 202 170) e a previsão do PowerPoint «Loja Huambo - Painel-Vendas 2026S»: 31 294 120.
  const huambo = (meta) => {
    const a = anos();
    a[2026].meses = [...M2026.slice(0, 9), 4908704, 1202170, null];
    a[2026].meta_anual = meta;
    return buildYearModel(a, 2026, 2025);
  };

  it('com previsão gravada, é essa (e não a projecção pela média)', () => {
    const P = previsaoDoAno(huambo(31294120));
    expect(P.declarada).toBe(true);
    expect(P.valor).toBe(31294120);
    expect(P.projeccao).toBeCloseTo(45214983.6, 2);
    expect(P.cresc).toBeCloseTo(31294120 / 11959074.65 - 1, 10);
  });

  it('diz que já foi atingida, em que mês e por quanto a passa', () => {
    const P = previsaoDoAno(huambo(31294120));
    expect(P.actual).toBe(38881323);
    expect(P.atingida).toBe(true);
    expect(P.mes).toBe('Setembro'); // 32 770 449 acumulados até Setembro
    expect(P.acima).toBe(7587203);
    expect(P.acimaPct).toBeCloseTo(0.2424, 4);
    expect(P.falta).toBe(0);
  });

  it('antes de a atingir, diz quanto falta', () => {
    const P = previsaoDoAno(huambo(50000000));
    expect(P.atingida).toBe(false);
    expect(P.mes).toBeNull();
    expect(P.falta).toBe(11118677);
    expect(P.pct).toBeCloseTo(38881323 / 50000000, 10);
  });

  it('sem previsão gravada, é a projecção do critério e nunca se diz «atingida»', () => {
    const M = huambo(null);
    const P = previsaoDoAno(M);
    expect(P.declarada).toBe(false);
    expect(P.valor).toBe(M.R.projeccao);
    expect(P.atingida).toBe(false);
    expect(P.falta).toBe(M.R.falta);
  });
});
