import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SiteNoticeBar from '@/components/SiteNoticeBar';
import { useToast } from '@/hooks/use-toast';
import { isMissingTable } from '@/lib/communityApi';
import { deleteNotice, loadAllNotices, saveNotice } from '@/lib/siteNoticesApi';
import {
  LABEL_MAX, MESSAGE_MAX, NOTICE_TONES, fromLocalInput, noticeFormError, noticeStatus, noticeTone, pickNotice, toLocalInput,
} from '@/lib/siteNotices';

const EMPTY = { message: '', link_url: '', link_label: '', tone: 'info', dismissible: true, active: true, starts_at: '', ends_at: '' };

const STATUS = {
  live: { label: 'No ar', className: 'bg-green-100 text-green-800' },
  scheduled: { label: 'Agendado', className: 'bg-sky-100 text-sky-800' },
  ended: { label: 'Terminou', className: 'bg-muted text-muted-foreground' },
  off: { label: 'Desligado', className: 'bg-muted text-muted-foreground' },
};

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '');

/**
 * Painel → Sistema → Faixa de aviso: avisos curtos no topo de todas as páginas da loja.
 * O site mostra um de cada vez (urgente, depois promoção, depois informação); com datas, a
 * equipa programa o aviso com antecedência. Regras na migração 20261106210000_faixa_de_aviso.
 */
export default function NoticesTab() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadAllNotices());
      setMissing(false);
    } catch (e) {
      if (isMissingTable(e)) setMissing(true);
      else toast({ variant: 'destructive', title: 'Não foi possível carregar', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // O que um visitante novo vê agora (sem avisos fechados).
  const showing = useMemo(() => pickNotice(items), [items]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const formError = form ? noticeFormError({ ...form, starts_at: fromLocalInput(form.starts_at), ends_at: fromLocalInput(form.ends_at) }) : '';

  const submit = async (event) => {
    event.preventDefault();
    if (formError) { toast({ variant: 'destructive', title: 'Falta corrigir', description: formError }); return; }
    setSaving(true);
    try {
      await saveNotice({
        ...form,
        message: form.message.trim(),
        link_url: form.link_url.trim(),
        link_label: form.link_url.trim() ? form.link_label.trim() : '',
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
      });
      toast({ title: form.id ? 'Aviso actualizado' : 'Aviso criado', description: 'O site mostra-o em até 5 minutos para quem já tinha a página aberta.' });
      setForm(null);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível gravar', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const act = async (row, fn, done) => {
    setBusy(row.id);
    try {
      await fn();
      toast({ title: done });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: e.message });
    } finally {
      setBusy('');
    }
  };

  if (missing) {
    return <p className="text-sm text-muted-foreground">A faixa de aviso ainda não está activa nesta base de dados (falta a migração <code>faixa_de_aviso</code>).</p>;
  }

  const preview = form ? {
    ...form,
    message: form.message.trim() || 'O texto do aviso aparece aqui.',
    link_url: form.link_url.trim(),
  } : null;

  return (
    <div className="space-y-4">
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui as acções. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Aparece um de cada vez: urgente, depois promoção, depois informação.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button size="sm" onClick={() => setForm({ ...EMPTY })}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo aviso
          </Button>
        </div>
      </div>

      {!loading && (
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">No site agora</p>
          {showing ? (
            <div className="overflow-hidden rounded-lg border"><SiteNoticeBar notice={showing} preview /></div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum aviso no ar: a faixa não aparece.</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ainda não há avisos. Crie o primeiro em "Novo aviso".</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const status = STATUS[noticeStatus(row)];
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <span className={`h-8 w-1.5 shrink-0 rounded-full ${noticeTone(row.tone).className}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{row.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {noticeTone(row.tone).label}
                    {row.link_url ? ` · link: ${row.link_url}` : ''}
                    {row.starts_at ? ` · de ${when(row.starts_at)}` : ''}
                    {row.ends_at ? ` · até ${when(row.ends_at)}` : ''}
                    {row.dismissible ? '' : ' · não se fecha'}
                    {showing?.id === row.id ? ' · é o que aparece agora' : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm" variant="ghost" disabled={busy === row.id}
                    onClick={() => act(row, () => saveNotice({ id: row.id, active: !row.active }), row.active ? 'Aviso desligado' : 'Aviso ligado')}
                    title={row.active ? 'Desligar' : 'Ligar'}
                  >
                    {row.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{row.active ? 'Desligar' : 'Ligar'}</span>
                  </Button>
                  <Button
                    size="sm" variant="ghost" title="Editar"
                    onClick={() => setForm({ ...EMPTY, ...row, starts_at: toLocalInput(row.starts_at), ends_at: toLocalInput(row.ends_at) })}
                  >
                    <Pencil className="h-4 w-4" /><span className="sr-only">Editar</span>
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-destructive" disabled={busy === row.id} title="Apagar"
                    onClick={() => { if (window.confirm('Apagar este aviso?')) act(row, () => deleteNotice(row.id), 'Aviso apagado'); }}
                  >
                    <Trash2 className="h-4 w-4" /><span className="sr-only">Apagar</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(open) => { if (!open) setForm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{form.id ? 'Editar aviso' : 'Novo aviso'}</DialogTitle>
                <DialogDescription>Curto e directo: no telemóvel cabem duas linhas.</DialogDescription>
              </DialogHeader>

              <div className="overflow-hidden rounded-lg border" aria-hidden="true">
                <SiteNoticeBar notice={preview} preview />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aviso-texto">Aviso</Label>
                <Textarea
                  id="aviso-texto" rows={2} maxLength={MESSAGE_MAX} value={form.message} required
                  placeholder="ex.: A loja do Huambo fecha no feriado de 11 de Novembro."
                  onChange={(e) => set('message', e.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">{form.message.trim().length}/{MESSAGE_MAX}</p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Tom</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {NOTICE_TONES.map((t) => (
                    <label key={t.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${form.tone === t.value ? 'border-primary ring-1 ring-primary' : ''}`}>
                      <input type="radio" name="aviso-tom" className="mt-1" checked={form.tone === t.value} onChange={() => set('tone', t.value)} />
                      <span>
                        <span className={`mr-1 inline-block h-3 w-3 rounded-full align-middle ${t.className}`} aria-hidden="true" />
                        <strong>{t.label}</strong>
                        <span className="block text-xs text-muted-foreground">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aviso-link">Link (opcional)</Label>
                  <Input id="aviso-link" value={form.link_url} placeholder="/materiais ou https://…" onChange={(e) => set('link_url', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aviso-link-texto">Texto do link</Label>
                  <Input id="aviso-link-texto" value={form.link_label} maxLength={LABEL_MAX} placeholder="Saber mais" disabled={!form.link_url.trim()} onChange={(e) => set('link_label', e.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aviso-inicio">Começa (opcional)</Label>
                  <Input id="aviso-inicio" type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aviso-fim">Acaba (opcional)</Label>
                  <Input id="aviso-fim" type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Sem datas, fica no ar enquanto estiver ligado. As horas são as deste computador.</p>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Ligado
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.dismissible} onChange={(e) => set('dismissible', e.target.checked)} /> O visitante pode fechar
                </label>
              </div>

              {formError && form.message.trim() && <p className="text-sm text-destructive" role="alert">{formError}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Gravar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
