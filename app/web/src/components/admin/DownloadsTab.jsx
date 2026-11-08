import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ImageField from '@/components/admin/ImageField';
import { useToast } from '@/hooks/use-toast';
import {
  deleteDownload, getDownloadUrl, isMissingTable, loadAllDownloads, removePdf, saveDownload, uploadPdf,
} from '@/lib/downloadsApi';
import { DOWNLOAD_KINDS, downloadKindLabel, formatFileSize, pdfFileError, variantLabel } from '@/lib/downloads';

const EMPTY = {
  title: '', description: '', kind: 'revista', edition: '', cover: '', file_path: '', file_name: '', file_size: 0,
  access: 'free', book_id: '', variant: '', published: false, sort_order: 0,
};
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

/**
 * Painel → Catálogo → Materiais: PDFs para descarregar. Gratuitos (qualquer visitante) ou pagos
 * (quem comprou o produto, ou a variante, numa encomenda paga, entregue ou confirmada).
 * Os ficheiros vão para o bucket privado `downloads`; a regra de acesso é da base de dados.
 */
export default function DownloadsTab({ books = [] }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState('');

  const bookById = useMemo(() => Object.fromEntries(books.map((b) => [b.id, b])), [books]);
  const sortedBooks = useMemo(() => [...books].sort((a, b) => String(a.title).localeCompare(String(b.title), 'pt')), [books]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadAllDownloads());
      setMissing(false);
    } catch (e) {
      if (isMissingTable(e)) setMissing(true);
      else toast({ variant: 'destructive', title: 'Não foi possível carregar', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const choosePdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const problem = pdfFileError(file, head);
    if (problem) {
      toast({ variant: 'destructive', title: 'PDF recusado', description: problem });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadPdf(file);
      setForm((f) => {
        // Um PDF enviado agora e substituído antes de gravar não fica perdido no bucket.
        if (f.file_path && f.file_path !== f.saved_file_path) removePdf(f.file_path);
        return { ...f, ...uploaded, title: f.title || file.name.replace(/\.pdf$/i, '') };
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Falha ao enviar', description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const closeForm = () => {
    // Fechar sem gravar: o PDF novo, se houver, sai do bucket.
    if (form && form.file_path && form.file_path !== form.saved_file_path) removePdf(form.file_path);
    setForm(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { toast({ variant: 'destructive', title: 'Falta o título' }); return; }
    if (form.access === 'paid' && !form.book_id) { toast({ variant: 'destructive', title: 'Escolha o produto que dá acesso ao PDF' }); return; }
    if (form.published && !form.file_path) { toast({ variant: 'destructive', title: 'Carregue o PDF antes de publicar' }); return; }
    setSaving(true);
    try {
      await saveDownload({
        ...form,
        sort_order: Number(form.sort_order) || 0,
        variant: form.access === 'paid' && form.variant !== '' ? Number(form.variant) : null,
        book_id: form.book_id || null,
      });
      // O PDF antigo, substituído, deixa de servir.
      if (form.saved_file_path && form.saved_file_path !== form.file_path) removePdf(form.saved_file_path);
      toast({ title: form.id ? 'Material actualizado' : 'Material criado' });
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
      if (done) toast({ title: done });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: e.message });
    } finally {
      setBusy('');
    }
  };

  const preview = async (row) => {
    setBusy(row.id);
    try {
      window.location.assign(await getDownloadUrl(row));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível abrir', description: e.message });
    } finally {
      setBusy('');
    }
  };

  if (missing) {
    return <p className="text-sm text-muted-foreground">Os materiais ainda não estão activos nesta base de dados (falta a migração <code>materiais_para_descarregar</code>).</p>;
  }

  const book = form?.book_id ? bookById[form.book_id] : null;
  const versions = Array.isArray(book?.versions) ? book.versions : [];

  return (
    <div className="space-y-4">
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui as acções. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button size="sm" onClick={() => setForm({ ...EMPTY })}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo material
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ainda não há materiais. Carregue o primeiro PDF em "Novo material".</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const linked = row.book_id ? bookById[row.book_id] : null;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <FileText className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.title}{row.edition ? <span className="text-muted-foreground"> · {row.edition}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">
                    {downloadKindLabel(row.kind)}
                    {' · '}{row.access === 'paid' ? `Pago: ${linked?.title || 'produto apagado'}${row.variant != null ? ` (${variantLabel(linked, row.variant)})` : ''}` : 'Gratuito'}
                    {row.file_path ? (row.file_size ? ` · ${formatFileSize(row.file_size)}` : '') : ' · sem PDF'}
                    {' · '}{row.download_count} download{row.download_count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.published ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                  {row.published ? 'Publicado' : 'Rascunho'}
                </span>
                <div className="flex flex-wrap gap-1">
                  {row.file_path && (
                    <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => preview(row)} title="Abrir o PDF">
                      <Download className="h-4 w-4" /><span className="sr-only">Abrir o PDF</span>
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost" disabled={busy === row.id || (!row.published && !row.file_path)}
                    onClick={() => act(row, () => saveDownload({ id: row.id, published: !row.published }), row.published ? 'Passou a rascunho' : 'Publicado')}
                    title={row.published ? 'Despublicar' : 'Publicar'}
                  >
                    {row.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{row.published ? 'Despublicar' : 'Publicar'}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...EMPTY, ...row, book_id: row.book_id || '', variant: row.variant ?? '', saved_file_path: row.file_path })} title="Editar">
                    <Pencil className="h-4 w-4" /><span className="sr-only">Editar</span>
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-destructive" disabled={busy === row.id}
                    onClick={() => { if (window.confirm(`Apagar "${row.title}" e o PDF?`)) act(row, () => deleteDownload(row), 'Material apagado'); }}
                    title="Apagar"
                  >
                    <Trash2 className="h-4 w-4" /><span className="sr-only">Apagar</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{form.id ? 'Editar material' : 'Novo material'}</DialogTitle>
                <DialogDescription>PDF até 50 MB. O ficheiro fica privado: só se descarrega pelo site, com a regra de acesso escolhida.</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label>Ficheiro PDF</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                    <label htmlFor="material-pdf" className="cursor-pointer">
                      {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                      {form.file_path ? 'Substituir PDF' : 'Carregar PDF'}
                    </label>
                  </Button>
                  <input id="material-pdf" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={choosePdf} disabled={uploading} />
                  <span className="text-sm text-muted-foreground">
                    {form.file_path ? `${form.file_name || 'PDF'}${form.file_size ? ` · ${formatFileSize(form.file_size)}` : ''}` : 'Nenhum PDF carregado'}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="material-titulo">Título</Label>
                  <Input id="material-titulo" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-tipo">Tipo</Label>
                  <select id="material-tipo" className={selectClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                    {DOWNLOAD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="material-edicao">Edição (opcional)</Label>
                  <Input id="material-edicao" value={form.edition} maxLength={80} placeholder="ex.: 4.º trimestre 2026" onChange={(e) => set('edition', e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="material-descricao">Descrição (opcional)</Label>
                  <Textarea id="material-descricao" value={form.description} maxLength={2000} rows={3} onChange={(e) => set('description', e.target.value)} />
                </div>
              </div>

              <ImageField
                label="Capa (opcional)"
                gallery="capa"
                value={form.cover}
                onChange={(v) => set('cover', v)}
                aspect="3:4"
                previewClassName="h-24 w-18"
                showDrive={false}
                hint="Imagem da capa · 3:4"
                uploadFolder="stock_books"
              />

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Quem descarrega</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="material-acesso" className="mt-1" checked={form.access === 'free'} onChange={() => set('access', 'free')} />
                  <span><strong>Gratuito</strong>: qualquer visitante, sem conta.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="material-acesso" className="mt-1" checked={form.access === 'paid'} onChange={() => set('access', 'paid')} />
                  <span><strong>Pago</strong>: quem comprou o produto, depois de a encomenda estar paga, entregue ou confirmada.</span>
                </label>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="material-produto">{form.access === 'paid' ? 'Produto que dá acesso' : 'Produto (opcional, aparece na ficha)'}</Label>
                  <select id="material-produto" className={selectClass} value={form.book_id} onChange={(e) => setForm((f) => ({ ...f, book_id: e.target.value, variant: '' }))}>
                    <option value="">{form.access === 'paid' ? 'Escolha o produto' : 'Nenhum'}</option>
                    {sortedBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                </div>
                {form.access === 'paid' && versions.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="material-variante">Variante</Label>
                    <select id="material-variante" className={selectClass} value={form.variant} onChange={(e) => set('variant', e.target.value)}>
                      <option value="">Qualquer variante</option>
                      {versions.map((_, i) => <option key={i} value={i}>{variantLabel(book, i)}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {form.access === 'paid' && (
                <p className="text-xs text-muted-foreground">
                  Para vender só o PDF, crie no produto uma variante "Edição digital (PDF)" e escolha-a aqui. O checkout continua a pedir levantamento ou entrega.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="material-ordem">Ordem na lista</Label>
                  <Input id="material-ordem" type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} disabled={!form.file_path} />
                  Publicado (visível no site)
                </label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" disabled={saving || uploading}>
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
