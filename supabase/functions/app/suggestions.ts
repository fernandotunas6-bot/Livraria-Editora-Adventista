/**
 * Sugestões de livros para um cliente: o que guardou e viu, livros do mesmo género, novidades.
 *
 * Função pura, sem base de dados: quem chama passa o catálogo e o histórico do cliente. É a
 * mesma ordem nos emails e na página /sugestoes da loja.
 */

type Row = Record<string, any>;

export type SuggestionInput = {
  /** Livros visíveis e com stock. */
  books: Row[];
  /** Livros que o cliente já comprou: nunca se sugerem. */
  owned?: Iterable<string>;
  /** Lista de desejos, do mais recente para o mais antigo. */
  wishlist?: string[];
  /** Livros vistos, do mais recente para o mais antigo. */
  viewed?: string[];
  /** Outros a deixar de fora (por exemplo, os da encomenda deste email). */
  exclude?: Iterable<string>;
  limit?: number;
};

export type SuggestionResult = {
  /** Escolhidos para o cliente (interesse e mesmo género), por ordem. */
  forYou: Row[];
  /** Vistos recentemente, ainda não comprados. */
  recent: Row[];
  /** Os mais recentes do catálogo. */
  newest: Row[];
  /** Mistura para um email: interesse primeiro, completada com novidades. */
  pick: Row[];
  /** Há algo do cliente na escolha (desejos, vistos ou compras)? */
  personal: boolean;
};

const time = (v: unknown) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
};

/**
 * A capa é uma imagem a sério? Um ficheiro com poucos KB é uma capa vazia (há dezenas no
 * catálogo). Sem a informação (`cover_bytes` ausente), conta como boa.
 */
export const MIN_COVER_BYTES = 10_000;
export const hasRealCover = (b: Row) =>
  !!(b.cover || b.cover_image) && (b.cover_bytes == null || Number(b.cover_bytes) >= MIN_COVER_BYTES);

/** Com capa a sério primeiro; depois os mais recentes; em empate, os destaques. */
export const byNewest = (a: Row, b: Row) =>
  Number(hasRealCover(b)) - Number(hasRealCover(a)) ||
  time(b.created) - time(a.created) || Number(!!b.featured) - Number(!!a.featured) || String(a.title || "").localeCompare(String(b.title || ""));

/**
 * Peso de cada semelhança. Os mesmos valores do site (`app/web/src/lib/discovery.js`), para a
 * sugestão de um email e a da loja não discordarem uma da outra.
 */
export const AFFINITY = { collection: 4, author: 3, genre: 2 };

export function rankSuggestions(input: SuggestionInput): SuggestionResult {
  const limit = Math.max(1, Math.min(Number(input.limit) || 4, 24));
  const owned = new Set(input.owned || []);
  const skip = new Set([...owned, ...(input.exclude || [])]);
  const byId = new Map(input.books.map((b) => [String(b.id), b]));
  const available = (id: string) => byId.has(id) && !skip.has(id);

  const wish = (input.wishlist || []).filter(available);
  const viewed = (input.viewed || []).filter(available);

  // O que a pessoa comprou, guardou e viu, por peso: comprar conta mais do que ver.
  //
  // Três semelhanças, e não só o género: a **colecção** é a mais forte (as colecções desta
  // livraria são séries — quem leu o primeiro volume quer o segundo), depois o **autor**,
  // depois o género. Antes só o género contava, e o resultado era "mais um livro de saúde"
  // em vez de "o volume seguinte da colecção que começou".
  const collectionWeight = new Map<string, number>();
  const authorWeight = new Map<string, number>();
  const genreWeight = new Map<string, number>();

  const bump = (map: Map<string, number>, key: unknown, w: number) => {
    const k = String(key || "").trim().toLowerCase();
    if (k) map.set(k, (map.get(k) || 0) + w);
  };
  const addSignal = (id: string, w: number) => {
    const b = byId.get(id);
    if (!b) return;
    bump(collectionWeight, b.collection_id, w * AFFINITY.collection);
    bump(authorWeight, b.author, w * AFFINITY.author);
    bump(genreWeight, b.genre, w * AFFINITY.genre);
  };
  for (const id of owned) addSignal(id, 3);
  for (const id of input.wishlist || []) addSignal(id, 2);
  for (const id of input.viewed || []) addSignal(id, 1);

  /** Pontos de um candidato: a soma das semelhanças com o que a pessoa já mostrou gostar. */
  const affinity = (b: Row) =>
    (collectionWeight.get(String(b.collection_id || "").trim().toLowerCase()) || 0)
    + (authorWeight.get(String(b.author || "").trim().toLowerCase()) || 0)
    + (genreWeight.get(String(b.genre || "").trim().toLowerCase()) || 0);

  const newest = input.books.filter((b) => !skip.has(String(b.id))).sort(byNewest);

  const seen = new Set<string>();
  const forYou: Row[] = [];
  const push = (list: Row[], b: Row | undefined) => {
    if (!b || seen.has(String(b.id))) return;
    seen.add(String(b.id));
    list.push(b);
  };
  // Intercala desejos e vistos, para não encher tudo com um só.
  for (let i = 0; i < Math.max(wish.length, viewed.length); i++) {
    push(forYou, byId.get(wish[i]));
    push(forYou, byId.get(viewed[i]));
  }
  // Depois dos desejos e dos vistos, o resto do catálogo por pontos de semelhança. Antes
  // percorria-se género a género, o que punha o género mais pesado inteiro à frente de um
  // livro da própria colecção que a pessoa está a ler.
  const porAfinidade = newest
    .map((b) => ({ b, pontos: affinity(b) }))
    .filter((x) => x.pontos > 0)
    .sort((x, y) => y.pontos - x.pontos || byNewest(x.b, y.b));
  for (const { b } of porAfinidade) push(forYou, b);

  const recent = viewed.map((id) => byId.get(id)!).slice(0, limit * 2);

  // Num email: no máximo metade do que o cliente já viu/guardou, o resto descobre-se.
  const pick: Row[] = [];
  const pickSeen = new Set<string>();
  const add = (b: Row) => {
    if (pick.length < limit && !pickSeen.has(String(b.id))) { pickSeen.add(String(b.id)); pick.push(b); }
  };
  // Num email, uma caixa branca no lugar da capa estraga o bloco: os sem capa só entram no fim.
  const interest = forYou.filter((b) => wish.includes(String(b.id)) || viewed.includes(String(b.id)));
  for (const b of interest.filter(hasRealCover).slice(0, Math.ceil(limit / 2))) add(b);
  for (const b of forYou) if (hasRealCover(b)) add(b);
  for (const b of newest) if (hasRealCover(b)) add(b);
  for (const b of [...interest, ...forYou, ...newest]) add(b);

  return {
    forYou: forYou.slice(0, limit * 3),
    recent,
    newest: newest.slice(0, limit * 3),
    pick,
    personal: collectionWeight.size > 0 || authorWeight.size > 0 || genreWeight.size > 0
      || wish.length > 0 || viewed.length > 0,
  };
}
