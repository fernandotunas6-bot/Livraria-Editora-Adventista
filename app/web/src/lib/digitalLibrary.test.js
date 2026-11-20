import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const insert = vi.fn();
const del = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({
      insert: (...a) => insert(...a),
      delete: () => ({ eq: () => ({ eq: (...a) => del(...a) }) }),
    }),
  },
}));

const {
  DIGITAL_STATES, STATE_ORDER, blockDigitalAccess, countByState, digitalState, downloadsLabel, inlinePdfSupported,
  libraryActions, libraryHint, loadDigitalAccess, loadMyLibrary,
} = await import('@/lib/digitalLibrary');

afterEach(() => { rpc.mockReset(); insert.mockReset(); del.mockReset(); });

describe('estados', () => {
  it('os mesmos estados que a base de dados (private.digital_state)', () => {
    expect(STATE_ORDER.sort()).toEqual(['awaiting_payment', 'blocked', 'no_account', 'open', 'partially_paid', 'payment_review', 'refunded']);
  });

  it('um estado desconhecido conta como por pagar (nunca como aberto)', () => {
    expect(digitalState('xpto')).toBe(DIGITAL_STATES.awaiting_payment);
  });
});

describe('libraryActions', () => {
  it('disponível: abrir e descarregar; no Android só descarregar', () => {
    expect(libraryActions({ state: 'open' })).toEqual(['open', 'download']);
    expect(libraryActions({ state: 'open' }, { inlinePdf: false })).toEqual(['download']);
  });

  it('por pagar ou pago em parte: o caminho para pagar; por confirmar: esperar', () => {
    expect(libraryActions({ state: 'awaiting_payment' })).toEqual(['pay']);
    expect(libraryActions({ state: 'partially_paid' })).toEqual(['pay']);
    expect(libraryActions({ state: 'payment_review' })).toEqual([]);
  });

  it('fechado (bloqueado ou reembolsado): falar connosco, nunca descarregar', () => {
    expect(libraryActions({ state: 'blocked' })).toEqual(['contact']);
    expect(libraryActions({ state: 'refunded' })).toEqual(['contact']);
  });
});

describe('libraryHint', () => {
  it('pago em parte: quanto falta', () => {
    expect(libraryHint({ state: 'partially_paid', total: 3000, amount_paid: 1000, order_number: 'ENC-7' })).toMatch(/^Falta pagar .*2.?000.* da encomenda ENC-7\.$/);
  });

  it('os outros estados explicam o que acontece', () => {
    expect(libraryHint({ state: 'awaiting_payment' })).toMatch(/quando o pagamento da encomenda for confirmado/);
    expect(libraryHint({ state: 'blocked' })).toMatch(/bloqueado pela loja/);
    expect(libraryHint({ state: 'open' })).toBe('');
  });
});

describe('inlinePdfSupported', () => {
  it('o Chrome do Android descarrega os PDFs em vez de os mostrar', () => {
    expect(inlinePdfSupported('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130')).toBe(false);
    expect(inlinePdfSupported('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).toBe(true);
    expect(inlinePdfSupported('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe(true);
  });
});

describe('downloadsLabel / countByState', () => {
  it('quantas vezes abriu e a última', () => {
    expect(downloadsLabel(0)).toBe('Ainda não abriu');
    expect(downloadsLabel(1, null)).toBe('Aberto 1 vez');
    expect(downloadsLabel(3, '2026-11-08T10:00:00Z')).toMatch(/^Aberto 3 vezes · última a /);
  });

  it('conta cada estado (os desconhecidos não contam)', () => {
    const c = countByState([{ state: 'open' }, { state: 'open' }, { state: 'payment_review' }, { state: 'xpto' }]);
    expect(c.open).toBe(2);
    expect(c.payment_review).toBe(1);
    expect(c.blocked).toBe(0);
  });
});

describe('API', () => {
  it('a biblioteca lê my_digital_library; sem a migração, vazia', async () => {
    rpc.mockResolvedValueOnce({ data: [{ download_id: 'd1' }], error: null });
    expect(await loadMyLibrary()).toEqual([{ download_id: 'd1' }]);
    expect(rpc).toHaveBeenCalledWith('my_digital_library');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await loadMyLibrary()).toEqual([]);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'falhou' } });
    await expect(loadMyLibrary()).rejects.toThrow('falhou');
  });

  it('o painel pede tudo ao servidor (até 500) e diz quando falta a migração', async () => {
    rpc.mockResolvedValueOnce({ data: [{ state: 'open' }], error: null });
    expect(await loadDigitalAccess({ search: 'maria' })).toEqual({ rows: [{ state: 'open' }], missing: false });
    expect(rpc).toHaveBeenCalledWith('digital_access_overview', { p_search: 'maria', p_state: '', p_limit: 500 });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function does not exist' } });
    expect(await loadDigitalAccess()).toEqual({ rows: [], missing: true });
  });

  it('bloquear pede um motivo e explica o bloqueio repetido', async () => {
    await expect(blockDigitalAccess({ downloadId: 'd1', userId: 'u1', reason: ' x ' })).rejects.toThrow(/motivo/);
    insert.mockResolvedValueOnce({ error: null });
    await blockDigitalAccess({ downloadId: 'd1', userId: 'u1', reason: '  Partilhou   o ficheiro ' });
    expect(insert).toHaveBeenCalledWith({ download_id: 'd1', user_id: 'u1', reason: 'Partilhou o ficheiro' });
    insert.mockResolvedValueOnce({ error: { message: 'duplicate key value violates unique constraint "download_blocks_one"' } });
    await expect(blockDigitalAccess({ downloadId: 'd1', userId: 'u1', reason: 'Outra vez' })).rejects.toThrow('já está bloqueado');
  });
});
