/**
 * Os emails que a loja envia, um por acontecimento real do sistema.
 *
 * Cada função devolve `{ subject, doc }`; a moldura e as versões HTML/texto vêm do
 * `emails.ts`. Separar assim mantém o conteúdo de cada mensagem legível e garante que todas
 * têm o mesmo cabeçalho, o mesmo rodapé e a mesma linha a dizer porque foi enviada.
 *
 * O catálogo segue o que esta loja tem: produtos físicos (livros, Bíblias, uniformes, materiais), com entrega ao domicílio ou
 * levantamento na loja. Não há produtos digitais, licenças nem vendedores no esquema da base
 * de dados, por isso não há aqui modelos para isso — seriam ficheiros que nada chamaria.
 */
import { deliveryAddressLine, paymentLabel, pickupStoreName } from "./orderFields.ts";
import { formatKz, type Brand, type EmailDoc, type SafeSymbol, type Step } from "./emails.ts";

type Row = Record<string, any>;
export type Letter = { subject: string; doc: EmailDoc };

const money = formatKz;

const dateLong = (value: unknown) => {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" });
};

const firstName = (name: unknown) => String(name || "").trim().split(/\s+/)[0] || "";

const orderRef = (order: Row) => String(order.order_number || order.id || "").trim();

const isPickup = (order: Row) => String(order.shipping_method || "") === "pickup";

/** Link de rastreio da encomenda. `/track` pede o número e o email, por isso é seguro. */
const trackUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/track` : "");
const ordersUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/profile?tab=orders` : "");

const REASON_ORDER = "Recebeu esta mensagem porque fez uma encomenda nesta loja.";
const REASON_ACCOUNT = "Recebeu esta mensagem por causa de um pedido feito na sua conta.";

function orderItems(order: Row) {
  return (order.items || []).map((it: Row) => ({
    quantity: Number(it.quantity) || 1,
    title: String(it.title || "Produto"),
    detail: [it.variant_label ? String(it.variant_label) : "", it.book_code ? String(it.book_code) : ""].filter(Boolean).join(" · ") || undefined,
    amount: money((Number(it.quantity) || 1) * (Number(it.price) || 0)),
  }));
}

function orderTotals(order: Row) {
  const totals = [];
  const shipping = Number(order.shipping_cost) || 0;
  totals.push({ label: isPickup(order) ? "Levantamento na loja" : "Envio", value: shipping ? money(shipping) : "Grátis" });
  totals.push({ label: "Total", value: money(order.total), strong: true });
  return totals;
}

function deliveryDetails(order: Row) {
  const details = [{ label: "Encomenda", value: orderRef(order) }];
  if (order.created) details.push({ label: "Data", value: dateLong(order.created) });
  const payment = paymentLabel(order);
  if (payment) details.push({ label: "Pagamento", value: payment });
  if (isPickup(order)) {
    const store = pickupStoreName(order);
    if (store) details.push({ label: "Levantamento", value: store });
  } else {
    const address = deliveryAddressLine(order);
    if (address) details.push({ label: "Entrega", value: address });
  }
  return details;
}

/**
 * Linha de progresso da encomenda, com a etapa actual assinalada.
 *
 * As etapas são as do `delivery_status` que a loja já usa, e o texto muda quando é
 * levantamento na loja: "Enviada" não diz nada a quem vai buscar o livro ao balcão.
 */
export function orderSteps(order: Row, status: string): Step[] {
  const pickup = isPickup(order);
  const sequence = pickup
    ? [
        { key: "received", label: "Encomenda recebida" },
        { key: "confirmed", label: "Pagamento confirmado" },
        { key: "preparing", label: "A preparar na loja" },
        { key: "shipped", label: "Pronta para levantamento" },
        { key: "delivered", label: "Entregue" },
      ]
    : [
        { key: "received", label: "Encomenda recebida" },
        { key: "confirmed", label: "Pagamento confirmado" },
        { key: "preparing", label: "A preparar" },
        { key: "shipped", label: "Expedida" },
        { key: "in_transit", label: "Em trânsito" },
        { key: "out_for_delivery", label: "Saiu para entrega" },
        { key: "delivered", label: "Entregue" },
      ];
  const index = sequence.findIndex((s) => s.key === status);
  // Um estado fora da sequência (por exemplo `cancelled`) não marca nada como feito: mostrar
  // etapas concluídas a seguir a um cancelamento seria dizer ao cliente o contrário do que é.
  return sequence.map((s, i) => ({
    label: s.label,
    done: index >= 0 && i < index,
    current: index >= 0 && i === index,
  }));
}

