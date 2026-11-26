// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const livro = vi.fn();
vi.mock('@/api/PlatformApi', () => ({
  kangestPostoCodigo: vi.fn(), kangestPostoConfigurar: vi.fn(), kangestPostoCriar: vi.fn(), kangestPostoRevogar: vi.fn(),
  kangestPostos: vi.fn(), kangestPostoLivro: (...a) => livro(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { LivroDoPosto } = await import('./KanGestPostos');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  livro.mockReset();
});

const ID = '11111111-1111-4111-8111-111111111111';

describe('LivroDoPosto (KANGEST ONE, B1)', () => {
  it('à espera da abertura', async () => {
    await mount(<LivroDoPosto p={{ id: ID, livro: { movimentos: 0, aberto: false, divergencias: 0 } }} />);
    expect(host.textContent).toContain('à espera da abertura');
  });

  it('bate certo', async () => {
    await mount(<LivroDoPosto p={{ id: ID, livro: { movimentos: 42, aberto: true, divergencias: 0 } }} />);
    expect(host.textContent).toContain('42 movimento(s)');
    expect(host.textContent).toContain('bate certo com o posto');
  });

  it('com diferenças, «Ver» mostra-as', async () => {
    livro.mockResolvedValue({ diferencas: [{ armazem_id: 2, referencia: 'LIV-001', livro: '0', fotografia: '1' }] });
    await mount(<LivroDoPosto p={{ id: ID, livro: { movimentos: 6, aberto: true, divergencias: 1 } }} />);
    expect(host.textContent).toContain('1 diferença(s) com o posto');
    const botao = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Ver');
    await act(async () => botao.click());
    await flush();
    expect(livro).toHaveBeenCalledWith(ID);
    expect(host.querySelector('table')?.textContent).toContain('LIV-001');
  });

  it('sem livro (um site sem a migração), nada', async () => {
    await mount(<LivroDoPosto p={{ id: ID, livro: null }} />);
    expect(host.textContent).toBe('');
  });
});
