// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { CAPAS_DO_CATALOGO, baralhar, capasParaFundo, emColunas, pintarMaisVendidos, pintarParede } from './capas-de-fundo';

describe('capasParaFundo', () => {
  it('põe primeiro as capas dos mais vendidos, sem repetidos, e completa com o catálogo', () => {
    const itens = [{ capa: '/images/capas/LIV-011.jpg' }, { capa: '' }, { capa: '/images/capas/LIV-011.jpg' }, { capa: 'https://x.supabase.co/m.jpg' }];
    const r = capasParaFundo(itens, { n: 10, chave: 'Huambo:2026' });
    expect(r).toHaveLength(10);
    expect(r.slice(0, 2)).toEqual(['/images/capas/LIV-011.jpg', 'https://x.supabase.co/m.jpg']);
    expect(new Set(r).size).toBe(10);
    r.slice(2).forEach((u) => expect(CAPAS_DO_CATALOGO).toContain(u));
  });

  it('a mesma chave dá sempre a mesma ordem; outra chave, outra ordem', () => {
    expect(capasParaFundo([], { n: 12, chave: 'a' })).toEqual(capasParaFundo([], { n: 12, chave: 'a' }));
    expect(capasParaFundo([], { n: 12, chave: 'a' })).not.toEqual(capasParaFundo([], { n: 12, chave: 'b' }));
    expect(baralhar([1, 2, 3, 4, 5], 'x').sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('as capas do catálogo são do próprio site (o canvas dos vídeos desenha-as sem CORS)', () => {
    CAPAS_DO_CATALOGO.forEach((u) => expect(u).toMatch(/^\/images\/capas\/(LIV|COL)-\d{3}\.jpg$/));
  });
});

describe('emColunas', () => {
  it('reparte as capas alternadas pelas colunas', () => {
    expect(emColunas(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'c', 'e'], ['b', 'd']]);
    expect(emColunas([], 3)).toEqual([[], [], []]);
  });
});

describe('pintarParede', () => {
  it('monta as colunas com cada capa duas vezes, em moldura (fundo desfocado + capa inteira)', () => {
    const c = document.createElement('div');
    c.hidden = true;
    pintarParede(c, ['/a.jpg', '/b.jpg', '/c.jpg'], { colunas: 2 });
    expect(c.hidden).toBe(false);
    const cols = c.querySelectorAll('.hc-col');
    expect(cols).toHaveLength(2);
    expect(cols[0].querySelectorAll('.hc')).toHaveLength(4); // a, c, a, c
    expect(cols[0].querySelector('.hc-f').getAttribute('src')).toBe('/a.jpg');
    expect(cols[0].querySelector('.hc-c').getAttribute('src')).toBe('/a.jpg');
    // Pintar outra vez o mesmo não refaz o DOM.
    const antes = c.firstChild;
    pintarParede(c, ['/a.jpg', '/b.jpg', '/c.jpg'], { colunas: 2 });
    expect(c.firstChild).toBe(antes);
  });

  it('uma capa que não carrega sai da parede', () => {
    const c = document.createElement('div');
    pintarParede(c, ['/a.jpg'], { colunas: 1 });
    c.querySelector('.hc-c').dispatchEvent(new Event('error'));
    expect(c.querySelectorAll('.hc')).toHaveLength(1);
  });
});

describe('pintarMaisVendidos', () => {
  const fmt = { unid: (n) => `${n} unidades`, kz: (v) => `${v} Kz` };

  it('mostra a posição, a capa em moldura, o título, as unidades e o valor', () => {
    const ol = document.createElement('ol');
    pintarMaisVendidos(ol, [
      { titulo: 'Daniel', capa: '/images/capas/LIV-026.jpg', unidades: 51, valor: 357000 },
      { titulo: 'Sem capa', capa: '', unidades: 3, valor: null },
    ], { fmt });
    const li = ol.querySelectorAll('li');
    expect(li).toHaveLength(2);
    expect(li[0].querySelector('.mv-pos').textContent).toBe('1.º');
    expect(li[0].querySelector('.hc-c').getAttribute('alt')).toBe('Capa de Daniel');
    expect(li[0].querySelector('.mv-t').textContent).toBe('Daniel51 unidades · 357000 Kz');
    expect(li[1].querySelector('.hc-sem').textContent).toBe('Sem capa');
    expect(li[1].querySelector('.mv-t span').textContent).toBe('3 unidades');
  });

  it('se a capa não carrega, fica a capa tipográfica, com a posição', () => {
    const ol = document.createElement('ol');
    pintarMaisVendidos(ol, [{ titulo: 'Daniel', capa: '/x.jpg', unidades: 1 }], { fmt });
    ol.querySelector('.hc-c').dispatchEvent(new Event('error'));
    expect(ol.querySelector('.hc-sem').textContent).toBe('Daniel');
    expect(ol.querySelector('.mv-pos').textContent).toBe('1.º');
  });
});
