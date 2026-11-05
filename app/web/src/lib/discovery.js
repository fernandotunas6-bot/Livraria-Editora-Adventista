// Ordem do feed "Continue a descobrir" e as recomendações simples que a alimentam.
//
// Recomendação explicável e sem servidor: a partir dos livros que esta pessoa abriu (o
// histórico de "vistos recentemente", que só existe no browser dela), sobem os livros da
// mesma categoria ou do mesmo autor. Nada de "mais vendidos" nem de dados de outros clientes.

const stockOf = (p) => (p?.purchasable === false ? 0 : (p?.variants?.[0]?.inventory_quantity ?? 1));
const norm = (s) => String(s || '').trim().toLowerCase();

/** Categorias e autores dos livros vistos (que existam no catálogo), e os ids já vistos. */
export function interestFromRecent(recent = [], products = []) {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const categories = new Set();
  const authors = new Set();
  const viewed = new Set();
  for (const entry of recent) {
    const p = byId.get(String(entry?.id));
    if (!p) continue;
    viewed.add(String(p.id));
    if (p.type?.value) categories.add(norm(p.type.value));
    const author = p.author || p.subtitle;
    if (author) authors.add(norm(author));
  }
  return { categories, authors, viewed };
}

export const hasInterest = (interest) => !!interest && (interest.categories.size > 0 || interest.authors.size > 0);

function matches(p, interest) {
  if (!hasInterest(interest) || interest.viewed.has(String(p.id))) return false;
  return interest.categories.has(norm(p.type?.value)) || interest.authors.has(norm(p.author || p.subtitle));
}

/**
 * Ordem: recomendados (disponíveis, ainda não vistos), destaques disponíveis, restantes
 * disponíveis (os mais recentes à frente), e por fim os esgotados. Cada livro uma vez.
 */
export function discoveryOrder(products = [], interest = null) {
  const seen = new Set();
  const unique = products.filter((p) => p?.id && !seen.has(p.id) && seen.add(p.id));
  const rank = (p) => {
    if (stockOf(p) <= 0) return 3;
    if (matches(p, interest)) return 0;
    return p.featured ? 1 : 2;
  };
  return [...unique].sort((a, b) => rank(a) - rank(b) || (b.order || 0) - (a.order || 0));
}
