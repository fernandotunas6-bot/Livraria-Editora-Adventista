import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O primeiro render (Radix no jsdom) pode passar dos 5 s numa máquina carregada.
vi.setConfig({ testTimeout: 30000 });

const api = vi.hoisted(() => ({ loadDeliveriesBoard: vi.fn(), handoverDelivery: vi.fn() }));
vi.mock('@/lib/colporteurApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));

const { default: DeliveriesPanel, deliveryStage } = await import('./DeliveriesPanel');
const { kz } = await import('@/lib/colporteurCommission');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><DeliveriesPanel /></MemoryRouter>));
  await act(async () => {});
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
const button = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

const bento = { id: 'k1', name: 'Bento', code: 'CPT-0002', phone: '923111222' };
const BOARD = {
  days: 30,
  active: [
    { id: 'p1', status: 'accepted', source: 'loja', picked_up_at: null, fee: 1500, order_number: 'ENC-2', order_id: 'o2', place: 'Zango, Viana', items: 3, colporteur: bento },
    { id: 'w1', status: 'offered', source: '', fee: 1500, order_number: 'ENC-1', order_id: 'o1', place: 'Viana', items: 1,
      expires_at: new Date(Date.now() + 3600000).toISOString(), colporteur: bento },
    { id: 's1', status: 'accepted', source: 'stock', fee: 0, order_number: 'ENC-3', order_id: 'o3', place: 'Cacuaco', items: 2, colporteur: bento },
  ],
  to_team: [{ order_id: 'o9', order_number: 'ENC-9', place: 'Huambo', reason: 'Ninguém aceitou a entrega.' }],
  by_colporteur: [{ id: 'k1', name: 'Bento', code: 'CPT-0002', offered: 6, delivered: 4, declined: 1, expired: 1, released: 0, active: 3, fees: 6000 }],
  totals: { offered: 6, delivered: 4, declined: 1, expired: 1, released: 0, fees: 6000, orders_offered: 5, orders_by_colporteur: 4 },
};

describe('em que ponto está cada entrega', () => {
  it('à espera, preparar na loja, com o colportor', () => {
    expect(deliveryStage({ status: 'offered' }).key).toBe('waiting');
    expect(deliveryStage({ status: 'accepted', source: 'loja', picked_up_at: null }).key).toBe('prepare');
    expect(deliveryStage({ status: 'accepted', source: 'loja', picked_up_at: '2026-11-08T10:00:00Z' }).key).toBe('out');
    expect(deliveryStage({ status: 'accepted', source: 'stock' }).detail).toBe('com os livros dele');
  });
});

describe('painel → Colportagem → Entregas', () => {
  it('números do quadro, ligações às encomendas e o que fica com a equipa', async () => {
    api.loadDeliveriesBoard.mockResolvedValue(BOARD);
    const el = await mount();
    expect(api.loadDeliveriesBoard).toHaveBeenCalledWith(30);
    const cards = [...el.querySelectorAll('.grid > div')].map((c) => c.textContent);
    expect(cards).toContain('Preparar na loja1');
    expect(cards).toContain('À espera de resposta1');
    expect(cards).toContain('Com os colportores1');
    expect(cards).toContain('Com a equipa1');
    expect(cards).toContain('Recusadas ou sem resposta2');
    expect(cards).toContain(`Ganhos dos colportores${kz(6000)}`);
    expect(cards).toContain('Encomendas entregues por colportor4 de 5');
    expect(el.querySelector('a[href="/admin?tab=orders&encomenda=ENC-2"]')).toBeTruthy();
    expect(el.querySelector('a[href="/admin?tab=orders&encomenda=ENC-9"]')).toBeTruthy();
    expect(el.textContent).toContain('Ninguém aceitou a entrega.');
    expect(el.querySelector('a[href="tel:923111222"]')).toBeTruthy();
  });

  it('só a que se levanta na loja tem «Entregue ao colportor», e recarrega depois', async () => {
    api.loadDeliveriesBoard.mockResolvedValue(BOARD);
    api.handoverDelivery.mockResolvedValue({});
    const el = await mount();
    const botoes = [...el.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Entregue ao colportor');
    expect(botoes).toHaveLength(1);
    await act(async () => botoes[0].click());
    expect(api.handoverDelivery).toHaveBeenCalledWith('p1');
    expect(api.loadDeliveriesBoard).toHaveBeenCalledTimes(2);
  });

  it('mudar o período volta a pedir o quadro', async () => {
    api.loadDeliveriesBoard.mockResolvedValue(BOARD);
    const el = await mount();
    const select = el.querySelector('select[aria-label="Período"]');
    await act(async () => {
      select.value = '90';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.loadDeliveriesBoard).toHaveBeenLastCalledWith(90);
  });

  it('sem a migração, explica e deixa tentar de novo', async () => {
    api.loadDeliveriesBoard.mockRejectedValue(new Error('A função colporteur_deliveries_board não existe.'));
    const el = await mount();
    expect(el.textContent).toContain('Não foi possível abrir o quadro das entregas.');
    expect(button(el, 'Tentar de novo')).toBeTruthy();
  });

  it('sem entregas, diz que não há', async () => {
    api.loadDeliveriesBoard.mockResolvedValue({ days: 30, active: [], to_team: [], by_colporteur: [], totals: {} });
    const el = await mount();
    expect(el.textContent).toContain('Nenhuma entrega com colportores neste momento.');
    expect(el.textContent).toContain('Ainda nenhum colportor recebeu entregas neste período.');
    expect(button(el, 'Excel').disabled).toBe(true);
  });
});
