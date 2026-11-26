// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const saude = vi.fn();
vi.mock('@/api/PlatformApi', () => ({ sistemaSaude: (...a) => saude(...a) }));

const { default: SaudeEcossistema } = await import('./SaudeEcossistema');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<SaudeEcossistema />));
  await flush();
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  saude.mockReset();
});

describe('SaudeEcossistema (KANGEST ONE, E)', () => {
  it('mostra cada peça, os postos e o geral', async () => {
    saude.mockResolvedValue({ data: {
      estado: 'aviso', hora: '2026-11-26T12:00:00Z', api: '1', kangest_min_version: '1.4.9', ultima_migracao: '20261126220000',
      base: { estado: 'ok', ms: 12 }, auth: { estado: 'ok', ms: 30 }, storage: { estado: 'ok', ms: 20 },
      emails: { estado: 'ok', pendentes: 0, falhados: 0, motivo: '' },
      postos: [{ id: 'p1', nome: 'Caixa do Huambo', versao: '1.4.8 Livraria', ultima_sinc: '2026-11-26T11:59:00Z', estado: 'aviso', motivo: 'KanGest 1.4.8 Livraria abaixo da versão mínima 1.4.9' }],
    } });
    await mount();
    const t = host.textContent;
    expect(t).toContain('Ecossistema');
    expect(t).toContain('Atenção');
    expect(t).toContain('Base de dados');
    expect(t).toContain('Caixa do Huambo');
    expect(t).toContain('abaixo da versão mínima 1.4.9');
    expect(t).toContain('20261126220000');
  });

  it('sem permissão não mostra nada; outro erro diz-se', async () => {
    saude.mockRejectedValue(Object.assign(new Error('Sem permissão'), { status: 403 }));
    await mount();
    expect(host.textContent).toBe('');
    act(() => root.unmount());
    host.remove();
    saude.mockRejectedValue(Object.assign(new Error('A rede caiu'), { status: 0 }));
    await mount();
    expect(host.textContent).toContain('A rede caiu');
  });
});
