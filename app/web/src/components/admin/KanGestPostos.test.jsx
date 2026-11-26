// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const terminar = vi.fn();
const livro = vi.fn();
vi.mock('@/api/PlatformApi', () => ({
  kangestPostoCodigo: vi.fn(), kangestPostoConfigurar: vi.fn(), kangestPostoCriar: vi.fn(), kangestPostoRevogar: vi.fn(),
  kangestPostos: vi.fn(), kangestSessaoTerminar: (...a) => terminar(...a), kangestPostoLivro: (...a) => livro(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { LivroDoPosto, LivroDoSite, SessoesDoPosto } = await import('./KanGestPostos');

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
  terminar.mockReset();
  livro.mockReset();
  vi.restoreAllMocks();
});

const POSTO = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'Loja do Lubango',
  sessoes: [
    { sessao: '0123456789abcdef', nome: 'Admin', login: 'admin', perfil: 'ADMIN', recurso: true, conta_site: false, aparelho: 'Programa KanGest (Posto#1)', inicio: '2026-11-26T09:00:00Z' },
    { sessao: 'fedcba9876543210', nome: 'Ana', login: 'ana@exemplo.ao', perfil: 'CAIXA', recurso: false, conta_site: true, offline: true, aparelho: 'Chrome (Windows)', inicio: '2026-11-26T08:00:00Z' },
    { sessao: 'aaaaaaaaaaaaaaaa', nome: 'Rui', login: 'rui', perfil: 'GESTOR', recurso: false, conta_site: false, revogar_em: '2026-11-26T10:00:00Z' },
    { sessao: 'bbbbbbbbbbbbbbbb', nome: 'Velha', login: 'velha', perfil: 'CAIXA', fim: '2026-11-25T18:00:00Z', motivo: 'revogada' },
  ],
};

describe('SessoesDoPosto (KANGEST ONE, A3)', () => {
  it('mostra quem está dentro, marca o ADMIN de recurso e a conta local, e esconde as terminadas', async () => {
    await mount(<SessoesDoPosto p={POSTO} />);
    const t = host.textContent;
    expect(t).toContain('3 pessoas dentro do KanGest');
    expect(t).toContain('ADMIN de recurso');
    expect(t).toContain('conta local');
    expect(t).toContain('sem Internet');
    expect(t).toContain('a terminar na próxima sincronização');
    expect(t).toContain('1 sessão(ões) terminada(s) nos últimos 7 dias');
    expect(t).toContain('terminada no painel');
    // dois botões «Terminar»: a do Rui já foi pedida
    expect([...host.querySelectorAll('button')].filter((b) => b.textContent.includes('Terminar'))).toHaveLength(2);
  });

  it('«Terminar» pede confirmação e chama o servidor com o posto e a chave', async () => {
    const recarregar = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    terminar.mockResolvedValue({ sessao: '0123456789abcdef' });
    await mount(<SessoesDoPosto p={POSTO} onTerminada={recarregar} />);
    const botao = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Terminar'));
    await act(async () => botao.click());
    expect(terminar).not.toHaveBeenCalled();
    await act(async () => botao.click());
    await flush();
    expect(terminar).toHaveBeenCalledWith(POSTO.id, '0123456789abcdef');
    expect(recarregar).toHaveBeenCalled();
  });

  it('sem sessões, não mostra nada', async () => {
    await mount(<SessoesDoPosto p={{ ...POSTO, sessoes: [] }} />);
    expect(host.textContent).toBe('');
  });
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

describe('LivroDoSite (KANGEST ONE, B2)', () => {
  it('as reservas por libertar', async () => {
    await mount(<LivroDoSite resumo={{ reservas_abertas: 3, unidades: 5, encomendas: 2 }} />);
    expect(host.textContent).toContain('5 unidade(s) reservada(s) em 2 encomenda(s)');
  });

  it('nenhuma, ou sem a migração', async () => {
    await mount(<LivroDoSite resumo={{ reservas_abertas: 0, unidades: 0, encomendas: 0 }} />);
    expect(host.textContent).toContain('nenhuma reserva por libertar');
    act(() => root.unmount());
    host.remove();
    await mount(<LivroDoSite resumo={null} />);
    expect(host.textContent).toBe('');
  });
});

describe('LivroDoPosto: o stock negativo (o que faltava, 26/11)', () => {
  it('avisa e, com «Ver», diz quais', async () => {
    livro.mockResolvedValue({ diferencas: [], negativos: [{ armazem_id: 1, referencia: 'LIV-001', livro: '-2' }] });
    await mount(<LivroDoPosto p={{ id: ID, livro: { movimentos: 9, aberto: true, divergencias: 0, negativos: 1 } }} />);
    expect(host.textContent).toContain('1 artigo(s) com stock negativo');
    expect(host.textContent).not.toContain('bate certo');
    const botao = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Ver');
    await act(async () => botao.click());
    await flush();
    expect(host.textContent).toContain('LIV-001 (armazém 1: -2)');
  });
});
