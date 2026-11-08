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
import { titleList } from "./digitalBooks.ts";
import { type OpsReport, fmtDuration } from "./opsReport.ts";

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

/** Encomenda só de edições digitais (migração edicoes_digitais): sem envio, abre na biblioteca. */
const isDigitalOrder = (order: Row) => String(order.shipping_method || "") === "digital";

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
    title: String(it.title || "Produto"),
    detail: [it.variant_label ? String(it.variant_label) : "", it.book_code ? String(it.book_code) : ""].filter(Boolean).join(" · ") || undefined,
    amount: money((Number(it.quantity) || 1) * (Number(it.price) || 0)),
  }));
}

function orderTotals(order: Row) {
  const totals = [];
  const shipping = Number(order.shipping_cost) || 0;
  if (!isDigitalOrder(order)) {
    totals.push({ label: isPickup(order) ? "Levantamento na loja" : "Envio", value: shipping ? money(shipping) : "Grátis" });
  }
  totals.push({ label: "Total", value: money(order.total), strong: true });
  return totals;
}

function deliveryDetails(order: Row) {
  const details = [{ label: "Encomenda", value: orderRef(order) }];
  if (order.created) details.push({ label: "Data", value: dateLong(order.created) });
  const payment = paymentLabel(order);
  if (payment) details.push({ label: "Pagamento", value: payment });
  if (isDigitalOrder(order)) {
    details.push({ label: "Entrega", value: "Edição digital, na biblioteca da sua conta" });
  } else if (isPickup(order)) {
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
  // A edição digital não tem envio: está na biblioteca quando o pagamento é confirmado.
  const sequence = isDigitalOrder(order)
    ? [
        { key: "received", label: "Encomenda recebida" },
        { key: "confirmed", label: "Pagamento confirmado" },
        { key: "delivered", label: "Na biblioteca" },
      ]
    : pickup
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

/**
 * Confirmação de encomenda. `payLater`: o método é pago antes do envio (transferência, Multicaixa),
 * e o cliente paga depois de encomendar, com o número da encomenda, indicando a referência em
 * Rastrear encomenda. Sem a informação, conta como tal quando há link de pagamento (como antes).
 * Pagamento na entrega ou no balcão: a loja prepara primeiro, por isso não se pede pagamento.
 */
export function orderCreatedLetter(brand: Brand, order: Row, paymentLink = "", opts: { payLater?: boolean } = {}): Letter {
  const paid = String(order.payment_status) === "paid";
  const payLater = !paid && (opts.payLater ?? !!paymentLink);
  const pickup = order.shipping_method === "pickup";
  const digital = isDigitalOrder(order);
  const track = trackUrl(brand.siteUrl);
  // O endereço de rastreio já vai num botão; aqui basta dizer o que é preciso para o usar.
  const notes = ["Pode acompanhar a encomenda a qualquer momento com o número acima e o email desta compra."];
  if (payLater) {
    const reference = String(order.payment_reference || "").trim();
    notes.unshift(reference
      ? `Recebemos a referência ${reference}. Confirmamos o pagamento e avisamo-lo.`
      : `Pague com o número ${orderRef(order)} no descritivo e indique a referência do pagamento em Rastrear encomenda. ${digital
        ? "A edição digital abre na sua biblioteca quando o pagamento for confirmado."
        : "Preparamos a encomenda quando o pagamento for confirmado."}`);
  }
  const indicar = track ? { label: "Indicar o pagamento", url: track } : undefined;
  const acompanhar = track ? { label: "Acompanhar a encomenda", url: track } : undefined;
  return {
    key: paid ? "order_paid" : "order_unpaid",
    vars: orderVars(brand, order),
    subject: paid ? `Encomenda ${orderRef(order)} confirmada` : `Encomenda ${orderRef(order)} recebida`,
    doc: {
      symbol: "▣",
      tone: paid ? "success" : "brand",
      title: paid ? "Encomenda confirmada!" : "Recebemos a sua encomenda",
      subtitle: paid
        ? (digital ? "O pagamento está confirmado: a edição digital está na sua biblioteca." : "O pagamento está confirmado e vamos preparar a sua encomenda.")
        : digital
          ? "Falta só o pagamento: a edição digital abre na sua biblioteca quando for confirmado."
        : payLater
          ? "Falta só o pagamento para a prepararmos."
          : pickup
            ? "Vamos prepará-la. Paga no levantamento, na loja."
            : "Vamos prepará-la. Paga na entrega.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}! Obrigado pela sua compra na ${brand.siteName}.`,
      ],
      detailsTitle: "Detalhes da compra",
      details: deliveryDetails(order),
      items: orderItems(order),
      totals: orderTotals(order),
      stepsTitle: "Estado da encomenda",
      steps: orderSteps(order, paid ? "confirmed" : "received"),
      cta: payLater && paymentLink
        ? { label: `Pagar com ${paymentLabel(order) || "o método escolhido"}`, url: paymentLink }
        : payLater ? (indicar || acompanhar) : acompanhar,
      secondaryCta: payLater && paymentLink ? indicar : undefined,
      notes,
      reason: REASON_ORDER,
    },
  };
}

/**
 * `digital`: os livros digitais que a encomenda dá (digitalBooks.ts). Com eles, a carta diz que já
 * estão na biblioteca e leva o botão para lá; se a encomenda for só de edições digitais, não fala
 * de preparar nem de enviar.
 */
export function paymentConfirmedLetter(
  brand: Brand,
  order: Row,
  digital: { titles: string[]; onlyDigital: boolean } = { titles: [], onlyDigital: false },
): Letter {
  const titles = (digital?.titles || []).filter(Boolean);
  // Encomenda 'digital': não há nada para preparar, mesmo que os títulos não tenham vindo.
  digital = { titles, onlyDigital: !!digital?.onlyDigital || isDigitalOrder(order) };
  const library = (titles.length || digital.onlyDigital) && brand.siteUrl ? `${brand.siteUrl.replace(/\/$/, "")}/profile?tab=biblioteca` : "";
  const books = titles.length === 1 ? `O livro digital ${titles[0]} já está` : `Os livros digitais ${titleList(titles)} já estão`;
  return {
    key: "payment_confirmed",
    vars: orderVars(brand, order),
    subject: `Pagamento confirmado — ${orderRef(order)}`,
    doc: {
      symbol: "✓",
      tone: "success",
      title: "Pagamento confirmado!",
      subtitle: digital.onlyDigital
        ? (titles.length > 1 ? "Os seus livros digitais já estão na sua biblioteca." : "O seu livro digital já está na sua biblioteca.")
        : titles.length
          ? "Os livros digitais já estão na sua biblioteca; o resto da encomenda vamos preparar."
          : isPickup(order)
            ? "Vamos preparar a sua encomenda para levantamento."
            : "Vamos preparar a sua encomenda para envio.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}! Recebemos o pagamento da sua encomenda.`,
        ...(titles.length ? [`${books} na sua biblioteca: entre na sua conta e abra ou descarregue quando quiser.`] : []),
      ],
      detailsTitle: "Detalhes da compra",
      details: [
        ...deliveryDetails(order),
        { label: "Total pago", value: money(Number(order.amount_paid) > 0 ? order.amount_paid : order.total) },
      ],
      ...(digital.onlyDigital ? {} : { stepsTitle: "Estado da encomenda", steps: orderSteps(order, "confirmed") }),
      cta: library && digital?.onlyDigital
        ? { label: "Abrir a biblioteca", url: library }
        : trackUrl(brand.siteUrl) ? { label: "Acompanhar a encomenda", url: trackUrl(brand.siteUrl) } : undefined,
      ...(library && !digital?.onlyDigital ? { secondaryCta: { label: "Abrir a biblioteca", url: library } } : {}),
      reason: REASON_ORDER,
    },
  };
}

