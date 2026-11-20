// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  FEED_REPLIES_PER_POST, PAGE_SIZE, createPost, deletePost, isMissingTable, listPosts, loadMyLikes, loadReplies, reportPost,
  setHidden, setLike, setOfficial, setPinned,
} from '@/lib/communityApi';
import { clearFeeds, feedKey, readFeed, writeFeed } from '@/lib/communityFeedCache';
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
 * A publicação acabada de escrever pertence ao feed que está aberto? Com um tema, um tipo, um
 * livro ou uma pesquisa activos, uma publicação de outro tema aparecia no topo de uma lista
 * onde não devia estar.
 */
export function matchesFilters(row, { bookId = null, topic = '', kind = '', query = '' } = {}) {
  if (!row || row.parent_id) return false;
  if (query) return false;
  if (bookId && row.book_id !== bookId) return false;
  if (topic && row.topic !== topic) return false;
  if (kind && row.kind !== kind) return false;
  return true;
}

/** Quantas publicações de `fresh` (a primeira página pedida agora) ainda não estão no feed. */
export function countNew(fresh, current) {
  const known = new Set((current || []).map((p) => p.id));
  return (fresh || []).filter((p) => !p.pinned && !known.has(p.id)).length;
}

/**
 * Comunidade: o feed geral ou a discussão de um livro, com filtros (tema, tipo, pesquisa) e
 * ordenação (recentes, em_alta, sem_resposta). Publicar, responder, gostar, denunciar e apagar
 * pedem sessão; ler não. Fixar, resposta oficial e ocultar são da equipa (o servidor confirma).
 *
 * No telemóvel:
 * - o que já estava carregado fica guardado por filtros (`communityFeedCache`): ao voltar de
 *   uma publicação, o feed aparece logo, com as mesmas publicações, e a posição é reposta;
 * - mudar de filtro não apaga a lista nem mostra um spinner: a lista anterior fica, esbatida
 *   (`refreshing`), até chegar a nova;
 * - se "carregar mais" falhar, o carregamento automático pára (`loadMoreFailed`) em vez de
 *   tentar sem parar com a rede em baixo; o feed mostra "Tentar outra vez" no fim da lista;
 * - cada publicação traz só as respostas que o cartão mostra (`FEED_REPLIES_PER_POST`).
 */
export function useCommunity({ bookId = null, topic = '', kind = '', sort = 'recentes', query = '' } = {}) {
  const { user, isAuthed } = useAuth();
  const userId = isAuthed ? user?.id : null;
  const key = feedKey({ bookId, topic, kind, sort, query });
  const cached = useRef(readFeed(key)).current;
  const [posts, setPosts] = useState(() => cached?.posts || []);
  const [replies, setReplies] = useState(() => cached?.replies || {});
  const [liked, setLiked] = useState(() => new Set(cached?.liked || []));
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [hasMore, setHasMore] = useState(() => !!cached?.hasMore);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [newCount, setNewCount] = useState(0);
  const shownKey = useRef(cached ? key : '');
  const postsRef = useRef(posts);
  postsRef.current = posts;

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
    const reps = await loadReplies(page.map((p) => p.id), { perParent: FEED_REPLIES_PER_POST });
    await loadLikes([...page, ...reps].map((p) => p.id));
    return { page, reps };
  }, [bookId, topic, kind, sort, query, loadLikes]);

  const reload = useCallback(async () => {
    // Com publicações à vista (outro filtro, ou "novas publicações"), ficam até chegar as novas.
    const keep = postsRef.current.length > 0;
    if (keep) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const { page, reps } = await fetchPage();
      setPosts(page);
      setReplies(groupReplies(reps));
      setHasMore(page.length === PAGE_SIZE);
      setLoadMoreFailed(false);
      setNewCount(0);
      setUnavailable(false);
      shownKey.current = key;
    } catch (e) {
      if (isMissingTable(e)) setUnavailable(true);
      else setError('Não foi possível carregar as publicações.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage, key]);

  // Ao montar e a cada mudança de filtros: o que já estava guardado aparece logo; o resto pede-se.
  useEffect(() => {
    if (shownKey.current === key) return;
    const saved = readFeed(key);
    if (saved) {
      setPosts(saved.posts);
      setReplies(saved.replies);
      setHasMore(saved.hasMore);
      setLoadMoreFailed(false);
      setNewCount(0);
      setError('');
      setLoading(false);
      shownKey.current = key;
      return;
    }
    reload();
  }, [key, reload]);

  // O que está à vista fica guardado para estes filtros (para o "voltar" da publicação).
  useEffect(() => {
    if (loading || unavailable || shownKey.current !== key) return;
    writeFeed(key, { posts, replies, hasMore, liked: [...liked] });
  }, [key, posts, replies, hasMore, liked, loading, unavailable]);

  const loadMore = useCallback(async () => {
    if (!posts.length || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const { page, reps } = sort === 'recentes'
        ? await fetchPage({ before: nextCursor(posts) })
        : await fetchPage({ offset: posts.length });
      setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]);
      setReplies((prev) => ({ ...prev, ...groupReplies(reps) }));
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      // Pára o carregamento automático; o feed oferece "Tentar outra vez" no fim da lista.
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, posts, sort, loadingMore]);

  /**
   * Há publicações novas desde que a lista abriu? Pede a primeira página (sem respostas) e
   * conta as que ainda não estão no feed. Só em "recentes", onde as novas vão para o topo.
   */
  const checkNew = useCallback(async () => {
    if (sort !== 'recentes' || !postsRef.current.length) return 0;
    try {
      const fresh = await listPosts({ bookId, topic, kind, sort, query, before: null, offset: 0, limit: 10 });
      const n = countNew(fresh, postsRef.current);
      setNewCount(n);
      return n;
    } catch {
      return 0;
    }
  }, [bookId, topic, kind, sort, query]);

  /** Publica ou responde. Devolve `''` quando correu bem, ou a mensagem de erro. */
  const publish = useCallback(async (fields) => {
    if (!userId) return 'Entre na sua conta para publicar.';
    const prepared = preparePost({ ...fields, bookId: fields.bookId ?? bookId });
    if (prepared.error) return prepared.error;
    const extra = fields.parentId ? {} : { topic: fields.topic || null, kind: fields.kind || 'discussao' };
    try {
      const row = await createPost(userId, { ...prepared.data, ...extra });
      // Outros filtros guardados podem estar desactualizados com esta publicação.
      clearFeeds();
      if (!row) return '';
      if (row.parent_id) {
        setReplies((prev) => ({ ...prev, [row.parent_id]: [...(prev[row.parent_id] || []), row] }));
        setPosts((prev) => prev.map((p) => (p.id === row.parent_id ? { ...p, replies_count: (p.replies_count || 0) + 1 } : p)));
      } else if (matchesFilters(row, { bookId, topic, kind, query })) {
        setPosts((prev) => [row, ...prev]);
      }
      return '';
    } catch (e) {
      // As mensagens dos triggers estão escritas para quem publica (limite, resposta, link, tema).
      return /Muitas publicações|Só se responde|Link|links|Sites|site|já não existe|tema|Tipo de publicação|No máximo/.test(e.message)
        ? e.message
        : 'Não foi possível publicar. Tente de novo.';
    }
  }, [userId, bookId, topic, kind, query]);

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
    clearFeeds();
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
    posts, replies, liked, loading, refreshing, loadingMore, loadMoreFailed, hasMore, unavailable, error, newCount,
    signedIn: !!userId,
    reload, loadMore, checkNew, publish, toggleLike, report, remove, pin, markOfficial, hide,
  };
}
