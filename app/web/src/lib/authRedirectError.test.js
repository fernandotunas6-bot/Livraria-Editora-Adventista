// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, it, expect } from 'vitest';
import { readAuthRedirectError, withoutAuthError } from '@/lib/authRedirectError';

const SITE = 'https://livrariaadventista.com';

describe('readAuthRedirectError', () => {
  it('sem erro no endereço devolve null', () => {
    expect(readAuthRedirectError(`${SITE}/login`)).toBeNull();
    expect(readAuthRedirectError(`${SITE}/profile#access_token=abc&type=recovery`)).toBeNull();
    expect(readAuthRedirectError('não é um url')).toBeNull();
  });

  it('link de email expirado (como o Supabase o devolve)', () => {
    const e = readAuthRedirectError(`${SITE}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(e.code).toBe('otp_expired');
    expect(e.message).toMatch(/expirou ou já foi usado/);
  });

  it('cancelar no ecrã da Google', () => {
    const e = readAuthRedirectError(`${SITE}/profile?error=access_denied&error_description=The+user+denied+access`);
    expect(e.message).toBe('A entrada com a Google foi cancelada.');
  });

  it('erro desconhecido tem uma mensagem genérica em português', () => {
    expect(readAuthRedirectError(`${SITE}/login#error=server_error&error_code=unexpected_failure`).message)
      .toBe('Não foi possível concluir a entrada. Tente outra vez.');
  });

  it('conta suspensa', () => {
    expect(readAuthRedirectError(`${SITE}/login#error=access_denied&error_code=user_banned`).message).toMatch(/suspensa/);
  });
});

describe('withoutAuthError', () => {
  it('tira só os parâmetros do erro', () => {
    expect(withoutAuthError(`${SITE}/login?redirect=%2Fprofile#error=access_denied&error_code=otp_expired&error_description=x`))
      .toBe('/login?redirect=%2Fprofile');
    expect(withoutAuthError(`${SITE}/profile?error=access_denied&error_description=y&tab=orders`))
      .toBe('/profile?tab=orders');
  });
});
