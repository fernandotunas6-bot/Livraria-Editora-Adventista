import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/dataClient', () => ({ default: { authStore: { token: 't' } } }));
vi.mock('@/lib/supabaseClient', () => ({ APP_API_URL: 'https://api.exemplo.ao/app', supabase: { rpc: (...a) => rpc(...a) } }));

const { setUserSuspended, deleteUser, notifiedDescription } = await import('@/lib/usersApi');

const reply = (status, body) => Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) });

describe('suspender e apagar contas', () => {
  beforeEach(() => { rpc.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('vão pela Edge Function, que é quem avisa o cliente', async () => {
    const fetch = vi.fn(() => reply(200, { ok: true, suspended: true, changed: true, email_notified: true }));
    vi.stubGlobal('fetch', fetch);
    const r = await setUserSuspended('u1', true);
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.exemplo.ao/app/admin/users/status');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ id: 'u1', suspended: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(r.email_notified).toBe(true);
  });

  it('com uma Edge Function antiga, caem para a base de dados e dizem que não houve aviso', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(404, { message: 'Rota não encontrada.' })));
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await deleteUser('u2');
    expect(rpc).toHaveBeenCalledWith('users_admin_delete', { p_id: 'u2' });
    expect(r).toEqual({ ok: true, email_notified: false });
  });

  it('um erro de regra da Edge Function não é escondido pela base de dados', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(400, { message: 'Não pode apagar a sua própria conta.' })));
    await expect(deleteUser('eu')).rejects.toThrow('Não pode apagar a sua própria conta.');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('notifiedDescription', () => {
  it('diz ao gestor se o cliente soube', () => {
    expect(notifiedDescription({ email_notified: true })).toMatch(/foi avisado/);
    expect(notifiedDescription({ email_notified: false })).toMatch(/não foi avisado/);
  });

  it('não diz nada quando não havia aviso a dar', () => {
    expect(notifiedDescription({ ok: true })).toBeUndefined();
    expect(notifiedDescription({ changed: false, email_notified: false })).toBeUndefined();
    expect(notifiedDescription(null)).toBeUndefined();
  });
});
