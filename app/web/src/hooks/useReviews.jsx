import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabaseClient';
import { avatarSrc } from '@/lib/avatar';
import { useToast } from '@/hooks/use-toast';
import { hasPurchasedBook } from '@/lib/purchase';

function toReview(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || 'Leitor',
    userAvatar: avatarSrc(row.user_id, row.user_avatar) || null,
    bookId: row.book_id,
    rating: row.rating,
    comment: row.comment,
    isVerified: row.is_verified,
    createdAt: row.created,
    hidden: Boolean(row.hidden),
  };
}

/**
 * A base de dados devolve as ocultas pela equipa do catálogo a quem as escreveu e à própria
 * equipa. No site não aparecem nem contam para a média (docs/COLPORTAGEM.md); o autor continua
 * a ver a sua em «A sua avaliação», com o aviso.
 */
export function splitReviews(all, userId) {
  const list = all || [];
  return {
    reviews: list.filter((r) => !r.hidden),
    userReview: (userId && list.find((r) => r.userId === userId)) || null,
  };
}

const REVIEW_COLUMNS = 'id, user_id, user_name, user_avatar, book_id, rating, comment, is_verified, created';

export function mergeReviewHelpfulness(reviews, voteRows) {
  const votesByReview = new Map((voteRows || []).map((row) => [row.review_id, row]));
  return reviews.map((review) => {
    const vote = votesByReview.get(review.id);
    return {
      ...review,
      helpfulCount: Number(vote?.helpful_count) || 0,
      hasHelpfulVote: Boolean(vote?.user_voted),
    };
  });
}

/**
 * Avaliações de um livro (tabela "book_reviews" do Supabase). O nome, a foto e a
 * "compra verificada" são definidos pela base de dados.
 */
