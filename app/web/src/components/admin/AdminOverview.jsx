import React, { useMemo } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Clock, ExternalLink, Info, MessageCircle, PackageSearch, PanelTop, Plus,
  ShoppingBag, Siren, Wallet,
} from 'lucide-react';
import { attentionItems } from '@/lib/adminAttention';
import { monthSummary, topProducts } from '@/lib/managerSummary';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/api/EcommerceApi';
import { formatOrderNumber, getOrderStatusColor, getOrderStatusLabel } from '@/lib/orderUtils';
import { cn } from '@/lib/utils';

const kz = (value) => formatCurrency(Math.round((Number(value) || 0) * 100));

function relative(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** Um indicador: carregar leva à secção (ou ao filtro) onde se trata. */
function StatCard({ icon: Icon, label, value, hint, tone = 'default', onClick }) {
  const tones = {
    default: 'text-foreground',
    warning: 'text-amber-700 dark:text-amber-400',
    info: 'text-primary',
    success: 'text-emerald-700 dark:text-emerald-400',
  };
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={cn('h-4 w-4', tones[tone])} aria-hidden="true" />
      </span>
      <span className={cn('mt-2 block text-2xl font-semibold tabular-nums tracking-tight', tones[tone])}>{value}</span>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const cls = 'rounded-xl border border-border bg-card p-4 text-left shadow-xs';
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(cls, 'transition-colors hover:border-primary/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring')}
    >
      {body}
    </button>
  );
}

const SEVERITY = {
  critical: { icon: Siren, row: 'border-l-red-600', iconCls: 'text-red-600', label: 'Urgente' },
  warning: { icon: AlertTriangle, row: 'border-l-amber-500', iconCls: 'text-amber-600', label: 'A tratar' },
  info: { icon: Info, row: 'border-l-primary/60', iconCls: 'text-primary', label: 'Sugestão' },
};

/**
 * "Precisa de atenção": as situações que pioram se ninguém fizer nada (lib/adminAttention.js),
 * por ordem de urgência, cada uma com o caminho para a resolver. Sem nenhuma, diz que está tudo
 * em dia — também é informação.
 */
function AttentionList({ items, onAct, loading }) {
  if (loading) return null;
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200" role="status">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Tudo em dia: nada atrasado nas encomendas, nos pagamentos nem no catálogo.
      </p>
    );
  }
  return (
    <section aria-labelledby="painel-atencao" className="rounded-xl border border-border bg-card shadow-xs">
      <h2 id="painel-atencao" className="border-b border-border px-4 py-3 font-sans text-sm font-semibold tracking-normal text-foreground">
        Precisa de atenção <span className="font-normal text-muted-foreground">({items.length})</span>
      </h2>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const sev = SEVERITY[item.severity] || SEVERITY.info;
          const Icon = sev.icon;
          return (
            <li key={item.id} className={cn('flex items-start gap-3 border-l-4 px-4 py-3', sev.row)}>
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', sev.iconCls)} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="sr-only">{sev.label}: </span>
                <span className="block text-sm font-medium text-foreground">{item.title}</span>
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              </span>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => onAct(item.action)}>
                Ver <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-xs" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "+12%" verde, "−5%" vermelho; sem base de comparação, um traço. Para os cancelamentos, descer é bom. */
function Delta({ value, inverse = false }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-xs text-muted-foreground">igual</span>;
  const up = value > 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{up ? 'subiu' : 'desceu'} </span>{Math.abs(value)}%
    </span>
  );
}

/**
 * O mês até hoje, para quem gere: quanto se encomendou e quanto entrou, comparado com os mesmos
 * dias do mês anterior, e o que se vende mais. Antes o Início só tinha um "Vendas (30 dias)" que
 * somava encomendas por pagar, sem comparação nenhuma.
 */
