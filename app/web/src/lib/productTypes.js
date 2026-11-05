/**
 * Tipos de produto do catálogo. A mesma lista está na base de dados
 * (`stock_books.product_type`, `public.product_code_prefix`): mudar um lado obriga a mudar o outro.
 *
 * `isBook` liga os campos próprios de livros no painel (autor, ISBN, páginas, amostra).
 * `sized` diz que o produto costuma ter tamanhos, que se registam como variantes.
 */
export const PRODUCT_TYPES = [
  { value: 'livro', label: 'Livro', plural: 'Livros', prefix: 'LIV', isBook: true },
  { value: 'biblia', label: 'Bíblia / Hinário', plural: 'Bíblias e hinários', prefix: 'BIB', isBook: true },
  { value: 'revista', label: 'Lição / Revista', plural: 'Lições e revistas', prefix: 'REV', isBook: true },
  { value: 'papelaria', label: 'Material de igreja / Papelaria', plural: 'Material de igreja e papelaria', prefix: 'MAT' },
  { value: 'musica', label: 'Música / Multimédia', plural: 'Música e multimédia', prefix: 'MUS' },
  { value: 'vestuario', label: 'T-shirt / Vestuário', plural: 'T-shirts e vestuário', prefix: 'VES', sized: true },
  { value: 'uniforme', label: 'Uniforme escolar', plural: 'Uniformes dos colégios', prefix: 'UNI', sized: true },
  { value: 'didatico', label: 'Material didáctico', plural: 'Materiais didácticos', prefix: 'DID' },
  { value: 'desbravadores', label: 'Desbravadores', plural: 'Materiais dos Desbravadores', prefix: 'DBV', sized: true },
];

const BY_VALUE = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.value, t]));

export const productType = (value) => BY_VALUE[value] || BY_VALUE.livro;
export const productTypeLabel = (value) => productType(value).label;
export const isBookType = (value) => !!productType(value).isBook;

/**
 * Código de produto em forma normalizada: `liv-63`, `LIV063` e ` liv 63 ` dão `LIV-063`.
 * Igual a `public.normalize_product_code` na base de dados.
 */
const CODE_RE = /^\s*([a-z]{3})[-\s]?0*([0-9]+)\s*$/i;
export function normalizeProductCode(value) {
  const m = String(value ?? '').match(CODE_RE);
  if (!m) return String(value ?? '').trim().toUpperCase();
  return `${m[1].toUpperCase()}-${m[2].padStart(3, '0')}`;
}

const KNOWN_PREFIXES = new Set([...PRODUCT_TYPES.map((t) => t.prefix), 'COL']);

/** O texto parece um código de produto (prefixo conhecido e número)? */
export function looksLikeProductCode(value) {
  const m = String(value ?? '').match(CODE_RE);
  return !!m && KNOWN_PREFIXES.has(m[1].toUpperCase());
}

/** Nome de uma linha de encomenda com a variante: "Uniforme — camisa (M · Azul)". */
export function orderItemTitle(item) {
  const title = String(item?.title || 'Produto');
  const variant = String(item?.variant_label || '').trim();
  return variant ? `${title} (${variant})` : title;
}
