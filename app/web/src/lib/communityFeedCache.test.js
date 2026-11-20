// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it } from 'vitest';
import { clearFeeds, feedKey, readFeed, writeFeed } from '@/lib/communityFeedCache';

const MIN = 60 * 1000;

afterEach(() => clearFeeds());

describe('feedKey', () => {
  it('é a mesma para os mesmos filtros, com ou sem valores por omissão', () => {
    expect(feedKey()).toBe(feedKey({ sort: 'recentes' }));
    expect(feedKey({ topic: 'oracao' })).toBe(feedKey({ topic: 'oracao', kind: '', query: '' }));
  });

  it('muda com cada filtro', () => {
    const base = feedKey();
    expect(feedKey({ bookId: 'b1' })).not.toBe(base);
    expect(feedKey({ topic: 'oracao' })).not.toBe(base);
    expect(feedKey({ kind: 'pergunta' })).not.toBe(base);
    expect(feedKey({ sort: 'sem_resposta' })).not.toBe(base);
    expect(feedKey({ query: 'graça' })).not.toBe(base);
  });
});

describe('readFeed / writeFeed', () => {
  it('devolve o que foi guardado para aqueles filtros', () => {
    const key = feedKey({ topic: 'oracao' });
    writeFeed(key, { posts: [{ id: 'p1' }], hasMore: true }, 0);
    expect(readFeed(key, MIN)).toEqual({ posts: [{ id: 'p1' }], hasMore: true, at: 0 });
    expect(readFeed(feedKey(), MIN)).toBeNull();
  });

  it('expira ao fim de 10 minutos', () => {
    const key = feedKey();
    writeFeed(key, { posts: [] }, 0);
    expect(readFeed(key, 9 * MIN)).not.toBeNull();
    expect(readFeed(key, 11 * MIN)).toBeNull();
    // e sai mesmo, não volta se o relógio andar para trás
    expect(readFeed(key, 0)).toBeNull();
  });

  it('guarda no máximo 12 combinações; as mais antigas saem primeiro', () => {
    for (let i = 0; i < 13; i += 1) writeFeed(feedKey({ query: `q${i}` }), { posts: [i] }, i);
    expect(readFeed(feedKey({ query: 'q0' }), 20)).toBeNull();
    expect(readFeed(feedKey({ query: 'q1' }), 20)).not.toBeNull();
    expect(readFeed(feedKey({ query: 'q12' }), 20)).not.toBeNull();
  });

  it('reescrever uma combinação torna-a a mais recente', () => {
    for (let i = 0; i < 12; i += 1) writeFeed(feedKey({ query: `q${i}` }), { posts: [i] }, i);
    writeFeed(feedKey({ query: 'q0' }), { posts: ['novo'] }, 12);
    writeFeed(feedKey({ query: 'q12' }), { posts: [12] }, 13);
    expect(readFeed(feedKey({ query: 'q0' }), 14)?.posts).toEqual(['novo']);
    expect(readFeed(feedKey({ query: 'q1' }), 14)).toBeNull();
  });

  it('clearFeeds esquece tudo', () => {
    writeFeed(feedKey(), { posts: [1] });
    clearFeeds();
    expect(readFeed(feedKey())).toBeNull();
  });
});
