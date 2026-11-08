/**
 * Novidades da app: o que mudou em cada versão, escrito pela equipa (painel → Versões da app) e
 * mostrado em /novidades e no aviso "App actualizada". A equipa pode também avisar por push
 * todos os aparelhos (a Edge Function envia em lotes). Migração:
 * supabase/migrations/20261108150000_versoes_da_app.sql.
 *
 * Sem a migração aplicada (o site pode ser publicado antes da base de dados) tudo aqui devolve
 * vazio, sem erros: a página diz que ainda não há novidades e o painel explica o que falta.
 */
import pb from '@/lib/dataClient';
import { supabase } from '@/lib/supabaseClient';

export const TITLE_MAX = 90;
export const NOTES_MAX = 2000;

/** A última novidade que a pessoa viu (data de publicação), neste aparelho. */
export const SEEN_KEY = 'livraria:novidades-vistas';

const STAFF_FIELDS = 'id, version, title, notes, published_at, push_requested_at, push_finished_at, push_sent, push_failed, created, updated';

/** A tabela ainda não existe (migração por aplicar)? */
export function isMissingTable(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST20[25]|does not exist|Could not find the (table|function)/i.test(text);
}

/**
 * As linhas das notas, uma novidade por linha. Tira os marcadores que as pessoas escrevem
 * ("- ", "• ", "* ", "1. ") e as linhas vazias.
 */
export function noteLines(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d{1,2}[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** Há uma novidade publicada mais recente do que a última vista? */
export function hasUnseenRelease(latest, seen) {
  const at = Date.parse(latest?.published_at || '');
  if (!Number.isFinite(at)) return false;
  const seenAt = Date.parse(seen || '');
  return !Number.isFinite(seenAt) || at > seenAt;
}

export function readSeenReleases() {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return 'indisponivel';
  }
}

/** Guarda a última vista (só avança: ver uma antiga não volta a mostrar as recentes como novas). */
export function markReleasesSeen(publishedAt) {
  try {
    const current = localStorage.getItem(SEEN_KEY);
    if (current && Date.parse(current) >= Date.parse(publishedAt)) return;
    localStorage.setItem(SEEN_KEY, publishedAt);
  } catch {
    // armazenamento indisponível
  }
}

/** Estado de uma novidade, para o painel. */
export function releaseStatus(r, now = Date.now()) {
  if (!r?.published_at) return { key: 'draft', label: 'Rascunho' };
  if (Date.parse(r.published_at) > now) return { key: 'scheduled', label: 'Agendada' };
  if (r.push_requested_at && !r.push_finished_at) return { key: 'sending', label: `A avisar (${r.push_sent || 0} enviados)` };
  if (r.push_finished_at) return { key: 'sent', label: `Avisada por push (${r.push_sent || 0} aparelhos)` };
  return { key: 'published', label: 'Publicada' };
}

/** Limpa o formulário do painel antes de gravar; devolve `{ data }` ou `{ error }`. */
export function releaseDraft({ version = '', title = '', notes = '' } = {}) {
  const clean = {
    version: String(version || '').trim().slice(0, 40),
    title: String(title || '').replace(/\s+/g, ' ').trim(),
    notes: String(notes || '').replace(/\r/g, '').trim(),
  };
  if (clean.title.length < 3) return { error: 'Escreva um título (pelo menos 3 letras).' };
  if (clean.title.length > TITLE_MAX) return { error: `O título tem no máximo ${TITLE_MAX} caracteres.` };
  if (clean.notes.length > NOTES_MAX) return { error: `O texto tem no máximo ${NOTES_MAX} caracteres.` };
  if (clean.version && !/^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/.test(clean.version)) {
    return { error: 'A versão só leva letras, números, pontos e traços (ex.: 2026.11.08-ab12cd3).' };
  }
  return { data: clean };
}

/** As publicadas, da mais recente para a mais antiga. */
export async function listPublishedReleases(limit = 20) {
  try {
    const { data, error } = await supabase.rpc('app_releases_published', { p_limit: limit });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function latestPublishedRelease() {
  const [latest] = await listPublishedReleases(1);
  return latest || null;
}

// --- Equipa -----------------------------------------------------------------------------

/** Todas, para o painel. `{ items, missing }`: `missing` quando a migração ainda não foi aplicada. */
export async function listAllReleases() {
  const { data, error } = await supabase.from('app_releases').select(STAFF_FIELDS)
    .order('created', { ascending: false }).limit(50);
  if (error) {
    if (isMissingTable(error)) return { items: [], missing: true };
    throw error;
  }
  return { items: data || [], missing: false };
}

export async function saveRelease(id, fields) {
  const { data: clean, error: invalid } = releaseDraft(fields);
  if (invalid) throw new Error(invalid);
  const query = id
    ? supabase.from('app_releases').update(clean).eq('id', id)
    : supabase.from('app_releases').insert(clean);
  const { data, error } = await query.select(STAFF_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function publishRelease(id) {
  const { data, error } = await supabase.from('app_releases').update({ published_at: new Date().toISOString() })
    .eq('id', id).select(STAFF_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deleteRelease(id) {
  const { error } = await supabase.from('app_releases').delete().eq('id', id);
  if (error) throw error;
}

/** Pede à Edge Function o aviso por push a todos os aparelhos. */
export function notifyRelease(id) {
  return pb.send('/admin/releases/notify', { method: 'POST', body: { id } });
}

/** Quantos aparelhos têm notificações e quantos aceitam as novidades. */
export async function releaseDevices() {
  try {
    return await pb.send('/admin/releases/devices');
  } catch {
    return null;
  }
}
