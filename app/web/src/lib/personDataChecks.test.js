// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { personDataWarnings } from './personDataChecks';

describe('personDataWarnings', () => {
  it('não avisa quando os dados estão completos', () => {
    expect(personDataWarnings({
      email: 'ana@exemplo.invalid', name: 'Ana', phone: '+244 936 279 047', has_account: true, email_confirmed: true,
    })).toEqual([]);
  });

  it('avisa quando falta telefone, nome ou email', () => {
    expect(personDataWarnings({ email: 'a@exemplo.invalid', name: '', phone: '' })).toEqual([
      'Falta o nome.',
      'Falta o telefone.',
    ]);
    expect(personDataWarnings({ email: '', name: 'Ana', phone: '+244 936 279 047' })).toEqual(['Falta o email.']);
  });

  it('avisa quando o telefone está incompleto, mas não quando está bem formatado', () => {
    expect(personDataWarnings({ email: 'a@exemplo.invalid', name: 'A', phone: '+244 926 44' }))
      .toEqual(['Telefone incompleto: confirmar o número.']);
    expect(personDataWarnings({ email: 'a@exemplo.invalid', name: 'A', phone: '926445277' })).toEqual([]);
  });

  it('avisa quando a conta ainda não confirmou o email, e não avisa quem comprou sem conta', () => {
    expect(personDataWarnings({ email: 'a@exemplo.invalid', name: 'A', phone: '926445277', has_account: true, email_confirmed: false }))
      .toEqual(['Email da conta por confirmar.']);
    expect(personDataWarnings({ email: 'a@exemplo.invalid', name: 'A', phone: '926445277', has_account: false, email_confirmed: false }))
      .toEqual([]);
  });

  it('devolve lista vazia sem pessoa', () => {
    expect(personDataWarnings(null)).toEqual([]);
  });
});
