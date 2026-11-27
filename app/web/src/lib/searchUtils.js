// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { looksLikeProductCode, normalizeProductCode, productTypeLabel } from '@/lib/productTypes';
/**
 * Texto comparável: sem maiúsculas e sem acentos.
 *
 * Num catálogo português isto não é um extra. Quem escreve no telemóvel raramente põe
 * acentos, e sem esta normalização "educacao" não encontrava "Educação", "fe" não encontrava
 * "Fé" e "profecia" não encontrava "Profecía". A decomposição separa a letra do acento, e o
 * intervalo `\u0300-\u036f` apanha os sinais soltos que ficam.
 */
export function normalizeForSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistanceAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

function tokenMatches(text, token) {
  if (text.includes(token)) return true;
  const words = text.split(' ');
  return words.some((word) => (
    word.startsWith(token)
    || (token.length >= 5 && word.length >= 5 && editDistanceAtMostOne(word, token))
  ));
}

/** Pesquisa por palavras sem acentos, tolerando prefixos e um erro simples de escrita. */
export function matchesTokenizedSearch(haystack, query) {
  if (!query?.trim()) return true;
  const text = normalizeForSearch(haystack);
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  return tokens.every((token) => tokenMatches(text, token));
}

export function buildProductSearchHaystack(product) {
  return [
    product.title,
    product.book_code ? product.book_code.replace('-', '') : '',
    productTypeLabel(product.product_type),
    product.subtitle,
    product.description,
    product.book_code,
    product.isbn,
    product.sku,
    product.seo_keywords,
    product.publisher,
    product.collection_title,
    product.language,
    product.type?.value,
  ].filter(Boolean).join(' ');
}

const SEARCH_FIELDS = [
  { get: (p) => p.title, weight: 100 },
  { get: (p) => p.book_code, weight: 95 },
  { get: (p) => p.isbn, weight: 95 },
  { get: (p) => p.sku, weight: 90 },
  { get: (p) => p.author || p.subtitle, weight: 80 },
  { get: (p) => p.publisher, weight: 55 },
  { get: (p) => p.collection_title, weight: 45 },
  { get: (p) => p.type?.value, weight: 40 },
  { get: (p) => p.language, weight: 30 },
  { get: (p) => p.seo_keywords, weight: 25 },
  { get: (p) => p.description, weight: 10 },
];

/** Pontua correspondências nos campos mais úteis antes dos detalhes menos específicos. */
export function getSearchRelevance(product, query) {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return 0;
  // Um código de produto ("liv-63", "UNI004") encontra exactamente esse produto, à frente de tudo.
  if (looksLikeProductCode(query) && product.book_code) {
    return normalizeProductCode(query) === normalizeProductCode(product.book_code) ? 1000 : 0;
  }
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const fields = SEARCH_FIELDS.map(({ get, weight }) => ({
    text: normalizeForSearch(get(product) || ''),
    weight,
  })).filter((field) => field.text);

  if (!tokens.every((token) => fields.some(({ text }) => tokenMatches(text, token)))) return 0;

  let score = 0;
  for (const token of tokens) {
    const best = fields.reduce((highest, { text, weight }) => (
      tokenMatches(text, token) ? Math.max(highest, weight) : highest
    ), 0);
    score += best;
  }

  const title = normalizeForSearch(product.title || '');
  if (title.includes(normalizedQuery)) score += 100;
  else if (tokens.every((token) => tokenMatches(title, token))) score += 40;
  return score;
}

/** Quantas sugestões mostrar. Mais do que isto tapa a página em vez de ajudar. */
export const MAX_SUGGESTIONS = 6;

const MIN_QUERY = 2;

/**
 * Sugestões para o que está a ser escrito na pesquisa.
 *
 * Só do catálogo que está carregado — nada é inventado nem pedido ao servidor. Uma sugestão
 * que não dá resultados é pior do que nenhuma: manda a pessoa a uma página vazia e ensina-a
 * a desconfiar da caixa de pesquisa.
 *
 * Os títulos vêm primeiro porque é o que se procura quase sempre; autores e editoras a
 * seguir, para quem anda à procura de tudo o que há de alguém.
 */
/**
 * As páginas do site que a pesquisa também encontra (pedido do dono a 27/11: «que se pesquise tudo do sistema»), com
 * as palavras por que alguém as procura. Só rotas que existem (App.jsx).
 */
