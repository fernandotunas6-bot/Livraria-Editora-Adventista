// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { versionIsDigital } from './digitalEditions';

/**
 * Preço em vigor de um livro: o promocional (sale_price) se estiver activo nas datas definidas,
 * senão o preço normal. É a mesma regra de public.effective_price na base de dados, que é a que
 * o checkout cobra; aqui serve só para mostrar.
 */
/**
 * A janela de datas da promoção está aberta.
 *
 * As colunas `sale_starts_at`/`sale_ends_at` são do produto e valem também para as
 * variantes, que não têm datas próprias (são campos de um elemento de `versions`).
 * Uma data inválida conta como janela fechada: mais vale não descontar do que descontar
 * por engano.
 */
export function saleWindowOpen(book, now = Date.now()) {
  const started = !book?.sale_starts_at || new Date(book.sale_starts_at).getTime() <= now;
  const notEnded = !book?.sale_ends_at || new Date(book.sale_ends_at).getTime() > now;
  return started && notEnded;
}

export function isSaleActive(book, now = Date.now()) {
  const price = Number(book?.price) || 0;
  const sale = Number(book?.sale_price) || 0;
  if (!(sale > 0 && sale < price)) return false;
  return saleWindowOpen(book, now);
}

/**
 * Preços de uma variante (um elemento de `versions`): o de tabela e o promocional em vigor.
 *
 * A variante segue as mesmas duas condições do produto (ver `isSaleActive`): o promocional
 * só vale se for **menor** que o preço de tabela dela e se a janela de datas do produto
 * estiver aberta. Antes o `sale_price` da variante entrava sempre, em ambos os lados — uma
 * promoção agendada para a semana seguinte já descontava, e um `sale_price` acima do preço
 * era cobrado como se fosse desconto (e aparecia com o preço real riscado por baixo).
 *
 * É a mesma regra de `public.effective_price` e do `place_order`, que é quem cobra:
 * mexer aqui sem mexer na migração volta a pôr o carrinho a mostrar um preço e o servidor
 * a cobrar outro.
 *
 * O segundo argumento é uma entrada de `stock_books.versions` — o que a equipa escreve no
 * painel: `{ label, format, price, stock, isbn }`. **Não** é uma variante de produto
 * (`product.variants[i]`), que é outra forma, com `title`, `price_in_cents` e
 * `inventory_quantity`, construída pelo `bookToProduct`.
 *
 * As duas chamavam-se "variant" no código, e a confusão já custou: o aviso do carrinho lia
 * `variant.name` — um campo que nenhuma das duas tem — e dizia sempre "Edição Standard"
 * (achado 97). Aqui o argumento chama-se `versao`, e o `lib/variantFields.test.js` passa a
 * recusar leituras de campos que uma variante de produto não tem.
 */
export function variantPrices(book, versao, now = Date.now()) {
  // Sem preço próprio (vazio, 0 ou ausente), a variante é o produto: preço e promoção do produto.
  // O painel gravava `price: ''` num tamanho sem preço, e `Number('')` dava 0: a loja mostrava
  // 0 Kz e o servidor cobrava o preço do produto (migração tamanhos_e_comissoes).
  const own = Number(versao?.price);
  const hasOwn = String(versao?.price ?? '').trim() !== '' && Number.isFinite(own) && own > 0;
  const price = hasOwn ? own : (Number(book?.price) || 0);
  const sale = Number(versao?.sale_price) || 0;
  if (sale > 0 && sale < price && saleWindowOpen(book, now)) return { price, sale, onSale: true };
  if (!hasOwn && isSaleActive(book, now)) return { price, sale: Number(book.sale_price), onSale: true };
  return { price, sale: null, onSale: false };
}

/**
 * Variantes como se gravam: preço e stock em número, ou null quando ficam por preencher (a
 * variante usa então os do produto). O formulário guarda o texto dos campos, e um `''` gravado
 * era lido como 0 Kz no site.
 */
export function normalizeVersions(list) {
  // A edição digital (lib/digitalEditions.js) não tem stock: fica `digital: true` e sem stock.
  const toNumber = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return (Array.isArray(list) ? list : []).map((v) => {
    const out = { ...v, price: toNumber(v?.price), stock: toNumber(v?.stock) };
    if (out.stock !== null) out.stock = Math.floor(out.stock);
    if (versionIsDigital(v)) {
      out.digital = true;
      out.stock = null;
    } else {
      delete out.digital;
    }
    if ('sale_price' in (v || {})) out.sale_price = toNumber(v.sale_price);
    return out;
  });
}

export function effectivePrice(book, now = Date.now()) {
  return isSaleActive(book, now) ? Number(book.sale_price) : Number(book?.price) || 0;
}

/** Promoção definida mas ainda por começar (para o painel). */
export function isSaleScheduled(book, now = Date.now()) {
  const price = Number(book?.price) || 0;
  const sale = Number(book?.sale_price) || 0;
  return sale > 0 && sale < price && !!book?.sale_starts_at && new Date(book.sale_starts_at).getTime() > now;
}

/** Livro visível na loja (os antigos, sem a coluna, contam como visíveis). */
export const isBookVisible = (book) => book?.active !== false;

/** ISO → valor de <input type="datetime-local"> (hora local). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> → ISO (ou null se vazio). */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
