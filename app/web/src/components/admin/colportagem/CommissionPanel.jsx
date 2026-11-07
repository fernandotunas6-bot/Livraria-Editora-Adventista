import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PRODUCT_TYPES } from '@/lib/productTypes';
import { pctPreview, setRule } from '@/lib/colporteurApi';
import { CATEGORIES, SALE_MODES, inForce, resolvePct, today } from '@/lib/colporteurCommission';
import { DataTable, FormField, NativeSelect, Pill } from '@/components/admin/igreja/registryUi';

const typeLabel = (v) => PRODUCT_TYPES.find((t) => t.value === v)?.label || v;
const ruleKey = (category, productType, saleMode) => `${category || '*'}|${productType || '*'}|${saleMode || '*'}`;

/**
 * Percentagens: a matriz categoria × modo de venda (sem tipo de produto), as regras por tipo
 * de produto, o histórico e uma simulação. Cada célula mostra a percentagem que se aplica hoje;
 * a negrito, as que têm regra própria; as outras herdam da linha "Todas" ou da base.
 */
export default function CommissionPanel({ data, run }) {
  const [edit, setEdit] = useState(null);
  const [sim, setSim] = useState({ colporteurId: '', productType: 'livro', saleMode: 'consignacao', date: today() });
  const [server, setServer] = useState(null);
  const base = Number(data.settings.base_pct || 0);
  const open = useMemo(() => new Map(data.rules.filter((r) => !r.valid_to || String(r.valid_to) >= today())
    .filter((r) => inForce(r) || String(r.valid_from) > today())
    .map((r) => [ruleKey(r.category, r.product_type, r.sale_mode), r])), [data.rules]);
  const byType = data.rules.filter((r) => r.product_type && (!r.valid_to || String(r.valid_to) >= today()));
  const history = [...data.rules].sort((a, b) => String(b.created).localeCompare(String(a.created)));

  const cell = (category, saleMode) => {
    const own = open.get(ruleKey(category, null, saleMode));
    const eff = category
      ? resolvePct({ category, saleMode: saleMode || undefined, rules: data.rules.filter((r) => !r.product_type), basePct: base }).pct
      : own ? Number(own.pct) : null;
    return { own, eff };
  };
  const openEdit = (category, productType, saleMode) => {
    const own = open.get(ruleKey(category, productType, saleMode));
    setEdit({ category, productType, saleMode, pct: own ? String(own.pct) : '', from: today(), notes: '', own });
  };

  const colporteur = data.colporteurs.find((c) => c.id === sim.colporteurId);
  const simResult = colporteur ? resolvePct({
    category: colporteur.category, productType: sim.productType, saleMode: sim.saleMode, date: sim.date,
    rules: data.rules, overrides: data.overrides.filter((o) => o.colporteur_id === colporteur.id), basePct: base,
  }) : null;

  return (
    <div className="space-y-8">
      {!data.rules.length && base === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Ainda não há percentagens definidas: todos os colportores ficam com 0%. Defina pelo menos a linha "Todas as categorias", ou a percentagem base em Definições.
        </p>
      )}

      <section>
        <h3 className="mb-1 font-semibold">Por categoria e modo de venda</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Clique numa célula para mudar. Em <strong>negrito</strong>, o que tem regra própria; em cinzento, o que herda. A excepção de um colportor (na ficha dele) ganha sempre. Base: {base}%.
        </p>
        <DataTable head={['Categoria', 'Todos os modos', ...Object.values(SALE_MODES).map((m) => m.label)]}>
          {[null, ...Object.keys(CATEGORIES)].map((cat) => (
            <tr key={cat || 'all'}>
              <td className="px-3 py-2 font-medium">{cat ? CATEGORIES[cat].label : 'Todas as categorias'}</td>
              {[null, ...Object.keys(SALE_MODES)].map((mode) => {
                const { own, eff } = cell(cat, mode);
                const shown = own ? Number(own.pct) : (mode === null && !cat ? null : eff);
                return (
                  <td key={mode || 'all'} className="px-1 py-1">
                    <button type="button" onClick={() => openEdit(cat, null, mode)}
                      className={`w-full rounded-md px-2 py-1.5 text-left tabular-nums hover:bg-muted ${own ? 'font-bold' : 'text-muted-foreground'}`}
                      title={own ? `Regra desde ${own.valid_from}${String(own.valid_from) > today() ? ' (futura)' : ''}` : 'Herda — clique para definir'}>
                      {shown == null ? '—' : `${shown}%`}{own && String(own.valid_from) > today() && <span className="ml-1 text-[10px] font-normal text-amber-600">a partir de {own.valid_from}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </DataTable>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold">Por tipo de produto</h3>
          <Button size="sm" variant="outline" onClick={() => setEdit({ category: null, productType: 'biblia', saleMode: null, pct: '', from: today(), notes: '', own: null, pickType: true })}>
            <Plus className="mr-1.5 h-4 w-4" />Regra por tipo
          </Button>
        </div>
        <DataTable head={['Tipo de produto', 'Categoria', 'Modo', '%', 'Desde', '']} empty="Nenhuma — todos os produtos seguem a tabela de cima.">
          {byType.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{typeLabel(r.product_type)}</td>
              <td className="px-3 py-2">{r.category ? CATEGORIES[r.category].label : 'Todas'}</td>
              <td className="px-3 py-2">{r.sale_mode ? SALE_MODES[r.sale_mode].label : 'Todos'}</td>
              <td className="px-3 py-2 font-bold tabular-nums">{Number(r.pct)}%</td>
              <td className="px-3 py-2">{r.valid_from}</td>
              <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(r.category, r.product_type, r.sale_mode)}>Mudar</Button></td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Calculator className="h-4 w-4" />Simular</h3>
        <div className="grid gap-2 sm:grid-cols-4">
          <NativeSelect value={sim.colporteurId} onChange={(v) => { setSim({ ...sim, colporteurId: v }); setServer(null); }}>
            <option value="">— colportor —</option>
            {data.colporteurs.filter((c) => c.code).sort((a, b) => a.full_name.localeCompare(b.full_name)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.full_name}</option>)}
          </NativeSelect>
          <NativeSelect value={sim.productType} onChange={(v) => { setSim({ ...sim, productType: v }); setServer(null); }}>
            {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </NativeSelect>
          <NativeSelect value={sim.saleMode} onChange={(v) => { setSim({ ...sim, saleMode: v }); setServer(null); }}>
            {Object.entries(SALE_MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </NativeSelect>
          <Input type="date" value={sim.date} onChange={(e) => { setSim({ ...sim, date: e.target.value }); setServer(null); }} />
        </div>
        {simResult && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span><strong>{colporteur.full_name}</strong> ({CATEGORIES[colporteur.category].label}) ganha <strong className="text-lg">{simResult.pct}%</strong></span>
            <Pill tone="blue">{simResult.source === 'excepcao' ? 'percentagem própria' : simResult.source === 'regra' ? 'regra' : 'base'}</Pill>
            <Button size="sm" variant="ghost" onClick={() => run(async () => {
              const v = Number(await pctPreview({ colporteurId: colporteur.id, productType: sim.productType, saleMode: sim.saleMode, date: sim.date }));
              setServer(v);
              return v === simResult.pct ? `A base de dados confirma: ${v}%.` : `Atenção: a base de dados diz ${v}%.`;
            })}>Confirmar na base de dados</Button>
            {server != null && <Pill tone={server === simResult.pct ? 'green' : 'red'}>base de dados: {server}%</Pill>}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Histórico de regras</h3>
        <DataTable head={['Categoria', 'Tipo', 'Modo', '%', 'Em vigor', 'Nota']} empty="Sem regras.">
          {history.map((r) => (
            <tr key={r.id} className={inForce(r) ? '' : 'text-muted-foreground'}>
              <td className="px-3 py-1.5">{r.category ? CATEGORIES[r.category].label : 'Todas'}</td>
              <td className="px-3 py-1.5">{r.product_type ? typeLabel(r.product_type) : 'Todos'}</td>
              <td className="px-3 py-1.5">{r.sale_mode ? SALE_MODES[r.sale_mode].label : 'Todos'}</td>
              <td className="px-3 py-1.5 tabular-nums">{Number(r.pct)}%</td>
              <td className="px-3 py-1.5">{r.valid_from} → {r.valid_to || 'hoje'}</td>
              <td className="px-3 py-1.5">{r.notes}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Percentagem</DialogTitle>
            <DialogDescription>
              {edit && `${edit.category ? CATEGORIES[edit.category].label : 'Todas as categorias'} · ${edit.saleMode ? SALE_MODES[edit.saleMode].label : 'todos os modos'}${edit.productType ? ` · ${typeLabel(edit.productType)}` : ''}`}.
              {' '}A regra antiga fica no histórico até à véspera da nova data; as vendas já feitas não mudam.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {edit.pickType && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label="Tipo">
                    <NativeSelect value={edit.productType} onChange={(v) => setEdit({ ...edit, productType: v })}>
                      {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Categoria">
                    <NativeSelect value={edit.category || ''} onChange={(v) => setEdit({ ...edit, category: v || null })}>
                      <option value="">Todas</option>
                      {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Modo">
                    <NativeSelect value={edit.saleMode || ''} onChange={(v) => setEdit({ ...edit, saleMode: v || null })}>
                      <option value="">Todos</option>
                      {Object.entries(SALE_MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </NativeSelect>
                  </FormField>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Percentagem (%)"><Input type="number" min={0} max={100} step="0.5" value={edit.pct} onChange={(e) => setEdit({ ...edit, pct: e.target.value })} autoFocus /></FormField>
                <FormField label="A partir de"><Input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></FormField>
              </div>
              <FormField label="Nota (opcional)"><Input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={300} placeholder="ex.: decisão da comissão de 2026" /></FormField>
              {edit.own && <p className="text-sm text-muted-foreground">Em vigor: {Number(edit.own.pct)}% desde {edit.own.valid_from}.</p>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {edit?.own ? (
              <Button variant="ghost" className="text-destructive" onClick={() => run(async () => {
                await setRule({ category: edit.category, productType: edit.productType, saleMode: edit.saleMode, pct: null, from: edit.from, notes: edit.notes });
                setEdit(null);
              }, 'Regra retirada: passa a herdar.')}>Retirar regra</Button>
            ) : <span />}
            <Button disabled={edit?.pct === '' || edit?.pct == null} onClick={() => run(async () => {
              const pct = Number(edit.pct);
              if (!(pct >= 0 && pct <= 100)) throw new Error('A percentagem tem de estar entre 0 e 100.');
              await setRule({ category: edit.category, productType: edit.productType, saleMode: edit.saleMode, pct, from: edit.from, notes: edit.notes });
              setEdit(null);
            }, 'Percentagem guardada.')}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
