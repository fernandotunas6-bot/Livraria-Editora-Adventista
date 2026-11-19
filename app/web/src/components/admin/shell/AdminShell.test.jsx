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
const { AdminViewNav, useSectionView } = await import('./AdminViewNav');

/** Uma secção com vistas, como as verdadeiras: a linha das vistas e a vista aberta. */
function SecaoComVistas() {
  const sv = useSectionView('colportagem');
  return (
    <div>
      <AdminViewNav state={sv} badges={{ candidaturas: { count: 2, tone: 'warning' } }} />
      <p data-vista={sv.view}>Vista {sv.view}</p>
    </div>
  );
}

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
    {props.children || <p>Conteúdo da secção</p>}
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
    // 27 + Disponibilidade nas lojas (lojas_donas_dos_dados) + Todas as livrarias + Imagens dos vídeos + Painel de Gestão.
    expect(side.querySelectorAll('button[data-sidebar="menu-button"]').length).toBe(31);
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

describe('navegação por contexto (vistas)', () => {
  const colp = (props = {}) => shell({ active: 'colportagem', view: 'contas', viewExplicit: true, children: <SecaoComVistas />, ...props });

  it('barra lateral: a secção aberta desdobra-se com as suas vistas, e a aberta fica marcada', async () => {
    const el = await mount(colp({ layout: 'sidebar' }));
    const sub = el.querySelector('ul[aria-label="Vistas de Colportagem"]');
    expect(sub).not.toBeNull();
    expect(sub.querySelectorAll('button').length).toBe(13); // as vistas da Colportagem, com «Interessados»
    expect(sub.querySelector('[aria-current="page"]').textContent).toContain('Contas');
    // só a secção aberta se desdobra
    expect(el.querySelectorAll('[data-sidebar="menu-sub"]').length).toBe(1);
    // a secção diz que está aberta; a página actual é a vista
    const secao = [...el.querySelectorAll('button[data-sidebar="menu-button"]')].find((b) => b.textContent.includes('Colportagem'));
    expect(secao.getAttribute('aria-expanded')).toBe('true');
    // com a barra aberta, a linha das vistas não se repete no conteúdo
    expect(el.querySelector('#conteudo-painel nav[aria-label="Vistas de Colportagem"]')).toBeNull();
  });

  it('a secção mostra a vista do endereço, e o cabeçalho e o caminho dizem onde se está', async () => {
    const el = await mount(colp());
    expect(el.querySelector('[data-vista]').dataset.vista).toBe('contas');
    expect(el.querySelector('h1').textContent).toBe('Contas');
    expect(el.textContent).toContain('Igreja › Colportagem');
    const caminho = el.querySelector('nav[aria-label="Localização"]');
    expect(caminho.textContent).toContain('Colportagem');
    expect(caminho.querySelector('[aria-current="page"]').textContent).toBe('Contas');
  });

  it('separadores no topo: a linha das vistas aparece no conteúdo, com os números', async () => {
    const onNavigate = vi.fn();
    const el = await mount(colp({ onNavigate }));
    const linha = el.querySelector('#conteudo-painel nav[aria-label="Vistas de Colportagem"]');
    expect(linha).not.toBeNull();
    const cand = [...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Candidaturas'));
    expect(cand.textContent).toContain('2');
    act(() => cand.click());
    // mudar na linha não rouba o foco
    expect(onNavigate).toHaveBeenLastCalledWith('colportagem', { focus: false, view: 'candidaturas' });
  });

  it('carregar na secção do caminho volta à vista de omissão', async () => {
    const onNavigate = vi.fn();
    const el = await mount(colp({ onNavigate }));
    const btn = el.querySelector('nav[aria-label="Localização"] button');
    act(() => btn.click());
    expect(onNavigate).toHaveBeenLastCalledWith('colportagem', { view: 'resumo' });
  });

  it('uma vista sem acesso não aparece (Importar no registo da Igreja, só leitura)', async () => {
    const leitor = buildAdminNav(adminPermissions({ hasPermission: (k) => k === 'manage_colporteurs' }));
    const el = await mount(shell({ nav: leitor, layout: 'sidebar', active: 'igreja', view: 'resumo' }));
    const sub = el.querySelector('ul[aria-label="Vistas de Registo da Igreja"]');
    expect(sub.textContent).toContain('Pastores');
    expect(sub.textContent).not.toContain('Importar');
  });

  it('fora do painel a secção guarda a vista sozinha, com a linha das vistas', async () => {
    const el = await mount(<SecaoComVistas />);
    expect(el.querySelector('[data-vista]').dataset.vista).toBe('resumo');
    const contas = [...el.querySelectorAll('nav button')].find((b) => b.textContent.includes('Contas'));
    act(() => contas.click());
    expect(el.querySelector('[data-vista]').dataset.vista).toBe('contas');
  });
});

describe('barra do topo: o estado da sincronização', () => {
  const sync = (extra) => ({ online: true, syncing: false, lastSync: Date.now() - 120_000, refreshNow: () => {}, ...extra });
  const botao = () => [...host.querySelectorAll('header button')].find((b) => /Actualizar agora/.test(b.getAttribute('aria-label') || ''));

  it('com o tempo real ligado diz "Em tempo real" (e a dica explica), com o ícone de actualizar', async () => {
    await mount(shell({ sync: sync({ realtime: 'live' }) }));
    expect(botao().getAttribute('aria-label')).toBe('Em tempo real. Actualizar agora');
    expect(botao().getAttribute('title')).toMatch(/aparece sozinho/);
    const icon = botao().querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('class')).not.toMatch(/animate-spin/);
  });

  it('o ícone roda enquanto actualiza, também em tempo real (e o texto fica)', async () => {
    await mount(shell({ sync: sync({ realtime: 'live', syncing: true }) }));
    expect(botao().getAttribute('aria-label')).toBe('Em tempo real. Actualizar agora');
    expect(botao().querySelector('svg').getAttribute('class')).toMatch(/animate-spin/);
  });

  it('sem tempo real fica como antes: "Actualizado há 2 min", de minuto a minuto', async () => {
    await mount(shell({ sync: sync({ realtime: 'off' }) }));
    expect(botao().getAttribute('aria-label')).toBe('Actualizado há 2 min. Actualizar agora');
    expect(botao().getAttribute('title')).toMatch(/minuto a minuto/);
  });

  it('no telemóvel o ícone fica escondido (abaixo de 768 px); a partir daí aparece', async () => {
    await mount(shell({ sync: sync({ realtime: 'live' }) }));
    const cls = botao().getAttribute('class').split(/\s+/);
    expect(cls).toContain('hidden');
    expect(cls).toContain('md:inline-flex');
  });

  it('sem rede: "Sem ligação", com ou sem tempo real', async () => {
    await mount(shell({ sync: sync({ realtime: 'live', online: false }) }));
    expect(host.querySelector('header [role="status"]').textContent).toMatch(/Sem ligação/);
  });
});
