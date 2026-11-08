import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
document.elementFromPoint ??= () => null;

const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dataClient', () => ({ default: { send } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: PhoneVerify } = await import('./PhoneVerify');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount(node) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(node));
  await act(async () => {});
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
const ligado = (extra = {}) => send.mockImplementation(async (path) => {
  if (path === '/messaging/status') return { sms: { otp: true } };
  if (path in extra) { const v = extra[path]; if (v instanceof Error) throw v; return v; }
  return {};
});
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const ENVIADO = { message: 'Enviámos um código para +244 9•• ••• 111.', expires_minutes: 10, retry_after: 60 };

describe('confirmar o telefone por SMS', () => {
  it('sem o SMS ligado não aparece nada', async () => {
    send.mockResolvedValue({ sms: { otp: false } });
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{ phone: '' }} />);
    expect(el.textContent).toBe('');
  });

  it('um telefone confirmado mostra-o, mesmo sem o SMS ligado', async () => {
    send.mockResolvedValue({ sms: { otp: false } });
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{ phone: '+244 923 000 111', phone_verified_at: '2026-11-08T10:00:00Z' }} />);
    expect(el.textContent).toContain('Telefone confirmado');
  });

  it('se escrever outro número, deixa de estar confirmado', async () => {
    ligado();
    const el = await mount(<PhoneVerify phone="+244 923 000 222" user={{ phone: '+244 923 000 111', phone_verified_at: '2026-11-08T10:00:00Z' }} />);
    expect(el.textContent).not.toContain('Telefone confirmado');
    expect(button(el, 'Confirmar por SMS')).toBeTruthy();
  });

  it('número incompleto: o botão fica desligado', async () => {
    ligado();
    const el = await mount(<PhoneVerify phone="+244 923" user={{}} />);
    expect(button(el, 'Confirmar por SMS').disabled).toBe(true);
  });

  it('pede o código e, com os 6 dígitos, confirma e guarda', async () => {
    ligado({ '/conta/telefone/enviar': ENVIADO, '/conta/telefone/confirmar': { message: 'Telefone confirmado.', phone: '+244 923 000 111' } });
    const onConfirmed = vi.fn();
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{}} onConfirmed={onConfirmed} />);
    await act(async () => button(el, 'Confirmar por SMS').click());
    expect(send).toHaveBeenCalledWith('/conta/telefone/enviar', { method: 'POST', body: { phone: '+244 923 000 111' } });
    expect(el.textContent).toContain('Enviámos um código');
    expect(button(el, 'Pedir outro código daqui a').disabled).toBe(true);
    await type(el.querySelector('input'), '123456');
    await act(async () => {});
    expect(send).toHaveBeenCalledWith('/conta/telefone/confirmar', { method: 'POST', body: { code: '123456' } });
    expect(onConfirmed).toHaveBeenCalledWith('+244 923 000 111');
  });

  it('os botões não gravam o formulário à volta', async () => {
    ligado();
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{}} />);
    expect(button(el, 'Confirmar por SMS').type).toBe('button');
  });

  it('um código errado diz porquê e deixa tentar outra vez', async () => {
    ligado({ '/conta/telefone/enviar': ENVIADO, '/conta/telefone/confirmar': new Error('Código errado. Restam 4 tentativas.') });
    const onConfirmed = vi.fn();
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{}} onConfirmed={onConfirmed} />);
    await act(async () => button(el, 'Confirmar por SMS').click());
    await type(el.querySelector('input'), '000000');
    await act(async () => {});
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Código errado. Restam 4 tentativas.' }));
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(el.querySelector('input').value).toBe('');
  });

  it('se a SMS não sair, avisa', async () => {
    ligado({ '/conta/telefone/enviar': new Error('Não foi possível enviar a SMS agora.') });
    const el = await mount(<PhoneVerify phone="+244 923 000 111" user={{}} />);
    await act(async () => button(el, 'Confirmar por SMS').click());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(button(el, 'Confirmar por SMS')).toBeTruthy();
  });
});
