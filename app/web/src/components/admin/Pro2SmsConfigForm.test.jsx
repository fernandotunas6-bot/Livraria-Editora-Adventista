import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dataClient', () => ({ default: { send } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: Pro2SmsConfigForm } = await import('./Pro2SmsConfigForm');

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
const app = { id: 'a1', code: 'pro2sms', config: {} };
const COM_SALDO = { configured: true, enabled: true, ok: true, balance: 5500, balance_formatted: '5 500 Kz', sms_estimated: 500, price_per_sms: 11 };

describe('integração PRO2SMS no painel', () => {
  it('mostra o saldo', async () => {
    send.mockResolvedValue(COM_SALDO);
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(send).toHaveBeenCalledWith('/admin/sms/estado');
    expect(el.textContent).toContain('5 500 Kz');
    expect(el.textContent).toContain('cerca de 500 SMS');
    expect(el.textContent).toContain('11 Kz por SMS');
    expect(el.textContent).not.toContain('Sem saldo');
  });

  it('sem saldo, avisa de que nenhuma SMS sai', async () => {
    send.mockResolvedValue({ ...COM_SALDO, balance: 0, balance_formatted: '0 Kz' });
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Sem saldo, nenhuma SMS sai');
  });

  it('sem chave, diz qual é o segredo em falta', async () => {
    send.mockResolvedValue({ configured: false, enabled: false });
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('PRO2SMS_API_KEY');
  });

  it('chave recusada: explica', async () => {
    send.mockResolvedValue({ configured: true, ok: false, error: 'Chave da API inválida ou revogada.' });
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Chave da API inválida ou revogada.');
  });

  it('a chave não é um campo do painel', async () => {
    send.mockResolvedValue(COM_SALDO);
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.querySelector('input[type="password"]')).toBeNull();
    expect(el.textContent).not.toMatch(/chave da api/i);
  });

  it('por omissão só os códigos estão ligados: o resto liga-se de propósito', async () => {
    send.mockResolvedValue(COM_SALDO);
    const onSave = vi.fn();
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={onSave} />);
    await act(async () => button(el, 'Guardar').click());
    expect(onSave).toHaveBeenCalledWith(app, { sender: '', otp: true, orders: false, colporteurs: false, staff: false, daily_limit: 200 });
  });

  it('o teste grava primeiro e explica a falha', async () => {
    send.mockImplementation(async (path) => {
      if (path === '/admin/sms/teste') throw new Error('Sem saldo na PRO2SMS: carregue a conta.');
      return COM_SALDO;
    });
    const onSave = vi.fn();
    const el = await mount(<Pro2SmsConfigForm app={app} onSave={onSave} />);
    const input = el.querySelector('input[type="tel"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, '923000111');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Testar').click());
    expect(onSave).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Teste falhou', description: 'Sem saldo na PRO2SMS: carregue a conta.' }));
  });
});
