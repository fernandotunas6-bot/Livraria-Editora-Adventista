/**
 * As capas de livros do fundo: o topo do painel de cada loja, o do relatório conjunto e o fundo
 * «Capas animadas» dos vídeos.
 *
 * Primeiro as capas dos mais vendidos (da loja ou da rede, no ano escolhido); a completar, capas
 * do catálogo que estão no próprio site (public/images/capas, todas 340×510, 2:3, da mesma origem:
 * o canvas dos vídeos pode desenhá-las sem CORS). A lista do catálogo deixa de fora os títulos de
 * temas sensíveis (saúde, sexualidade, luto), que não ficam bem num fundo decorativo.
 *
 * Puro, excepto pintarParede(), que monta as colunas no DOM do Shadow DOM do painel.
 */

const CATALOGO = [
  'COL-001', 'LIV-004', 'LIV-011', 'LIV-021', 'LIV-026', 'LIV-027', 'LIV-031', 'LIV-037', 'LIV-038',
  'LIV-039', 'LIV-045', 'LIV-047', 'LIV-050', 'LIV-052', 'LIV-062', 'LIV-064', 'LIV-066', 'LIV-067',
  'LIV-068', 'LIV-079', 'LIV-083', 'LIV-086', 'LIV-097', 'LIV-100', 'LIV-013', 'LIV-024', 'LIV-002',
  'LIV-032', 'LIV-041', 'LIV-053', 'LIV-061', 'LIV-091',
];
export const CAPAS_DO_CATALOGO = CATALOGO.map((c) => `/images/capas/${c}.jpg`);

/** Um número de 32 bits a partir de um texto (a mesma loja e ano dão sempre a mesma ordem). */
function semente(texto) {
  let h = 2166136261;
  for (const ch of String(texto || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Baralha `lista` de forma estável para a mesma `chave` (Fisher–Yates com um gerador simples). */
export function baralhar(lista, chave) {
  const a = [...lista];
  let s = semente(chave) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Os endereços das capas para o fundo, sem repetidos: as dos mais vendidos (`itens`, com `capa`
 * já resolvida por destaques.js) e depois as do catálogo, baralhadas por `chave`, até `n`.
 */
export function capasParaFundo(itens, { n = 18, chave = '' } = {}) {
  const vistas = new Set();
  const out = [];
  const juntar = (u) => {
    const v = String(u || '').trim();
    if (!v || vistas.has(v) || out.length >= n) return;
    vistas.add(v);
    out.push(v);
  };
  (itens || []).forEach((it) => juntar(typeof it === 'string' ? it : it && it.capa));
  baralhar(CAPAS_DO_CATALOGO, chave).forEach(juntar);
  return out;
}

/** Reparte `urls` por `colunas` colunas, alternadas (a 1.ª capa na 1.ª coluna, a 2.ª na 2.ª…). */
export function emColunas(urls, colunas) {
  const cols = Array.from({ length: Math.max(1, colunas) }, () => []);
  urls.forEach((u, i) => cols[i % cols.length].push(u));
  return cols;
}

/**
 * Monta a parede de capas em `contentor` (um elemento vazio do topo). Cada capa vai numa moldura
 * 2:3: a imagem inteira (object-fit: contain), sem cortar nem esticar, sobre uma cópia desfocada
 * dela que preenche o resto. Cada coluna leva as capas duas vezes, para o movimento contínuo
 * (CSS) não ter salto. Uma capa que não carregue sai da parede.
 */
export function pintarParede(contentor, urls, { colunas = 5 } = {}) {
  if (!contentor) return;
  const doc = contentor.ownerDocument;
  const chave = urls.join('|') + '#' + colunas;
  if (contentor.dataset.capas === chave) return;
  contentor.dataset.capas = chave;
  const moldura = (u) => {
    const f = doc.createElement('figure');
    f.className = 'hc';
    const fundo = doc.createElement('img');
    fundo.className = 'hc-f'; fundo.alt = ''; fundo.decoding = 'async'; fundo.loading = 'lazy'; fundo.src = u;
    const capa = doc.createElement('img');
    capa.className = 'hc-c'; capa.alt = ''; capa.decoding = 'async'; capa.loading = 'lazy'; capa.src = u;
    capa.addEventListener('error', () => f.remove(), { once: true });
    f.append(fundo, capa);
    return f;
  };
  contentor.replaceChildren(...emColunas(urls, colunas).map((col, i) => {
    const c = doc.createElement('div');
    c.className = 'hc-col';
    c.style.setProperty('--hc-dur', `${70 + (i % 3) * 14}s`);
    c.style.setProperty('--hc-atraso', `${-(i * 9)}s`);
    // Duas vezes a mesma sequência: a animação sobe meia altura e recomeça sem se notar.
    [...col, ...col].forEach((u) => c.appendChild(moldura(u)));
    return c;
  }));
  contentor.hidden = !urls.length;
}

/**
 * A lista dos mais vendidos com as capas em moldura: `lista` é o <ol> do cartão, `itens` vem de
 * destaques.js (titulo, capa, unidades, valor). Sem capa (ou se ela não carregar), uma capa
 * tipográfica com o título. `fmt` = { unid(n), kz(v) }.
 */
export function pintarMaisVendidos(lista, itens, { n = 6, fmt } = {}) {
  if (!lista) return;
  const doc = lista.ownerDocument;
  const el = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const semCapa = (f, titulo) => { f.replaceChildren(el('div', 'hc-sem', titulo || 'Livro')); };
  lista.replaceChildren(...(itens || []).slice(0, n).map((it, i) => {
    const li = el('li', 'mv-i');
    const f = el('figure', 'hc mv-capa');
    const u = String(it.capa || '').trim();
    if (u) {
      const fundo = el('img', 'hc-f'); fundo.alt = ''; fundo.decoding = 'async'; fundo.loading = 'lazy'; fundo.src = u;
      const capa = el('img', 'hc-c'); capa.alt = `Capa de ${it.titulo || 'livro'}`; capa.decoding = 'async'; capa.loading = 'lazy'; capa.src = u;
      capa.addEventListener('error', () => { semCapa(f, it.titulo); f.prepend(pos); }, { once: true });
      f.append(fundo, capa);
    } else {
      semCapa(f, it.titulo);
    }
    const pos = el('span', 'mv-pos', `${i + 1}.º`);
    f.prepend(pos);
    const t = el('div', 'mv-t');
    t.append(el('b', null, it.titulo || 'Produto'));
    const partes = [fmt && fmt.unid ? fmt.unid(it.unidades) : `${it.unidades} un.`];
    if (it.valor != null && fmt && fmt.kz) partes.push(fmt.kz(it.valor));
    t.append(el('span', null, partes.join(' · ')));
    li.append(f, t);
    return li;
  }));
}
