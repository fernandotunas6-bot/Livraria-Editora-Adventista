// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';

// O catálogo dentro do app iOS: a edição digital não se compra lá (regra 3.1.1 da App Store,
// lib/digitalEditions.js: podeComprarDigital). No site, nada muda.

const LIVROS = {
  liv: { id: 'liv', title: 'Livro', price: 5000, stock: 3, versions: [{ label: 'Impresso', price: 5000 }, { label: 'Edição digital', format: 'PDF', price: 2000, digital: true }] },
  rev: { id: 'rev', title: 'Revista', price: 1000, stock: 0, versions: [], digital: true },
  ebook: { id: 'ebook', title: 'Só PDF', price: 1000, stock: 0, versions: [{ label: 'PDF', price: 1000, digital: true }] },
};

vi.mock('@/lib/dataClient', () => ({
  default: {
    collection: () => ({
      getOne: async (id) => ({ ...LIVROS[id] }),
      getFullList: async () => [],
    }),
  },
  authHeaders: () => ({}),
}));
vi.mock('@/lib/supabaseClient', () => ({ APP_API_URL: '', mediaUrl: (x) => x, supabase: {} }));

const { getProduct } = await import('./EcommerceApi');

afterEach(() => { delete window.Capacitor; });

const noAppIos = () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }; };

describe('edição digital no site', () => {
  it('vende-se como sempre', async () => {
    const livro = await getProduct('liv');
    expect(livro.variants.map((v) => v.id)).toEqual(['liv-v0', 'liv-v1']);
    expect(livro.has_digital).toBe(true);
    expect(livro.digital_fora_da_app).toBe(false);
    const revista = await getProduct('rev');
    expect(revista.purchasable).toBe(true);
  });
});

describe('edição digital no app iOS', () => {
  it('o livro fica só com o impresso (o id da variante não muda)', async () => {
    noAppIos();
    const livro = await getProduct('liv');
    expect(livro.variants.map((v) => v.id)).toEqual(['liv-v0']);
    expect(livro.has_digital).toBe(false);
    expect(livro.digital_fora_da_app).toBe(true);
    expect(livro.purchasable).toBe(true);
  });

  it('o que só existe em digital não está à venda', async () => {
    noAppIos();
    const revista = await getProduct('rev');
    expect(revista.purchasable).toBe(false);
    expect(revista.digital_only).toBe(true);
    expect(revista.digital_fora_da_app).toBe(true);
    const ebook = await getProduct('ebook');
    expect(ebook.purchasable).toBe(false);
  });
});

describe('edição digital no app Android', () => {
  it('também não se vende (Google Play Billing)', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    const livro = await getProduct('liv');
    expect(livro.variants.map((v) => v.id)).toEqual(['liv-v0']);
    expect((await getProduct('rev')).purchasable).toBe(false);
  });
});
