import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  PAGE_SIZE, createPost, deletePost, isMissingTable, listPosts, loadMyLikes, loadReplies, reportPost, setHidden,
  setLike, setOfficial, setPinned,
} from '@/lib/communityApi';
import { preparePost } from '@/lib/communityText';

/** Junta as respostas a cada publicação, mantendo a ordem de chegada. */
export function groupReplies(replies) {
  const map = {};
  for (const r of replies || []) (map[r.parent_id] ||= []).push(r);
  return map;
}

/** Cursor da página seguinte em "recentes": a publicação mais antiga que não está fixada. */
export function nextCursor(page) {
  const free = (page || []).filter((p) => !p.pinned);
  const list = free.length ? free : page || [];
  return list.reduce((min, p) => (!min || p.created < min ? p.created : min), null);
}

/**
 * Comunidade: o feed geral ou a discussão de um livro, com filtros (tema, tipo, pesquisa) e
 * ordenação (recentes, em_alta, sem_resposta). Publicar, responder, gostar, denunciar e apagar
 * pedem sessão; ler não. Fixar, resposta oficial e ocultar são da equipa (o servidor confirma).
 */
export function useCommunity({ bookId = null, topic = '', kind = '', sort = 'recentes', query = '' } = {}) {
  const { user, isAuthed } = useAuth();
  const userId = isAuthed ? user?.id : null;
  const [posts, setPosts] = useState([]);
  const [replies, setReplies] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');

  const loadLikes = useCallback(async (ids) => {
    if (!userId || !ids.length) return;
    try {
      const mine = await loadMyLikes(ids);
      setLiked((prev) => new Set([...prev, ...mine]));
    } catch {
      // Sem os gostos próprios, os botões começam desmarcados; não impede ler.
    }
  }, [userId]);

  const fetchPage = useCallback(async ({ before = null, offset = 0 } = {}) => {
    const page = await listPosts({ bookId, topic, kind, sort, query, before, offset });
    const reps = await loadReplies(page.map((p) => p.id));
    await loadLikes([...page, ...reps].map((p) => p.id));
    return { page, reps };
  }, [bookId, topic, kind, sort, query, loadLikes]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { page, reps } = await fetchPage();
      setPosts(page);
      setReplies(groupReplies(reps));
      setHasMore(page.length === PAGE_SIZE);
      setUnavailable(false);
    } catch (e) {
      if (isMissingTable(e)) setUnavailable(true);
      else setError('Não foi possível carregar as publicações.');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (!posts.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const { page, reps } = sort === 'recentes'
        ? await fetchPage({ before: nextCursor(posts) })
        : await fetchPage({ offset: posts.length });
      setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]);
      setReplies((prev) => ({ ...prev, ...groupReplies(reps) }));
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      setError('Não foi possível carregar mais publicações.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, posts, sort, loadingMore]);

  /** Publica ou responde. Devolve `''` quando correu bem, ou a mensagem de erro. */
  const publish = useCallback(async (fields) => {
    if (!userId) return 'Entre na sua conta para publicar.';
    const prepared = preparePost({ ...fields, bookId: fields.bookId ?? bookId });
    if (prepared.error) return prepared.error;
    const extra = fields.parentId ? {} : { topic: fields.topic || null, kind: fields.kind || 'discussao' };
    try {
      const row = await createPost(userId, { ...prepared.data, ...extra });
      if (!row) return '';
      if (row.parent_id) {
        setReplies((prev) => ({ ...prev, [row.parent_id]: [...(prev[row.parent_id] || []), row] }));
        setPosts((prev) => prev.map((p) => (p.id === row.parent_id ? { ...p, replies_count: (p.replies_count || 0) + 1 } : p)));
      } else {
        setPosts((prev) => [row, ...prev]);
      }
      return '';
    } catch (e) {
      // As mensagens dos triggers estão escritas para quem publica (limite, resposta, link, tema).
      return /Muitas publicações|Só se responde|Link|links|Sites|site|já não existe|tema|Tipo de publicação|No máximo/.test(e.message)
        ? e.message
        : 'Não foi possível publicar. Tente de novo.';
    }
  }, [userId, bookId]);

  const mapAll = useCallback((fn) => {
    setPosts((prev) => prev.map(fn));
    setReplies((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.map(fn)])));
  }, []);

  const toggleLike = useCallback(async (post) => {
    if (!userId) return false;
    const next = !liked.has(post.id);
    setLiked((prev) => { const s = new Set(prev); if (next) s.add(post.id); else s.delete(post.id); return s; });
    mapAll((p) => (p.id === post.id ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (next ? 1 : -1)) } : p));
    try {
      await setLike(post.id, userId, next);
    } catch {
      reload();
    }
    return true;
  }, [userId, liked, reload, mapAll]);

  const report = useCallback(async (post, reason) => {
    if (!userId) return 'Entre na sua conta para denunciar.';
    try {
      await reportPost(post.id, userId, reason);
      return '';
    } catch {
      return 'Não foi possível enviar a denúncia.';
    }
  }, [userId]);

  const dropLocal = useCallback((post) => {
    if (post.parent_id) {
      setReplies((prev) => ({ ...prev, [post.parent_id]: (prev[post.parent_id] || []).filter((r) => r.id !== post.id) }));
      setPosts((prev) => prev.map((p) => (p.id === post.parent_id ? { ...p, replies_count: Math.max(0, (p.replies_count || 1) - 1) } : p)));
    } else {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    }
  }, []);

  const remove = useCallback(async (post) => {
    try {
      await deletePost(post.id);
      dropLocal(post);
      return '';
    } catch {
      return 'Não foi possível apagar.';
    }
  }, [dropLocal]);

  // ── Equipa ─────────────────────────────────────────────────────────────

  const pin = useCallback(async (post) => {
    try {
      await setPinned(post.id, !post.pinned);
      mapAll((p) => (p.id === post.id ? { ...p, pinned: !post.pinned } : p));
      return '';
    } catch {
      return 'Não foi possível fixar.';
    }
  }, [mapAll]);

  const markOfficial = useCallback(async (reply) => {
    try {
      await setOfficial(reply.id, !reply.is_official);
      setReplies((prev) => {
        const list = (prev[reply.parent_id] || []).map((r) => (r.id === reply.id ? { ...r, is_official: !reply.is_official } : r));
        list.sort((a, b) => Number(!!b.is_official) - Number(!!a.is_official) || String(a.created).localeCompare(String(b.created)));
        return { ...prev, [reply.parent_id]: list };
      });
      return '';
    } catch {
      return 'Não foi possível marcar a resposta.';
    }
  }, []);

  const hide = useCallback(async (post) => {
    try {
      await setHidden(post.id, true);
      dropLocal(post);
      return '';
    } catch {
      return 'Não foi possível ocultar.';
    }
  }, [dropLocal]);

  return {
    posts, replies, liked, loading, loadingMore, hasMore, unavailable, error, signedIn: !!userId,
    reload, loadMore, publish, toggleLike, report, remove, pin, markOfficial, hide,
  };
}
