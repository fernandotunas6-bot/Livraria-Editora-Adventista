import { describe, expect, it } from 'vitest';
import { effectivePrice, isSaleActive, saleWindowOpen, variantPrices } from './pricing';

// Um instante fixo, para os testes não dependerem da hora a que correm.
const AGORA = Date.parse('2026-11-06T12:00:00Z');
const ANTES = '2026-11-01T00:00:00Z';
const DEPOIS = '2026-12-01T00:00:00Z';

describe('promoção do produto', () => {
  it('o promocional vale quando é menor e a janela está aberta', () => {
    expect(effectivePrice({ price: 1000, sale_price: 800 }, AGORA)).toBe(800);
    expect(isSaleActive({ price: 1000, sale_price: 800, sale_starts_at: ANTES, sale_ends_at: DEPOIS }, AGORA)).toBe(true);
  });

  it('um promocional igual ou acima do preço não é desconto', () => {
    expect(effectivePrice({ price: 1000, sale_price: 1000 }, AGORA)).toBe(1000);
    expect(effectivePrice({ price: 1000, sale_price: 1200 }, AGORA)).toBe(1000);
  });

  it('fora da janela de datas cobra o preço normal', () => {
    expect(effectivePrice({ price: 1000, sale_price: 800, sale_starts_at: DEPOIS }, AGORA)).toBe(1000);
    expect(effectivePrice({ price: 1000, sale_price: 800, sale_ends_at: ANTES }, AGORA)).toBe(1000);
  });
});

describe('saleWindowOpen', () => {
  it('sem datas está sempre aberta', () => {
    expect(saleWindowOpen({}, AGORA)).toBe(true);
  });

  it('respeita o início e o fim', () => {
    expect(saleWindowOpen({ sale_starts_at: ANTES, sale_ends_at: DEPOIS }, AGORA)).toBe(true);
    expect(saleWindowOpen({ sale_starts_at: DEPOIS }, AGORA)).toBe(false);
    expect(saleWindowOpen({ sale_ends_at: ANTES }, AGORA)).toBe(false);
  });

  it('uma data inválida fecha a janela, em vez de descontar por engano', () => {
    expect(saleWindowOpen({ sale_starts_at: 'nao-e-uma-data' }, AGORA)).toBe(false);
  });
});

// Estes são os casos que a revisão de 2026-11-06 encontrou: a variante aplicava o
// `sale_price` sem janela de datas e sem exigir que fosse menor que o preço dela.
// A regra tem de ser a mesma do `place_order` (migração `promocoes_das_variantes`).
describe('variantPrices', () => {
  const livro = { price: 1000, sale_starts_at: ANTES, sale_ends_at: DEPOIS };

  it('usa o preço da variante, não o do produto', () => {
    expect(variantPrices(livro, { price: 2500 }, AGORA)).toEqual({ price: 2500, sale: null, onSale: false });
  });

  it('sem preço próprio herda o do produto', () => {
    expect(variantPrices(livro, { label: 'M' }, AGORA).price).toBe(1000);
  });

  it('o promocional da variante vale dentro da janela do produto', () => {
    expect(variantPrices(livro, { price: 2500, sale_price: 2000 }, AGORA)).toEqual({ price: 2500, sale: 2000, onSale: true });
  });

  it('promoção agendada para o futuro NÃO desconta na variante', () => {
    const agendado = { price: 1000, sale_starts_at: DEPOIS };
    expect(variantPrices(agendado, { price: 2500, sale_price: 2000 }, AGORA)).toEqual({ price: 2500, sale: null, onSale: false });
  });

  it('promoção já terminada NÃO desconta na variante', () => {
    const terminado = { price: 1000, sale_ends_at: ANTES };
    expect(variantPrices(terminado, { price: 2500, sale_price: 2000 }, AGORA)).toEqual({ price: 2500, sale: null, onSale: false });
  });

  it('um promocional acima do preço da variante não é cobrado como desconto', () => {
    expect(variantPrices(livro, { price: 2500, sale_price: 3000 }, AGORA)).toEqual({ price: 2500, sale: null, onSale: false });
    expect(variantPrices(livro, { price: 2500, sale_price: 2500 }, AGORA)).toEqual({ price: 2500, sale: null, onSale: false });
  });

  it('valores em falta ou inválidos não inventam descontos', () => {
    expect(variantPrices(livro, {}, AGORA)).toEqual({ price: 1000, sale: null, onSale: false });
    expect(variantPrices(livro, { price: 2500, sale_price: 0 }, AGORA).sale).toBe(null);
    expect(variantPrices(livro, { price: 2500, sale_price: 'abc' }, AGORA).sale).toBe(null);
    expect(variantPrices(null, null, AGORA)).toEqual({ price: 0, sale: null, onSale: false });
  });
});
