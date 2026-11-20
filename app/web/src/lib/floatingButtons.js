// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Páginas onde os botões flutuantes (assistente e "Voltar ao topo") não aparecem.
 *
 * A escolha é do painel (Configurações → Assistente IA → Botões flutuantes) e fica em
 * `site_settings.chat_hidden_on` e `site_settings.scroll_top_hidden_on`. Sem valor gravado
 * (ou antes da migração `botoes_flutuantes_por_pagina`) vale `DEFAULT_HIDDEN`, igual ao valor por
 * omissão das colunas. As chaves têm de ser as mesmas da restrição na base de dados e de
 * `supabase/functions/app/floatingPages.ts`.
 */
export const FLOATING_PAGES = [
  { key: 'inicio', label: 'Início', match: (p) => p === '/' },
  {
    key: 'loja',
    label: 'Loja, categorias e coleções',
    match: (p) => /^\/(shop|loja|catalog|colecoes|colecao|para-si|sugestoes)(\/|$)/.test(p),
  },
  { key: 'produto', label: 'Página do produto', match: (p) => p.startsWith('/product/') },
  {
    key: 'encomenda',
    label: 'Encomenda feita e rastreio',
    match: (p) => /^\/(success|track|rastreio|confirmar-encomenda)(\/|$)/.test(p),
  },
  {
    key: 'entrar',
    label: 'Entrar e recuperar a palavra-passe',
    match: (p) => /^\/(login|forgot-password|reset-password)(\/|$)/.test(p),
  },
  { key: 'perfil', label: 'Perfil do cliente', match: (p) => /^\/(profile|perfil)(\/|$)/.test(p) },
  {
    key: 'informacao',
    label: 'Sobre, lojas, contacto e ajuda',
    match: (p) => /^\/(about|sobre|lojas|contact|contacto|faq|shipping-returns|envios-devolucoes|envios-e-devolucoes|unsubscribe|cancelar-subscricao)(\/|$)/.test(p),
  },
  { key: 'painel', label: 'Painel da equipa', match: (p) => /^\/(admin|painel)/.test(p) },
];

export const FLOATING_PAGE_KEYS = FLOATING_PAGES.map((p) => p.key);

/**
 * Onde não aparecem por omissão: na ficha do produto tapavam os botões de compra e os avisos de
 * stock (já há a barra de compra fixa e o botão de WhatsApp), no sucesso e no rastreio tapavam o
 * formulário de pagamento, e ao entrar o assistente já não aparecia.
 */
export const DEFAULT_HIDDEN = Object.freeze({
  chat: ['produto', 'encomenda', 'entrar'],
  top: ['produto', 'encomenda', 'entrar'],
});

const FIELD = { chat: 'chat_hidden_on', top: 'scroll_top_hidden_on' };

/** Grupo da página (`produto`, `loja`…) ou `''` quando não pertence a nenhum (ex.: 404). */
export function floatingPageOf(pathname) {
  const p = String(pathname || '/').toLowerCase();
  return FLOATING_PAGES.find((g) => g.match(p))?.key || '';
}

/** Lista gravada, só com chaves conhecidas; sem lista gravada, a de omissão. */
export function hiddenPages(settings, kind) {
  const value = settings?.[FIELD[kind]];
  if (!Array.isArray(value)) return [...DEFAULT_HIDDEN[kind]];
  return FLOATING_PAGE_KEYS.filter((k) => value.includes(k));
}

/** O botão (`chat` ou `top`) fica escondido nesta página? */
export function isFloatingHidden(kind, pathname, settings) {
  const page = floatingPageOf(pathname);
  return !!page && hiddenPages(settings, kind).includes(page);
}
