// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Plus, Send, Star, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DUTIES, DUTY_LABELS, WEEK_DAYS, deleteTeam, loadRouting, loadTeams, saveOpsHours, saveTeam, sendTeamTest, setTeamMembers,
} from '@/lib/opsApi';

const EMPTY_TEAM = {
  name: '', store_id: '', duties: [], escalation_minutes: 30, notify_email: true, notify_whatsapp: false, notify_push: true, active: true,
};

const personName = (p) => p?.name || p?.email || 'Sem nome';

function TeamForm({ team, members, staff, stores, onCancel, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY_TEAM, ...team, store_id: team?.store_id || '' });
  const [picked, setPicked] = useState(() => new Map(members.map((m) => [m.profile_id, m.is_lead])));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDuty = (d) => set('duties', form.duties.includes(d) ? form.duties.filter((x) => x !== d) : [...form.duties, d]);
  const toggleMember = (id) => setPicked((m) => {
    const next = new Map(m);
    if (next.has(id)) next.delete(id); else next.set(id, false);
    return next;
  });
  const toggleLead = (id) => setPicked((m) => new Map(m).set(id, !m.get(id)));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveTeam(form);
      await setTeamMembers(saved.id, [...picked].map(([profile_id, is_lead]) => ({ profile_id, is_lead })));
      toast({ title: team?.id ? 'Equipa actualizada' : 'Equipa criada' });
      onSaved();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível guardar', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const noPhone = form.notify_whatsapp && [...picked.keys()].filter((id) => !String(staff.find((p) => p.id === id)?.phone || '').trim());

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Nome da equipa</span>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="Ex.: Loja do Huambo" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Loja</span>
          <select value={form.store_id} onChange={(e) => set('store_id', e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Nenhuma — equipa central (entregas e lojas sem equipa própria)</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active === false ? ' (inactiva)' : ''}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O que esta equipa trata</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DUTIES.map((d) => (
            <label key={d.value} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${form.duties.includes(d.value) ? 'border-primary bg-primary/5' : ''}`}>
              <input type="checkbox" checked={form.duties.includes(d.value)} onChange={() => toggleDuty(d.value)} className="mt-0.5" />
              <span><span className="font-medium">{d.label}</span><span className="block text-xs text-muted-foreground">{d.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Membros <span className="font-normal text-muted-foreground">(★ = responsável: recebe as escaladas)</span></legend>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há administradores nem gestores com "gerir encomendas". Crie-os em Utilizadores.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {staff.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${picked.has(p.id) ? 'border-primary bg-primary/5' : ''}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggleMember(p.id)} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{personName(p)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.role === 'admin' ? 'Administrador' : 'Gestor'}{p.phone ? ` · ${p.phone}` : ' · sem telefone'}</span>
                  </span>
                </label>
                {picked.has(p.id) && (
                  <button type="button" onClick={() => toggleLead(p.id)} aria-pressed={picked.get(p.id)} aria-label="Responsável" title="Responsável (recebe as escaladas)" className="rounded p-1 hover:bg-muted">
                    <Star className={`h-4 w-4 ${picked.get(p.id) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tempo para assumir (minutos de horário)</span>
          <Input type="number" min={5} max={1440} value={form.escalation_minutes} onChange={(e) => set('escalation_minutes', e.target.value)} />
          <span className="block text-xs text-muted-foreground">Passado este tempo sem ninguém assumir, sobe aos responsáveis e às urgências.</span>
        </label>
        <fieldset className="space-y-1.5 text-sm">
          <legend className="font-medium">Avisos fora do painel</legend>
          {[['notify_push', 'Notificação no telemóvel/computador (push)'], ['notify_email', 'Email'], ['notify_whatsapp', 'WhatsApp (precisa do telefone no perfil)']].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
          ))}
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.active !== false} onChange={(e) => set('active', e.target.checked)} /> Equipa activa</label>
        </fieldset>
      </div>
      {noPhone?.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {noPhone.length} membro(s) sem telefone no perfil não vão receber por WhatsApp.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} className="btn-primary">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar equipa</Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
      </div>
    </form>
  );
}

