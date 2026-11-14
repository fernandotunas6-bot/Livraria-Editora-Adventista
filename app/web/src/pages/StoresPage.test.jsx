import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

vi.mock('@/components/Header.jsx', () => ({ default: () => null }));
vi.mock('@/components/Footer.jsx', () => ({ default: () => null }));
vi.mock('@/components/ShoppingCart.jsx', () => ({ default: () => null }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: {} }) }));
vi.mock('@/hooks/useLocalizacaoAoVivo', () => ({
  default: () => ({ estado: 'parado', posicao: null, erro: null, comecar: () => {}, parar: () => {} }),
}));

// O banner fica registado para os testes verem que fotografias recebeu.
const banner = { images: undefined, fallbackImages: undefined };
vi.mock('@/components/PageBannerSlider', async (original) => {
  const real = await original();
  return {
    ...real,
    default: ({ children, images, fallbackImages }) => {
      banner.images = images;
      banner.fallbackImages = fallbackImages;
      return <div>{children}</div>;
    },
  };
});

// Três lojas como as de produção: uma com mapa e fotografias, uma só com fotografias e uma sem
// nada — é a combinação que deixava a caixa vazia de um ecrã no painel.
const LOJAS = [
  {
    id: 'cat', name: 'Livraria Adventista — Catumbela', province: 'Benguela', address: 'Teixeira da Silva',
    image_url: '', latitude: null, longitude: null, pickup_enabled: true,
    gallery: [{ url: '/images/lojas/catumbela-1.webp', caption: 'A entrada da loja' }, { url: '/images/lojas/catumbela-2.webp', caption: 'O balcão' }],
  },
  {
    id: 'hua', name: 'Livraria Adventista — Huambo', province: 'Huambo', address: 'Rua Teixeira da Silva',
    image_url: '/images/lojas/huambo-1.webp', latitude: -12.779196, longitude: 15.760069,
    gallery: [{ url: '/images/lojas/huambo-1.webp', caption: 'Balcão' }],
  },
  { id: 'sem', name: 'Livraria Adventista — Sem Fotos', province: 'Huíla', address: 'Centro', image_url: '', gallery: [] },
];

let resolverLojas;
vi.mock('@/api/PlatformApi', () => ({
  getPhysicalStores: () => new Promise((resolve) => { resolverLojas = resolve; }),
}));

const { default: StoresPage } = await import('@/pages/StoresPage');
const { SHOP_BANNER_IMAGES } = await import('@/components/PageBannerSlider');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

// `largo` diz se o ecrã tem as duas colunas (≥ 1024 px).
function ecra(largo) {
  window.matchMedia = (query) => ({
    matches: query.includes('min-width: 1024px') ? largo : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

async function render(entry = '/lojas') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[entry]}><StoresPage /></MemoryRouter>);
  });
}

async function chegamAsLojas(lista = LOJAS) {
  await act(async () => { resolverLojas(lista); });
}

beforeEach(() => {
  banner.images = undefined;
  banner.fallbackImages = undefined;
  window.history.replaceState(null, '', '/lojas');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('página das lojas — banner', () => {
  it('enquanto as lojas carregam, não mostra capas de livros', async () => {
    ecra(false);
    await render();
    // Lista vazia e sem alternativa: vê-se a cor da marca, não um relance de livros.
    expect(banner.images).toEqual([]);
    expect(banner.fallbackImages).toEqual([]);
  });

  it('mostra uma fotografia de cada loja, e não as capas da loja online', async () => {
    ecra(false);
    await render();
    await chegamAsLojas();
    // A Catumbela não tem miniatura: vai a primeira fotografia da galeria. A loja sem
    // fotografias fica de fora.
    expect(banner.images).toEqual(['/images/lojas/catumbela-1.webp', '/images/lojas/huambo-1.webp']);
    expect(banner.images.some((url) => SHOP_BANNER_IMAGES.includes(url))).toBe(false);
  });

  it('se nenhuma loja tiver fotografia, volta aos banners de sempre', async () => {
    ecra(false);
    await render();
    await chegamAsLojas([LOJAS[2]]);
    expect(banner.images).toEqual(SHOP_BANNER_IMAGES);
  });
});

describe('página das lojas — uma coluna (telemóvel e tablet)', () => {
  it('a grelha tem uma coluna que encolhe até ao ecrã', async () => {
    ecra(false);
    await render();
    await chegamAsLojas();
    // Sem `grid-cols-1` a coluna implícita era `auto` e a página transbordava 39 px.
    const grelha = host.querySelector('ul[aria-label="Lista de lojas"]').parentElement;
    expect(grelha.className).toMatch(/(^|\s)grid-cols-1(\s|$)/);
  });

  it('as fotografias da loja escolhida aparecem dentro do cartão dela', async () => {
    ecra(false);
    await render();
    await chegamAsLojas();
    const cartao = host.querySelector('#cat article');
    expect(cartao.textContent).toMatch(/Fotografias da loja/i);
    expect([...cartao.querySelectorAll('img')].some((i) => /catumbela-2/.test(i.getAttribute('src') + i.getAttribute('srcset')))).toBe(true);
  });

  it('sem mapa, não há painel nem caixa vazia — o cartão já tem tudo', async () => {
    ecra(false);
    await render();
    await chegamAsLojas();
    expect(host.textContent).not.toMatch(/ainda não tem (coordenadas|localização)/);
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('com mapa, o painel mostra-o', async () => {
    ecra(false);
    window.history.replaceState(null, '', '/lojas#hua');
    await render('/lojas#hua');
    await chegamAsLojas();
    // O Huambo tem coordenadas, mas sem chave do Google o mapa vem do endereço público.
    const temMapaOuAviso = host.querySelector('iframe') || /Direcções/.test(host.textContent);
    expect(temMapaOuAviso).toBeTruthy();
  });
});

describe('página das lojas — duas colunas (computador)', () => {
  it('as fotografias ficam no painel ao lado, uma vez só', async () => {
    ecra(true);
    await render();
    await chegamAsLojas();
    const vezes = (host.textContent.match(/Fotografias da loja/gi) || []).length;
    expect(vezes).toBe(1);
    expect(host.querySelector('#cat article').textContent).not.toMatch(/Fotografias da loja/i);
  });

  it('sem mapa mas com fotografias, nada de caixa vazia: uma linha explica', async () => {
    ecra(true);
    await render();
    await chegamAsLojas();
    expect(host.textContent).toMatch(/Ainda sem localização no mapa/);
    expect(host.querySelector('.aspect-4\\/3:not(iframe)')).toBeNull();
  });

  it('sem mapa e sem fotografias, um aviso numa linha', async () => {
    ecra(true);
    window.history.replaceState(null, '', '/lojas#sem');
    await render('/lojas#sem');
    await chegamAsLojas();
    expect(host.textContent).toMatch(/Esta loja ainda não tem localização no mapa/);
  });

  it('o nome da loja no painel não é cortado', async () => {
    ecra(true);
    await render();
    await chegamAsLojas();
    const nomes = [...host.querySelectorAll('p.font-semibold')].filter((p) => /Catumbela/.test(p.textContent));
    expect(nomes.length).toBeGreaterThan(0);
    expect(nomes.every((p) => !p.className.includes('truncate'))).toBe(true);
  });
});
