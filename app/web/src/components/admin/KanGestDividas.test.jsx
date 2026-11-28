// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dividas = vi.fn();
vi.mock('@/api/PlatformApi', () => ({ relatorioDividas: (...a) => dividas(...a) }));
const { default: KanGestDividas } = await import('./KanGestDividas');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  dividas.mockReset();
});

describe('as dívidas de cada loja', () => {
  it('as vencidas primeiro, o total por receber e por loja', async () => {
    dividas.mockResolvedValue({
      dividas: [
        { store_id: 'huambo', origem: 'site', numero: 'LIV-9', data: '2026-11-20', vencimento: null, total: 5000, pendente: 2000, cliente: 'Rui' },
        { store_id: 'huambo', origem: 'balcao', numero: 'FT K2026/3', data: '2026-10-01', vencimento: '2026-10-31', total: 11400, pendente: 1140, cliente: 'Ana Silva' },
      ],
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<KanGestDividas lojas={[{ id: 'huambo', name: 'Livraria do Huambo' }]} />));
    await flush();
    expect(dividas).toHaveBeenCalledWith('');
    const t = host.textContent.replace(/ /g, ' ');
    expect(t).toContain('3 140,00 Kz');
    expect(t).toContain('Livraria do Huambo');
    const linhas = [...host.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(linhas[0]).toContain('FT K2026/3');
    expect(linhas[0]).toContain('Vencida');
    expect(linhas[1]).toContain('LIV-9');
  });
});
