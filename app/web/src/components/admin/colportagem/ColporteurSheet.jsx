import React, { useEffect, useMemo, useState } from 'react';
import { Copy, MessageCircle, Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodeChip } from '@/components/admin/users/userFormat';
import { PRODUCT_TYPES } from '@/lib/productTypes';
import {
  createInvite, deleteCandidate, inviteLink, inviteWhatsApp, saveColporteur, setColporteurCategory, setColporteurStatus, setOverride, unlinkAccount,
} from '@/lib/colporteurApi';
import { CATEGORIES, SALE_MODES, STATUSES, STATUS_FLOW, inForce, resolvePct, today } from '@/lib/colporteurCommission';
import { FormField, NativeSelect, Pill, ProvinceMunicipality } from '@/components/admin/igreja/registryUi';
import ColporteurExtras from './ColporteurExtras';

const NEEDS_REASON = ['recusado', 'suspenso', 'inactivo'];
const ACTION_LABEL = { em_analise: 'Pôr em análise', activo: 'Aprovar', recusado: 'Recusar', suspenso: 'Suspender', inactivo: 'Desactivar', candidatura: 'Voltar a candidatura' };
const EVENT_TEXT = {
  candidatura: (d) => `Candidatura (pede ${CATEGORIES[d.requested_category]?.label || d.requested_category})`,
  estado: (d) => `→ ${STATUSES[d.to]?.label || d.to}${d.reason ? `: ${d.reason}` : ''}`,
  categoria: (d) => `Categoria ${CATEGORIES[d.from]?.label} → ${CATEGORIES[d.to]?.label}${d.reason ? `: ${d.reason}` : ''}`,
  convite: (d) => `Convite gerado (válido até ${new Date(d.expires_at).toLocaleDateString('pt-AO')})`,
  conta: (d) => (d.unlinked ? `Conta desligada${d.reason ? `: ${d.reason}` : ''}` : 'Conta ligada pelo colportor'),
  percentagem: (d) => `Percentagem própria ${d.sale_mode ? SALE_MODES[d.sale_mode]?.label : 'todos os modos'}${d.product_type ? ` · ${d.product_type}` : ''}: ${d.pct == null ? 'retirada' : `${d.pct}%`} desde ${d.from}${d.reason ? ` (${d.reason})` : ''}`,
  nota: () => 'Nota',
  cartao: (d) => (d.accao === 'reemitido' ? 'Cartão reemitido (o anterior deixou de valer)' : 'Cartão emitido'),
};