// ---------------------------------------------------------------------------
// A. Conta e segurança
// ---------------------------------------------------------------------------

export function welcomeLetter(brand: Brand, name: string): Letter {
  return {
    subject: `Bem-vindo à ${brand.siteName}`,
    doc: {
      symbol: "✦",
      tone: "brand",
      title: `Bem-vindo, ${firstName(name) || "leitor"}!`,
      subtitle: "A sua conta está criada.",
      lead: [
        "A partir de agora pode acompanhar as suas encomendas, guardar produtos na lista de desejos e deixar avaliações.",
      ],
      cta: brand.siteUrl ? { label: "Ver o catálogo", url: `${brand.siteUrl.replace(/\/$/, "")}/shop` } : undefined,
      secondaryCta: ordersUrl(brand.siteUrl) ? { label: "A minha conta", url: ordersUrl(brand.siteUrl) } : undefined,
      reason: "Recebeu esta mensagem porque criou uma conta nesta loja.",
    },
  };
}

export function accessLinkLetter(brand: Brand, name: string, kind: "invite" | "reset", link: string): Letter {
  const invite = kind === "invite";
  return {
    subject: invite ? `A sua conta na ${brand.siteName}` : "Recuperar o acesso à sua conta",
    doc: {
      symbol: invite ? "✉" : "↻",
      tone: invite ? "brand" : "warning",
      title: invite ? "A sua conta está pronta" : "Definir uma nova palavra-passe",
      subtitle: invite
        ? "Falta só definir a palavra-passe."
        : "O link abaixo abre o ecrã para escolher uma nova.",
      lead: [
        `Olá${firstName(name) ? `, ${firstName(name)}` : ""}.`,
        invite
          ? "Use o botão para definir a sua palavra-passe e entrar na loja."
          : "Se não foi você que pediu esta mudança, ignore esta mensagem: a palavra-passe actual continua válida.",
      ],
      cta: { label: invite ? "Definir palavra-passe" : "Escolher nova palavra-passe", url: link },
      notes: [
        "Este link é pessoal, serve uma só vez e expira dentro de uma hora.",
        "Nunca lhe pedimos a palavra-passe por email nem por telefone.",
      ],
      reason: REASON_ACCOUNT,
    },
  };
}

export function passwordChangedLetter(brand: Brand, name: string): Letter {
  return {
    subject: "A sua palavra-passe foi alterada",
    doc: {
      symbol: "✓",
      tone: "success",
      title: "Palavra-passe alterada",
      subtitle: "A alteração foi concluída.",
      lead: [
        `Olá${firstName(name) ? `, ${firstName(name)}` : ""}. A palavra-passe da sua conta acabou de ser alterada.`,
        "Se não foi você, recupere o acesso de imediato e avise-nos.",
      ],
      cta: brand.siteUrl ? { label: "Recuperar acesso", url: `${brand.siteUrl.replace(/\/$/, "")}/forgot-password` } : undefined,
      reason: REASON_ACCOUNT,
    },
  };
}

/**
 * Mostra o endereço só em parte (`ma•••@exemplo.ao`).
 *
 * O aviso de mudança vai para o endereço antigo, que pode já não ser do dono da conta: dizer o
 * domínio chega para o dono reconhecer a mudança, sem entregar o endereço novo inteiro a
 * quem ficou com a caixa antiga.
 */
export function maskEmail(email: string): string {
  const [user, domain] = String(email || "").split("@");
  if (!user || !domain) return "";
  return `${user.slice(0, Math.min(2, Math.max(1, user.length - 1)))}•••@${domain}`;
}

/**
 * O email da conta mudou. Sai duas vezes: para o endereço antigo (`side: "old"`), que é o que
 * pode avisar o dono de uma mudança que ele não fez, e para o novo, que confirma onde passam
 * a chegar as mensagens.
 */
