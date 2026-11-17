/**
 * Edições digitais à venda (migração edicoes_digitais).
 *
 * Um produto digital não tem stock nem envio: o checkout não pede morada nem levantamento, não
 * há portes, e o livro abre na biblioteca da conta quando o pagamento é confirmado. Com variantes,
 * decide cada uma (`"digital": true` em `versions`); sem variantes, o produto (`stock_books.digital`).
 *
 * É a mesma regra que `private.item_digital` na base de dados e `isDigitalEdition` na Edge
 * Function (supabase/functions/app/digitalBooks.ts): mexer num sítio obriga a mexer nos outros.
 */

import { eAppNativa } from '@/lib/nativeApp';

const TRUE_WORDS = ['true', 't', '1', 'yes', 'sim'];

/**
 * Pode-se comprar a edição digital aqui? Não dentro dos apps: a Apple (regra 3.1.1 da App Store) e
 * a Google (Play Billing) obrigam a vender conteúdo digital com as compras delas, e a loja decidiu
 * não o fazer. No app só se compram os impressos; quem já comprou o digital no site lê-o na
 * biblioteca, como sempre. A frase não leva ligação nem indicação para comprar noutro lado: as
 * duas lojas também o proíbem.
 */
export const podeComprarDigital = (win = globalThis.window) => !eAppNativa(win);
export const DIGITAL_FORA_DA_APP = 'A edição digital está indisponível.';

/** Uma variante (um elemento de `versions`) é a edição digital? */
export function versionIsDigital(version) {
  if (!version || typeof version !== 'object' || Array.isArray(version)) return false;
  return TRUE_WORDS.includes(String(version.digital ?? '').trim().toLowerCase());
}

const versionsOf = (book) => (Array.isArray(book?.versions) ? book.versions : []);

/** Este produto, nesta variante (índice em `versions`, ou nada), é digital? */
export function isDigitalEdition(book, variant) {
  if (!book) return false;
  const versions = versionsOf(book);
  if (versions.length) {
    const i = variant === null || variant === undefined || variant === '' ? NaN : Number(variant);
    return Number.isInteger(i) && i >= 0 && i < versions.length && versionIsDigital(versions[i]);
  }
  return (variant === null || variant === undefined || variant === '') && book.digital === true;
}

/** O produto vende alguma edição digital? */
export function productHasDigital(book) {
  const versions = versionsOf(book);
  return versions.length ? versions.some(versionIsDigital) : book?.digital === true;
}

/** Tudo o que o produto vende é digital (não há stock para ter nem nada para enviar)? */
export function productOnlyDigital(book) {
  const versions = versionsOf(book);
  return versions.length ? versions.every(versionIsDigital) : book?.digital === true;
}

/** Índice da variante no id do carrinho (`<livro>-v2` → 2; `<livro>-default` → null). */
export function variantIndexOf(variantId) {
  const m = /-v(\d+)$/.exec(String(variantId || ''));
  return m ? Number(m[1]) : null;
}

/** Linha do carrinho com uma edição digital (o catálogo marca a variante com `digital: true`). */
export const isDigitalCartItem = (item) => item?.variant?.digital === true;

/**
 * O carrinho tem edições digitais?
 *  - `all`: só digitais — o envio é 'digital' (sem morada, sem portes);
 *  - `any`: pelo menos uma — a compra precisa de conta, que é onde o livro fica;
 *  - `physicalCents`: o subtotal do que se envia (os portes e os portes grátis contam só isto);
 *  - `titles`: os títulos das edições digitais, para as frases do carrinho.
 */
export function cartDigitalState(cartItems) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const digital = items.filter(isDigitalCartItem);
  const physicalCents = items
    .filter((i) => !isDigitalCartItem(i))
    .reduce((sum, i) => sum + (i.variant?.sale_price_in_cents ?? i.variant?.price_in_cents ?? 0) * (Number(i.quantity) || 0), 0);
  return {
    all: items.length > 0 && digital.length === items.length,
    any: digital.length > 0,
    physicalCents,
    titles: [...new Set(digital.map((i) => String(i.product?.title || '').trim()).filter(Boolean))],
  };
}

/** "O Desejado", "O Desejado e Caminho a Cristo", "A, B e C". */
export function titleList(titles) {
  const t = (titles || []).filter(Boolean);
  if (t.length <= 1) return t[0] || '';
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}

/** Encomenda só de edições digitais (sem envio). */
export const isDigitalOrder = (order) => String(order?.shipping_method || '') === 'digital';

/** Linha de encomenda com uma edição digital (o `place_order` marca-a com `digital: true`). */
export const isDigitalOrderItem = (item) => item?.digital === true;
