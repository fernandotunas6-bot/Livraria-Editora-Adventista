/**
 * Comunidade literária: tipos de publicação, ordenações, filtros no endereço, cor dos
 * monogramas, "Ler mais" e ligações de partilha. Sem React nem rede, para se testar sozinho.
 * Os tipos e as ordenações são os da migração 20261107060000_comunidade_premium.
 */

export const POST_KINDS = [
  { value: 'discussao', label: 'Discussão', plural: 'Discussões', hint: 'Uma ideia para conversar' },
  { value: 'pergunta', label: 'Pergunta', plural: 'Perguntas', hint: 'Algo que quer saber' },
  { value: 'citacao', label: 'Citação', plural: 'Citações', hint: 'Uma passagem que o marcou' },
  { value: 'recomendacao', label: 'Recomendação', plural: 'Recomendações', hint: 'Um livro que aconselha' },
];
const KIND_BY_VALUE = Object.fromEntries(POST_KINDS.map((k) => [k.value, k]));
export const postKind = (value) => KIND_BY_VALUE[value] || KIND_BY_VALUE.discussao;
export const isKind = (value) => Boolean(KIND_BY_VALUE[value]);

export const SORTS = [
  { value: 'recentes', label: 'Recentes' },
  { value: 'em_alta', label: 'Em alta' },
  { value: 'sem_resposta', label: 'Sem resposta' },
];
const SORT_VALUES = new Set(SORTS.map((s) => s.value));

/** Ícones que um tema pode ter (nomes do lucide). Outro nome vira o livro aberto. */
export const TOPIC_ICONS = ['book-open', 'scroll-text', 'calendar-days', 'users', 'heart-pulse', 'sunrise', 'sparkles', 'hand-heart', 'music', 'globe', 'graduation-cap', 'church'];
export const topicIcon = (name) => (TOPIC_ICONS.includes(name) ? name : 'book-open');

/** Filtros do feed a partir do endereço (`?tema=&tipo=&ordem=&q=&livro=`), sempre válidos. */
export function filtersFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const topic = (params.get('tema') || '').trim().toLowerCase();
  const kind = (params.get('tipo') || '').trim();
  const sort = (params.get('ordem') || '').trim();
  const query = (params.get('q') || '').trim().slice(0, 80);
  const book = (params.get('livro') || '').trim();
  return {
    topic: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic) ? topic : '',
    kind: isKind(kind) ? kind : '',
    sort: SORT_VALUES.has(sort) ? sort : 'recentes',
    query,
    book: /^[a-z0-9]{1,40}$/i.test(book) ? book : '',
  };
}

/** O inverso: só os filtros que não são os de omissão, para um endereço limpo. */
export function searchFromFilters({ topic = '', kind = '', sort = 'recentes', query = '', book = '' } = {}) {
  const params = new URLSearchParams();
  if (topic) params.set('tema', topic);
  if (kind) params.set('tipo', kind);
  if (sort && sort !== 'recentes') params.set('ordem', sort);
  if (query && query.trim()) params.set('q', query.trim().slice(0, 80));
  if (book) params.set('livro', book);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Cor do monograma de um leitor: sempre a mesma para a mesma chave, entre tons da paleta
 * editorial com texto branco legível (contraste ≥ 4,5).
 */
export const MONOGRAM_COLORS = ['#0a748f', '#1d2a3f', '#7a5716', '#2f5d50', '#6b3a5b', '#8a3b2e', '#3b4f8a', '#4d5b2a'];
export function monogramColor(key) {
  const text = String(key || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}

/** O texto merece "Ler mais"? (mais de 6 linhas ou de 420 caracteres). */
export function needsClamp(text, { lines = 6, chars = 420 } = {}) {
  const value = String(text || '');
  return value.length > chars || value.split('\n').length > lines;
}

export const postPath = (id) => `/comunidade/p/${encodeURIComponent(id)}`;
export const readerPath = (key) => `/comunidade/leitor/${encodeURIComponent(key)}`;

/** Ligação de partilha no WhatsApp: um excerto e o endereço da publicação. */
export function whatsappShareUrl(post, siteOrigin) {
  const excerpt = String(post?.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const url = `${String(siteOrigin || '').replace(/\/$/, '')}${postPath(post?.id || '')}`;
  const text = excerpt ? `«${excerpt}${excerpt.length >= 140 ? '…' : ''}» — na Comunidade de Leitores\n${url}` : url;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** "Leitor desde novembro de 2026". */
export function readerSince(value) {
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return '';
  return `Leitor desde ${t.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`;
}

/** "1 resposta", "3 respostas". */
export const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
