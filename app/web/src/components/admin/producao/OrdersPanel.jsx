import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, PackagePlus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, NativeSelect, Pill, SearchBox, Toolbar } from '@/components/admin/igreja/registryUi';
import { kwanza } from '@/lib/money';
import {
  ORDER_KINDS, ORDER_STATUS, PAY_METHODS, STAGE_STATUS, orderCost, orderOverdue, orderProgress, stageOverdue,
} from '@/lib/production';
import {
  addCost, addStage, cancelOrder, completeOrder, deleteCost, deleteOrder, deleteStage, moveStage, saveOrder, saveStage,
} from '@/lib/productionApi';
import { normalizeForSearch } from '@/lib/searchUtils';
import { cn } from '@/lib/utils';

const FILTERS = {
  abertas: { label: 'Abertas', test: (o) => o.status === 'planeada' || o.status === 'em_curso' },
  concluidas: { label: 'Concluídas', test: (o) => o.status === 'concluida' },
  canceladas: { label: 'Canceladas', test: (o) => o.status === 'cancelada' },
  todas: { label: 'Todas', test: () => true },
};
const EMPTY_ORDER = { title: '', book_id: '', kind: 'reimpressao', quantity: '', supplier_id: '', due_date: '', notes: '' };
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-AO') : '');
const open = (o) => o.status === 'planeada' || o.status === 'em_curso';

