// As secções do painel, num só sítio: a que grupo pertencem, como se chamam na navegação e no
// título da página, o que fazem, que ícone têm e quem as pode ver.
//
// As duas disposições do painel (separadores no topo e barra lateral), a gaveta do telemóvel e a
// procura (Ctrl+K) leem todas daqui. Antes cada uma teria a sua lista, e as listas divergiam: uma
// secção nova aparecia num sítio e não noutro, ou com outro nome.
//
// O identificador é o que vai no endereço (/admin?tab=orders). Não mudar os existentes: há
// ligações para eles nos avisos, nos emails e noutras páginas do site.

import {
  BarChart3, BookHeart, Church, CreditCard, FileDown, Image, LayoutDashboard, Layers, Megaphone, MessageCircle,
  MessagesSquare, PackageSearch, PanelTop, Plug, Settings, ShieldCheck, ShoppingBag, Siren, Store, Users,
  UsersRound, Wallet,
} from 'lucide-react';

export const DEFAULT_SECTION = 'inicio';

/** Grupos, pela ordem em que aparecem. O Início fica sozinho, antes dos grupos. */
export const ADMIN_GROUPS = [
  { id: 'inicio', label: '', sections: ['inicio'] },
  { id: 'catalogo', label: 'Catálogo', sections: ['books', 'collections', 'slides', 'downloads'] },
  { id: 'vendas', label: 'Vendas', sections: ['orders', 'acompanhamento', 'equipas', 'payments', 'stores'] },
  { id: 'relatorios', label: 'Relatórios', sections: ['vendas-huambo', 'pagamentos-caixa'] },
  { id: 'clientes', label: 'Clientes', sections: ['users', 'contacts', 'support', 'community'] },
  { id: 'igreja', label: 'Igreja', sections: ['colportagem', 'igreja'] },
  { id: 'sistema', label: 'Sistema', sections: ['settings', 'notices', 'apps', 'seguranca'] },
];

/**
 * `label`: nome curto, na navegação. `title`: título da página. `keywords`: outras palavras
 * que as pessoas usam para a mesma coisa (sem acentos), para a procura. `allowed(p)`: quem vê (as
 * mesmas regras das permissões na base de dados; ver `adminPermissions`).
 */
