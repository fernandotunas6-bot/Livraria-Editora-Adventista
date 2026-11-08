// O que falta para os clientes pagarem sem dúvidas — a lista no topo de Vendas → Métodos de
// pagamento. Cada ponto diz o que falta, porque importa e onde se resolve (`action`: a secção e a
// vista do painel). Os dados em si (NIF, telefone, prazo, gateway) são decisões do dono: o painel
// só os põe à vista.
//
// Função pura: `settings` são as definições públicas (useSiteSettings: contactos, nome legal, NIF);
// `rules` as da loja (site_settings, só para quem gere as configurações; null quando não se podem
// ler); `methods` os métodos de pagamento; `gateway` o estado do gateway (/admin/payments/gateway).

const PREPAY_TYPES = new Set(['transfer', 'p2p', 'link', 'reference']);

export function paymentSetupChecks({ settings = {}, rules = null, methods = [], gateway = null } = {}) {
  const items = [];
  const enabled = methods.filter((m) => m.enabled);

  if (!enabled.length) {
    items.push({
      id: 'sem-metodos',
      severity: 'critical',
      title: 'Nenhum método de pagamento activo',
      detail: 'O checkout aceita só "pagamento na entrega" até haver um método activo.',
      action: null,
    });
  }

  for (const m of enabled) {
    const semDados = PREPAY_TYPES.has(m.type) && !String(m.account_info || '').trim() && !String(m.payment_link || '').trim()
      && !String(m.qr_url || m.qr_code || '').trim();
    if (semDados) {
      items.push({
        id: `sem-dados-${m.code}`,
        severity: 'critical',
        title: `"${m.name}" está activo sem os dados para pagar`,
        detail: 'O cliente escolhe-o e não vê para onde mandar o dinheiro (IBAN, número, link ou QR). Preencha-os abaixo ou desactive o método.',
        action: null,
      });
    }
  }

  if (!String(settings.company_legal_name || '').trim() || !String(settings.company_nif || '').trim()) {
    items.push({
      id: 'recibo',
      severity: 'warning',
      title: 'O recibo não tem o nome legal e o NIF da empresa',
      detail: 'Saem no recibo de cada encomenda. Sem eles, o recibo serve ao cliente mas não como documento da empresa.',
      action: { section: 'settings', view: 'contact', label: 'Configurações → Contacto' },
    });
  }

  if (!String(settings.contact_phone || '').trim() && !String(settings.whatsapp || '').trim()) {
    items.push({
      id: 'contacto',
      severity: 'warning',
      title: 'Não há telefone nem WhatsApp da loja',
      detail: 'É por aí que o cliente confirma uma transferência ou pergunta por um pagamento. Aparece no checkout, nos emails e no rodapé.',
      action: { section: 'settings', view: 'contact', label: 'Configurações → Contacto' },
    });
  }

  if (rules && Number(rules.unpaid_cancel_days || 0) === 0) {
    items.push({
      id: 'prazo',
      severity: 'info',
      title: 'As encomendas por pagar nunca são canceladas sozinhas',
      detail: 'O stock fica reservado até alguém a cancelar. Com um prazo (ex.: 3 dias), as que não forem pagas nem tiverem referência cancelam-se e o stock volta.',
      action: { section: 'settings', view: 'rules', label: 'Configurações → Regras da loja' },
    });
  }

  if (gateway && !gateway.configured) {
    const automaticos = enabled.filter((m) => m.type === 'p2p' || m.gateway_provider);
    if (automaticos.length) {
      items.push({
        id: 'gateway',
        severity: 'info',
        title: `${automaticos.map((m) => m.name).join(', ')}: confirmado à mão`,
        detail: 'Sem o gateway ligado, cada pagamento é confirmado por um funcionário com a permissão. Ver "Gateway de pagamentos", abaixo.',
        action: null,
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
