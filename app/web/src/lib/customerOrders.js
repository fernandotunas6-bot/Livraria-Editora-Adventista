// As encomendas vistas pelo cliente (A minha conta, rastreio): em que ponto estão, em palavras
// simples, o que falta fazer e se ainda as pode cancelar.
//
// Antes, o perfil mostrava as etiquetas da equipa: "Pendente" ao lado de "Recebida" — e
// "Recebida", para quem compra, quer dizer "já a recebi". Numa encomenda cancelada aparecia
// ainda o pagamento "Pendente". A equipa continua a ver as etiquetas dela (lib/orderUtils.js).

/**
 * `null` se o cliente pode cancelar; senão, o motivo. Repete public.order_cancel_by_customer
 * (que é quem decide, com a linha bloqueada) e supabase/functions/app/customerCancel.ts:
 * mudar um lado obriga a mudar os outros (teste customerCancel.test.ts).
 */
export function customerCancelBlock(order) {
  if (!order) return 'Encomenda não encontrada.';
  const status = String(order.status || 'pending');
  const delivery = String(order.delivery_status || 'received');
  const payment = String(order.payment_status || 'pending');
  if (status === 'cancelled' || delivery === 'cancelled') return 'Esta encomenda já está cancelada.';
  if (status === 'delivered' || delivery === 'delivered') return 'Esta encomenda já foi entregue.';
  if ((Number(order.amount_paid) || 0) > 0 || ['paid', 'partially_paid', 'refunded'].includes(payment)) {
    return 'Esta encomenda já tem pagamento registado: para a cancelar, fale connosco, para tratarmos do reembolso.';
  }
  if (payment === 'awaiting_confirmation') {
    return 'Indicou um pagamento nesta encomenda: para a cancelar, fale connosco, para confirmarmos o reembolso.';
  }
  if (!['pending', 'confirmed'].includes(status) || !['received', 'confirmed'].includes(delivery)) {
    return 'A encomenda já está a ser preparada ou a caminho: para a cancelar, fale connosco.';
  }
  return null;
}

export const canCustomerCancel = (order) => customerCancelBlock(order) === null;

/** Cancelada ou entregue: sai da lista "Em curso". */
export function isOrderFinished(order) {
  const status = String(order?.status || '');
  const delivery = String(order?.delivery_status || '');
  return ['cancelled', 'delivered'].includes(status) || ['cancelled', 'delivered'].includes(delivery);
}

/** Unidades da encomenda (2× um livro conta 2). */
export function orderUnits(order) {
  return (Array.isArray(order?.items) ? order.items : [])
    .reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item?.quantity) || 1)), 0);
}

/** "1 artigo", "3 artigos". */
export const unitsLabel = (n) => `${n} ${n === 1 ? 'artigo' : 'artigos'}`;

const TONE = {
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  action: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  progress: 'bg-sky-500/10 text-sky-800 dark:text-sky-300',
  waiting: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  cancelled: 'bg-destructive/10 text-red-700 dark:text-red-400',
};

/**
 * Em que ponto está a encomenda, para o cliente: `{ key, label, hint, tone, className, step }`.
 * `step` (0 a 3) alimenta a barra de progresso: registada, a preparar, a caminho, entregue.
 * `upfront`: o método paga-se antes do envio (transferência, Multicaixa), e falta pagar.
 */
export function customerOrderStage(order, { upfront = false } = {}) {
  const status = String(order?.status || 'pending');
  const delivery = String(order?.delivery_status || 'received');
  const payment = String(order?.payment_status || 'pending');
  const pickup = order?.shipping_method === 'pickup';
  const make = (key, label, hint, tone, step) => ({ key, label, hint, tone, className: TONE[tone], step });

  if (status === 'cancelled' || delivery === 'cancelled') {
    const paid = (Number(order?.amount_paid) || 0) - (Number(order?.amount_refunded) || 0);
    return make('cancelled', 'Cancelada',
      paid > 0 ? 'Tem um reembolso por receber: a equipa trata dele.' : 'Não há nada a pagar.', 'cancelled', -1);
  }
  if (status === 'delivered' || delivery === 'delivered') {
    return make('delivered', pickup ? 'Levantada' : 'Entregue',
      order?.delivery_confirmed_at ? 'Recepção confirmada. Obrigado pela sua compra!' : 'Obrigado pela sua compra!', 'done', 3);
  }
  if (payment === 'awaiting_confirmation') {
    return make('verifying', 'Pagamento em verificação', 'Recebemos a sua referência: a equipa confirma e avisa-o.', 'waiting', 0);
  }
  if (payment === 'failed') {
    return make('payment_failed', 'Pagamento não encontrado', 'Veja o motivo no rastreio e indique outra referência.', 'action', 0);
  }
  if (upfront && ['pending', 'partially_paid'].includes(payment)) {
    return make('to_pay', payment === 'partially_paid' ? 'Falta pagar o resto' : 'Falta pagar',
      'Pague e indique a referência: preparamos a encomenda logo a seguir.', 'action', 0);
  }
  if (delivery === 'out_for_delivery') return make('out', 'Saiu para entrega', 'Deve chegar hoje. Tenha o telefone por perto.', 'progress', 2);
  if (['shipped', 'in_transit'].includes(delivery)) {
    return pickup
      ? make('ready', 'Pronta para levantar', order?.pickup_store ? `Na ${order.pickup_store}.` : 'Na loja escolhida.', 'action', 2)
      : make('on_the_way', 'A caminho', 'Já saiu da nossa loja.', 'progress', 2);
  }
  if (['preparing', 'processing'].includes(delivery)) return make('preparing', 'A preparar', 'Estamos a separar e embalar os seus livros.', 'progress', 1);
  if (status === 'confirmed' || delivery === 'confirmed') return make('confirmed', 'Confirmada', 'Na fila de preparação.', 'progress', 1);
  return make('placed', 'Registada', 'A loja confirma em breve.', 'waiting', 0);
}

/** Os passos da barra de progresso, pela ordem. */
export const STAGE_STEPS = ['Registada', 'A preparar', 'A caminho', 'Entregue'];
export const stageSteps = (order) => (order?.shipping_method === 'pickup'
  ? ['Registada', 'A preparar', 'Pronta', 'Levantada']
  : STAGE_STEPS);

/**
 * O que juntar ao carrinho para "Comprar de novo": um pedido por linha, com o id da variante
 * que o carrinho usa (`<livro>-default` ou `<livro>-v<n>`).
 */
export function reorderLines(order) {
  return (Array.isArray(order?.items) ? order.items : [])
    .filter((item) => item?.book_id)
    .map((item) => {
      const variant = item.variant === null || item.variant === undefined || item.variant === '' ? null : Number(item.variant);
      return {
        bookId: String(item.book_id),
        variantId: Number.isInteger(variant) ? `${item.book_id}-v${variant}` : `${item.book_id}-default`,
        quantity: Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 99),
        title: String(item.title || 'Produto'),
      };
    });
}