export const ADMIN_SECTIONS = {
  inicio: {
    label: 'Início', title: 'Início', icon: LayoutDashboard,
    keywords: 'resumo dashboard hoje painel principal',
    description: 'O que precisa de atenção: encomendas, pagamentos por confirmar e stock.',
    allowed: () => true,
  },
  books: {
    label: 'Produtos', title: 'Produtos', icon: PackageSearch,
    keywords: 'livros produtos stock inventario catalogo precos bíblias revistas uniformes',
    description: 'Livros, Bíblias, revistas, uniformes, t-shirts e materiais: tudo gerido aqui.',
    allowed: (p) => p.catalog,
  },
  collections: {
    label: 'Coleções', title: 'Coleções', icon: Layers,
    keywords: 'coleccoes colecoes series temas',
    description: 'Agrupe livros em coleções temáticas. A ordem aqui é a ordem na página Coleções.',
    allowed: (p) => p.catalog,
  },
  slides: {
    label: 'Slider', title: 'Slider da página inicial e da loja', icon: Image,
    keywords: 'banner banners carrossel destaque pagina inicial',
    description: 'O slide principal aparece sempre primeiro; os outros seguem a ordem da lista.',
    allowed: (p) => p.catalog,
  },
  downloads: {
    label: 'Materiais (PDF)', title: 'Materiais para descarregar', icon: FileDown,
    keywords: 'pdf ficheiros materiais descarregar gratis',
    description: 'PDFs gratuitos para todos, ou para quem comprou o produto. Aparecem em /materiais e na ficha do produto.',
    allowed: (p) => p.catalog,
  },
  orders: {
    label: 'Encomendas', title: 'Encomendas', icon: ShoppingBag,
    keywords: 'pedidos vendas compras encomenda entregas recibos',
    description: 'Todas as encomendas: estado, pagamento, entrega, seguimento e recibos.',
    allowed: (p) => p.orders,
  },
  acompanhamento: {
    label: 'Acompanhamento', title: 'Acompanhamento das encomendas', icon: Siren,
    keywords: 'atrasos vigilancia prazos assumir alertas',
    description: 'Encomendas por assumir, cada passo, os atrasos e os problemas dos clientes. Verificado de 10 em 10 minutos.',
    allowed: (p) => p.orders,
  },
  equipas: {
    label: 'Equipas e alertas', title: 'Equipas e alertas', icon: UsersRound,
    keywords: 'turnos responsaveis escalada alertas avisos',
    description: 'Quem recebe cada encomenda e cada alerta, quem tem de assumir, e a quem sobe quando ninguém responde a tempo.',
    allowed: (p) => p.users || p.orders,
  },
  payments: {
    label: 'Métodos de pagamento', title: 'Métodos de pagamento', icon: CreditCard,
    keywords: 'iban multicaixa express transferencia unitel referencia pagamento',
    description: 'Os métodos que o checkout aceita: dados da conta, instruções, links e QR.',
    allowed: (p) => p.payments,
  },
  stores: {
    label: 'Lojas', title: 'Lojas físicas', icon: Store,
    keywords: 'balcao levantamento moradas mapa',
    description: 'Aparecem em /lojas, no rodapé, no menu e no levantamento das encomendas.',
    allowed: (p) => p.settings,
  },
  'vendas-huambo': {
    label: 'Vendas por loja', title: 'Vendas por loja', icon: BarChart3,
    keywords: 'faturacao facturacao relatorio vendas lojas',
    description: 'Facturação de cada loja, por período, com os produtos mais vendidos.',
    allowed: (p) => p.orders,
  },
  'pagamentos-caixa': {
    label: 'Pagamentos e caixa', title: 'Pagamentos e caixa', icon: Wallet,
    keywords: 'caixa recebimentos reembolsos dinheiro fecho',
    description: 'Pagamentos recebidos e por confirmar, reembolsos e o fecho de caixa.',
    allowed: (p) => p.orders || p.confirmPayments,
  },
  users: {
    label: 'Utilizadores', title: 'Utilizadores e clientes', icon: Users,
    keywords: 'equipa contas clientes permissoes papeis senha palavra-passe',
    description: 'Contas da equipa e dos clientes, papéis e permissões.',
    allowed: (p) => p.users,
  },
  contacts: {
    label: 'Contactos e campanhas', title: 'Contactos e campanhas', icon: Megaphone,
    keywords: 'email marketing newsletter campanhas whatsapp listas',
    description: 'Listas de contactos e campanhas por email e WhatsApp.',
    allowed: (p) => p.marketing,
  },
  support: {
    label: 'Atendimento', title: 'Atendimento', icon: MessageCircle,
    keywords: 'chat mensagens conversas ajuda clientes',
    description: 'Conversas com os clientes e pedidos de ajuda.',
    allowed: (p) => p.orders,
  },
  community: {
    label: 'Comunidade', title: 'Comunidade', icon: MessagesSquare,
    keywords: 'moderacao denuncias publicacoes leitores',
    description: 'Moderar, destacar e organizar a comunidade de leitores.',
    allowed: (p) => p.catalog,
  },
  colportagem: {
    label: 'Colportagem', title: 'Colportagem', icon: BookHeart,
    keywords: 'colportores candidaturas comissoes relatorios',
    description: 'Colportores, candidaturas, relatórios de vendas e comissões.',
    allowed: (p) => p.colporteurs,
  },
  igreja: {
    label: 'Registo da Igreja', title: 'Registo da Igreja', icon: Church,
    keywords: 'pastores igrejas distritos campos',
    description: 'Campos, distritos, igrejas e pastores, por província e município.',
    allowed: (p) => p.churchRegistry,
  },
  settings: {
    label: 'Configurações', title: 'Configurações', icon: Settings,
    keywords: 'definicoes portes envio loja manutencao aparencia contactos',
    description: 'Dados da loja, portes, contactos, aparência e preferências do site.',
    allowed: (p) => p.settings,
  },
  notices: {
    label: 'Faixa de aviso', title: 'Faixa de aviso', icon: PanelTop,
    keywords: 'banner faixa aviso promocao topo',
    description: 'Um aviso curto no topo de todas as páginas da loja: urgente, promoção ou informação.',
    allowed: (p) => p.settings || p.marketing,
  },
  apps: {
    label: 'Integrações', title: 'Integrações', icon: Plug,
    keywords: 'whatsapp email api servicos ligacoes',
    description: 'WhatsApp, email, pagamentos e os outros serviços ligados à loja.',
    allowed: (p) => p.isAdmin,
  },
  seguranca: {
    label: 'Registo de segurança', title: 'Registo de segurança', icon: ShieldCheck,
    keywords: 'auditoria log registo alteracoes',
    description: 'Cada alteração sensível (pagamentos, contactos, permissões, segredos, preços), com quem a fez e o antes e depois. Não se pode apagar.',
    allowed: (p) => p.isAdmin,
  },
};

