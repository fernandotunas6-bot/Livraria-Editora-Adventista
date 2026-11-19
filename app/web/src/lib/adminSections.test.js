import { describe, expect, it } from 'vitest';
import {
  ADMIN_GROUPS, ADMIN_SECTIONS, DEFAULT_SECTION, adminHref, adminOnlySections, adminPermissions, badgeLabel, buildAdminNav,
  defaultView, findSection, findView, flattenNav, flattenViews, navAreas, permissionsOfAccount, resolveSection, resolveView,
  searchSections, searchViews, sectionsOpenedBy, withViewBadges,
} from '@/lib/adminSections';
import { PERMISSIONS } from '@/lib/permissions';

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
    expect(searchSections(nav, 'relatorios').map((i) => i.id)).toEqual(['painel-gestao', 'relatorios-lojas', 'vendas-huambo', 'imagens-videos', 'pagamentos-caixa', 'financas', 'colportagem']);
    // o painel ao vivo, pelas palavras de quem o procura
    expect(searchSections(nav, 'ao vivo').map((i) => i.id)).toEqual(['painel-gestao']);
    // a biblioteca de imagens dos vídeos
    expect(searchSections(nav, 'paisagens').map((i) => i.id)).toEqual(['imagens-videos']);
    // o relatório conjunto encontra-se pelas palavras de quem o procura
    expect(searchSections(nav, 'consolidado').map((i) => i.id)).toEqual(['relatorios-lojas']);
    expect(searchSections(nav, 'todas as lojas').map((i) => i.id)).toEqual(['relatorios-lojas']);
  });

  it('entende as palavras que as pessoas usam para a mesma coisa', () => {
    expect(searchSections(nav, 'iban').map((i) => i.id)).toEqual(['payments']);
    // e o programa de facturação das livrarias (Ligação ao KanGest)
    expect(searchSections(nav, 'faturação').map((i) => i.id)).toEqual(['vendas-huambo', 'kangest']);
    expect(searchSections(nav, 'senha').map((i) => i.id)).toEqual(['users']);
    expect(searchSections(nav, 'banner').map((i) => i.id)).toEqual(['slides', 'notices']);
  });

  it('várias palavras têm de estar todas; vazio devolve tudo', () => {
    expect(searchSections(nav, 'faixa aviso').map((i) => i.id)).toEqual(['notices']);
    expect(searchSections(nav, '  ')).toHaveLength(flattenNav(nav).length);
    expect(searchSections(nav, 'xyzzy')).toEqual([]);
  });
});

