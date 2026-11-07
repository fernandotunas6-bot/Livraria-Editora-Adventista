import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FIELD_KINDS } from '@/lib/churchImport';
import { deleteRecord, saveRecord } from '@/lib/churchRegistryApi';
import { DataTable, FormField, NativeSelect, Pill, Toolbar } from './registryUi';

const EMPTY = { name: '', short_name: '', kind: 'missao', parent_id: '', active: true, notes: '' };

export default function FieldsPanel({ reg, idx, canEdit, run }) {
  const [editing, setEditing] = useState(null);
  const count = (fieldId, rows) => rows.filter((r) => r.field_id === fieldId).length;

  const save = async () => {
    if (!editing.name.trim()) throw new Error('Indique o nome do campo.');
    await saveRecord('field', { ...editing, name: editing.name.trim(), short_name: editing.short_name.trim() });
    setEditing(null);
  };

  return (
    <div>
      <Toolbar>
        <p className="text-sm text-muted-foreground">União, Associação ou Missão. Cada distrito pertence a um campo; um campo pode pertencer a outro (ex.: Missão → União).</p>
        {canEdit && <Button size="sm" className="ml-auto" onClick={() => setEditing({ ...EMPTY })}><Plus className="mr-1.5 h-4 w-4" />Novo campo</Button>}
      </Toolbar>
      <DataTable head={['Campo', 'Tipo', 'Pertence a', 'Distritos', 'Pastores', '']} empty='Ainda não há campos. A importação cria-os.'>
        {reg.fields.map((f) => (
          <tr key={f.id} className={f.active ? '' : 'opacity-60'}>
            <td className="px-3 py-2 font-medium">{f.name}{f.short_name && <span className="ml-1 text-muted-foreground">({f.short_name})</span>}{!f.active && <span className="ml-2"><Pill>desactivado</Pill></span>}</td>
            <td className="px-3 py-2">{FIELD_KINDS[f.kind] || f.kind}</td>
            <td className="px-3 py-2">{idx.fieldName(f.parent_id) || '—'}</td>
            <td className="px-3 py-2 tabular-nums">{count(f.id, reg.districts)}</td>
            <td className="px-3 py-2 tabular-nums">{count(f.id, reg.pastors)}</td>
            <td className="px-3 py-2 text-right">
              {canEdit && <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing({ ...EMPTY, ...f, parent_id: f.parent_id || '' })}><Pencil className="h-4 w-4" /></Button>}
            </td>
          </tr>
        ))}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar campo' : 'Novo campo'}</DialogTitle>
            <DialogDescription>Desactivar esconde-o das escolhas sem perder o histórico.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <FormField label="Nome *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></FormField>
                <FormField label="Sigla"><Input value={editing.short_name} onChange={(e) => setEditing({ ...editing, short_name: e.target.value })} maxLength={20} placeholder="MCA" /></FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Tipo">
                  <NativeSelect value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v })}>
                    {Object.entries(FIELD_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Pertence a">
                  <NativeSelect value={editing.parent_id} onChange={(v) => setEditing({ ...editing, parent_id: v })}>
                    <option value="">— nenhum —</option>
                    {reg.fields.filter((f) => f.id !== editing.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
              <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />Activo</label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id ? (
              <Button variant="ghost" className="text-destructive" onClick={() => run(async () => { await deleteRecord('field', editing.id); setEditing(null); }, 'Campo apagado.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            ) : <span />}
            <Button onClick={() => run(save, 'Campo guardado.')}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
