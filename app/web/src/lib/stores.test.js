import { describe, expect, it } from 'vitest';
import {
  GALERIA_MAX_FOTOS, GALERIA_MAX_LEGENDA, erroDaGaleria, fotoDaLoja, galeriaParaGuardar, lojaSrcSet,
  storeGallery,
} from './stores';

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

describe('galeriaParaGuardar', () => {
  it('apara as legendas e deita fora as entradas vazias', () => {
    expect(galeriaParaGuardar([
      { url: ' /a.webp ', caption: '  Balcão  ' },
      { url: '', caption: 'sem ficheiro' },
      { url: '/b.webp' },
    ])).toEqual([{ url: '/a.webp', caption: 'Balcão' }, { url: '/b.webp', caption: '' }]);
  });

  it('corta a legenda ao limite', () => {
    const [foto] = galeriaParaGuardar([{ url: '/a.webp', caption: 'x'.repeat(200) }]);
    expect(foto.caption).toHaveLength(GALERIA_MAX_LEGENDA);
  });

  it('não guarda fotografias ainda a ser enviadas', () => {
    expect(galeriaParaGuardar([{ url: 'blob:http://localhost/abc' }, { url: '/a.webp' }]))
      .toEqual([{ url: '/a.webp', caption: '' }]);
  });

  it('fica-se pelo número máximo de fotografias', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => ({ url: `/${i}.webp` }));
    expect(galeriaParaGuardar(muitas)).toHaveLength(GALERIA_MAX_FOTOS);
  });

  it('aguenta o que não é lista', () => {
    expect(galeriaParaGuardar(null)).toEqual([]);
  });
});

describe('erroDaGaleria', () => {
  it('não vê problema numa galeria normal', () => {
    expect(erroDaGaleria([{ url: '/a.webp', caption: 'Balcão' }])).toBe('');
    expect(erroDaGaleria([])).toBe('');
  });

  it('avisa enquanto uma fotografia está a ser enviada', () => {
    expect(erroDaGaleria([{ url: 'blob:http://localhost/abc' }])).toMatch(/a ser enviada/);
  });

  it('avisa quando passa do número máximo', () => {
    const muitas = Array.from({ length: GALERIA_MAX_FOTOS + 1 }, (_, i) => ({ url: `/${i}.webp` }));
    expect(erroDaGaleria(muitas)).toMatch(/no máximo/);
  });

  it('avisa quando ocupa espaço a mais, antes de a base de dados recusar', () => {
    const grandes = Array.from({ length: GALERIA_MAX_FOTOS }, (_, i) => ({
      url: `https://exemplo.invalid/storage/v1/object/public/media/physical_stores/uploads/${'x'.repeat(200)}-${i}.webp`,
      caption: 'y'.repeat(GALERIA_MAX_LEGENDA),
    }));
    expect(erroDaGaleria(grandes)).toMatch(/espaço/);
  });
});

describe('fotoDaLoja', () => {
  it('usa a miniatura escolhida', () => {
    expect(fotoDaLoja({ image_url: '/escolhida.webp', gallery: [{ url: '/primeira.webp' }] }))
      .toBe('/escolhida.webp');
  });

  it('sem miniatura, usa a primeira da galeria', () => {
    expect(fotoDaLoja({ image_url: '', gallery: [{ url: '/primeira.webp' }, { url: '/outra.webp' }] }))
      .toBe('/primeira.webp');
  });

  it('sem nada, não devolve nada', () => {
    expect(fotoDaLoja({ image_url: '   ' })).toBe('');
    expect(fotoDaLoja(null)).toBe('');
  });
});
