// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { cidadeDaLoja, diapositivos, fotosDaLoja, lojaDe } from './painel.js';

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

describe('fotosDaLoja', () => {
  it('aceita a galeria com ou sem legendas e fica com as do site ou https', () => {
    const store = { fotos: ['/images/lojas/huambo-1.webp', { url: 'https://x.supabase.co/a.webp', caption: 'A equipa' }, { url: 'http://inseguro/b.jpg' }, 'javascript:alert(1)', '//outro.site/c.jpg', ''] };
    expect(fotosDaLoja(store)).toEqual([
      { url: '/images/lojas/huambo-1.webp', caption: '' },
      { url: 'https://x.supabase.co/a.webp', caption: 'A equipa' },
    ]);
  });

  it('tira as repetidas e fica pelo limite', () => {
    const fotos = ['/a.webp', '/a.webp', '/b.webp', '/c.webp'];
    expect(fotosDaLoja({ fotos }, 2).map((f) => f.url)).toEqual(['/a.webp', '/b.webp']);
  });

  it('sem loja ou sem galeria, nenhuma', () => {
    expect(fotosDaLoja(null)).toEqual([]);
    expect(fotosDaLoja({ name: 'X' })).toEqual([]);
  });
});

describe('diapositivos', () => {
  const rows = [{ mes: 'Janeiro' }, { mes: 'Fevereiro', fora: true }, { mes: 'Março' }];
  const ks = (l) => l.map((x) => (x.k === 'mes' ? x.r.mes : x.k));

  it('sem imagens, a sequência de sempre', () => {
    expect(ks(diapositivos(rows))).toEqual(['capa', 'resumo', 'Janeiro', 'Março', 'quadro', 'acum', 'persp']);
  });

  it('com fotografias da loja e mais vendidos, entram depois da capa e do resumo', () => {
    expect(ks(diapositivos(rows, { fotos: 3, maisVendidos: 6 }))).toEqual(['capa', 'loja', 'resumo', 'mv', 'Janeiro', 'Março', 'quadro', 'acum', 'persp']);
  });
});
