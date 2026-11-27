// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { capaGerada, linhas } from '@/lib/capaGerada';

const svg = (url) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

describe('a capa gerada dos livros sem fotografia', () => {
  it('é um SVG com o título, o autor e o nome da livraria', () => {
    const s = svg(capaGerada({ title: 'O Desejado de Todas as Nações', author: 'Ellen G. White', genre: 'Ellen G. White' }));
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toContain('O Desejado');
    expect(s).toContain('Ellen G. White');
    expect(s).toContain('Livraria Adventista');
    expect(s).not.toContain('No Image');
  });

  it('o mesmo livro dá sempre a mesma capa, e o género escolhe a cor', () => {
    const a = capaGerada({ title: 'A', genre: 'Bíblias' });
    expect(capaGerada({ title: 'A', genre: 'Bíblias' })).toBe(a);
    expect(svg(capaGerada({ title: 'B', genre: 'Bíblias' })).match(/stop-color="(#[0-9a-f]+)"/)[1]).toBe(svg(a).match(/stop-color="(#[0-9a-f]+)"/)[1]);
  });

  it('escapa o que podia partir o SVG', () => {
    const s = svg(capaGerada({ title: 'Fé & <Doutrina> "nova"' }));
    expect(s).toContain('Fé &amp; &lt;Doutrina&gt;');
    expect(s).not.toContain('<Doutrina>');
  });

  it('parte o título em linhas sem cortar palavras, e põe «…» no que não cabe', () => {
    expect(linhas('Patriarcas e Profetas', 16)).toEqual(['Patriarcas e', 'Profetas']);
    const l = linhas('um dois três quatro cinco seis sete oito nove dez onze doze treze', 8, 3);
    expect(l).toHaveLength(3);
    expect(l[2].endsWith('…')).toBe(true);
    expect(linhas('', 16)).toEqual([]);
  });
});
