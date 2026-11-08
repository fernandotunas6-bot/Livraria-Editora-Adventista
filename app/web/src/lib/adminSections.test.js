import { describe, expect, it } from 'vitest';
import {
  ADMIN_GROUPS, ADMIN_SECTIONS, DEFAULT_SECTION, adminPermissions, badgeLabel, buildAdminNav, findSection, flattenNav,
  resolveSection, searchSections,
} from '@/lib/adminSections';

const ids = (nav) => flattenNav(nav).map((i) => i.id);
const perms = (keys = [], isAdmin = false) => adminPermissions({ isAdmin, hasPermission: (k) => keys.includes(k) });

describe('registo das secções', () => {
  it('cada secção dos grupos existe, com título, descrição e ícone, e aparece uma só vez', () => {
    const all = ADMIN_GROUPS.flatMap((g) => g.sections);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) {
      const s = ADMIN_SECTIONS[id];
      expect(s, id).toBeTruthy();
      expect(s.label && s.title && s.description, id).toBeTruthy();
      expect(s.icon, id).toBeTruthy();
    }
    expect(Object.keys(ADMIN_SECTIONS).sort()).toEqual([...all].sort());
  });

  it('mantém os identificadores que as ligações do site já usam', () => {
    for (const id of ['books', 'orders', 'acompanhamento', 'vendas-huambo', 'seguranca', 'support', 'colportagem', 'pagamentos-caixa']) {
      expect(ADMIN_SECTIONS[id], id).toBeTruthy();
    }
  });
});

describe('adminPermissions', () => {
  it('o administrador vê tudo', () => {
    const p = perms([], true);
    expect(Object.values(p).every(Boolean)).toBe(true);
  });

  it('quem gere colportores também vê o registo da Igreja', () => {
    const p = perms(['manage_colporteurs']);
    expect(p.colporteurs).toBe(true);
    expect(p.churchRegistry).toBe(true);
    expect(p.orders).toBe(false);
  });
});

describe('buildAdminNav', () => {
  it('o administrador vê todas as secções, pela ordem dos grupos, com o Início primeiro', () => {
    const nav = buildAdminNav(perms([], true));
    expect(ids(nav)[0]).toBe('inicio');
    expect(ids(nav)).toHaveLength(Object.keys(ADMIN_SECTIONS).length);
    expect(nav.map((g) => g.id)).toEqual(ADMIN_GROUPS.map((g) => g.id));
  });

  it('um gestor só de marketing vê o Início, os contactos e a faixa de aviso — e os grupos vazios não aparecem', () => {
    const nav = buildAdminNav(perms(['manage_marketing']));
    expect(ids(nav)).toEqual(['inicio', 'contacts', 'notices']);
    expect(nav.map((g) => g.id)).toEqual(['inicio', 'clientes', 'sistema']);
  });

  it('integrações e registo de segurança só para o administrador', () => {
    const nav = buildAdminNav(perms(['manage_settings', 'manage_orders', 'manage_users', 'manage_catalog', 'manage_payments', 'manage_marketing']));
    expect(ids(nav)).not.toContain('apps');
    expect(ids(nav)).not.toContain('seguranca');
    expect(ids(nav)).toContain('settings');
  });

  it('pagamentos e caixa também para quem só confirma pagamentos', () => {
    expect(ids(buildAdminNav(perms(['confirm_payments'])))).toEqual(['inicio', 'pagamentos-caixa']);
  });

  it('os números só aparecem quando há alguma coisa a tratar', () => {
    const nav = buildAdminNav(perms([], true), {
      orders: { count: 3 },
      books: { count: 2, tone: 'warning' },
      'pagamentos-caixa': { count: 0 },
    });
    expect(findSection(nav, 'orders').badge).toEqual({ count: 3, tone: 'info' });
    expect(findSection(nav, 'books').badge).toEqual({ count: 2, tone: 'warning' });
    expect(findSection(nav, 'pagamentos-caixa').badge).toBeNull();
    expect(badgeLabel(findSection(nav, 'orders').badge)).toBe('3 por tratar');
    expect(badgeLabel(findSection(nav, 'books').badge)).toBe('2 com alerta');
    expect(badgeLabel(null)).toBe('');
  });
});

describe('resolveSection', () => {
  const nav = buildAdminNav(perms(['manage_orders']));

  it('abre a pedida quando a pessoa a pode ver', () => {
    expect(resolveSection(nav, 'orders')).toBe('orders');
  });

  it('pedida sem acesso ou desconhecida: o Início', () => {
    expect(resolveSection(nav, 'settings')).toBe(DEFAULT_SECTION);
    expect(resolveSection(nav, 'nao-existe')).toBe(DEFAULT_SECTION);
    expect(resolveSection(nav, null)).toBe(DEFAULT_SECTION);
  });

  it('sem Início na lista, a primeira que houver', () => {
    const semInicio = nav.filter((g) => g.id !== 'inicio');
    expect(resolveSection(semInicio, null)).toBe('orders');
  });
});

describe('searchSections', () => {
  const nav = buildAdminNav(perms([], true));

  it('encontra sem acentos nem maiúsculas, pelo nome, pela descrição ou pelo grupo', () => {
    expect(searchSections(nav, 'colecoes').map((i) => i.id)).toEqual(['collections']);
    expect(searchSections(nav, 'PERMISSOES').map((i) => i.id)).toEqual(expect.arrayContaining(['users', 'seguranca']));
    // o grupo "Relatórios" e a colportagem, que fala de relatórios na descrição
    expect(searchSections(nav, 'relatorios').map((i) => i.id)).toEqual(['vendas-huambo', 'pagamentos-caixa', 'colportagem']);
  });

  it('entende as palavras que as pessoas usam para a mesma coisa', () => {
    expect(searchSections(nav, 'iban').map((i) => i.id)).toEqual(['payments']);
    expect(searchSections(nav, 'faturação').map((i) => i.id)).toEqual(['vendas-huambo']);
    expect(searchSections(nav, 'senha').map((i) => i.id)).toEqual(['users']);
    expect(searchSections(nav, 'banner').map((i) => i.id)).toEqual(['slides', 'notices']);
  });

  it('várias palavras têm de estar todas; vazio devolve tudo', () => {
    expect(searchSections(nav, 'faixa aviso').map((i) => i.id)).toEqual(['notices']);
    expect(searchSections(nav, '  ')).toHaveLength(flattenNav(nav).length);
    expect(searchSections(nav, 'xyzzy')).toEqual([]);
  });
});
