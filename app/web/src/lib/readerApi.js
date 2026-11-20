// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Pedidos dos níveis dos leitores (migração 20261108131000_niveis_dos_leitores). Antes da migração
// as funções não existem: tudo devolve null ou vazio, e o site comporta-se como antes.
import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_READER_RULES, luandaDay } from '@/lib/readerLevels';

const missing = (error) => /PGRST202|42883|could not find|does not exist|schema cache|reader_|community_reader_levels/i.test(`${error?.code || ''} ${error?.message || ''}`);

// --- O estado da própria conta ----------------------------------------------------------------
let statusCache = { userId: null, status: undefined };
const statusListeners = new Set();
const setStatus = (userId, status) => {
  statusCache = { userId, status };
  statusListeners.forEach((fn) => fn(statusCache));
};
export const onReaderStatus = (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); };
export const cachedReaderStatus = (userId) => (statusCache.userId === userId ? statusCache.status : undefined);

/** O nível, os livros e o progresso da conta com sessão (null sem sessão ou antes da migração). */
export async function loadReaderStatus(userId) {
  const { data, error } = await supabase.rpc('reader_status');
  if (error) {
    if (missing(error)) { setStatus(userId, null); return null; }
    throw new Error(error.message);
  }
  setStatus(userId, data || null);
  return data || null;
}

const touchKey = (userId) => `livraria:leitor:dia:${userId}`;

/**
 * A conta está a usar o site hoje: conta o dia para a entrada na comunidade sem compra (uma vez
 * por dia e por conta, neste aparelho). Devolve o estado, ou null se já contou hoje.
 */
export async function readerTouchDaily(userId) {
  if (!userId) return null;
  const today = luandaDay();
  try {
    if (globalThis.localStorage?.getItem(touchKey(userId)) === today) return null;
  } catch { /* sem armazenamento: conta na mesma, o servidor só guarda um por dia */ }
  const { data, error } = await supabase.rpc('reader_touch');
  if (error) {
    if (!missing(error)) console.warn('reader_touch:', error.message);
    return null;
  }
  try { globalThis.localStorage?.setItem(touchKey(userId), today); } catch { /* idem */ }
  if (data) setStatus(userId, data);
  return data || null;
}

// --- Os distintivos dos autores na comunidade, em lotes ---------------------------------------
const LEVEL_TTL_MS = 10 * 60 * 1000;
const levelCache = new Map(); // chave do leitor → { level, at }
const levelListeners = new Set();
let pending = new Set();
let timer = null;

async function flushLevels() {
  timer = null;
  const keys = [...pending].slice(0, 200);
  pending = new Set([...pending].slice(200));
  if (pending.size) timer = setTimeout(flushLevels, 0);
  if (!keys.length) return;
  const { data, error } = await supabase.rpc('community_reader_levels', { p_keys: keys });
  const now = Date.now();
  const found = new Map((error ? [] : data || []).map((r) => [r.reader_key, r.level]));
  // Sem nível (conta nova), ou antes da migração: guarda-se `null` para não voltar a perguntar já.
  for (const k of keys) levelCache.set(k, { level: found.get(k) || null, at: now });
  levelListeners.forEach((fn) => fn());
}

/** O nível de um autor, se já se sabe (`undefined` enquanto não). Pede em lote os que faltam. */
export function readerLevelOf(key) {
  if (!key) return null;
  const hit = levelCache.get(key);
  if (hit && Date.now() - hit.at < LEVEL_TTL_MS) return hit.level;
  if (!pending.has(key)) {
    pending.add(key);
    if (!timer) timer = setTimeout(flushLevels, 30);
  }
  return hit ? hit.level : undefined;
}
export const onReaderLevels = (fn) => { levelListeners.add(fn); return () => levelListeners.delete(fn); };
/** Para os testes. */
export const resetReaderCaches = () => { levelCache.clear(); pending = new Set(); clearTimeout(timer); timer = null; statusCache = { userId: null, status: undefined }; };

// --- Painel: regras e números -----------------------------------------------------------------
export async function loadReaderRules() {
  const { data, error } = await supabase.from('reader_settings').select('*').eq('id', true).maybeSingle();
  if (error) {
    if (missing(error) || /reader_settings/.test(error.message || '')) return { rules: { ...DEFAULT_READER_RULES }, missing: true };
    throw new Error(error.message);
  }
  return { rules: { ...DEFAULT_READER_RULES, ...(data || {}) }, missing: !data };
}

export async function saveReaderRules(rules) {
  const row = {
    engage_enabled: !!rules.engage_enabled,
    engage_min_days: Math.round(Number(rules.engage_min_days)),
    engage_active_days: Math.round(Number(rules.engage_active_days)),
    tier_assiduo: Math.round(Number(rules.tier_assiduo)),
    tier_honra: Math.round(Number(rules.tier_honra)),
  };
  if (!(row.tier_honra > row.tier_assiduo)) throw new Error('«Leitor de honra» tem de pedir mais livros do que «Leitor assíduo».');
  const { data, error } = await supabase.from('reader_settings').update(row).eq('id', true).select('id');
  if (error) throw new Error(/check/i.test(error.message || '') ? 'Algum número está fora dos limites.' : error.message);
  if (!data?.length) throw new Error('Sem permissão para mudar as regras (é preciso «Gerir Catálogo»).');
}

export async function loadReaderSummary() {
  const { data, error } = await supabase.rpc('reader_levels_summary');
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  return data || null;
}
