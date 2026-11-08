import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let user = { id: 'u1' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, isAuthed: !!user }) }));
const loadNotifications = vi.fn();
const markAllNotificationsRead = vi.fn(async () => {});
const markNotificationRead = vi.fn(async () => {});
vi.mock('@/lib/communityApi', () => ({ loadNotifications, markAllNotificationsRead, markNotificationRead }));

const { useNotifications, resetNotificationsStore } = await import('./useNotifications');

const aviso = (id, extra = {}) => ({ id, kind: 'community', title: `Aviso ${id}`, read_at: null, created_at: '2026-11-07T10:00:00Z', ...extra });

let roots = [];
const seen = {};
function Probe({ name, limit, enabled = true }) {
  seen[name] = useNotifications({ limit, enabled });
  return null;
}
async function mount(...probes) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push({ root, host });
  await act(async () => root.render(<>{probes}</>));
  return root;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  user = { id: 'u1' };
  loadNotifications.mockReset();
  loadNotifications.mockImplementation(async () => [aviso('a'), aviso('b', { read_at: '2026-11-07T11:00:00Z' }), aviso('c', { kind: 'support' })]);
});

afterEach(() => {
  roots.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); });
  roots = [];
  resetNotificationsStore();
  vi.useRealTimers();
});

describe('useNotifications', () => {
  it('um só pedido para todos os que mostram avisos, com o maior limite', async () => {
    await mount(<Probe key="1" name="sino" limit={20} />, <Probe key="2" name="barra" limit={20} />, <Probe key="3" name="perfil" limit={50} />);
    await flush();
    expect(loadNotifications).toHaveBeenCalledTimes(1);
    expect(loadNotifications).toHaveBeenCalledWith(50);
    expect(seen.sino.items).toHaveLength(3);
    expect(seen.barra.unread).toBe(2);
    expect(seen.barra.unreadCommunity).toBe(1);
  });

  it('ao mudar de página reaproveita o que chegou há pouco', async () => {
    const first = await mount(<Probe key="1" name="sino" limit={20} />);
    await flush();
    act(() => first.unmount());
    await mount(<Probe key="2" name="sino" limit={20} />);
    await flush();
    expect(loadNotifications).toHaveBeenCalledTimes(1);
    expect(seen.sino.items).toHaveLength(3);
  });

  it('pede de minuto a minuto, só com a página à vista', async () => {
    vi.useFakeTimers();
    await mount(<Probe key="1" name="sino" limit={20} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(loadNotifications).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadNotifications).toHaveBeenCalledTimes(2);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadNotifications).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it('sem sessão não pede nem mostra nada; outra conta não vê os avisos da anterior', async () => {
    user = null;
    await mount(<Probe key="1" name="sino" limit={20} />);
    await flush();
    expect(loadNotifications).not.toHaveBeenCalled();
    expect(seen.sino.items).toEqual([]);

    roots.forEach(({ root }) => act(() => root.unmount()));
    roots = [];
    user = { id: 'u1' };
    await mount(<Probe key="2" name="sino" limit={20} />);
    await flush();
    expect(seen.sino.items).toHaveLength(3);

    roots.forEach(({ root }) => act(() => root.unmount()));
    roots = [];
    user = { id: 'u2' };
    let release;
    loadNotifications.mockImplementation(() => new Promise((r) => { release = r; }));
    await mount(<Probe key="3" name="sino" limit={20} />);
    expect(seen.sino.items).toEqual([]);
    await act(async () => { release([aviso('z')]); });
    await flush();
    expect(seen.sino.items.map((n) => n.id)).toEqual(['z']);
  });

  it('marcar como lido actualiza logo todos os que mostram o número', async () => {
    await mount(<Probe key="1" name="sino" limit={20} />, <Probe key="2" name="barra" limit={20} />);
    await flush();
    await act(async () => { await seen.sino.markOne('a'); });
    expect(markNotificationRead).toHaveBeenCalledWith('a');
    expect(seen.barra.unreadCommunity).toBe(0);
    expect(seen.barra.unread).toBe(1);
    await act(async () => { await seen.barra.markAll(); });
    expect(markAllNotificationsRead).toHaveBeenCalledOnce();
    expect(seen.sino.unread).toBe(0);
  });

  it('desligado (barra escondida no computador) não conta como interessado', async () => {
    await mount(<Probe key="1" name="barra" limit={20} enabled={false} />);
    await flush();
    expect(loadNotifications).not.toHaveBeenCalled();
    expect(seen.barra.unreadCommunity).toBe(0);
  });
});