function MonthPanel({ orders, onNavigate }) {
  const s = useMemo(() => monthSummary(orders), [orders]);
  const top = useMemo(() => topProducts(orders), [orders]);
  const prevName = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString('pt-PT', { month: 'long' });
  }, []);
  const metrics = [
    { label: 'Encomendas', value: s.current.orders, delta: s.deltas.orders },
    { label: 'Encomendado', value: kz(s.current.ordered), delta: s.deltas.ordered },
    { label: 'Recebido', value: kz(s.current.received), delta: s.deltas.received },
    { label: 'Ticket médio', value: kz(s.current.average), delta: s.deltas.average },
  ];
  return (
    // `grid-cols-1` é minmax(0, 1fr): sem ele, no telemóvel a coluna crescia até à largura dos
    // valores ("Kz 68 900,00" lado a lado) e a página ganhava scroll horizontal.
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="min-w-0 xl:col-span-2">
        <Panel
          title={s.label}
          action={(
            <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => onNavigate('vendas-huambo')}>
              Relatórios <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        >
          <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="min-w-0 bg-card px-3 py-3 sm:px-4">
                <dt className="text-xs text-muted-foreground">{m.label}</dt>
                <dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground sm:text-lg" title={String(m.value)}>{m.value}</dd>
                <dd className="mt-0.5"><Delta value={m.delta} /></dd>
              </div>
            ))}
          </dl>
          <p className="max-w-none border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            Comparado com os mesmos dias de {prevName}.
            {' '}Canceladas: {s.current.cancelled}
            {s.current.cancelled > 0 && ` (${Math.round(s.current.cancelledShare * 100)}% das encomendas)`}.
            {' '}O recebido é o dinheiro já registado destas encomendas.
          </p>
        </Panel>
      </div>
      <Panel title="Mais vendidos (30 dias)">
        {top.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Ainda sem vendas no período.</p>
        ) : (
          <ol className="divide-y divide-border">
            {top.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground" title={p.title}>{p.title}</span>
                  {p.code && <span className="block font-mono text-[11px] text-muted-foreground">{p.code}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{p.units} un.</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

/**
 * Início do painel: o que precisa de atenção, para quem entra. Mostra só o que a pessoa pode
 * tratar (sem permissão de encomendas, não vê encomendas). Cada número leva ao sítio onde se
 * resolve.
 */
export default function AdminOverview({
  userName, perms, orders = [], books = [], lowStockBooks = [], loading = false,
  onNavigate, onOpenOrders, onEditBook, onAddProduct,
}) {
  const firstName = String(userName || '').trim().split(/\s+/)[0];
  const todayRaw = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  const active = orders.filter((o) => o.status !== 'cancelled');
  const pending = active.filter((o) => o.status === 'pending');
  const awaiting = active.filter((o) => o.payment_status === 'awaiting_confirmation');
  const toShip = active.filter((o) => o.status === 'confirmed' && !['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(o.delivery_status));
  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const month = active.filter((o) => Date.parse(o.created) >= since);
  const monthTotal = month.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const monthReceived = month.reduce((s, o) => s + Math.max(0, (Number(o.amount_paid) || 0) - (Number(o.amount_refunded) || 0)), 0);
  const recent = orders.slice(0, 6);
  const attention = useMemo(() => attentionItems({ orders, books, perms }), [orders, books, perms]);
  const act = (action) => {
    if (action.section === 'orders') onOpenOrders({ status: action.status, payment: action.payment });
    else onNavigate(action.section, { filter: action.filter });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {firstName ? <>Olá, <strong className="font-medium text-foreground">{firstName}</strong>. </> : null}
        {today}.
      </p>

      <AttentionList items={attention} onAct={act} loading={loading} />

      {perms.orders && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores">
          <StatCard
            icon={Clock} label="Por confirmar" tone={pending.length ? 'warning' : 'default'}
            value={loading ? '…' : pending.length} hint="Encomendas novas"
            onClick={() => onOpenOrders({ status: 'pending' })}
          />
          <StatCard
            icon={Wallet} label="Pagamentos a verificar" tone={awaiting.length ? 'warning' : 'default'}
            value={loading ? '…' : awaiting.length} hint="O cliente diz que pagou"
            onClick={() => onOpenOrders({ payment: 'awaiting_confirmation' })}
          />
          <StatCard
            icon={ShoppingBag} label="Por enviar" tone={toShip.length ? 'info' : 'default'}
            value={loading ? '…' : toShip.length} hint="Confirmadas, ainda na loja"
            onClick={() => onOpenOrders({ status: 'confirmed' })}
          />
          {/* A facturação só para quem tem «Ver relatórios» (o atendimento trata encomendas sem a ver). */}
          {perms.reports && (
            <StatCard
              icon={CheckCircle2} label="Encomendado (30 dias)" tone="success"
              value={loading ? '…' : kz(monthTotal)}
              hint={`${month.length} encomenda${month.length === 1 ? '' : 's'} · ${kz(monthReceived)} recebido${monthReceived === 0 ? '' : 's'}`}
              onClick={() => onNavigate('vendas-huambo')}
            />
          )}
        </div>
      )}

      {perms.orders && perms.reports && !loading && <MonthPanel orders={orders} onNavigate={onNavigate} />}

      <div className="grid gap-6 xl:grid-cols-3">
        {perms.orders && (
          <div className="xl:col-span-2">
            <Panel
              title="Últimas encomendas"
              action={(
                <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => onNavigate('orders')}>
                  Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            >
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">A carregar…</p>
              ) : recent.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ainda não há encomendas.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onOpenOrders({ search: formatOrderNumber(o) })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-hidden"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            <span className="font-mono text-xs text-primary">{formatOrderNumber(o)}</span> · {o.customer_name || o.customer_email || 'Cliente'}
                          </span>
                          <span className="block text-xs text-muted-foreground">{relative(o.created)}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{kz(o.total)}</span>
                        <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex', getOrderStatusColor(o.status))}>
                          {getOrderStatusLabel(o.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}

        <div className="space-y-6">
          {perms.catalog && (
            <Panel
              title={lowStockBooks.length ? `Stock baixo (${lowStockBooks.length})` : 'Stock'}
              action={lowStockBooks.length > 5 && (
                <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => onNavigate('books', { filter: 'low_stock' })}>
                  Ver todos
                </Button>
              )}
            >
              {lowStockBooks.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Nenhum produto a precisar de reposição.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {lowStockBooks.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                      <AlertTriangle className={cn('h-4 w-4 shrink-0', Number(b.stock) <= 0 ? 'text-red-600' : 'text-amber-600')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{b.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{b.book_code}</span> · {Number(b.stock) <= 0 ? 'esgotado' : `${b.stock} un.`}
                        </span>
                      </span>
                      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => onEditBook(b)}>Repor</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel title="Atalhos">
            <div className="grid gap-1 p-2">
              {perms.catalog && (
                <Shortcut icon={Plus} label="Adicionar produto" onClick={onAddProduct} />
              )}
              {perms.catalog && (
                <Shortcut icon={PackageSearch} label={`Produtos (${books.length})`} onClick={() => onNavigate('books')} />
              )}
              {perms.orders && <Shortcut icon={MessageCircle} label="Atendimento" onClick={() => onNavigate('support')} />}
              {(perms.settings || perms.marketing) && <Shortcut icon={PanelTop} label="Faixa de aviso" onClick={() => onNavigate('notices')} />}
              <a
                href="/" target="_blank" rel="noopener noreferrer"
                className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Ver a loja
              </a>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Shortcut({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {label}
    </button>
  );
}
