import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  createPost, deletePost, isMissingTable, loadMyLikes, loadThread, reportPost, setHidden, setLike, setOfficial, setPinned,
} from '@/lib/communityApi';
import { preparePost } from '@/lib/communityText';

/**
 * Uma publicação com todas as respostas (página /comunidade/p/:id), com as mesmas acções do
 * feed. `status`: 'loading', 'ready', 'missing' (não existe ou está oculta), 'error' (sem rede:
 * dá para tentar outra vez) ou 'unavailable'.
 *
 * Depois de responder ou de marcar a resposta oficial, a conversa actualiza-se por baixo do que
 * está à vista (`silent`): antes a página inteira voltava ao spinner e o telemóvel saltava para
 * o topo, longe da resposta acabada de escrever.
 */
export function useCommunityThread(id) {
  const { user, isAuthed } = useAuth();
  const userId = isAuthed ? user?.id : null;
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [liked, setLiked] = useState(() => new Set());
  const [status, setStatus] = useState('loading');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading');
    try {
      const thread = await loadThread(id);
      if (!thread) { setStatus('missing'); return; }
      setPost(thread.post);
      setReplies(thread.replies);
      if (userId) {
        try {
          setLiked(new Set(await loadMyLikes([thread.post.id, ...thread.replies.map((r) => r.id)])));
        } catch {
          // sem os gostos próprios, os botões começam desmarcados
        }
      }
      setStatus('ready');
    } catch (e) {
      if (isMissingTable(e)) setStatus('unavailable');
      // Sem rede não é "já não existe": com a conversa à vista, fica como está; sem ela, erro.
      else if (!silent) setStatus('error');
    }
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);

  const publish = useCallback(async (fields) => {
    if (!userId) return 'Entre na sua conta para responder.';
    const prepared = preparePost({ ...fields, parentId: post?.id, bookId: post?.book_id });
    if (prepared.error) return prepared.error;
    try {
      await createPost(userId, prepared.data);
      await load({ silent: true });
      return '';
    } catch (e) {
      return /Muitas publicações|Link|links|Sites|site|já não existe|No máximo/.test(e.message) ? e.message : 'Não foi possível responder. Tente de novo.';
    }
  }, [userId, post, load]);

  const toggleLike = useCallback(async (target) => {
    if (!userId) return false;
    const next = !liked.has(target.id);
    setLiked((prev) => { const s = new Set(prev); if (next) s.add(target.id); else s.delete(target.id); return s; });
    const bump = (p) => (p.id === target.id ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (next ? 1 : -1)) } : p);
    setPost((p) => (p ? bump(p) : p));
    setReplies((list) => list.map(bump));
    try { await setLike(target.id, userId, next); } catch { load({ silent: true }); }
    return true;
  }, [userId, liked, load]);

  const report = useCallback(async (target, reason) => {
    if (!userId) return 'Entre na sua conta para denunciar.';
    try { await reportPost(target.id, userId, reason); return ''; } catch { return 'Não foi possível enviar a denúncia.'; }
  }, [userId]);

  const remove = useCallback(async (target) => {
    try {
      await deletePost(target.id);
      if (target.parent_id) setReplies((list) => list.filter((r) => r.id !== target.id));
      else setStatus('missing');
      return '';
    } catch {
      return 'Não foi possível apagar.';
    }
  }, []);

  const pin = useCallback(async (target) => {
    try { await setPinned(target.id, !target.pinned); setPost((p) => ({ ...p, pinned: !target.pinned })); return ''; } catch { return 'Não foi possível fixar.'; }
  }, []);

  const markOfficial = useCallback(async (reply) => {
    try { await setOfficial(reply.id, !reply.is_official); await load({ silent: true }); return ''; } catch { return 'Não foi possível marcar a resposta.'; }
  }, [load]);

  const hide = useCallback(async (target) => {
    try {
      await setHidden(target.id, true);
      if (target.parent_id) setReplies((list) => list.filter((r) => r.id !== target.id));
      else setStatus('missing');
      return '';
    } catch {
      return 'Não foi possível ocultar.';
    }
  }, []);

  return { post, replies, liked, status, signedIn: !!userId, reload: load, publish, toggleLike, report, remove, pin, markOfficial, hide };
}