/** Quanto falta pagar de uma encomenda (nunca negativo). */
const stillDue = (order: Row) => Math.max(Number(order.total || 0) - Number(order.amount_paid || 0), 0);

/**
 * Recebemos uma parte do pagamento (transferência de valor menor, pagamento em duas vezes):
 * quanto entrou, quanto falta e onde indicar o resto. A encomenda só se prepara paga.
 */
export function paymentPartialLetter(brand: Brand, order: Row): Letter {
  const due = stillDue(order);
  return {
    key: "payment_partial",
    vars: orderVars(brand, order),
    subject: `Recebemos parte do pagamento — ${orderRef(order)}`,
    doc: {
      symbol: "●",
      tone: "warning",
      title: "Recebemos parte do pagamento",
      subtitle: `Faltam ${money(due)} para completar a encomenda.`,
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}! Já recebemos ${money(order.amount_paid)} da encomenda ${orderRef(order)}.`,
        `Para a prepararmos, falta pagar ${money(due)}. Use o número da encomenda no descritivo e indique a referência na página da encomenda.`,
      ],
      detailsTitle: "Pagamento",
      details: [
        { label: "Total", value: money(order.total) },
        { label: "Recebido", value: money(order.amount_paid) },
        { label: "Em falta", value: money(due) },
      ],
      cta: trackUrl(brand.siteUrl) ? { label: "Indicar a referência", url: trackUrl(brand.siteUrl) } : undefined,
      reason: REASON_ORDER,
    },
  };
}

/**
 * A equipa não encontrou o pagamento que o cliente indicou. Leva o motivo, para o cliente saber
 * o que corrigir, e o caminho para indicar outra referência.
 */
export function paymentRejectedLetter(brand: Brand, order: Row, reason = ""): Letter {
  const why = String(reason || "").trim();
  return {
    key: "payment_rejected",
    vars: orderVars(brand, order),
    subject: `Não encontrámos o pagamento — ${orderRef(order)}`,
    doc: {
      symbol: "!",
      tone: "warning",
      title: "Não encontrámos o seu pagamento",
      subtitle: "Verifique a referência e indique-a outra vez.",
      lead: [
        `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}. Procurámos o pagamento da encomenda ${orderRef(order)} e não o encontrámos.`,
        why ? `Motivo: ${why}` : "",
        "Se já pagou, indique a referência certa (ou o número do comprovativo) na página da encomenda. Se ainda não pagou, os livros continuam reservados até ao fim do prazo.",
      ].filter(Boolean),
      detailsTitle: "Encomenda",
      details: [
        { label: "Encomenda", value: orderRef(order) },
        { label: "Valor a pagar", value: money(stillDue(order) || order.total) },
      ],
      cta: trackUrl(brand.siteUrl) ? { label: "Indicar outra referência", url: trackUrl(brand.siteUrl) } : undefined,
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
  const amount = Number(order.refund_amount ?? order.total) || 0;
  // Reembolso de uma parte (um livro em falta, portes devolvidos): diz quanto, não "o valor".
  const partial = amount > 0 && amount < (Number(order.total) || 0);
  const details = [
    { label: "Encomenda", value: orderRef(order) },
    { label: "Valor reembolsado", value: money(amount) },
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
      subtitle: partial ? `Devolvemos ${money(amount)} da sua encomenda.` : "Devolvemos o valor da sua encomenda.",
      lead: [
        partial
          ? `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}. Devolvemos ${money(amount)} da encomenda ${orderRef(order)}.`
          : `Olá${firstName(order.customer_name) ? `, ${firstName(order.customer_name)}` : ""}. O valor da encomenda ${orderRef(order)} foi devolvido.`,
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
    key: "thank_you",
    vars: orderVars(brand, order),
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
  // Dinheiro (relatório de pagamentos): o que entrou ontem e o que pede acção.
  payments?: {
    receivedYesterday: number; paymentsYesterday: number; toConfirm: number; deliveredUnpaid: number;
    deliveredUnpaidAmount: number; refundDue: number; receivable: number;
  },
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
        ...(payments ? [
          `Recebido ontem: ${money(payments.receivedYesterday)} (${payments.paymentsYesterday} pagamento(s)). Por receber: ${money(payments.receivable)}.`,
          [
            payments.toConfirm ? `${payments.toConfirm} pagamento(s) indicado(s) por verificar` : "",
            payments.deliveredUnpaid ? `${payments.deliveredUnpaid} entregue(s) sem pagamento registado (${money(payments.deliveredUnpaidAmount)})` : "",
            payments.refundDue ? `${payments.refundDue} paga(s) e cancelada(s) por reembolsar` : "",
          ].filter(Boolean).join("; ") || "Nenhum pagamento à espera da equipa.",
        ] : []),
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

/**
 * A equipa respondeu a um pedido de ajuda. Leva o texto da resposta (o cliente lê-a no email,
 * sem ter de entrar) e o botão para continuar a conversa no site.
 */
export function supportReplyLetter(
  brand: Brand,
  reply: { name: string; ticketNumber: number | string; subject: string; text: string; staffName?: string },
): Letter {
  const site = String(brand.siteUrl || "").replace(/\/$/, "");
  const first = String(reply.name || "").trim().split(/\s+/)[0] || "";
  const text = String(reply.text || "").trim();
  const shown = text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
  return {
    subject: `Resposta ao seu pedido #${reply.ticketNumber} — ${brand.siteName}`,
    doc: {
      preheader: shown.slice(0, 120),
      symbol: "✉",
      tone: "brand",
      title: `Respondemos ao seu pedido #${reply.ticketNumber}`,
      subtitle: reply.subject,
      lead: [
        `${first ? `Olá ${first}, a` : "A"} nossa equipa${reply.staffName ? ` (${reply.staffName})` : ""} respondeu:`,
        ...shown.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
      ],
      cta: site ? { label: "Responder no site", url: `${site}/?atendimento=1` } : undefined,
      notes: ["Para responder, use o botão acima: as respostas a este email não chegam à equipa."],
      reason: "Recebe esta mensagem porque pediu ajuda à nossa equipa.",
    },
  };
}

