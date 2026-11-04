import { describe, expect, it } from 'vitest';
import { discoveryOrder, hasInterest, interestFromRecent } from './discovery';

const livro = (id, extra = {}) => ({ id, title: id, order: 0, purchasable: true, variants: [{ inventory_quantity: 3 }], type: { value: 'Catálogo Geral' }, ...extra });

const catalogo = [
  livro('visto', { type: { value: 'Ellen G. White' }, author: 'Ellen G. White' }),
  livro('mesma-cat', { type: { value: 'Ellen G. White' }, order: 1 }),
  livro('mesmo-autor', { author: 'Ellen G. White', order: 2 }),
  livro('destaque', { featured: true, order: 5 }),
  livro('outro', { order: 9 }),
  livro('esgotado-relacionado', { type: { value: 'Ellen G. White' }, variants: [{ inventory_quantity: 0 }] }),
];

describe('interestFromRecent', () => {
  it('tira categorias e autores dos livros vistos que existem no catálogo', () => {
    const i = interestFromRecent([{ id: 'visto' }, { id: 'apagado' }], catalogo);
    expect([...i.categories]).toEqual(['ellen g. white']);
    expect([...i.authors]).toEqual(['ellen g. white']);
    expect([...i.viewed]).toEqual(['visto']);
    expect(hasInterest(interestFromRecent([], catalogo))).toBe(false);
  });
});

describe('discoveryOrder', () => {
  it('sem histórico: destaques, depois os mais recentes, esgotados no fim', () => {
    expect(discoveryOrder(catalogo).map((p) => p.id)).toEqual(
      ['destaque', 'outro', 'mesmo-autor', 'mesma-cat', 'visto', 'esgotado-relacionado'],
    );
  });

  it('com histórico: sobem os da mesma categoria ou autor, não o próprio livro visto nem os esgotados', () => {
    const i = interestFromRecent([{ id: 'visto' }], catalogo);
    const ids = discoveryOrder(catalogo, i).map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(['mesmo-autor', 'mesma-cat']);
    expect(ids.indexOf('visto')).toBeGreaterThan(ids.indexOf('destaque'));
    expect(ids.at(-1)).toBe('esgotado-relacionado');
  });

  it('não repete livros', () => {
    expect(discoveryOrder([livro('a'), livro('a'), livro('b')]).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
