// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Pencil, Plus, RefreshCw, Rocket, Send, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CURRENT_VERSION, fetchPublishedVersion } from '@/lib/appVersion';
import {
  NOTES_MAX, TITLE_MAX, deleteRelease, listAllReleases, noteLines, notifyRelease, publishRelease, releaseDevices,
  releaseDraft, releaseStatus, saveRelease,
} from '@/lib/appReleases';

const STATUS_CLASS = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-sky-100 text-sky-800',
  published: 'bg-green-100 text-green-800',
  sending: 'bg-amber-100 text-amber-900',
  sent: 'bg-green-100 text-green-800',
};

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '');

/**
 * Painel → Sistema → Versões da app.
 *
 * A app já avisa sozinha "Nova versão disponível" a cada publicação do site. Aqui a equipa conta
 * o que mudou — aparece em /novidades e no aviso "App actualizada" — e, quando valer a pena,
 * avisa por push todos os aparelhos com notificações ligadas (uma vez por novidade). Regras na
 * migração 20261108150000_versoes_da_app e na Edge Function (/admin/releases/notify).
 */
export default function ReleasesTab() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirmPush, setConfirmPush] = useState(null);
  const [devices, setDevices] = useState(null);
  const [published, setPublished] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: rows, missing: noTable } = await listAllReleases();
      setItems(rows);
      setMissing(noTable);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar', description: e.message });
    } finally {
      setLoading(false);
    }
    releaseDevices().then(setDevices);
    fetchPublishedVersion().then((v) => setPublished(v || ''));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Enquanto um envio corre, o painel acompanha-o sozinho.
  const sending = items.some((r) => releaseStatus(r).key === 'sending');
  useEffect(() => {
    if (!sending) return undefined;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [sending, load]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const draft = form ? releaseDraft(form) : null;
  // Já publicada: gravar corrige o texto (continua publicada; o aviso por push não se repete).
  const editingPublished = !!(form?.id && items.find((r) => r.id === form.id)?.published_at);
  const formError = form && form.title.trim() ? draft?.error || '' : '';

  const act = async (row, fn, ok) => {
    setBusy(row.id);
    try {
      const out = await fn();
      toast({ title: ok, description: typeof out?.message === 'string' ? out.message : undefined });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: e.message });
    } finally {
      setBusy('');
    }
  };

  const submit = async (e, { publish = false } = {}) => {
    e?.preventDefault?.();
    if (!draft?.data) return;
    setSaving(true);
    try {
      let saved = await saveRelease(form.id, draft.data);
      if (publish && !saved.published_at) saved = await publishRelease(saved.id);
      toast({
        title: publish ? 'Novidades publicadas' : editingPublished ? 'Novidades corrigidas' : 'Rascunho gravado',
        description: publish ? 'Já aparecem em /novidades.' : undefined,
      });
      setForm(null);
      await load();
      if (publish && devices?.push_enabled) setConfirmPush(saved);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível gravar', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const sendPush = async () => {
    const row = confirmPush;
    setConfirmPush(null);
    if (row) await act(row, () => notifyRelease(row.id), 'Aviso por push pedido');
  };

  if (missing) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        As versões da app precisam da migração <code>20261108150000_versoes_da_app</code>, que é aplicada na próxima publicação da base de dados.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A app avisa sozinha "Nova versão disponível" sempre que o site é publicado. Aqui conta o que mudou e, se quiser, avisa todos os telemóveis.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button size="sm" onClick={() => setForm({ version: published || (CURRENT_VERSION === 'dev' ? '' : CURRENT_VERSION), title: '', notes: '' })}>
            <Plus className="mr-1.5 h-4 w-4" /> Novas novidades
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" /> Versão no site
          </p>
          <p className="font-mono text-sm">{published || '—'}</p>
          <p className="text-xs text-muted-foreground">
            {published && CURRENT_VERSION !== 'dev' && published !== CURRENT_VERSION
              ? 'Este painel está numa versão anterior: recarregue a página.'
              : 'Quem tem a app aberta numa versão anterior recebe o aviso para actualizar.'}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Aparelhos com notificações
          </p>
          {devices ? (
            <>
              <p className="text-sm"><strong>{devices.app_updates}</strong> recebem as novidades (de {devices.devices} com notificações)</p>
              {!devices.push_enabled && <p className="text-xs text-destructive">As notificações push estão desligadas: Configurações → Email, push e chat.</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ainda não há novidades. Escreva as primeiras em "Novas novidades".</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const status = releaseStatus(row);
            const lines = noteLines(row.notes);
            const canPush = status.key === 'published' && devices?.push_enabled;
            return (
              <li key={row.id} className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.version ? `v${row.version} · ` : ''}
                      {row.published_at ? `publicada ${when(row.published_at)}` : `criada ${when(row.created)}`}
                      {row.push_failed ? ` · ${row.push_failed} sem entrega` : ''}
                    </p>
                    {lines.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
                        {lines.slice(0, 4).map((l, i) => <li key={i}>{l}</li>)}
                        {lines.length > 4 && <li className="list-none text-muted-foreground">… e mais {lines.length - 4}</li>}
                      </ul>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status.key]}`}>{status.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {!row.published_at && (
                    <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => act(row, () => publishRelease(row.id), 'Novidades publicadas')}>
                      <Send className="mr-1.5 h-4 w-4" /> Publicar
                    </Button>
                  )}
                  {canPush && (
                    <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => setConfirmPush(row)}>
                      <BellRing className="mr-1.5 h-4 w-4" /> Avisar todos por push
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Editar" onClick={() => setForm({ id: row.id, version: row.version || '', title: row.title, notes: row.notes || '' })}>
                    <Pencil className="h-4 w-4" /><span className="sr-only">Editar</span>
                  </Button>
                  {!row.push_requested_at && (
                    <Button
                      size="sm" variant="ghost" className="text-destructive" disabled={busy === row.id} title="Apagar"
                      onClick={() => { if (window.confirm('Apagar estas novidades?')) act(row, () => deleteRelease(row.id), 'Novidades apagadas'); }}
                    >
                      <Trash2 className="h-4 w-4" /><span className="sr-only">Apagar</span>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(open) => { if (!open) setForm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <form onSubmit={(e) => submit(e)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{form.id ? 'Editar novidades' : 'Novas novidades'}</DialogTitle>
                <DialogDescription>O que mudou, em palavras simples: é o que o cliente lê no telemóvel.</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="versao-titulo">Título</Label>
                <Input
                  id="versao-titulo" maxLength={TITLE_MAX} value={form.title} required
                  placeholder="ex.: Entrar mais rápido e aviso de versão nova"
                  onChange={(e) => set('title', e.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">{form.title.trim().length}/{TITLE_MAX}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="versao-notas">O que mudou (uma novidade por linha)</Label>
                <Textarea
                  id="versao-notas" rows={6} maxLength={NOTES_MAX} value={form.notes}
                  placeholder={'A app entra sozinha na sua conta ao abrir\nO ecrã de entrada já sabe quem é\nAvisamos quando há uma versão nova'}
                  onChange={(e) => set('notes', e.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">{form.notes.length}/{NOTES_MAX}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="versao-numero">Versão (opcional)</Label>
                <Input id="versao-numero" className="font-mono" value={form.version} placeholder="2026.11.08-ab12cd3" onChange={(e) => set('version', e.target.value)} />
                <p className="text-xs text-muted-foreground">Vem preenchida com a versão que está no site.</p>
              </div>

              {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                {editingPublished ? (
                  <Button type="submit" disabled={saving || !draft?.data}>
                    {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Gravar
                  </Button>
                ) : (
                  <>
                    <Button type="submit" variant="outline" disabled={saving || !draft?.data}>Gravar rascunho</Button>
                    <Button type="button" disabled={saving || !draft?.data} onClick={(e) => submit(e, { publish: true })}>
                      {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Publicar
                    </Button>
                  </>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmPush} onOpenChange={(open) => { if (!open) setConfirmPush(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Avisar todos por push?</DialogTitle>
            <DialogDescription>
              Vai chegar a {devices?.app_updates ?? 'todos os'} aparelho(s) com notificações ligadas: "Nova versão da app — {confirmPush?.title}".
              Só se pode avisar uma vez por novidade: guarde-o para as mudanças que interessam aos clientes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPush(null)}>Agora não</Button>
            <Button onClick={sendPush}><BellRing className="mr-1.5 h-4 w-4" /> Avisar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
