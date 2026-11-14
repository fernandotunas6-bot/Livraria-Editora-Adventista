import { describe, expect, it } from 'vitest';
import { veredicto } from './ColporteurVerifyPage';

describe('veredicto da verificação do cartão', () => {
  it('não encontrado, válido, inactivo e caducado', () => {
    expect(veredicto({ found: false }).tom).toBe('mau');
    expect(veredicto({ found: true, valid: true, status: 'activo', full_name: 'Ana' })).toMatchObject({ tom: 'bom', titulo: 'Cartão válido' });
    expect(veredicto({ found: true, valid: false, status: 'suspenso', full_name: 'Ana' }).texto).toMatch(/suspenso/);
    expect(veredicto({ found: true, valid: false, expired: true, status: 'activo', full_name: 'Ana', valid_until: '2025-12-31' })).toMatchObject({ tom: 'aviso', titulo: 'Cartão caducado' });
    expect(veredicto(null)).toBeNull();
  });
});
