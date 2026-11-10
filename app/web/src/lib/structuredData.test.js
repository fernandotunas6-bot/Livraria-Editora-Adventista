import { describe, expect, it } from 'vitest';
import {
  SCHEMA_CURRENCY, breadcrumbJsonLd, isbn13, jsonLdString, languageCode, plainText, productJsonLd,
} from './structuredData.js';

const ORIGIN = 'https://livrariaadventista.ao';

// A forma que o `api/EcommerceApi.js` devolve (bookToProduct).
const book = (over = {}) => ({
  id: 'abc123',
  title: 'O Desejado de Todas as Nações',
  author: 'Ellen G. White',
  description: '<p>A vida de <strong>Cristo</strong>&nbsp;contada &amp; explicada.</p>',
  images: [{ url: 'https://cdn.exemplo.invalid/capa.jpg' }],
  price_in_cents: 1250000,
  purchasable: true,
  on_sale: false,
  sale_ends_at: null,
  type: { value: 'Fé & Doutrina' },
  product_type: 'livro',
  book_code: 'LIV-0001',
  sku: 'LIV-0001',
  isbn: '',
  publisher: 'Publicadora Atlântico',
  language: 'Português',
  pages: 840,
  year: 2019,
  variants: [{ id: 'abc123-default', price_in_cents: 1250000, sale_price_in_cents: null, inventory_quantity: 3 }],
  ...over,
});

describe('productJsonLd', () => {
  it('um livro é Product e Book, com o preço em kwanzas e o endereço oficial', () => {
    const data = productJsonLd(book(), { origin: ORIGIN, isBook: true });
    expect(data['@type']).toEqual(['Product', 'Book']);
    expect(data.name).toBe('O Desejado de Todas as Nações');
    expect(data.url).toBe(`${ORIGIN}/product/abc123`);
    expect(data.image).toEqual(['https://cdn.exemplo.invalid/capa.jpg']);
    expect(data.description).toBe('A vida de Cristo contada & explicada.');
    expect(data.author).toEqual({ '@type': 'Person', name: 'Ellen G. White' });
    expect(data.numberOfPages).toBe(840);
    expect(data.inLanguage).toBe('pt');
    expect(data.datePublished).toBe('2019');
    expect(data.sku).toBe('LIV-0001');
    expect(data.category).toBe('Fé & Doutrina');
    expect(data.offers).toEqual({
      '@type': 'Offer',
      url: `${ORIGIN}/product/abc123`,
      priceCurrency: SCHEMA_CURRENCY,
      price: '12500.00',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Livraria Adventista' },
    });
  });

  it('o que não é livro fica só Product, sem autor nem páginas', () => {
    const data = productJsonLd(book({ product_type: 'vestuario' }), { origin: ORIGIN, isBook: false });
    expect(data['@type']).toBe('Product');
    expect(data.author).toBeUndefined();
    expect(data.numberOfPages).toBeUndefined();
  });

  it('esgotado diz OutOfStock; sem preço, sai sem oferta', () => {
    expect(productJsonLd(book({ purchasable: false }), { origin: ORIGIN }).offers.availability)
      .toBe('https://schema.org/OutOfStock');
    const free = book({ price_in_cents: 0, variants: [{ id: 'x', price_in_cents: 0, sale_price_in_cents: null }] });
    expect(productJsonLd(free, { origin: ORIGIN }).offers).toBeUndefined();
  });

  it('a promoção usa o preço de promoção e diz até quando vale', () => {
    const data = productJsonLd(book({
      on_sale: true,
      sale_ends_at: '2026-12-31T22:59:00Z',
      variants: [{ id: 'abc123-default', price_in_cents: 1250000, sale_price_in_cents: 999900 }],
    }), { origin: ORIGIN, isBook: true });
    expect(data.offers.price).toBe('9999.00');
    expect(data.offers.priceValidUntil).toBe('2026-12-31');
  });

  it('a variante escolhida manda no preço', () => {
    const data = productJsonLd(book(), {
      origin: ORIGIN,
      variant: { id: 'abc123-v1', price_in_cents: 1800000, sale_price_in_cents: null },
    });
    expect(data.offers.price).toBe('18000.00');
  });

  it('o ISBN só entra quando é um ISBN-13 válido', () => {
    expect(productJsonLd(book({ isbn: '978-0-306-40615-7' }), { origin: ORIGIN, isBook: true }).isbn).toBe('9780306406157');
    expect(productJsonLd(book({ isbn: '9780306406158' }), { origin: ORIGIN, isBook: true }).isbn).toBeUndefined();
  });

  it('capas com caminho relativo passam a endereço completo; as estranhas ficam de fora', () => {
    const data = productJsonLd(book({ images: [{ url: '/images/capas/x.jpg' }, { url: 'javascript:alert(1)' }, { url: '' }] }), { origin: ORIGIN });
    expect(data.image).toEqual([`${ORIGIN}/images/capas/x.jpg`]);
  });

  it('sem id, título ou origem não há dados', () => {
    expect(productJsonLd(null, { origin: ORIGIN })).toBeNull();
    expect(productJsonLd(book({ title: '' }), { origin: ORIGIN })).toBeNull();
    expect(productJsonLd(book(), {})).toBeNull();
  });
});

describe('breadcrumbJsonLd', () => {
  it('numera o caminho e salta os passos sem nome', () => {
    const data = breadcrumbJsonLd([
      { name: 'Início', url: `${ORIGIN}/` },
      { name: 'Loja', url: `${ORIGIN}/shop` },
      { name: '', url: `${ORIGIN}/shop?category=` },
      { name: 'Livro', url: `${ORIGIN}/product/abc123` },
    ]);
    expect(data.itemListElement.map((i) => [i.position, i.name])).toEqual([[1, 'Início'], [2, 'Loja'], [3, 'Livro']]);
  });
  it('um passo só não é caminho', () => {
    expect(breadcrumbJsonLd([{ name: 'Início', url: `${ORIGIN}/` }])).toBeNull();
  });
});

describe('jsonLdString', () => {
  it('um título com </script> não fecha o bloco, e o JSON continua igual', () => {
    const text = jsonLdString({ name: 'Livro </script><script>alert(1)</script>' });
    expect(text).not.toContain('</script>');
    expect(JSON.parse(text).name).toBe('Livro </script><script>alert(1)</script>');
  });
  it('vários blocos vão numa lista; nenhum dá texto vazio', () => {
    expect(JSON.parse(jsonLdString([{ a: 1 }, null, { b: 2 }]))).toEqual([{ a: 1 }, { b: 2 }]);
    expect(jsonLdString([null])).toBe('');
  });
});

describe('auxiliares', () => {
  it('languageCode', () => {
    expect(languageCode('Português')).toBe('pt');
    expect(languageCode('INGLÊS')).toBe('en');
    expect(languageCode('pt-AO')).toBe('pt-AO');
    expect(languageCode('Klingon')).toBeNull();
  });
  it('isbn13', () => {
    expect(isbn13('9780306406157')).toBe('9780306406157');
    expect(isbn13('0306406152')).toBeNull();
    expect(isbn13('')).toBeNull();
  });
  it('plainText corta descrições enormes', () => {
    expect(plainText(`<p>${'a'.repeat(6000)}</p>`).length).toBeLessThanOrEqual(5000);
  });
});
