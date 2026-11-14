import { describe, expect, it } from 'vitest';
import { cidadeDaLoja, lojaDe } from './painel.js';

const loja = (name) => ({ id: 'x', name, province: '' });

describe('lojaDe', () => {
  it('diz cada loja como nos relatórios que ela manda', () => {
    expect(lojaDe(loja('Livraria Adventista — Huambo'))).toBe('Loja do Huambo');
    expect(lojaDe(loja('Livraria Adventista — Lubango'))).toBe('Loja do Lubango');
    expect(lojaDe(loja('Livraria Adventista — Catumbela'))).toBe('Loja de Catumbela');
  });

  it('usa o artigo de cada terra, mesmo com acentos', () => {
    expect(lojaDe(loja('Livraria Adventista — Benguela'))).toBe('Loja de Benguela');
    expect(lojaDe(loja('Livraria Adventista — Luanda'))).toBe('Loja de Luanda');
    expect(lojaDe(loja('Livraria Adventista — Uíge'))).toBe('Loja do Uíge');
    expect(lojaDe(loja('Livraria Adventista — Huíla'))).toBe('Loja da Huíla');
    expect(lojaDe(loja('Livraria Adventista — Huambo (Cidade Alta)'))).toBe('Loja do Huambo (Cidade Alta)');
  });

  it('sem loja escolhida, é a do Huambo, como antes da escolha de loja', () => {
    expect(lojaDe(null)).toBe('Loja do Huambo');
    expect(lojaDe(undefined)).toBe('Loja do Huambo');
  });

  it('com um nome fora do modelo, fica o nome da loja', () => {
    expect(lojaDe(loja('Loja Central'))).toBe('Loja Central');
    expect(lojaDe(loja('Livraria Adventista'))).toBe('Livraria Adventista');
    expect(lojaDe(loja(''))).toBe('Loja do Huambo');
  });
});

describe('cidadeDaLoja', () => {
  it('tira a cidade do nome, com travessão, hífen ou só espaço', () => {
    expect(cidadeDaLoja(loja('Livraria Adventista — Lubango'))).toBe('Lubango');
    expect(cidadeDaLoja(loja('LIvraria Adventista - Huambo'))).toBe('Huambo');
    expect(cidadeDaLoja(loja('Livraria e Editora Adventista – Catumbela'))).toBe('Catumbela');
    expect(cidadeDaLoja(loja('Livraria Adventista Lubango'))).toBe('Lubango');
  });

  it('fica vazia quando o nome não traz cidade', () => {
    expect(cidadeDaLoja(loja('Livraria Adventista'))).toBe('');
    expect(cidadeDaLoja(loja('Loja Central'))).toBe('');
    expect(cidadeDaLoja(null)).toBe('');
  });
});
