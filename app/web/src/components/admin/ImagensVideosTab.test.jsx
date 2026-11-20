// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Painel → Relatórios → Imagens dos vídeos: a biblioteca e os mais vendidos lançados à mão.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let imagens = [];
let doSite = [];
let manuais = [];
let doSistema = [];
const api = {
  listarImagens: vi.fn(async () => imagens),
  imagensDoSite: vi.fn(async () => doSite),
  juntarDoSite: vi.fn(async () => []),
  enviarImagem: vi.fn(async () => ({})),
  actualizarImagem: vi.fn(async () => {}),
  apagarImagem: vi.fn(async () => {}),
  listarMaisVendidos: vi.fn(async () => manuais),
  maisVendidosDoSistema: vi.fn(async () => doSistema),
  gravarMaisVendido: vi.fn(async () => {}),
  apagarMaisVendido: vi.fn(async () => {}),
  procurarProdutos: vi.fn(async () => []),
};
vi.mock('@/painel-vendas/biblioteca', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/painel-vendas/adapter', () => ({ listStores: async () => [{ id: 'h', name: 'Livraria do Huambo', active: true }] }));
// O jsdom não desenha em canvas: as paisagens ficam por desenhar no teste.
vi.mock('@/painel-vendas/imagens-video', () => ({
  TEMAS: ['amanhecer', 'floresta', 'campo', 'lago'],
  NOMES_TEMAS: { amanhecer: 'Amanhecer nas montanhas', floresta: 'Floresta', campo: 'Campo', lago: 'Lago ao entardecer' },
  desenharPaisagem: vi.fn(),
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {}, mediaUrl: () => '' }));
let perms = {};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false, hasPermission: (k) => !!perms[k] }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
let vista = 'imagens';
vi.mock('@/components/admin/shell/AdminViewNav', () => ({
  AdminViewNav: () => null,
  useSectionView: () => ({ view: vista }),
}));
HTMLCanvasElement.prototype.getContext = () => ({});

const { default: ImagensVideosTab } = await import('./ImagensVideosTab');

let root;
let host;
const espera = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><ImagensVideosTab /></MemoryRouter>));
  await espera();
}
const botao = (texto, scope = document.body) => [...scope.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
const clicar = async (el) => { await act(async () => { el.click(); }); await espera(); };

beforeEach(() => {
  imagens = [];
  doSite = [];
  manuais = [];
  doSistema = [];
  perms = { view_reports: true, edit_reports: true };
  vista = 'imagens';
  Object.values(api).forEach((f) => f.mockClear());
  toast.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Biblioteca de imagens', () => {
  it('mostra as quatro paisagens desenhadas e as fotografias, com o aviso das estreitas', async () => {
    imagens = [
      { id: 'a', url: 'https://x/serra.jpg', titulo: 'Serra da Leba', tema: 'natureza', activa: true, largura: 1600, altura: 900, creditos: '' },
      { id: 'b', url: 'https://x/porta.jpg', titulo: 'Porta', tema: 'lojas', activa: false, largura: 600, altura: 900, creditos: '' },
    ];
    await mount();
    expect(host.querySelectorAll('canvas')).toHaveLength(4);
    expect(host.textContent).toContain('Lago ao entardecer');
    // A estreita leva também a cópia desfocada por trás (aria-hidden), como no vídeo.
    expect(host.querySelectorAll('li img:not([aria-hidden])')).toHaveLength(2);
    expect(host.querySelectorAll('li img[aria-hidden]')).toHaveLength(1);
    expect(host.textContent).toContain('Estreita: vai inteira, sobre fundo desfocado');
    expect(host.textContent).toContain('1 activa');
  });

  it('junta as imagens do site escolhidas, sem repetir as que já estão', async () => {
    imagens = [{ id: 'a', url: '/images/site/slide-catalogo.webp', titulo: 'Catálogo', tema: 'livros', activa: true }];
    doSite = [
      { url: '/images/site/slide-catalogo.webp', mini: '/m1.webp', titulo: 'Catálogo', tema: 'livros' },
      { url: '/images/lojas/huambo-1.webp', mini: '/m2.webp', titulo: 'Livraria do Huambo · fachada', tema: 'lojas' },
    ];
    await mount();
    await clicar(botao('Juntar imagens do site'));
    const opcoes = [...document.body.querySelectorAll('[role="dialog"] input[type="checkbox"]')];
    expect(opcoes).toHaveLength(1);
    await act(async () => { opcoes[0].click(); });
    await clicar(botao('Juntar 1', document.querySelector('[role="dialog"]')));
    expect(api.juntarDoSite).toHaveBeenCalledWith([expect.objectContaining({ url: '/images/lojas/huambo-1.webp', tema: 'lojas' })]);
  });

  it('quem só vê não envia nem altera', async () => {
    perms = { view_reports: true };
    imagens = [{ id: 'a', url: 'https://x/a.jpg', titulo: 'A', tema: 'natureza', activa: true }];
    await mount();
    expect(botao('Enviar fotografias')).toBeUndefined();
    expect(host.querySelector('input[aria-label="Título"]').disabled).toBe(true);
    expect(host.querySelector('button[aria-label="Tirar da biblioteca"]')).toBeNull();
  });

  it('quem gere o catálogo também gere a biblioteca', async () => {
    perms = { manage_catalog: true };
    await mount();
    expect(botao('Enviar fotografias')).toBeTruthy();
  });
});

describe('Mais vendidos à mão', () => {
  it('mostra o lançado e o do site, e copia os do site', async () => {
    vista = 'mais-vendidos';
    manuais = [{ id: 'm1', loja_id: 'h', ano: 2026, mes: null, book_id: 'b1', titulo: 'Apocalipse Verso por Verso', unidades: 40, valor: 380000 }];
    doSistema = [{ book_id: 'b2', titulo: 'Daniel Verso por Verso', unidades: 9, valor: 85500 }];
    await mount();
    await espera();
    expect(host.textContent).toContain('Apocalipse Verso por Verso');
    expect(host.textContent).toContain('Daniel Verso por Verso');
    await clicar(botao('Copiar os 5'));
    expect(api.gravarMaisVendido).toHaveBeenCalledWith(expect.objectContaining({ loja_id: 'h', titulo: 'Daniel Verso por Verso', unidades: 9, mes: null }));
  });

  it('quem só vê não lança', async () => {
    vista = 'mais-vendidos';
    perms = { view_reports: true };
    doSistema = [{ book_id: 'b2', titulo: 'Daniel', unidades: 9, valor: 1 }];
    await mount();
    await espera();
    expect(botao('Copiar os 5')).toBeUndefined();
    expect(host.querySelector('#mv-titulo')).toBeNull();
  });
});
