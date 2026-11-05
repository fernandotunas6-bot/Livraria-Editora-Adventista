// Grelha de produtos única para o site inteiro, como nas grandes lojas: duas colunas no
// telemóvel, três no tablet, quatro e cinco no desktop, com espaços compactos. Antes cada
// página tinha a sua (2/3/4 com 24 px de espaço, ou 2/4, ou 2/3/4/5/6), e o mesmo livro
// mudava de tamanho de página para página.
//
// As classes ficam escritas por inteiro (sem montar strings) para o Tailwind as encontrar.

export const PRODUCT_GRID_CLASS =
  'product-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6';

// Densidade escolhida na loja (botões ao lado da ordenação), só no desktop largo. O valor
// guardado nas configurações era 2/3/4; com cartões mais compactos passa a uma coluna a mais
// (4 = as cinco colunas por omissão). Antes, estas classes iam para um contentor que não era a
// grelha e não faziam nada.
export const SHOP_DENSITY_OPTIONS = [
  { value: 2, columns: 3, className: 'xl:[&_.product-grid]:grid-cols-3' },
  { value: 3, columns: 4, className: 'xl:[&_.product-grid]:grid-cols-4' },
  { value: 4, columns: 5, className: '' },
];

export function shopDensityClass(value) {
  return (SHOP_DENSITY_OPTIONS.find((o) => o.value === Number(value)) || SHOP_DENSITY_OPTIONS[2]).className;
}

/** Desconto em %, só quando há preço promocional real e menor do que o normal. */
export function discountPercent(variant) {
  const normal = Number(variant?.price_in_cents);
  const promo = Number(variant?.sale_price_in_cents);
  if (!(normal > 0) || !(promo > 0) || promo >= normal) return 0;
  return Math.round((1 - promo / normal) * 100);
}
