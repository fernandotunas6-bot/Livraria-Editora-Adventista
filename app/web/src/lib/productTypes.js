// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

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
 * Como se chamam as variantes deste tipo na loja: tamanhos (vestuário, uniformes), edições
 * (livros) ou opções (o resto). Uma t-shirt em M e L não tem "edições".
 *
 * Com `versions`, as variantes marcadas `tipo: 'cor'` (todas) são cores: a mesma bíblia em capa
 * azul, rosa ou verde não são "edições", e o cliente procura a palavra "cor".
 */
export function variantNames(value, versions) {
  if (Array.isArray(versions) && versions.length > 0 && versions.every((v) => v?.tipo === 'cor')) {
    return { one: 'Cor', many: 'Cores', pick: 'Escolher a cor', ask: 'escolha a cor', soldOut: 'Esta cor esgotou. Escolha outra.' };
  }
  const t = productType(value);
  if (t.sized) return { one: 'Tamanho', many: 'Tamanhos', pick: 'Escolher o tamanho', ask: 'escolha o tamanho', soldOut: 'Este tamanho esgotou. Escolha outro.' };
  if (t.isBook) return { one: 'Edição', many: 'Edições', pick: 'Escolher a edição', ask: 'escolha a edição', soldOut: 'Esta edição esgotou. Escolha outra.' };
  return { one: 'Opção', many: 'Opções', pick: 'Escolher a opção', ask: 'escolha a opção', soldOut: 'Esta opção esgotou. Escolha outra.' };
}

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

/**
 * O produto tem tamanhos ou edições (`versions`) e obriga a escolher um? Então não se compra
 * pelo cartão nem pela vista rápida (que só conhecem a variante `-default`): vai-se à página do
 * produto. O `place_order` recusa um produto destes sem variante.
 */
export function needsVariantChoice(product) {
  return Array.isArray(product?.versions) && product.versions.length > 0;
}

/**
 * O produto tem amostra de leitura verdadeira (páginas carregadas no painel e a pré-visualização
 * ligada)? Sem ela não há botão de amostra: a antiga "Amostra Grátis" inventava um prefácio e um
 * capítulo iguais para todos os produtos, e o cliente lia-os como se fossem do livro.
 */
export function hasReadingSample(product) {
  return !!product?.preview_enabled && Array.isArray(product?.sample_pages)
    && product.sample_pages.some((p) => (typeof p === 'string' ? p : p?.url));
}

/** Nome de uma linha de encomenda com a variante: "Uniforme — camisa (M · Azul)". */
export function orderItemTitle(item) {
  const title = String(item?.title || 'Produto');
  const variant = String(item?.variant_label || '').trim();
  return variant ? `${title} (${variant})` : title;
}

/**
 * Nome da variante escolhida no carrinho (tamanho, edição): "M · Azul". Vazio na variante única
 * ("Standard"), que não precisa de ser dita. As variantes reais têm o id `<produto>-v<n>`
 * (getProduct em api/EcommerceApi.js). Sem isto, M e L do mesmo uniforme eram duas linhas iguais
 * no carrinho, na mensagem de WhatsApp e no recibo.
 */
export function cartVariantLabel(variant) {
  if (!variant || !/-v\d+$/.test(String(variant.id || ''))) return '';
  return [variant.title, variant.format].map((s) => String(s || '').trim()).filter(Boolean)
    .filter((s, i, all) => all.indexOf(s) === i).join(' · ');
}

/** Título de uma linha do carrinho com a variante: "Uniforme — camisa (M · Azul)". */
export function cartItemTitle(item) {
  const title = String(item?.product?.title || 'Produto');
  const variant = cartVariantLabel(item?.variant);
  return variant ? `${title} (${variant})` : title;
}
