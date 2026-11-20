// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aplicarPptx, lerDiapositivoMensal, lerKz, lerLoja, lerPainelPptx, lerQuadroGeral, lojaDoPptx, montar } from './pptx';

// O PowerPoint da Loja do Huambo que está na raiz do repositório (até Outubro de 2026).
const FICHEIRO = path.resolve(__dirname, '../../e2e/dados/painel-vendas-huambo-2026.pptx');

// Os valores que a migração 20261114100000_vendas_das_lojas_ate_outubro escreveu à mão.
const HUAMBO_2025 = [218675, 189500, 743550, 1053650, 1018225, 551910, 211650, 2904902, 430902, 2623345, null, null];
const HUAMBO_2026 = [2171368, 1976988, 4956455, 3624705, 2917373, 2472331, 4779202, 3232271, 6639756, 4908704, null, null];

describe('lerKz', () => {
  it('lê os formatos do PowerPoint e do Excel', () => {
    expect(lerKz('2 171 368 Kz')).toBe(2171368);
    expect(lerKz('813 662,6  Kz')).toBe(813662.6);
    expect(lerKz('2.171.368,50')).toBe(2171368.5);
    expect(lerKz('+ 6 208 854')).toBe(6208854);
    expect(lerKz('11.716.684')).toBe(11716684);
    expect(lerKz('')).toBeNull();
    expect(lerKz('Novembro')).toBeNull();
    expect(lerKz('87,1%')).toBeNull();
  });
});

describe('lerPainelPptx (ficheiro real)', () => {
  it('dá os meses da migração de Outubro e os totais do quadro geral', async () => {
    const r = await lerPainelPptx(readFileSync(FICHEIRO));
    expect(r.loja).toBe('Huambo');
    expect(r.anos[2025]).toEqual(HUAMBO_2025);
    expect(r.anos[2026]).toEqual(HUAMBO_2026);
    expect(r.totais).toEqual({ 2025: 9946309, 2026: 37679153 });
    expect(r.ultimo).toEqual({ 2025: 9, 2026: 9 });
  });

  it('avisa da diferença de Julho de 2025 entre o quadro geral e o diapositivo do mês', async () => {
    const r = await lerPainelPptx(readFileSync(FICHEIRO));
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/^Julho de 2025: o quadro geral diz 211\s650 Kz e o diapositivo do mês diz 221\s650 Kz/);
  });

  it('recusa um ficheiro que não é um PowerPoint', async () => {
    await expect(lerPainelPptx(new TextEncoder().encode('isto não é um zip'))).rejects.toThrow(/não é um \.pptx/);
  });
});

describe('montar', () => {
  const tabela = [
    ['MÊS', '2025', '2026', 'CRESCIMENTO'],
    ...['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro'].map((m, i) => [m, String(HUAMBO_2025[i]), String(HUAMBO_2026[i]), '']),
    ['Novembro', '', '', ''],
    ['Dezembro', '', '', ''],
    ['TOTAL', '9 946 309 Kz', '37 679 153 Kz', ''],
  ];

  it('preenche Novembro a partir do diapositivo do mês quando o quadro ainda está em branco', () => {
    const r = montar({ quadro: lerQuadroGeral(tabela), mensais: [{ mes: 10, valores: [911316, 5100000] }], loja: 'Huambo' });
    expect(r.anos[2025][10]).toBe(911316);
    expect(r.anos[2026][10]).toBe(5100000);
    expect(r.ultimo[2026]).toBe(10);
    expect(r.avisos.some((a) => /Novembro de 2026: o quadro geral está em branco/.test(a))).toBe(true);
    // O total do quadro (até Outubro) já não bate: avisa.
    expect(r.avisos.some((a) => /2026: a soma dos meses/.test(a))).toBe(true);
  });

  it('sem quadro nem diapositivos mensais, explica o que falta', () => {
    expect(() => montar({ quadro: null, mensais: [] })).toThrow(/Painel de Vendas/);
  });
});

describe('diapositivos', () => {
  it('lê o mês e as duas vendas de um diapositivo mensal', () => {
    const pars = ['PERÍODO EM APRESENTAÇÃO ATÉ', 'NOVEMBRO', 'VENDA MENSAL', '0M', '1M', '5M', '911 316  Kz', '5 100 000  Kz', 'MÉDIA MENSAL 2025', '1 000 000 Kz'];
    expect(lerDiapositivoMensal(pars)).toEqual({ mes: 10, valores: [911316, 5100000] });
    expect(lerDiapositivoMensal(['QUADRO GERAL'])).toBeNull();
  });

  it('tira o nome da loja do título', () => {
    expect(lerLoja(['LIVRARIA E EDITORA ADVENTISTA', 'LOJA DO HUAMBO'])).toBe('Huambo');
    expect(lerLoja(['Livraria e Editora Adventista · Loja de Catumbela · Outubro'])).toBe('Catumbela');
  });
});

describe('aplicarPptx', () => {
  it('um mês em branco não apaga; um valor igual ao kwanza fica com os cêntimos', () => {
    const actuais = [100, 551909.65, 300, null, ...Array(8).fill(null)];
    const pptx = [100, 551910, 350, 400, null, ...Array(7).fill(null)];
    const { meses, mudou } = aplicarPptx(actuais, pptx);
    expect(meses.slice(0, 4)).toEqual([100, 551909.65, 350, 400]);
    expect(mudou).toEqual([{ i: 2, de: 300, para: 350 }, { i: 3, de: null, para: 400 }]);
  });
});

describe('lojaDoPptx', () => {
  const lojas = [
    { id: 'a', name: 'Livraria do Lubango', province: 'Huíla' },
    { id: 'b', name: 'Livraria do Huambo', province: 'Huambo' },
    { id: 'c', name: 'Livraria de Catumbela', province: 'Benguela' },
  ];
  it('encontra pelo nome ou pela província, sem acentos', () => {
    expect(lojaDoPptx('Huambo', lojas).id).toBe('b');
    expect(lojaDoPptx('huila', lojas).id).toBe('a');
    expect(lojaDoPptx('Luanda', lojas)).toBeNull();
    expect(lojaDoPptx(null, lojas)).toBeNull();
  });
});
