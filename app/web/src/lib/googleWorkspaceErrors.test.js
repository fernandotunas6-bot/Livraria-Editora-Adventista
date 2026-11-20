// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, it, expect } from 'vitest';
import { googleWorkspaceErrorMessage } from '@/lib/googleWorkspaceErrors';

describe('googleWorkspaceErrorMessage', () => {
  it('domínio não autorizado diz qual e onde se autoriza', () => {
    const m = googleWorkspaceErrorMessage({ code: 'auth/unauthorized-domain' }, 'livrariaadventista.com');
    expect(m).toContain('livrariaadventista.com');
    expect(m).toContain('Authorized domains');
    expect(m).toContain('skilful-form-c5jvd');
  });

  it('janela bloqueada e fechada têm mensagens próprias', () => {
    expect(googleWorkspaceErrorMessage({ code: 'auth/popup-blocked' })).toMatch(/bloqueou/);
    expect(googleWorkspaceErrorMessage({ code: 'auth/popup-closed-by-user' })).toMatch(/fechada/);
  });

  it('erro desconhecido não mostra a mensagem crua do Firebase', () => {
    const m = googleWorkspaceErrorMessage(new Error('Firebase: Error (auth/xyz).'));
    expect(m).not.toMatch(/Firebase: Error/);
    expect(m).toMatch(/Não foi possível/);
  });
});
