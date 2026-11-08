import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Loader2, BookOpen, Hash, Barcode, ImageIcon, Sparkles, Copy, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BOOK_GENRES, BOOK_LANGUAGES, emptyBookForm, bookToForm } from '@/lib/bookConstants';
import { PRODUCT_TYPES, isBookType, productType } from '@/lib/productTypes';
import pb from '@/lib/dataClient';
import { Megaphone, User, BookMarked, Layers, TrendingUp } from 'lucide-react';
import RichTextEditor from '@/components/admin/RichTextEditor';
import ImageField from '@/components/admin/ImageField';
import StockHistory from '@/components/admin/StockHistory';
import { useIntegrations } from '@/hooks/useIntegrations';
import { isYoutubeUrl } from '@/lib/youtube';
import { normalizeVersions } from '@/lib/pricing';
import { versionIsDigital } from '@/lib/digitalEditions';
import ProductVideo from '@/components/ProductVideo';
import { isUploadPending } from '@/lib/mediaUpload';

const PLACEHOLDER_COVER = '/images/site/capa-por-definir.webp';

// Código por atribuir: a base de dados gera o seguinte da numeração ao gravar (ex.: LIV-101).
const AUTO_CODE = '(automático)';

export default function BookFormModal({ open, onClose, onSave, editing, template, saving, initialType = 'livro' }) {
  const [form, setForm] = useState(emptyBookForm);
  const [copied, setCopied] = useState(false);
  const [collections, setCollections] = useState([]);
  const { driveImageConfig } = useIntegrations();

  useEffect(() => {
    if (open) {
      pb.collection('book_collections').getFullList({ sort: 'title' })
        .then(setCollections)
        .catch(() => setCollections([]));
      if (editing) setForm(bookToForm(editing));
      // Duplicar: copia tudo menos os códigos únicos; o ID e as métricas são novos.
      // Código vazio: a base de dados gera o seguinte da numeração (ex.: LIV-101).
      else if (template) setForm({ ...bookToForm(template), title: `${template.title} (cópia)`, book_code: '', sku: '' });
      else {
        // Novo produto do tipo escolhido em "Adicionar": a categoria começa no nome do tipo.
        const t = productType(initialType);
        setForm({ ...emptyBookForm, book_code: '', product_type: t.value, genre: t.isBook ? emptyBookForm.genre : t.plural, publisher: t.isBook ? emptyBookForm.publisher : '' });
      }
    }
  }, [open, editing, template, initialType]);

  if (!open) return null;

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const samplePages = (form.sample_pages || []).map((p) => (typeof p === 'string' ? p : p?.url || ''));
  const setSamplePage = (i, url) => setForm((f) => {
    const pages = (f.sample_pages || []).map((p) => (typeof p === 'string' ? p : p?.url || ''));
    pages[i] = url;
    return { ...f, sample_pages: pages };
  });
  const moveSamplePage = (i, dir) => setForm((f) => {
    const pages = [...(f.sample_pages || [])];
    const j = i + dir;
    if (j < 0 || j >= pages.length) return f;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    return { ...f, sample_pages: pages };
  });
  const uploadPending = isUploadPending(form.cover, form.author_photo, samplePages);
  // Autor, ISBN, páginas, idioma e amostra só fazem sentido em livros, Bíblias e revistas.
  const isBook = isBookType(form.product_type);
  const type = productType(form.product_type);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (uploadPending) return;
    onSave({
      ...form,
      product_type: form.product_type || 'livro',
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      pages: Number(form.pages) || 0,
      year: Number(form.year) || new Date().getFullYear(),
      featured: !!form.featured,
      book_code: (form.book_code || '').trim(),
      sku: (form.sku || form.book_code || '').trim(),
      benefit_bullets: Array.isArray(form.benefit_bullets)
        ? form.benefit_bullets
        : (form.benefit_bullets || '').split('\n').map((s) => s.trim()).filter(Boolean),
      sample_pages: samplePages.filter(Boolean),
      // Preço e stock das variantes em número (ou null = os do produto): lib/pricing.js.
      versions: normalizeVersions(form.versions),
      // Produto digital, só sem variantes (com elas, marca-se a edição). Vai quando está ligado
      // ou quando o produto já tem a coluna: antes da migração edicoes_digitais, gravar um
      // produto com uma coluna que não existe falhava.
      ...(form.digital || (editing && 'digital' in editing)
        ? { digital: !!form.digital && !(form.versions || []).length }
        : {}),
      preview_enabled: !!form.preview_enabled,
      video_url: (form.video_url || '').trim(),
    });
  };

  const copyId = () => {
    const id = editing?.id || form.book_code || '';
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-background rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl border border-border flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="formulario-produto-titulo"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-linear-to-r from-marca/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-marca/15 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 id="formulario-produto-titulo" className="text-xl font-bold">{editing ? `Editar ${type.label.toLowerCase()}` : template ? `Duplicar ${type.label.toLowerCase()}` : `Adicionar ${type.label.toLowerCase()}`}</h2>
              <p className="text-sm text-muted-foreground">Catálogo profissional com ID e código único</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar o formulário"><X className="h-5 w-5" aria-hidden="true" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-5 gap-0">
            {/* Preview lateral */}
            <div className="lg:col-span-2 bg-muted/30 p-6 border-b lg:border-b-0 lg:border-r border-border">
              <div className="sticky top-0 space-y-4">
                <div className="aspect-3/4 rounded-xl overflow-hidden bg-muted border shadow-inner">
                  <img
                    src={form.cover || PLACEHOLDER_COVER}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = PLACEHOLDER_COVER; }}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg line-clamp-2">{form.title || (isBook ? 'Título do livro' : 'Nome do produto')}</h3>
                  <p className="text-sm text-muted-foreground">{isBook ? (form.author || 'Autor') : type.label}</p>
                  {form.price && (
                    Number(form.sale_price) > 0 && Number(form.sale_price) < Number(form.price) ? (
                      <p className="font-bold text-xl">
                        <span className="text-rose-600">Kz {Number(form.sale_price).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}</span>
                        <span className="ml-2 text-sm text-muted-foreground line-through">Kz {Number(form.price).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}</span>
                      </p>
                    ) : (
                      <p className="text-primary font-bold text-xl">
                        Kz {Number(form.price).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}
                      </p>
                    )
                  )}
                </div>

                <div className="rounded-xl bg-card border p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Código</span>
                    <code className="font-mono text-primary font-semibold">{form.book_code || AUTO_CODE}</code>
                  </div>
                  {editing && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ID Sistema</span>
                      <button type="button" onClick={copyId} className="flex items-center gap-1 font-mono text-xs hover:text-primary">
                        {editing.id.slice(0, 12)}…
                        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" /> SKU</span>
                    <code className="font-mono text-xs">{form.sku || form.book_code || AUTO_CODE}</code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stock</span>
                    <span className={Number(form.stock) <= 5 ? 'text-red-600 font-medium' : ''}>{form.stock || 0} un.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Formulário */}
            <div className="lg:col-span-3 p-6">
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="flex flex-wrap gap-1 mb-6 h-auto bg-muted p-1 rounded-lg w-full">
                  <TabsTrigger value="info" className="flex-1 min-w-[70px]"><BookOpen className="h-4 w-4 mr-1 hidden sm:inline" />Info</TabsTrigger>
                  <TabsTrigger value="codes" className="flex-1 min-w-[70px]"><Hash className="h-4 w-4 mr-1 hidden sm:inline" />Códigos</TabsTrigger>
                  <TabsTrigger value="marketing" className="flex-1 min-w-[70px]"><Megaphone className="h-4 w-4 mr-1 hidden sm:inline" />Marketing</TabsTrigger>
                  {isBook && <TabsTrigger value="author" className="flex-1 min-w-[70px]"><User className="h-4 w-4 mr-1 hidden sm:inline" />Autor</TabsTrigger>}
                  <TabsTrigger value="stats" className="flex-1 min-w-[70px]"><TrendingUp className="h-4 w-4 mr-1 hidden sm:inline" />Métricas</TabsTrigger>
                  {isBook && <TabsTrigger value="preview" className="flex-1 min-w-[70px]"><BookMarked className="h-4 w-4 mr-1 hidden sm:inline" />Preview</TabsTrigger>}
                  <TabsTrigger value="versions" className="flex-1 min-w-[70px]"><Layers className="h-4 w-4 mr-1 hidden sm:inline" />{type.sized ? 'Tamanhos' : 'Versões'}</TabsTrigger>
                  <TabsTrigger value="media" className="flex-1 min-w-[70px]"><ImageIcon className="h-4 w-4 mr-1 hidden sm:inline" />Mídia</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label>Tipo de produto *</Label>
                    <Select value={form.product_type || 'livro'} onValueChange={(v) => set('product_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label} ({t.prefix}-…)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!editing?.id && <p className="text-xs text-muted-foreground">O código é gerado com o prefixo do tipo ({type.prefix}-001, {type.prefix}-002…).</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{isBook ? 'Título *' : 'Nome do produto *'}</Label>
                    <Input value={form.title} onChange={(e) => set('title', e.target.value)} required placeholder={isBook ? 'Ex: Caminho a Cristo' : type.sized ? 'Ex: Uniforme do Colégio Adventista — camisa' : 'Ex: Caderno de lições'} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {isBook && (
                      <div className="space-y-2">
                        <Label>Autor</Label>
                        <Input value={form.author} onChange={(e) => set('author', e.target.value)} placeholder="Ex: Ellen G. White" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>{isBook ? 'Género' : 'Categoria'}</Label>
                      {isBook ? (
                        <Select value={form.genre} onValueChange={(v) => set('genre', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BOOK_GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={form.genre === 'Catálogo Geral' ? '' : form.genre} onChange={(e) => set('genre', e.target.value)} placeholder={type.plural} />
                      )}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{isBook ? 'Editora' : 'Marca / Fornecedor'}</Label>
                      <Input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} />
                    </div>
                    {isBook && (
                      <div className="space-y-2">
                        <Label>Idioma</Label>
                        <Select value={form.language} onValueChange={(v) => set('language', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BOOK_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Preço (Kz) *</Label>
                      <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Stock {form.digital && !(form.versions || []).length ? <span className="font-normal text-muted-foreground">(sem stock: digital)</span> : '*'}</Label>
                      <Input type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} required={!(form.digital && !(form.versions || []).length)} disabled={!!form.digital && !(form.versions || []).length} />
                    </div>
                    <div className="space-y-2">
                      <Label>Ano</Label>
                      <Input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} />
                    </div>
                  </div>
                  {isBook && (
                    <div className="space-y-2">
                      <Label>Páginas</Label>
                      <Input type="number" min="0" value={form.pages} onChange={(e) => set('pages', e.target.value)} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <RichTextEditor value={form.description} onChange={(v) => set('description', v)} placeholder={isBook ? 'Sinopse do livro...' : 'Descrição, materiais, medidas, cuidados...'} />
                  </div>
                  {!(form.versions || []).length && (
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5" data-produto-digital>
                      <Switch id="produto-digital" checked={!!form.digital} onCheckedChange={(v) => set('digital', v)} />
                      <div>
                        <Label htmlFor="produto-digital" className="cursor-pointer">Produto digital (PDF): sem stock nem envio</Label>
                        <p className="text-xs text-muted-foreground">
                          Vende-se uma vez por conta, sem portes nem morada, e abre na biblioteca do cliente quando o pagamento é confirmado.
                          Carregue o PDF em Catálogo → Materiais (PDF), «Para quem comprou», ligado a este produto. Com uma edição impressa
                          e outra digital, marque a digital em {type.sized ? 'Tamanhos' : 'Versões'}.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-marca/5 border border-marca/20">
                    <Switch checked={form.featured} onCheckedChange={(v) => set('featured', v)} />
                    <Label className="cursor-pointer">Destacar na homepage</Label>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border">
                    <Switch checked={form.active !== false} onCheckedChange={(v) => set('active', v)} />
                    <div>
                      <Label className="cursor-pointer">Visível na loja</Label>
                      <p className="text-xs text-muted-foreground">Desligado: o livro fica oculto aos clientes e não pode ser comprado, mas continua aqui no painel.</p>
                    </div>
                  </div>
                  <div className="space-y-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5">
                    <div>
                      <p className="text-sm font-semibold">Promoção</p>
                      <p className="text-xs text-muted-foreground">O checkout cobra o preço promocional entre as datas indicadas (vazias = sem limite). Deixe o preço vazio para não haver promoção.</p>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Preço promocional (Kz)</Label>
                        <Input type="number" min="0" step="0.01" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} placeholder="Ex.: 4000" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Começa em</Label>
                        <Input type="datetime-local" value={form.sale_starts_at} onChange={(e) => set('sale_starts_at', e.target.value)} disabled={!form.sale_price} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Termina em</Label>
                        <Input type="datetime-local" value={form.sale_ends_at} onChange={(e) => set('sale_ends_at', e.target.value)} disabled={!form.sale_price} />
                      </div>
                    </div>
                    {Number(form.sale_price) > 0 && Number(form.price) > 0 && (
                      Number(form.sale_price) >= Number(form.price)
                        ? <p className="text-xs text-destructive">O preço promocional tem de ser menor do que o preço normal.</p>
                        : <p className="text-xs text-rose-700 dark:text-rose-300">Desconto de {Math.round((1 - Number(form.sale_price) / Number(form.price)) * 100)}%.</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="codes" className="space-y-4 mt-0">
                  <div className="rounded-xl bg-muted/50 border p-4 text-sm text-muted-foreground mb-2">
                    Cada livro recebe um código único da Livraria Adventista. O ID do sistema é gerado automaticamente ao guardar.
                  </div>
                  <div className="space-y-2">
                    <Label>Código do Livro (SKU)</Label>
                    <Input
                      value={form.book_code}
                      onChange={(e) => set('book_code', e.target.value.toUpperCase())}
                      placeholder="Automático"
                      className="font-mono"
                    />
                    {!editing && (
                      <p className="text-xs text-muted-foreground">Deixe vazio para gerar o próximo código da numeração (prefixo em Configurações → Regras da loja). Os códigos não se podem repetir.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>SKU / Código de Barras</Label>
                    <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Igual ao código ou ISBN" className="font-mono" />
                  </div>
                  {isBook && (
                    <div className="space-y-2">
                      <Label>ISBN</Label>
                      <Input value={form.isbn} onChange={(e) => set('isbn', e.target.value)} placeholder="978-..." className="font-mono" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="marketing" className="space-y-4 mt-0">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                    Campos de psicologia de vendas — aumentam conversão na página do produto e na loja.
                  </div>
                  <div className="space-y-2">
                    <Label>Coleção</Label>
                    <Select value={form.collection_id || '_none'} onValueChange={(v) => set('collection_id', v === '_none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Sem coleção" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sem coleção</SelectItem>
                        {collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Gancho de Marketing</Label>
                    <Input value={form.marketing_hook} onChange={(e) => set('marketing_hook', e.target.value)} placeholder="Ex: O livro que mudou milhões de vidas" />
                  </div>
                  <div className="space-y-2">
                    <Label>Prova Social</Label>
                    <Input value={form.social_proof} onChange={(e) => set('social_proof', e.target.value)} placeholder="Ex: Mais de 10.000 leitores em Angola" />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto de Urgência</Label>
                    <Input value={form.urgency_text} onChange={(e) => set('urgency_text', e.target.value)} placeholder="Ex: Últimas 5 unidades em stock" />
                  </div>
                  <div className="space-y-2">
                    <Label>Público-Alvo</Label>
                    <Input value={form.target_audience} onChange={(e) => set('target_audience', e.target.value)} placeholder="Ex: Jovens, famílias, líderes de estudo bíblico" />
                  </div>
                  <div className="space-y-2">
                    <Label>Benefícios (um por linha)</Label>
                    <Textarea
                      rows={4}
                      value={Array.isArray(form.benefit_bullets) ? form.benefit_bullets.join('\n') : form.benefit_bullets}
                      onChange={(e) => set('benefit_bullets', e.target.value)}
                      placeholder="Fortalece a fé diária&#10;Ideal para estudo em família&#10;Edição premium com capa dura"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Palavras-chave SEO</Label>
                    <Input value={form.seo_keywords} onChange={(e) => set('seo_keywords', e.target.value)} placeholder="devocional, adventista, espiritualidade" />
                  </div>
                </TabsContent>

                <TabsContent value="author" className="space-y-4 mt-0">
                  <ImageField
                    label="Foto do Autor"
                    value={form.author_photo}
                    onChange={(v) => set('author_photo', v)}
                    aspect="1:1"
                    previewClassName="h-20 w-20"
                    driveConfig={driveImageConfig}
                    uploadFolder="stock_books"
                  />
                  <div className="space-y-2">
                    <Label>Biografia do Autor</Label>
                    <RichTextEditor value={form.author_bio} onChange={(v) => set('author_bio', v)} placeholder="História, obra e legado do autor..." />
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="space-y-4 mt-0">
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <Switch checked={form.preview_enabled} onCheckedChange={(v) => set('preview_enabled', v)} />
                    <Label>Permitir pré-visualização na loja</Label>
                  </div>
                  <div className="space-y-3">
                    <Label>Páginas introdutórias</Label>
                    <p className="text-xs text-muted-foreground">Imagens das primeiras páginas para o leitor explorar antes de comprar, pela ordem em que aparecem.</p>
                    {samplePages.map((url, i) => (
                      <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-2">
                        <ImageField
                          label={`Página ${i + 1}`}
                          value={url}
                          onChange={(v) => setSamplePage(i, v)}
                          aspect="3:4"
                          previewClassName="h-24 w-18"
                          driveConfig={driveImageConfig}
                          uploadFolder="stock_books"
                        />
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="h-7" disabled={i === 0} onClick={() => moveSamplePage(i, -1)}>↑ Subir</Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7" disabled={i === samplePages.length - 1} onClick={() => moveSamplePage(i, 1)}>↓ Descer</Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive ml-auto" onClick={() => set('sample_pages', samplePages.filter((_, j) => j !== i))}>Remover página</Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => set('sample_pages', [...samplePages, ''])}>
                      + Adicionar página
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="versions" className="space-y-4 mt-0">
                  <p className="text-sm text-muted-foreground">
                    {type.sized
                      ? 'Um tamanho por linha (ex.: S, M, L, XL, ou 6 anos, 8 anos), cada um com o seu stock e, se mudar, o seu preço. Em "Formato" pode pôr a cor.'
                      : isBook ? 'Defina edições alternativas (capa dura, pocket, ebook, etc.)' : 'Defina variantes (cor, modelo, tamanho), cada uma com o seu stock.'}
                  </p>
                  {!type.sized && (
                    <p className="text-xs text-muted-foreground">
                      Edição digital: ligue «Edição digital» nessa edição (fica sem stock nem envio) e carregue o PDF em Catálogo → Materiais (PDF),
                      «Para quem comprou», ligado a este produto e a essa edição. Sem o PDF publicado, a loja não a deixa comprar.
                    </p>
                  )}
                  {(form.versions || []).map((v, i) => (
                    <div key={i} className="p-3 rounded-xl border space-y-2 bg-muted/20">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input placeholder={type.sized ? 'Tamanho (ex.: M)' : isBook ? 'Nome da edição' : 'Variante'} value={v.label || ''} onChange={(e) => {
                          const versions = [...(form.versions || [])];
                          versions[i] = { ...versions[i], label: e.target.value };
                          set('versions', versions);
                        }} />
                        <Input placeholder="Formato (Capa dura, Pocket...)" value={v.format || ''} onChange={(e) => {
                          const versions = [...(form.versions || [])];
                          versions[i] = { ...versions[i], format: e.target.value };
                          set('versions', versions);
                        }} />
                      </div>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <Input type="number" placeholder="Preço Kz" value={v.price ?? ''} onChange={(e) => {
                          const versions = [...(form.versions || [])];
                          versions[i] = { ...versions[i], price: e.target.value };
                          set('versions', versions);
                        }} />
                        <Input type="number" placeholder={versionIsDigital(v) ? 'Sem stock (digital)' : 'Stock'} value={versionIsDigital(v) ? '' : v.stock ?? ''} disabled={versionIsDigital(v)} onChange={(e) => {
                          const versions = [...(form.versions || [])];
                          versions[i] = { ...versions[i], stock: e.target.value };
                          set('versions', versions);
                        }} />
                        <Input placeholder="ISBN" value={v.isbn || ''} onChange={(e) => {
                          const versions = [...(form.versions || [])];
                          versions[i] = { ...versions[i], isbn: e.target.value };
                          set('versions', versions);
                        }} className="font-mono text-sm" />
                      </div>
                      {!type.sized && (
                        <label className="flex items-center gap-2 text-xs cursor-pointer" data-edicao-digital={versionIsDigital(v) ? 'sim' : 'nao'}>
                          <Switch
                            checked={versionIsDigital(v)}
                            aria-label="Edição digital"
                            onCheckedChange={(on) => {
                              const versions = [...(form.versions || [])];
                              versions[i] = { ...versions[i], digital: on, ...(on ? { stock: '' } : {}) };
                              set('versions', versions);
                            }}
                          />
                          Edição digital (PDF): sem stock nem envio, abre na biblioteca de quem a compra
                        </label>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7" onClick={() => {
                        set('versions', (form.versions || []).filter((_, j) => j !== i));
                      }}>Remover edição</Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => set('versions', [...(form.versions || []), { label: '', format: '', price: '', stock: '', isbn: '' }])}>
                    + Adicionar Versão / Edição
                  </Button>
                </TabsContent>

                <TabsContent value="media" className="space-y-6 mt-0">
                  <ImageField
                    label="Capa do Livro"
                    gallery="capa"
                    value={form.cover}
                    onChange={(v) => set('cover', v)}
                    aspect="3:4"
                    hint="Capa: 400×600px ou superior · URL, upload ou Google Drive"
                    previewClassName="h-32 w-24"
                    driveConfig={driveImageConfig}
                    uploadFolder="stock_books"
                  />

                  {/* Vídeo de apresentação. Fica aqui, ao lado da capa, porque é a outra
                      imagem que o produto tem. Só YouTube: é onde estão os vídeos da
                      livraria, e a loja mostra-os sem cookies e sem custo para quem não os
                      abre (ver lib/youtube.js). */}
                  <div className="space-y-2">
                    <Label htmlFor="campo-video">Vídeo de apresentação (YouTube)</Label>
                    <Input
                      id="campo-video"
                      value={form.video_url || ''}
                      onChange={(e) => set('video_url', e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      aria-describedby="ajuda-video"
                      aria-invalid={!!form.video_url?.trim() && !isYoutubeUrl(form.video_url) ? 'true' : undefined}
                    />
                    {form.video_url?.trim() && !isYoutubeUrl(form.video_url) ? (
                      <p id="ajuda-video" className="text-sm text-destructive">
                        Não parece um endereço do YouTube. Cole o link da barra de endereço do
                        vídeo, ou o do botão «Partilhar». Se gravar assim, o produto fica sem vídeo.
                      </p>
                    ) : (
                      <p id="ajuda-video" className="text-xs text-muted-foreground">
                        Aceita os endereços normais, os de <code>youtu.be</code> e os dos Shorts.
                        Na ficha do produto aparece a miniatura com «play»; o vídeo só é
                        descarregado quando o cliente o abre. Deixe vazio para não ter vídeo.
                      </p>
                    )}
                    {isYoutubeUrl(form.video_url) && (
                      <div className="pt-1">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Como fica na ficha:</p>
                        <ProductVideo url={form.video_url} title={form.title || 'Vídeo do produto'} className="max-w-md" />
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="stats" className="space-y-4 mt-0">
                  <div className="rounded-xl bg-linear-to-r from-marca/10 to-marca/5 border border-marca/20 p-4 text-sm text-foreground">
                    <h4 className="text-base font-semibold text-primary mb-1">Métricas reais</h4>
                    <p className="text-muted-foreground">Contadas automaticamente: vendas quando uma encomenda é registada e visualizações quando alguém abre a página do livro.</p>
                  </div>
                  {editing ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border p-4">
                        <p className="text-xs text-muted-foreground">Unidades vendidas</p>
                        <p className="text-2xl font-bold">{Number(editing.sales_count) || 0}</p>
                      </div>
                      <div className="rounded-xl border p-4">
                        <p className="text-xs text-muted-foreground">Visualizações</p>
                        <p className="text-2xl font-bold">{Number(editing.views_count) || 0}</p>
                      </div>
                      <div className="col-span-2">
                        <StockHistory bookId={editing.id} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">As métricas aparecem depois de publicar o livro.</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="sticky bottom-0 flex gap-3 px-6 py-4 border-t bg-background/95 backdrop-blur-sm">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1 btn-primary py-6 text-base" disabled={saving || uploadPending}>
              {(saving || uploadPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploadPending ? 'A enviar imagens…' : editing ? 'Guardar Alterações' : 'Publicar Livro'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
