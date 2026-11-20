// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Leitura do registo de segurança (tabela `security_audit_log`, migração
// 20261107130000_registo_de_seguranca). A base escreve; aqui só se traduz para o painel.

export const ACTOR_KINDS = {
  conta: 'Sessão no painel',
  servidor: 'Servidor (API)',
  login: 'Sistema de login',
  agendador: 'Tarefa automática',
  sql: 'Acesso directo à base de dados',
};

export const AREAS = {
  payment_methods: 'Pagamentos',
  site_settings: 'Configurações',
  profiles: 'Contas e permissões',
  physical_stores: 'Lojas',
  site_secrets: 'Segredos',
  app_integrations: 'Integrações',
  orders: 'Encomendas',
  stock_books: 'Preços',
  downloads: 'Materiais (PDF)',
};

const FIELDS = {
  account_info: 'Conta / IBAN',
  instructions: 'Instruções de pagamento',
  payment_link: 'Link de pagamento',
  qr_url: 'QR (imagem)',
  qr_code: 'QR (código)',
  gateway_provider: 'Fornecedor',
  requires_reference: 'Pede referência',
  enabled: 'Activo',
  active: 'Activa',
  name: 'Nome',
  code: 'Código',
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  email: 'Email',
  address: 'Morada',
  contact_email: 'Email de contacto',
  contact_phone: 'Telefone de contacto',
  contact_address: 'Morada de contacto',
  site_url: 'Endereço do site',
  smtp_host: 'Servidor de email',
  smtp_user: 'Utilizador do email',
  smtp_from_email: 'Remetente dos emails',
  email_provider: 'Fornecedor de email',
  maintenance_mode: 'Modo de manutenção',
  role: 'Papel',
  permissions: 'Permissões',
  payment_status: 'Pagamento',
  status: 'Estado',
  total: 'Total',
  shipping_cost: 'Portes',
  payment_reference: 'Referência de pagamento',
  price: 'Preço',
  sale_price: 'Preço promocional',
  access: 'Acesso',
  file_path: 'Ficheiro',
  config: 'Configuração',
};

/** Quem fez: o email da conta, ou de onde veio a alteração quando não houve sessão. */
export function actorLabel(row) {
  const email = String(row?.actor_email || '').trim();
  if (email) return email;
  return ACTOR_KINDS[row?.actor_kind] || 'Desconhecido';
}

export function areaLabel(table) {
  return AREAS[table] || table || '—';
}

export function fieldLabel(field) {
  return FIELDS[field] || field;
}

/** Um valor do antes/depois em texto legível. */
export function formatValue(value) {
  if (value === null || value === undefined || value === '') return '(vazio)';
  if (value === true) return 'sim';
  if (value === false) return 'não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** `changes` da base ({campo: {de, para}}) em linhas ordenadas para mostrar. */
export function changeRows(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  return Object.keys(changes)
    .sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b), 'pt'))
    .map((field) => {
      const change = changes[field] && typeof changes[field] === 'object' ? changes[field] : {};
      return { field, label: fieldLabel(field), from: formatValue(change.de), to: formatValue(change.para) };
    });
}

/** Filtros do ecrã: área, só os que avisaram, e texto livre (resumo, autor, campos). */
export function filterRows(rows, { area = '', alertedOnly = false, query = '' } = {}) {
  const q = String(query || '').trim().toLocaleLowerCase('pt');
  return (rows || []).filter((row) => {
    if (area && row.table_name !== area) return false;
    if (alertedOnly && !row.alerted) return false;
    if (!q) return true;
    const haystack = [row.summary, actorLabel(row), areaLabel(row.table_name), JSON.stringify(row.changes || {})]
      .join(' ')
      .toLocaleLowerCase('pt');
    return haystack.includes(q);
  });
}
