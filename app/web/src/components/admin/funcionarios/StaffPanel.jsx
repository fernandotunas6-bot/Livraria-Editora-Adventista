// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, FormField, NativeSelect, Pill, SearchBox, Toolbar } from '@/components/admin/igreja/registryUi';
import { displayAngolaPhone, isValidAngolaPhone } from '@/lib/angolaPhone';
import { kwanza } from '@/lib/money';
import { DEPARTMENTS, STAFF_STATUS } from '@/lib/production';
import { deleteStaff, savePayProfile, saveStaff } from '@/lib/productionApi';
import { normalizeForSearch } from '@/lib/searchUtils';

const EMPTY = {
  full_name: '', job_title: '', department: 'loja', store_id: '', phone: '', email: '', hired_on: '', left_on: '', status: 'activo', notes: '', profile_id: '',
};
const EMPTY_PAY = { base_salary: '', allowances: '', iban: '', nif: '', notes: '' };
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-AO') : '');

/** As fichas dos funcionários. As finanças vêem e mudam também o salário, o IBAN e o NIF. */
export default function StaffPanel({ data, canEdit, canSeePay, run }) {
  const [editing, setEditing] = useState(null);
  const [pay, setPay] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('trabalham');
  const payOf = (id) => data.pay.find((p) => p.staff_id === id);
  const storeName = (id) => data.stores.find((s) => s.id === id)?.name || '';
  const account = (id) => data.accounts.find((a) => a.id === id);

  const q = normalizeForSearch(query);
  const list = data.staff
    .filter((s) => (status === 'trabalham' ? s.status !== 'saiu' : status === 'todos' ? true : s.status === status))
    .filter((s) => !q || normalizeForSearch([s.code, s.full_name, s.job_title, s.email, s.phone, DEPARTMENTS[s.department], storeName(s.store_id)].join(' ')).includes(q));

  const open = (s) => {
    setEditing(s ? { ...EMPTY, ...s, store_id: s.store_id || '', profile_id: s.profile_id || '', hired_on: s.hired_on || '', left_on: s.left_on || '' } : { ...EMPTY });
    const p = s ? payOf(s.id) : null;
    setPay(p ? { ...EMPTY_PAY, ...p, base_salary: String(p.base_salary), allowances: String(p.allowances) } : { ...EMPTY_PAY });
  };

  const save = async () => {
    const e = editing;
    if (canEdit) {
      if (e.full_name.trim().length < 3) throw new Error('Indique o nome completo.');
      if (e.phone.trim() && !isValidAngolaPhone(e.phone)) throw new Error('O telefone não é um número angolano válido.');
      if (e.left_on && e.hired_on && e.left_on < e.hired_on) throw new Error('A saída não pode ser antes da admissão.');
    }
    const saved = canEdit ? await saveStaff({ ...e, full_name: e.full_name.trim() }) : e;
    // O salário só vai quando as finanças o mexeram (ou já existia): uma ficha nova sem salário não
    // cria uma linha a zeros.
    if (canSeePay && (payOf(saved.id) || pay.base_salary !== '' || pay.allowances !== '' || pay.iban || pay.nif)) {
      await savePayProfile({ ...pay, staff_id: saved.id });
    }
    setEditing(null);
    return e.id ? 'Ficha guardada.' : `Ficha ${saved.code} criada.`;
  };

  // Contas da equipa ainda sem ficha (ou a desta).
  const freeAccounts = data.accounts.filter((a) => !data.staff.some((s) => s.profile_id === a.id && s.id !== editing?.id));

  return (
    <div>
      <Toolbar>
        <NativeSelect value={status} onChange={setStatus} className="w-auto sm:w-48" aria-label="Que pessoas mostrar">
          <option value="trabalham">A trabalhar</option>
          {Object.entries(STAFF_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="todos">Todos</option>
        </NativeSelect>
        <SearchBox value={query} onChange={setQuery} placeholder="Nome, cargo, código…" />
        {canEdit && <Button size="sm" className="ml-auto" onClick={() => open(null)}><Plus className="mr-1.5 h-4 w-4" />Nova ficha</Button>}
      </Toolbar>
      <DataTable
        head={['Funcionário', 'Cargo', 'Loja', 'Contacto', 'Estado', ...(canSeePay ? ['Salário'] : []), '']}
        count={list.length}
        empty={data.staff.length ? 'Ninguém com este filtro.' : 'Ainda não há fichas. Cada pessoa que trabalha na livraria ou na Editora — com ou sem conta no painel — tem uma.'}
      >
        {list.map((s) => {
          const st = STAFF_STATUS[s.status];
          const p = payOf(s.id);
          const acc = account(s.profile_id);
          return (
            <tr key={s.id} className={s.status === 'saiu' ? 'opacity-60' : ''}>
              <td className="px-3 py-2">
                <span className="font-medium">{s.full_name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{s.code}</span>
                {acc && <span className="block text-xs text-muted-foreground">Conta no painel: {acc.email}</span>}
              </td>
              <td className="px-3 py-2">{s.job_title || '—'}<span className="block text-xs text-muted-foreground">{DEPARTMENTS[s.department]}</span></td>
              <td className="px-3 py-2">{storeName(s.store_id) || '—'}</td>
              <td className="px-3 py-2 text-sm text-muted-foreground">{[s.phone && displayAngolaPhone(s.phone), s.email].filter(Boolean).join(' · ') || '—'}</td>
              <td className="px-3 py-2">
                <Pill tone={st.tone}>{st.label}</Pill>
                {s.status === 'saiu' && s.left_on && <span className="block text-xs text-muted-foreground">em {fmtDate(s.left_on)}</span>}
              </td>
              {canSeePay && <td className="px-3 py-2 tabular-nums">{p && Number(p.base_salary) > 0 ? kwanza(Number(p.base_salary) + Number(p.allowances || 0)) : <span className="text-muted-foreground">—</span>}</td>}
              <td className="px-3 py-2 text-right">
                {(canEdit || canSeePay) && <Button variant="ghost" size="icon" title="Abrir a ficha" aria-label={`Abrir a ficha de ${s.full_name}`} onClick={() => open(s)}><Pencil className="h-4 w-4" /></Button>}
              </td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? `${editing.full_name} · ${editing.code}` : 'Nova ficha de funcionário'}</DialogTitle>
            <DialogDescription>
              {canEdit ? 'O código FUN- é dado ao gravar; quem tem conta no painel fica com o mesmo código da conta.' : 'Só as finanças: a ficha lê-se; o salário e os dados de pagamento mudam-se aqui.'}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <fieldset disabled={!canEdit} className="space-y-3">
                <FormField label="Nome completo *"><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} maxLength={120} /></FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Cargo"><Input value={editing.job_title} onChange={(e) => setEditing({ ...editing, job_title: e.target.value })} maxLength={80} placeholder="Vendedora, paginador, estafeta…" /></FormField>
                  <FormField label="Departamento">
                    <NativeSelect value={editing.department} onChange={(v) => setEditing({ ...editing, department: v })}>
                      {Object.entries(DEPARTMENTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </NativeSelect>
                  </FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Loja">
                    <NativeSelect value={editing.store_id} onChange={(v) => setEditing({ ...editing, store_id: v })}>
                      <option value="">— nenhuma —</option>
                      {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </NativeSelect>
                  </FormField>
                  <FormField label="Estado">
                    <NativeSelect value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })}>
                      {Object.entries(STAFF_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </NativeSelect>
                  </FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Telefone"><Input type="tel" inputMode="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="923 000 000" /></FormField>
                  <FormField label="Email"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} maxLength={120} /></FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Admissão"><Input type="date" value={editing.hired_on} onChange={(e) => setEditing({ ...editing, hired_on: e.target.value })} /></FormField>
                  <FormField label="Saída" hint={editing.status === 'saiu' && !editing.left_on ? 'Vazia: fica a de hoje.' : ''}><Input type="date" value={editing.left_on} onChange={(e) => setEditing({ ...editing, left_on: e.target.value })} /></FormField>
                </div>
                <FormField label="Conta no painel" hint="Se a pessoa usa o painel: liga a ficha à conta (o mesmo código FUN-, e vê as suas etapas da produção).">
                  <NativeSelect value={editing.profile_id} onChange={(v) => setEditing({ ...editing, profile_id: v })}>
                    <option value="">— sem conta —</option>
                    {freeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.email} · {a.email}{a.staff_code ? ` (${a.staff_code})` : ''}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Notas"><Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
              </fieldset>

              {canSeePay && pay && (
                <fieldset className="space-y-3 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Salário e pagamento <span className="font-normal text-muted-foreground">(só finanças)</span></legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Salário base (Kz/mês)"><Input type="number" inputMode="decimal" min={0} step="0.01" value={pay.base_salary} onChange={(e) => setPay({ ...pay, base_salary: e.target.value })} /></FormField>
                    <FormField label="Subsídios fixos (Kz/mês)"><Input type="number" inputMode="decimal" min={0} step="0.01" value={pay.allowances} onChange={(e) => setPay({ ...pay, allowances: e.target.value })} /></FormField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="IBAN"><Input value={pay.iban} onChange={(e) => setPay({ ...pay, iban: e.target.value })} maxLength={40} placeholder="AO06 …" /></FormField>
                    <FormField label="NIF"><Input value={pay.nif} onChange={(e) => setPay({ ...pay, nif: e.target.value })} maxLength={30} /></FormField>
                  </div>
                  <p className="text-xs text-muted-foreground">Mudar o salário ou o IBAN fica no registo de segurança e avisa os administradores.</p>
                </fieldset>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {canEdit && editing?.id ? (
              <Button variant="ghost" className="text-destructive" onClick={() => confirm(`Apagar a ficha de ${editing.full_name}? Para quem deixou de trabalhar, use o estado "Saiu".`)
                && run(async () => { await deleteStaff(editing.id); setEditing(null); }, 'Ficha apagada.')}>
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
