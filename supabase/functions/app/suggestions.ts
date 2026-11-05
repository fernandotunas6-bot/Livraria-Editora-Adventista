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

export function rankSuggestions(input: SuggestionInput): SuggestionResult {
  const limit = Math.max(1, Math.min(Number(input.limit) || 4, 24));
  const owned = new Set(input.owned || []);
  const skip = new Set([...owned, ...(input.exclude || [])]);
  const byId = new Map(input.books.map((b) => [String(b.id), b]));
  const available = (id: string) => byId.has(id) && !skip.has(id);

  const wish = (input.wishlist || []).filter(available);
  const viewed = (input.viewed || []).filter(available);

  // Géneros do que comprou, guardou e viu, por peso: comprar conta mais do que ver.
  const genreWeight = new Map<string, number>();
  const addGenre = (id: string, w: number) => {
    const g = String(byId.get(id)?.genre || "").trim();
    if (g) genreWeight.set(g, (genreWeight.get(g) || 0) + w);
  };
  for (const id of owned) addGenre(id, 3);
  for (const id of input.wishlist || []) addGenre(id, 2);
  for (const id of input.viewed || []) addGenre(id, 1);

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
  const genres = [...genreWeight.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  for (const g of genres) {
    for (const b of newest) if (String(b.genre || "").trim() === g) push(forYou, b);
  }

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
    personal: genreWeight.size > 0 || wish.length > 0 || viewed.length > 0,
  };
}