describe('vistas (sub-secções)', () => {
  const admin = buildAdminNav(perms([], true));

  it('cada vista tem identificador único na secção, nome, ícone e descrição', () => {
    for (const [id, s] of Object.entries(ADMIN_SECTIONS)) {
      if (!s.views) continue;
      const vids = s.views.map((v) => v.id);
      expect(new Set(vids).size, id).toBe(vids.length);
      for (const v of s.views) {
        expect(v.label && v.description, `${id}/${v.id}`).toBeTruthy();
        expect(v.icon, `${id}/${v.id}`).toBeTruthy();
      }
    }
  });

  it('mantém os identificadores que as ligações e os separadores de antes já usam', () => {
    expect(ADMIN_SECTIONS.colportagem.views.map((v) => v.id)).toEqual(
      ['resumo', 'candidaturas', 'colportores', 'relatorios', 'interessados', 'entregas', 'guias', 'contas', 'reclassificacao', 'avaliacoes', 'percentagens', 'links', 'definicoes'],
    );
    expect(ADMIN_SECTIONS.settings.views.map((v) => v.id)).toEqual(
      ['brand', 'images', 'theme', 'shop', 'shipping', 'rules', 'contact', 'messaging', 'header', 'footer', 'pwa'],
    );
    expect(ADMIN_SECTIONS.apps.views.map((v) => v.id)).toEqual(['apps', 'templates', 'logs']);
    expect(ADMIN_SECTIONS.users.views.map((v) => v.id)).toEqual(['customers', 'team', 'cargos']);
  });

  it('as vistas de um grupo (Configurações) ficam seguidas', () => {
    const groups = ADMIN_SECTIONS.settings.views.map((v) => v.group);
    const seen = new Set();
    groups.forEach((g, i) => {
      if (g !== groups[i - 1]) {
        expect(seen.has(g), g).toBe(false);
        seen.add(g);
      }
    });
  });

  it('só aparecem as vistas que a pessoa pode abrir: Importar só para quem edita o registo da Igreja', () => {
    const editor = findSection(buildAdminNav(perms(['manage_church_registry'])), 'igreja');
    expect(editor.views.map((v) => v.id)).toContain('importar');
    expect(editor.readOnly).toBe(false);
    const leitor = findSection(buildAdminNav(perms(['manage_colporteurs'])), 'igreja');
    expect(leitor.views.map((v) => v.id)).not.toContain('importar');
    expect(leitor.readOnly).toBe(true);
  });

  it('resolveView: a pedida se existir nesta secção; senão a primeira; sem vistas, null', () => {
    const colp = findSection(admin, 'colportagem');
    expect(resolveView(colp, 'contas')).toBe('contas');
    expect(resolveView(colp, 'brand')).toBe('resumo');
    expect(resolveView(colp, null)).toBe('resumo');
    expect(defaultView(colp)).toBe('resumo');
    expect(resolveView(findSection(admin, 'orders'), 'contas')).toBeNull();
    expect(findView(colp, 'contas').label).toBe('Contas');
    expect(findView(colp, 'nada')).toBeNull();
  });

  it('adminHref: o endereço de uma secção e vista', () => {
    expect(adminHref('colportagem', 'candidaturas')).toBe('/admin?tab=colportagem&vista=candidaturas');
    expect(adminHref('orders')).toBe('/admin?tab=orders');
    expect(adminHref('inicio')).toBe('/admin');
  });

  it('os números das vistas: os que pedem acção vão para a navegação; os totais só se pedidos', () => {
    const nav = withViewBadges(admin, { colportagem: { candidaturas: { count: 2, tone: 'warning' }, colportores: { count: 9, tone: 'count' } } });
    const colp = findSection(nav, 'colportagem');
    expect(findView(colp, 'candidaturas').badge).toEqual({ count: 2, tone: 'warning' });
    expect(findView(colp, 'colportores').badge).toBeNull();
    const withCounts = findSection(withViewBadges(admin, { colportagem: { colportores: { count: 9, tone: 'count' } } }, { counts: true }), 'colportagem');
    expect(findView(withCounts, 'colportores').badge).toEqual({ count: 9, tone: 'count' });
    expect(badgeLabel({ count: 9, tone: 'count' })).toBe('9 no total');
  });

  it('a procura encontra vistas pelo nome, pela secção e pelos sinónimos — e vazia não devolve nenhuma', () => {
    const ids = (q) => searchViews(admin, q).map((v) => `${v.section}/${v.id}`);
    expect(ids('contas colportagem')).toEqual(['colportagem/contas']);
    expect(ids('portes')).toEqual(['settings/shipping']);
    expect(ids('pastores')).toEqual(expect.arrayContaining(['igreja/pastores']));
    expect(ids('')).toEqual([]);
    // as vistas sem acesso não aparecem
    expect(searchViews(buildAdminNav(perms(['manage_colporteurs'])), 'importar')).toEqual([]);
    expect(flattenViews(admin).length).toBeGreaterThan(30);
  });
});

