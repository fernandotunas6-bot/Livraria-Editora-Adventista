import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dataClient', () => ({ default: { send } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: TwilioConfigForm } = await import('./TwilioConfigForm');

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
const button = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const app = { id: 'a1', code: 'twilio', config: {} };
const COM_SALDO = { configured: true, enabled: true, ok: true, balance: '12.5', currency: 'USD', account_type: 'Full', account_status: 'active' };

describe('integração Twilio no painel', () => {
  it('mostra o saldo', async () => {
    send.mockResolvedValue(COM_SALDO);
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(send).toHaveBeenCalledWith('/admin/sms/estado');
    expect(el.textContent).toContain('12.50 USD');
    expect(el.textContent).not.toContain('Conta de teste');
    expect(el.textContent).not.toContain('Sem saldo');
  });

  it('sem saldo, avisa de que nenhuma SMS sai', async () => {
    send.mockResolvedValue({ ...COM_SALDO, balance: '0' });
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Sem saldo, nenhuma SMS sai');
  });

  it('conta de teste: avisa de que só envia para números verificados', async () => {
    send.mockResolvedValue({ ...COM_SALDO, account_type: 'Trial' });
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Conta de teste');
  });

  it('sem conseguir ler o saldo, não diz que está a zero', async () => {
    send.mockResolvedValue({ ...COM_SALDO, balance: null, currency: '' });
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Saldo indisponível');
    expect(el.textContent).not.toContain('Sem saldo');
  });

  it('credenciais recusadas: explica', async () => {
    send.mockResolvedValue({ configured: true, ok: false, error: 'A Twilio recusou as credenciais.' });
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('A Twilio recusou as credenciais.');
  });

  it('lembra de ligar Angola nas Geo Permissions', async () => {
    send.mockResolvedValue(COM_SALDO);
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Geo Permissions');
  });

  it('sem credenciais, diz quais são os segredos em falta', async () => {
    send.mockResolvedValue({ configured: false, enabled: false });
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('TWILIO_ACCOUNT_SID');
    expect(el.textContent).toContain('TWILIO_AUTH_TOKEN');
  });

  it('as credenciais não são um campo do painel', async () => {
    send.mockResolvedValue(COM_SALDO);
    const el = await mount(<TwilioConfigForm app={app} onSave={vi.fn()} />);
    expect(el.querySelector('input[type="password"]')).toBeNull();
    expect(el.textContent).not.toMatch(/auth token/i);
  });

  it('por omissão só os códigos estão ligados: o resto custa dinheiro e liga-se de propósito', async () => {
    send.mockResolvedValue(COM_SALDO);
    const onSave = vi.fn();
    const el = await mount(<TwilioConfigForm app={app} onSave={onSave} />);
    await act(async () => button(el, 'Guardar').click());
    expect(onSave).toHaveBeenCalledWith(app, { sender: '', otp: true, orders: false, colporteurs: false, staff: false, daily_limit: 50 });
  });

  it('o teste grava primeiro e explica a falha', async () => {
    send.mockImplementation(async (path) => {
      if (path === '/admin/sms/teste') throw new Error('Conta de teste da Twilio.');
      return COM_SALDO;
    });
    const onSave = vi.fn();
    const el = await mount(<TwilioConfigForm app={app} onSave={onSave} />);
    const input = el.querySelector('input[type="tel"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, '923000111');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Testar').click());
    expect(onSave).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Teste falhou', description: 'Conta de teste da Twilio.' }));
  });
});
