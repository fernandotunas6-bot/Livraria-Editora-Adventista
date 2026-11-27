// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A capa de um artigo sem fotografia (pedido do dono a 27/11: «colocar ícones em todos os livros»). A mesma do site
 * (app/web/src/lib/capaGerada.js), para os dois lados mostrarem o mesmo livro da mesma maneira. Em vez do rectângulo
 * cinzento com «No Image», uma capa desenhada: a cor do género, o ícone de um livro aberto, o título em várias linhas e o
 * autor. É um SVG em data URL, por isso não depende da rede nem do Storage, e é sempre igual para o mesmo livro.
 */

// as cores das capas, escuras o bastante para o texto branco passar o contraste AA
const CORES: [string, string][] = [
  ['#0b4f6c', '#0e7490'], // petróleo
  ['#7c2d12', '#b45309'], // terracota
  ['#14532d', '#15803d'], // verde
  ['#3b0764', '#7e22ce'], // violeta
  ['#1e3a8a', '#2563eb'], // azul
  ['#701a75', '#a21caf'], // ameixa
  ['#7f1d1d', '#b91c1c'], // vinho
  ['#134e4a', '#0f766e'], // turquesa
];

/** Um número estável a partir de um texto (o mesmo género dá sempre a mesma cor). */
function resumo(texto: unknown): number {
  let h = 2166136261;
  for (const c of String(texto || '')) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619) >>> 0;
  return h;
}

const escapar = (t: unknown) => String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** O texto partido em linhas de até `largura` caracteres, sem cortar palavras (no máximo `max` linhas, com «…»). */
export function linhas(texto: unknown, largura = 16, max = 5): string[] {
  const palavras = String(texto || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const out: string[] = [];
  let actual = '';
  for (const p of palavras) {
    const tentativa = actual ? `${actual} ${p}` : p;
    if (tentativa.length <= largura || !actual) actual = tentativa;
    else {
      out.push(actual);
      actual = p;
    }
  }
  if (actual) out.push(actual);
  if (out.length > max) {
    const cortadas = out.slice(0, max);
    cortadas[max - 1] = `${cortadas[max - 1].slice(0, largura - 1)}…`;
    return cortadas;
  }
  return out.map((l) => (l.length > largura + 4 ? `${l.slice(0, largura + 3)}…` : l));
}

/** A capa desenhada de um produto (`title`, `author`, `genre`), em data URL SVG (300 × 450). */
export type ProdutoCapa = { title?: string; titulo?: string; descricao?: string; author?: string; autor?: string; genre?: string; genero?: string; familia?: string };

export function capaGerada(produto: ProdutoCapa = {}): string {
  const titulo = produto.title || produto.titulo || produto.descricao || 'Livro';
  const autor = produto.author || produto.autor || '';
  const [escura, clara] = CORES[resumo(produto.genre || produto.genero || produto.familia || titulo) % CORES.length];
  const ls = linhas(titulo);
  const tamanho = ls.length > 3 ? 26 : 30;
  const inicio = 250 - ((ls.length - 1) * (tamanho + 6)) / 2;
  const tituloSvg = ls
    .map((l, i) => `<text x="150" y="${inicio + i * (tamanho + 6)}" text-anchor="middle" font-size="${tamanho}" font-weight="700">${escapar(l)}</text>`)
    .join('');
  const autorSvg = autor
    ? `<text x="150" y="${Math.min(400, inicio + ls.length * (tamanho + 6) + 18)}" text-anchor="middle" font-size="17" opacity=".85">${escapar(linhas(autor, 26, 1)[0])}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${clara}"/><stop offset="1" stop-color="${escura}"/></linearGradient></defs>`
    + `<rect width="300" height="450" fill="url(#g)"/>`
    + `<rect x="14" y="14" width="272" height="422" rx="6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`
    + `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(118 58)">`
    + `<path d="M4 10c8-4 18-4 28 2c10-6 20-6 28-2v44c-8-4-18-4-28 2c-10-6-20-6-28-2z"/><path d="M32 12v44"/></g>`
    + `<g fill="#fff" font-family="Georgia, 'Source Serif 4', serif">${tituloSvg}</g>`
    + `<g fill="#fff" font-family="Inter, system-ui, sans-serif">${autorSvg}`
    + `<text x="150" y="420" text-anchor="middle" font-size="13" letter-spacing="1" opacity=".75">Livraria Adventista</text></g>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default capaGerada;

/** O autor guardado nos dados do ramo de um artigo (`atributos`, em texto JSON ou já objecto). */
function autorDoArtigo(atributos: unknown): string {
  try {
    const a = typeof atributos === "string" ? JSON.parse(atributos) : atributos;
    return a && typeof a === "object" && typeof (a as Record<string, unknown>).autor === "string" ? String((a as Record<string, unknown>).autor) : "";
  } catch {
    return "";
  }
}

/** A capa de um artigo do KanGest sem fotografia: a descrição, o autor dos dados do ramo e a cor da família. Só produtos. */
export function capaDoArtigo(a: { descricao: string; tipo?: string; atributos?: unknown; familia_id?: number | null }): string | null {
  if (a.tipo === "S") return null;
  return capaGerada({ titulo: a.descricao, autor: autorDoArtigo(a.atributos), familia: String(a.familia_id ?? "") });
}
