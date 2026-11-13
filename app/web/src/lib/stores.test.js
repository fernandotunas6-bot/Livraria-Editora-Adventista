import { describe, expect, it } from 'vitest';
import { lojaSrcSet, storeGallery } from './stores';

describe('lojaSrcSet', () => {
  it('dá as duas variantes de uma fotografia do próprio site', () => {
    expect(lojaSrcSet('/images/lojas/huambo-1.webp')).toBe(
      '/images/lojas/480/huambo-1.webp 480w, /images/lojas/huambo-1.webp 1280w');
  });

  it('ignora a versão na URL', () => {
    expect(lojaSrcSet('/images/lojas/huambo-1.webp?v=3')).toContain('/images/lojas/480/huambo-1.webp 480w');
  });

  it('fica vazio para imagens que não têm variante gerada', () => {
    // Carregadas no painel (Storage, Drive) ou noutra pasta: só existe o ficheiro original.
    expect(lojaSrcSet('https://exemplo.com/loja.jpg')).toBe('');
    expect(lojaSrcSet('/images/site/loja-banner.webp')).toBe('');
    expect(lojaSrcSet('/images/lojas/480/huambo-1.webp')).toBe('');
    expect(lojaSrcSet('')).toBe('');
    expect(lojaSrcSet(undefined)).toBe('');
  });
});

describe('storeGallery', () => {
  it('lê a lista de objectos guardada na coluna', () => {
    expect(storeGallery({ gallery: [{ url: '/images/lojas/huambo-1.webp', caption: 'Balcão' }] }))
      .toEqual([{ url: '/images/lojas/huambo-1.webp', caption: 'Balcão' }]);
  });

  it('aceita URLs soltas, sem legenda', () => {
    expect(storeGallery({ gallery: ['/a.webp', '/b.webp'] }))
      .toEqual([{ url: '/a.webp', caption: '' }, { url: '/b.webp', caption: '' }]);
  });

  it('aceita a coluna como texto JSON', () => {
    expect(storeGallery({ gallery: '[{"url":"/a.webp"}]' })).toEqual([{ url: '/a.webp', caption: '' }]);
  });

  it('devolve lista vazia quando não há galeria ou está mal formada', () => {
    expect(storeGallery(null)).toEqual([]);
    expect(storeGallery({})).toEqual([]);
    expect(storeGallery({ gallery: '{isto não é json' })).toEqual([]);
    expect(storeGallery({ gallery: { url: '/a.webp' } })).toEqual([]);
  });

  it('deita fora as entradas sem URL', () => {
    expect(storeGallery({ gallery: [{ caption: 'sem ficheiro' }, '/b.webp', null] }))
      .toEqual([{ url: '/b.webp', caption: '' }]);
  });
});
