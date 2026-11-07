/**
 * Faixa de aviso: leitura dos avisos no ar (a base de dados só os devolve ligados e dentro das
 * datas) e escrita pela equipa. Migração: supabase/migrations/20261106210000_faixa_de_aviso.sql.
 *
 * Cada página monta o seu cabeçalho, por isso os avisos ficam em memória durante uns minutos
 * (navegar não volta a pedir) e no navegador (quem volta vê a faixa logo, sem a página saltar).
 */
import { supabase } from '@/lib/supabaseClient';

const FIELDS = 'id, message, link_url, link_label, tone, dismissible, active, starts_at, ends_at, created, updated';
const TTL_MS = 5 * 60 * 1000;
const STORED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY = 'livraria:avisos';
const DISMISSED_KEY = 'livraria:avisos-fechados';

let memo = null;
let inflight = null;

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegação privada ou armazenamento cheio: a faixa funciona na mesma, só sem memória.
  }
}

/** O que já se sabe, sem esperar pela rede: a memória, ou o que ficou guardado há menos de um dia. */
export function cachedNotices() {
  if (memo) return memo.data;
  const stored = readJson(CACHE_KEY);
  if (stored && Array.isArray(stored.data) && Date.now() - Number(stored.at || 0) < STORED_MAX_AGE_MS) return stored.data;
  return [];
}

/** Avisos no ar. Sem a tabela (migração por aplicar) ou sem rede: lista vazia, sem erro. */
export async function loadLiveNotices({ fresh = false } = {}) {
  if (!fresh && memo && Date.now() - memo.at < TTL_MS) return memo.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('site_notices').select(FIELDS).limit(50);
      if (error) throw error;
      memo = { at: Date.now(), data: data || [] };
      writeJson(CACHE_KEY, memo);
      return memo.data;
    } catch {
      return memo?.data || cachedNotices();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function readDismissed() {
  const list = readJson(DISMISSED_KEY);
  return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
}

/** Guarda a chave do aviso fechado (só as últimas 30, para não crescer sem fim). */
export function rememberDismissed(key) {
  const next = [...readDismissed().filter((k) => k !== key), key].slice(-30);
  writeJson(DISMISSED_KEY, next);
  return next;
}

// ── Equipa ───────────────────────────────────────────────────────────────

function raise(error) {
  if (!error) return;
  const e = new Error(error.message || 'Erro nos avisos.');
  e.code = error.code;
  throw e;
}

/** Todos os avisos (a equipa lê também os desligados, os agendados e os que acabaram). */
export async function loadAllNotices() {
  const { data, error } = await supabase.from('site_notices').select(FIELDS)
    .order('created', { ascending: false }).limit(200);
  raise(error);
  return data || [];
}

const EDITABLE = ['message', 'link_url', 'link_label', 'tone', 'dismissible', 'active', 'starts_at', 'ends_at'];

export async function saveNotice(row) {
  const payload = Object.fromEntries(EDITABLE.filter((k) => k in row).map((k) => [k, row[k]]));
  const q = row.id
    ? supabase.from('site_notices').update(payload).eq('id', row.id)
    : supabase.from('site_notices').insert(payload);
  const { error } = await q;
  raise(error);
  memo = null; // a faixa desta sessão volta a pedir
}

export async function deleteNotice(id) {
  const { error } = await supabase.from('site_notices').delete().eq('id', id);
  raise(error);
  memo = null;
}