export function emailChangedLetter(brand: Brand, name: string, newEmail: string, side: "old" | "new"): Letter {
  const hello = `Olá${firstName(name) ? `, ${firstName(name)}` : ""}.`;
  const recover = brand.siteUrl ? `${brand.siteUrl.replace(/\/$/, "")}/forgot-password` : "";
  if (side === "old") {
    return {
      subject: "O email da sua conta foi alterado",
      doc: {
        symbol: "!",
        tone: "warning",
        title: "Email da conta alterado",
        subtitle: `As mensagens passam a ir para ${maskEmail(newEmail)}.`,
        lead: [
          `${hello} O endereço de email da sua conta foi mudado pela equipa da loja.`,
          "Este endereço deixa de servir para entrar na conta. Se não pediu esta mudança, responda a esta mensagem ou contacte-nos de imediato.",
        ],
        reason: "Recebeu esta mensagem porque este era o email da sua conta até agora.",
      },
    };
  }
  return {
    subject: "Este é agora o email da sua conta",
    doc: {
      symbol: "✉",
      tone: "brand",
      title: "Novo email confirmado",
      subtitle: "É com este endereço que passa a entrar na loja.",
      lead: [
        `${hello} O email da sua conta passou a ser ${newEmail}.`,
        "A palavra-passe não mudou. Se não a sabe, use o botão para escolher uma nova.",
      ],
      cta: recover ? { label: "Definir palavra-passe", url: recover } : undefined,
      reason: REASON_ACCOUNT,
    },
  };
}

/** Conta suspensa ou reactivada pela equipa. */
export function accountStatusLetter(brand: Brand, name: string, suspended: boolean): Letter {
  const hello = `Olá${firstName(name) ? `, ${firstName(name)}` : ""}.`;
  if (suspended) {
    return {
      subject: "A sua conta foi suspensa",
      doc: {
        symbol: "■",
        tone: "danger",
        title: "Conta suspensa",
        subtitle: "Enquanto estiver suspensa, não é possível entrar.",
        lead: [
          `${hello} A sua conta na ${brand.siteName} foi suspensa pela equipa da loja.`,
          "As suas encomendas não se perdem e continuam a seguir. Para saber o motivo ou pedir a reactivação, contacte-nos.",
        ],
        reason: "Recebeu esta mensagem porque o estado da sua conta mudou.",
      },
    };
  }
  return {
    subject: "A sua conta foi reactivada",
    doc: {
      symbol: "✓",
      tone: "success",
      title: "Conta reactivada",
      subtitle: "Já pode voltar a entrar.",
      lead: [`${hello} A sua conta na ${brand.siteName} está activa outra vez.`],
      cta: brand.siteUrl ? { label: "Entrar na loja", url: `${brand.siteUrl.replace(/\/$/, "")}/login` } : undefined,
      reason: "Recebeu esta mensagem porque o estado da sua conta mudou.",
    },
  };
}

/** Conta apagada. As encomendas ficam, ligadas ao email: dizê-lo evita o susto de as julgar perdidas. */
export function accountClosedLetter(brand: Brand, name: string): Letter {
  return {
    subject: "A sua conta foi encerrada",
    doc: {
      symbol: "●",
      tone: "neutral",
      title: "Conta encerrada",
      subtitle: "Os dados da conta foram apagados.",
      lead: [
        `Olá${firstName(name) ? `, ${firstName(name)}` : ""}. A sua conta na ${brand.siteName} foi encerrada.`,
        "As encomendas já feitas continuam registadas e pode acompanhá-las com o número da encomenda e este email.",
        "Se não pediu o encerramento, contacte-nos.",
      ],
      reason: "Recebeu esta mensagem porque este era o email da conta encerrada.",
    },
  };
}

// ---------------------------------------------------------------------------
// B. Encomendas
// ---------------------------------------------------------------------------

