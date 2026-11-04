import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O pedido do checkout perdia duas coisas sem nada falhar: a sessão (a encomenda chegava
// sempre anónima, sem `customer_id`) e as coordenadas GPS (o carrinho mandava-as, mas a
// função só reenviava os campos que nomeava). Estes testes fixam o pedido que sai.

const getSession = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  APP_API_URL: 'https://api.exemplo.invalid/functions/v1/app',
  mediaUrl: () => '',
  supabase: { auth: { getSession: (...a) => getSession(...a) } },
}));
vi.mock('@/lib/dataClient', () => ({ default: {} }));

const { initializeCheckout } = await import('./EcommerceApi');

const base = {
  items: [{ variant_id: 'livro1-default', quantity: 1 }],
  customerEmail: 'cliente@exemplo.invalid',
  customerName: 'Cliente',
  phone: '+244900000000',
  shippingMethod: 'delivery',
};

describe('initializeCheckout', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ orderId: '1' }) }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    getSession.mockReset();
  });

  const sent = () => {
    const [, init] = fetchMock.mock.calls[0];
    return { headers: init.headers, body: JSON.parse(init.body) };
  };

  it('envia a sessão quando há cliente com sessão iniciada', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    await initializeCheckout(base);
    expect(sent().headers.Authorization).toBe('Bearer tok-123');
  });

  it('sem sessão, o pedido segue sem Authorization (levantamento na loja não exige conta)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await initializeCheckout({ ...base, shippingMethod: 'pickup' });
    expect(sent().headers).not.toHaveProperty('Authorization');
  });

  it('uma falha a ler a sessão não impede a compra', async () => {
    getSession.mockRejectedValue(new Error('storage indisponível'));
    await initializeCheckout(base);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('as coordenadas GPS chegam ao servidor', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await initializeCheckout({ ...base, deliveryGpsLat: -8.83, deliveryGpsLng: 13.23 });
    expect(sent().body).toMatchObject({ deliveryGpsLat: -8.83, deliveryGpsLng: 13.23 });
  });

  it('a chave de idempotência chega ao servidor, e só quando existe', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await initializeCheckout({ ...base, idempotencyKey: '0b6f3c1e-9a7d-4c2b-8e1f-5d4a3b2c1d0e' });
    expect(sent().body.idempotencyKey).toBe('0b6f3c1e-9a7d-4c2b-8e1f-5d4a3b2c1d0e');
    fetchMock.mockClear();
    await initializeCheckout(base);
    expect(sent().body).not.toHaveProperty('idempotencyKey');
  });
});
