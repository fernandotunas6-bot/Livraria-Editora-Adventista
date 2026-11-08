// "Precisa de atenção": o que o painel deve pôr à frente de quem entra, por ordem de urgência.
//
// Não são totais (esses estão nos indicadores): são situações que pioram se ninguém fizer nada —
// uma encomenda por confirmar há dois dias, um pagamento que o cliente diz ter feito e ninguém
// verificou, um livro em destaque na página inicial que já esgotou. Cada uma diz quanto tempo
// passou e leva à lista já filtrada onde se resolve.
//
// Função pura (os dados entram, a lista sai), para se poder testar com datas fixas.

import { isSaleActive } from '@/lib/pricing';
import { hasCover, hasDescription } from '@/lib/bookContent';
import { formatOrderNumber } from '@/lib/orderUtils';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const ATTENTION_RULES = Object.freeze({
  pendingAfterHours: 24,     // por confirmar há mais de um dia
  pendingCriticalHours: 48,  // e passa a urgente ao fim de dois
  paymentAfterHours: 48,     // pagamento indicado pelo cliente e não verificado
  shipAfterDays: 3,          // confirmada e ainda na loja
  saleEndsWithinHours: 48,   // promoção a acabar
});

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function ago(ms) {
  const h = Math.floor(ms / HOUR);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * @returns {{ id, severity: 'critical'|'warning'|'info', title, detail, action }[]}
 *   `action`: { section: 'orders', status?, payment? } ou { section: 'books', filter }.
 */
export function attentionItems({ orders = [], books = [], perms = {}, now = Date.now(), rules = ATTENTION_RULES } = {}) {
  const items = [];
  const time = (o) => Date.parse(o?.created) || now;
  const active = orders.filter((o) => o.status !== 'cancelled');

  if (perms.orders) {
    const pending = active
      .filter((o) => o.status === 'pending' && now - time(o) > rules.pendingAfterHours * HOUR)
      .sort((a, b) => time(a) - time(b));
    if (pending.length) {
      const oldest = pending[0];
      items.push({
        id: 'pendentes-antigas',
        severity: now - time(oldest) > rules.pendingCriticalHours * HOUR ? 'critical' : 'warning',
        title: `${pending.length} ${plural(pending.length, 'encomenda por confirmar', 'encomendas por confirmar')} há mais de ${rules.pendingAfterHours} h`,
        detail: `A mais antiga: ${formatOrderNumber(oldest)}, ${ago(now - time(oldest))}.`,
        action: { section: 'orders', status: 'pending' },
      });
    }

    const paymentTime = (o) => Date.parse(o?.updated) || time(o);
    const payments = active
      .filter((o) => o.payment_status === 'awaiting_confirmation' && now - paymentTime(o) > rules.paymentAfterHours * HOUR)
      .sort((a, b) => paymentTime(a) - paymentTime(b));
    if (payments.length) {
      items.push({
        id: 'pagamentos-por-verificar',
        severity: 'warning',
        title: `${payments.length} ${plural(payments.length, 'pagamento indicado', 'pagamentos indicados')} pelo cliente por verificar`,
        detail: `${formatOrderNumber(payments[0])} espera ${ago(now - paymentTime(payments[0]))}. O stock fica reservado até se decidir.`,
        action: { section: 'orders', payment: 'awaiting_confirmation' },
      });
    }

    const shipped = ['shipped', 'in_transit', 'out_for_delivery', 'delivered'];
    const toShip = active
      .filter((o) => o.status === 'confirmed' && o.shipping_method !== 'pickup' && o.shipping_method !== 'digital' && !shipped.includes(o.delivery_status)
        && now - time(o) > rules.shipAfterDays * DAY)
      .sort((a, b) => time(a) - time(b));
    if (toShip.length) {
      items.push({
        id: 'por-enviar-atrasadas',
        severity: 'warning',
        title: `${toShip.length} ${plural(toShip.length, 'encomenda confirmada', 'encomendas confirmadas')} ainda por enviar`,
        detail: `Há mais de ${rules.shipAfterDays} dias. A mais antiga: ${formatOrderNumber(toShip[0])}.`,
        action: { section: 'orders', status: 'confirmed' },
      });
    }
  }

  if (perms.catalog) {
    const visible = books.filter((b) => b.active !== false);
    const featuredOut = visible.filter((b) => b.featured && Number(b.stock) <= 0);
    if (featuredOut.length) {
      items.push({
        id: 'destaques-esgotados',
        severity: 'warning',
        title: `${featuredOut.length} ${plural(featuredOut.length, 'produto em destaque esgotado', 'produtos em destaque esgotados')}`,
        detail: `Aparecem na página inicial e não se podem comprar: ${featuredOut.slice(0, 2).map((b) => b.title).join(', ')}${featuredOut.length > 2 ? '…' : '.'}`,
        action: { section: 'books', filter: 'featured' },
      });
    }

    const ending = visible.filter((b) => {
      if (!isSaleActive(b, now) || !b.sale_ends_at) return false;
      const left = Date.parse(b.sale_ends_at) - now;
      return left > 0 && left < rules.saleEndsWithinHours * HOUR;
    });
    if (ending.length) {
      items.push({
        id: 'promocoes-a-acabar',
        severity: 'info',
        title: `${ending.length} ${plural(ending.length, 'promoção acaba', 'promoções acabam')} nas próximas ${rules.saleEndsWithinHours} h`,
        detail: 'Se for para continuar, mude a data de fim.',
        action: { section: 'books', filter: 'promo' },
      });
    }

    const noCover = visible.filter((b) => !hasCover(b));
    if (noCover.length) {
      items.push({
        id: 'sem-capa',
        severity: 'info',
        title: `${noCover.length} ${plural(noCover.length, 'produto sem capa', 'produtos sem capa')}`,
        detail: 'Na loja aparecem com um quadrado cinzento, e vendem menos.',
        action: { section: 'books', filter: 'no_cover' },
      });
    }
    const noDescription = visible.filter((b) => !hasDescription(b));
    if (noDescription.length) {
      items.push({
        id: 'sem-descricao',
        severity: 'info',
        title: `${noDescription.length} ${plural(noDescription.length, 'produto sem descrição', 'produtos sem descrição')}`,
        detail: 'Sem descrição, quem chega pelo Google não sabe do que trata o livro.',
        action: { section: 'books', filter: 'no_description' },
      });
    }
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
