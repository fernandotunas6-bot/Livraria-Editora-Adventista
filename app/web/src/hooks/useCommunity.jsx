import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  PAGE_SIZE, createPost, deletePost, isMissingTable, loadMyLikes, loadPosts, loadReplies, reportPost, setLike,
} from '@/lib/communityApi';
import { preparePost } from '@/lib/communityText';

/** Junta as respostas a cada publicação, mantendo a ordem de chegada. */
export function groupReplies(replies) {
  const map = {};
  for (const r of replies || []) (map[r.parent_id] ||= []).push(r);
  return map;
}

/**
 * Comunidade: o feed geral (`bookId` vazio) ou a discussão de um livro. Publicar, responder,
 * gostar, denunciar e apagar pedem sessão; ler não.
 */
export function useCommunity({ bookId = null } = {}) {
  const { user, isAuthed } = useAuth();
  const userId = isAuthed ? user?.id : null;
  const [posts, setPosts] = useState([]);
  const [replies, setReplies] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
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

  const fetchPage = useCallback(async (before = null) => {
    const page = await loadPosts({ bookId, before });
    const reps = await loadReplies(page.map((p) => p.id));
    await loadLikes([...page, ...reps].map((p) => p.id));
    return { page, reps };
  }, [bookId, loadLikes]);

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
    const last = posts[posts.length - 1];
    if (!last) return;
    try {
      const { page, reps } = await fetchPage(last.created);
      setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]);
      setReplies((prev) => ({ ...prev, ...groupReplies(reps) }));
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      setError('Não foi possível carregar mais publicações.');
    }
  }, [fetchPage, posts]);

  /** Publica ou responde. Devolve `''` quando correu bem, ou a mensagem de erro. */
  const publish = useCallback(async (fields) => {
    if (!userId) return 'Entre na sua conta para publicar.';
    const prepared = preparePost({ ...fields, bookId: fields.bookId ?? bookId });
    if (prepared.error) return prepared.error;
    try {
      const row = await createPost(userId, prepared.data);
      if (!row) return '';
      if (row.parent_id) {
        setReplies((prev) => ({ ...prev, [row.parent_id]: [...(prev[row.parent_id] || []), row] }));
      } else {
        setPosts((prev) => [row, ...prev]);
      }
      return '';
    } catch (e) {
      // As mensagens dos triggers estão escritas para quem publica (limite, resposta, link).
      return /Muitas publicações|Só se responde|Link inválido|já não existe/.test(e.message)
        ? e.message
        : 'Não foi possível publicar. Tente de novo.';
    }
  }, [userId, bookId]);

  const toggleLike = useCallback(async (post) => {
    if (!userId) return false;
    const next = !liked.has(post.id);
    const bump = (list) => list.map((p) => (p.id === post.id ? { ...p, likes_count: Math.max(0, p.likes_count + (next ? 1 : -1)) } : p));
    setLiked((prev) => { const s = new Set(prev); if (next) s.add(post.id); else s.delete(post.id); return s; });
    setPosts(bump);
    setReplies((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, bump(v)])));
    try {
      await setLike(post.id, userId, next);
    } catch {
      reload();
    }
    return true;
  }, [userId, liked, reload]);

  const report = useCallback(async (post, reason) => {
    if (!userId) return 'Entre na sua conta para denunciar.';
    try {
      await reportPost(post.id, userId, reason);
      return '';
    } catch {
      return 'Não foi possível enviar a denúncia.';
    }
  }, [userId]);

  const remove = useCallback(async (post) => {
    try {
      await deletePost(post.id);
      if (post.parent_id) {
        setReplies((prev) => ({ ...prev, [post.parent_id]: (prev[post.parent_id] || []).filter((r) => r.id !== post.id) }));
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
      }
      return '';
    } catch {
      return 'Não foi possível apagar.';
    }
  }, []);

  return {
    posts, replies, liked, loading, hasMore, unavailable, error, signedIn: !!userId,
    reload, loadMore, publish, toggleLike, report, remove,
  };
}