export function orderCreatedLetter(brand: Brand, order: Row, paymentLink = ""): Letter {
  const paid = String(order.payment_status) === "paid";
  // O endereço de rastreio já vai num botão; aqui basta dizer o que é preciso para o usar.
  const notes = ["Pode acompanhar a encomenda a qualquer momento com o número acima e o email desta compra."];
  if (paymentLink && !paid) {
    notes.unshift("Se já pagou, ignore o botão de pagamento: confirmamos o pagamento pela referência indicada.");
  }
  return {
    subject: paid ? `Encomenda ${orderRef(order)} confirmada` : `Encomenda ${orderRef(order)} recebida`,
    doc: {
      symbol: "▣",
      tone: paid ? "success" : "brand",
      title: paid ? "Encomenda confirmada!" : "Recebemos a sua encomenda",
      subtitle: paid
        ? "O pagamento está confirmado e vamos preparar a sua encomenda."
        : "Falta só o pagamento para a prepararmos.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}! Obrigado pela sua compra na ${brand.siteName}.`,
      ],
      detailsTitle: "Detalhes da compra",
      details: deliveryDetails(order),
      items: orderItems(order),
      totals: orderTotals(order),
      stepsTitle: "Estado da encomenda",
      steps: orderSteps(order, paid ? "confirmed" : "received"),
      cta: paymentLink && !paid
        ? { label: `Pagar com ${paymentLabel(order) || "o método escolhido"}`, url: paymentLink }
        : (trackUrl(brand.siteUrl) ? { label: "Acompanhar a encomenda", url: trackUrl(brand.siteUrl) } : undefined),
      secondaryCta: paymentLink && !paid && trackUrl(brand.siteUrl)
        ? { label: "Acompanhar a encomenda", url: trackUrl(brand.siteUrl) }
        : undefined,
      notes,
      reason: REASON_ORDER,
    },
  };
}

export function paymentConfirmedLetter(brand: Brand, order: Row): Letter {
  return {
    subject: `Pagamento confirmado — ${orderRef(order)}`,
    doc: {
      symbol: "✓",
      tone: "success",
      title: "Pagamento confirmado!",
      subtitle: isPickup(order)
        ? "Vamos preparar a sua encomenda para levantamento."
        : "Vamos preparar a sua encomenda para envio.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}! Recebemos o pagamento da sua encomenda.`,
      ],
      detailsTitle: "Detalhes da compra",
      details: [
        ...deliveryDetails(order),
        { label: "Total pago", value: money(order.total) },
      ],
      stepsTitle: "Estado da encomenda",
      steps: orderSteps(order, "confirmed"),
      cta: trackUrl(brand.siteUrl) ? { label: "Acompanhar a encomenda", url: trackUrl(brand.siteUrl) } : undefined,
      reason: REASON_ORDER,
    },
  };
}

/** Texto de cada mudança de estado da entrega. */
const STATUS_COPY: Record<string, { title: string; subtitle: string; symbol: SafeSymbol; tone: EmailDoc["tone"] }> = {
  confirmed: { title: "Encomenda confirmada", subtitle: "Está na fila de preparação.", symbol: "✓", tone: "success" },
  preparing: { title: "A preparar a sua encomenda", subtitle: "Estamos a separar e a embalar os seus produtos.", symbol: "◷", tone: "brand" },
  shipped: { title: "Encomenda expedida", subtitle: "Já saiu da nossa loja.", symbol: "➜", tone: "brand" },
  in_transit: { title: "Encomenda em trânsito", subtitle: "Está a caminho do endereço indicado.", symbol: "➜", tone: "brand" },
  out_for_delivery: { title: "Saiu para entrega", subtitle: "Deve chegar hoje.", symbol: "➜", tone: "warning" },
  delivered: { title: "Encomenda entregue", subtitle: "Esperamos que goste de tudo!", symbol: "✓", tone: "success" },
  cancelled: { title: "Encomenda cancelada", subtitle: "A encomenda não vai seguir.", symbol: "✕", tone: "danger" },
};

/** Para levantamento na loja, "expedida" é "pronta para levantamento". */
const PICKUP_COPY: Record<string, { title: string; subtitle: string }> = {
  shipped: { title: "Pronta para levantamento", subtitle: "Já pode passar pela loja." },
  in_transit: { title: "Pronta para levantamento", subtitle: "Já pode passar pela loja." },
  out_for_delivery: { title: "Pronta para levantamento", subtitle: "Já pode passar pela loja." },
};

