// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { Eye, History, Loader2, RotateCcw, Save } from 'lucide-react';
import pb from '@/lib/dataClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { EDGE_FUNCTION_DESACTUALIZADA, isMissingRoute } from '@/lib/apiCompat';

const FIELDS = [
  { key: 'subject', label: 'Assunto', max: 150 },
  { key: 'title', label: 'Título', max: 150 },
  { key: 'subtitle', label: 'Subtítulo', max: 300 },
];

const EMPTY = { subject: '', title: '', subtitle: '', lead: '' };

const formatWhen = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Editor dos textos de um modelo de email, com histórico de versões.
 *
 * Só se edita o texto corrido (assunto, título, subtítulo, parágrafos). Os detalhes da
 * encomenda, os totais e os botões vêm sempre dos dados: são a prova da compra.
 *
 * Cada gravação é uma versão nova. "Repor" uma versão antiga grava-a outra vez como a mais
 * recente, e por isso também se pode desfazer. A pré-visualização do rascunho passa pelo
 * servidor, pelas mesmas funções que enviam.
 */
export default function EmailTextEditor({ templateKey, onDraftPreview, onSaved }) {
  const { toast } = useToast();
  const [info, setInfo] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await pb.send(`/admin/email/template?key=${encodeURIComponent(templateKey)}`);
      setInfo(res);
      setDraft({ ...res.original, ...(res.current || {}) });
      setNote('');
    } catch (err) {
      setError(isMissingRoute(err) ? EDGE_FUNCTION_DESACTUALIZADA : (err.message || 'Não foi possível carregar o texto.'));
    } finally {
      setLoading(false);
    }
  }, [templateKey]);

  useEffect(() => { load(); }, [load]);

  /** Só os campos diferentes do texto de origem: o resto continua a acompanhar o código. */
  const changes = () => {
    const out = {};
    for (const k of Object.keys(EMPTY)) {
      const v = (draft[k] || '').trim();
      if (v && v !== (info?.original?.[k] || '').trim()) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  };

  const previewDraft = async () => {
    setBusy('preview');
    try {
      const res = await pb.send('/admin/email/template/preview', { method: 'POST', body: { key: templateKey, content: changes() } });
      onDraftPreview?.(res);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Pré-visualização indisponível', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const act = async (kind, path, body, okTitle) => {
    setBusy(kind);
    try {
      const res = await pb.send(path, { method: 'POST', body });
      toast({ title: okTitle, description: res.message });
      await load();
      onSaved?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível gravar', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const save = () => act('save', '/admin/email/template/save', { key: templateKey, content: changes(), note }, 'Versão gravada');

  const resetToOriginal = () => {
    if (!confirm('Repor o texto de origem deste modelo?\n\nFica gravado como uma versão nova, e pode voltar à actual pelo histórico.')) return;
    act('reset', '/admin/email/template/save', { key: templateKey, content: null }, 'Texto de origem reposto');
  };

  const restore = (version) => {
    if (!confirm(`Voltar à versão ${version}?\n\nFica gravada como uma versão nova; a actual continua no histórico.`)) return;
    act(`restore-${version}`, '/admin/email/template/restore', { key: templateKey, version }, `Versão ${version} reposta`);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }
  if (error) {
    return <p className="p-4 text-sm text-destructive">{error}</p>;
  }

  const versions = info?.versions || [];

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold">Texto do modelo</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Os detalhes da encomenda, os totais e os botões vêm sempre dos dados. Separe os parágrafos com uma linha em branco.
          Deixar um campo como está mantém o texto de origem.
        </p>
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`tpl-${f.key}`}>{f.label}</Label>
          <Input
            id={`tpl-${f.key}`}
            value={draft[f.key] || ''}
            maxLength={f.max}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="tpl-lead">Parágrafos</Label>
        <Textarea
          id="tpl-lead"
          rows={6}
          maxLength={4000}
          value={draft.lead || ''}
          onChange={(e) => setDraft((d) => ({ ...d, lead: e.target.value }))}
        />
      </div>

      {info?.placeholders && (
        <div className="text-xs text-muted-foreground">
          <p className="mb-1">Marcadores que pode usar:</p>
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(info.placeholders).map(([k, label]) => (
              <li key={k} title={label} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{`{${k}}`}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tpl-note">Nota da versão (opcional)</Label>
        <Input id="tpl-note" value={note} maxLength={200} placeholder="Ex.: texto da campanha de Natal" onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={previewDraft} disabled={!!busy}>
          {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          <span className="ml-1.5">Pré-visualizar</span>
        </Button>
        <Button size="sm" onClick={save} disabled={!!busy}>
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-1.5">Gravar versão</span>
        </Button>
        {info?.current && (
          <Button size="sm" variant="ghost" onClick={resetToOriginal} disabled={!!busy}>
            {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            <span className="ml-1.5">Repor texto de origem</span>
          </Button>
        )}
      </div>

      <div className="border-t pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" />Versões</h4>
        {versions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Ainda sem versões: está em uso o texto de origem.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    Versão {v.version}
                    {i === 0 && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">em vigor</span>}
                    {!v.content && <span className="ml-2 text-xs font-normal text-muted-foreground">texto de origem</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ''}{v.note ? ` · ${v.note}` : ''}
                  </p>
                </div>
                {i > 0 && (
                  <Button size="sm" variant="outline" onClick={() => restore(v.version)} disabled={!!busy}>
                    {busy === `restore-${v.version}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    <span className="ml-1.5">Voltar a esta</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
