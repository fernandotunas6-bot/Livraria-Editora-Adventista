// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo, useState } from 'react';
import { Minus, Plus, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { kz } from '@/lib/colporteurCommission';
import { recentWeeks, weekLabel } from '@/lib/colporteurReports';
import { NativeSelect } from '@/components/admin/igreja/registryUi';

export const EMPTY_REPORT = {
  week_start: '', hours: '', visits: '', prayers: '', free_literature: '', bible_studies: '', interests: '', baptisms: '',
  interest_contacts: [], sales: [], notes: '',
};

const NUMBERS = [
  ['hours', 'Horas de trabalho', '', 0.5],
  ['visits', 'Casas / famílias visitadas', '', 1],
  ['prayers', 'Orações feitas', '', 1],
  ['free_literature', 'Literatura oferecida', 'folhetos, revistas', 1],
  ['bible_studies', 'Inscrições em estudos bíblicos', '', 1],
  ['interests', 'Interessados para o pastor', '', 1],
  ['baptisms', 'Baptismos', 'resultado do trabalho', 1],
];

/**
 * Relatório semanal do colportor (as perguntas do relatório de Evangelismo pela Literatura).
 * Vendas: os livros à consignação que tem em mão (não pode vender mais do que tem) e, à
 * parte, os do seu stock próprio (comprados), que contam só para as estatísticas.
 */
export default function ReportForm({ value, onChange, inHand = [], books = [], weeks = recentWeeks(8), lockedWeek = false }) {
  const [ownQuery, setOwnQuery] = useState('');
  const set = (patch) => onChange({ ...value, ...patch });
  const qtyOf = (bookId, source) => value.sales.find((s) => s.book_id === bookId && (s.source || 'consignacao') === source)?.qty || 0;
  const setQty = (bookId, source, qty) => {
    const others = value.sales.filter((s) => !(s.book_id === bookId && (s.source || 'consignacao') === source));
    set({ sales: qty > 0 ? [...others, { book_id: bookId, qty, source }] : others });
  };
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const own = value.sales.filter((s) => s.source === 'proprio');
  const q = ownQuery.trim().toLowerCase();
  const ownResults = q.length >= 2 ? books.filter((b) => !b.hasVariants && `${b.book_code} ${b.title}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const consignValue = inHand.reduce((s, b) => s + qtyOf(b.book_id, 'consignacao') * Number(b.unit_price || 0), 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="rf-week">Semana (segunda a domingo)</Label>
        <NativeSelect id="rf-week" value={value.week_start} onChange={(v) => set({ week_start: v })} disabled={lockedWeek}>
          <option value="">— escolher —</option>
          {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUMBERS.map(([k, label, hint, step]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`rf-${k}`} className="text-xs leading-tight">{label}</Label>
            <Input id={`rf-${k}`} type="number" inputMode="decimal" min={0} step={step} value={value[k]} onChange={(e) => set({ [k]: e.target.value })} />
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>

      <div>
        <h4 className="mb-2 font-semibold">Vendas de livros à consignação</h4>
        {inHand.length === 0 ? (
          <p className="text-sm text-muted-foreground">Não tem livros à consignação. Os livros que comprou entram em baixo.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {inHand.map((b) => {
              const n = qtyOf(b.book_id, 'consignacao');
              return (
                <li key={b.book_id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.book_code} · {kz(b.unit_price)} · tem {b.qty}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label={`Menos ${b.title}`} onClick={() => setQty(b.book_id, 'consignacao', Math.max(0, n - 1))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-8 text-center tabular-nums" data-testid={`qty-${b.book_id}`}>{n}</span>
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label={`Mais ${b.title}`} disabled={n >= b.qty} onClick={() => setQty(b.book_id, 'consignacao', Math.min(b.qty, n + 1))}><Plus className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {consignValue > 0 && <p className="mt-2 text-sm">Vendido à consignação: <strong>{kz(consignValue)}</strong></p>}
      </div>

      <div>
        <h4 className="mb-1 font-semibold">Vendas de livros que comprou</h4>
        <p className="mb-2 text-xs text-muted-foreground">Só para as estatísticas: já pagou estes livros na compra.</p>
        {own.length > 0 && (
          <ul className="mb-2 space-y-1 text-sm">
            {own.map((s) => (
              <li key={s.book_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                <span className="truncate">{byId.get(s.book_id)?.title || s.book_id}</span>
                <span className="flex items-center gap-2">
                  <Input type="number" min={1} className="h-8 w-20" value={s.qty} onChange={(e) => setQty(s.book_id, 'proprio', Math.max(0, parseInt(e.target.value, 10) || 0))} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Retirar" onClick={() => setQty(s.book_id, 'proprio', 0)}><Trash2 className="h-4 w-4" /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Input value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} placeholder="Procurar livro por título ou código…" />
        {ownResults.length > 0 && (
          <ul className="mt-1 rounded-lg border border-border text-sm">
            {ownResults.map((b) => (
              <li key={b.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setQty(b.id, 'proprio', (qtyOf(b.id, 'proprio') || 0) + 1); setOwnQuery(''); }}>{b.book_code} · {b.title}</button></li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="font-semibold">Interessados (opcional)</h4>
          <Button type="button" size="sm" variant="outline" onClick={() => set({ interest_contacts: [...value.interest_contacts, { name: '', phone: '', place: '', request: '' }] })}>
            <UserPlus className="mr-1.5 h-4 w-4" />Acrescentar
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">Pessoas que pediram estudos bíblicos, visita ou oração. A equipa encaminha-as ao pastor do distrito.</p>
        <div className="space-y-2">
          {value.interest_contacts.map((c, i) => {
            const upd = (patch) => set({ interest_contacts: value.interest_contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
                <Input value={c.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Nome" maxLength={120} />
                <Input value={c.phone} onChange={(e) => upd({ phone: e.target.value })} placeholder="Telefone" inputMode="tel" />
                <Input value={c.place} onChange={(e) => upd({ place: e.target.value })} placeholder="Bairro / pedido" maxLength={120} />
                <Button type="button" size="icon" variant="ghost" aria-label="Retirar" onClick={() => set({ interest_contacts: value.interest_contacts.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rf-notes">Notas / experiências da semana</Label>
        <Textarea id="rf-notes" value={value.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} maxLength={2000} />
      </div>
    </div>
  );
}

/** O que se envia à base de dados (números em vez de texto). */
export function reportPayload(value) {
  const num = (v) => (v === '' || v == null ? 0 : Number(v));
  return {
    week_start: value.week_start,
    hours: num(value.hours), visits: num(value.visits), prayers: num(value.prayers), free_literature: num(value.free_literature),
    bible_studies: num(value.bible_studies), interests: Math.max(num(value.interests), value.interest_contacts.filter((c) => c.name.trim()).length),
    baptisms: num(value.baptisms), interest_contacts: value.interest_contacts, sales: value.sales, notes: value.notes,
  };
}

/** Relatório guardado → valores do formulário. */
export function reportToForm(r) {
  if (!r) return { ...EMPTY_REPORT };
  const s = (v) => (v == null ? '' : String(v));
  return {
    week_start: r.week_start, hours: s(r.hours), visits: s(r.visits), prayers: s(r.prayers), free_literature: s(r.free_literature),
    bible_studies: s(r.bible_studies), interests: s(r.interests), baptisms: s(r.baptisms),
    interest_contacts: r.interest_contacts || [], sales: (r.sales || []).map((x) => ({ book_id: x.book_id, qty: x.qty, source: x.source || 'consignacao' })), notes: r.notes || '',
  };
}
