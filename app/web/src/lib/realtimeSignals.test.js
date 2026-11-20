// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';

// Um Supabase falso: guarda os canais, os ouvintes e deixa disparar sinais.
const channels = [];
const fake = {
  realtime: { setAuth: vi.fn(async () => {}) },
  channel: vi.fn((topic, opts) => {
    const ch = {
      topic, opts, handlers: [], statusCb: null, removed: false,
      on(type, filter, cb) { this.handlers.push({ type, filter, cb }); return this; },
      subscribe(cb) { this.statusCb = cb; cb('SUBSCRIBED'); return this; },
      emit(event, payload) { this.handlers.forEach((h) => h.cb({ event, payload })); },
    };
    channels.push(ch);
    return ch;
  }),
  removeChannel: vi.fn((ch) => { ch.removed = true; }),
};
vi.mock('@/lib/supabaseClient', () => ({ supabase: fake }));

const { accountTopic, onSignalStatus, resetSignals, signalStatus, subscribeSignal } = await import('@/lib/realtimeSignals');
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { resetSignals(); channels.length = 0; vi.clearAllMocks(); });

describe('sinais em tempo real', () => {
  it('um canal por tópico, partilhado; cada ouvinte recebe só os seus eventos', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeSignal('painel', 'orders', a);
    const offB = subscribeSignal('painel', ['alertas', 'orders'], b);
    await flush();
    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(channels[0].opts).toEqual({ config: { private: true } });
    expect(fake.realtime.setAuth).toHaveBeenCalled();
    channels[0].emit('orders', { id: 'x' });
    channels[0].emit('alertas', {});
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith('orders', { id: 'x' });
    expect(b).toHaveBeenCalledTimes(2);
    offA();
    expect(channels[0].removed).toBe(false);
    offB();
    expect(channels[0].removed).toBe(true);
  });

  it('o canal público da comunidade não pede sessão', async () => {
    subscribeSignal('comunidade', 'publicacoes', () => {}, { isPrivate: false });
    await flush();
    expect(fake.realtime.setAuth).not.toHaveBeenCalled();
    expect(channels[0].opts).toEqual({ config: { private: false } });
  });

  it('diz quando está ligado', async () => {
    const off = subscribeSignal('conta:u1', 'avisos', () => {});
    await flush();
    expect(signalStatus('conta:u1')).toBe('connected');
    const seen = [];
    const offStatus = onSignalStatus('conta:u1', (s) => seen.push(s));
    channels[0].statusCb('CHANNEL_ERROR');
    expect(seen).toEqual(['error']);
    offStatus();
    off();
    expect(signalStatus('conta:u1')).toBe('off');
  });

  it('deixar de ouvir antes de ligar não deixa canais abertos', async () => {
    const off = subscribeSignal('painel', 'orders', () => {});
    off();
    await flush();
    expect(fake.channel).not.toHaveBeenCalled();
  });

  it('o canal da conta é conta:<id>', () => {
    expect(accountTopic('abc')).toBe('conta:abc');
    expect(accountTopic(null)).toBeNull();
  });
});