/** Relatório semanal do atendimento e da operação, para responsáveis e administradores. */
export function weeklyReportLetter(brand: Brand, r: OpsReport): Letter {
  const site = String(brand.siteUrl || "").replace(/\/$/, "");
  const p = (v: number | null) => (v == null ? "—" : `${v}%`);
  const tk = r.tickets;
  const worry = tk.overdue_now > 0 || r.orders.overdue_now > 0 || r.orders.escalated_unacknowledged > 0;
  return {
    subject: `Atendimento e encomendas — semana até ${dateLong(r.to)}`,
    doc: {
      symbol: worry ? "!" : "✓",
      tone: worry ? "warning" : "success",
      title: "Relatório da semana",
      subtitle: `${dateLong(r.from)} a ${dateLong(r.to)}`,
      lead: [
        `${tk.opened} pedido(s) de ajuda aberto(s), ${tk.closed} resolvido(s). Agora: ${tk.open_now} em aberto${tk.overdue_now ? `, ${tk.overdue_now} fora do prazo` : ""}.`,
        `Encomendas: ${r.orders.created} nova(s); assumidas em ${fmtDuration(r.orders.acknowledged_minutes)} (mediana)${r.orders.escalated_unacknowledged ? `; ${r.orders.escalated_unacknowledged} subiram às urgências por ninguém as assumir` : ""}${r.orders.overdue_now ? `; ${r.orders.overdue_now} entrega(s) fora do prazo agora` : ""}.`,
      ],
      detailsTitle: "Indicadores",
      details: [
        { label: "Primeira resposta (mediana)", value: fmtDuration(tk.first_response_minutes) },
        { label: "Resolução (mediana)", value: fmtDuration(tk.resolution_minutes) },
        { label: "Primeira resposta dentro do prazo", value: p(tk.first_response_within_sla) },
        { label: "Resolução dentro do prazo", value: p(tk.resolution_within_sla) },
        { label: "Satisfação (4 ou 5 estrelas)", value: tk.csat_responses ? `${p(tk.csat_satisfied)} de ${tk.csat_responses} avaliação(ões)` : "sem avaliações" },
        { label: "Conversas com o assistente", value: `${r.assistant.conversations} (${p(r.assistant.handoff_rate)} passaram à equipa)` },
        { label: "Respostas do assistente avaliadas", value: `${r.assistant.helpful} ajudaram · ${r.assistant.not_helpful} não ajudaram` },
      ],
      cta: site ? { label: "Abrir o atendimento", url: `${site}/admin?tab=support` } : undefined,
      reason: "Recebe este relatório porque é responsável de uma equipa ou administrador da loja.",
    },
  };
}

