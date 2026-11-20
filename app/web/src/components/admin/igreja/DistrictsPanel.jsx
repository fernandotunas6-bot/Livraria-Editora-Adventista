// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Download, GitMerge, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  assignPastor, deleteRecord, downloadCsv, endAssignment, matchesQuery, mergeDistricts, saveRecord,
} from '@/lib/churchRegistryApi';
import { DataTable, FormField, NativeSelect, Pill, ProvinceMunicipality, SearchBox, Toolbar } from './registryUi';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { name: '', field_id: '', province_id: '', municipality_id: '', active: true, notes: '' };

export default function DistrictsPanel({ reg, idx, canEdit, run }) {
  const [query, setQuery] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [merge, setMerge] = useState(null);

  const rows = useMemo(() => reg.districts
    .filter((d) => (status === 'all' ? true : status === 'active' ? d.active : !d.active))
    .filter((d) => !fieldFilter || d.field_id === fieldFilter)
    .filter((d) => !provinceFilter || d.province_id === provinceFilter)
    .filter((d) => !query || matchesQuery(`${d.name} ${idx.pastorLabel(idx.titularOf.get(d.id)?.pastor_id)} ${idx.municipalityName(d.municipality_id)}`, query))
    .sort((a, b) => idx.provinceName(a.province_id).localeCompare(idx.provinceName(b.province_id)) || a.name.localeCompare(b.name)),
  [reg.districts, idx, query, fieldFilter, provinceFilter, status]);

  const usedProvinces = reg.provinces.filter((p) => reg.districts.some((d) => d.province_id === p.id));

  const exportCsv = () => downloadCsv('distritos', ['Distrito', 'Campo', 'Província', 'Município', 'Pastor titular', 'Associados', 'Igrejas', 'Activo'],
    rows.map((d) => [d.name, idx.fieldName(d.field_id), idx.provinceName(d.province_id), idx.municipalityName(d.municipality_id),
      idx.pastorLabel(idx.titularOf.get(d.id)?.pastor_id), (idx.associatesOf.get(d.id) || []).map((a) => idx.pastorLabel(a.pastor_id)).join('; '),
      idx.churchesOf.get(d.id) || 0, d.active ? 'sim' : 'não']));

  const save = async () => {
    if (!editing.name.trim()) throw new Error('Indique o nome do distrito.');
    await saveRecord('district', { ...editing, name: editing.name.trim() });
    setEditing(null);
  };

  return (
    <div>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Distrito, pastor, município…" />
        <NativeSelect value={fieldFilter} onChange={setFieldFilter} className="w-auto">
          <option value="">Todos os campos</option>
          {reg.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </NativeSelect>
        <NativeSelect value={provinceFilter} onChange={setProvinceFilter} className="w-auto">
          <option value="">Todas as províncias</option>
          {usedProvinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={status} onChange={setStatus} className="w-auto">
          <option value="active">Activos</option>
          <option value="inactive">Desactivados</option>
          <option value="all">Todos</option>
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          {canEdit && <Button size="sm" onClick={() => setEditing({ ...EMPTY, field_id: fieldFilter || reg.fields[0]?.id || '' })}><Plus className="mr-1.5 h-4 w-4" />Novo distrito</Button>}
        </div>
      </Toolbar>

      <DataTable head={['Distrito', 'Província · Município', 'Campo', 'Pastor titular', 'Igrejas', '']} count={rows.length}
        empty={reg.districts.length ? 'Nenhum distrito com estes filtros.' : 'Ainda não há distritos. Use "Importar" ou "Novo distrito".'}>
        {rows.map((d) => {
          const tit = idx.titularOf.get(d.id);
          const assoc = idx.associatesOf.get(d.id) || [];
          return (
            <tr key={d.id} className={d.active ? '' : 'opacity-60'}>
              <td className="px-3 py-2 font-medium">{d.name}{!d.active && <span className="ml-2"><Pill>desactivado</Pill></span>}</td>
              <td className="px-3 py-2">{idx.provinceName(d.province_id) || <Pill tone="amber">sem província</Pill>}{d.municipality_id ? ` · ${idx.municipalityName(d.municipality_id)}` : ''}</td>
              <td className="px-3 py-2">{idx.fieldName(d.field_id) || '—'}</td>
              <td className="px-3 py-2">
                {tit ? idx.pastorLabel(tit.pastor_id) : <Pill tone="amber">sem titular</Pill>}
                {assoc.length > 0 && <p className="text-xs text-muted-foreground">+ {assoc.map((a) => idx.pastorLabel(a.pastor_id)).join(', ')}</p>}
              </td>
              <td className="px-3 py-2 tabular-nums">{idx.churchesOf.get(d.id) || 0}</td>
              <td className="px-3 py-2">
                {canEdit && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Transferir / atribuir pastor" onClick={() => setTransfer({ district: d, pastor_id: '', kind: 'titular', start: today(), notes: '' })}><ArrowRightLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Fundir com outro distrito" onClick={() => setMerge({ district: d, other: '' })}><GitMerge className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing({ ...EMPTY, ...d, field_id: d.field_id || '', province_id: d.province_id || '', municipality_id: d.municipality_id || '' })}><Pencil className="h-4 w-4" /></Button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar distrito' : 'Novo distrito'}</DialogTitle>
            <DialogDescription>O nome pode repetir-se noutra província (ex.: "Distrito Centro" no Huambo e no Cuito).</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <FormField label="Nome *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></FormField>
              <FormField label="Campo">
                <NativeSelect value={editing.field_id} onChange={(v) => setEditing({ ...editing, field_id: v })}>
                  <option value="">— sem campo —</option>
                  {reg.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </NativeSelect>
              </FormField>
              <ProvinceMunicipality provinces={reg.provinces} municipalities={reg.municipalities}
                provinceId={editing.province_id} municipalityId={editing.municipality_id}
                onChange={(geo) => setEditing({ ...editing, ...geo })} />
              <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />Activo</label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id && !(idx.churchesOf.get(editing.id) > 0) ? (
              <Button variant="ghost" className="text-destructive" onClick={() => run(async () => { await deleteRecord('district', editing.id); setEditing(null); }, 'Distrito apagado.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            ) : <span />}
            <Button onClick={() => run(save, 'Distrito guardado.')}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transfer} onOpenChange={(o) => !o && setTransfer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pastores de {transfer?.district.name}</DialogTitle>
            <DialogDescription>Ao pôr um novo titular, o anterior sai na véspera da data escolhida. O histórico fica guardado.</DialogDescription>
          </DialogHeader>
          {transfer && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                {[idx.titularOf.get(transfer.district.id), ...(idx.associatesOf.get(transfer.district.id) || [])].filter(Boolean).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span>{idx.pastorLabel(a.pastor_id)} <Pill tone={a.kind === 'titular' ? 'green' : 'blue'}>{a.kind}</Pill> <span className="text-xs text-muted-foreground">desde {a.start_date}</span></span>
                    <Button variant="ghost" size="sm" onClick={() => run(() => endAssignment(a.id, today()), 'Atribuição terminada.')}><UserMinus className="mr-1 h-4 w-4" />Sai</Button>
                  </div>
                ))}
                {!idx.titularOf.get(transfer.district.id) && !(idx.associatesOf.get(transfer.district.id) || []).length && <p className="text-muted-foreground">Sem pastores atribuídos.</p>}
              </div>
              <FormField label="Pastor">
                <NativeSelect value={transfer.pastor_id} onChange={(v) => setTransfer({ ...transfer, pastor_id: v })}>
                  <option value="">— escolher —</option>
                  {[...reg.pastors].filter((p) => p.status === 'activo').sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                    <option key={p.id} value={p.id}>{idx.pastorLabel(p.id)}{(idx.districtsOfPastor.get(p.id) || []).length ? ` (em ${(idx.districtsOfPastor.get(p.id) || []).map((a) => idx.districtName(a.district_id)).join(', ')})` : ''}</option>
                  ))}
                </NativeSelect>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Como">
                  <NativeSelect value={transfer.kind} onChange={(v) => setTransfer({ ...transfer, kind: v })}>
                    <option value="titular">Titular</option>
                    <option value="associado">Associado</option>
                  </NativeSelect>
                </FormField>
                <FormField label="A partir de"><Input type="date" value={transfer.start} onChange={(e) => setTransfer({ ...transfer, start: e.target.value })} /></FormField>
              </div>
              <FormField label="Nota (opcional)"><Input value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} maxLength={500} placeholder="ex.: nomeação da comissão de 2026" /></FormField>
            </div>
          )}
          <DialogFooter>
            <Button disabled={!transfer?.pastor_id} onClick={() => run(async () => {
              await assignPastor({ districtId: transfer.district.id, pastorId: transfer.pastor_id, kind: transfer.kind, start: transfer.start, notes: transfer.notes });
              setTransfer(null);
            }, 'Pastor atribuído.')}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!merge} onOpenChange={(o) => !o && setMerge(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fundir distritos</DialogTitle>
            <DialogDescription>
              Fica <strong>{merge?.district.name}</strong>. As igrejas e os pastores do outro passam para este, e o outro é apagado. Não se desfaz.
            </DialogDescription>
          </DialogHeader>
          {merge && (
            <FormField label="Distrito a juntar a este">
              <NativeSelect value={merge.other} onChange={(v) => setMerge({ ...merge, other: v })}>
                <option value="">— escolher —</option>
                {reg.districts.filter((d) => d.id !== merge.district.id).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                  <option key={d.id} value={d.id}>{d.name} · {idx.provinceName(d.province_id)} ({idx.churchesOf.get(d.id) || 0} igrejas)</option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <DialogFooter>
            <Button variant="destructive" disabled={!merge?.other} onClick={() => run(async () => {
              const r = await mergeDistricts(merge.district.id, merge.other);
              setMerge(null);
              return `Fundido: ${r?.churches ?? 0} igrejas e ${r?.assignments ?? 0} atribuições passaram.`;
            })}>Fundir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
