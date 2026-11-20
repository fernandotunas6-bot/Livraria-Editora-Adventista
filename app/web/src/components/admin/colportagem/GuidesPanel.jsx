// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo, useState } from 'react';
import { Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeChip } from '@/components/admin/users/userFormat';
import { issueDocument } from '@/lib/colporteurApi';
import { kz, resolvePct } from '@/lib/colporteurCommission';
import { documentHtml, openPrint } from '@/lib/colporteurPrint';
import { DataTable, FormField, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';

export const GUIDE_KINDS = {
  entrega: { label: 'Entrega à consignação', hint: 'Os livros saem do stock da loja e ficam a cargo do colportor, ao preço de capa.' },
  devolucao: { label: 'Devolução', hint: 'O colportor devolve livros que tinha à consignação; voltam ao stock da loja.' },
  compra: { label: 'Compra com desconto', hint: 'O colportor compra os livros com o desconto da sua percentagem e fica com eles.' },
};

/** Guias: entrega, devolução e compra, com o stock da loja e o do colportor actualizados. */
export default function GuidesPanel({ data, ops, books, run }) {
  const [colpId, setColpId] = useState('');
  const [kind, setKind] = useState('entrega');
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('');
  const byId = useMemo(() => new Map(data.colporteurs.map((c) => [c.id, c])), [data.colporteurs]);
  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const colp = byId.get(colpId);
  const ov = ops.overview.find((o) => o.colporteur_id === colpId);
  const inHand = ov?.in_hand || [];
  const eligible = data.colporteurs.filter((c) => c.code && (kind === 'devolucao' ? true : c.status === 'activo'))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const q = query.trim().toLowerCase();
  const candidates = kind === 'devolucao'
    ? inHand.map((h) => ({ ...bookMap.get(h.book_id), id: h.book_id, title: h.title, book_code: h.book_code, price: h.unit_price, max: h.qty }))
    : q.length >= 2
      ? books.filter((b) => `${b.book_code} ${b.title}`.toLowerCase().includes(q)).slice(0, 10).map((b) => ({ ...b, max: Math.max(0, Math.floor(Number(b.stock || 0))) }))
      : [];
  const add = (b) => {
    if (b.hasVariants || lines.some((l) => l.book_id === b.id)) return;
    setLines([...lines, { book_id: b.id, qty: 1, max: b.max }]);
    setQuery('');
  };
  const total = lines.reduce((s, l) => s + Number(bookMap.get(l.book_id)?.price || 0) * l.qty, 0);
  const discount = kind === 'compra' && colp
    ? lines.reduce((s, l) => {
      const b = bookMap.get(l.book_id);
      const { pct } = resolvePct({ category: colp.category, productType: b?.product_type || 'livro', saleMode: 'compra', rules: data.rules, overrides: data.overrides.filter((o) => o.colporteur_id === colp.id), basePct: data.settings.base_pct });
      return s + Math.round(Number(b?.price || 0) * l.qty * pct) / 100;
    }, 0) : 0;
  const limit = colp ? Number(colp.credit_limit ?? data.settings.default_credit_limit ?? 0) : 0;
  const after = Number(ov?.balance || 0) + (kind === 'entrega' ? total : kind === 'compra' ? total - discount : -total);
  const overLimit = kind === 'entrega' && limit > 0 && after > limit;

  const docs = ops.documents.filter((d) => !filter || d.colporteur_id === filter);
  const print = (doc) => openPrint(documentHtml({ doc, colporteur: byId.get(doc.colporteur_id) }));

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-3 font-semibold">Nova guia</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Tipo" hint={GUIDE_KINDS[kind].hint}>
            <NativeSelect value={kind} onChange={(v) => { setKind(v); setLines([]); }}>
              {Object.entries(GUIDE_KINDS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Colportor">
            <NativeSelect value={colpId} onChange={(v) => { setColpId(v); setLines([]); }}>
              <option value="">— escolher —</option>
              {eligible.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.full_name}</option>)}
            </NativeSelect>
          </FormField>
        </div>
        {colp && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Saldo actual {kz(ov?.balance)} · à consignação {kz(ov?.in_hand_value)}{limit > 0 ? ` · limite ${kz(limit)}` : ''}
            </p>
            {kind !== 'devolucao' && (
              <Input className="mt-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar livro por título ou código…" />
            )}
            {candidates.length > 0 && (
              <ul className="mt-1 divide-y divide-border rounded-lg border border-border text-sm">
                {candidates.map((b) => (
                  <li key={b.id}>
                    <button type="button" disabled={b.hasVariants || b.max <= 0 || lines.some((l) => l.book_id === b.id)} onClick={() => add(b)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-50">
                      <span>{b.book_code} · {b.title}</span>
                      <span className="text-xs text-muted-foreground">{b.hasVariants ? 'tem variantes' : `${kind === 'devolucao' ? 'tem' : 'stock'} ${b.max} · ${kz(b.price)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {kind === 'devolucao' && !inHand.length && <p className="mt-3 text-sm">Este colportor não tem livros à consignação.</p>}
            {lines.length > 0 && (
              <div className="mt-4">
                <DataTable head={['Livro', 'Qtd', 'Preço de capa', 'Valor', '']}>
                  {lines.map((l) => {
                    const b = bookMap.get(l.book_id);
                    return (
                      <tr key={l.book_id}>
                        <td className="px-3 py-1.5">{b?.book_code} · {b?.title}</td>
                        <td className="px-3 py-1.5"><Input type="number" min={1} max={l.max} className="h-8 w-20" value={l.qty}
                          onChange={(e) => setLines(lines.map((x) => (x.book_id === l.book_id ? { ...x, qty: Math.max(1, Math.min(l.max || 1, parseInt(e.target.value, 10) || 1)) } : x)))} /></td>
                        <td className="px-3 py-1.5 tabular-nums">{kz(b?.price)}</td>
                        <td className="px-3 py-1.5 tabular-nums">{kz(Number(b?.price || 0) * l.qty)}</td>
                        <td className="px-3 py-1.5 text-right"><Button size="icon" variant="ghost" aria-label="Retirar" onClick={() => setLines(lines.filter((x) => x.book_id !== l.book_id))}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    );
                  })}
                </DataTable>
                <div className="mt-3 space-y-1 text-sm">
                  <p>Total ao preço de capa: <strong>{kz(total)}</strong></p>
                  {kind === 'compra' && <p>Desconto do colportor: − {kz(discount)} → a pagar <strong>{kz(total - discount)}</strong></p>}
                  <p className={overLimit ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
                    Saldo depois da guia: {kz(after)}{overLimit ? ' — passa o limite; a base de dados vai recusar.' : ''}
                  </p>
                </div>
                <Input className="mt-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" maxLength={500} />
                <Button className="mt-3" onClick={() => run(async () => {
                  const r = await issueDocument({ colporteurId: colpId, kind, lines: lines.map(({ book_id, qty }) => ({ book_id, qty })), notes });
                  setLines([]);
                  setNotes('');
                  return `Guia ${r.number} emitida.`;
                })}>Emitir guia</Button>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <Toolbar>
          <h3 className="font-semibold">Guias emitidas</h3>
          <NativeSelect value={filter} onChange={setFilter} className="ml-auto w-auto">
            <option value="">Todos os colportores</option>
            {data.colporteurs.filter((c) => c.code).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.full_name}</option>)}
          </NativeSelect>
        </Toolbar>
        <DataTable count={docs.length} head={['Nº', 'Data', 'Colportor', 'Tipo', 'Livros', 'Valor', '']} empty="Ainda não há guias.">
          {docs.map((d) => {
            const c = byId.get(d.colporteur_id);
            return (
              <tr key={d.id}>
                <td className="px-3 py-1.5 font-mono text-xs">{d.number}</td>
                <td className="px-3 py-1.5">{new Date(d.created).toLocaleDateString('pt-AO')}</td>
                <td className="px-3 py-1.5"><CodeChip code={c?.code} /> {c?.full_name}</td>
                <td className="px-3 py-1.5"><Pill tone={d.kind === 'devolucao' ? 'blue' : d.kind === 'compra' ? 'green' : 'amber'}>{GUIDE_KINDS[d.kind].label}</Pill></td>
                <td className="px-3 py-1.5 tabular-nums">{(d.lines || []).reduce((s, l) => s + Number(l.qty), 0)}</td>
                <td className="px-3 py-1.5 tabular-nums">{kz(Math.abs(d.amount))}</td>
                <td className="px-3 py-1.5 text-right"><Button size="icon" variant="ghost" title="Imprimir" onClick={() => print(d)}><Printer className="h-4 w-4" /></Button></td>
              </tr>
            );
          })}
        </DataTable>
      </section>
    </div>
  );
}
