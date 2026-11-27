// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { destinoDoKanGest } from '../../public/kangest/entrar/entrar.mjs';

const E = 'aBcDeFgHiJkLmNoPqRsTuVwX';

describe('a página de retorno da entrada com o Google no KanGest', () => {
  it('passa o estado e o código ao KanGest', () => {
    expect(destinoDoKanGest(`?e=${E}&code=0b4c1a6e-1234-4f00-9abc-1234567890ab`, '')).toBe(
      `kangest://auth?e=${E}&code=0b4c1a6e-1234-4f00-9abc-1234567890ab`,
    );
  });

  it('passa o erro do Google, limpo e curto', () => {
    const d = destinoDoKanGest(`?e=${E}&error=access_denied&error_description=O%20utilizador%20recusou%0A`, '');
    expect(d).toBe(`kangest://auth?e=${E}&erro=O+utilizador+recusou`);
    expect(destinoDoKanGest('', `#e=${E}&error=server_error`)).toBe(`kangest://auth?e=${E}&erro=server_error`);
  });

  it('um código com caracteres estranhos não passa: vai como erro', () => {
    expect(destinoDoKanGest(`?e=${E}&code=a%20b%3Cscript%3E`, '')).toBe(`kangest://auth?e=${E}&erro=O+Google+n%C3%A3o+devolveu+a+entrada.`);
  });

  it('sem um estado do KanGest, não é um retorno do KanGest', () => {
    expect(destinoDoKanGest('?code=abc', '')).toBeNull();
    expect(destinoDoKanGest('?e=curto&code=abc', '')).toBeNull();
    expect(destinoDoKanGest(`?e=${E}%26x%3D1&code=abc`, '')).toBeNull();
  });
});