/** Aviso sobre um pedido de ajuda (vai ser fechado, foi fechado), com o botão para o chat. */
export function supportNoticeLetter(brand: Brand, notice: { title: string; body: string }): Letter {
  const site = String(brand.siteUrl || "").replace(/\/$/, "");
  return {
    subject: `${notice.title} — ${brand.siteName}`,
    doc: {
      preheader: notice.body.slice(0, 120),
      symbol: "✉",
      tone: "neutral",
      title: notice.title,
      lead: [notice.body],
      cta: site ? { label: "Abrir o chat", url: `${site}/?atendimento=1` } : undefined,
      reason: "Recebe esta mensagem porque pediu ajuda à nossa equipa.",
    },
  };
}

/**
 * Aviso a uma pessoa da equipa (encomenda nova, alerta, escalada, pedido de ajuda). Curto: o
 * que aconteceu e um botão para o sítio do painel onde se trata.
 */
export function staffAlertLetter(
  brand: Brand,
  alert: { title: string; body: string; severity: "normal" | "high" | "critical"; path: string },
): Letter {
  const site = String(brand.siteUrl || "").replace(/\/$/, "");
  const critical = alert.severity === "critical";
  return {
    subject: `${critical ? "[URGENTE] " : ""}${alert.title}`,
    doc: {
      preheader: alert.body.slice(0, 120),
      symbol: critical ? "!" : "●",
      tone: critical ? "danger" : alert.severity === "high" ? "warning" : "brand",
      title: alert.title,
      lead: [alert.body],
      cta: site ? { label: "Abrir no painel", url: `${site}${alert.path}` } : undefined,
      notes: critical ? ["Este aviso subiu de nível porque ninguém o assumiu a tempo. Abra o painel e assuma-o."] : [],
      reason: "Recebe este aviso porque faz parte da equipa da loja e a sua equipa trata deste assunto.",
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

/**
 * Cabeçalhos `List-Unsubscribe` de uma campanha, a partir do link do rodapé.
 *
 * O botão "cancelar subscrição" do Gmail, do Yahoo e do Apple Mail não abre a página: faz um
 * POST ao endereço do cabeçalho, com o corpo `List-Unsubscribe=One-Click` (RFC 8058), e não
 * corre JavaScript nenhum. Por isso o cabeçalho aponta para a API (`<api>/unsubscribe?t=…`),
 * que cancela num POST, e não para a página do site — que é estática: um POST não chega a
 * nenhum código, e o cliente continuava inscrito depois de carregar no botão.
 *
 * O link do rodapé continua a ser a página, que pede confirmação: alguns servidores de correio
 * abrem os links das mensagens para os analisar, e um GET nunca pode cancelar.
 */
export function listUnsubscribeHeaders(pageUrl: string, apiBase: string): Record<string, string> {
  let token = "";
  try {
    token = new URL(String(pageUrl || "")).searchParams.get("t") || "";
  } catch {
    return {};
  }
  if (!/^[a-f0-9]{64}$/.test(token)) return {};
  const api = String(apiBase || "").replace(/\/+$/, "");
  // Sem API em https (desenvolvimento local), fica só o link da página, sem "um clique".
  if (!/^https:\/\/[^/]+/i.test(api)) return { "List-Unsubscribe": `<${pageUrl}>` };
  return {
    "List-Unsubscribe": `<${api}/unsubscribe?t=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
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
  thank_you: { label: "Agradecimento (1 dia depois)", group: "Entrega", build: (b) => thankYouLetter(b, { ...sampleOrder(), receipt_token: "00000000-0000-0000-0000-000000000000" }) },
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
