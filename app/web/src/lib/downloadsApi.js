// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Materiais para descarregar. O público lê a função `downloads_list` (sem o caminho do
 * ficheiro); descarregar passa por `start_download`, que confirma o acesso, limita e conta, e por
 * um link temporário do bucket privado `downloads`. A equipa do catálogo escreve na tabela.
 * Migrações: 20261106200000_materiais_para_descarregar e 20261106230000_leituras_publicas_por_funcoes.
 */
import { supabase } from '@/lib/supabaseClient';
import { isMissingTable } from '@/lib/communityApi';
import { downloadFileName, newPdfPath } from '@/lib/downloads';

export { isMissingTable };

const ADMIN_FIELDS = 'id, title, description, kind, edition, cover, file_path, file_name, file_size, access, book_id, variant, published, sort_order, download_count, created, updated';
const LINK_SECONDS = 120;

function raise(error) {
  if (!error) return;
  const e = new Error(error.message || 'Erro nos materiais.');
  e.code = error.code;
  throw e;
}

/** Materiais publicados; com `bookId`, só os desse produto. */
export async function loadDownloads({ bookId = null } = {}) {
  const { data, error } = await supabase.rpc('downloads_list', { p_book_id: bookId || null });
  raise(error);
  return data || [];
}

/**
 * Confirma o acesso, conta (e, nos pagos, regista) e pede ao Storage um link temporário. Devolve o
 * URL; quem chama abre-o. `mode`: 'download' traz o nome do ficheiro e descarrega; 'open' mostra o
 * PDF no navegador. Aceita um material (`id`) ou uma linha da biblioteca (`download_id`).
 */
export async function getDownloadUrl(item, { mode = 'download' } = {}) {
  const id = item.download_id || item.id;
  const { data, error } = await supabase.rpc('start_download', { p_id: id, p_mode: mode === 'open' ? 'open' : 'download' });
  raise(error);
  const options = mode === 'open' ? undefined : { download: downloadFileName(item.title, data.file_name) };
  const { data: link, error: linkError } = await supabase.storage.from('downloads')
    .createSignedUrl(data.path, LINK_SECONDS, options);
  if (linkError) throw new Error('Não foi possível preparar o download. Tente outra vez.');
  return link.signedUrl;
}

// ── Equipa ───────────────────────────────────────────────────────────────

export async function loadAllDownloads() {
  const { data, error } = await supabase.from('downloads').select(ADMIN_FIELDS)
    .order('sort_order', { ascending: true }).order('created', { ascending: false }).limit(500);
  raise(error);
  return data || [];
}

const EDITABLE = ['title', 'description', 'kind', 'edition', 'cover', 'file_path', 'file_name', 'file_size', 'access', 'book_id', 'variant', 'published', 'sort_order'];
const pick = (row) => Object.fromEntries(EDITABLE.filter((k) => k in row).map((k) => [k, row[k]]));

export async function saveDownload(row) {
  const payload = pick(row);
  if (payload.book_id === '') payload.book_id = null;
  if ('variant' in payload && (payload.variant === '' || payload.variant === undefined)) payload.variant = null;
  const q = row.id
    ? supabase.from('downloads').update(payload).eq('id', row.id)
    : supabase.from('downloads').insert(payload);
  const { data, error } = await q.select(ADMIN_FIELDS).single();
  raise(error);
  return data;
}

/** Envia o PDF para o bucket privado e devolve o caminho, o nome e o tamanho para gravar. */
export async function uploadPdf(file) {
  const path = newPdfPath();
  const { error } = await supabase.storage.from('downloads').upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    const denied = /row-level security|unauthorized|403/i.test(error.message || '');
    throw new Error(denied ? 'Sem permissão para enviar PDFs (precisa de gerir o catálogo).' : error.message || 'Falha ao enviar o PDF.');
  }
  return { file_path: path, file_name: String(file.name || 'material.pdf').slice(0, 200), file_size: file.size };
}

/** Apaga o ficheiro do bucket (ao substituir ou ao apagar o material). Falhar não bloqueia. */
export async function removePdf(path) {
  if (!path) return;
  await supabase.storage.from('downloads').remove([path]).catch(() => {});
}

export async function deleteDownload(row) {
  const { error } = await supabase.from('downloads').delete().eq('id', row.id);
  raise(error);
  await removePdf(row.file_path);
}
