// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { MUSICA, SONS, duracaoDoCiclo, notasDoCiclo, pistaDeEfeitos, tiquesDaContagem } from './deixas-video.js';
import { planoVideo, planoVideoConjunto } from './video.js';
import { buildYearModel } from './modelo.js';
import { buildConsolidado } from './consolidado.js';

const HUAMBO = {
  2025: { meses: [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 900000, 1112765] },
  2026: { meses: [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null] },
};
const dados = () => { const M = buildYearModel(HUAMBO, 2026, 2025); return { loja: 'Loja do Huambo', ano: 2026, comp: 2025, rows: M.rows, R: M.R }; };
const inicioDe = (plano, i) => plano.slice(0, i).reduce((s, c) => s + c.dur, 0);
const doQuadro = (pista, i) => pista.filter((d) => d.i === i);

describe('pistaDeEfeitos', () => {
  const d = dados();
  const plano = planoVideo(d, 'lento');
  const pista = pistaDeEfeitos('loja', d, plano);

  it('só usa sons que existem, por ordem de tempo, dentro do vídeo', () => {
    pista.forEach((x) => expect(SONS[x.som]).toBeTruthy());
    const total = plano.reduce((s, c) => s + c.dur, 0);
    pista.forEach((x, k) => { expect(x.t).toBeGreaterThanOrEqual(0); expect(x.t).toBeLessThan(total); if (k) expect(x.t).toBeGreaterThanOrEqual(pista[k - 1].t); });
  });

  it('uma transição no início de cada quadro, menos o primeiro', () => {
    const transicoes = pista.filter((x) => x.som === 'transicao');
    expect(transicoes).toHaveLength(plano.length - 1);
    transicoes.forEach((x) => expect(x.t).toBeCloseTo(inicioDe(plano, x.i), 2));
  });

  it('a capa abre a porta da loja, e o fecho fecha-a no fim', () => {
    expect(doQuadro(pista, 0).map((x) => x.som)).toContain('porta');
    const fecho = plano.length - 1;
    const fechar = doQuadro(pista, fecho).find((x) => x.som === 'porta_fechar');
    expect(fechar).toBeTruthy();
    expect(fechar.t).toBeGreaterThan(inicioDe(plano, fecho));
  });

  it('o resumo conta (tiques) e fecha na caixa registadora', () => {
    const i = plano.findIndex((c) => c.k === 'resumo');
    const sons = doQuadro(pista, i);
    expect(sons.filter((x) => x.som === 'tique').length).toBe(11);
    const caixa = sons.find((x) => x.som === 'caixa');
    expect(caixa.t).toBeGreaterThan(Math.max(...sons.filter((x) => x.som === 'tique').map((x) => x.t)));
  });

  it('um mês a crescer sobe (e tem moedas); um mês a cair desce', () => {
    const iMarco = plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Março');
    expect(doQuadro(pista, iMarco).map((x) => x.som)).toEqual(expect.arrayContaining(['subida', 'moedas']));
    // Um mês com menos do que no ano anterior.
    const d2 = dados();
    d2.rows = d2.rows.map((r) => (r.mes === 'Março' ? { ...r, cresc: -0.2 } : r));
    const p2 = planoVideo(d2, 'lento');
    const s2 = pistaDeEfeitos('loja', d2, p2);
    const sons = doQuadro(s2, iMarco).map((x) => x.som);
    expect(sons).toContain('queda');
    expect(sons).not.toContain('subida');
  });

  it('o melhor mês tem a caixa e o brilho; um mês por preencher, o aviso', () => {
    const iSet = plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Setembro');
    expect(doQuadro(pista, iSet).map((x) => x.som)).toEqual(expect.arrayContaining(['caixa', 'brilho']));
    const iDez = plano.findIndex((c) => c.k === 'mes' && c.r.mes === 'Dezembro');
    expect(doQuadro(pista, iDez).map((x) => x.som)).toContain('alerta');
  });

  it('nenhum som começa fora do seu quadro', () => {
    pista.forEach((x) => {
      const ini = inicioDe(plano, x.i);
      expect(x.t).toBeGreaterThanOrEqual(ini - 1e-9);
      expect(x.t).toBeLessThan(ini + plano[x.i].dur);
    });
  });

  it('no vídeo de todas as livrarias, cada loja abre a sua porta', () => {
    const c = buildConsolidado([
      { id: 'h', name: 'Huambo', active: true, years: HUAMBO },
      { id: 'l', name: 'Lubango', active: true, years: { 2026: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null, null] } } },
    ], 2026, 2025);
    const p = planoVideoConjunto(c, 'lento');
    const s = pistaDeEfeitos('conjunto', c, p);
    p.forEach((cena, i) => { if (cena.k === 'loja') expect(doQuadro(s, i).map((x) => x.som)).toContain('porta'); });
    expect(p.filter((x) => x.k === 'loja')).toHaveLength(2);
  });
});

describe('tiquesDaContagem', () => {
  it('densos no início e cada vez mais espaçados, como um contador a abrandar', () => {
    const t = tiquesDaContagem(0, 1.4, 12);
    expect(t).toHaveLength(11);
    expect(t[1] - t[0]).toBeLessThan(t[10] - t[9]);
    expect(t[10]).toBeLessThanOrEqual(1.4);
  });
});

describe('música', () => {
  it('um ciclo de quatro acordes de dois compassos a 88 bpm', () => {
    expect(duracaoDoCiclo()).toBeCloseTo((60 / 88) * 4 * 2 * 4, 5);
    const n = notasDoCiclo();
    expect(n.filter((x) => x.tipo === 'baixo')).toHaveLength(MUSICA.acordes.length);
    expect(n.filter((x) => x.tipo === 'arpejo')).toHaveLength(MUSICA.acordes.length * MUSICA.compassosPorAcorde * 8);
    n.forEach((x) => { expect(x.t).toBeGreaterThanOrEqual(0); expect(x.t).toBeLessThan(duracaoDoCiclo()); });
  });
});
