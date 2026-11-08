import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminPermissions, buildAdminNav } from '@/lib/adminSections';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mobile = false;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: {} }) }));

const { default: AdminShell } = await import('./AdminShell');
const { default: AdminTabsNav } = await import('./AdminTabsNav');

const nav = buildAdminNav(adminPermissions({ isAdmin: true }), { orders: { count: 4 }, books: { count: 2, tone: 'warning' } });
let root;
let host;

async function mount(ui) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter>{ui}</MemoryRouter>));
  return host;
}

beforeEach(() => {
  mobile = false;
  window.scrollTo = vi.fn();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const shell = (props = {}) => (
  <AdminShell
    nav={nav} active="orders" onNavigate={() => {}} layout="tabs" onLayoutChange={() => {}}
    sidebarOpen onSidebarOpenChange={() => {}} user={{ id: 'u1', name: 'Ana Admin', email: 'ana@exemplo.ao' }}
    roleLabel="Administrador" onProfile={() => {}} onLogout={() => {}}
    {...props}
  >
    <p>Conteúdo da secção</p>
  </AdminShell>
);

describe('AdminShell', () => {
  it('separadores: grupos em cima, secções do grupo por baixo, e o cabeçalho da secção', async () => {
    const el = await mount(shell());
    const groups = el.querySelector('nav[aria-label="Grupos do painel"]');
    expect(groups).not.toBeNull();
    expect(groups.textContent).toContain('Catálogo');
    expect(groups.querySelector('[aria-current="true"]').textContent).toContain('Vendas');
    const sections = el.querySelector('nav[aria-label="Secções de Vendas"]');
    expect(sections.querySelector('[aria-current="page"]').textContent).toContain('Encomendas');
    expect(el.querySelector('h1').textContent).toBe('Encomendas');
    expect(el.textContent).toContain('Conteúdo da secção');
    // sem barra lateral no computador
    expect(el.querySelector('nav[aria-label="Secções do painel"]')).toBeNull();
  });

  it('barra lateral: todas as secções à esquerda, com a activa marcada e os números', async () => {
    const el = await mount(shell({ layout: 'sidebar', active: 'books' }));
    const side = el.querySelector('nav[aria-label="Secções do painel"]');
    expect(side).not.toBeNull();
    expect(side.querySelectorAll('button[data-sidebar="menu-button"]').length).toBe(22);
    expect(side.querySelector('[aria-current="page"]').textContent).toContain('Produtos');
    expect(side.textContent).toContain('4');
    expect(el.querySelector('nav[aria-label="Grupos do painel"]')).toBeNull();
  });

  it('no telemóvel os separadores mostram só as secções do grupo (o resto está na gaveta)', async () => {
    mobile = true;
    const el = await mount(shell({ active: 'books' }));
    expect(el.querySelector('nav[aria-label="Grupos do painel"]')).toBeNull();
    expect(el.querySelector('nav[aria-label="Secções de Catálogo"]')).not.toBeNull();
    expect(el.querySelector('[data-sidebar="trigger"]')).not.toBeNull();
  });

  it('ao mudar de secção volta ao topo e o foco vai para o título', async () => {
    const el = await mount(shell({ active: 'orders' }));
    await act(async () => root.render(<MemoryRouter>{shell({ active: 'settings' })}</MemoryRouter>));
    expect(window.scrollTo).toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('h1'));
    expect(el.querySelector('h1').textContent).toBe('Configurações');
  });
});

describe('AdminTabsNav', () => {
  it('carregar num grupo abre a secção onde se estava nesse grupo da última vez', async () => {
    const onNavigate = vi.fn();
    const el = await mount(<AdminTabsNav nav={nav} active="slides" onNavigate={onNavigate} />);
    // muda para outro grupo e volta
    await act(async () => root.render(<MemoryRouter><AdminTabsNav nav={nav} active="orders" onNavigate={onNavigate} /></MemoryRouter>));
    const catalogo = [...el.querySelectorAll('nav[aria-label="Grupos do painel"] button')].find((b) => b.textContent.includes('Catálogo'));
    act(() => catalogo.click());
    expect(onNavigate).toHaveBeenLastCalledWith('slides');
    const sistema = [...el.querySelectorAll('nav[aria-label="Grupos do painel"] button')].find((b) => b.textContent.includes('Sistema'));
    act(() => sistema.click());
    expect(onNavigate).toHaveBeenLastCalledWith('settings');
  });

  it('o grupo mostra a soma dos números das suas secções', async () => {
    const el = await mount(<AdminTabsNav nav={nav} active="inicio" onNavigate={() => {}} />);
    const vendas = [...el.querySelectorAll('nav[aria-label="Grupos do painel"] button')].find((b) => b.textContent.includes('Vendas'));
    expect(vendas.textContent).toContain('4');
  });
});
