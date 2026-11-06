import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DIR = {
  churches: [
    { id: '11111111-1111-1111-1111-111111111111', cn: '001', name: 'Central Huambo', district_id: 'd1', district: 'Distrito Centro', province_id: 'hua', municipality_id: 'm-hua' },
    { id: '22222222-2222-2222-2222-222222222222', cn: '250', name: 'Central Cuito', district_id: 'd2', district: 'Distrito Centro', province_id: 'bie', municipality_id: 'm-cui' },
  ],
  pastors: [{ id: '33333333-3333-3333-3333-333333333333', label: 'Pr. Gomes João', district_id: 'd1' }],
  open: true,
  note: '',
  provinces: [{ id: 'hua', name: 'Huambo' }, { id: 'bie', name: 'Bié' }],
  municipalities: [{ id: 'm-hua', name: 'Huambo', province: 'hua' }, { id: 'm-cui', name: 'Cuito', province: 'bie' }],
};
const api = vi.hoisted(() => ({ loadApplicationDirectory: vi.fn(), submitApplication: vi.fn() }));
vi.mock('@/lib/colporteurApi', () => api);
vi.mock('@/components/Header.jsx', () => ({ default: () => null }));
vi.mock('@/components/Footer.jsx', () => ({ default: () => null }));
vi.mock('@/components/ShoppingCart.jsx', () => ({ default: () => null }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));

const { default: ColporteurApplyPage } = await import('./ColporteurApplyPage');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// O Checkbox da Radix mede-se com ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
let root;
let host;
async function mount(url = '/colportor/candidatura') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}><ColporteurApplyPage /></MemoryRouter>));
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });

const typeInto = async (el, value) => act(async () => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const submit = (el) => act(async () => el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

describe('ColporteurApplyPage', () => {
  it('?igreja=250 abre com a igreja escolhida e a província certa', async () => {
    api.loadApplicationDirectory.mockResolvedValue(DIR);
    const el = await mount('/colportor/candidatura?igreja=250');
    expect(el.querySelector('#cp-igreja').value).toBe('22222222-2222-2222-2222-222222222222');
    expect(el.querySelector('#cp-prov').value).toBe('bie');
  });

  it('valida o telefone antes de enviar', async () => {
    api.loadApplicationDirectory.mockResolvedValue(DIR);
    const el = await mount('/colportor/candidatura?igreja=001');
    await typeInto(el.querySelector('#cp-nome'), 'Maria Candidata');
    await typeInto(el.querySelector('#cp-tel'), '12345');
    await submit(el);
    expect(el.querySelector('[role="alert"]').textContent).toMatch(/9 algarismos/);
    expect(api.submitApplication).not.toHaveBeenCalled();
  });

  it('exige o consentimento e depois envia com o telefone limpo e o pastor do distrito', async () => {
    api.loadApplicationDirectory.mockResolvedValue(DIR);
    api.submitApplication.mockResolvedValue({ message: 'Candidatura recebida. A equipa vai contactá-lo.' });
    const el = await mount('/colportor/candidatura?igreja=001');
    await typeInto(el.querySelector('#cp-nome'), 'Maria Candidata');
    await typeInto(el.querySelector('#cp-tel'), '+244 923 111 222');
    await typeInto(el.querySelector('#cp-pastor'), '33333333-3333-3333-3333-333333333333');
    await submit(el);
    expect(el.querySelector('[role="alert"]').textContent).toMatch(/aceite/);
    await act(async () => el.querySelector('button[role="checkbox"]').click());
    await submit(el);
    expect(api.submitApplication).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'Maria Candidata', phone: '923111222', church_id: '11111111-1111-1111-1111-111111111111',
      pastor_id: '33333333-3333-3333-3333-333333333333', consent: true, website: '',
    }));
    expect(el.textContent).toContain('Candidatura recebida');
    expect(el.textContent).toContain('CPT-');
  });

  it('candidaturas fechadas mostram a nota em vez do formulário', async () => {
    api.loadApplicationDirectory.mockResolvedValue({ ...DIR, open: false, note: 'Reabrem em Janeiro.' });
    const el = await mount();
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('Reabrem em Janeiro.');
  });
});
