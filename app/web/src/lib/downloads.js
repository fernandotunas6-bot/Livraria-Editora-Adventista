// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Materiais para descarregar (PDF): tipos, tamanho do ficheiro, validação do envio e nomes.
 * A regra de acesso está na base de dados (private.can_download, migração
 * 20261106200000_materiais_para_descarregar); aqui só se decide o que mostrar.
 */

export const DOWNLOAD_KINDS = [
  { value: 'revista', label: 'Revista' },
  { value: 'licao', label: 'Lição' },
  { value: 'folheto', label: 'Folheto' },
  { value: 'livro', label: 'Livro' },
  { value: 'guia', label: 'Guia de estudo' },
  { value: 'outro', label: 'Outro' },
];

const KIND_LABEL = Object.fromEntries(DOWNLOAD_KINDS.map((k) => [k.value, k.label]));
export const downloadKindLabel = (kind) => KIND_LABEL[kind] || 'Outro';

/** Limite do bucket `downloads` (igual ao file_size_limit da migração). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** "2,4 MB", "830 KB". Zero ou inválido: vazio. */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Erro do ficheiro escolhido no painel, ou '' se serve. `head` são os primeiros bytes: um PDF
 * começa por "%PDF-", e o tipo que o browser diz pode vir vazio ou errado.
 */
export function pdfFileError(file, head) {
  if (!file) return 'Escolha um ficheiro PDF.';
  if (file.size > MAX_PDF_BYTES) return 'O PDF tem mais de 50 MB.';
  if (file.size === 0) return 'O ficheiro está vazio.';
  const looksPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
  if (!looksPdf) return 'Só ficheiros PDF.';
  if (head && String.fromCharCode(...head.slice(0, 5)) !== '%PDF-') return 'O ficheiro não é um PDF válido.';
  return '';
}

/** Caminho no bucket: aleatório, para não se adivinhar nem colidir (a migração exige este formato). */
export function newPdfPath(random = Math.random, now = Date.now) {
  const rand = Array.from({ length: 2 }, () => random().toString(36).slice(2, 10)).join('');
  return `files/${now().toString(36)}_${rand || 'x'}.pdf`;
}

/** Nome com que o ficheiro é guardado no computador de quem descarrega. */
export function downloadFileName(title, original = '') {
  const base = String(title || original || 'material').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80);
  return `${base || 'material'}.pdf`;
}

/** Nome da variante pelo índice (`versions` do produto), como no carrinho: "Digital · PDF". */
export function variantLabel(product, index) {
  if (index == null || index === '') return '';
  const v = Array.isArray(product?.versions) ? product.versions[Number(index)] : null;
  if (!v) return `Variante ${Number(index) + 1}`;
  return [v.label, v.format].map((s) => String(s || '').trim()).filter(Boolean)
    .filter((s, i, all) => all.indexOf(s) === i).join(' · ') || `Variante ${Number(index) + 1}`;
}

/** O que o botão de um material diz e faz, para quem lê. */
export function downloadAction(item, { isAuthed = false } = {}) {
  if (item?.can_download) return { kind: 'download', label: item.access === 'paid' ? 'Descarregar (comprado)' : 'Descarregar PDF' };
  if (item?.access === 'paid' && !isAuthed) return { kind: 'login', label: 'Entrar para descarregar' };
  return { kind: 'buy', label: 'Comprar para descarregar' };
}