export default function ColporteurSheet({ colporteur: c, data, reg, idx, run, onClose }) {
  const [form, setForm] = useState(c);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(c.category);
  const [categoryReason, setCategoryReason] = useState('');
  const [invite, setInvite] = useState(null);
  const [ov, setOv] = useState({ saleMode: '', productType: '', pct: '', from: today(), reason: '' });
  useEffect(() => { setForm(c); setCategory(c.category); }, [c]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const events = data.events.filter((e) => e.colporteur_id === c.id);
  const overrides = data.overrides.filter((o) => o.colporteur_id === c.id);
  const activeOverrides = overrides.filter((o) => inForce(o) || String(o.valid_from) > today());
  const effective = useMemo(() => Object.fromEntries(Object.keys(SALE_MODES).map((m) => [m, resolvePct({
    category: c.category, saleMode: m, rules: data.rules, overrides, basePct: data.settings.base_pct,
  })])), [c.category, data.rules, overrides, data.settings.base_pct]);
  const church = idx.churchesById.get(form.church_id);
  const districtPastors = church?.district_id
    ? [idx.titularOf.get(church.district_id), ...(idx.associatesOf.get(church.district_id) || [])].filter(Boolean).map((a) => a.pastor_id)
    : [];
  const status = STATUSES[c.status] || {};

  const changeStatus = (to) => run(async () => {
    if (NEEDS_REASON.includes(to) && reason.trim().length < 3) throw new Error('Escreva o motivo antes.');
    const r = await setColporteurStatus(c.id, to, reason.trim());
    setReason('');
    return to === 'activo' && r?.code ? `Aprovado com o código ${r.code}. Gere o convite para ligar a conta.` : `Estado: ${STATUSES[to].label}.`;
  });

  const save = () => run(async () => {
    if (form.full_name.trim().length < 3) throw new Error('Nome em falta.');
    await saveColporteur({ ...form, credit_limit: form.credit_limit === '' ? null : form.credit_limit });
  }, 'Ficha guardada.');

  const genInvite = () => run(async () => {
    const r = await createInvite(c.id);
    setInvite(r);
    return 'Convite gerado. Envie-o pelo WhatsApp.';
  });

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* sem permissão */ } };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{c.full_name} <CodeChip code={c.code} /> <Pill tone={status.tone}>{status.label}</Pill></DialogTitle>
          <DialogDescription>
            {CATEGORIES[c.category]?.label}{c.start_date ? ` · desde ${new Date(c.start_date).toLocaleDateString('pt-AO')}` : ''} · candidatura de {new Date(c.created).toLocaleDateString('pt-AO')}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-xl border border-border p-4">
          <h3 className="font-semibold">Estado</h3>
          {(STATUS_FLOW[c.status] || []).some((s) => NEEDS_REASON.includes(s)) && (
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obrigatório para recusar, suspender ou desactivar)" maxLength={500} />
          )}
          <div className="flex flex-wrap gap-2">
            {(STATUS_FLOW[c.status] || []).map((to) => (
              <Button key={to} size="sm" variant={to === 'activo' ? 'default' : NEEDS_REASON.includes(to) ? 'outline' : 'secondary'} onClick={() => changeStatus(to)}>{ACTION_LABEL[to]}</Button>
            ))}
            {!c.code && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => run(async () => { await deleteCandidate(c.id); onClose(); }, 'Candidatura apagada.')}>
                <Trash2 className="mr-1.5 h-4 w-4" />Apagar
              </Button>
            )}
          </div>
          {(STATUS_FLOW[c.status] || []).includes('activo') && !c.code && !c.recommendation_ok && (
            <p className="text-sm text-amber-700 dark:text-amber-300">A recomendação do pastor ainda não está confirmada (ver Ficha, abaixo).</p>
          )}
          {c.status_reason && <p className="text-sm text-muted-foreground">Último motivo: {c.status_reason}</p>}
        </section>

        {c.status === 'activo' && (
          <section className="space-y-2 rounded-xl border border-border p-4">
            <h3 className="font-semibold">Conta do colportor</h3>
            {c.profile_id ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="green">ligada</Pill> O colportor entra em /colportor com a sua conta.
                <Button size="sm" variant="ghost" onClick={() => run(() => unlinkAccount(c.id, 'Desligada pela equipa'), 'Conta desligada.')}><Unlink className="mr-1.5 h-4 w-4" />Desligar</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Gere um convite de uso único e envie-o pelo WhatsApp. O colportor abre-o, entra (por exemplo com o Google) e a conta fica ligada a {c.code}.</p>
                <Button size="sm" onClick={genInvite}>Gerar convite</Button>
                {invite && (
                  <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                    <p className="break-all font-mono text-xs">{inviteLink(invite.token)}</p>
                    <p className="text-muted-foreground">Válido até {new Date(invite.expires_at).toLocaleDateString('pt-AO')}. Gerar outro invalida este.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(inviteLink(invite.token))}><Copy className="mr-1.5 h-4 w-4" />Copiar link</Button>
                      <Button size="sm" asChild><a href={inviteWhatsApp(c, invite.token)} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />Enviar por WhatsApp</a></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {c.code && <ColporteurExtras colporteur={c} run={run} />}

        <section className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="font-semibold">Ficha</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nome"><Input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} maxLength={120} /></FormField>
            <FormField label="Telefone"><Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></FormField>
            <FormField label="Email"><Input value={form.email} onChange={(e) => set({ email: e.target.value })} type="email" /></FormField>
            <FormField label="Igreja">
              <NativeSelect value={form.church_id || ''} onChange={(v) => set({ church_id: v })}>
                <option value="">— outra: {form.church_other || 'não indicada'} —</option>
                {[...reg.churches].sort((a, b) => a.name.localeCompare(b.name)).map((ch) => <option key={ch.id} value={ch.id}>{ch.name} · {idx.districtName(ch.district_id)}</option>)}
              </NativeSelect>
            </FormField>
          </div>
          <ProvinceMunicipality provinces={reg.provinces} municipalities={reg.municipalities} provinceId={form.province_id || ''} municipalityId={form.municipality_id || ''}
            onChange={(geo) => set(geo)} />
          <FormField label="Território" hint="Bairros ou localidades onde trabalha."><Input value={form.territory} onChange={(e) => set({ territory: e.target.value })} maxLength={300} /></FormField>
          {/* A loja do colportor (migração lojas_donas_dos_dados): por omissão a da província. Conta
              para «colportores por loja» no Resumo e diz de que loja são as guias dele. */}
          {'store_id' in form && (
            <FormField label="Loja" hint="Por omissão, a loja da província dele. As guias novas saem desta loja.">
              <NativeSelect value={form.store_id || ''} onChange={(v) => set({ store_id: v })}>
                <option value="">— sem loja —</option>
                {(data.stores || []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (inactiva)'}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {/* Entregas por colportor: a localização é ele que a regista, na sua área. */}
          {'accepts_deliveries' in form && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={!!form.accepts_deliveries} onCheckedChange={(v) => set({ accepts_deliveries: v })} />
                Recebe entregas de encomendas pagas perto dele
              </label>
              <span className="text-xs text-muted-foreground">
                {form.latitude != null
                  ? `Localização registada a ${new Date(form.location_updated_at).toLocaleDateString('pt-AO')}`
                  : 'Sem localização: entregas só pelo município e pela província'}
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Horas por semana"><Input type="number" min={0} max={80} value={form.weekly_hours ?? ''} onChange={(e) => set({ weekly_hours: e.target.value === '' ? '' : Number(e.target.value) })} /></FormField>
            <FormField label="Limite em consignação (Kz)" hint={`Vazio = ${Number(data.settings.default_credit_limit || 0).toLocaleString('pt-AO')} Kz`}>
              <Input type="number" min={0} value={form.credit_limit ?? ''} onChange={(e) => set({ credit_limit: e.target.value })} />
            </FormField>
            <FormField label="Escola (estudante)"><Input value={form.school} onChange={(e) => set({ school: e.target.value })} maxLength={120} /></FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Recomendado por">
              <NativeSelect value={form.recommended_by_pastor_id || ''} onChange={(v) => set({ recommended_by_pastor_id: v })}>
                <option value="">— {form.recommended_by_name || 'ninguém indicado'} —</option>
                {districtPastors.length > 0 && <optgroup label="Pastores do distrito">{districtPastors.map((id) => <option key={id} value={id}>{idx.pastorLabel(id)}</option>)}</optgroup>}
                <optgroup label="Todos">{[...reg.pastors].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{idx.pastorLabel(p.id)}</option>)}</optgroup>
              </NativeSelect>
            </FormField>
            <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={!!form.recommendation_ok} onCheckedChange={(v) => set({ recommendation_ok: v })} />Recomendação confirmada com o pastor</label>
          </div>
          {c.motivation && <p className="rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">Motivação:</span> {c.motivation}</p>}
          <FormField label="Notas internas"><Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={2000} /></FormField>
          <Button size="sm" onClick={save}>Guardar ficha</Button>
        </section>

        {c.code && (
          <section className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">Categoria e percentagens</h3>
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Categoria" className="w-48">
                <NativeSelect value={category} onChange={setCategory}>
                  {Object.entries(CATEGORIES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
                </NativeSelect>
              </FormField>
              <Input className="w-auto flex-1" value={categoryReason} onChange={(e) => setCategoryReason(e.target.value)} placeholder="Motivo (ex.: reclassificação anual)" />
              <Button size="sm" variant="outline" disabled={category === c.category} onClick={() => run(() => setColporteurCategory(c.id, category, categoryReason), 'Categoria mudada.')}>Mudar</Button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {Object.entries(SALE_MODES).map(([k, m]) => (
                <div key={k} className="rounded-lg bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-bold tabular-nums">{effective[k].pct}%</p>
                  <p className="text-[11px] text-muted-foreground">{effective[k].source === 'excepcao' ? 'percentagem própria' : effective[k].source === 'regra' ? 'regra da categoria' : 'percentagem base'}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Percentagem própria (ganha às regras)</p>
              {activeOverrides.length > 0 ? (
                <ul className="mb-2 space-y-1 text-sm">
                  {activeOverrides.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                      <span>{o.sale_mode ? SALE_MODES[o.sale_mode].label : 'Todos os modos'}{o.product_type ? ` · ${PRODUCT_TYPES.find((t) => t.value === o.product_type)?.label || o.product_type}` : ''}: <strong>{Number(o.pct)}%</strong> desde {o.valid_from}{o.reason ? ` — ${o.reason}` : ''}</span>
                      <Button size="sm" variant="ghost" onClick={() => run(() => setOverride({ colporteurId: c.id, productType: o.product_type, saleMode: o.sale_mode, pct: null, from: today(), reason: 'Retirada' }), 'Percentagem própria retirada.')}>Retirar</Button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mb-2 text-sm text-muted-foreground">Nenhuma — segue as regras da categoria.</p>}
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_9rem]">
                <NativeSelect value={ov.saleMode} onChange={(v) => setOv({ ...ov, saleMode: v })}>
                  <option value="">Todos os modos</option>
                  {Object.entries(SALE_MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </NativeSelect>
                <NativeSelect value={ov.productType} onChange={(v) => setOv({ ...ov, productType: v })}>
                  <option value="">Todos os produtos</option>
                  {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </NativeSelect>
                <Input type="number" min={0} max={100} step="0.5" placeholder="%" value={ov.pct} onChange={(e) => setOv({ ...ov, pct: e.target.value })} />
                <Input type="date" value={ov.from} onChange={(e) => setOv({ ...ov, from: e.target.value })} />
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="Motivo (ex.: líder de equipa)" maxLength={300} />
                <Button size="sm" disabled={ov.pct === ''} onClick={() => run(async () => {
                  await setOverride({ colporteurId: c.id, productType: ov.productType, saleMode: ov.saleMode, pct: ov.pct, from: ov.from, reason: ov.reason });
                  setOv({ saleMode: '', productType: '', pct: '', from: today(), reason: '' });
                }, 'Percentagem própria definida.')}>Definir</Button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border p-4">
          <h3 className="mb-2 font-semibold">Histórico</h3>
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2">
                <span>{(EVENT_TEXT[e.kind] || (() => e.kind))(e.detail || {})}</span>
                <span className="text-muted-foreground">{new Date(e.created).toLocaleString('pt-AO')}</span>
              </li>
            ))}
            {!events.length && <li className="text-muted-foreground">Sem registos.</li>}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
