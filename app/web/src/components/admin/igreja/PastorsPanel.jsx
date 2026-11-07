import React, { useMemo, useState } from 'react';
import { Download, GitMerge, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PASTOR_ROLES } from '@/lib/churchImport';
import { displayAngolaPhone } from '@/lib/angolaPhone';
import { deleteRecord, downloadCsv, matchesQuery, mergePastors, saveRecord } from '@/lib/churchRegistryApi';
import { DataTable, FormField, NativeSelect, Pill, SearchBox, Toolbar } from './registryUi';

const EMPTY = { title: 'Pr.', name: '', role: 'pastor_distrital', field_id: '', province_id: '', posting: '', phone: '', email: '', status: 'activo', notes: '' };
const TITLES = ['Pr.', 'Anc.', 'Dr.', 'Prof.', ''];

export default function PastorsPanel({ reg, idx, canEdit, run }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [placement, setPlacement] = useState('');
  const [status, setStatus] = useState('activo');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [merge, setMerge] = useState(null);

  const rows = useMemo(() => reg.pastors
    .filter((p) => (status === 'all' ? true : p.status === status))
    .filter((p) => !roleFilter || p.role === roleFilter)
    .filter((p) => !fieldFilter || p.field_id === fieldFilter)
    .filter((p) => {
      const n = (idx.districtsOfPastor.get(p.id) || []).length;
      return !placement || (placement === 'with' ? n > 0 : n === 0);
    })
    .filter((p) => !query || matchesQuery(`${p.title} ${p.name} ${p.phone} ${p.posting} ${(idx.districtsOfPastor.get(p.id) || []).map((a) => idx.districtName(a.district_id)).join(' ')}`, query))
    .sort((a, b) => a.name.localeCompare(b.name)),
  [reg.pastors, idx, query, roleFilter, fieldFilter, placement, status]);

  const where = (p) => {
    const ds = idx.districtsOfPastor.get(p.id) || [];
    if (ds.length) return ds.map((a) => `${idx.districtName(a.district_id)}${a.kind === 'associado' ? ' (assoc.)' : ''}`).join(', ');
    return p.posting || '';
  };

  const exportCsv = () => downloadCsv('pastores', ['Título', 'Nome', 'Cargo', 'Campo', 'Província', 'Distrito / local', 'Telefone', 'Email', 'Estado'],
    rows.map((p) => [p.title, p.name, PASTOR_ROLES[p.role] || p.role, idx.fieldName(p.field_id), idx.provinceName(p.province_id), where(p), p.phone, p.email, p.status]));

  const save = async () => {
    if (!editing.name.trim()) throw new Error('Indique o nome.');
    const phone = editing.phone.replace(/\D/g, '').replace(/^244(?=9\d{8}$)/, '');
    await saveRecord('pastor', { ...editing, name: editing.name.trim(), phone, email: editing.email.trim().toLowerCase() });
    setEditing(null);
  };

  return (
    <div>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Nome, telefone, distrito…" />
        <NativeSelect value={roleFilter} onChange={setRoleFilter} className="w-auto">
          <option value="">Todos os cargos</option>
          {Object.entries(PASTOR_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
        <NativeSelect value={fieldFilter} onChange={setFieldFilter} className="w-auto">
          <option value="">Todos os campos</option>
          {reg.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </NativeSelect>
        <NativeSelect value={placement} onChange={setPlacement} className="w-auto">
          <option value="">Com ou sem distrito</option>
          <option value="with">Com distrito</option>
          <option value="without">Sem distrito</option>
        </NativeSelect>
        <NativeSelect value={status} onChange={setStatus} className="w-auto">
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="all">Todos</option>
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          {canEdit && <Button size="sm" onClick={() => setEditing({ ...EMPTY, field_id: fieldFilter || reg.fields[0]?.id || '' })}><Plus className="mr-1.5 h-4 w-4" />Novo pastor</Button>}
        </div>
      </Toolbar>

      <DataTable head={['Nome', 'Cargo', 'Distrito / local', 'Campo', 'Telefone', '']} count={rows.length}
        empty={reg.pastors.length ? 'Nenhum pastor com estes filtros.' : 'Ainda não há pastores. Use "Importar" ou "Novo pastor".'}>
        {rows.map((p) => (
          <tr key={p.id} className={p.status === 'activo' ? '' : 'opacity-60'}>
            <td className="px-3 py-2 font-medium">{p.title ? `${p.title} ` : ''}{p.name}</td>
            <td className="px-3 py-2">{PASTOR_ROLES[p.role] || p.role}</td>
            <td className="px-3 py-2">{where(p) || (p.role === 'pastor_distrital' ? <Pill tone="amber">sem distrito</Pill> : '—')}</td>
            <td className="px-3 py-2">{idx.fieldName(p.field_id) || '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">{p.phone ? <a href={`tel:+244${p.phone}`} className="hover:underline">{displayAngolaPhone(p.phone)}</a> : '—'}</td>
            <td className="px-3 py-2">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" title="Histórico" onClick={() => setHistory(p)}><History className="h-4 w-4" /></Button>
                {canEdit && <Button variant="ghost" size="icon" title="Fundir com outro registo" onClick={() => setMerge({ pastor: p, other: '' })}><GitMerge className="h-4 w-4" /></Button>}
                {canEdit && <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing({ ...EMPTY, ...p, field_id: p.field_id || '', province_id: p.province_id || '' })}><Pencil className="h-4 w-4" /></Button>}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar pastor' : 'Novo pastor'}</DialogTitle>
            <DialogDescription>O distrito atribui-se no separador Distritos (botão de transferir), para ficar no histórico.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                <FormField label="Título">
                  <NativeSelect value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })}>
                    {TITLES.map((t) => <option key={t} value={t}>{t || '(nenhum)'}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Nome *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Cargo">
                  <NativeSelect value={editing.role} onChange={(v) => setEditing({ ...editing, role: v })}>
                    {Object.entries(PASTOR_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Campo">
                  <NativeSelect value={editing.field_id} onChange={(v) => setEditing({ ...editing, field_id: v })}>
                    <option value="">— sem campo —</option>
                    {reg.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Província">
                  <NativeSelect value={editing.province_id} onChange={(v) => setEditing({ ...editing, province_id: v })}>
                    <option value="">— escolher —</option>
                    {reg.provinces.map((pv) => <option key={pv.id} value={pv.id}>{pv.name}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Local de serviço" hint="Quando não é um distrito (ex.: ISPAB, Livraria, Missão).">
                  <Input value={editing.posting} onChange={(e) => setEditing({ ...editing, posting: e.target.value })} maxLength={120} />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Telefone"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} inputMode="tel" placeholder="923 456 789" /></FormField>
                <FormField label="Email"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} maxLength={160} /></FormField>
              </div>
              <FormField label="Estado">
                <NativeSelect value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </NativeSelect>
              </FormField>
              <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id ? (
              <Button variant="ghost" className="text-destructive" onClick={() => run(async () => { await deleteRecord('pastor', editing.id); setEditing(null); }, 'Pastor apagado.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            ) : <span />}
            <Button onClick={() => run(save, 'Pastor guardado.')}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{history ? idx.pastorLabel(history.id) : ''}</DialogTitle>
            <DialogDescription>Distritos onde serviu e serve.</DialogDescription>
          </DialogHeader>
          {history && (
            <ul className="space-y-2 text-sm">
              {idx.historyOf(history.id).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="font-medium">{idx.districtName(a.district_id) || 'distrito apagado'} <Pill tone={a.kind === 'titular' ? 'green' : 'blue'}>{a.kind}</Pill></span>
                  <span className="text-muted-foreground">{a.start_date} → {a.end_date || 'actual'}</span>
                  {a.notes && <span className="w-full text-xs text-muted-foreground">{a.notes}</span>}
                </li>
              ))}
              {!idx.historyOf(history.id).length && <li className="text-muted-foreground">Sem atribuições registadas{history.posting ? ` (local de serviço: ${history.posting})` : ''}.</li>}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!merge} onOpenChange={(o) => !o && setMerge(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fundir registos repetidos</DialogTitle>
            <DialogDescription>
              Fica <strong>{merge ? idx.pastorLabel(merge.pastor.id) : ''}</strong>. As atribuições, as igrejas onde é delegado e os dados em falta passam do outro para este; o outro é apagado.
            </DialogDescription>
          </DialogHeader>
          {merge && (
            <FormField label="Registo a juntar a este">
              <NativeSelect value={merge.other} onChange={(v) => setMerge({ ...merge, other: v })}>
                <option value="">— escolher —</option>
                {reg.pastors.filter((p) => p.id !== merge.pastor.id).sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <option key={p.id} value={p.id}>{idx.pastorLabel(p.id)}{p.phone ? ` · ${p.phone}` : ''}</option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <DialogFooter>
            <Button variant="destructive" disabled={!merge?.other} onClick={() => run(async () => { await mergePastors(merge.pastor.id, merge.other); setMerge(null); }, 'Registos fundidos.')}>Fundir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
