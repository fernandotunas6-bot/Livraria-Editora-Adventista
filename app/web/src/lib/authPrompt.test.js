import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_MS, DAY_MS, LONG_COOLDOWN_MS, MAX_DISMISSALS, VIEWS_BEFORE_NUDGE,
  authDialogCopy, dismissNudge, hadAccountValue, inCooldown, isExcludedPath, nudgeMode, readHadAccount, readNudgeState, rememberedFirstName,
  shouldNudge, validateAuthForm,
} from '@/lib/authPrompt';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const base = { ready: true, isAuthed: false, pathname: '/product/abc', productViews: VIEWS_BEFORE_NUDGE, shownThisSession: false, state: null, now: NOW };

describe('shouldNudge', () => {
  it('abre para um visitante sem conta que já viu livros suficientes', () => {
    expect(shouldNudge(base)).toBe(true);
  });

  it('não decide antes de se saber se há sessão, nem abre a quem tem sessão', () => {
    expect(shouldNudge({ ...base, ready: false })).toBe(false);
    expect(shouldNudge({ ...base, isAuthed: true })).toBe(false);
  });

  it('espera pelo interesse: menos fichas vistas não abre', () => {
    expect(shouldNudge({ ...base, productViews: VIEWS_BEFORE_NUDGE - 1 })).toBe(false);
  });

  it('uma vez por sessão, e nunca por cima do carrinho ou de outro diálogo', () => {
    expect(shouldNudge({ ...base, shownThisSession: true })).toBe(false);
    expect(shouldNudge({ ...base, busy: true })).toBe(false);
  });

  it('não interrompe quem está a entrar, a recuperar a conta, no painel ou a confirmar uma encomenda', () => {
    for (const p of ['/login', '/forgot-password', '/reset-password', '/admin', '/unsubscribe', '/success', '/confirmar-encomenda', '/track', '/profile']) {
      expect(shouldNudge({ ...base, pathname: p }), p).toBe(false);
    }
  });

  it('depois de fechado, respeita a pausa', () => {
    const state = dismissNudge(null, NOW);
    expect(shouldNudge({ ...base, state, now: NOW + DAY_MS })).toBe(false);
    expect(shouldNudge({ ...base, state, now: NOW + COOLDOWN_MS + 1 })).toBe(true);
  });
});

describe('pausas', () => {
  it('fechado vezes demais, a pausa passa a longa', () => {
    let state = null;
    for (let i = 0; i < MAX_DISMISSALS; i += 1) state = dismissNudge(state, NOW);
    expect(state.dismissals).toBe(MAX_DISMISSALS);
    expect(inCooldown(state, NOW + COOLDOWN_MS + 1)).toBe(true);
    expect(inCooldown(state, NOW + LONG_COOLDOWN_MS + 1)).toBe(false);
  });

  it('estado estragado conta como vazio, sem rebentar', () => {
    expect(readNudgeState('{nao e json')).toEqual({ dismissedAt: 0, dismissals: 0 });
    expect(readNudgeState({ dismissedAt: 'x', dismissals: -4 })).toEqual({ dismissedAt: 0, dismissals: 0 });
    expect(inCooldown('lixo', NOW)).toBe(false);
  });
});

describe('isExcludedPath', () => {
  it('não confunde caminhos parecidos', () => {
    expect(isExcludedPath('/admin/encomendas')).toBe(true);
    expect(isExcludedPath('/administracao-da-fe')).toBe(false);
    expect(isExcludedPath('/shop')).toBe(false);
  });
});

