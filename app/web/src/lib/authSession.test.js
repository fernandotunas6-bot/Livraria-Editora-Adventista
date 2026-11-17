import { describe, expect, it, vi } from 'vitest';
import {
  authEventAction, authReturnInUrl, createReadyGate, currentPathWithQuery, readSignOut, safeInternalPath, sessionDecision, sessionMethod, signOutReason,
} from '@/lib/authSession';

describe('createReadyGate', () => {
  const noTimer = () => {};

  it('arranca por resolver e passa a resolvido numa só passagem', () => {
    const gate = createReadyGate({ setTimer: noTimer });
    expect(gate.ready).toBe(false);
    expect(gate.resolve()).toBe(true);
    expect(gate.ready).toBe(true);
    // A segunda chamada não conta: é o que permite ter o evento de autenticação e o
    // temporizador de recurso a competir sem avisar duas vezes.
    expect(gate.resolve()).toBe(false);
  });

  it('avisa os ouvintes uma única vez', () => {
    const gate = createReadyGate({ setTimer: noTimer });
    const spy = vi.fn();
    gate.onReady(spy);
    gate.resolve();
    gate.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('chama de imediato quem subscreve depois de resolvido', () => {
    const gate = createReadyGate({ setTimer: noTimer });
    gate.resolve();
    const spy = vi.fn();
    gate.onReady(spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('não avisa quem cancelou a subscrição', () => {
    const gate = createReadyGate({ setTimer: noTimer });
    const spy = vi.fn();
    gate.onReady(spy)();
    gate.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it('um ouvinte que rebenta não impede os outros', () => {
    const gate = createReadyGate({ setTimer: noTimer });
    const spy = vi.fn();
    gate.onReady(() => { throw new Error('partido'); });
    gate.onReady(spy);
    expect(() => gate.resolve()).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('o temporizador de recurso resolve quando a autenticação nunca responde', () => {
    let fn = null;
    const gate = createReadyGate({ timeoutMs: 8000, setTimer: (cb) => { fn = cb; } });
    expect(gate.ready).toBe(false);
    fn();
    // Sem isto, uma falha de rede no arranque deixava as páginas protegidas à espera
    // para sempre em vez de mostrarem o ecrã de entrada.
    expect(gate.ready).toBe(true);
  });
});

describe('safeInternalPath', () => {
  it('aceita caminhos internos', () => {
    expect(safeInternalPath('/profile')).toBe('/profile');
    expect(safeInternalPath('/shop?cat=biblias&page=2')).toBe('/shop?cat=biblias&page=2');
    expect(safeInternalPath('/reset-password#token=abc')).toBe('/reset-password#token=abc');
    expect(safeInternalPath('/')).toBe('/');
  });

  it('recusa destinos fora da loja', () => {
    // `//evil.com` e `/\evil.com` são lidos pelo navegador como outro sítio.
    expect(safeInternalPath('//evil.com')).toBe('/');
    expect(safeInternalPath('/\\evil.com')).toBe('/');
    expect(safeInternalPath('https://evil.com')).toBe('/');
    expect(safeInternalPath('http://evil.com')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
    expect(safeInternalPath('profile')).toBe('/');
  });

  it('recusa caracteres de controlo usados para esconder o destino real', () => {
    expect(safeInternalPath('/\n//evil.com')).toBe('/');
    expect(safeInternalPath('/\t/evil.com')).toBe('/');
    expect(safeInternalPath('/\u0000/evil.com')).toBe('/');
    expect(safeInternalPath('/\r//evil.com')).toBe('/');
  });

  it('devolve o valor de recurso indicado quando não há destino', () => {
    expect(safeInternalPath('', '/profile')).toBe('/profile');
    expect(safeInternalPath(null, '/profile')).toBe('/profile');
    expect(safeInternalPath(undefined, '')).toBe('');
    expect(safeInternalPath(42, '/profile')).toBe('/profile');
  });
});

describe('currentPathWithQuery', () => {
  it('junta caminho, busca e âncora', () => {
    expect(currentPathWithQuery({ pathname: '/shop', search: '?page=2', hash: '#top' }))
      .toBe('/shop?page=2#top');
  });

  it('funciona sem busca nem âncora', () => {
    expect(currentPathWithQuery({ pathname: '/profile' })).toBe('/profile');
  });

  it('devolve a raiz sem localização', () => {
    expect(currentPathWithQuery(null)).toBe('/');
  });
});

describe('sessionDecision', () => {
  it('espera enquanto o arranque não souber se há sessão', () => {
    // Este é o caso que estava em falta: com `ready` falso, `isAuthed` ainda é falso por
    // omissão e não por ausência de sessão. Quem decidisse aqui mandava para `/login` quem
    // tinha sessão válida — acontecia em todas as voltas do login com a Google.
    expect(sessionDecision({ ready: false, isAuthed: false })).toBe('wait');
    expect(sessionDecision({ ready: false, isAuthed: true })).toBe('wait');
    expect(sessionDecision({ ready: false, isAuthed: false, allowed: false })).toBe('wait');
  });

  it('pede autenticação quando não há sessão', () => {
    expect(sessionDecision({ ready: true, isAuthed: false })).toBe('login');
    // Sem sessão, a falta de permissão não é o motivo: o utilizador tem de entrar primeiro.
    expect(sessionDecision({ ready: true, isAuthed: false, allowed: false })).toBe('login');
  });

  it('distingue falta de sessão de falta de permissão', () => {
    expect(sessionDecision({ ready: true, isAuthed: true, allowed: false })).toBe('forbidden');
  });

  it('deixa passar quem tem sessão e permissão', () => {
    expect(sessionDecision({ ready: true, isAuthed: true, allowed: true })).toBe('allow');
    // Sem `allowed`, a página só exige sessão (é o caso de `/profile`).
    expect(sessionDecision({ ready: true, isAuthed: true })).toBe('allow');
  });
});

describe('authEventAction', () => {
  const stored = { access_token: 'velho', refresh_token: 'r1', user: { id: 'u1' } };

  it('com sessão no aviso, entra', () => {
    expect(authEventAction('INITIAL_SESSION', { user: { id: 'u1' } }, stored)).toBe('signed-in');
    expect(authEventAction('TOKEN_REFRESHED', { user: { id: 'u1' } }, null)).toBe('signed-in');
  });

  it('ao abrir sem rede, com a sessão ainda guardada, mantém a conta à vista', () => {
    // O supabase-js avisa INITIAL_SESSION sem sessão quando a renovação falha por falta de rede,
    // mas deixa a sessão guardada para tentar de novo.
    expect(authEventAction('INITIAL_SESSION', null, stored)).toBe('keep');
  });

  it('sem nada guardado, ou quando o servidor termina a sessão, sai', () => {
    expect(authEventAction('INITIAL_SESSION', null, null)).toBe('signed-out');
    expect(authEventAction('INITIAL_SESSION', null, { access_token: 'x', user: { id: 'u1' } })).toBe('signed-out');
    // SIGNED_OUT só chega depois de o supabase-js apagar a sessão: nunca se mantém.
    expect(authEventAction('SIGNED_OUT', null, stored)).toBe('signed-out');
  });
});

describe('sessionMethod', () => {
  const token = (payload) => {
    const b64 = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256' })}.${b64(payload)}.assinatura`;
  };

  it('lê como se entrou do `amr` do token', () => {
    expect(sessionMethod(token({ amr: [{ method: 'password', timestamp: 1 }] }))).toBe('email');
    expect(sessionMethod(token({ amr: [{ method: 'oauth', timestamp: 1 }] }))).toBe('google');
    expect(sessionMethod(token({ amr: [{ method: 'recovery', timestamp: 1 }] }))).toBe('email');
  });

  it('a Apple (app iOS) também chega como `oauth`: distingue-se pelo fornecedor', () => {
    expect(sessionMethod(token({ app_metadata: { provider: 'apple' }, amr: [{ method: 'oauth', timestamp: 1 }] }))).toBe('apple');
    expect(sessionMethod(token({ app_metadata: { provider: 'google' }, amr: [{ method: 'oauth', timestamp: 1 }] }))).toBe('google');
    expect(sessionMethod(token({ app_metadata: { provider: 'apple' }, amr: [{ method: 'password', timestamp: 1 }] }))).toBe('email');
  });

  it('a verificação em dois passos não esconde o método principal', () => {
    expect(sessionMethod(token({ amr: [{ method: 'totp', timestamp: 9 }, { method: 'oauth', timestamp: 5 }] }))).toBe('google');
  });

  it('o mais recente ganha', () => {
    expect(sessionMethod(token({ amr: [{ method: 'oauth', timestamp: 1 }, { method: 'password', timestamp: 2 }] }))).toBe('email');
  });

  it('nomes com acentos no token não estragam a leitura', () => {
    expect(sessionMethod(token({ user_metadata: { name: 'Conceição Lôbo' }, amr: [{ method: 'password', timestamp: 1 }] }))).toBe('email');
  });

  it('sem token, token estragado ou método desconhecido, não sabe', () => {
    for (const t of ['', null, 'abc', 'a.b.c', token({}), token({ amr: [{ method: 'magiclink', timestamp: 1 }] })]) {
      expect(sessionMethod(t), String(t)).toBe('');
    }
  });
});

describe('signOutReason', () => {
  const NOW = 1_000_000;

  it('um "Sair" de há poucos segundos foi da pessoa (este ou outro separador)', () => {
    expect(signOutReason(JSON.stringify({ reason: 'user', at: NOW - 2000 }), NOW)).toBe('user');
  });

  it('sem "Sair" recente, foi o servidor que terminou a sessão', () => {
    expect(signOutReason(null, NOW)).toBe('ended');
    expect(signOutReason(JSON.stringify({ reason: 'user', at: NOW - 5 * 60_000 }), NOW)).toBe('ended');
    expect(signOutReason(JSON.stringify({ reason: 'ended', at: NOW }), NOW)).toBe('ended');
    expect(signOutReason('lixo', NOW)).toBe('ended');
  });

  it('readSignOut só aceita as duas razões', () => {
    expect(readSignOut('{"reason":"user","at":5}')).toEqual({ reason: 'user', at: 5 });
    expect(readSignOut('{"reason":"outra"}')).toBeNull();
    expect(readSignOut(null)).toBeNull();
  });
});

describe('authReturnInUrl', () => {
  it('reconhece o regresso de uma entrada', () => {
    expect(authReturnInUrl('https://loja.ao/profile#access_token=a&refresh_token=b&type=bearer')).toBe(true);
    expect(authReturnInUrl('https://loja.ao/profile?code=abc')).toBe(true);
    expect(authReturnInUrl('https://loja.ao/reset-password#type=recovery&x=1')).toBe(true);
    expect(authReturnInUrl('https://loja.ao/login#error=access_denied&error_code=otp_expired')).toBe(true);
  });

  it('um endereço normal não é regresso de entrada', () => {
    expect(authReturnInUrl('https://loja.ao/profile?tab=orders')).toBe(false);
    expect(authReturnInUrl('https://loja.ao/shop?c=CPT-0007#topo')).toBe(false);
    expect(authReturnInUrl('https://loja.ao/shop?barcode=123')).toBe(false);
    expect(authReturnInUrl('não é endereço')).toBe(false);
  });
});
