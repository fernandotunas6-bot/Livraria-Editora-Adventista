// As áreas de cada pessoa no site, com as suas vistas, num só sítio — como o painel tem o
// lib/adminSections.js:
//
//   A minha conta (/profile?tab=…)        — todos os que entraram;
//   Área do colportor (/colportor?tab=…)   — quem tem uma ficha de colportor ligada à conta;
//   Painel da equipa (/admin?tab=…&vista=…) — quem tem alguma permissão (ver adminSections).
//
// O menu da conta, o menu do cabeçalho, o rodapé, o perfil e a área do colportor leem daqui: as
// ligações vão sempre para a vista certa (no endereço), e só aparece o que a pessoa pode abrir.
// Os identificadores vão no endereço; não mudar os existentes (há ligações nos emails, nos
// avisos e na política de privacidade).

import {
  Bell, BookOpen, ClipboardList, Globe, Heart, LayoutDashboard, Library, Lock, Scale, Send, Settings,
  ShoppingBag, Truck, Users,
} from 'lucide-react';
import { adminHref, buildAdminNav, flattenNav } from '@/lib/adminSections';

/** A minha conta. `allowed(c)`: c = { canAccessAdmin, canManageContacts }. `staff`: ferramentas da equipa. */
export const ACCOUNT_VIEWS = [
  { id: 'orders', label: 'Encomendas', icon: ShoppingBag, description: 'As suas encomendas, o estado de cada uma, pagar, cancelar e os recibos.' },
  { id: 'wishlist', label: 'Lista de desejos', icon: Heart, description: 'Os livros que guardou para mais tarde.' },
  { id: 'biblioteca', label: 'Biblioteca', icon: Library, description: 'Os seus livros digitais: abrem quando o pagamento estiver confirmado.' },
  { id: 'notifications', label: 'Notificações', icon: Bell, description: 'Os avisos da loja e da comunidade, e o que quer receber.' },
  { id: 'settings', label: 'Dados pessoais', icon: Settings, description: 'O nome, o telefone e a fotografia.' },
  { id: 'security', label: 'Segurança e privacidade', icon: Lock, description: 'A palavra-passe, a verificação em dois passos, as sessões e os seus dados.' },
  { id: 'workspace', label: 'Google Workspace', icon: LayoutDashboard, staff: true, allowed: (c) => c.canAccessAdmin, description: 'Drive, Docs e Sheets da loja.' },
  { id: 'crm', label: 'CRM Contactos', icon: Users, staff: true, allowed: (c) => c.canManageContacts, description: 'Contactos e campanhas.' },
];

export const DEFAULT_ACCOUNT_VIEW = 'orders';

/** As vistas da conta que esta pessoa pode abrir. */
export const accountViews = (ctx = {}) => ACCOUNT_VIEWS.filter((v) => !v.allowed || v.allowed(ctx));

/** Endereços antigos que continuam a abrir a vista certa (há ligações em emails e avisos). */
export const ACCOUNT_VIEW_ALIASES = { pdfs: 'biblioteca' };

/** A vista pedida, se existir e a pessoa a puder abrir; senão as encomendas. */
export function resolveAccountView(requested, ctx = {}) {
  const id = ACCOUNT_VIEW_ALIASES[requested] || requested;
  return accountViews(ctx).some((v) => v.id === id) ? id : DEFAULT_ACCOUNT_VIEW;
}

export const accountHref = (view) => (!view || view === DEFAULT_ACCOUNT_VIEW ? '/profile?tab=orders' : `/profile?tab=${view}`);

/** A área do colportor. Os avisos de entrega abrem /colportor?tab=entregas. */
export const COLPORTEUR_VIEWS = [
  { id: 'relatorio', label: 'Relatório', icon: Send, description: 'O relatório desta semana: horas, vendas e livros.' },
  { id: 'entregas', label: 'Entregas', icon: Truck, description: 'As encomendas do site para entregar, e as que aceitou.' },
  { id: 'livros', label: 'Livros', icon: BookOpen, description: 'Os livros que tem à consignação.' },
  { id: 'historico', label: 'Relatórios', icon: ClipboardList, description: 'Os relatórios enviados e o estado de cada um.' },
  { id: 'site', label: 'No site', icon: Globe, description: 'As vendas no site com o seu código.' },
  { id: 'conta', label: 'Conta', icon: Scale, description: 'A conta corrente: o que deve e o que lhe devem.' },
];

export const DEFAULT_COLPORTEUR_VIEW = 'relatorio';

export const resolveColporteurView = (requested) => (COLPORTEUR_VIEWS.some((v) => v.id === requested) ? requested : DEFAULT_COLPORTEUR_VIEW);

export const colporteurHref = (view) => (!view || view === DEFAULT_COLPORTEUR_VIEW ? '/colportor' : `/colportor?tab=${view}`);

// As secções do painel por ordem de uso no dia-a-dia, para os atalhos fora do painel (o menu
// "Gestão" do cabeçalho, o menu do telemóvel e o perfil). Só as que a pessoa pode abrir.
const SHORTCUT_ORDER = [
  'orders', 'books', 'support', 'colportagem', 'acompanhamento', 'pagamentos-caixa', 'contacts', 'igreja',
  'collections', 'slides', 'community', 'downloads', 'relatorios-lojas', 'vendas-huambo', 'users', 'equipas', 'payments', 'stores',
  'settings', 'notices', 'versoes', 'apps', 'seguranca',
];

/**
 * Os atalhos do painel para esta pessoa (`perms` de `adminPermissions`): as secções que ela pode
 * abrir, pela ordem de uso, com o endereço de cada uma. Ninguém vê atalhos para secções que o
 * painel lhe ia recusar.
 */
export function staffShortcuts(perms, limit = Infinity) {
  const items = flattenNav(buildAdminNav(perms)).filter((i) => i.id !== 'inicio');
  return SHORTCUT_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .slice(0, limit)
    .map((i) => ({ id: i.id, label: i.label, description: i.description, icon: i.icon, to: adminHref(i.id), group: i.groupLabel }));
}