export const PAGINAS_DO_SITE = [
  { texto: 'Lojas físicas', rota: '/lojas', palavras: 'lojas loja morada horário levantar levantamento luanda benguela huambo lubango bié mapa direcções' },
  { texto: 'Rastrear encomenda', rota: '/track', palavras: 'rastrear rastreio encomenda pedido estado entrega onde está' },
  { texto: 'Envios e devoluções', rota: '/envios-devolucoes', palavras: 'envio envios entrega portes devolução devoluções troca prazo' },
  { texto: 'Perguntas frequentes', rota: '/faq', palavras: 'perguntas frequentes ajuda dúvidas pagamento como comprar' },
  { texto: 'Contacto', rota: '/contacto', palavras: 'contacto contactos telefone whatsapp email falar apoio' },
  { texto: 'Colecções', rota: '/colecoes', palavras: 'colecções coleções categorias séries' },
  { texto: 'Novidades', rota: '/novidades', palavras: 'novidades novos lançamentos chegou' },
  { texto: 'Comunidade', rota: '/comunidade', palavras: 'comunidade leitores publicações partilhar' },
  { texto: 'Materiais para descarregar', rota: '/materiais', palavras: 'materiais descarregar download pdf gratuitos' },
  { texto: 'Sugestões', rota: '/sugestoes', palavras: 'sugestões sugerir pedir livro ideia' },
  { texto: 'A minha conta', rota: '/profile', palavras: 'conta perfil minhas encomendas palavra-passe segurança dois passos autenticador' },
  { texto: 'Ser colportor', rota: '/ser-colportor', palavras: 'colportor colportagem vender livros candidatura' },
  { texto: 'Descarregar a aplicação', rota: '/app', palavras: 'aplicação app telemóvel android iphone instalar' },
  { texto: 'Sobre a livraria', rota: '/sobre', palavras: 'sobre quem somos história editora' },
  { texto: 'Termos e condições', rota: '/termos', palavras: 'termos condições regras' },
  { texto: 'Política de privacidade', rota: '/privacidade', palavras: 'privacidade dados pessoais' },
];

/** As páginas do site que respondem a uma pesquisa (no máximo `max`). */
export function searchSitePages(query, max = 3) {
  const termo = normalizeForSearch(query).trim();
  if (termo.length < MIN_QUERY) return [];
  return PAGINAS_DO_SITE
    .filter((p) => matchesTokenizedSearch(`${p.texto} ${p.palavras}`, termo))
    .slice(0, max)
    .map((p) => ({ tipo: 'pagina', texto: p.texto, rota: p.rota }));
}

export function buildSearchSuggestions(products, query, limit = MAX_SUGGESTIONS) {
  const termo = normalizeForSearch(query).trim();
  if (termo.length < MIN_QUERY) return [];

  const livros = [];
  const autores = new Map();
  const editoras = new Map();
  const generos = new Map();

  for (const p of products || []) {
    if (!p) continue;

    const relevance = getSearchRelevance({
      title: p.title,
      book_code: p.book_code,
      isbn: p.isbn,
      sku: p.sku,
      author: p.author || p.subtitle,
    }, termo);
    if (relevance > 0 && p.id && p.title) {
      livros.push({
        tipo: 'livro',
        texto: String(p.title),
        id: String(p.id),
        autor: String(p.author || p.subtitle || ''),
        relevance,
      });
    }

    const author = String(p.author || p.subtitle || '').trim();
    if (author && matchesTokenizedSearch(author, termo)) {
      const key = normalizeForSearch(author);
      if (!autores.has(key)) autores.set(key, { tipo: 'autor', texto: author, relevance: getSearchRelevance({ title: '', author }, termo) });
    }

    // o género (a categoria da Loja): leva à Loja filtrada por ele
    const genre = String(p.genre || p.type?.value || '').trim();
    if (genre && matchesTokenizedSearch(genre, termo)) {
      const key = normalizeForSearch(genre);
      if (!generos.has(key)) generos.set(key, { tipo: 'genero', texto: genre, relevance: getSearchRelevance({ title: genre }, termo) });
    }

    const publisher = String(p.publisher || '').trim();
    if (publisher && matchesTokenizedSearch(publisher, termo)) {
      const key = normalizeForSearch(publisher);
      if (!editoras.has(key)) editoras.set(key, { tipo: 'editora', texto: publisher, relevance: getSearchRelevance({ publisher }, termo) });
    }
  }

  livros.sort((a, b) => b.relevance - a.relevance || a.texto.localeCompare(b.texto));
  const extras = [...generos.values(), ...autores.values(), ...editoras.values()]
    .sort((a, b) => b.relevance - a.relevance || a.texto.localeCompare(b.texto));
  // as páginas do site têm sempre lugar no fim (até 2), para a pesquisa servir também para encontrar o site
  const paginas = searchSitePages(query, 2);
  return [...livros, ...extras].slice(0, Math.max(0, limit - paginas.length))
    .map(({ relevance: _relevance, ...suggestion }) => suggestion)
    .concat(paginas);
}
