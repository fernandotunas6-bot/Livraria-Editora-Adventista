// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = { user: { id: 'u1' }, isAuthed: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const api = {
  PAGE_SIZE: 20,
  FEED_REPLIES_PER_POST: 2,
  isMissingTable: (e) => e?.code === '42P01',
  listPosts: vi.fn(),
  loadReplies: vi.fn(),
  loadMyLikes: vi.fn(),
  createPost: vi.fn(),
  setLike: vi.fn(),
  reportPost: vi.fn(),
  deletePost: vi.fn(),
  setPinned: vi.fn(),
  setOfficial: vi.fn(),
  setHidden: vi.fn(),
};
vi.mock('@/lib/communityApi', () => api);

const { countNew, groupReplies, matchesFilters, nextCursor, useCommunity } = await import('./useCommunity');
const { clearFeeds } = await import('@/lib/communityFeedCache');

let root;
let host;
let state;
function Probe(props) {
  state = useCommunity(props);
  return null;
}
async function render(props = {}) {
  await act(async () => { root.render(<Probe {...props} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const post = (id, extra = {}) => ({ id, parent_id: null, body: `texto ${id}`, likes_count: 0, created: '2026-11-06T10:00:00Z', ...extra });

beforeEach(() => {
  clearFeeds();
  host = document.createElement('div');
  root = createRoot(host);
  auth.isAuthed = true;
  Object.values(api).forEach((f) => typeof f === 'function' && f.mockReset?.());
  api.listPosts.mockResolvedValue([post('p1'), post('p2')]);
  api.loadReplies.mockResolvedValue([post('r1', { parent_id: 'p1' })]);
  api.loadMyLikes.mockResolvedValue(['p2']);
});
afterEach(() => act(() => root.unmount()));

describe('groupReplies', () => {
  it('junta as respostas por publicação', () => {
    expect(groupReplies([{ id: 'a', parent_id: 'p' }, { id: 'b', parent_id: 'p' }, { id: 'c', parent_id: 'q' }]))
      .toEqual({ p: [{ id: 'a', parent_id: 'p' }, { id: 'b', parent_id: 'p' }], q: [{ id: 'c', parent_id: 'q' }] });
  });
});

describe('nextCursor', () => {
  it('usa a publicação mais antiga que não está fixada', () => {
    expect(nextCursor([
      { created: '2026-11-01', pinned: true }, { created: '2026-11-05' }, { created: '2026-11-03' },
    ])).toBe('2026-11-03');
    expect(nextCursor([{ created: '2026-11-02', pinned: true }])).toBe('2026-11-02');
    expect(nextCursor([])).toBeNull();
  });
});

describe('useCommunity', () => {
  it('passa os filtros e pagina por posição fora de "recentes"', async () => {
    api.listPosts.mockResolvedValue(Array.from({ length: 20 }, (_, i) => post(`x${i}`)));
    await render({ topic: 'familia', kind: 'pergunta', sort: 'em_alta', query: 'lar' });
    expect(api.listPosts).toHaveBeenLastCalledWith({ bookId: null, topic: 'familia', kind: 'pergunta', sort: 'em_alta', query: 'lar', before: null, offset: 0 });
    expect(state.hasMore).toBe(true);
    api.listPosts.mockResolvedValue([post('y1')]);
    await act(async () => { await state.loadMore(); });
    expect(api.listPosts).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'em_alta', offset: 20, before: null }));
    expect(state.posts).toHaveLength(21);
    expect(state.hasMore).toBe(false);
  });

  it('a equipa fixa, marca a resposta oficial (que passa para cima) e oculta', async () => {
    api.loadReplies.mockResolvedValue([post('r1', { parent_id: 'p1' }), post('r2', { parent_id: 'p1', created: '2026-11-06T11:00:00Z' })]);
    await render();
    await act(async () => { await state.pin(state.posts[1]); });
    expect(api.setPinned).toHaveBeenCalledWith('p2', true);
    expect(state.posts[1].pinned).toBe(true);
    await act(async () => { await state.markOfficial(state.replies.p1[1]); });
    expect(api.setOfficial).toHaveBeenCalledWith('r2', true);
    expect(state.replies.p1.map((r) => r.id)).toEqual(['r2', 'r1']);
    await act(async () => { await state.hide(state.posts[0]); });
    expect(api.setHidden).toHaveBeenCalledWith('p1', true);
    expect(state.posts.map((p) => p.id)).toEqual(['p2']);
  });

  it('carrega publicações, respostas e os gostos próprios', async () => {
    await render({ bookId: 'b1' });
    expect(api.listPosts).toHaveBeenCalledWith({ bookId: 'b1', topic: '', kind: '', sort: 'recentes', query: '', before: null, offset: 0 });
    expect(state.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(state.replies.p1.map((r) => r.id)).toEqual(['r1']);
    expect(state.liked.has('p2')).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('sem a tabela (migração por aplicar) fica indisponível, sem erro', async () => {
    api.listPosts.mockRejectedValue(Object.assign(new Error('x'), { code: '42P01' }));
    await render();
    expect(state.unavailable).toBe(true);
    expect(state.error).toBe('');
  });

  it('publicar valida antes de enviar, e põe a publicação no topo', async () => {
    await render();
    let err;
    await act(async () => { err = await state.publish({ body: '   ' }); });
    expect(err).toMatch(/Escreva/);
    expect(api.createPost).not.toHaveBeenCalled();

    api.createPost.mockResolvedValue(post('novo'));
    await act(async () => { err = await state.publish({ body: 'Olá https://a.ao' }); });
    expect(err).toBe('');
    expect(api.createPost).toHaveBeenCalledWith('u1', expect.objectContaining({ body: 'Olá https://a.ao', links: ['https://a.ao/'], kind: 'discussao', topic: null }));
    expect(state.posts[0].id).toBe('novo');
  });

  it('uma resposta vai para debaixo da publicação', async () => {
    await render();
    api.createPost.mockResolvedValue(post('r2', { parent_id: 'p1' }));
    await act(async () => { await state.publish({ body: 'concordo', parentId: 'p1' }); });
    expect(state.replies.p1.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('mostra as mensagens do servidor escritas para quem publica', async () => {
    await render();
    api.createPost.mockRejectedValue(new Error('Muitas publicações seguidas. Tente daqui a pouco.'));
    let err;
    await act(async () => { err = await state.publish({ body: 'mais uma' }); });
    expect(err).toMatch(/Muitas publicações/);
    api.createPost.mockRejectedValue(new Error('violates row-level security policy'));
    await act(async () => { err = await state.publish({ body: 'mais uma' }); });
    expect(err).toBe('Não foi possível publicar. Tente de novo.');
  });

  it('gostar actualiza logo o contador, e sem sessão não faz nada', async () => {
    await render();
    await act(async () => { await state.toggleLike(state.posts[0]); });
    expect(api.setLike).toHaveBeenCalledWith('p1', 'u1', true);
    expect(state.posts[0].likes_count).toBe(1);
    expect(state.liked.has('p1')).toBe(true);

    auth.isAuthed = false;
    await render();
    let r;
    await act(async () => { r = await state.toggleLike(state.posts[0]); });
    expect(r).toBe(false);
    expect(state.signedIn).toBe(false);
  });

  it('apagar tira a publicação ou a resposta da lista', async () => {
    await render();
    await act(async () => { await state.remove(state.replies.p1[0]); });
    expect(state.replies.p1).toEqual([]);
    await act(async () => { await state.remove(state.posts[1]); });
    expect(state.posts.map((p) => p.id)).toEqual(['p1']);
  });

  it('carregar mais com a rede em baixo pára e deixa tentar outra vez', async () => {
    api.listPosts.mockResolvedValue(Array.from({ length: 20 }, (_, i) => post(`p${i}`, { created: `2026-11-06T10:${String(i).padStart(2, '0')}:00Z` })));
    await render();
    expect(state.hasMore).toBe(true);
    api.listPosts.mockRejectedValueOnce(new Error('Failed to fetch'));
    await act(async () => { await state.loadMore(); });
    expect(state.loadMoreFailed).toBe(true);
    expect(state.loadingMore).toBe(false);
    expect(state.error).toBe('');
    api.listPosts.mockResolvedValueOnce([post('mais')]);
    await act(async () => { await state.loadMore(); });
    expect(state.loadMoreFailed).toBe(false);
    expect(state.posts.at(-1).id).toBe('mais');
  });

  it('ao voltar ao feed com os mesmos filtros, as publicações aparecem logo, sem novo pedido', async () => {
    await render({ topic: 'biblia' });
    expect(api.listPosts).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => { root.render(<Probe topic="biblia" />); });
    expect(state.loading).toBe(false);
    expect(state.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(api.listPosts).toHaveBeenCalledTimes(1);
  });

  it('mudar de filtro mantém a lista à vista enquanto chega a nova', async () => {
    await render();
    let resolve;
    api.listPosts.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await act(async () => { root.render(<Probe topic="oracao" />); });
    expect(state.refreshing).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
    await act(async () => { resolve([post('o1', { topic: 'oracao' })]); await new Promise((r) => setTimeout(r, 0)); });
    expect(state.refreshing).toBe(false);
    expect(state.posts.map((p) => p.id)).toEqual(['o1']);
  });

  it('uma publicação de outro tema não aparece no topo do feed filtrado', async () => {
    await render({ topic: 'oracao' });
    api.createPost.mockResolvedValue(post('outro', { topic: 'familia' }));
    await act(async () => { await state.publish({ body: 'sobre família', topic: 'familia' }); });
    expect(state.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('pede só as respostas que o cartão mostra', async () => {
    await render();
    expect(api.loadReplies).toHaveBeenCalledWith(['p1', 'p2'], { perParent: 2 });
  });

  it('conta as publicações novas do topo', async () => {
    await render();
    api.listPosts.mockResolvedValueOnce([post('n1'), post('n2'), post('p1'), post('fixa', { pinned: true })]);
    let n;
    await act(async () => { n = await state.checkNew(); });
    expect(n).toBe(2);
    expect(state.newCount).toBe(2);
  });
});

describe('matchesFilters e countNew', () => {
  it('só entra no feed o que corresponde aos filtros abertos', () => {
    expect(matchesFilters({ id: 'a', topic: 't' }, {})).toBe(true);
    expect(matchesFilters({ id: 'a', topic: 't' }, { topic: 't' })).toBe(true);
    expect(matchesFilters({ id: 'a', topic: 'x' }, { topic: 't' })).toBe(false);
    expect(matchesFilters({ id: 'a', kind: 'pergunta' }, { kind: 'citacao' })).toBe(false);
    expect(matchesFilters({ id: 'a', book_id: 'b2' }, { bookId: 'b1' })).toBe(false);
    expect(matchesFilters({ id: 'a' }, { query: 'fé' })).toBe(false);
    expect(matchesFilters({ id: 'r', parent_id: 'a' }, {})).toBe(false);
  });

  it('não conta as fixadas nem as que já estão à vista', () => {
    expect(countNew([{ id: 'a' }, { id: 'b', pinned: true }, { id: 'c' }], [{ id: 'c' }])).toBe(1);
  });
});
