// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { LIMITES, avisosDePlausibilidade, origemDasAlteracoes, substituicoesComValor, textoDoAviso } from './plausibilidade.js';

// Os números reais das lojas até Outubro de 2026 (migração vendas_das_lojas_ate_outubro).
const HUAMBO_2025 = [218675, 189500, 743550, 1053650, 1018225, 551909.65, 211650, 2904902, 430902, 2623345, 900000, 1112765];
const HUAMBO_2026 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null];
const LUBANGO_2025 = [522850, 118050, 882750, 482975, 1030825, 453760, 244514, 52650, 827125, 974128, 106750, 1633117];
const LUBANGO_2026 = [361593, 158750, 269612, 379850, 708435, 319145, 1099129, 187333, 389550, 1353345, null, null];
const CATUMBELA_2026 = [0, 0, 383770, 601925, 526320, 565050, 577190, 292890, 814484, 930916, null, null];

describe('avisosDePlausibilidade', () => {
  it('aponta os meses do Huambo que mais do que quadruplicaram face a 2025', () => {
    const av = avisosDePlausibilidade(HUAMBO_2026, HUAMBO_2025);
    expect(av.map((a) => a.mes.slice(0, 3))).toEqual(['Jan', 'Fev', 'Mar', 'Jun', 'Jul', 'Set']);
    expect(av.every((a) => a.tipo === 'subida')).toBe(true);
    const set = av.find((a) => a.i === 8);
    expect(set.ref).toBe(430902);
    expect(textoDoAviso(set, 2025)).toBe('Set: +1 441% face a Set de 2025');
  });

  it('o Lubango só tem Julho a mais do que quadruplicar', () => {
    expect(avisosDePlausibilidade(LUBANGO_2026, LUBANGO_2025).map((a) => [a.mes, a.tipo])).toEqual([['Julho', 'subida']]);
  });

  it('Catumbela, sem ano anterior e com Janeiro e Fevereiro a 0, não tem nada a confirmar', () => {
    expect(avisosDePlausibilidade(CATUMBELA_2026, null)).toEqual([]);
  });

  it('uma queda para um quarto ou menos também se confirma, e um mês a 0 depois de um ano com vendas', () => {
    const av = avisosDePlausibilidade([100, 0, 50], [400, 300, 50]);
    expect(av.map((a) => [a.i, a.tipo])).toEqual([[0, 'descida'], [1, 'descida']]);
    expect(textoDoAviso(av[1], 2025)).toBe('Fev: −100% face a Fev de 2025');
  });

  it('sem ano anterior, compara com a mediana dos outros meses (com pelo menos 4)', () => {
    const meses = [1000, 1100, 900, 1050, 9800, null];
    const av = avisosDePlausibilidade(meses, null);
    expect(av).toHaveLength(1);
    expect(av[0]).toMatchObject({ i: 4, tipo: 'acima' });
    expect(textoDoAviso(av[0])).toBe('Mai: 9,6× a mediana dos outros meses');
    // Com só três meses à volta, a mediana não diz nada.
    expect(avisosDePlausibilidade([1000, 1100, 900, 9800], null)).toEqual([]);
  });

  it('um zero a mais ou a menos é apanhado (o caso típico de quem escreve à mão)', () => {
    const lancado = [2171368, 1976988, 49564550, 3624705, 2917373];
    expect(avisosDePlausibilidade(lancado, null).map((a) => [a.i, a.tipo])).toEqual([[2, 'acima']]);
    const curto = [2171368, 1976988, 495645, 3624705, 2917373];
    expect(avisosDePlausibilidade(curto, null).map((a) => [a.i, a.tipo])).toEqual([[2, 'abaixo']]);
  });

  it('ao gravar, só verifica os meses mudados', () => {
    expect(avisosDePlausibilidade(HUAMBO_2026, HUAMBO_2025, [7, 9])).toEqual([]);
    expect(avisosDePlausibilidade(HUAMBO_2026, HUAMBO_2025, [8]).map((a) => a.i)).toEqual([8]);
  });

  it('os limites são os documentados', () => {
    expect(LIMITES).toEqual({ subida: 4, descida: 0.25, mediana: 4, minMeses: 4 });
    // Exactamente 4× avisa; 3,99× não.
    expect(avisosDePlausibilidade([400], [100])).toHaveLength(1);
    expect(avisosDePlausibilidade([399], [100])).toHaveLength(0);
  });
});

describe('origemDasAlteracoes', () => {
  it('uma só origem fica com o seu nome; várias ficam «misto»', () => {
    expect(origemDasAlteracoes({})).toBe('manual');
    expect(origemDasAlteracoes({ manual: 3 })).toBe('manual');
    expect(origemDasAlteracoes({ sistema: 2 })).toBe('sistema');
    expect(origemDasAlteracoes({ importacao: 10 })).toBe('importacao');
    expect(origemDasAlteracoes({ importacao: 9, manual: 1 })).toBe('misto');
    expect(origemDasAlteracoes({ sistema: 1, importacao: 1 })).toBe('misto');
  });
});

describe('substituicoesComValor', () => {
  it('só os meses que já tinham valor e mudam', () => {
    const mudou = [{ i: 9, de: 4908704, para: 21665 }, { i: 10, de: null, para: 325540 }, { i: 3, de: 5, para: 5 }];
    expect(substituicoesComValor(mudou)).toEqual([{ i: 9, de: 4908704, para: 21665 }]);
  });
});
