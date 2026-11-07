import React, { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteRecord, downloadCsv, matchesQuery, saveRecord } from '@/lib/churchRegistryApi';
import { DataTable, FormField, NativeSelect, Pill, ProvinceMunicipality, SearchBox, Toolbar } from './registryUi';

const EMPTY = {
  cn: '', name: '', kind: 'igreja', district_id: '', province_id: '', municipality_id: '', address: '',
  delegate_name: '', delegate_pastor_id: '', congress_label: '', active: true, notes: '',
};
const KINDS = { igreja: 'Igreja', grupo: 'Grupo', companhia: 'Companhia' };

export default function ChurchesPanel({ reg, idx, canEdit, run }) {
  const [query, setQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null);

  const rows = useMemo(() => reg.churches
    .filter((c) => (status === 'all' ? true : status === 'active' ? c.active : !c.active))
    .filter((c) => !districtFilter || (districtFilter === '__none' ? !c.district_id : c.district_id === districtFilter))
    .filter((c) => !provinceFilter || c.province_id === provinceFilter)
    .filter((c) => !query || matchesQuery(`${c.cn || ''} ${c.name} ${idx.districtName(c.district_id)} ${idx.municipalityName(c.municipality_id)} ${c.delegate_name}`, query))
    .sort((a, b) => String(a.cn || '~').localeCompare(String(b.cn || '~'), undefined, { numeric: true }) || a.name.localeCompare(b.name)),
  [reg.churches, idx, query, districtFilter, provinceFilter, status]);

  const usedProvinces = reg.provinces.filter((p) => reg.churches.some((c) => c.province_id === p.id));
  const districtOptions = [...reg.districts].sort((a, b) => a.name.localeCompare(b.name));

  const exportCsv = () => downloadCsv('igrejas', ['Nº', 'Igreja', 'Tipo', 'Distrito', 'Campo', 'Província', 'Município', 'Morada', 'Delegado', 'Congresso', 'Activa'],
    rows.map((c) => [c.cn || '', c.name, KINDS[c.kind] || c.kind, idx.districtName(c.district_id), idx.fieldName(c.field_id),
      idx.provinceName(c.province_id), idx.municipalityName(c.municipality_id), c.address,
      c.delegate_pastor_id ? idx.pastorLabel(c.delegate_pastor_id) : c.delegate_name, c.congress_label, c.active ? 'sim' : 'não']));

  // Escolher o distrito sugere a província e o município dele, se ainda não houver.
  const pickDistrict = (id) => {
    const d = idx.districts.get(id);
    setEditing((e) => ({
      ...e, district_id: id,
      province_id: e.province_id || d?.province_id || '',
      municipality_id: e.municipality_id || (e.province_id && e.province_id !== d?.province_id ? '' : d?.municipality_id || ''),
    }));
  };

  const save = async () => {
    if (!editing.name.trim()) throw new Error('Indique o nome da igreja.');
    if (editing.cn && !/^[0-9A-Za-z-]{1,12}$/.test(editing.cn.trim())) throw new Error('O número da igreja só leva algarismos, letras e hífen (até 12).');
    await saveRecord('church', { ...editing, cn: editing.cn.trim() || null, name: editing.name.trim() });
    setEditing(null);
  };

  return (
    <div>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Nº, igreja, distrito, delegado…" />
        <NativeSelect value={districtFilter} onChange={setDistrictFilter} className="w-auto max-w-[14rem]">
          <option value="">Todos os distritos</option>
          <option value="__none">Sem distrito</option>
          {districtOptions.map((d) => <option key={d.id} value={d.id}>{d.name} · {idx.provinceName(d.province_id)}</option>)}
        </NativeSelect>
        <NativeSelect value={provinceFilter} onChange={setProvinceFilter} className="w-auto">
          <option value="">Todas as províncias</option>
          {usedProvinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={status} onChange={setStatus} className="w-auto">
          <option value="active">Activas</option>
          <option value="inactive">Desactivadas</option>
          <option value="all">Todas</option>
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          {canEdit && <Button size="sm" onClick={() => setEditing({ ...EMPTY, district_id: districtFilter && districtFilter !== '__none' ? districtFilter : '' })}><Plus className="mr-1.5 h-4 w-4" />Nova igreja</Button>}
        </div>
      </Toolbar>

      <DataTable head={['Nº', 'Igreja', 'Distrito', 'Província · Município', 'Delegado', '']} count={rows.length}
        empty={reg.churches.length ? 'Nenhuma igreja com estes filtros.' : 'Ainda não há igrejas. Use "Importar" ou "Nova igreja".'}>
        {rows.map((c) => (
          <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
            <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.cn || '—'}</td>
            <td className="px-3 py-2 font-medium">{c.name}{c.kind !== 'igreja' && <span className="ml-2"><Pill tone="blue">{KINDS[c.kind]}</Pill></span>}{!c.active && <span className="ml-2"><Pill>desactivada</Pill></span>}</td>
            <td className="px-3 py-2">{idx.districtName(c.district_id) || <Pill tone="amber">sem distrito</Pill>}</td>
            <td className="px-3 py-2">{idx.provinceName(c.province_id)}{c.municipality_id ? ` · ${idx.municipalityName(c.municipality_id)}` : ''}</td>
            <td className="px-3 py-2">{c.delegate_pastor_id ? idx.pastorLabel(c.delegate_pastor_id) : (c.delegate_name || '—')}</td>
            <td className="px-3 py-2 text-right">
              {canEdit && <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing({
                ...EMPTY, ...c, cn: c.cn || '', district_id: c.district_id || '', province_id: c.province_id || '',
                municipality_id: c.municipality_id || '', delegate_pastor_id: c.delegate_pastor_id || '',
              })}><Pencil className="h-4 w-4" /></Button>}
            </td>
          </tr>
        ))}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar igreja' : 'Nova igreja'}</DialogTitle>
            <DialogDescription>O campo da igreja é sempre o do distrito.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <FormField label="Nº"><Input value={editing.cn} onChange={(e) => setEditing({ ...editing, cn: e.target.value })} maxLength={12} placeholder="001" /></FormField>
                <FormField label="Nome *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Tipo">
                  <NativeSelect value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v })}>
                    {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Distrito">
                  <NativeSelect value={editing.district_id} onChange={pickDistrict}>
                    <option value="">— sem distrito —</option>
                    {districtOptions.map((d) => <option key={d.id} value={d.id}>{d.name} · {idx.provinceName(d.province_id)}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
              <ProvinceMunicipality provinces={reg.provinces} municipalities={reg.municipalities}
                provinceId={editing.province_id} municipalityId={editing.municipality_id}
                onChange={(geo) => setEditing({ ...editing, ...geo })} />
              <FormField label="Morada"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} maxLength={300} /></FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Delegado (pastor)">
                  <NativeSelect value={editing.delegate_pastor_id} onChange={(v) => setEditing({ ...editing, delegate_pastor_id: v })}>
                    <option value="">— outro / sem —</option>
                    {[...reg.pastors].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{idx.pastorLabel(p.id)}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Delegado (nome)" hint="Quando não é um pastor do registo.">
                  <Input value={editing.delegate_name} onChange={(e) => setEditing({ ...editing, delegate_name: e.target.value })} maxLength={120} />
                </FormField>
              </div>
              <FormField label="Congresso"><Input value={editing.congress_label} onChange={(e) => setEditing({ ...editing, congress_label: e.target.value })} maxLength={60} placeholder="11-13-SET" /></FormField>
              <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />Activa</label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id ? (
              <Button variant="ghost" className="text-destructive" onClick={() => run(async () => { await deleteRecord('church', editing.id); setEditing(null); }, 'Igreja apagada.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            ) : <span />}
            <Button onClick={() => run(save, 'Igreja guardada.')}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