describe('permissões arrumadas pelas áreas do painel', () => {
  it('cada permissão mora numa área do painel e abre pelo menos uma secção', () => {
    const areas = ADMIN_GROUPS.map((g) => g.id);
    for (const [key, p] of Object.entries(PERMISSIONS)) {
      expect(areas, key).toContain(p.area);
      expect(sectionsOpenedBy(key).length, key).toBeGreaterThan(0);
    }
  });

  it('o que cada permissão abre sai do registo das secções', () => {
    const labels = (key) => sectionsOpenedBy(key).map((s) => s.id);
    expect(labels('manage_catalog')).toEqual(['books', 'disponibilidade', 'collections', 'slides', 'downloads', 'imagens-videos', 'community']);
    // «Stock da loja» abre só a disponibilidade (migração lojas_donas_dos_dados).
    expect(labels('manage_store_stock')).toEqual(['disponibilidade']);
    expect(labels('manage_marketing')).toEqual(['contacts', 'notices']);
    expect(labels('manage_settings')).toEqual(['stores', 'settings', 'notices', 'versoes', 'saude', 'kangest']);
    expect(labels('manage_settings')).not.toContain('apps');
    // Produção, funcionários e finanças (migrações funcionarios, producao e saidas).
    expect(labels('manage_production')).toEqual(['producao']);
    expect(labels('manage_staff')).toEqual(['funcionarios']);
    expect(labels('manage_finance')).toEqual(['producao', 'financas', 'funcionarios']);
    expect(sectionsOpenedBy('manage_finance').find((s) => s.id === 'funcionarios').readOnly).toBe(true);
    const colp = sectionsOpenedBy('manage_colporteurs');
    expect(colp.map((s) => s.id)).toEqual(['colportagem', 'igreja']);
    expect(colp.find((s) => s.id === 'igreja').readOnly).toBe(true);
  });

  it('só o administrador abre as Integrações e o Registo de segurança', () => {
    expect(adminOnlySections().map((s) => s.id)).toEqual(['apps', 'seguranca']);
  });

  it('permissionsOfAccount: um gestor só com as suas; o administrador com todas; o cliente sem nenhuma', () => {
    const gestor = permissionsOfAccount({ role: 'manager', permissions: { manage_orders: true, manage_users: false } });
    expect(gestor.orders).toBe(true);
    expect(gestor.users).toBe(false);
    expect(permissionsOfAccount({ role: 'admin' }).isAdmin).toBe(true);
    expect(Object.values(permissionsOfAccount({ role: 'member', permissions: { manage_orders: true } })).some(Boolean)).toBe(false);
    // Os relatórios de dinheiro já não vêm com as encomendas (precisam de «Ver relatórios»).
    expect(navAreas(buildAdminNav(gestor))).toEqual(['Vendas', 'Clientes']);
    const comRelatorios = permissionsOfAccount({ role: 'manager', permissions: { manage_orders: true, view_reports: true } });
    expect(navAreas(buildAdminNav(comRelatorios))).toEqual(['Vendas', 'Relatórios', 'Clientes']);
  });
});

describe('relatórios de vendas: ver e editar', () => {
  it('«Editar relatórios de vendas» abre os dois painéis de vendas e as imagens dos vídeos, sem o caixa nem as finanças', () => {
    const ids = sectionsOpenedBy('edit_reports').map((x) => x.id);
    expect(ids).toEqual(['painel-gestao', 'relatorios-lojas', 'vendas-huambo', 'imagens-videos']);
    expect(sectionsOpenedBy('edit_reports').every((x) => x.readOnly === false)).toBe(true);
  });

  it('«Ver relatórios» abre os painéis de vendas só de leitura, e o caixa', () => {
    const v = sectionsOpenedBy('view_reports');
    expect(v.map((x) => x.id)).toEqual(['painel-gestao', 'relatorios-lojas', 'vendas-huambo', 'imagens-videos', 'pagamentos-caixa']);
    expect(v.find((x) => x.id === 'imagens-videos').readOnly).toBe(true);
    expect(v.find((x) => x.id === 'relatorios-lojas').readOnly).toBe(true);
    expect(v.find((x) => x.id === 'vendas-huambo').readOnly).toBe(true);
  });

  it('«Painel da sua loja» abre só o Painel de Gestão, de leitura', () => {
    const v = sectionsOpenedBy('view_store_dashboard');
    expect(v.map((x) => x.id)).toEqual(['painel-gestao']);
    expect(v[0].readOnly).toBe(true);
  });

  it('o administrador vê e edita', () => {
    const p = adminPermissions({ isAdmin: true });
    expect(p.salesReports && p.salesReportsEdit).toBe(true);
  });
});
