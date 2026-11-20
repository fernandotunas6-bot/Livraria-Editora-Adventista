// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
const { SECRET_KEYS, clearSecret, loadSecretStatus, secretsForSave, withoutSecrets } = await import('./siteSecrets');

describe('secretsForSave', () => {
  const form = { smtp_password: '  nova  ', sendgrid_api_key: '', gemini_api_key: '', site_name: 'Livraria' };

  it('com o estado disponível, vazio quer dizer manter: só segue o que foi escrito', () => {
    expect(secretsForSave(form, { smtp_password: { set: true } })).toEqual({ smtp_password: 'nova' });
    expect(secretsForSave({}, {})).toEqual({});
  });

  it('sem a migração, grava todos como antes (incluindo apagar com vazio)', () => {
    const out = secretsForSave(form, null);
    expect(Object.keys(out).sort()).toEqual([...SECRET_KEYS].sort());
    expect(out.smtp_password).toBe('nova');
    expect(out.sendgrid_api_key).toBe('');
  });

  it('withoutSecrets tira só os segredos', () => {
    expect(withoutSecrets(form)).toEqual({ site_name: 'Livraria' });
  });
});

describe('loadSecretStatus', () => {
  it('lê o estado sem os valores', async () => {
    rpc.mockResolvedValueOnce({ data: [{ key: 'smtp_password', is_set: true, updated_at: '2026-11-04T10:00:00Z' }, { key: 'gemini_api_key', is_set: false, updated_at: null }], error: null });
    expect(await loadSecretStatus()).toEqual({
      smtp_password: { set: true, updatedAt: '2026-11-04T10:00:00Z' },
      gemini_api_key: { set: false, updatedAt: null },
    });
  });

  it('devolve null se a função não existe (base de dados antiga)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await loadSecretStatus()).toBeNull();
  });
});

describe('clearSecret', () => {
  it('recusa chaves que não são segredos', async () => {
    await expect(clearSecret('site_name')).rejects.toThrow('desconhecido');
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await clearSecret('smtp_password');
    expect(rpc).toHaveBeenLastCalledWith('site_secret_clear', { p_key: 'smtp_password' });
  });
});