/** As permissões do painel a partir da conta (`useAuth`): as mesmas regras de sempre. */
export function adminPermissions({ isAdmin = false, hasPermission = () => false } = {}) {
  const has = (key) => !!isAdmin || !!hasPermission(key);
  return {
    isAdmin: !!isAdmin,
    catalog: has('manage_catalog'),
    orders: has('manage_orders'),
    settings: has('manage_settings'),
    users: has('manage_users'),
    payments: has('manage_payments'),
    confirmPayments: has('confirm_payments'),
    marketing: has('manage_marketing'),
    // Quem gere colportores também vê as igrejas e os pastores (só leitura).
    churchRegistry: has('manage_church_registry') || has('manage_colporteurs'),
    colporteurs: has('manage_colporteurs'),
  };
}

/**
 * A navegação para esta pessoa: só os grupos com alguma secção que ela pode ver.
 * `badges`: { [secção]: { count, tone: 'warning' | 'info' } } — o que pede acção (encomendas por
 * tratar, stock baixo…), não totais.
 */
export function buildAdminNav(perms, badges = {}) {
  return ADMIN_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.sections
      .filter((id) => ADMIN_SECTIONS[id]?.allowed(perms))
      .map((id) => {
        const s = ADMIN_SECTIONS[id];
        const badge = badges[id];
        return {
          id,
          group: group.id,
          groupLabel: group.label,
          label: s.label,
          title: s.title,
          description: s.description,
          keywords: s.keywords || '',
          icon: s.icon,
          badge: badge && Number(badge.count) > 0 ? { count: Number(badge.count), tone: badge.tone || 'info' } : null,
        };
      }),
  })).filter((group) => group.items.length > 0);
}

export const flattenNav = (nav) => nav.flatMap((g) => g.items);

export function findSection(nav, id) {
  for (const group of nav) {
    const item = group.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

/** A secção a abrir: a pedida, se a pessoa a pode ver; senão o Início (ou a primeira que tiver). */
export function resolveSection(nav, requested, fallback = DEFAULT_SECTION) {
  const items = flattenNav(nav);
  if (requested && items.some((i) => i.id === requested)) return requested;
  if (items.some((i) => i.id === fallback)) return fallback;
  return items[0]?.id || fallback;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Procura (Ctrl+K): por nome, título, descrição, grupo e sinónimos ("iban", "faturação",
 *  "senha"…), sem acentos nem maiúsculas. */
export function searchSections(nav, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const items = flattenNav(nav);
  if (!words.length) return items;
  return items.filter((i) => {
    const hay = fold(`${i.label} ${i.title} ${i.description} ${i.groupLabel} ${i.keywords || ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Texto curto para leitores de ecrã e dicas: "3 por tratar". */
export function badgeLabel(badge) {
  if (!badge) return '';
  return badge.tone === 'warning' ? `${badge.count} com alerta` : `${badge.count} por tratar`;
}
