// Barra de navegação inferior do telemóvel: onde aparece, que separador está activo, e o
// pedido para abrir o carrinho.
//
// O carrinho vive em cada página (cada uma monta o seu <ShoppingCart>), e a barra é global.
// Em vez de mudar as páginas, a barra lança um evento e o ShoppingCart que estiver montado
// abre-se — o mesmo desenho do `openHeaderSearch` do cabeçalho.

export const OPEN_CART_EVENT = 'livraria:abrir-carrinho';

// O mesmo nome que o Header.jsx ouve (OPEN_HEADER_SEARCH_EVENT). Repetido aqui para a barra
// não puxar o cabeçalho inteiro para o bundle inicial; mobileNav.test.js confirma que os dois
// não divergem.
export const OPEN_HEADER_SEARCH_EVENT = 'livraria:open-header-search';

export function requestHeaderSearch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
}

/** Pede ao carrinho da página que abra. Devolve `true` se algum carrinho respondeu. */
export function requestCartOpen() {
  if (typeof window === 'undefined') return false;
  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT, { detail }));
  return detail.handled;
}

// Páginas onde a barra não aparece:
// - a ficha do livro tem a sua própria barra de compra no fundo, que fica como está;
// - o painel, a entrada, a recuperação de palavra-passe e o cancelamento de subscrição são
//   ecrãs de tarefa, sem carrinho nem catálogo por trás.
const HIDDEN = [/^\/product\//, /^\/admin/, /^\/painel/, /^\/login/, /^\/forgot-password/, /^\/reset-password/, /^\/unsubscribe/, /^\/cancelar-subscricao/];

export function bottomNavVisible(pathname = '/') {
  return !HIDDEN.some((re) => re.test(pathname));
}

/** Separador activo: 'inicio' | 'categorias' | 'comunidade' | 'conta' | null. O carrinho é uma acção. */
export function activeTab(pathname = '/') {
  if (pathname === '/') return 'inicio';
  if (pathname.startsWith('/shop') || pathname.startsWith('/colecoes')) return 'categorias';
  if (pathname === '/comunidade' || pathname.startsWith('/comunidade/')) return 'comunidade';
  if (pathname.startsWith('/profile')) return 'conta';
  return null;
}
