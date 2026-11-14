import { afterEach, describe, expect, it } from 'vitest';
import { criarSomDaApresentacao, instantesDosTiques, somLigadoGuardado } from './som-apresentacao.js';

describe('instantesDosTiques', () => {
  it('juntos no início e espaçados no fim, como uma máquina a abrandar', () => {
    const t = instantesDosTiques(900);
    expect(t.length).toBeGreaterThanOrEqual(8);
    expect(t.at(-1)).toBe(900);
    const passos = t.slice(1).map((x, i) => x - t[i]);
    expect(passos[0]).toBeLessThan(passos.at(-1));
    expect(passos.every((p) => p >= 25)).toBe(true);
  });
  it('entre 3 e 18 tiques; nada sem duração', () => {
    // 100 ms: 3 tiques pedidos, mas dois ficavam a menos de 25 ms um do outro.
    expect(instantesDosTiques(100)).toEqual([13, 100]);
    expect(instantesDosTiques(300)).toEqual([27, 62, 111, 300]);
    expect(instantesDosTiques(10000).length).toBeLessThanOrEqual(18);
    expect(instantesDosTiques(0)).toEqual([]);
  });
});

describe('criarSomDaApresentacao', () => {
  afterEach(() => { localStorage.clear(); });
  it('sem Web Audio, tudo é inofensivo e fica em silêncio', async () => {
    const som = criarSomDaApresentacao();
    expect(som.disponivel).toBe(false); // o jsdom não tem AudioContext
    expect(som.ligado()).toBe(false);
    await expect(som.iniciar()).resolves.toBe(false);
    expect(() => { som.novaCena(); som.tocar('caixa'); som.contar(900); som.fechar(); }).not.toThrow();
  });
  it('a escolha fica guardada no aparelho', () => {
    expect(somLigadoGuardado()).toBe(true);
    criarSomDaApresentacao().ligar(false);
    expect(somLigadoGuardado()).toBe(false);
    expect(localStorage.getItem('livraria_apresentacao_som')).toBe('desligado');
  });
});
