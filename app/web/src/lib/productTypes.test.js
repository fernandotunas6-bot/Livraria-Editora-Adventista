import { describe, expect, it } from 'vitest';
import { PRODUCT_TYPES, cartItemTitle, cartVariantLabel, isBookType, looksLikeProductCode, normalizeProductCode, productTypeLabel } from './productTypes';

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
