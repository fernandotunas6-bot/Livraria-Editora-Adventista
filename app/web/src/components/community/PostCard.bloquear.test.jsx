// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Bloquear na comunidade (regra 1.2 da App Store): o menu do cartão e o que deixa de aparecer.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let bloqueadas = new Set();
const bloquear = vi.fn(async () => '');
const desbloquear = vi.fn(async () => '');
vi.mock('@/lib/communityBlocks', () => ({
  useBloqueios: () => ({ bloqueado: (k) => bloqueadas.has(k), bloquear, desbloquear, lista: [], podeBloquear: true }),
}));
vi.mock('@/hooks/useReader', () => ({ useReaderLevel: () => null }));

const { default: PostCard } = await import('./PostCard');

const post = (extra = {}) => ({
  id: 'p1', body: 'Um livro que recomendo a todos.', author_name: 'Ana Silva', author_key: 'k-ana', mine: false,
  author_is_staff: false, likes_count: 0, replies_count: 0, created: '2026-11-17T10:00:00Z', kind: 'discussao', links: [], ...extra,
});

let root;
let host;
async function render(el) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  bloqueadas = new Set();
  vi.clearAllMocks();
});

const abrirMenu = async (el, indice = 0) => {
  const botoes = [...el.querySelectorAll('button[aria-label="Mais acções"]')];
  await act(async () => {
    botoes[indice].focus();
    botoes[indice].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
};
const itemDoMenu = (texto) => [...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent.includes(texto));
const botao = (el, texto) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

describe('bloquear na comunidade', () => {
  it('«Bloquear Ana» no menu, com confirmação, bloqueia pela chave de leitor', async () => {
    const el = await render(<PostCard post={post()} signedIn onLike={() => {}} onReport={async () => ''} onRemove={async () => ''} onNeedAuth={() => {}} />);
    await abrirMenu(el);
    const item = itemDoMenu('Bloquear Ana');
    expect(item).toBeTruthy();
    await act(async () => { item.click(); });
    expect(el.textContent).toContain('Bloquear Ana Silva?');
    await act(async () => { botao(el, 'Bloquear').click(); });
    expect(bloquear).toHaveBeenCalledWith('k-ana', 'Ana Silva');
  });

  it('sem sessão, bloquear pede para entrar', async () => {
    const onNeedAuth = vi.fn();
    const el = await render(<PostCard post={post()} signedIn={false} onLike={() => {}} onReport={async () => ''} onRemove={async () => ''} onNeedAuth={onNeedAuth} />);
    await abrirMenu(el);
    await act(async () => { itemDoMenu('Bloquear Ana').click(); });
    expect(onNeedAuth).toHaveBeenCalled();
    expect(bloquear).not.toHaveBeenCalled();
  });

  it('não se bloqueia o próprio nem a equipa', async () => {
    let el = await render(<PostCard post={post({ mine: true })} signedIn onNeedAuth={() => {}} />);
    await abrirMenu(el);
    expect(itemDoMenu('Bloquear')).toBeUndefined();
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    el = await render(<PostCard post={post({ author_is_staff: true })} signedIn onNeedAuth={() => {}} />);
    await abrirMenu(el);
    expect(itemDoMenu('Bloquear')).toBeUndefined();
  });

  it('a publicação de quem foi bloqueado não aparece no feed; na página dela, um aviso para desbloquear', async () => {
    bloqueadas = new Set(['k-ana']);
    let el = await render(<PostCard post={post()} signedIn onNeedAuth={() => {}} />);
    expect(el.querySelector('article')).toBeNull();
    act(() => root.unmount());
    host.remove();
    el = await render(<PostCard post={post()} full signedIn onNeedAuth={() => {}} />);
    expect(el.querySelector('[data-autor-bloqueado]').textContent).toContain('Bloqueou quem escreveu esta publicação');
    await act(async () => { botao(el, 'Desbloquear Ana').click(); });
    expect(desbloquear).toHaveBeenCalledWith('k-ana');
  });

  it('as respostas de quem foi bloqueado também saem, as dos outros ficam', async () => {
    bloqueadas = new Set(['k-bruno']);
    const respostas = [
      post({ id: 'r1', parent_id: 'p1', author_name: 'Bruno Costa', author_key: 'k-bruno', body: 'Resposta do Bruno' }),
      post({ id: 'r2', parent_id: 'p1', author_name: 'Carla Neto', author_key: 'k-carla', body: 'Resposta da Carla' }),
    ];
    const el = await render(<PostCard post={post({ replies_count: 2 })} replies={respostas} full signedIn onNeedAuth={() => {}} />);
    expect(el.textContent).toContain('Resposta da Carla');
    expect(el.textContent).not.toContain('Resposta do Bruno');
  });
});
