// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { ROUTES, headersFor, isPostId, postShareMeta } from './partilha-comunidade.mjs';

const post = {
  id: 'abc123def456ghi', kind: 'citacao', author_name: 'Ana Bettencourt', body: 'Leio-a sempre que começo o dia.',
  quote: 'O Céu é uma escola.', book_title: 'Educação', book_cover: 'https://cdn.example/capa.webp',
};

describe('postShareMeta', () => {
  it('título com tipo, autor e livro; citação na descrição', () => {
    const m = postShareMeta(post, 'https://livrariaadventista.com/');
    expect(m.title).toBe('Citação de Ana Bettencourt sobre «Educação» — Comunidade');
    expect(m.description).toBe('“O Céu é uma escola.” — Leio-a sempre que começo o dia.');
    expect(m.image).toBe('https://cdn.example/capa.webp');
    expect(m.imageAlt).toBe('Capa de Educação');
    expect(m.url).toBe('https://livrariaadventista.com/comunidade/p/abc123def456ghi');
  });
  it('sem livro nem capa: título curto e imagem genérica', () => {
    const m = postShareMeta({ id: 'x1y2z3w4', kind: 'pergunta', author_name: 'João', body: 'Plano para Daniel?' }, 'https://x.pt');
    expect(m.title).toBe('Pergunta de João — Comunidade');
    expect(m.image).toBe('');
  });
  it('recusa imagens que não são https', () => {
    expect(postShareMeta({ ...post, book_cover: 'javascript:alert(1)' }, 'https://x.pt').image).toBe('');
    expect(postShareMeta({ ...post, book_cover: 'http://inseguro/capa.png' }, 'https://x.pt').image).toBe('');
    expect(postShareMeta({ ...post, book_cover: '//outro.site/capa.png' }, 'https://x.pt').image).toBe('');
  });
  it('completa as capas do próprio site com a origem', () => {
    expect(postShareMeta({ ...post, book_cover: '/images/capas/LIV-039.jpg' }, 'https://x.pt/').image).toBe('https://x.pt/images/capas/LIV-039.jpg');
  });
  it('corta textos longos e nunca fica vazia', () => {
    expect(postShareMeta({ ...post, kind: 'discussao', body: 'palavra '.repeat(100) }, 'https://x.pt').description.length).toBeLessThanOrEqual(180);
    expect(postShareMeta({ id: 'a1b2c3d4', body: '' }, 'https://x.pt').description).toMatch(/Comunidade de Leitores/);
  });
});

describe('isPostId', () => {
  it('aceita ids da base de dados e recusa o resto', () => {
    expect(isPostId('k5efw0qeuyripw2')).toBe(true);
    expect(isPostId('../etc')).toBe(false);
    expect(isPostId('')).toBe(false);
    expect(isPostId('a'.repeat(40))).toBe(false);
  });
});

describe('headersFor', () => {
  const text = `# comentário
/*
  X-Frame-Options: SAMEORIGIN
  # nota
  Content-Security-Policy: default-src 'self'; img-src 'self' https:

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
  it('lê só o bloco pedido, sem comentários', () => {
    expect(headersFor(text)).toEqual({
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' https:",
    });
    expect(headersFor(text, '/assets/*')).toEqual({ 'Cache-Control': 'public, max-age=31536000, immutable' });
  });
});

it('a Function só corre nas publicações', () => {
  expect(ROUTES.include).toEqual(['/comunidade/p/*']);
});
