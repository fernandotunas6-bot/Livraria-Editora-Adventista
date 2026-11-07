import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = { user: { id: 'u1' }, isAuthed: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const api = {
  PAGE_SIZE: 20,
  isMissingTable: (e) => e?.code === '42P01',
  loadPosts: vi.fn(),
  loadReplies: vi.fn(),
  loadMyLikes: vi.fn(),
  createPost: vi.fn(),
  setLike: vi.fn(),
  reportPost: vi.fn(),
  deletePost: vi.fn(),
};
vi.mock('@/lib/communityApi', () => api);

const { groupReplies, useCommunity } = await import('./useCommunity');

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
  host = document.createElement('div');
  root = createRoot(host);
  auth.isAuthed = true;
  Object.values(api).forEach((f) => typeof f === 'function' && f.mockReset?.());
  api.loadPosts.mockResolvedValue([post('p1'), post('p2')]);
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

describe('useCommunity', () => {
  it('carrega publicações, respostas e os gostos próprios', async () => {
    await render({ bookId: 'b1' });
    expect(api.loadPosts).toHaveBeenCalledWith({ bookId: 'b1', before: null });
    expect(state.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(state.replies.p1.map((r) => r.id)).toEqual(['r1']);
    expect(state.liked.has('p2')).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('sem a tabela (migração por aplicar) fica indisponível, sem erro', async () => {
    api.loadPosts.mockRejectedValue(Object.assign(new Error('x'), { code: '42P01' }));
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
    expect(api.createPost).toHaveBeenCalledWith('u1', expect.objectContaining({ body: 'Olá https://a.ao', links: ['https://a.ao/'] }));
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
});
