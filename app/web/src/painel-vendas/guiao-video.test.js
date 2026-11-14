import { describe, expect, it } from 'vitest';
import { esticarPlano, guiaoDoVideo, kzDito, legendaNoTempo, partirLegendas, pctDito, tempoDasLegendas } from './guiao-video.js';
import { planoVideo, planoVideoConjunto } from './video.js';
import { buildYearModel } from './modelo.js';
import { buildConsolidado } from './consolidado.js';

const HUAMBO = {
  2025: { meses: [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 900000, 1112765] },
  2026: { meses: [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null], mes_em_curso: null },
};
const dadosLoja = () => {
  const M = buildYearModel(HUAMBO, 2026, 2025);
  return { loja: 'Livraria Adventista — Huambo', ano: 2026, comp: 2025, rows: M.rows, R: M.R, meta: null, destaques: null };
};

describe('números ditos', () => {
  it('os valores como se dizem', () => {
    expect(kzDito(37679153)).toBe('37,7 milhões de Kz');
    expect(kzDito(4956455)).toBe('4,96 milhões de Kz');
    expect(kzDito(5000000)).toBe('5 milhões de Kz');
    expect(kzDito(4900000)).toBe('4,9 milhões de Kz');
    expect(kzDito(1000000)).toBe('1 milhão de Kz');
    expect(kzDito(743550)).toBe('744 mil Kz');
    expect(kzDito(2500)).toBe('2,5 mil Kz');
    expect(kzDito(950)).toBe('950 Kz');
    expect(kzDito(-21665)).toBe('−22 mil Kz');
    expect(kzDito(null)).toBe('—');
  });

  it('as percentagens com sinal e vírgula', () => {
    expect(pctDito(2.788)).toBe('+278,8%');
    expect(pctDito(-0.065)).toBe('−6,5%');
    expect(pctDito(null)).toBe('—');
  });
});

describe('guiaoDoVideo', () => {
  it('uma frase por quadro, a dizer os números do quadro', () => {
    const d = dadosLoja();
    const plano = planoVideo(d, 'lento');
    const g = guiaoDoVideo('loja', d, plano, 'lento');
    expect(g).toHaveLength(plano.length);
    expect(g[0]).toBe('Relatório de vendas de 2026 da Loja do Huambo, comparado com 2025.');
    expect(g[1]).toMatch(/^Até Outubro, a loja vendeu 37,7 milhões de Kz, \+\d+,\d% face aos mesmos meses de 2025\. A projecção para 2026 é de /);
    const marco = g[plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Março')];
    expect(marco).toBe('Março: 4,96 milhões de Kz, contra 744 mil Kz em 2025 — +566,6%.');
    const setembro = g[plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Setembro')];
    expect(setembro).toContain('O melhor mês do ano.');
    const dezembro = g[plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Dezembro')];
    expect(dezembro).toMatch(/^Dezembro ainda está por preencher; a estimativa é de /);
    expect(g[g.length - 1]).toMatch(/^Perspectiva: .* para 2026, .* face a 2025\. Faltam .*\. Obrigado\.$/);
  });

  it('no vídeo normal as frases são breves', () => {
    const d = dadosLoja();
    const plano = planoVideo(d, 'normal');
    const g = guiaoDoVideo('loja', d, plano, 'normal');
    const marco = g[plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Março')];
    expect(marco).toBe('Março: 4,96 milhões de Kz, +566,6%.');
  });

  it('o vídeo de todas as livrarias diz cada loja pelo nome', () => {
    const c = buildConsolidado([
      { id: 'h', name: 'Livraria Adventista — Huambo', province: 'Huambo', active: true, years: HUAMBO },
      { id: 'l', name: 'Livraria Adventista — Lubango', province: 'Huíla', active: true, years: { 2026: { meses: [361593, 158750, 269612, 379850, 708435, 319145, 1099129, 187333, 389550, 1353345, null, null] } } },
    ], 2026, 2025);
    const plano = planoVideoConjunto(c, 'lento');
    const g = guiaoDoVideo('conjunto', c, plano, 'lento');
    expect(g[0]).toBe('Relatório conjunto de 2026: todas as livrarias, comparado com 2025.');
    expect(g[plano.findIndex((x) => x.k === 'lojas')]).toMatch(/^Loja do Huambo lidera, com \d+,\d% das vendas da rede\. Segue-se a Loja do Lubango\.$/);
    expect(g[plano.findIndex((x) => x.k === 'loja' && x.l.id === 'l')]).toMatch(/^Loja do Lubango: 5,23 milhões de Kz — \d+,\d% da rede\.$/);
  });
});

describe('legendas', () => {
  it('parte a frase em linhas, de preferência no fim de uma frase ou numa vírgula', () => {
    const t = 'Até Outubro, a loja vendeu 37,7 milhões de Kz, +278,8% face aos mesmos meses de 2025. A projecção para 2026 é de 45,2 milhões de Kz.';
    const p = partirLegendas(t, 74);
    expect(p.length).toBeGreaterThan(1);
    p.forEach((x) => expect(x.length).toBeLessThanOrEqual(74));
    expect(p.join(' ')).toBe(t);
    expect(p[p.length - 1]).toBe('A projecção para 2026 é de 45,2 milhões de Kz.');
  });

  it('o plano estica um quadro curto para a frase se ler, e não encolhe nenhum', () => {
    const plano = [{ k: 'capa', dur: 2 }, { k: 'mes', dur: 9 }];
    const g = ['x'.repeat(70), 'curta'];
    const p = esticarPlano(plano, g);
    expect(p[0].dur).toBeCloseTo(0.6 + 70 / 14 + 0.5, 1);
    expect(p[1].dur).toBe(9);
  });

  it('cada pedaço de legenda tem o seu tempo dentro do quadro, e só o primeiro entra a esbater', () => {
    const plano = [{ k: 'capa', dur: 5 }, { k: 'resumo', dur: 10 }];
    const g = ['Capa.', 'Primeira parte da frase do resumo, com números. Segunda parte da frase, ainda mais longa do que a primeira.'];
    const l = tempoDasLegendas(plano, g, { max: 60 });
    expect(l[0]).toMatchObject({ i: 0, texto: 'Capa.', entra: true, sai: true });
    expect(l[0].ini).toBeGreaterThanOrEqual(0.6 - 1e-9);
    const resumo = l.filter((x) => x.i === 1);
    expect(resumo.length).toBe(2);
    expect(resumo[0].ini).toBeGreaterThanOrEqual(5);
    expect(resumo[1].fim).toBeLessThanOrEqual(15);
    expect(resumo[0].fim).toBeCloseTo(resumo[1].ini, 5);
    expect(resumo[0].sai).toBe(false);
    expect(resumo[1].entra).toBe(false);
    // A meio do primeiro pedaço está opaca; na troca para o segundo não pisca.
    expect(legendaNoTempo(l, (resumo[0].ini + resumo[0].fim) / 2).alpha).toBe(1);
    expect(legendaNoTempo(l, resumo[1].ini + 0.01).alpha).toBe(1);
    expect(legendaNoTempo(l, 0.2)).toBeNull();
  });
});
