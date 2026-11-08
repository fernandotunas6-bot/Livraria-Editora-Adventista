import { describe, expect, it } from 'vitest';
import { adminPermissions } from '@/lib/adminSections';
import {
  ACCOUNT_VIEWS, COLPORTEUR_VIEWS, accountHref, accountViews, colporteurHref, resolveAccountView, resolveColporteurView,
  staffShortcuts,
} from '@/lib/siteAreas';

const perms = (keys = [], isAdmin = false) => adminPermissions({ isAdmin, hasPermission: (k) => keys.includes(k) });

describe('A minha conta', () => {
  it('mantém os identificadores que o rodapé, os emails e a política de privacidade usam', () => {
    expect(ACCOUNT_VIEWS.map((v) => v.id)).toEqual(['orders', 'wishlist', 'pdfs', 'notifications', 'settings', 'security', 'workspace', 'crm']);
  });

  it('as ferramentas da equipa só para quem as pode abrir', () => {
    expect(accountViews({}).map((v) => v.id)).not.toContain('workspace');
    expect(accountViews({ canAccessAdmin: true }).map((v) => v.id)).toContain('workspace');
    expect(accountViews({ canAccessAdmin: true }).map((v) => v.id)).not.toContain('crm');
    expect(accountViews({ canManageContacts: true }).map((v) => v.id)).toContain('crm');
  });

  it('uma vista desconhecida ou sem acesso abre as encomendas', () => {
    expect(resolveAccountView('wishlist')).toBe('wishlist');
    expect(resolveAccountView('crm')).toBe('orders');
    expect(resolveAccountView('crm', { canManageContacts: true })).toBe('crm');
    expect(resolveAccountView('nada')).toBe('orders');
    expect(accountHref('settings')).toBe('/profile?tab=settings');
  });
});

describe('Área do colportor', () => {
  it('as vistas e o endereço de cada uma (os avisos de entrega abrem ?tab=entregas)', () => {
    expect(COLPORTEUR_VIEWS.map((v) => v.id)).toEqual(['relatorio', 'entregas', 'livros', 'historico', 'site', 'conta']);
    expect(colporteurHref('entregas')).toBe('/colportor?tab=entregas');
    expect(colporteurHref()).toBe('/colportor');
    expect(resolveColporteurView('nada')).toBe('relatorio');
  });
});

describe('staffShortcuts', () => {
  it('só as secções que a pessoa pode abrir, pela ordem de uso', () => {
    const colportagem = staffShortcuts(perms(['manage_colporteurs']));
    expect(colportagem.map((s) => s.id)).toEqual(['colportagem', 'igreja']);
    expect(colportagem[0].to).toBe('/admin?tab=colportagem');
    const loja = staffShortcuts(perms(['manage_orders', 'manage_catalog']), 4).map((s) => s.id);
    expect(loja).toEqual(['orders', 'books', 'support', 'acompanhamento']);
  });

  it('ninguém sem ser administrador vê atalhos para as Integrações', () => {
    const todos = Object.keys({
      manage_catalog: 1, manage_orders: 1, manage_settings: 1, manage_users: 1, manage_payments: 1,
      confirm_payments: 1, manage_marketing: 1, manage_church_registry: 1, manage_colporteurs: 1,
    });
    expect(staffShortcuts(perms(todos)).map((s) => s.id)).not.toContain('apps');
    expect(staffShortcuts(perms([], true)).map((s) => s.id)).toContain('apps');
  });
});
