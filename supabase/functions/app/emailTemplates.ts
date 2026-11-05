/**
 * Os emails que a loja envia, um por acontecimento real do sistema.
 *
 * Cada função devolve `{ subject, doc }`; a moldura e as versões HTML/texto vêm do
 * `emails.ts`. Separar assim mantém o conteúdo de cada mensagem legível e garante que todas
 * têm o mesmo cabeçalho, o mesmo rodapé e a mesma linha a dizer porque foi enviada.
 *
 * O catálogo segue o que esta loja tem: livros físicos, com entrega ao domicílio ou
 * levantamento na loja. Não há produtos digitais, licenças nem vendedores no esquema da base
 * de dados, por isso não há aqui modelos para isso — seriam ficheiros que nada chamaria.
 */
import { deliveryAddressLine, paymentLabel, pickupStoreName } from "./orderFields.ts";
import { formatKz, type Brand, type EmailDoc, type SafeSymbol, type Step } from "./emails.ts";

type Row = Record<string, any>;
/**
 * Uma mensagem pronta a enviar.
 *
 * `key` diz que modelo é (a mesma chave da pré-visualização e do editor de textos do painel)
 * e `vars` os valores que os marcadores `{nome}`, `{loja}`, `{encomenda}`… tomam nesta
 * mensagem. Sem `key`, a mensagem não tem texto editável (campanhas e testes, cujo texto já
 * é escrito no painel).
 */
export type Letter = { subject: string; doc: EmailDoc; key?: string; vars?: Record<string, string> };

const money = formatKz;

const dateLong = (value: unknown) => {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "long", year: "numeric" });
};

const dateTime = (value: unknown) => {
  const d = value ? new Date(String(value instanceof Date ? value.toISOString() : value)) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  // Hora de Luanda: é a da loja e a da grande maioria dos clientes.
  return d.toLocaleString("pt-AO", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Luanda",
  });
};

const firstName = (name: unknown) => String(name || "").trim().split(/\s+/)[0] || "";

const orderRef = (order: Row) => String(order.order_number || order.id || "").trim();

const isPickup = (order: Row) => String(order.shipping_method || "") === "pickup";

/** Link de rastreio da encomenda. `/track` pede o número e o email, por isso é seguro. */
const trackUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/track` : "");
const ordersUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/profile?tab=orders` : "");

/** Valores dos marcadores comuns a todas as mensagens de conta. */
const accountVars = (brand: Brand, name: unknown) => ({ nome: firstName(name), loja: brand.siteName });

/** Valores dos marcadores das mensagens de encomenda. */
const orderVars = (brand: Brand, order: Row) => ({
  nome: firstName(order.customer_name),
  loja: brand.siteName,
  encomenda: orderRef(order),
  total: money(order.total),
});

const REASON_ORDER = "Recebeu esta mensagem porque fez uma encomenda nesta loja.";
const REASON_ACCOUNT = "Recebeu esta mensagem por causa de um pedido feito na sua conta.";
const REASON_SECURITY = "Recebeu esta mensagem para proteger a sua conta. Estes avisos não se podem desligar.";

