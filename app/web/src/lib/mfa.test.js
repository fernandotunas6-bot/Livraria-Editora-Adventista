// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mfa = {
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
};
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { mfa } } }));

const {
  getMfaState, isTotpCode, mfaErrorMessage, needsMfaChallenge, normalizeTotpCode,
  startTotpEnrollment, verifyTotp,
} = await import('./mfa');

beforeEach(() => Object.values(mfa).forEach((fn) => fn.mockReset()));

describe('needsMfaChallenge', () => {
  it('só pede o código quando há factor e a sessão ainda é aal1', () => {
    expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true);
    expect(needsMfaChallenge({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false);
    expect(needsMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(false);
    expect(needsMfaChallenge(null)).toBe(false);
  });
});

describe('normalizeTotpCode', () => {
  it('aceita o código colado com espaços ou traços', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
    expect(normalizeTotpCode('1234567')).toBe('123456');
    expect(isTotpCode(normalizeTotpCode('12 34'))).toBe(false);
    expect(isTotpCode('123456')).toBe(true);
  });
});

describe('mfaErrorMessage', () => {
  it('explica o código errado em português', () => {
    expect(mfaErrorMessage(new Error('Invalid TOTP code entered'))).toMatch(/Código incorrecto/);
    expect(mfaErrorMessage({ message: 'AAL2 required' })).toMatch(/código da aplicação/);
    expect(mfaErrorMessage(undefined)).toMatch(/Não foi possível/);
  });
});

describe('getMfaState', () => {
  it('separa os factores verificados', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'verified' }], all: [{ id: 'f1', status: 'verified' }, { id: 'f2', status: 'unverified' }] },
      error: null,
    });
    const state = await getMfaState();
    expect(state.needsChallenge).toBe(true);
    expect(state.verified.map((f) => f.id)).toEqual(['f1']);
  });

  it('propaga o erro do Supabase', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: new Error('rede') });
    await expect(getMfaState()).rejects.toThrow('rede');
  });
});

describe('startTotpEnrollment', () => {
  it('apaga activações a meio antes de começar outra', async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [
        { id: 'velho', factor_type: 'totp', status: 'unverified' },
        { id: 'bom', factor_type: 'totp', status: 'verified' },
      ] },
      error: null,
    });
    mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    mfa.enroll.mockResolvedValue({ data: { id: 'novo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC' } }, error: null });
    const out = await startTotpEnrollment();
    expect(mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'velho' });
    expect(mfa.enroll.mock.calls[0][0]).toMatchObject({ factorType: 'totp' });
    expect(out).toEqual({ factorId: 'novo', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC' });
  });
});

describe('verifyTotp', () => {
  it('envia só os algarismos', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    await verifyTotp('f1', '123 456');
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
  });
});