export default function OpsTeamsPanel({ canEdit = false }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [routing, setRouting] = useState(null);
  const [routingError, setRoutingError] = useState('');
  const [editing, setEditing] = useState(null);
  const [hours, setHours] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await loadTeams();
      setData(d);
      setHours(d.hours);
    } catch (err) {
      setError(/staff_teams|staff_ops_settings/.test(err.message || '')
        ? 'As equipas precisam da migração 20261107020000 aplicada no Supabase.'
        : err.message);
    }
    try {
      setRouting(await loadRouting());
      setRoutingError('');
    } catch (err) {
      setRoutingError(err?.status === 404 ? 'A Edge Function publicada ainda não tem esta vista. Publique a versão nova da função "app".' : err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const membersOf = useCallback((teamId) => (data?.members || []).filter((m) => m.team_id === teamId), [data]);
  const missingDuties = useMemo(() => {
    if (!data) return [];
    const active = data.teams.filter((t) => t.active);
    return DUTIES.filter((d) => !active.some((t) => t.duties.includes(d.value) && membersOf(t.id).length));
  }, [data, membersOf]);

  const remove = async (team) => {
    if (busy) return;
    if (!window.confirm(`Apagar a equipa "${team.name}"? Os avisos dela passam para as outras equipas com as mesmas funções (ou para quem gere encomendas).`)) return;
    setBusy(`del-${team.id}`);
    try {
      await deleteTeam(team.id);
      toast({ title: `Equipa "${team.name}" apagada` });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const test = async (team) => {
    setBusy(`test-${team.id}`);
    try {
      const r = await sendTeamTest(team.id);
      const ok = (r.results || []).map((x) => Object.entries(x.channels || {}).filter(([, v]) => v).map(([k]) => k)).flat();
      toast({
        title: 'Aviso de teste enviado',
        description: ok.length
          ? `Chegou por: ${[...new Set(ok)].join(', ')} (além do painel).`
          : 'Ficou no painel. Nenhum canal externo aceitou: verifique email (SMTP), WhatsApp e push nas Integrações.',
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Teste falhou', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const saveHours = async () => {
    setBusy('hours');
    try {
      await saveOpsHours(hours);
      toast({ title: 'Horário guardado' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setBusy('');
    }
  };

  if (error) return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  const storeName = (id) => data.stores.find((s) => s.id === id)?.name || 'Loja';

  return (
    <div className="space-y-6">
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui as acções. */}
      {canEdit && !editing && (
        <div className="flex justify-end">
          <Button type="button" className="btn-primary" onClick={() => setEditing({ ...EMPTY_TEAM })}><Plus className="mr-2 h-4 w-4" /> Nova equipa</Button>
        </div>
      )}

      {missingDuties.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Funções sem equipa com membros</p>
          <p className="mt-1">
            {missingDuties.map((d) => d.label).join(', ')}. Enquanto não houver, esses avisos vão para todos os que gerem encomendas
            {missingDuties.some((d) => d.value === 'urgent') ? ', e as escaladas para os administradores' : ''}.
          </p>
        </div>
      )}

      {editing && (
        <TeamForm
          team={editing}
          members={editing.id ? membersOf(editing.id) : []}
          staff={data.staff}
          stores={data.stores}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <section className="grid gap-3 lg:grid-cols-2">
        {data.teams.length === 0 && !editing && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground lg:col-span-2">
            <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
            Ainda não há equipas. Comece por uma por loja (receber encomendas, preparação, levantamentos), uma central
            (pagamentos, entregas), uma de atendimento e uma de urgências com os responsáveis.
          </div>
        )}
        {data.teams.map((t) => {
          const members = membersOf(t.id);
          return (
            <article key={t.id} className={`space-y-3 rounded-xl border bg-card p-4 ${t.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{t.name}{!t.active && ' (inactiva)'}</h3>
                  <p className="text-xs text-muted-foreground">{t.store_id ? storeName(t.store_id) : 'Central'} · assumir em {t.escalation_minutes} min</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Testar avisos" onClick={() => test(t)} disabled={!!busy}>
                      {busy === `test-${t.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Apagar" onClick={() => remove(t)} disabled={!!busy}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.duties.map((d) => <span key={d} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{DUTY_LABELS[d] || d}</span>)}
              </div>
              <p className="text-sm">
                {members.length
                  ? members.map((m) => {
                    const p = data.staff.find((s) => s.id === m.profile_id);
                    return `${m.is_lead ? '★ ' : ''}${personName(p)}`;
                  }).join(', ')
                  : <span className="text-destructive">Sem membros: ninguém recebe estes avisos por esta equipa.</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                Avisos: painel{t.notify_push ? ', push' : ''}{t.notify_email ? ', email' : ''}{t.notify_whatsapp ? ', WhatsApp' : ''}
              </p>
            </article>
          );
        })}
      </section>

      {hours && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="text-lg font-semibold">Horário de funcionamento (hora de Luanda)</h3>
          <p className="text-sm text-muted-foreground">
            O tempo para assumir só conta dentro deste horário. Fora dele, só os avisos críticos saem por email, WhatsApp e push; os outros saem à abertura.
            Um pedido em que a equipa respondeu e o cliente não volta a escrever recebe um aviso e fecha sozinho dois dias depois.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Abre às</span>
              <select disabled={!canEdit} value={hours.open_hour} onChange={(e) => setHours({ ...hours, open_hour: Number(e.target.value) })} className="h-10 rounded-md border bg-background px-3">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Fecha às</span>
              <select disabled={!canEdit} value={hours.close_hour} onChange={(e) => setHours({ ...hours, close_hour: Number(e.target.value) })} className="h-10 rounded-md border bg-background px-3">
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_DAYS.map(([d, label]) => {
                const on = (hours.open_days || []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on}
                    onClick={() => setHours({ ...hours, open_days: on ? hours.open_days.filter((x) => x !== d) : [...hours.open_days, d].sort() })}
                    className={`rounded-md border px-2.5 py-2 text-xs font-semibold ${on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Fechar pedidos sem resposta do cliente</span>
              <select
                disabled={!canEdit}
                value={hours.auto_close_days ?? 7}
                onChange={(e) => setHours({ ...hours, auto_close_days: Number(e.target.value) })}
                className="h-10 rounded-md border bg-background px-3"
              >
                <option value={0}>Nunca</option>
                {[3, 5, 7, 10, 14, 30].map((d) => <option key={d} value={d}>Ao fim de {d} dias (aviso {Math.max(d - 2, 1)} dias antes)</option>)}
              </select>
            </label>
            {canEdit && <Button type="button" variant="outline" onClick={saveHours} disabled={busy === 'hours'}>Guardar horário</Button>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Quem recebe o quê (com a configuração actual)</h3>
        {routingError && <p className="text-sm text-muted-foreground">{routingError}</p>}
        {routing && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Onde</th><th className="p-2">Assunto</th><th className="p-2">Recebe</th><th className="p-2">Se ninguém assumir</th></tr>
              </thead>
              <tbody>
                {routing.rows.map((r) => (
                  <tr key={`${r.store_id}-${r.duty}`} className="border-t align-top">
                    <td className="p-2 text-xs text-muted-foreground">{r.label}</td>
                    <td className="p-2">{DUTY_LABELS[r.duty] || r.duty}</td>
                    <td className="p-2">{r.recipients.map((p) => `${p.lead ? '★ ' : ''}${p.name}`).join(', ') || '—'}</td>
                    <td className="p-2">{r.escalation.map((p) => p.name).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t p-2 text-xs text-muted-foreground">
              WhatsApp {routing.whatsapp_configured ? 'configurado' : 'por configurar (Integrações)'} · push {routing.push_enabled ? 'activo' : 'desactivado (Configurações)'}.
              Os avisos aparecem sempre no painel, com som, para quem tem o painel aberto.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