describe('quem já teve conta', () => {
  it('vê "entrar"; os outros, "criar conta"', () => {
    expect(nudgeMode(true)).toBe('login');
    expect(nudgeMode(false)).toBe('signup');
  });

  it('o email lembrado só serve se for um email', () => {
    // As contas lembradas antes de 2026-11-08 só tinham o email.
    expect(readHadAccount('{"email":" Maria@Exemplo.ao "}')).toEqual({ email: 'maria@exemplo.ao', name: '', provider: '' });
    expect(readHadAccount('{"email":"nao-e-email"}')).toBeNull();
    expect(readHadAccount('lixo')).toBeNull();
    expect(readHadAccount(null)).toBeNull();
  });

  it('lembra também o nome e como entrou, limpos', () => {
    expect(readHadAccount({ email: 'maria@exemplo.ao', name: '  Maria \n Lopes ', provider: 'google' }))
      .toEqual({ email: 'maria@exemplo.ao', name: 'Maria Lopes', provider: 'google' });
    expect(readHadAccount({ email: 'maria@exemplo.ao', name: 'x'.repeat(200), provider: 'facebook' }))
      .toEqual({ email: 'maria@exemplo.ao', name: 'x'.repeat(80), provider: '' });
  });
});

describe('hadAccountValue', () => {
  it('guarda o email, o nome e como entrou — nada que dê acesso', () => {
    const v = JSON.parse(hadAccountValue({ email: 'Maria@Exemplo.ao', name: 'Maria Lopes', provider: 'email' }));
    expect(v).toEqual({ email: 'maria@exemplo.ao', name: 'Maria Lopes', provider: 'email' });
  });

  it('uma sessão que não diz como entrou mantém o que já se sabia da mesma conta', () => {
    const prev = JSON.stringify({ email: 'maria@exemplo.ao', name: 'Maria', provider: 'google' });
    expect(JSON.parse(hadAccountValue({ email: 'maria@exemplo.ao', name: 'Maria', provider: '' }, prev)).provider).toBe('google');
    // Outra conta não herda nada.
    expect(JSON.parse(hadAccountValue({ email: 'joao@exemplo.ao', name: 'João' }, prev)).provider).toBe('');
  });

  it('email inválido não se guarda', () => {
    expect(hadAccountValue({ email: 'nao-e-email' })).toBeNull();
  });

  it('rememberedFirstName: o primeiro nome, ou o início do email', () => {
    expect(rememberedFirstName({ name: 'Maria Lopes', email: 'm@x.ao' })).toBe('Maria');
    expect(rememberedFirstName({ name: '', email: 'joao.silva@x.ao' })).toBe('joao.silva');
  });
});

describe('authDialogCopy (sessão terminada)', () => {
  it('explica porque se pede para entrar de novo', () => {
    const c = authDialogCopy('session-ended', 'login');
    expect(c.title).toBe('A sua sessão terminou');
    expect(c.description).toMatch(/carrinho/);
  });
});

describe('validateAuthForm', () => {
  it('pede nome, email e 8 caracteres no registo', () => {
    const e = validateAuthForm({ mode: 'signup', name: ' ', email: 'maria@', password: '123' });
    expect(Object.keys(e).sort()).toEqual(['email', 'name', 'password']);
  });

  it('a entrar, o nome não é pedido', () => {
    expect(validateAuthForm({ mode: 'login', email: 'maria@exemplo.ao', password: '12345678' })).toEqual({});
  });

  it('aceita acentos no nome e emails com subdomínio', () => {
    expect(validateAuthForm({ mode: 'signup', name: 'Conceição', email: 'joao@mail.fata.adventist.org', password: 'palavra-passe' })).toEqual({});
  });
});

describe('authDialogCopy', () => {
  it('diz porque pede conta agora', () => {
    expect(authDialogCopy('delivery', 'signup').description).toMatch(/carrinho fica como está/);
    expect(authDialogCopy('order', 'signup').description).toMatch(/email da compra/);
  });

  it('acompanha a troca entre entrar e criar conta', () => {
    expect(authDialogCopy('nudge', 'signup').title).toMatch(/Crie/);
    expect(authDialogCopy('nudge', 'login').title).toBe('Bem-vindo de volta');
  });

  it('um motivo desconhecido não fica sem texto', () => {
    const c = authDialogCopy('qualquer', 'login');
    expect(c.title && c.description && c.dismiss).toBeTruthy();
  });
});
