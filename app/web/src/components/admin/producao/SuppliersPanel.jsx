// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, FormField, NativeSelect, Pill, SearchBox, Toolbar } from '@/components/admin/igreja/registryUi';
import { displayAngolaPhone, isValidAngolaPhone } from '@/lib/angolaPhone';
import { SUPPLIER_KINDS } from '@/lib/production';
import { deleteSupplier, saveSupplier } from '@/lib/productionApi';
import { normalizeForSearch } from '@/lib/searchUtils';
import { cn } from '@/lib/utils';

const EMPTY = { name: '', kind: 'grafica', nif: '', contact_name: '', phone: '', email: '', address: '', iban: '', notes: '', active: true };

/** Os fornecedores da produção: gráficas, papel, design, revisão, transporte. */
export default function SuppliersPanel({ data, canEdit, run }) {
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const q = normalizeForSearch(query);
  const list = data.suppliers.filter((s) => !q || normalizeForSearch([s.code, s.name, s.contact_name, s.nif, SUPPLIER_KINDS[s.kind]].join(' ')).includes(q));
  const uses = (id) => data.orders.filter((o) => o.supplier_id === id).length + data.costs.filter((c) => c.supplier_id === id).length;

  const save = async () => {
    if (editing.name.trim().length < 2) throw new Error('Indique o nome do fornecedor.');
    if (editing.phone.trim() && !isValidAngolaPhone(editing.phone)) throw new Error('O telefone não é um número angolano válido.');
    await saveSupplier({ ...editing, name: editing.name.trim() });
    setEditing(null);
    return editing.id ? 'Fornecedor guardado.' : 'Fornecedor criado.';
  };

  return (
    <div>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Nome, NIF, código…" />
        {canEdit && <Button size="sm" className="ml-auto" onClick={() => setEditing({ ...EMPTY })}><Plus className="mr-1.5 h-4 w-4" />Novo fornecedor</Button>}
      </Toolbar>
      <DataTable head={['Fornecedor', 'Tipo', 'Contacto', 'NIF', 'IBAN', '']} count={list.length}
        empty={data.suppliers.length ? 'Nenhum fornecedor com esta pesquisa.' : 'Ainda não há fornecedores. Comece pela gráfica.'}>
        {list.map((s) => (
          <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
            <td className="px-3 py-2">
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{s.code}</span>
              {!s.active && <span className="ml-2"><Pill>desactivado</Pill></span>}
            </td>
            <td className="px-3 py-2">{SUPPLIER_KINDS[s.kind]}</td>
            <td className="px-3 py-2 text-sm">
              {s.contact_name && <span className="block">{s.contact_name}</span>}
              <span className="text-muted-foreground">{[s.phone && displayAngolaPhone(s.phone), s.email].filter(Boolean).join(' · ') || '—'}</span>
            </td>
            <td className="px-3 py-2 tabular-nums">{s.nif || '—'}</td>
            <td className={cn('px-3 py-2 text-xs', s.iban && 'font-mono')}>{s.iban || '—'}</td>
            <td className="px-3 py-2 text-right">
              {canEdit && <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${s.name}`} onClick={() => setEditing({ ...EMPTY, ...s })}><Pencil className="h-4 w-4" /></Button>}
            </td>
          </tr>
        ))}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Editar ${editing.code}` : 'Novo fornecedor'}</DialogTitle>
            <DialogDescription>Mudar o IBAN fica no registo de segurança e avisa os administradores.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <FormField label="Nome *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></FormField>
                <FormField label="Tipo">
                  <NativeSelect value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v })}>
                    {Object.entries(SUPPLIER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Pessoa de contacto"><Input value={editing.contact_name} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} maxLength={120} /></FormField>
                <FormField label="NIF"><Input value={editing.nif} onChange={(e) => setEditing({ ...editing, nif: e.target.value })} maxLength={30} /></FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Telefone"><Input type="tel" inputMode="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="923 000 000" /></FormField>
                <FormField label="Email"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} maxLength={120} /></FormField>
              </div>
              <FormField label="Morada"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} maxLength={300} /></FormField>
              <FormField label="IBAN" hint="Para onde vão os pagamentos."><Input value={editing.iban} onChange={(e) => setEditing({ ...editing, iban: e.target.value })} maxLength={40} placeholder="AO06 …" /></FormField>
              <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />Activo (aparece nas escolhas)</label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing?.id && uses(editing.id) === 0 ? (
              <Button variant="ghost" className="text-destructive" onClick={() => confirm(`Apagar ${editing.name}?`) && run(async () => { await deleteSupplier(editing.id); setEditing(null); }, 'Fornecedor apagado.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            ) : <span />}
            <Button onClick={() => run(save)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
