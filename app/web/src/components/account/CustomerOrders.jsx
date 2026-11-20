// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BookOpen, Check, CreditCard, Library, Loader2, Package, ReceiptText, RotateCcw, ShoppingBag, Store, Truck, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { getProduct } from '@/api/EcommerceApi';
import CancelOrderDialog from '@/components/account/CancelOrderDialog';
import { supabase, mediaUrl } from '@/lib/supabaseClient';
import { normalizeImageUrl } from '@/lib/imageUrl';
import { kwanza } from '@/lib/money';
import { cn } from '@/lib/utils';
import { orderItemTitle } from '@/lib/productTypes';
import { formatOrderNumber, orderLocality, orderPaymentLabel, orderPickupStore } from '@/lib/orderUtils';
import { downloadReceipt, receiptBrand, receiptFromOrder } from '@/lib/receipt';
import {
  canCustomerCancel, customerOrderStage, isOrderFinished, orderUnits, reorderLines, stageSteps, unitsLabel,
} from '@/lib/customerOrders';

const dateLabel = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Capas dos livros das encomendas, num só pedido (o catálogo é de leitura pública). */
function useCovers(orders) {
  const ids = useMemo(() => [...new Set(orders.flatMap((o) => (o.items || []).map((i) => i?.book_id).filter(Boolean)))].sort(), [orders]);
  const key = ids.join(',');
  const [covers, setCovers] = useState({});
  useEffect(() => {
    if (!ids.length) return undefined;
    let alive = true;
    supabase.from('stock_books').select('id, cover, cover_image').in('id', ids.slice(0, 200))
      .then(({ data }) => {
        if (!alive) return;
        setCovers(Object.fromEntries((data || []).map((b) => [
          b.id, normalizeImageUrl(b.cover || (b.cover_image ? mediaUrl('stock_books', b.id, b.cover_image) : '')),
        ])));
      });
    return () => { alive = false; };
    // `key` resume os ids: não volta a pedir só porque a lista foi recriada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
}

function Covers({ order, covers }) {
  const items = (order.items || []).filter(Boolean);
  const shown = items.slice(0, 4);
  return (
    <div className="flex shrink-0 self-start -space-x-3" aria-hidden="true">
      {shown.map((item, i) => (
        <div
          key={`${item.book_id || i}-${i}`}
          className={cn('h-16 w-11 overflow-hidden rounded-md border-2 border-card bg-muted shadow-sm', i > 0 && 'hidden sm:block')}
          style={{ zIndex: shown.length - i }}
        >
          {covers[item.book_id]
            ? <img src={covers[item.book_id]} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <BookOpen className="m-auto mt-5 h-4 w-4 text-muted-foreground/50" />}
        </div>
      ))}
      {items.length > shown.length && (
        <span className="ml-1 hidden h-16 w-11 items-center justify-center rounded-md border-2 border-card bg-muted text-xs font-medium text-muted-foreground sm:flex">
          +{items.length - shown.length}
        </span>
      )}
    </div>
  );
}

function Progress({ order, stage }) {
  const steps = stageSteps(order);
  if (stage.step < 0) return null;
  return (
    <div className="mt-3">
      <ol className={cn('grid gap-1.5', steps.length === 3 ? 'grid-cols-3' : 'grid-cols-4')} aria-label="Progresso da encomenda">
        {steps.map((label, i) => {
          const done = i <= stage.step;
          return (
            <li key={label} className="min-w-0">
              <span className={cn('block h-1.5 rounded-full', done ? 'bg-primary' : 'bg-muted')} />
              {/* No telemóvel os quatro nomes não cabem: só o passo actual, por extenso, por baixo. */}
              <span className={cn('mt-1 hidden truncate text-[11px] sm:block', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {i === stage.step && <span className="sr-only">Agora: </span>}{label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-[11px] font-medium text-foreground sm:hidden" aria-hidden="true">
        Passo {stage.step + 1} de {steps.length}: {steps[stage.step]}
      </p>
    </div>
  );
}

function OrderCard({ order, covers, user, settings, upfront, onCancel, onReorder, reordering }) {
  const stage = customerOrderStage(order, { upfront });
  const units = orderUnits(order);
  const pickup = order.shipping_method === 'pickup';
  const digital = order.shipping_method === 'digital';
  const where = pickup ? orderPickupStore(order) : orderLocality(order, ', ');
  const finished = isOrderFinished(order);
  const trackState = { orderNumber: order.order_number, email: user?.email };

  return (
    <li className="p-4 sm:p-5">
      <div className="flex gap-4">
        <Covers order={order} covers={covers} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-foreground">{formatOrderNumber(order)}</p>
              <p className="text-xs text-muted-foreground">{dateLabel(order.created)} · {unitsLabel(units)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums text-foreground">{kwanza(order.total)}</p>
              <span className={cn('mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', stage.className)}>{stage.label}</span>
            </div>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">{stage.hint}</p>
          {!finished && <Progress order={order} stage={stage} />}

          <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
            {(order.items || []).slice(0, 3).map((item, i) => (
              <li key={i} className="truncate">{item.quantity}× {orderItemTitle(item)}</li>
            ))}
            {(order.items || []).length > 3 && <li>e mais {(order.items || []).length - 3}…</li>}
          </ul>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {digital ? <Library className="h-3.5 w-3.5" aria-hidden="true" /> : pickup ? <Store className="h-3.5 w-3.5" aria-hidden="true" /> : <Truck className="h-3.5 w-3.5" aria-hidden="true" />}
              {digital ? 'Edição digital · sem envio' : pickup ? `Levantamento${where ? ` · ${where}` : ''}` : `Entrega${where ? ` · ${where}` : ''}`}
            </span>
            {orderPaymentLabel(order) && (
              <span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" aria-hidden="true" />{orderPaymentLabel(order)}</span>
            )}
            {order.tracking_number && <span className="font-mono">Seguimento: {order.tracking_number}{order.carrier ? ` (${order.carrier})` : ''}</span>}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {['to_pay', 'payment_failed'].includes(stage.key) && order.order_number && (
              <Button asChild size="sm" className="h-8">
                <Link to="/track" state={trackState}><CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Pagar e indicar a referência</Link>
              </Button>
            )}
            {!finished && order.order_number && (
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link to="/track" state={trackState}><Truck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Acompanhar</Link>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8" onClick={() => downloadReceipt(receiptFromOrder(order), receiptBrand(settings))}>
              <ReceiptText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Recibo
            </Button>
            {finished && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onReorder(order)} disabled={reordering}>
                {reordering ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                Comprar de novo
              </Button>
            )}
            {canCustomerCancel(order) && order.order_number && (
              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onCancel(order)}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Cancelar
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * As encomendas na conta do cliente: as que estão em curso primeiro, cada uma com o ponto em que
 * está em palavras simples, o que falta fazer e as acções (pagar, acompanhar, recibo, comprar de
 * novo, cancelar enquanto não está paga nem em preparação).
 */
export default function CustomerOrders({ orders, loading, user, settings, upfrontCodes, onChanged, onCartOpen }) {
  const { addToCart } = useCart();
  const covers = useCovers(orders);
  const active = orders.filter((o) => !isOrderFinished(o));
  const [view, setView] = useState('');
  const shownView = view || (active.length ? 'active' : 'all');
  const shown = shownView === 'active' ? active : orders;
  const [cancelling, setCancelling] = useState('');
  const [reorderingId, setReorderingId] = useState('');

  const reorder = async (order) => {
    setReorderingId(order.id);
    const added = [];
    const missing = [];
    const choose = [];
    try {
      for (const line of reorderLines(order)) {
        try {
          const product = await getProduct(line.bookId);
          const variant = (product.variants || []).find((v) => v.id === line.variantId)
            || (line.variantId.endsWith('-default') ? product.variants?.[0] : null);
          const available = Number(variant?.inventory_quantity ?? 0);
          if (!variant || available <= 0) { missing.push(line.title); continue; }
          await addToCart(product, variant, Math.min(line.quantity, available), available, { silent: true });
          added.push(line.title);
        } catch (err) {
          if (/escolha|escolher|na página do produto/i.test(String(err?.message))) choose.push(line.title);
          else missing.push(line.title);
        }
      }
    } finally {
      setReorderingId('');
    }
    if (added.length) {
      toast.success(added.length === 1 ? `"${added[0]}" está no carrinho` : `${added.length} produtos juntos ao carrinho`, {
        description: [
          missing.length ? `Já não há: ${missing.join(', ')}.` : '',
          choose.length ? `Escolha o tamanho ou a edição na página de: ${choose.join(', ')}.` : '',
        ].filter(Boolean).join(' ') || undefined,
      });
      onCartOpen?.();
    } else {
      toast.error('Nenhum destes produtos está disponível agora.', {
        description: choose.length ? `Escolha o tamanho ou a edição na página de: ${choose.join(', ')}.` : undefined,
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center rounded-xl border bg-card py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="A carregar as encomendas" /></div>;
  }

  if (!orders.length) {
    return (
      <div className="flex flex-col items-center rounded-xl border bg-card px-4 py-16 text-center">
        <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <p className="font-medium text-foreground">Ainda não tem encomendas.</p>
        <p className="mt-1 text-sm text-muted-foreground">Quando encomendar, acompanha aqui cada passo, até à entrega.</p>
        <Button asChild className="btn-primary mt-5"><Link to="/shop">Ir à loja</Link></Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Que encomendas mostrar">
          {[['active', `Em curso (${active.length})`], ['all', `Todas (${orders.length})`]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={shownView === value}
              onClick={() => setView(value)}
              className={cn('h-8 rounded-md px-3 text-sm transition-colors',
                shownView === value ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
        <Link to="/track" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Package className="h-4 w-4" aria-hidden="true" /> Rastrear com o número
        </Link>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <Check className="mb-3 h-10 w-10 text-emerald-600/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Não tem encomendas em curso.</p>
          <button type="button" className="mt-2 text-sm font-medium text-primary hover:underline" onClick={() => setView('all')}>Ver as anteriores</button>
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              covers={covers}
              user={user}
              settings={settings}
              upfront={upfrontCodes.has(o.payment_method_code)}
              onCancel={(order) => setCancelling(order.order_number)}
              onReorder={reorder}
              reordering={reorderingId === o.id}
            />
          ))}
        </ul>
      )}

      <CancelOrderDialog
        orderNumber={cancelling}
        email={user?.email || ''}
        onClose={() => setCancelling('')}
        onCancelled={onChanged}
      />
    </div>
  );
}