export const useReviews = (bookId) => {
  const { user, isAuthed, fetchUserOrders } = useAuth();
  const [allReviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [votingReviewId, setVotingReviewId] = useState(null);
  const [helpfulVotesEnabled, setHelpfulVotesEnabled] = useState(false);
  const [userOrders, setUserOrders] = useState([]);
  const { toast } = useToast();

  // 1. Avaliações do livro
  const loadReviews = useCallback(async () => {
    if (!bookId) {
      setReviews([]);
      return;
    }
    const read = (columns) => supabase
      .from('book_reviews')
      .select(columns)
      .eq('book_id', bookId)
      .order('created', { ascending: false });
    let { data, error } = await read(`${REVIEW_COLUMNS}, hidden`);
    // Antes da migração 20261114200000 a coluna «hidden» não existe: lê sem ela.
    if (error?.code === '42703') ({ data, error } = await read(REVIEW_COLUMNS));
    if (error) throw error;
    const mappedReviews = (data || []).map(toReview);
    const { data: voteRows, error: voteError } = await supabase
      .rpc('book_review_helpfulness', { p_book_id: bookId });
    setHelpfulVotesEnabled(!voteError);
    if (voteError) console.warn('Não foi possível carregar os votos úteis:', voteError);
    setReviews(mergeReviewHelpfulness(mappedReviews, voteError ? [] : voteRows || []));
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadReviews()
      .catch((error) => console.warn('Não foi possível carregar as avaliações:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadReviews]);

  // 2. Encomendas do utilizador, para indicar se pode ter "compra verificada"
  useEffect(() => {
    const loadOrders = async () => {
      if (isAuthed && user?.email) {
        try {
          const orders = await fetchUserOrders(user.email);
          setUserOrders(orders || []);
        } catch (err) {
          console.error('Error loading user orders for verification:', err);
        }
      } else {
        setUserOrders([]);
      }
    };
    loadOrders();
  }, [user?.email, isAuthed, fetchUserOrders]);

  // 3. O utilizador comprou este livro? Só contam encomendas pagas, entregues ou confirmadas, e
  // nunca as canceladas: a mesma regra da "compra verificada" na base de dados (lib/purchase.js).
  const hasPurchased = useMemo(
    () => isAuthed && hasPurchasedBook(userOrders, bookId),
    [userOrders, bookId, isAuthed],
  );

  // 4. As visíveis (lista e média) e a do próprio, mesmo oculta.
  const { reviews, userReview } = useMemo(
    () => splitReviews(allReviews, isAuthed ? user?.id : null),
    [allReviews, isAuthed, user?.id],
  );

  // 5. Calculate stats (Average Rating, etc)
  const stats = useMemo(() => {
    if (reviews.length === 0) return { average: 0, total: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => {
      if (counts[r.rating] !== undefined) counts[r.rating]++;
    });
    return {
      average: Number((sum / reviews.length).toFixed(1)),
      total: reviews.length,
      counts
    };
  }, [reviews]);

  // 5. Submit a new review or edit existing
  const submitReview = async (rating, comment) => {
    if (!isAuthed || !user?.id) {
      toast({
        variant: 'destructive',
        title: 'Iniciar sessão necessário',
        description: 'Por favor, inicie sessão para deixar uma avaliação.',
      });
      return false;
    }

    if (rating < 1 || rating > 5) {
      toast({
        variant: 'destructive',
        title: 'Classificação inválida',
        description: 'Por favor, selecione uma classificação entre 1 e 5 estrelas.',
      });
      return false;
    }

    if (!comment || comment.trim().length < 5) {
      toast({
        variant: 'destructive',
        title: 'Comentário muito curto',
        description: 'Por favor, escreva um comentário com pelo menos 5 caracteres.',
      });
      return false;
    }

    if (comment.trim().length > 1000) {
      toast({
        variant: 'destructive',
        title: 'Comentário muito longo',
        description: 'O comentário pode ter no máximo 1000 caracteres.',
      });
      return false;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from('book_reviews')
      .upsert(
        { book_id: bookId, user_id: user.id, rating: Number(rating), comment: comment.trim() },
        { onConflict: 'book_id,user_id' },
      );
    setSubmitting(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível guardar a avaliação', description: error.message });
      return false;
    }
    toast({
      title: 'Avaliação Guardada',
      description: 'A sua avaliação foi registada com sucesso! Obrigado pelo seu feedback.',
    });
    await loadReviews().catch(() => {});
    return true;
  };

  const toggleHelpfulVote = async (review) => {
    if (!isAuthed || !user?.id) {
      toast({
        variant: 'destructive',
        title: 'Iniciar sessão necessário',
        description: 'Inicie sessão para marcar um comentário como útil.',
      });
      return false;
    }
    if (review.userId === user.id) return false;

    const nextHasVote = !review.hasHelpfulVote;
    setVotingReviewId(review.id);
    setReviews((prev) => prev.map((item) => item.id === review.id
      ? { ...item, hasHelpfulVote: nextHasVote, helpfulCount: Math.max(0, item.helpfulCount + (nextHasVote ? 1 : -1)) }
      : item));

    try {
      const result = review.hasHelpfulVote
        ? await supabase.from('book_review_helpful_votes').delete().eq('review_id', review.id).eq('user_id', user.id)
        : await supabase.from('book_review_helpful_votes').insert({ review_id: review.id, user_id: user.id });
      if (result.error) throw result.error;
      loadReviews().catch((error) => console.warn('Não foi possível atualizar a contagem de votos:', error));
      return true;
    } catch (error) {
      setReviews((prev) => prev.map((item) => item.id === review.id
        ? { ...item, hasHelpfulVote: review.hasHelpfulVote, helpfulCount: review.helpfulCount }
        : item));
      toast({ variant: 'destructive', title: 'Não foi possível registar o voto', description: error.message });
      return false;
    } finally {
      setVotingReviewId(null);
    }
  };

  // 6. Apagar a própria avaliação
  const deleteReview = async () => {
    if (!isAuthed || !user?.id) return false;
    const { error } = await supabase.from('book_reviews').delete().eq('book_id', bookId).eq('user_id', user.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível remover a avaliação', description: error.message });
      return false;
    }
    toast({ title: 'Avaliação Removida', description: 'A sua avaliação foi removida.' });
    setReviews((prev) => prev.filter((r) => r.userId !== user.id));
    return true;
  };

  return {
    reviews,
    loading,
    submitting,
    stats,
    hasPurchased,
    submitReview,
    deleteReview,
    userReview,
    helpfulVotesEnabled,
    votingReviewId,
    toggleHelpfulVote,
  };
};
