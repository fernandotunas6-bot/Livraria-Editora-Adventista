// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  GALERIA_MAX_FOTOS, GALERIA_MAX_LEGENDA, GALERIA_MOSAICO, conflitosDeZonas, erroDaGaleria, fotoDaLoja,
  galeriaParaGuardar, juntarNomes, lojaQueServe, lojaSrcSet, mapsUrl, mosaicoDaGaleria, provinciasServidas, storeGallery,
} from './stores';

describe('mapsUrl', () => {
  it('usa o link do painel quando é um endereço web', () => {
    expect(mapsUrl({ maps_url: 'https://maps.app.goo.gl/abc', latitude: -8.8, longitude: 13.2 })).toBe('https://maps.app.goo.gl/abc');
  });

  it('recusa o que não é um endereço web e vai pelas coordenadas', () => {
    for (const maps_url of ['javascript:alert(1)', 'maps.google.com/x', '/lojas', '  ']) {
      expect(mapsUrl({ maps_url, latitude: -8.8, longitude: 13.2 }), maps_url).toBe('https://www.google.com/maps?q=-8.8,13.2&z=16');
    }
  });

  it('sem link nem coordenadas, procura pelo nome e pela morada', () => {
    const url = mapsUrl({ name: 'Livraria do Lubango', address: 'Rua Principal', province: 'Huíla' });
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    expect(decodeURIComponent(url)).toContain('Livraria do Lubango, Rua Principal, Huíla, Angola');
  });
});

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


describe('mosaicoDaGaleria', () => {
  // Quantas células de uma grelha de quatro colunas ocupa cada peça.
  const celulas = (peca) => {
    const cols = Number(/col-span-(\d)/.exec(peca)[1]);
    const rows = Number(/row-span-(\d)/.exec(peca)[1]);
    return cols * rows;
  };

  it('a primeira fotografia é a grande', () => {
    expect(mosaicoDaGaleria(5)[0]).toBe('col-span-2 row-span-2');
    expect(mosaicoDaGaleria(9)[0]).toBe('col-span-2 row-span-2');
  });

  it('nenhuma linha fica com um buraco no canto, de uma a nove fotografias', () => {
    for (let n = 1; n <= GALERIA_MOSAICO; n += 1) {
      const pecas = mosaicoDaGaleria(n);
      expect(pecas, `${n} fotografias`).toHaveLength(n);
      const ocupadas = pecas.reduce((soma, p) => soma + celulas(p), 0);
      expect(ocupadas % 4, `${n} fotografias deixam ${ocupadas % 4} células por preencher`).toBe(0);
    }
  });

  it('acima do que cabe, fica-se pelas peças do mosaico', () => {
    expect(mosaicoDaGaleria(20)).toHaveLength(GALERIA_MOSAICO);
  });

  it('sem fotografias não há mosaico', () => {
    expect(mosaicoDaGaleria(0)).toEqual([]);
    expect(mosaicoDaGaleria(undefined)).toEqual([]);
    expect(mosaicoDaGaleria(-3)).toEqual([]);
  });
});

describe('as províncias que cada loja serve', () => {
  const lojas = [
    { id: 'hua', name: 'Livraria Adventista — Huambo', province: 'Huambo', service_provinces: ['Huambo'] },
    { id: 'lub', name: 'Livraria Adventista — Lubango', province: 'Huila', service_provinces: ['Huíla', 'Namibe', 'Cunene'] },
    { id: 'cat', name: 'Livraria Adventista — Catumbela', province: 'Benguela', service_provinces: ['Benguela', 'Cuanza Sul'] },
    { id: 'bie', name: 'Livraria Adventista — Bié', province: 'Bié', service_provinces: [] },
  ];

  it('lojaQueServe: a que tem a província na lista, sem ligar a acentos', () => {
    expect(lojaQueServe(lojas, 'Cuanza Sul').id).toBe('cat');
    expect(lojaQueServe(lojas, 'namibe').id).toBe('lub');
    expect(lojaQueServe(lojas, 'Huíla').id).toBe('lub');
    expect(lojaQueServe(lojas, 'Huambo').id).toBe('hua');
  });

  it('lojaQueServe: sem lista, a loja serve a sua província; sem loja nenhuma, null', () => {
    expect(lojaQueServe(lojas, 'Bie').id).toBe('bie');
    expect(lojaQueServe(lojas, 'Luanda')).toBeNull();
    expect(lojaQueServe(lojas, '')).toBeNull();
    expect(lojaQueServe(undefined, 'Huambo')).toBeNull();
  });

  it('lojaQueServe: a lista ganha à província da loja', () => {
    const duas = [{ id: 'a', province: 'Benguela', service_provinces: [] }, { id: 'b', province: 'Huambo', service_provinces: ['Benguela'] }];
    expect(lojaQueServe(duas, 'Benguela').id).toBe('b');
  });

  it('provinciasServidas e juntarNomes', () => {
    expect(juntarNomes(provinciasServidas(lojas[1]))).toBe('Huíla, Namibe e Cunene');
    expect(provinciasServidas(lojas[3])).toEqual(['Bié']);
    expect(provinciasServidas({})).toEqual([]);
    expect(juntarNomes(['Huambo'])).toBe('Huambo');
    expect(juntarNomes([])).toBe('');
  });

  it('conflitosDeZonas: províncias com duas lojas e províncias sem nenhuma', () => {
    const comRepetida = [...lojas, { id: 'x', name: 'Loja X', province: 'Luanda', service_provinces: ['Luanda', 'Namibe'] }];
    const { repetidas, semLoja } = conflitosDeZonas(comRepetida, ['Luanda', 'Namibe', 'Cuando', 'Huambo']);
    expect(repetidas).toEqual([{ provincia: 'Namibe', lojas: ['Livraria Adventista — Lubango', 'Loja X'] }]);
    expect(semLoja).toEqual(['Cuando']);
  });
});
