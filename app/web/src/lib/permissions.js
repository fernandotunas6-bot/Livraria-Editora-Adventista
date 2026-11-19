// Permissões granulares do painel. As mesmas chaves são verificadas no servidor
// (private.has_permission na base de dados e requirePermission na Edge Function).
//
// `area`: o grupo do painel onde a permissão mora (o mesmo id de ADMIN_GROUPS em
// lib/adminSections.js), para o ecrã das permissões as arrumar como a navegação. O que cada uma
// abre não se escreve aqui: calcula-se do registo das secções (`sectionsOpenedBy`), para não
// divergir.
export const PERMISSIONS = {
  manage_catalog: { area: 'catalogo', label: 'Gerir Catálogo', description: 'Produtos, coleções, slider, materiais em PDF e a moderação da comunidade' },
  manage_store_stock: { area: 'catalogo', label: 'Stock da loja', description: 'Marcar «temos» ou «não temos» nos produtos da sua loja (a da ficha de funcionário), sem mexer em preços nem textos' },
  manage_production: { area: 'producao', label: 'Produção da Editora', description: 'Ordens de produção, etapas e responsáveis, custos e fornecedores; concluir põe a tiragem no stock' },
  manage_orders: { area: 'vendas', label: 'Gerir Encomendas', description: 'Ver e actualizar encomendas, acompanhá-las e falar com os clientes' },
  manage_payments: { area: 'vendas', label: 'Pagamentos', description: 'Métodos de pagamento (IBAN, links, QR)' },
  confirm_payments: { area: 'vendas', label: 'Confirmar pagamentos', description: 'Confirmar, rejeitar e anular pagamentos, registar dinheiro recebido e reembolsos' },
  view_reports: { area: 'relatorios', label: 'Ver relatórios', description: 'A facturação: vendas por loja, o relatório conjunto das livrarias, o relatório de caixa e os números do mês no Início' },
  view_store_dashboard: { area: 'relatorios', label: 'Painel da sua loja', description: 'O Painel de Gestão (vendas ao vivo e a meta do mês) só da loja da sua ficha de funcionário: para o gerente de cada livraria' },
  edit_reports: { area: 'relatorios', label: 'Editar relatórios de vendas', description: 'Registar e corrigir as vendas mensais de cada loja — à mão ou a partir das vendas do sistema —, metas e observações. Só vale com «Ver relatórios»; apagar um ano inteiro é só do administrador' },
  manage_users: { area: 'clientes', label: 'Utilizadores e Clientes', description: 'Gerir contas de clientes e as equipas que recebem os alertas (a equipa é só para administradores)' },
  manage_marketing: { area: 'clientes', label: 'Marketing', description: 'Contactos, campanhas por email e WhatsApp e a faixa de aviso' },
  manage_staff: { area: 'funcionarios', label: 'Funcionários', description: 'As fichas de quem trabalha na livraria e na Editora, com ou sem conta no painel (sem salários)' },
  manage_finance: { area: 'relatorios', label: 'Finanças (saídas)', description: 'Pagamentos a fornecedores, salários, e as entradas e saídas de dinheiro' },
  manage_church_registry: { area: 'igreja', label: 'Registo da Igreja', description: 'Campos, distritos, igrejas e pastores' },
  manage_colporteurs: { area: 'igreja', label: 'Colportagem', description: 'Colportores, relatórios, stock entregue, percentagens e acertos' },
  manage_settings: { area: 'sistema', label: 'Configurações', description: 'Marca, portes, contactos, aparência, lojas físicas e a faixa de aviso' },
};

export const ROLES = {
  member: { label: 'Cliente', description: 'Compra na loja e acompanha as suas encomendas. Sem acesso ao painel.' },
  manager: { label: 'Gestor', description: 'Acesso ao painel apenas nas áreas que lhe forem permitidas.' },
  admin: { label: 'Administrador', description: 'Acesso total, incluindo a equipa, papéis e permissões.' },
};

export const DEFAULT_PERMISSIONS = {
  manage_catalog: false,
  manage_store_stock: false,
  manage_production: false,
  manage_staff: false,
  manage_finance: false,
  manage_orders: false,
  manage_settings: false,
  manage_users: false,
  manage_payments: false,
  confirm_payments: false,
  view_reports: false,
  view_store_dashboard: false,
  edit_reports: false,
  manage_marketing: false,
  manage_church_registry: false,
  manage_colporteurs: false,
};

export const MANAGER_PERMISSIONS = {
  manage_catalog: true,
  manage_store_stock: false,
  manage_production: false,
  manage_staff: false,
  manage_finance: false,
  manage_orders: true,
  manage_settings: false,
  manage_users: false,
  manage_payments: false,
  confirm_payments: false,
  view_reports: false,
  view_store_dashboard: false,
  edit_reports: false,
  manage_marketing: true,
  manage_church_registry: false,
  manage_colporteurs: false,
};

/** Só os gestores usam permissões granulares; clientes não têm nenhuma e administradores têm todas. */
export function getUserPermissions(user) {
  if (!user) return { ...DEFAULT_PERMISSIONS };
  if (user.role === 'admin') {
    return Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));
  }
  if (user.role !== 'manager') return { ...DEFAULT_PERMISSIONS };
  const own = user.permissions || {};
  return Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, own[k] === true]));
}

export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!getUserPermissions(user)[key];
}

export function canAccessAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Object.values(getUserPermissions(user)).some(Boolean);
}
