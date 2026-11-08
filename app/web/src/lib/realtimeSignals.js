// Sinais em tempo real (migração 20261108132000_sinais_em_tempo_real): quando muda alguma coisa,
// a base de dados manda um sinal pequeno por um canal («painel», «conta:<id>», «comunidade») e o
// site volta a pedir só isso, pelo caminho de sempre — com as mesmas permissões. O sinal não traz
// dados pessoais: só o tipo do que mudou.
//
// Um canal por tópico, partilhado por todos os ecrãs que o ouvem (o painel, os alertas e o
// atendimento ouvem o mesmo «painel»), e fechado quando o último deixa de ouvir. Sem rede, sem a
// migração ou com o serviço em baixo, os ecrãs continuam a consultar de tempos a tempos: o tempo
// real só os põe mais rápidos e mais leves, nunca é preciso para funcionarem.
import { supabase } from '@/lib/supabaseClient';

const topics = new Map(); // tópico → { channel, listeners, status, statusListeners }

const STATUS = { SUBSCRIBED: 'connected', CLOSED: 'off', CHANNEL_ERROR: 'error', TIMED_OUT: 'error' };

const available = () => typeof supabase?.channel === 'function';

async function start(topic, entry, isPrivate) {
  // Os canais privados precisam do token da sessão (as políticas em realtime.messages decidem
  // quem ouve: a equipa ouve o painel, cada conta só o seu canal).
  if (isPrivate) {
    try { await supabase.realtime?.setAuth?.(); } catch { /* sem sessão: o servidor recusa e fica-se pela consulta */ }
  }
  if (topics.get(topic) !== entry) return; // já ninguém ouve
  const channel = supabase.channel(topic, { config: { private: isPrivate } });
  entry.channel = channel;
  channel.on('broadcast', { event: '*' }, (message) => {
    const event = message?.event;
    for (const l of entry.listeners) {
      if (l.events && !l.events.has(event)) continue;
      try { l.fn(event, message?.payload || {}); } catch (err) { console.error('sinal', topic, event, err); }
    }
  });
  channel.subscribe((status) => {
    entry.status = STATUS[status] || 'connecting';
    entry.statusListeners.forEach((fn) => fn(entry.status));
  });
}

function stop(topic, entry) {
  topics.delete(topic);
  if (entry.channel) {
    try { supabase.removeChannel(entry.channel); } catch { /* já fechado */ }
  }
}

/**
 * Ouvir os sinais de um tópico. `events`: um nome ou uma lista ('orders', ['alertas', 'orders']),
 * ou null para todos. Devolve a função para deixar de ouvir.
 */
export function subscribeSignal(topic, events, fn, { isPrivate = true } = {}) {
  if (!topic || !available()) return () => {};
  let entry = topics.get(topic);
  if (!entry) {
    entry = { channel: null, listeners: new Set(), status: 'connecting', statusListeners: new Set() };
    topics.set(topic, entry);
    start(topic, entry, isPrivate);
  }
  const listener = { events: events == null ? null : new Set([].concat(events)), fn };
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size && !entry.statusListeners.size) stop(topic, entry);
  };
}

/** 'connected' | 'connecting' | 'error' | 'off' (sem ninguém a ouvir). */
export const signalStatus = (topic) => topics.get(topic)?.status || 'off';

export function onSignalStatus(topic, fn) {
  const entry = topics.get(topic);
  if (!entry) return () => {};
  entry.statusListeners.add(fn);
  return () => {
    entry.statusListeners.delete(fn);
    if (!entry.listeners.size && !entry.statusListeners.size) stop(topic, entry);
  };
}

/** O canal da própria conta: as suas encomendas, avisos e conversas. */
export const accountTopic = (userId) => (userId ? `conta:${userId}` : null);

/** Para os testes. */
export const resetSignals = () => { for (const [topic, entry] of topics) stop(topic, entry); };
