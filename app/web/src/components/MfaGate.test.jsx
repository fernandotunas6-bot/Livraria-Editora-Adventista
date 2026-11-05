import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Margem acima dos 5 s por omissão: estes testes montam diálogos do Radix e esperam por
// efeitos assíncronos, e numa máquina carregada passavam dos 5 s sem nada estar errado.
vi.setConfig({ testTimeout: 30000 });

const mfa = {
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
};
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { mfa, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));
const logout = vi.fn();
let user = { id: 'u1' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, logout }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { default: MfaGate } = await import('./MfaGate');
// O MfaGate carrega o diálogo por import dinâmico. Carregá-lo aqui primeiro faz com que, no
// teste, esse import resolva da cache em vez de compilar a meio do teste — com a máquina
// carregada era isso que esgotava o tempo.
await import('./MfaChallengeDialog');
const { default: MfaSettings } = await import('./MfaSettings');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
  await flush();
}
function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
// O diálogo chega por import dinâmico: espera-se por ele em vez de contar ciclos.
// Espera por uma condição em vez de contar ciclos: com a máquina carregada (o conjunto
// inteiro de testes em paralelo), um ciclo não chegava e o teste falhava de vez em quando.
async function waitUntil(check, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = check();
    if (value) return value;
    await flush();
  }
  return check();
}
const waitFor = (selector, timeout) => waitUntil(() => document.querySelector(selector), timeout);
const byText = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));

beforeEach(() => {
  Object.values(mfa).forEach((fn) => fn.mockReset());
  logout.mockReset();
  user = { id: 'u1' };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
});

describe('MfaGate', () => {
  it('não aparece para quem não activou o segundo passo, nem pergunta pelos factores', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    await mount(<MfaGate />);
    expect(document.querySelector('#mfa-code')).toBeNull();
    expect(mfa.listFactors).not.toHaveBeenCalled();
  });

  it('pede o código, mostra o erro e fecha quando o código está certo', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }], all: [] }, error: null });
    await mount(<MfaGate />);
    const input = await waitFor('#mfa-code');
    expect(input).not.toBeNull();

    mfa.challengeAndVerify.mockResolvedValueOnce({ data: null, error: new Error('Invalid TOTP code entered') });
    type(input, '111 111');
    await act(async () => byText('Confirmar').click());
    const alert = await waitFor('[role="alert"]');
    expect(alert.textContent).toMatch(/Código incorrecto/);
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'f1', code: '111111' });

    mfa.challengeAndVerify.mockResolvedValueOnce({ data: {}, error: null });
    type(document.querySelector('#mfa-code'), '222222');
    await act(async () => byText('Confirmar').click());
    expect(await waitUntil(() => !document.querySelector('#mfa-code'))).toBe(true);
  });

  it('"Sair da conta" termina a sessão', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }], all: [] }, error: null });
    await mount(<MfaGate />);
    await waitFor('#mfa-code');
    await act(async () => byText('Sair da conta').click());
    expect(logout).toHaveBeenCalledOnce();
  });
});

describe('MfaSettings', () => {
  it('activa: mostra o QR e a chave, e confirma com o primeiro código', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mfa.enroll.mockResolvedValue({ data: { id: 'novo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SEGREDO' } }, error: null });
    await mount(<MfaSettings isStaff />);
    await waitUntil(() => byText('Activar com aplicação autenticadora'));

    await act(async () => byText('Activar com aplicação autenticadora').click());
    expect(await waitFor('img[alt*="QR"]')).not.toBeNull();
    expect(document.body.textContent).toContain('SEGREDO');

    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'novo', status: 'verified', friendly_name: 'Autenticador' }], all: [] }, error: null });
    type(document.querySelector('#mfa-enroll-code'), '123456');
    await act(async () => byText('Activar').click());
    expect(await waitUntil(() => !document.querySelector('#mfa-enroll-code'))).toBe(true);
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'novo', code: '123456' });
    expect(document.body.textContent).toContain('Activa');
  });

  it('retirar pede confirmação antes', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }], all: [] }, error: null });
    mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    await mount(<MfaSettings />);
    await waitUntil(() => byText('Retirar a verificação'));
    await act(async () => byText('Retirar a verificação').click());
    expect(mfa.unenroll).not.toHaveBeenCalled();
    await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Retirar').click());
    expect(await waitUntil(() => mfa.unenroll.mock.calls.length > 0)).toBe(true);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
  });
});
