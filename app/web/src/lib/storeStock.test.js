import { describe, expect, it } from 'vitest';
import {
  contagens, estadoDe, filtrarProdutos, itensParaLevantar, levantamentoPorLoja, lojasComProduto, produtoComStock,
} from './storeStock';

const marcas = new Map([['a', true], ['b', false]]);
const produtos = [
  { id: 'a', title: 'O Grande Conflito', author: 'Ellen G. White', book_code: 'LIV-001', product_type: 'livro' },
  { id: 'b', title: 'Bíblia de Estudo Andrews', book_code: 'BIB-002', product_type: 'biblia' },
  { id: 'c', title: 'Caminho a Cristo', author: 'Ellen G. White', book_code: 'LIV-003' },
];

describe('estadoDe e contagens', () => {
  it('temos, não temos, e sem marca é por marcar', () => {
    expect(estadoDe(marcas, 'a')).toBe('temos');
    expect(estadoDe(marcas, 'b')).toBe('nao-temos');
    expect(estadoDe(marcas, 'c')).toBe('por-marcar');
    expect(estadoDe(undefined, 'a')).toBe('por-marcar');
  });

  it('conta cada estado', () => {
    expect(contagens(produtos, marcas)).toEqual({ temos: 1, 'nao-temos': 1, 'por-marcar': 1, total: 3 });
  });
});

describe('produtoComStock', () => {
  it('deixa de fora o que é só digital', () => {
    expect(produtoComStock({ id: 'x', digital: true })).toBe(false);
    expect(produtoComStock({ id: 'x', versions: [{ name: 'PDF', digital: true }] })).toBe(false);
    expect(produtoComStock({ id: 'x', versions: [{ name: 'Impresso' }, { name: 'PDF', digital: true }] })).toBe(true);
    expect(produtoComStock({ id: 'x' })).toBe(true);
  });
});

describe('filtrarProdutos', () => {
  it('procura no título, no autor e no código, sem acentos e com todas as palavras', () => {
    expect(filtrarProdutos(produtos, marcas, { procura: 'biblia' }).map((p) => p.id)).toEqual(['b']);
    expect(filtrarProdutos(produtos, marcas, { procura: 'white cristo' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarProdutos(produtos, marcas, { procura: 'liv-001' }).map((p) => p.id)).toEqual(['a']);
  });

  it('filtra pelo estado e pelo tipo (sem tipo conta como livro)', () => {
    expect(filtrarProdutos(produtos, marcas, { estado: 'por-marcar' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarProdutos(produtos, marcas, { estado: 'nao-temos' }).map((p) => p.id)).toEqual(['b']);
    expect(filtrarProdutos(produtos, marcas, { tipo: 'livro' }).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filtrarProdutos(produtos, marcas).length).toBe(3);
  });
});

describe('lojasComProduto', () => {
  const lojas = [{ id: 'hua', name: 'Huambo' }, { id: 'lub', name: 'Lubango' }, { id: 'cat', name: 'Catumbela' }];
  it('só as que marcaram «temos», pela ordem das lojas', () => {
    const m = [{ store_id: 'cat', available: true }, { store_id: 'hua', available: true }, { store_id: 'lub', available: false }];
    expect(lojasComProduto(m, lojas).map((l) => l.name)).toEqual(['Huambo', 'Catumbela']);
  });

  it('uma loja que já não está na lista não aparece', () => {
    expect(lojasComProduto([{ store_id: 'fechada', available: true }], lojas)).toEqual([]);
    expect(lojasComProduto(undefined, lojas)).toEqual([]);
  });
});

describe('levantamentoPorLoja', () => {
  const lojas = [{ id: 'hua' }, { id: 'lub' }, { id: 'cat' }];
  const itens = [{ bookId: 'a', title: 'Livro A' }, { bookId: 'b', title: 'Livro B' }];
  const m = [
    { store_id: 'hua', book_id: 'a', available: true }, { store_id: 'hua', book_id: 'b', available: true },
    { store_id: 'lub', book_id: 'a', available: true }, { store_id: 'lub', book_id: 'b', available: false },
  ];

  it('a loja com tudo marcado «temos» tem tudo', () => {
    expect(levantamentoPorLoja(lojas, m, itens).get('hua')).toEqual({ faltam: [], temTudo: true, podeEscolher: true });
  });

  it('a loja que disse «não temos» a um livro não se pode escolher, e diz qual', () => {
    expect(levantamentoPorLoja(lojas, m, itens).get('lub')).toEqual({ faltam: ['Livro B'], temTudo: false, podeEscolher: false });
  });

  it('a loja que ainda não marcou continua a poder escolher-se, como antes', () => {
    expect(levantamentoPorLoja(lojas, m, itens).get('cat')).toEqual({ faltam: [], temTudo: false, podeEscolher: true });
  });

  it('sem marcas nenhumas, todas se podem escolher', () => {
    const r = levantamentoPorLoja(lojas, [], itens);
    expect([...r.values()].every((x) => x.podeEscolher && !x.temTudo)).toBe(true);
  });
});

describe('itensParaLevantar', () => {
  it('um por produto, sem as edições digitais', () => {
    const cart = [
      { product: { id: 'a', title: 'Livro A' }, variant: { id: 'a-default' } },
      { product: { id: 't', title: 'T-shirt' }, variant: { id: 't-v0' } },
      { product: { id: 't', title: 'T-shirt' }, variant: { id: 't-v1' } },
      { product: { id: 'd', title: 'Revista em PDF' }, variant: { id: 'd-default', digital: true } },
    ];
    const itens = itensParaLevantar(cart, { isDigital: (i) => i.variant.digital === true });
    expect(itens).toEqual([{ bookId: 'a', title: 'Livro A' }, { bookId: 't', title: 'T-shirt' }]);
  });
});
