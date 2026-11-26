// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const terminar = vi.fn();
vi.mock('@/api/PlatformApi', () => ({
  kangestPostoCodigo: vi.fn(), kangestPostoConfigurar: vi.fn(), kangestPostoCriar: vi.fn(), kangestPostoRevogar: vi.fn(),
  kangestPostos: vi.fn(), kangestSessaoTerminar: (...a) => terminar(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SessoesDoPosto } = await import('./KanGestPostos');

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
