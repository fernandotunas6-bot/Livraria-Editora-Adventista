import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Pencil, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import TopicIcon from '@/components/community/TopicIcon';
import { BookPicker } from '@/components/community/PostComposer';
import {
  deleteClub, deleteTopic, loadBookTitles, loadClubs, loadStaffPosts, loadTopics, restorePost, saveClub, saveTopic, setHidden, setPinned,
} from '@/lib/communityApi';
import { postKind, postPath, TOPIC_ICONS } from '@/lib/communityStyle';
import { relativeTime } from '@/lib/communityText';

/** Endereço de um tema a partir do nome: sem acentos, minúsculas e hífens. */
export function slugify(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

function useAction() {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const run = useCallback(async (key, fn, done, after) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast({ title: done });
      await after?.();
      return true;
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: e.message });
      return false;
    } finally {
      setBusy('');
    }
  }, [toast]);
  return { busy, run };
}

const Empty = ({ children }) => <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>;
const Spinner = () => <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" /></div>;

// ── Publicações: pesquisar, fixar, ocultar ────────────────────────────────

export function PostsPanel() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { busy, run } = useAction();

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try { setItems(await loadStaffPosts(q)); } catch { setItems([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); load(query); }}>
        <label htmlFor="staff-post-search" className="sr-only">Pesquisar publicações</label>
        <Input id="staff-post-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar no texto das publicações" />
        <Button type="submit" variant="outline"><Search className="mr-1.5 h-4 w-4" aria-hidden="true" /> Pesquisar</Button>
      </form>
      {loading ? <Spinner /> : items.length === 0 ? <Empty>Nenhuma publicação encontrada.</Empty> : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{postKind(p.kind).label}</span>
                {p.topic && <span>· {p.topic}</span>}
                <span>· {relativeTime(p.created)}</span>
                <span>· {p.likes_count} gostos · {p.replies_count} respostas</span>
                {p.pinned_at && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Fixada</span>}
                {p.hidden && <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Oculta</span>}
                {p.reports_count > 0 && <span className="text-destructive">{p.reports_count} denúncia(s)</span>}
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-line break-words text-sm">{p.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!p.hidden && (
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => run(p.id, () => setPinned(p.id, !p.pinned_at), p.pinned_at ? 'Publicação desafixada' : 'Publicação fixada no topo', () => load(query))}>
                    {p.pinned_at ? <PinOff className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Pin className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    {p.pinned_at ? 'Desafixar' : 'Fixar no topo'}
                  </Button>
                )}
                {p.hidden ? (
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => run(p.id, () => restorePost(p.id), 'Publicação visível outra vez', () => load(query))}>
                    <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" /> Mostrar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => run(p.id, () => setHidden(p.id, true), 'Publicação oculta', () => load(query))}>
                    <EyeOff className="mr-1.5 h-4 w-4" aria-hidden="true" /> Ocultar
                  </Button>
                )}
                {!p.hidden && <Button size="sm" variant="ghost" asChild><Link to={postPath(p.id)} target="_blank" rel="noopener">Abrir</Link></Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Temas ─────────────────────────────────────────────────────────────────

const NEW_TOPIC = { slug: '', name: '', description: '', icon: 'book-open', sort_order: 100, active: true };

export function TopicsPanel() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { ...topic, isNew }
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    setLoading(true);
    try { setTopics(await loadTopics()); } catch { setTopics([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const t = { ...editing, slug: editing.isNew ? (editing.slug || slugify(editing.name)) : editing.slug };
    const ok = await run('save', () => saveTopic(t, editing.isNew), editing.isNew ? 'Tema criado' : 'Tema guardado', load);
    if (ok) setEditing(null);
  };

  return (
    <div className="space-y-4">
      {!editing && (
        <Button type="button" onClick={() => setEditing({ ...NEW_TOPIC, isNew: true })}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Novo tema</Button>
      )}
      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">{editing.isNew ? 'Novo tema' : `Editar «${editing.name}»`}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="topic-name">Nome</Label>
              <Input id="topic-name" required minLength={2} maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic-slug">Endereço</Label>
              <Input
                id="topic-slug" maxLength={40} disabled={!editing.isNew} pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={editing.isNew ? (editing.slug || slugify(editing.name)) : editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                aria-describedby="topic-slug-help"
              />
              <p id="topic-slug-help" className="text-xs text-muted-foreground">/comunidade?tema={editing.isNew ? (editing.slug || slugify(editing.name)) : editing.slug}{!editing.isNew && ' · não muda depois de criado'}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic-desc">Descrição</Label>
            <Textarea id="topic-desc" maxLength={200} rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_ICONS.map((icon) => (
                <label key={icon} className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border ${editing.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <input type="radio" name="topic-icon" value={icon} checked={editing.icon === icon} onChange={() => setEditing({ ...editing, icon })} className="sr-only" aria-label={icon} />
                  <TopicIcon name={icon} className="h-5 w-5" />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="topic-order">Ordem</Label>
              <Input id="topic-order" type="number" className="w-28" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="topic-active" checked={editing.active !== false} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              <Label htmlFor="topic-active">Visível na comunidade</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy === 'save'}>{busy === 'save' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Guardar</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          </div>
        </form>
      )}
      {loading ? <Spinner /> : topics.length === 0 ? <Empty>Ainda não há temas.</Empty> : (
        <ul className="divide-y rounded-xl border bg-card">
          {topics.map((t) => (
            <li key={t.slug} className="flex items-center gap-3 p-3">
              <TopicIcon name={t.icon} className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.name} {t.active === false && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">desligado</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{t.slug} · ordem {t.sort_order}{t.description ? ` · ${t.description}` : ''}</p>
              </div>
              <Button size="sm" variant="ghost" aria-label={`Editar ${t.name}`} onClick={() => setEditing({ ...t, isNew: false })}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
              <Button
                size="sm" variant="ghost" className="text-destructive" aria-label={`Apagar ${t.name}`} disabled={busy === t.slug}
                onClick={() => { if (window.confirm(`Apagar o tema «${t.name}»? As publicações ficam sem tema.`)) run(t.slug, () => deleteTopic(t.slug), 'Tema apagado', load); }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Clube do livro ────────────────────────────────────────────────────────

const monthValue = (date) => String(date || '').slice(0, 7);
const monthLabel = (date) => {
  const d = new Date(`${monthValue(date)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const text = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ClubsPanel() {
  const [clubs, setClubs] = useState([]);
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadClubs();
      setClubs(list);
      setTitles(await loadBookTitles(list.map((c) => c.book_id)).catch(() => ({})));
    } catch {
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (!editing.book) return;
    const ok = await run('save', () => saveClub({
      id: editing.id, book_id: editing.book.id, month: `${editing.month}-01`, title: editing.title || editing.book.title, intro: editing.intro, active: editing.active,
    }), 'Clube do livro guardado', load);
    if (ok) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Um livro por mês, em destaque no topo da comunidade, com a discussão filtrada por esse livro.</p>
      {!editing && (
        <Button type="button" onClick={() => setEditing({ id: null, book: null, month: thisMonth(), title: '', intro: '', active: true })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Escolher livro do mês
        </Button>
      )}
      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Livro</p>
            <BookPicker value={editing.book} onChange={(book) => setEditing({ ...editing, book })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="club-month">Mês</Label>
              <Input id="club-month" type="month" required value={editing.month} onChange={(e) => setEditing({ ...editing, month: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-title">Título</Label>
              <Input id="club-title" maxLength={120} placeholder={editing.book?.title || 'O título do livro'} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-intro">Apresentação</Label>
            <Textarea id="club-intro" rows={3} maxLength={1000} value={editing.intro} onChange={(e) => setEditing({ ...editing, intro: e.target.value })} placeholder="Porque escolhemos este livro e como vamos ler (por exemplo, um capítulo por semana)." />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="club-active" checked={editing.active !== false} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
            <Label htmlFor="club-active">Mostrar na comunidade</Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!editing.book || busy === 'save'}>{busy === 'save' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Guardar</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          </div>
        </form>
      )}
      {loading ? <Spinner /> : clubs.length === 0 ? <Empty>Ainda não escolheu nenhum livro do mês.</Empty> : (
        <ul className="divide-y rounded-xl border bg-card">
          {clubs.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{monthLabel(c.month)} {c.active === false && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">escondido</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{c.title || titles[c.book_id] || c.book_id}{titles[c.book_id] && c.title !== titles[c.book_id] ? ` · ${titles[c.book_id]}` : ''}</p>
              </div>
              <Button
                size="sm" variant="ghost" aria-label={`Editar ${monthLabel(c.month)}`}
                onClick={() => setEditing({ id: c.id, book: { id: c.book_id, title: titles[c.book_id] || c.title }, month: monthValue(c.month), title: c.title, intro: c.intro, active: c.active })}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                size="sm" variant="ghost" className="text-destructive" aria-label={`Apagar ${monthLabel(c.month)}`} disabled={busy === c.id}
                onClick={() => { if (window.confirm('Apagar este clube do livro?')) run(c.id, () => deleteClub(c.id), 'Clube apagado', load); }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
