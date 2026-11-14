import { describe, expect, it } from 'vitest';
import { buildYearModel } from './modelo';
import { DUR, RITMOS, cenaNoTempo, duracaoPlano, fmtDuracao, maxRedondo, planoVideo, planoVideoConjunto } from './video';

const M2025 = [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 911316, 1101450];
const M2026 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 1332925, null, null];
const M = buildYearModel({ 2025: { meses: M2025 }, 2026: { meses: M2026, mes_em_curso: 11 } }, 2026, 2025);
const d = { loja: 'Loja do Huambo', ano: 2026, comp: 2025, rows: M.rows, R: M.R };

describe('planoVideo', () => {
  it('o lento tem um quadro por mês, de Janeiro a Dezembro, também os por preencher', () => {
    const p = planoVideo(d, 'lento');
    const meses = p.filter((c) => c.k === 'mes');
    expect(meses.map((c) => c.nome)).toEqual(['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']);
    expect(meses[11].r.estado).toBe('Por preencher');
    expect(meses[11].r.est).toBe(3410337.4);
    expect(p.map((c) => c.k)).toEqual(['capa', 'resumo', 'mensal', ...Array(12).fill('mes'), 'quadro', 'acum', 'ranking', 'fecho']);
  });

  it('é lento de propósito: cada mês fica 9 s no ecrã e o vídeo dura quase 3 minutos', () => {
    const p = planoVideo(d, 'lento');
    expect(p.find((c) => c.k === 'mes').dur).toBe(9);
    expect(duracaoPlano(p)).toBe(179);
    expect(fmtDuracao(duracaoPlano(p))).toBe('2 min 59 s');
  });

  it('o normal tem os mesmos quadros, mais depressa; o curto não tem os meses um a um', () => {
    const lento = planoVideo(d, 'lento');
    const normal = planoVideo(d, 'normal');
    const curto = planoVideo(d, 'curto');
    expect(normal.map((c) => c.k)).toEqual(lento.map((c) => c.k));
    expect(duracaoPlano(normal)).toBeCloseTo(179 * RITMOS.normal.fator, 0);
    expect(curto.some((c) => c.k === 'mes')).toBe(false);
    expect(duracaoPlano(curto)).toBeLessThan(40);
    // Mesmo no normal, um mês tem tempo de se ler.
    expect(normal.find((c) => c.k === 'mes').dur).toBeGreaterThanOrEqual(5);
  });

  it('um ritmo desconhecido vale o lento', () => {
    expect(duracaoPlano(planoVideo(d, 'xpto'))).toBe(duracaoPlano(planoVideo(d, 'lento')));
    expect(duracaoPlano(planoVideo(d))).toBe(179);
  });
});

describe('cenaNoTempo', () => {
  const p = planoVideo(d, 'lento');
  it('encontra o quadro e o tempo dentro dele', () => {
    expect(cenaNoTempo(p, 0)).toMatchObject({ i: 0, s: 0 });
    // capa 5 + resumo 12 + mensal 11 = 28 s: aos 30 s está em Janeiro há 2 s.
    const at = cenaNoTempo(p, 30);
    expect(at.cena.nome).toBe('Janeiro');
    expect(at.s).toBeCloseTo(2, 5);
    expect(cenaNoTempo(p, 28 + 9 * 8 + 1).cena.nome).toBe('Setembro');
  });
  it('depois do fim fica no último quadro', () => {
    expect(cenaNoTempo(p, 999)).toMatchObject({ i: p.length - 1, p: 1 });
  });
});

describe('fmtDuracao', () => {
  it('escreve minutos e segundos', () => {
    expect(fmtDuracao(35)).toBe('35 s');
    expect(fmtDuracao(60)).toBe('1 min');
    expect(fmtDuracao(107.4)).toBe('1 min 47 s');
    expect(fmtDuracao(185)).toBe('3 min 05 s');
  });
});

describe('planoVideoConjunto', () => {
  const loja = (nome, temDados) => ({ nome, temDados, M });
  const c = {
    ano: 2026, comp: 2025, total: M,
    lojas: [loja('Huambo', true), loja('Lubango', true), loja('Benguela', false)],
    pendentes: [{ nome: 'Lubango', meses: ['Outubro'] }],
  };

  it('tem um quadro por loja com dados e um por mês da rede', () => {
    const p = planoVideoConjunto(c, 'lento');
    expect(p.filter((x) => x.k === 'loja').map((x) => x.nome)).toEqual(['Huambo', 'Lubango']);
    expect(p.filter((x) => x.k === 'mesRede')).toHaveLength(12);
    expect(p.map((x) => x.k)).toContain('pendentes');
    const esperado = DUR.capa + DUR.resumo + DUR.lojas + DUR.mensal + 2 * DUR.loja + 12 * DUR.mesRede + DUR.quadro + DUR.acum + DUR.pendentes + DUR.fecho;
    expect(duracaoPlano(p)).toBe(esperado);
  });

  it('sem meses por registar não há o quadro deles; o curto só tem a rede', () => {
    expect(planoVideoConjunto({ ...c, pendentes: [] }).map((x) => x.k)).not.toContain('pendentes');
    const curto = planoVideoConjunto(c, 'curto');
    expect(curto.some((x) => x.k === 'loja' || x.k === 'mesRede')).toBe(false);
  });
});

describe('maxRedondo', () => {
  it('arredonda o eixo para as quatro marcas caírem em valores redondos', () => {
    // 6,64 M: marcas de 2 em 2 M (antes 1,7 · 3,3 · 5,0 · 6,6 M).
    expect(maxRedondo(6639756)).toBe(8000000);
    // 40,9 M: marcas de 12 em 12 M, até 48 M.
    expect(maxRedondo(40924048.8)).toBe(48000000);
    expect(maxRedondo(1000)).toBe(1000);
    expect(maxRedondo(0)).toBe(1);
    for (const v of [123, 9999, 2904902, 34103374, 812345678]) {
      const m = maxRedondo(v);
      expect(m).toBeGreaterThanOrEqual(v);
      expect(m).toBeLessThanOrEqual(v * 1.6);
    }
  });
});