/** As ordens de produção: lista, ordem nova e a ficha de cada uma. */
export default function OrdersPanel({ data, canEdit, canPay, run, today }) {
  const [filter, setFilter] = useState('abertas');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(null);
  const [openId, setOpenId] = useState(null);

  const stagesOf = useMemo(() => {
    const map = new Map();
    for (const s of data.stages) {
      if (!map.has(s.order_id)) map.set(s.order_id, []);
      map.get(s.order_id).push(s);
    }
    return map;
  }, [data.stages]);
  const costsOf = (id) => data.costs.filter((c) => c.order_id === id);
  const supplierName = (id) => data.suppliers.find((s) => s.id === id)?.name || '';
  const staffName = (id) => data.staff.find((s) => s.id === id)?.full_name || '';
  const bookOf = (id) => data.books.find((b) => b.id === id);

  const list = data.orders
    .filter(FILTERS[filter].test)
    .filter((o) => {
      const q = normalizeForSearch(query);
      if (!q) return true;
      return normalizeForSearch([o.code, o.title, supplierName(o.supplier_id), bookOf(o.book_id)?.book_code].join(' ')).includes(q);
    });

  const create = async () => {
    const quantity = Number(creating.quantity);
    if (creating.title.trim().length < 2) throw new Error('Indique o título.');
    if (!(quantity > 0)) throw new Error('Indique a tiragem (quantos exemplares).');
    const saved = await saveOrder({ ...creating, title: creating.title.trim(), quantity });
    setCreating(null);
    setOpenId(saved.id);
    return `Ordem ${saved.code} criada, com as etapas de ${ORDER_KINDS[saved.kind].toLowerCase()}.`;
  };

  const current = data.orders.find((o) => o.id === openId) || null;

  return (
    <div>
      <Toolbar>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Que ordens mostrar">
          {Object.entries(FILTERS).map(([id, f]) => (
            <Button key={id} size="sm" variant={filter === id ? 'default' : 'outline'} className="h-9" onClick={() => setFilter(id)}>
              {f.label} <span className="ml-1 tabular-nums opacity-70">{data.orders.filter(f.test).length}</span>
            </Button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="Código, título, gráfica…" />
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={() => setCreating({ ...EMPTY_ORDER })}>
            <Plus className="mr-1.5 h-4 w-4" />Nova ordem
          </Button>
        )}
      </Toolbar>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {data.orders.length === 0
            ? 'Ainda não há ordens de produção. Cada título que se imprime — novo, nova edição ou reimpressão — começa aqui.'
            : 'Nenhuma ordem com este filtro.'}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => {
            const progress = orderProgress(stagesOf.get(o.id) || [], today);
            const cost = orderCost(o, costsOf(o.id));
            const late = orderOverdue(o, today);
            const status = ORDER_STATUS[o.status];
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(o.id)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{o.code} · {ORDER_KINDS[o.kind]}</p>
                      <p className="mt-0.5 truncate font-semibold">{o.title}</p>
                    </div>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {o.received_quantity != null ? `${o.received_quantity} de ${o.quantity} recebidos` : `${o.quantity} exemplares`}
                    {o.supplier_id && <> · {supplierName(o.supplier_id)}</>}
                  </p>
                  {open(o) && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {progress.current
                            ? <>Agora: <span className="font-medium text-foreground">{progress.current.name}</span>{progress.current.responsible_id && <> · {staffName(progress.current.responsible_id)}</>}</>
                            : 'Etapas todas feitas: pronta a concluir'}
                        </span>
                        <span className="tabular-nums">{progress.done}/{progress.total}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {o.due_date && (
                      <span className={cn(late ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                        {late && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />}
                        Prazo {fmtDate(o.due_date)}{late && ' (passou)'}
                      </span>
                    )}
                    {progress.overdue > 0 && open(o) && (
                      <span className="font-medium text-amber-700 dark:text-amber-400">{progress.overdue} {progress.overdue === 1 ? 'etapa atrasada' : 'etapas atrasadas'}</span>
                    )}
                    {cost.total > 0 && (
                      <span className="text-muted-foreground">Custo {kwanza(cost.total)}{cost.perUnit > 0 && <> · {kwanza(cost.perUnit)}/exemplar</>}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova ordem de produção</DialogTitle>
            <DialogDescription>Recebe as etapas do tipo escolhido; depois ajusta-as, escolhe os responsáveis e os prazos.</DialogDescription>
          </DialogHeader>
          {creating && (
            <OrderFields value={creating} onChange={setCreating} data={data} />
          )}
          <DialogFooter>
            <Button onClick={() => run(create)}>Criar ordem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {current && (
        <OrderDialog
          key={current.id}
          order={current}
          stages={(stagesOf.get(current.id) || []).slice().sort((a, b) => a.position - b.position)}
          costs={costsOf(current.id)}
          payments={data.payments.filter((p) => p.order_id === current.id)}
          data={data}
          canEdit={canEdit}
          canPay={canPay}
          run={run}
          today={today}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/** Os campos de uma ordem (nova ou a editar). Escolher o produto preenche o título. */
function OrderFields({ value, onChange, data, disabled = false }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <FormField label="Produto do catálogo" hint="É aí que a tiragem entra no stock ao concluir. Um título novo pode começar sem produto e ligá-lo antes de concluir.">
        <NativeSelect
          value={value.book_id || ''}
          disabled={disabled}
          onChange={(v) => {
            const book = data.books.find((b) => b.id === v);
            set({ book_id: v, title: book && !value.title.trim() ? book.title : value.title });
          }}
        >
          <option value="">— ainda sem produto —</option>
          {data.books.map((b) => <option key={b.id} value={b.id}>{b.book_code ? `${b.book_code} · ` : ''}{b.title}</option>)}
        </NativeSelect>
      </FormField>
      <FormField label="Título *">
        <Input value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} disabled={disabled} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Tipo">
          <NativeSelect value={value.kind} onChange={(v) => set({ kind: v })} disabled={disabled || !!value.id}>
            {Object.entries(ORDER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Tiragem (exemplares) *">
          <Input type="number" inputMode="numeric" min={1} max={1000000} value={value.quantity} onChange={(e) => set({ quantity: e.target.value })} disabled={disabled} />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Gráfica">
          <NativeSelect value={value.supplier_id || ''} onChange={(v) => set({ supplier_id: v })} disabled={disabled}>
            <option value="">— por escolher —</option>
            {data.suppliers.filter((s) => s.active || s.id === value.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Prazo de entrega">
          <Input type="date" value={value.due_date || ''} onChange={(e) => set({ due_date: e.target.value })} disabled={disabled} />
        </FormField>
      </div>
      <FormField label="Notas">
        <Textarea value={value.notes || ''} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={2000} />
      </FormField>
    </div>
  );
}

/** A ficha de uma ordem: dados, etapas, custos, pagamentos e as acções (concluir, cancelar). */
function OrderDialog({ order, stages, costs, payments, data, canEdit, canPay, run, today, onClose }) {
  const isOpen = open(order);
  const editable = canEdit && isOpen;
  const [form, setForm] = useState(() => ({
    ...order, book_id: order.book_id || '', supplier_id: order.supplier_id || '', due_date: order.due_date || '', quantity: String(order.quantity),
  }));
  const [newStage, setNewStage] = useState('');
  const [cost, setCost] = useState({ description: '', supplier_id: order.supplier_id || '', amount: '', incurred_on: '' });
  const [closing, setClosing] = useState(null); // { kind: 'complete' | 'cancel', received, reason }
  const progress = orderProgress(stages, today);
  const totals = orderCost(order, costs);
  const book = data.books.find((b) => b.id === order.book_id);
  const activeStaff = data.staff.filter((s) => s.status !== 'saiu');
  const status = ORDER_STATUS[order.status];
  const missing = stages.filter((s) => s.status !== 'concluida' && s.status !== 'nao_aplica').map((s) => s.name);

  const saveData = async () => {
    const quantity = Number(form.quantity);
    if (form.title.trim().length < 2) throw new Error('Indique o título.');
    if (!(quantity > 0)) throw new Error('Indique a tiragem.');
    await saveOrder(isOpen ? { ...form, title: form.title.trim(), quantity } : { id: order.id, notes: form.notes });
    return 'Ordem guardada.';
  };
  const stage = (s, patch) => run(() => saveStage({ id: s.id, ...patch }), null, { quiet: true });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{order.code}</span>
            <span>{order.title}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </DialogTitle>
          <DialogDescription>
            {ORDER_KINDS[order.kind]} · {order.quantity} exemplares
            {order.received_quantity != null && <> · {order.received_quantity} entraram no stock</>}
            {order.status === 'cancelada' && order.cancel_reason && <> · cancelada: {order.cancel_reason}</>}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3" aria-labelledby={`dados-${order.id}`}>
          <h3 id={`dados-${order.id}`} className="text-sm font-semibold">Dados</h3>
          <OrderFields value={form} onChange={setForm} data={data} disabled={!editable} />
          {canEdit && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => run(saveData)}>{isOpen ? 'Guardar dados' : 'Guardar notas'}</Button>
            </div>
          )}
        </section>

        <section className="mt-6 space-y-2" aria-labelledby={`etapas-${order.id}`}>
          <div className="flex items-center justify-between">
            <h3 id={`etapas-${order.id}`} className="text-sm font-semibold">Etapas</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{progress.done} de {progress.total} feitas</span>
          </div>
          <ol className="divide-y divide-border rounded-xl border border-border">
            {stages.map((s, i) => {
              const late = stageOverdue(s, today);
              return (
                <li key={`${s.id}-${s.updated}`} className={cn('p-3', late && 'bg-amber-500/5')}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
                    <Input
                      defaultValue={s.name}
                      aria-label={`Nome da etapa ${i + 1}`}
                      disabled={!editable}
                      maxLength={80}
                      className="flex-1 font-medium"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v.length >= 2 && v !== s.name) stage(s, { name: v }); }}
                    />
                    {late && <Pill tone="amber">Atrasada</Pill>}
                    {editable && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" className="h-9 w-9" title="Subir" aria-label={`Subir ${s.name}`} disabled={i === 0}
                        onClick={() => run(() => moveStage(s.id, -1), null, { quiet: true })}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" title="Descer" aria-label={`Descer ${s.name}`} disabled={i === stages.length - 1}
                        onClick={() => run(() => moveStage(s.id, 1), null, { quiet: true })}><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" title="Tirar esta etapa" aria-label={`Tirar ${s.name}`}
                        onClick={() => confirm(`Tirar a etapa "${s.name}" desta ordem?`) && run(() => deleteStage(s.id), 'Etapa tirada.')}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 sm:pl-8">
                    <NativeSelect value={s.responsible_id || ''} onChange={(v) => stage(s, { responsible_id: v })} disabled={!editable} aria-label={`Responsável por ${s.name}`}>
                      <option value="">— sem responsável —</option>
                      {activeStaff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </NativeSelect>
                    <Input
                      type="date"
                      defaultValue={s.due_date || ''}
                      disabled={!editable}
                      aria-label={`Prazo de ${s.name}`}
                      title="Prazo"
                      onChange={(e) => { if (e.target.value !== (s.due_date || '')) stage(s, { due_date: e.target.value }); }}
                      className={cn(late && 'border-amber-500 text-amber-800 dark:text-amber-300')}
                    />
                    <NativeSelect value={s.status} onChange={(v) => stage(s, { status: v })} disabled={!editable} aria-label={`Estado de ${s.name}`}>
                      {Object.entries(STAGE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </NativeSelect>
                  </div>
                </li>
              );
            })}
            {stages.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sem etapas.</li>}
          </ol>
          {editable && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newStage.trim();
                if (name.length < 2) return;
                run(() => addStage(order.id, name, stages), null, { quiet: true }).then((ok) => ok && setNewStage(''));
              }}
            >
              <Input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Acrescentar etapa (ex.: Tradução)" maxLength={80} />
              <Button type="submit" variant="outline" size="sm" className="h-auto"><Plus className="mr-1 h-4 w-4" />Acrescentar</Button>
            </form>
          )}
        </section>

        <section className="mt-6 space-y-2" aria-labelledby={`custos-${order.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`custos-${order.id}`} className="text-sm font-semibold">Custos</h3>
            <span className="text-sm">
              <strong>{kwanza(totals.total)}</strong>
              {totals.perUnit > 0 && <span className="text-muted-foreground"> · {kwanza(totals.perUnit)} por exemplar ({totals.units})</span>}
            </span>
          </div>
          {costs.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {costs.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(c.incurred_on)}</span>
                  <span className="min-w-0 flex-1">{c.description}{c.supplier_id && <span className="text-muted-foreground"> · {data.suppliers.find((s) => s.id === c.supplier_id)?.name}</span>}</span>
                  <span className="font-medium tabular-nums">{kwanza(c.amount)}</span>
                  {editable && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Apagar o custo ${c.description}`}
                      onClick={() => confirm(`Apagar o custo "${c.description}"?`) && run(() => deleteCost(c.id), 'Custo apagado.')}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem_9rem_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (cost.description.trim().length < 2) throw new Error('Diga o que se pagou (ex.: Impressão, Papel).');
                  if (!(Number(cost.amount) >= 0) || cost.amount === '') throw new Error('Indique o valor.');
                  await addCost({ ...cost, order_id: order.id, description: cost.description.trim() });
                  setCost({ description: '', supplier_id: cost.supplier_id, amount: '', incurred_on: '' });
                  return 'Custo registado.';
                });
              }}
            >
              <Input value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} placeholder="Impressão, papel, capa…" maxLength={200} aria-label="Descrição do custo" />
              <NativeSelect value={cost.supplier_id} onChange={(v) => setCost({ ...cost, supplier_id: v })} aria-label="Fornecedor do custo">
                <option value="">— sem fornecedor —</option>
                {data.suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} placeholder="Kz" aria-label="Valor do custo" />
              <Input type="date" value={cost.incurred_on} onChange={(e) => setCost({ ...cost, incurred_on: e.target.value })} aria-label="Data do custo" />
              <Button type="submit" variant="outline" size="sm" className="h-auto"><Plus className="mr-1 h-4 w-4" />Custo</Button>
            </form>
          )}
        </section>

        {(payments.length > 0 || canPay) && (
          <section className="mt-6 space-y-2" aria-labelledby={`pagos-${order.id}`}>
            <h3 id={`pagos-${order.id}`} className="text-sm font-semibold">Pagamentos ligados a esta ordem</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum. Registam-se em Produção → Contas e pagamentos.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {payments.map((p) => (
                  <li key={p.id} className={cn('flex flex-wrap items-center gap-x-3 px-3 py-2', p.status === 'anulado' && 'opacity-60')}>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(p.paid_on)}</span>
                    <span className="flex-1">{data.suppliers.find((s) => s.id === p.supplier_id)?.name} · {PAY_METHODS[p.method]}{p.reference && ` · ${p.reference}`}</span>
                    <span className={cn('font-medium tabular-nums', p.status === 'anulado' && 'line-through')}>{kwanza(p.amount)}</span>
                    {p.status === 'anulado' && <Pill>anulado</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {editable && closing?.kind === 'complete' && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
            <p className="font-semibold">Concluir e pôr no stock</p>
            {!book || missing.length > 0 ? (
              <>
                {!book ? (
                  <p className="mt-1 text-muted-foreground">Ligue primeiro a ordem a um produto do catálogo (em "Dados"): é aí que a tiragem entra.</p>
                ) : (
                  <p className="mt-1 text-amber-800 dark:text-amber-300">Faltam etapas por fazer: {missing.join(', ')}. Marque-as como feitas ou "não se aplica".</p>
                )}
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setClosing(null)}>Voltar</Button>
              </>
            ) : (
              <>
                <p className="mt-1 text-muted-foreground">
                  Entram no stock de <strong className="text-foreground">{book.title}</strong> (hoje {book.stock ?? 0} em stock). Fica no histórico do stock como "produção", com o código {order.code}. Não se desfaz.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <FormField label="Exemplares recebidos" className="w-44">
                    <Input type="number" inputMode="numeric" min={0} max={1000000} value={closing.received}
                      onChange={(e) => setClosing({ ...closing, received: e.target.value })} />
                  </FormField>
                  <Button onClick={() => run(async () => {
                    const r = await completeOrder(order.id, closing.received);
                    setClosing(null);
                    return `Ordem ${r.code} concluída: ${r.received} exemplares no stock (agora ${r.stock}).`;
                  })}><CheckCircle2 className="mr-1.5 h-4 w-4" />Concluir</Button>
                  <Button variant="ghost" onClick={() => setClosing(null)}>Voltar</Button>
                </div>
              </>
            )}
          </div>
        )}
        {editable && closing?.kind === 'cancel' && (
          <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold">Cancelar a ordem</p>
            <p className="mt-1 text-muted-foreground">As etapas e os custos ficam como estão (o que já se gastou continua nas contas dos fornecedores).</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <FormField label="Porque se cancela" className="min-w-[16rem] flex-1">
                <Input value={closing.reason} onChange={(e) => setClosing({ ...closing, reason: e.target.value })} maxLength={300} />
              </FormField>
              <Button variant="destructive" onClick={() => run(async () => {
                await cancelOrder(order.id, closing.reason);
                setClosing(null);
                return `Ordem ${order.code} cancelada.`;
              })}><X className="mr-1.5 h-4 w-4" />Cancelar a ordem</Button>
              <Button variant="ghost" onClick={() => setClosing(null)}>Voltar</Button>
            </div>
          </div>
        )}

        {editable && !closing && (
          <DialogFooter className="mt-6 gap-2 sm:justify-between">
            <div className="flex gap-2">
              {order.status === 'planeada' && (
                <Button variant="ghost" className="text-destructive" onClick={() => confirm(`Apagar a ordem ${order.code}? Só se apagam as planeadas.`)
                  && run(async () => { await deleteOrder(order.id); onClose(); return 'Ordem apagada.'; })}>
                  <Trash2 className="mr-1.5 h-4 w-4" />Apagar
                </Button>
              )}
              <Button variant="ghost" onClick={() => setClosing({ kind: 'cancel', reason: '' })}>Cancelar a ordem</Button>
            </div>
            {/* Sempre activo: o painel que abre diz o que falta (um botão desligado escondia o porquê). */}
            <Button onClick={() => setClosing({ kind: 'complete', received: String(order.quantity) })}>
              <PackagePlus className="mr-1.5 h-4 w-4" />Concluir e pôr no stock
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