/** `null` quando o estado não merece email — não há nada de novo para dizer ao cliente. */
export function orderStatusLetter(brand: Brand, order: Row, status: string, event?: Row): Letter | null {
  const base = STATUS_COPY[status];
  if (!base) return null;
  const pickup = isPickup(order);
  const copy = pickup && PICKUP_COPY[status] ? { ...base, ...PICKUP_COPY[status] } : base;

  const details = deliveryDetails(order);
  if (order.tracking_number && !pickup) {
    details.push({ label: "Rastreio", value: String(order.tracking_number) });
  }
  if (order.carrier && !pickup) details.push({ label: "Transportadora", value: String(order.carrier) });
  if (order.estimated_delivery && status !== "delivered" && status !== "cancelled") {
    details.push({ label: "Previsão", value: dateLong(order.estimated_delivery) });
  }

  const lead = [`Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}!`];
  if (event?.description) lead.push(String(event.description));
  if (status === "delivered") {
    lead.push("Obrigado pela sua compra. Amanhã enviamos-lhe uma mensagem para confirmar que correu tudo bem.");
  }
  if (status === "cancelled") {
    lead.push("Se tiver dúvidas sobre o motivo ou sobre a devolução de um valor já pago, responda a esta mensagem.");
  }

  return {
    subject: `${copy.title} — ${orderRef(order)}`,
    doc: {
      symbol: copy.symbol,
      tone: copy.tone,
      title: copy.title,
      subtitle: copy.subtitle,
      lead,
      detailsTitle: "Detalhes da encomenda",
      details,
      stepsTitle: status === "cancelled" ? undefined : "Estado da encomenda",
      steps: status === "cancelled" ? undefined : orderSteps(order, status),
      cta: trackUrl(brand.siteUrl) ? { label: "Ver a encomenda", url: trackUrl(brand.siteUrl) } : undefined,
      reason: REASON_ORDER,
    },
  };
}

/** Links da confirmação do cliente: "Recebi tudo bem" e "Tenho um problema". */
export function receiptLinks(siteUrl: string, order: Row) {
  const site = String(siteUrl || "").replace(/\/$/, "");
  if (!site || !order?.id || !order?.receipt_token) return null;
  const base = `${site}/confirmar-encomenda?e=${encodeURIComponent(order.id)}&t=${encodeURIComponent(order.receipt_token)}`;
  return { ok: `${base}&r=ok`, problem: `${base}&r=problema` };
}

/**
 * A nota de agradecimento, um dia depois da entrega.
 *
 * Fecha a compra: agradece, lembra o que foi entregue e pede ao cliente que confirme que
 * correu tudo bem. Um problema reportado aqui avisa a equipa, em vez de ficar num email
 * que ninguém lê.
 */
export function thankYouLetter(brand: Brand, order: Row): Letter {
  const name = firstName(order.customer_name);
  const links = receiptLinks(brand.siteUrl, order);
  const pickup = isPickup(order);
  return {
    subject: `Obrigado pela sua compra${name ? `, ${name}` : ""}!`,
    doc: {
      symbol: "★",
      tone: "success",
      title: name ? `Obrigado, ${name}!` : "Obrigado pela sua compra!",
      subtitle: `A encomenda ${orderRef(order)} foi ${pickup ? "levantada" : "entregue"}. Foi uma alegria servi-lo.`,
      lead: [
        `Em nome de toda a equipa da ${brand.siteName}, obrigado pela confiança.`,
        "Cada compra ajuda a levar mais literatura e materiais a famílias, igrejas e escolas.",
        links ? "Recebeu tudo como esperava? Diga-nos com um clique." : "",
      ].filter(Boolean),
      detailsTitle: "O que recebeu",
      details: [
        { label: "Encomenda", value: orderRef(order) },
        ...(order.delivery_confirmed_at ? [{ label: pickup ? "Levantada" : "Entregue", value: dateLong(order.delivery_confirmed_at) }] : []),
      ],
      items: orderItems(order),
      cta: links ? { label: "Recebi tudo bem", url: links.ok } : undefined,
      secondaryCta: links ? { label: "Tive um problema com a encomenda", url: links.problem } : undefined,
      notes: [
        "Se algum produto chegou danificado, em falta ou diferente do que pediu, use o link acima: a equipa recebe o aviso e entra em contacto.",
      ],
      reason: REASON_ORDER,
    },
  };
}