function orderItems(order: Row) {
  return (order.items || []).map((it: Row) => ({
    quantity: Number(it.quantity) || 1,
    title: String(it.title || "Livro"),
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
    key: "welcome",
    vars: accountVars(brand, name),
    subject: `Bem-vindo à ${brand.siteName}`,
    doc: {
      symbol: "✦",
      tone: "brand",
      title: `Bem-vindo, ${firstName(name) || "leitor"}!`,
      subtitle: "A sua conta está criada.",
      lead: [
        "A partir de agora pode acompanhar as suas encomendas, guardar livros na lista de desejos e deixar avaliações.",
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
    key: kind,
    vars: accountVars(brand, name),
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
    key: "password_changed",
    vars: accountVars(brand, name),
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

const recoverUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/forgot-password` : "");
const securityUrl = (siteUrl: string) => (siteUrl ? `${siteUrl.replace(/\/$/, "")}/profile?tab=security` : "");
const hello = (name: unknown) => `Olá${firstName(name) ? `, ${firstName(name)}` : ""}.`;

/**
 * Aviso de mudança do endereço de email da conta.
 *
 * Vai para o endereço **antigo**: é o único que o dono da conta controla com certeza. Se a
 * mudança foi feita por outra pessoa, o aviso no endereço novo chegaria a quem a fez.
 */
export function emailChangedLetter(brand: Brand, name: string, newEmail: string, byStaff = false): Letter {
  return {
    key: "email_changed",
    vars: { ...accountVars(brand, name), email_novo: newEmail },
    subject: "O email da sua conta foi alterado",
    doc: {
      symbol: "✉",
      tone: "warning",
      title: "Email da conta alterado",
      subtitle: byStaff ? "A alteração foi feita pela equipa da loja." : "Foi pedida a mudança do endereço de email.",
      lead: [
        hello(name),
        byStaff
          ? "A pedido seu, a equipa da loja mudou o endereço de email da sua conta. A partir de agora, as mensagens e o acesso usam o endereço novo."
          : "Foi pedida a mudança do endereço de email da sua conta. A mudança só fica feita depois de confirmada no endereço novo.",
        "Se não foi você, recupere o acesso de imediato e responda a esta mensagem.",
      ],
      detailsTitle: "Alteração",
      details: [
        { label: "Endereço novo", value: newEmail },
        { label: "Data", value: dateLong(new Date()) },
      ],
      cta: recoverUrl(brand.siteUrl) ? { label: "Não fui eu — recuperar acesso", url: recoverUrl(brand.siteUrl) } : undefined,
      reason: "Recebeu esta mensagem porque este endereço estava associado à conta.",
    },
  };
}

export type AccessInfo = { device?: string; when?: string | Date; ip?: string };

/** Entrada na conta a partir de um navegador ou aparelho que a conta ainda não tinha usado. */
export function newLoginLetter(brand: Brand, name: string, access: AccessInfo): Letter {
  const details = [{ label: "Aparelho", value: access.device || "Navegador desconhecido" }];
  details.push({ label: "Data", value: dateTime(access.when) });
  if (access.ip) details.push({ label: "Endereço IP", value: access.ip });
  return {
    key: "new_login",
    vars: accountVars(brand, name),
    subject: "Novo acesso à sua conta",
    doc: {
      symbol: "●",
      tone: "brand",
      title: "Novo acesso à sua conta",
      subtitle: "Entrou-se na conta a partir de um aparelho novo.",
      lead: [
        hello(name),
        "Se foi você, não precisa de fazer nada.",
        "Se não reconhece este acesso, mude a palavra-passe e termine a sessão em todos os aparelhos, na página da sua conta.",
      ],
      detailsTitle: "Acesso",
      details,
      cta: securityUrl(brand.siteUrl) ? { label: "Rever a segurança da conta", url: securityUrl(brand.siteUrl) } : undefined,
      reason: REASON_SECURITY,
    },
  };
}

/**
 * Actividade suspeita: a equipa terminou as sessões da conta por precaução.
 *
 * Só é enviada quando alguém da equipa toma essa decisão no painel. A loja não tenta
 * adivinhar sozinha o que é suspeito: um alarme falso ensina o cliente a ignorar o aviso
 * que importa.
 */
export function suspiciousActivityLetter(brand: Brand, name: string, detail = ""): Letter {
  const lead = [hello(name), "Detectámos actividade fora do normal na sua conta e, por precaução, terminámos todas as sessões abertas."];
  if (detail) lead.push(detail);
  lead.push("Para voltar a entrar, use a sua palavra-passe. Se não se lembrar dela ou suspeitar que outra pessoa a sabe, defina uma nova.");
  return {
    key: "suspicious_activity",
    vars: { ...accountVars(brand, name), detalhe: detail },
    subject: "Actividade suspeita na sua conta",
    doc: {
      symbol: "!",
      tone: "danger",
      title: "Actividade suspeita na sua conta",
      subtitle: "Terminámos todas as sessões por precaução.",
      lead,
      cta: recoverUrl(brand.siteUrl) ? { label: "Definir nova palavra-passe", url: recoverUrl(brand.siteUrl) } : undefined,
      notes: ["Nunca lhe pedimos a palavra-passe por email nem por telefone."],
      reason: REASON_SECURITY,
    },
  };
}

/** Conta suspensa pela equipa, ou reactivada depois de uma suspensão. */
export function accountStatusLetter(brand: Brand, name: string, suspended: boolean): Letter {
  return {
    key: suspended ? "account_suspended" : "account_reactivated",
    vars: accountVars(brand, name),
    subject: suspended ? "A sua conta foi suspensa" : "A sua conta foi reactivada",
    doc: suspended
      ? {
          symbol: "■",
          tone: "danger",
          title: "Conta suspensa",
          subtitle: "Não é possível entrar na conta enquanto estiver suspensa.",
          lead: [
            hello(name),
            "A equipa da loja suspendeu a sua conta. As suas encomendas continuam registadas e as que estão em curso seguem normalmente.",
            "Se acha que se trata de um engano, responda a esta mensagem.",
          ],
          reason: REASON_ACCOUNT,
        }
      : {
          symbol: "✓",
          tone: "success",
          title: "Conta reactivada",
          subtitle: "Já pode voltar a entrar.",
          lead: [hello(name), "A sua conta voltou a estar activa. Pode entrar com o mesmo email e a mesma palavra-passe."],
          cta: brand.siteUrl ? { label: "Entrar na loja", url: `${brand.siteUrl.replace(/\/$/, "")}/login` } : undefined,
          reason: REASON_ACCOUNT,
        },
  };
}

/** Conta encerrada. As encomendas ficam: estão ligadas ao email, não à conta. */
export function accountClosedLetter(brand: Brand, name: string): Letter {
  return {
    key: "account_closed",
    vars: accountVars(brand, name),
    subject: `A sua conta na ${brand.siteName} foi encerrada`,
    doc: {
      symbol: "✕",
      tone: "neutral",
      title: "Conta encerrada",
      subtitle: "Os dados de acesso foram apagados.",
      lead: [
        hello(name),
        "A sua conta foi encerrada e já não é possível entrar com ela.",
        "As encomendas que fez continuam registadas, porque são o comprovativo das compras. Pode acompanhá-las com o número da encomenda e este email.",
        "Se não pediu o encerramento, responda a esta mensagem.",
      ],
      cta: trackUrl(brand.siteUrl) ? { label: "Acompanhar uma encomenda", url: trackUrl(brand.siteUrl) } : undefined,
      reason: "Recebeu esta mensagem porque este endereço estava associado a uma conta nesta loja.",
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
    key: paid ? "order_paid" : "order_unpaid",
    vars: orderVars(brand, order),
    subject: paid ? `Encomenda ${orderRef(order)} confirmada` : `Encomenda ${orderRef(order)} recebida`,
    doc: {
      symbol: "▣",
      tone: paid ? "success" : "brand",
      title: paid ? "Encomenda confirmada!" : "Recebemos a sua encomenda",
      subtitle: paid
        ? "O pagamento está confirmado e vamos preparar os livros."
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
    key: "payment_confirmed",
    vars: orderVars(brand, order),
    subject: `Pagamento confirmado — ${orderRef(order)}`,
    doc: {
      symbol: "✓",
      tone: "success",
      title: "Pagamento confirmado!",
      subtitle: isPickup(order)
        ? "Vamos preparar os livros para levantamento."
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

/**
 * Reembolso de uma encomenda.
 *
 * A loja confirma os pagamentos à mão, e os reembolsos também: este aviso sai quando o
 * pagamento passa a "reembolsado" no painel, que é o momento em que o valor foi devolvido.
 */
export function refundLetter(brand: Brand, order: Row): Letter {
  const details = [
    { label: "Encomenda", value: orderRef(order) },
    { label: "Valor reembolsado", value: money(order.refund_amount ?? order.total) },
  ];
  const payment = paymentLabel(order);
  if (payment) details.push({ label: "Pago com", value: payment });
  details.push({ label: "Data", value: dateLong(new Date()) });
  return {
    key: "refund",
    vars: orderVars(brand, order),
    subject: `Reembolso da encomenda ${orderRef(order)}`,
    doc: {
      symbol: "↺",
      tone: "success",
      title: "Reembolso efectuado",
      subtitle: "Devolvemos o valor da sua encomenda.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}. O valor da encomenda ${orderRef(order)} foi devolvido.`,
        "Conforme o meio de pagamento, pode levar alguns dias até aparecer na sua conta.",
      ],
      detailsTitle: "Reembolso",
      details,
      cta: trackUrl(brand.siteUrl) ? { label: "Ver a encomenda", url: trackUrl(brand.siteUrl) } : undefined,
      notes: ["Se o valor não aparecer dentro de 10 dias úteis, responda a esta mensagem com o número da encomenda."],
      reason: REASON_ORDER,
    },
  };
}

/** Texto de cada mudança de estado da entrega. */
const STATUS_COPY: Record<string, { title: string; subtitle: string; symbol: SafeSymbol; tone: EmailDoc["tone"] }> = {
  confirmed: { title: "Encomenda confirmada", subtitle: "Está na fila de preparação.", symbol: "✓", tone: "success" },
  preparing: { title: "A preparar a sua encomenda", subtitle: "Estamos a separar os livros.", symbol: "◷", tone: "brand" },
  shipped: { title: "Encomenda expedida", subtitle: "Já saiu da nossa loja.", symbol: "➜", tone: "brand" },
  in_transit: { title: "Encomenda em trânsito", subtitle: "Está a caminho do endereço indicado.", symbol: "➜", tone: "brand" },
  out_for_delivery: { title: "Saiu para entrega", subtitle: "Deve chegar hoje.", symbol: "➜", tone: "warning" },
  delivered: { title: "Encomenda entregue", subtitle: "Boas leituras!", symbol: "✓", tone: "success" },
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
    lead.push("Obrigado pela sua compra. Se quiser, deixe uma avaliação dos livros que recebeu.");
  }
  if (status === "cancelled") {
    lead.push("Se tiver dúvidas sobre o motivo ou sobre a devolução de um valor já pago, responda a esta mensagem.");
  }

  return {
    key: pickup && PICKUP_COPY[status] ? "pickup_ready" : status,
    vars: { ...orderVars(brand, order), detalhe: event?.description ? String(event.description) : "" },
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
// Textos editados no painel
// ---------------------------------------------------------------------------

/**
 * Textos de um modelo alterados no painel. Os campos em falta ficam com o texto de origem.
 *
 * Só o que é texto corrido se edita: o assunto, o título, o subtítulo e os parágrafos de
 * abertura. Os detalhes da encomenda, os totais, as etapas e os botões continuam a vir dos
 * dados, porque são eles que fazem da mensagem uma prova da compra. Deixá-los editáveis
 * permitiria, sem querer, um email com um total que não é o da encomenda.
 */
export type TextOverride = { subject?: string; title?: string; subtitle?: string; lead?: string };

export const OVERRIDE_LIMITS: Record<keyof TextOverride, number> = { subject: 150, title: 150, subtitle: 300, lead: 4000 };

/** Marcadores que o editor oferece. Os de encomenda só têm valor nos modelos de encomenda. */
export const PLACEHOLDERS: Record<string, string> = {
  nome: "Primeiro nome do cliente",
  loja: "Nome da loja",
  encomenda: "Número da encomenda",
  total: "Total da encomenda",
  email_novo: "Endereço novo (só na alteração de email)",
  detalhe: "Nota escrita pela equipa (avisos de entrega e de actividade suspeita)",
};

/**
 * Normaliza o que vem do painel: só os campos conhecidos, só texto, cortado nos limites, e
 * sem os vazios. Devolve `null` quando não sobra nada — é o mesmo que "usar o texto de origem".
 */
export function cleanOverride(input: unknown): TextOverride | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Row;
  const out: TextOverride = {};
  for (const field of Object.keys(OVERRIDE_LIMITS) as (keyof TextOverride)[]) {
    if (typeof src[field] !== "string") continue;
    // Sem caracteres de controlo (excepto mudanças de linha nos parágrafos): um assunto com
    // uma quebra de linha lá dentro é a forma clássica de injectar cabeçalhos num email.
    const keepBreaks = field === "lead";
    const cleaned = String(src[field])
      .replace(keepBreaks ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, keepBreaks ? "" : " ")
      .trim()
      .slice(0, OVERRIDE_LIMITS[field]);
    if (cleaned) out[field] = cleaned;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Substitui `{nome}`, `{loja}`… pelos valores da mensagem.
 *
 * Um marcador que a mensagem não conhece fica como está: é assim que quem edita vê na
 * pré-visualização que escreveu mal o nome, em vez de o ver desaparecer sem aviso.
 */
export function fillPlaceholders(text: string, vars: Record<string, string> = {}): string {
  return String(text || "").replace(/\{([a-z_]+)\}/g, (whole, name) => (name in vars ? String(vars[name] ?? "") : whole));
}

/** Aplica os textos editados a uma mensagem já composta. Sem textos editados, devolve-a igual. */
export function applyOverride(letter: Letter, override: TextOverride | null | undefined): Letter {
  const o = cleanOverride(override);
  if (!o) return letter;
  const vars = letter.vars || {};
  const fill = (t: string) => fillPlaceholders(t, vars).trim();
  const doc: EmailDoc = { ...letter.doc };
  if (o.title) doc.title = fill(o.title) || doc.title;
  if (o.subtitle) doc.subtitle = fill(o.subtitle);
  if (o.lead) {
    const paragraphs = fill(o.lead).split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    if (paragraphs.length) doc.lead = paragraphs;
  }
  // O assunto é cabeçalho de email: fica numa só linha, venha o valor de onde vier.
  const subject = o.subject ? fill(o.subject).replace(/\s+/g, " ") : "";
  return { ...letter, subject: subject || letter.subject, doc };
}

/**
 * O texto de origem de um modelo, no formato do editor (parágrafos separados por linha em
 * branco), com os valores da mensagem trocados pelos marcadores.
 *
 * A troca é o que importa aqui. O editor parte deste texto; se ele trouxesse "Olá, Maria."
 * do exemplo, mudar uma vírgula num parágrafo gravava "Maria" para todos os clientes.
 * Trocam-se primeiro os valores mais compridos, para "Livraria Adventista" não ficar meio
 * trocado por um valor mais curto que esteja lá dentro.
 */
export function overrideFromLetter(letter: Letter): Required<TextOverride> {
  const pairs = Object.entries(letter.vars || {})
    .filter(([, v]) => String(v || "").length >= 3)
    .sort((a, b) => String(b[1]).length - String(a[1]).length);
  const tokenize = (text: string) => {
    let out = String(text || "");
    for (const [k, v] of pairs) out = out.split(String(v)).join(`{${k}}`);
    return out;
  };
  return {
    subject: tokenize(letter.subject),
    title: tokenize(letter.doc.title),
    subtitle: tokenize(letter.doc.subtitle || ""),
    lead: tokenize((letter.doc.lead || []).join("\n\n")),
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
      { quantity: 2, title: "O Grande Conflito", price: 4500 },
      { quantity: 1, title: "Caminho a Cristo", price: 2500 },
    ],
    total: 13000,
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
  email_changed: { label: "Email da conta alterado", group: "Conta", build: (b) => emailChangedLetter(b, "Maria Fernandes", "maria.nova@exemplo.ao") },
  new_login: { label: "Novo acesso", group: "Conta", build: (b) => newLoginLetter(b, "Maria Fernandes", { device: "Chrome em Android", when: new Date(), ip: "102.214.0.10" }) },
  suspicious_activity: { label: "Actividade suspeita", group: "Conta", build: (b) => suspiciousActivityLetter(b, "Maria Fernandes") },
  account_suspended: { label: "Conta suspensa", group: "Conta", build: (b) => accountStatusLetter(b, "Maria Fernandes", true) },
  account_reactivated: { label: "Conta reactivada", group: "Conta", build: (b) => accountStatusLetter(b, "Maria Fernandes", false) },
  account_closed: { label: "Conta encerrada", group: "Conta", build: (b) => accountClosedLetter(b, "Maria Fernandes") },

  order_unpaid: { label: "Encomenda por pagar", group: "Encomenda", build: (b) => orderCreatedLetter(b, { ...sampleOrder(), payment_status: "pending" }, "https://exemplo.ao/pagar") },
  order_paid: { label: "Encomenda confirmada", group: "Encomenda", build: (b) => orderCreatedLetter(b, sampleOrder()) },
  payment_confirmed: { label: "Pagamento confirmado", group: "Encomenda", build: (b) => paymentConfirmedLetter(b, sampleOrder()) },
  refund: { label: "Reembolso", group: "Encomenda", build: (b) => refundLetter(b, sampleOrder()) },

  confirmed: { label: "Confirmada", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "confirmed")! },
  preparing: { label: "A preparar", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "preparing")! },
  shipped: { label: "Expedida", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "shipped")! },
  in_transit: { label: "Em trânsito", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "in_transit")! },
  out_for_delivery: { label: "Saiu para entrega", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "out_for_delivery")! },
  delivered: { label: "Entregue", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "delivered")! },
  cancelled: { label: "Cancelada", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(), "cancelled")! },
  pickup_ready: { label: "Pronta para levantamento", group: "Entrega", build: (b) => orderStatusLetter(b, sampleOrder(true), "shipped")! },

  campaign: { label: "Campanha", group: "Outros", build: (b) => noticeLetter(b, "Novidades deste mês", "Chegaram títulos novos à loja.\n\nEste mês há 15% de desconto na colecção de estudos bíblicos.", true) },
  test: { label: "Teste de envio", group: "Outros", build: (b) => testLetter(b) },
};

/**
 * Modelos cujo texto se edita no painel: todos os que o sistema compõe sozinho. As campanhas
 * e o teste ficam de fora — o texto da campanha já é escrito no painel, e o teste tem de
 * dizer sempre a mesma coisa para servir de teste.
 */
export const EDITABLE_TEMPLATES = Object.keys(PREVIEW_TEMPLATES).filter((key) => key !== "campaign" && key !== "test");
