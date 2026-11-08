import { describe, expect, it } from 'vitest';
import {
  cartDigitalState, isDigitalCartItem, isDigitalEdition, isDigitalOrder, productHasDigital, productOnlyDigital,
  titleList, variantIndexOf, versionIsDigital,
} from './digitalEditions';
import { calcShippingCents, getShippingLabel } from './shipping';
import { paymentAllowedForShipping, paymentMethodsFor, paymentMoment } from './paymentMethods';
import { orderDeliveryAddress } from './orderUtils';

// A mesma regra que private.item_digital (base de dados) e digitalBooks.ts (Edge Function).
const LIVRO = { id: 'liv', versions: [{ label: 'Impresso' }, { label: 'Edição digital', format: 'PDF', digital: true }] };
const REVISTA = { id: 'rev', versions: [], digital: true };
const BIBLIA = { id: 'bib', versions: [] };
const LICAO = { id: 'lic', versions: [{ label: 'PDF', digital: true }, { label: 'ePub', digital: 'true' }] };

describe('edições digitais', () => {
  it('versionIsDigital aceita true e texto', () => {
    expect(versionIsDigital({ digital: true })).toBe(true);
    expect(versionIsDigital({ digital: 'sim' })).toBe(true);
    expect(versionIsDigital({ digital: false })).toBe(false);
    expect(versionIsDigital({ format: 'PDF' })).toBe(false);
    expect(versionIsDigital(null)).toBe(false);
  });

  it('isDigitalEdition: com variantes decide a variante; sem variantes, o produto', () => {
    expect(isDigitalEdition(LIVRO, 1)).toBe(true);
    expect(isDigitalEdition(LIVRO, 0)).toBe(false);
    expect(isDigitalEdition(LIVRO, null)).toBe(false);
    expect(isDigitalEdition(LIVRO, '1')).toBe(true);
    expect(isDigitalEdition(REVISTA, null)).toBe(true);
    expect(isDigitalEdition(REVISTA, 0)).toBe(false);
    expect(isDigitalEdition(BIBLIA, null)).toBe(false);
  });

  it('o produto tem, ou só tem, edições digitais', () => {
    expect(productHasDigital(LIVRO)).toBe(true);
    expect(productOnlyDigital(LIVRO)).toBe(false);
    expect(productOnlyDigital(LICAO)).toBe(true);
    expect(productOnlyDigital(REVISTA)).toBe(true);
    expect(productHasDigital(BIBLIA)).toBe(false);
  });

  it('variantIndexOf lê o id do carrinho', () => {
    expect(variantIndexOf('liv-v1')).toBe(1);
    expect(variantIndexOf('liv-default')).toBeNull();
  });

  it('cartDigitalState: só digitais, misto, e o subtotal do que se envia', () => {
    const digital = { product: { title: 'O Desejado' }, variant: { id: 'liv-v1', digital: true, price_in_cents: 300_000 }, quantity: 1 };
    const revista = { product: { title: 'Revista' }, variant: { id: 'rev-default', digital: true, price_in_cents: 120_000, sale_price_in_cents: 100_000 }, quantity: 1 };
    const biblia = { product: { title: 'Bíblia' }, variant: { id: 'bib-default', price_in_cents: 1_500_000 }, quantity: 2 };
    expect(isDigitalCartItem(digital)).toBe(true);
    expect(cartDigitalState([digital, revista])).toEqual({ all: true, any: true, physicalCents: 0, titles: ['O Desejado', 'Revista'] });
    expect(cartDigitalState([digital, biblia])).toEqual({ all: false, any: true, physicalCents: 3_000_000, titles: ['O Desejado'] });
    expect(cartDigitalState([biblia])).toMatchObject({ all: false, any: false, physicalCents: 3_000_000 });
    expect(cartDigitalState([])).toMatchObject({ all: false, any: false, physicalCents: 0 });
    expect(titleList(['A', 'B', 'C'])).toBe('A, B e C');
  });

  it('o envio "digital" não tem portes, e diz-se "Edição digital (sem envio)"', () => {
    expect(calcShippingCents('digital', 0, {})).toBe(0);
    expect(calcShippingCents('delivery', 0, {})).toBe(150_000);
    expect(getShippingLabel('digital')).toBe('Edição digital (sem envio)');
  });

  it('pagamentos: a edição digital só com o que se paga antes ou pelo gateway, ou com "digital" marcado', () => {
    const transferencia = { code: 'transferencia', type: 'transfer', shipping_methods: null };
    const entrega = { code: 'entrega', type: 'offline', shipping_methods: null };
    const balcao = { code: 'balcao', type: 'offline', shipping_methods: ['pickup'] };
    const gateway = { code: 'emis', type: 'offline', automatic: true, shipping_methods: null };
    const balcaoDigital = { code: 'balcao2', type: 'offline', shipping_methods: ['pickup', 'digital'] };
    expect(paymentMethodsFor([transferencia, entrega, balcao, gateway, balcaoDigital], 'digital').map((m) => m.code))
      .toEqual(['transferencia', 'emis', 'balcao2']);
    expect(paymentAllowedForShipping(entrega, 'delivery')).toBe(true);
    expect(paymentMoment(transferencia, 'digital')).toBe('paga depois de encomendar');
    expect(paymentMoment(balcaoDigital, 'digital')).toBe('paga na loja');
  });

  it('a encomenda digital não tem morada', () => {
    expect(isDigitalOrder({ shipping_method: 'digital' })).toBe(true);
    expect(orderDeliveryAddress({ shipping_method: 'digital', delivery_address_full: 'Rua 1' })).toBe('');
  });
});