/** Resumo diário das encomendas, para a equipa. `alerts` vem de `orderWatch.orderAlerts`. */
export function dailySummaryLetter(
  brand: Brand,
  summary: { stages: Record<string, number>; newToday: number; revenueToday: number; deliveredToday: number; confirmedByCustomer: number },
  alerts: { order_number: string; customer_name: string; label: string; hours: number; severity: string; detail?: string }[],
  stageLabels: Record<string, string>,
): Letter {
  const today = dateLong(new Date().toISOString());
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const site = String(brand.siteUrl || "").replace(/\/$/, "");
  const fmtHours = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} dias` : `${h} h`);
  return {
    subject: alerts.length
      ? `Resumo de ${today}: ${alerts.length} encomenda(s) a precisar de atenção`
      : `Resumo de ${today}: tudo em dia`,
    doc: {
      symbol: alerts.length ? "!" : "✓",
      tone: critical ? "danger" : alerts.length ? "warning" : "success",
      title: "Resumo das encomendas",
      subtitle: today,
      lead: [
        `Últimas 24 horas: ${summary.newToday} encomenda(s) nova(s) (${money(summary.revenueToday)}), ${summary.deliveredToday} entregue(s), ${summary.confirmedByCustomer} confirmada(s) pelo cliente.`,
        alerts.length
          ? `${alerts.length} encomenda(s) estão paradas tempo demais ou têm um problema do cliente${critical ? ` (${critical} crítica(s))` : ""}.`
          : "Nenhuma encomenda parada. Bom trabalho!",
      ],
      detailsTitle: "Encomendas em curso, por passo",
      details: Object.entries(stageLabels)
        .filter(([k]) => k !== "cancelled" && k !== "delivered")
        .map(([k, label]) => ({ label, value: String(summary.stages[k] || 0) })),
      stepsTitle: alerts.length ? "A precisar de atenção" : undefined,
      steps: alerts.slice(0, 15).map((a) => ({
        label: `${a.severity === "critical" ? "[CRÍTICO] " : ""}${a.order_number} — ${a.label} (${fmtHours(a.hours)})${a.customer_name ? ` · ${a.customer_name}` : ""}${a.detail ? ` · "${a.detail.slice(0, 120)}"` : ""}`,
        done: false,
        current: a.severity === "critical",
      })),
      cta: site ? { label: "Abrir o acompanhamento", url: `${site}/admin?tab=acompanhamento` } : undefined,
      notes: alerts.length > 15 ? [`E mais ${alerts.length - 15}. Veja todas no painel.`] : [],
      reason: "Recebe este resumo porque gere encomendas na loja.",
    },
  };
}

// ---------------------------------------------------------------------------
// C. Avisos simples e testes
// ---------------------------------------------------------------------------

/**
 * Mensagens de contacto e campanhas: texto escrito no painel, dentro da moldura da loja.
 *
 * Só as de marketing levam link de cancelamento. Pôr um numa confirmação de encomenda
 * convidava a cancelar o que não se pode cancelar — e ainda ensinava o cliente a ignorar o
 * link nas mensagens onde ele conta.
 */
export function noticeLetter(brand: Brand, subject: string, body: string, marketing = false, unsubscribeUrl = ""): Letter {
  return {
    subject,
    doc: {
      symbol: "✉",
      tone: "neutral",
      title: subject,
      lead: String(body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
      reason: marketing
        ? "Recebeu esta mensagem porque aceitou receber novidades desta loja."
        : "Recebeu esta mensagem porque é cliente desta loja.",
      ...(marketing && unsubscribeUrl ? { unsubscribeUrl } : {}),
    },
  };
}

/** Endereço do link de cancelamento de subscrição de um contacto. */
export function unsubscribeUrlFor(brand: Brand, token: string) {
  if (!brand.siteUrl || !token) return "";
  return `${brand.siteUrl.replace(/\/$/, "")}/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function testLetter(brand: Brand): Letter {
  return {
    subject: `Teste de email — ${brand.siteName}`,
    doc: {
      symbol: "✓",
      tone: "success",
      title: "O envio de emails está a funcionar",
      subtitle: "Esta é uma mensagem de teste do painel.",
      lead: [
        "Se recebeu este email, as confirmações de encomenda e os avisos de conta saem para os clientes.",
        "Confirme também se a mensagem não foi para o lixo: se foi, falta autenticar o domínio com SPF, DKIM e DMARC.",
      ],
      reason: "Recebeu esta mensagem porque alguém pediu um teste de envio no painel desta loja.",
    },
  };
}

// ---------------------------------------------------------------------------
// Catálogo, para a pré-visualização no painel
// ---------------------------------------------------------------------------

/**
 * Encomenda de exemplo para pré-visualizar os modelos.
 *
 * Com dados inventados aqui, e não no painel: a pré-visualização passa pelas mesmas funções
 * que enviam de verdade, por isso o que o gestor vê é o que o cliente recebe. Um exemplo
 * escrito no frontend significaria dois sítios a divergir com o tempo.
 */
