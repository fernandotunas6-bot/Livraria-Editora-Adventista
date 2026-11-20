// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { mergeReviewHelpfulness, splitReviews } from '@/hooks/useReviews';

describe('splitReviews', () => {
  const lista = [
    { id: 'a', userId: 'u1', rating: 5, hidden: false },
    { id: 'b', userId: 'u2', rating: 1, hidden: true },
    { id: 'c', userId: 'u3', rating: 4, hidden: false },
  ];

  it('a oculta sai da lista pública (e da média), também para a equipa que a lê', () => {
    expect(splitReviews(lista, null).reviews.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('o autor continua a ver a sua oculta em «A sua avaliação», fora da lista', () => {
    const { reviews, userReview } = splitReviews(lista, 'u2');
    expect(userReview).toMatchObject({ id: 'b', hidden: true });
    expect(reviews.some((r) => r.id === 'b')).toBe(false);
  });

  it('sem sessão não há avaliação própria', () => {
    expect(splitReviews(lista, null).userReview).toBeNull();
    expect(splitReviews(undefined, 'u1')).toEqual({ reviews: [], userReview: null });
  });
});

describe('mergeReviewHelpfulness', () => {
  it('associa contagem pública e voto do utilizador à avaliação certa', () => {
    const reviews = [{ id: 'review-1' }, { id: 'review-2' }];
    const votes = [
      { review_id: 'review-1', helpful_count: '4', user_voted: true },
      { review_id: 'review-2', helpful_count: 0, user_voted: false },
    ];

    expect(mergeReviewHelpfulness(reviews, votes)).toEqual([
      { id: 'review-1', helpfulCount: 4, hasHelpfulVote: true },
      { id: 'review-2', helpfulCount: 0, hasHelpfulVote: false },
    ]);
  });

  it('usa valores seguros quando a lista de contagens está vazia', () => {
    expect(mergeReviewHelpfulness([{ id: 'review-1' }], [])).toEqual([
      { id: 'review-1', helpfulCount: 0, hasHelpfulVote: false },
    ]);
  });
});