import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let auth = {};
let colportor = null;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useAuthDialog', () => ({ useAuthDialog: () => ({ openAuth: () => {} }) }));
vi.mock('@/hooks/useColporteurMe', () => ({ useColporteurMe: () => colportor }));
vi.mock('@/components/UserAvatar', () => ({ default: () => <span /> }));

const { UserMenu } = await import('./UserMenu');

let root;
let host;
async function openMenu() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><UserMenu /></MemoryRouter>));
  const trigger = host.querySelector('button[aria-label="Menu da conta"]');
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }));
  });
  return document.body.querySelector('[role="menu"]');
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); document.body.innerHTML = ''; colportor = null; });

const user = { id: 'u1', name: 'Ana', email: 'ana@exemplo.ao' };
const links = (menu) => [...menu.querySelectorAll('a')].map((a) => `${a.textContent.trim()} → ${a.getAttribute('href')}`);

describe('menu da conta, por contexto', () => {
  it('cliente: só a conta, com as vistas no endereço', async () => {
    auth = { user, isAdmin: false, canAccessAdmin: false, hasPermission: () => false, logout: () => {} };
    const menu = await openMenu();
    expect(menu.textContent).toContain('A minha conta');
    expect(links(menu)).toContain('As Minhas Encomendas → /profile?tab=orders');
    expect(menu.textContent).not.toContain('Equipa');
    expect(menu.textContent).not.toContain('Colportagem');
  });

  it('colportor: a área do colportor, com o código', async () => {
    auth = { user, isAdmin: false, canAccessAdmin: false, hasPermission: () => false, logout: () => {} };
    colportor = { code: 'CPT-0007' };
    const menu = await openMenu();
    expect(menu.textContent).toContain('Colportagem');
    expect(links(menu).some((l) => l.startsWith('Área do colportor') && l.endsWith('/colportor'))).toBe(true);
    expect(menu.textContent).toContain('CPT-0007');
  });

  it('gestor: o painel e só as secções que pode abrir', async () => {
    auth = { user, isAdmin: false, canAccessAdmin: true, hasPermission: (k) => k === 'manage_colporteurs', logout: () => {} };
    const menu = await openMenu();
    expect(menu.textContent).toContain('Painel da equipa');
    const l = links(menu);
    expect(l).toContain('Colportagem → /admin?tab=colportagem');
    expect(l).toContain('Registo da Igreja → /admin?tab=igreja');
    expect(l.some((x) => x.includes('/admin?tab=orders') || x.includes('/admin?tab=apps'))).toBe(false);
  });
});
