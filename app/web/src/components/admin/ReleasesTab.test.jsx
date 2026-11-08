import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Painel → Sistema → Versões da app.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/appVersion', () => ({ CURRENT_VERSION: '2026.11.08-aaaaaaa', fetchPublishedVersion: vi.fn(async () => '2026.11.08-aaaaaaa') }));

let rows = [];
let missing = false;
let devices = { devices: 12, app_updates: 10, push_enabled: true };
const api = {
  listAllReleases: vi.fn(async () => ({ items: rows, missing })),
  releaseDevices: vi.fn(async () => devices),
  saveRelease: vi.fn(async (id, data) => ({ id: id || 'novo', ...data, published_at: null })),
  publishRelease: vi.fn(async (id) => ({ id, title: 'T', published_at: '2026-11-08T10:00:00Z' })),
  deleteRelease: vi.fn(async () => {}),
  notifyRelease: vi.fn(async () => ({ message: 'A avisar 10 aparelho(s).' })),
};
vi.mock('@/lib/appReleases', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/dataClient', () => ({ default: {} }));

const { default: ReleasesTab } = await import('./ReleasesTab');

let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<ReleasesTab />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const button = (text, scope = document.body) => [...scope.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
async function type(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  rows = [];
  missing = false;
  devices = { devices: 12, app_updates: 10, push_enabled: true };
  Object.values(api).forEach((f) => f.mockClear());
  toast.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('ReleasesTab', () => {
  it('mostra a versão no site e quantos aparelhos recebem as novidades', async () => {
    await mount();
    expect(document.body.textContent).toContain('2026.11.08-aaaaaaa');
    expect(document.body.textContent).toContain('10 recebem as novidades (de 12 com notificações)');
  });

  it('escrever e publicar, e logo a pergunta "Avisar todos por push?"', async () => {
    await mount();
    await click(button('Novas novidades'));
    expect(document.getElementById('versao-numero').value).toBe('2026.11.08-aaaaaaa');
    await type(document.getElementById('versao-titulo'), 'Entrar mais rápido');
    await type(document.getElementById('versao-notas'), 'Entra sozinho\nAviso de versão');
    await click(button('Publicar'));
    expect(api.saveRelease).toHaveBeenCalledWith(undefined, { title: 'Entrar mais rápido', notes: 'Entra sozinho\nAviso de versão', version: '2026.11.08-aaaaaaa' });
    expect(api.publishRelease).toHaveBeenCalledWith('novo');
    expect(document.body.textContent).toContain('Avisar todos por push?');
    await click(button('Avisar', document.querySelector('[role="dialog"]')));
    expect(api.notifyRelease).toHaveBeenCalledWith('novo');
  });

  it('uma publicada pode ser avisada por push; uma já avisada não se apaga nem se avisa outra vez', async () => {
    rows = [
      { id: 'a', title: 'Publicada', published_at: '2026-11-08T10:00:00Z', created: '2026-11-08T09:00:00Z' },
      { id: 'b', title: 'Avisada', published_at: '2026-11-07T10:00:00Z', push_requested_at: '2026-11-07T11:00:00Z', push_finished_at: '2026-11-07T11:05:00Z', push_sent: 9, created: '2026-11-07T09:00:00Z' },
    ];
    await mount();
    const [a, b] = [...host.querySelectorAll('li.rounded-xl')];
    expect(button('Avisar todos por push', a)).toBeTruthy();
    expect(button('Avisar todos por push', b)).toBeFalsy();
    expect(b.querySelector('button[title="Apagar"]')).toBeNull();
    expect(b.textContent).toContain('Avisada por push (9 aparelhos)');
  });

  it('editar uma já publicada só grava (sem "Publicar" nem "rascunho")', async () => {
    rows = [{ id: 'a', title: 'Publicada', notes: '', version: '', published_at: '2026-11-08T10:00:00Z', created: '2026-11-08T09:00:00Z' }];
    await mount();
    await click(host.querySelector('button[title="Editar"]'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(button('Gravar', dialog).textContent.trim()).toBe('Gravar');
    expect(button('Publicar', dialog)).toBeFalsy();
    expect(button('rascunho', dialog)).toBeFalsy();
    await type(document.getElementById('versao-titulo'), 'Publicada e corrigida');
    await click(button('Gravar', dialog));
    expect(api.saveRelease).toHaveBeenCalledWith('a', { title: 'Publicada e corrigida', notes: '', version: '' });
    expect(api.publishRelease).not.toHaveBeenCalled();
  });

  it('com o push desligado não oferece o aviso e diz onde se liga', async () => {
    devices = { devices: 0, app_updates: 0, push_enabled: false };
    rows = [{ id: 'a', title: 'Publicada', published_at: '2026-11-08T10:00:00Z', created: '2026-11-08T09:00:00Z' }];
    await mount();
    expect(button('Avisar todos por push')).toBeFalsy();
    expect(document.body.textContent).toContain('Configurações → Email, push e chat');
  });

  it('sem a migração, explica o que falta', async () => {
    missing = true;
    await mount();
    expect(document.body.textContent).toContain('20261108150000_versoes_da_app');
  });
});
