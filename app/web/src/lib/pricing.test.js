// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { effectivePrice, isSaleActive, normalizeVersions, saleWindowOpen, variantPrices } from './pricing';

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

// O painel gravava `price: ''` num tamanho sem preço próprio: a loja mostrava 0 Kz e o
// servidor cobrava o preço do produto, sem a promoção que o cartão da loja anunciava.
describe('tamanho sem preço próprio', () => {
  const farda = { price: 4500, sale_price: 4000, sale_starts_at: ANTES, sale_ends_at: DEPOIS };

  it('é o produto, com a promoção do produto', () => {
    expect(variantPrices(farda, { label: 'M', price: '' }, AGORA)).toEqual({ price: 4500, sale: 4000, onSale: true });
    expect(variantPrices(farda, { label: 'M', price: null }, AGORA)).toEqual({ price: 4500, sale: 4000, onSale: true });
    expect(variantPrices(farda, { label: 'M', price: 0 }, AGORA)).toEqual({ price: 4500, sale: 4000, onSale: true });
  });

  it('com preço próprio vale o dele, sem a promoção do produto', () => {
    expect(variantPrices(farda, { label: 'G', price: '5200' }, AGORA)).toEqual({ price: 5200, sale: null, onSale: false });
  });

  it('a promoção do produto acaba também para os tamanhos sem preço', () => {
    const acabou = { ...farda, sale_ends_at: ANTES };
    expect(variantPrices(acabou, { label: 'M', price: '' }, AGORA)).toEqual({ price: 4500, sale: null, onSale: false });
  });
});

describe('normalizeVersions — edição digital', () => {
  it('a edição digital fica marcada e sem stock', () => {
    expect(normalizeVersions([{ label: 'Edição digital', format: 'PDF', price: '3000', stock: '5', digital: true }, { label: 'Impresso', stock: '4', digital: false }]))
      .toEqual([{ label: 'Edição digital', format: 'PDF', price: 3000, stock: null, digital: true }, { label: 'Impresso', price: null, stock: 4 }]);
  });
});

describe('normalizeVersions', () => {
  it('grava números, ou null quando fica por preencher', () => {
    expect(normalizeVersions([{ label: 'M', format: '', price: '', stock: '', isbn: '' }, { label: 'G', price: '5200', stock: '7.9' }]))
      .toEqual([{ label: 'M', format: '', price: null, stock: null, isbn: '' }, { label: 'G', price: 5200, stock: 7 }]);
    expect(normalizeVersions(null)).toEqual([]);
    expect(normalizeVersions([{ label: 'X', price: 'abc', stock: '-1' }])).toEqual([{ label: 'X', price: null, stock: null }]);
  });
});
