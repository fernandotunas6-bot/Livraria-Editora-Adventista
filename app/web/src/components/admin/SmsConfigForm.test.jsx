import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dataClient', () => ({ default: { send } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: SmsConfigForm } = await import('./SmsConfigForm');

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
const VA = `VA${'0a'.repeat(16)}`;
const app = { id: 'a1', code: 'sms', config: { verify_service: VA } };
const PRO2SMS = { configured: true, ok: true, balance: 5500, balance_formatted: '5 500 Kz', sms_estimated: 500, price_per_sms: 11 };
const TWILIO = { configured: true, ok: true, balance: '12.5', currency: 'USD', account_type: 'Full', account_status: 'active' };
const OS_DOIS = { enabled: true, pro2sms: PRO2SMS, twilio: TWILIO };
const escolhe = async (select, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const escreve = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('integração SMS no painel', () => {
  it('mostra o saldo dos dois serviços', async () => {
    send.mockResolvedValue(OS_DOIS);
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(send).toHaveBeenCalledWith('/admin/sms/estado');
    expect(el.textContent).toContain('5 500 Kz');
    expect(el.textContent).toContain('cerca de 500 SMS');
    expect(el.textContent).toContain('11 Kz por SMS');
    expect(el.textContent).toContain('12.50 USD');
    expect(el.textContent).not.toContain('Sem saldo');
    expect(el.textContent).not.toContain('Conta de teste');
    expect(el.textContent).not.toContain('Falta o segredo');
  });

  it('por omissão: os códigos pela Twilio Verify, os avisos pela PRO2SMS, e só os códigos ligados', async () => {
    send.mockResolvedValue(OS_DOIS);
    const onSave = vi.fn();
    const el = await mount(<SmsConfigForm app={app} onSave={onSave} />);
    await act(async () => button(el, 'Guardar').click());
    expect(onSave).toHaveBeenCalledWith(app, {
      codes_provider: 'twilio', notices_provider: 'pro2sms', pro2sms_sender: '', twilio_sender: '', verify_service: VA,
      otp: true, orders: false, colporteurs: false, staff: false, daily_limit: 50,
    });
  });

  it('a escolha de cada serviço fica guardada', async () => {
    send.mockResolvedValue(OS_DOIS);
    const onSave = vi.fn();
    const el = await mount(<SmsConfigForm app={app} onSave={onSave} />);
    await escolhe(el.querySelector('#sms-codes'), 'pro2sms');
    await escolhe(el.querySelector('#sms-notices'), 'twilio');
    await act(async () => button(el, 'Guardar').click());
    expect(onSave.mock.calls[0][1]).toMatchObject({ codes_provider: 'pro2sms', notices_provider: 'twilio' });
  });

  it('sem saldo num serviço, avisa', async () => {
    send.mockResolvedValue({ ...OS_DOIS, pro2sms: { ...PRO2SMS, balance: 0, balance_formatted: '0 Kz' } });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Sem saldo, nenhuma SMS sai por este serviço');
  });

  it('conta de teste na Twilio: avisa', async () => {
    send.mockResolvedValue({ ...OS_DOIS, twilio: { ...TWILIO, account_type: 'Trial' } });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Conta de teste');
  });

  it('sem conseguir ler o saldo da Twilio, não diz que está a zero', async () => {
    send.mockResolvedValue({ ...OS_DOIS, twilio: { ...TWILIO, balance: null, currency: '' } });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Saldo indisponível');
    expect(el.textContent).not.toContain('Sem saldo');
  });

  it('credenciais recusadas: explica', async () => {
    send.mockResolvedValue({ ...OS_DOIS, pro2sms: { configured: true, ok: false, error: 'Chave da PRO2SMS inválida ou revogada.' } });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Chave da PRO2SMS inválida ou revogada.');
  });

  it('o serviço escolhido sem segredos: diz qual falta e que não salta para o outro', async () => {
    send.mockResolvedValue({ enabled: true, pro2sms: { configured: false }, twilio: TWILIO });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('Falta o segredo PRO2SMS_API_KEY: os avisos não saem.');
    expect(el.textContent).not.toContain('os códigos não saem');
    expect(el.textContent).toContain('a SMS não passa para o outro');
  });

  it('sem nenhum segredo, diz quais são', async () => {
    send.mockResolvedValue({ enabled: false, pro2sms: { configured: false }, twilio: { configured: false } });
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.textContent).toContain('PRO2SMS_API_KEY');
    expect(el.textContent).toContain('TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN');
  });

  it('as credenciais não são um campo do painel', async () => {
    send.mockResolvedValue(OS_DOIS);
    const el = await mount(<SmsConfigForm app={app} onSave={vi.fn()} />);
    expect(el.querySelector('input[type="password"]')).toBeNull();
    expect(el.textContent).not.toMatch(/auth token|chave da api/i);
  });

  it('o serviço Verify só faz falta com os códigos pela Twilio', async () => {
    send.mockResolvedValue(OS_DOIS);
    const el = await mount(<SmsConfigForm app={{ ...app, config: {} }} onSave={vi.fn()} />);
    expect(el.textContent).toContain('os códigos não saem');
    await escolhe(el.querySelector('#sms-codes'), 'pro2sms');
    expect(el.textContent).not.toContain('os códigos não saem');
  });

  it('testa cada serviço à parte, grava primeiro e explica a falha', async () => {
    send.mockImplementation(async (path) => {
      if (path === '/admin/sms/teste') throw new Error('Sem saldo na PRO2SMS: carregue a conta.');
      return OS_DOIS;
    });
    const onSave = vi.fn();
    const el = await mount(<SmsConfigForm app={app} onSave={onSave} />);
    await escreve(el.querySelector('input[type="tel"]'), '923000111');
    await act(async () => button(el, 'Testar PRO2SMS').click());
    expect(onSave).toHaveBeenCalled();
    const [, pedido] = send.mock.calls.find(([path]) => path === '/admin/sms/teste');
    expect(pedido.body.provider).toBe('pro2sms');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Teste falhou', description: 'Sem saldo na PRO2SMS: carregue a conta.' }));
    send.mockImplementation(async (path) => (path === '/admin/sms/teste' ? { message: 'Aceite.' } : OS_DOIS));
    await act(async () => button(el, 'Testar Twilio').click());
    expect(send.mock.calls.filter(([path]) => path === '/admin/sms/teste').at(-1)[1].body.provider).toBe('twilio');
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Teste enviado' }));
  });
});
