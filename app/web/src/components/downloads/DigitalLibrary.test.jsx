import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Perfil → Biblioteca: os livros digitais da conta, com o estado ligado ao pagamento.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let rows = [];
const loadMyLibrary = vi.fn(async () => rows);
vi.mock('@/lib/digitalLibrary', async (orig) => ({ ...(await orig()), loadMyLibrary, inlinePdfSupported: () => true }));
const getDownloadUrl = vi.fn(async () => 'https://supabase.invalid/storage/v1/object/sign/downloads/files/x.pdf?token=t');
vi.mock('@/lib/downloadsApi', () => ({ getDownloadUrl }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: DigitalLibrary } = await import('./DigitalLibrary');

let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><DigitalLibrary userId="u1" /></MemoryRouter>));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const card = (state) => host.querySelector(`[data-livro-digital="${state}"]`);
const button = (scope, text) => [...scope.querySelectorAll('button, a')].find((b) => b.textContent.includes(text));

const BASE = { title: 'O Desejado (PDF)', kind: 'livro', edition: '', file_size: 2_400_000, order_number: 'ENC-1', ordered_at: '2026-11-08T10:00:00Z', total: 3000, amount_paid: 0, downloads: 0 };

beforeEach(() => {
  rows = [];
  loadMyLibrary.mockClear();
  getDownloadUrl.mockClear();
  toast.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('DigitalLibrary', () => {
  it('sem livros: explica quando aparecem', async () => {
    await mount();
    expect(host.textContent).toContain('Ainda não tem livros digitais.');
    expect(host.textContent).toContain('abre assim que o pagamento for confirmado');
  });

  it('separa os disponíveis dos que esperam pelo pagamento, com o botão certo em cada um', async () => {
    rows = [
      { ...BASE, download_id: 'a', state: 'open', downloads: 2, last_download: '2026-11-08T11:00:00Z' },
      { ...BASE, download_id: 'b', title: 'Revista (PDF)', state: 'awaiting_payment' },
      { ...BASE, download_id: 'c', title: 'Lição (PDF)', state: 'payment_review' },
      { ...BASE, download_id: 'd', title: 'Guia (PDF)', state: 'blocked' },
    ];
    await mount();
    expect(host.textContent).toContain('Disponíveis (1)');
    expect(host.textContent).toContain('À espera do pagamento ou fechados (3)');
    expect(button(card('open'), 'Abrir')).toBeTruthy();
    expect(button(card('open'), 'Descarregar')).toBeTruthy();
    expect(card('open').textContent).toContain('Aberto 2 vezes');
    // Por pagar: nunca descarregar; o caminho é pagar a encomenda.
    expect(button(card('awaiting_payment'), 'Descarregar')).toBeFalsy();
    expect(button(card('awaiting_payment'), 'Ver a encomenda e pagar').getAttribute('href')).toBe('/profile?tab=orders');
    expect(card('payment_review').textContent).toContain('abre assim que a loja o confirmar');
    expect(button(card('payment_review'), 'Abrir')).toBeFalsy();
    expect(button(card('blocked'), 'Falar connosco')).toBeTruthy();
  });

  it('"Abrir" mostra o PDF num separador novo; "Descarregar" fica na página', async () => {
    rows = [{ ...BASE, download_id: 'a', state: 'open' }];
    const win = { location: { href: '' }, close: vi.fn(), opener: 'x' };
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    await mount();
    await act(async () => { button(card('open'), 'Abrir').click(); });
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(getDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ download_id: 'a' }), { mode: 'open' });
    expect(win.location.href).toContain('/storage/v1/object/sign/');
    expect(win.opener).toBeNull();
    open.mockRestore();
  });

  it('se o servidor recusa (pagamento entretanto anulado), fecha o separador e diz porquê', async () => {
    rows = [{ ...BASE, download_id: 'a', state: 'open' }];
    const win = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    getDownloadUrl.mockRejectedValueOnce(new Error('Este livro abre quando o pagamento da encomenda estiver confirmado.'));
    await mount();
    await act(async () => { button(card('open'), 'Abrir').click(); });
    expect(win.close).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringContaining('pagamento') }));
    open.mockRestore();
  });
});