function sampleOrder(pickup = false): Row {
  const base: Row = {
    id: "exemplo",
    order_number: "LA-2026-0042",
    customer_name: "Maria Fernandes",
    customer_email: "cliente@exemplo.ao",
    items: [
      { quantity: 2, title: "O Grande Conflito", price: 4500, book_code: "LIV-012" },
      { quantity: 1, title: "Caminho a Cristo", price: 2500, book_code: "LIV-034" },
      { quantity: 1, title: "Uniforme do Colégio Adventista — camisa", variant_label: "10 anos · Azul", price: 6000, book_code: "UNI-004" },
    ],
    total: 19000,
    shipping_cost: 1500,
    payment_method_name: "Multicaixa Express",
    payment_status: "paid",
    created: new Date().toISOString(),
    shipping_method: "delivery",
    delivery_address_full: "Rua Amílcar Cabral 12, Maianga, Luanda",
    tracking_number: "AO-2026-887512",
    carrier: "Expresso Angola",
  };
  if (!pickup) return base;
  return { ...base, shipping_method: "pickup", pickup_store: "Loja do Huambo", shipping_cost: 0 };
}

/** Modelos que o painel consegue pré-visualizar, pela chave usada em `?template=`. */
export const PREVIEW_TEMPLATES: Record<string, { label: string; group: string; build: (brand: Brand) => Letter }> = {
  welcome: { label: "Boas-vindas", group: "Conta", build: (b) => welcomeLetter(b, "Maria Fernandes") },
  invite: { label: "Conta criada (convite)", group: "Conta", build: (b) => accessLinkLetter(b, "Maria Fernandes", "invite", "https://exemplo.ao/reset-password?token=exemplo") },
  reset: { label: "Recuperar palavra-passe", group: "Conta", build: (b) => accessLinkLetter(b, "Maria Fernandes", "reset", "https://exemplo.ao/reset-password?token=exemplo") },
  password_changed: { label: "Palavra-passe alterada", group: "Conta", build: (b) => passwordChangedLetter(b, "Maria Fernandes") },
  email_changed_old: { label: "Email alterado (endereço antigo)", group: "Conta", build: (b) => emailChangedLetter(b, "Maria Fernandes", "maria.nova@exemplo.ao", "old") },
  email_changed_new: { label: "Email alterado (endereço novo)", group: "Conta", build: (b) => emailChangedLetter(b, "Maria Fernandes", "maria.nova@exemplo.ao", "new") },
  account_suspended: { label: "Conta suspensa", group: "Conta", build: (b) => accountStatusLetter(b, "Maria Fernandes", true) },
  account_reactivated: { label: "Conta reactivada", group: "Conta", build: (b) => accountStatusLetter(b, "Maria Fernandes", false) },
  account_closed: { label: "Conta encerrada", group: "Conta", build: (b) => accountClosedLetter(b, "Maria Fernandes") },

  order_unpaid: { label: "Encomenda por pagar", group: "Encomenda", build: (b) => orderCreatedLetter(b, { ...sampleOrder(), payment_status: "pending" }, "https://exemplo.ao/pagar") },
  order_paid: { label: "Encomenda confirmada", group: "Encomenda", build: (b) => orderCreatedLetter(b, sampleOrder()) },
  payment_confirmed: { label: "Pagamento confirmado", group: "Encomenda", build: (b) => paymentConfirmedLetter(b, sampleOrder()) },

  preparing: { label: "A preparar", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "preparing")! },
  shipped: { label: "Expedida", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "shipped")! },
  in_transit: { label: "Em trânsito", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "in_transit")! },
  out_for_delivery: { label: "Saiu para entrega", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "out_for_delivery")! },
  delivered: { label: "Entregue", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "delivered")! },
  thank_you: { label: "Agradecimento (1 dia depois)", group: "Entrega", build: (b) => thankYouLetter(b, { ...sampleOrder(), receipt_token: "00000000-0000-0000-0000-000000000000" }) },
  cancelled: { label: "Cancelada", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "cancelled")! },
  pickup_ready: { label: "Pronta para levantamento", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(true), "shipped")! },

  campaign: { label: "Campanha", group: "Outros", build: (b) => noticeLetter(b, "Novidades deste mês", "Chegaram títulos novos à loja.\n\nEste mês há 15% de desconto na colecção de estudos bíblicos.", true) },
  test: { label: "Teste de envio", group: "Outros", build: (b) => testLetter(b) },
};
