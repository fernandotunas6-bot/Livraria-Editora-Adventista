// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dataClient', () => ({ default: {} }));
vi.mock('@/lib/supabaseClient', () => ({ APP_API_URL: '', mediaUrl: (x) => x, supabase: {} }));

const { variantStock, withVariantImages } = await import('./EcommerceApi');

describe('variantStock', () => {
  it('nunca passa o stock do produto, que o place_order também verifica', () => {
    expect(variantStock({ stock: 2 }, { stock: 10 })).toBe(2);
    expect(variantStock({ stock: 10 }, { stock: 3 })).toBe(3);
    expect(variantStock({ stock: 10 }, { stock: 0 })).toBe(0);
  });
  it('sem stock próprio, usa o do produto', () => {
    expect(variantStock({ stock: 5 }, {})).toBe(5);
    expect(variantStock({ stock: 5 }, { stock: '' })).toBe(5);
    expect(variantStock({ stock: 5 }, { stock: null })).toBe(5);
    expect(variantStock({ stock: 5 }, { stock: 'abc' })).toBe(5);
  });
  it('valores estranhos não dão stock negativo', () => {
    expect(variantStock({ stock: -3 }, { stock: 4 })).toBe(0);
    expect(variantStock({}, { stock: -1 })).toBe(0);
  });
});

describe('withVariantImages', () => {
  it('junta a capa de cada variante à galeria, sem repetir e pela ordem', () => {
    const imgs = [{ url: '/a.webp' }];
    const vs = [{ image_url: '/a.webp' }, { image_url: '/b.webp' }, { image_url: '/b.webp' }, { image_url: null }, { image_url: '/c.webp' }];
    expect(withVariantImages(imgs, vs).map((i) => i.url)).toEqual(['/a.webp', '/b.webp', '/c.webp']);
    expect(imgs).toHaveLength(1); // não mexe na lista original
  });
  it('sem imagens nem variantes', () => {
    expect(withVariantImages(undefined, undefined)).toEqual([]);
    expect(withVariantImages([], [{ image_url: '/x.webp' }])).toEqual([{ url: '/x.webp' }]);
  });
});
