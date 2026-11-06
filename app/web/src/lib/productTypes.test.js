import { describe, expect, it } from 'vitest';
import { PRODUCT_TYPES, cartItemTitle, cartVariantLabel, isBookType, looksLikeProductCode, normalizeProductCode, needsVariantChoice, productTypeLabel, variantNames, hasReadingSample } from './productTypes';

describe('productTypes', () => {
  it('normaliza códigos escritos de várias formas', () => {
    expect(normalizeProductCode('liv-63')).toBe('LIV-063');
    expect(normalizeProductCode('LIV063')).toBe('LIV-063');
    expect(normalizeProductCode(' uni 4 ')).toBe('UNI-004');
    expect(normalizeProductCode('dbv-0012')).toBe('DBV-012');
    expect(normalizeProductCode('Nisto')).toBe('NISTO');
  });

  it('só reconhece prefixos que existem', () => {
    expect(looksLikeProductCode('liv-63')).toBe(true);
    expect(looksLikeProductCode('VES 1')).toBe(true);
    expect(looksLikeProductCode('abc-12')).toBe(false);
    expect(looksLikeProductCode('livro')).toBe(false);
  });

  it('cada tipo tem prefixo único de três letras', () => {
    const prefixes = PRODUCT_TYPES.map((t) => t.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) expect(p).toMatch(/^[A-Z]{3}$/);
  });

  it('tipo desconhecido conta como livro', () => {
    expect(productTypeLabel('xyz')).toBe('Livro');
    expect(isBookType('uniforme')).toBe(false);
    expect(isBookType(undefined)).toBe(true);
  });
});

describe('cartVariantLabel e cartItemTitle', () => {
  it('diz o tamanho ou a edição escolhida', () => {
    expect(cartVariantLabel({ id: 'abc-v1', title: 'M', format: 'Azul' })).toBe('M · Azul');
    expect(cartItemTitle({ product: { title: 'Uniforme — camisa' }, variant: { id: 'abc-v0', title: 'L' } })).toBe('Uniforme — camisa (L)');
  });
  it('não repete o mesmo texto nem fala da variante única', () => {
    expect(cartVariantLabel({ id: 'abc-v2', title: 'Capa dura', format: 'Capa dura' })).toBe('Capa dura');
    expect(cartVariantLabel({ id: 'abc', title: 'Standard' })).toBe('');
    expect(cartItemTitle({ product: { title: 'Nisto Cremos' }, variant: { id: 'abc', title: 'Standard' } })).toBe('Nisto Cremos');
    expect(cartItemTitle({})).toBe('Produto');
  });
});

describe('variantNames', () => {
  it('tamanhos na roupa, edições nos livros, opções no resto', () => {
    expect(variantNames('uniforme').one).toBe('Tamanho');
    expect(variantNames('vestuario').many).toBe('Tamanhos');
    expect(variantNames('desbravadores').one).toBe('Tamanho');
    expect(variantNames('livro').one).toBe('Edição');
    expect(variantNames('biblia').many).toBe('Edições');
    expect(variantNames('papelaria').one).toBe('Opção');
    expect(variantNames(undefined).one).toBe('Edição');
    expect(variantNames('uniforme').soldOut).toMatch(/tamanho esgotou/);
    expect(variantNames('livro').ask).toBe('escolha a edição');
  });
});

describe('needsVariantChoice', () => {
  it('só os produtos com variantes obrigam a escolher', () => {
    expect(needsVariantChoice({ versions: [{ label: 'M' }] })).toBe(true);
    expect(needsVariantChoice({ versions: [] })).toBe(false);
    expect(needsVariantChoice({})).toBe(false);
    expect(needsVariantChoice(null)).toBe(false);
  });
});

describe('hasReadingSample', () => {
  it('só com páginas carregadas e a pré-visualização ligada', () => {
    expect(hasReadingSample({ preview_enabled: true, sample_pages: ['https://x/p1.jpg'] })).toBe(true);
    expect(hasReadingSample({ preview_enabled: true, sample_pages: [{ url: 'https://x/p1.jpg' }] })).toBe(true);
    expect(hasReadingSample({ preview_enabled: false, sample_pages: ['https://x/p1.jpg'] })).toBe(false);
    expect(hasReadingSample({ preview_enabled: true, sample_pages: [] })).toBe(false);
    expect(hasReadingSample({ preview_enabled: true, sample_pages: ['', { url: '' }] })).toBe(false);
    expect(hasReadingSample({})).toBe(false);
  });
});
