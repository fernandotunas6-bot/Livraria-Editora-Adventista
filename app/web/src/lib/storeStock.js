/**
 * Disponibilidade por loja: cada loja marca nos produtos «temos» ou «não temos» (tabela
 * public.store_stock, migração 20261114180000_lojas_donas_dos_dados).
 *
 * Sem marca é «por marcar»: não se sabe, e o site nunca o mostra como «não temos». Por isso, no
 * levantamento, uma loja só deixa de se poder escolher quando disse «não temos» a algum livro do
 * carrinho; uma loja que ainda não marcou nada continua a poder escolher-se, como antes.
 *
 * O stock da venda online continua a ser um só (o do KiGest, em stock_books.stock): isto diz em
 * que lojas está cada produto, não quantos há.
 */
import { supabase } from '@/lib/supabaseClient';
import { productOnlyDigital } from '@/lib/digitalEditions';

export const ESTADOS = {
  temos: { label: 'Temos', tone: 'green' },
  'nao-temos': { label: 'Não temos', tone: 'red' },
  'por-marcar': { label: 'Por marcar', tone: 'muted' },
};

const semAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O estado de um produto numa loja, a partir das marcas dela (Map: produto → true/false). */
export function estadoDe(marcas, bookId) {
  const v = marcas?.get(bookId);
  if (v === true) return 'temos';
  if (v === false) return 'nao-temos';
  return 'por-marcar';
}

/** Os produtos que se marcam: os que têm alguma coisa física (um só digital não tem stock). */
export const produtoComStock = (p) => !!p && !productOnlyDigital(p);

/** Quantos há em cada estado (para o topo do ecrã e os filtros). */
export function contagens(produtos, marcas) {
  const c = { temos: 0, 'nao-temos': 0, 'por-marcar': 0, total: 0 };
  for (const p of produtos) {
    c[estadoDe(marcas, p.id)] += 1;
    c.total += 1;
  }
  return c;
}

/**
 * A lista do painel, filtrada: `procura` no título, no autor e no código (sem acentos nem
 * maiúsculas; várias palavras têm de estar todas), `estado` ('todos' ou um de ESTADOS) e `tipo`
 * (o tipo de produto, ou vazio para todos).
 */
export function filtrarProdutos(produtos, marcas, { procura = '', estado = 'todos', tipo = '' } = {}) {
  const palavras = semAcentos(procura).split(/\s+/).filter(Boolean);
  return produtos.filter((p) => {
    if (estado !== 'todos' && estadoDe(marcas, p.id) !== estado) return false;
    if (tipo && (p.product_type || 'livro') !== tipo) return false;
    if (!palavras.length) return true;
    const texto = semAcentos(`${p.title || ''} ${p.author || ''} ${p.book_code || ''} ${p.sku || ''}`);
    return palavras.every((w) => texto.includes(w));
  });
}

/** As lojas (da lista dada, pela ordem dela) que marcaram «temos» neste produto. */
export function lojasComProduto(marcasDoProduto, lojas) {
  const tem = new Set((marcasDoProduto || []).filter((m) => m.available === true).map((m) => m.store_id));
  return (lojas || []).filter((l) => tem.has(l.id));
}

/**
 * O que cada loja diz dos livros impressos do carrinho, para o levantamento.
 * `itens`: [{ bookId, title }] (só os que se levantam; sem repetidos). Devolve um Map
 * loja → { faltam: [títulos com «não temos»], temTudo: todos com «temos», podeEscolher }.
 */
export function levantamentoPorLoja(lojas, marcas, itens) {
  const porLoja = new Map();
  for (const m of marcas || []) {
    if (!porLoja.has(m.store_id)) porLoja.set(m.store_id, new Map());
    porLoja.get(m.store_id).set(m.book_id, m.available);
  }
  const resultado = new Map();
  for (const loja of lojas || []) {
    const daLoja = porLoja.get(loja.id) || new Map();
    const faltam = itens.filter((i) => daLoja.get(i.bookId) === false).map((i) => i.title);
    const temTudo = itens.length > 0 && itens.every((i) => daLoja.get(i.bookId) === true);
    resultado.set(loja.id, { faltam, temTudo, podeEscolher: faltam.length === 0 });
  }
  return resultado;
}

/** Os produtos de um carrinho que se levantam numa loja: sem as edições digitais e sem repetidos. */
export function itensParaLevantar(cartItems, { isDigital = () => false, titleOf = (i) => i?.product?.title || '' } = {}) {
  const vistos = new Map();
  for (const item of cartItems || []) {
    const bookId = item?.product?.id;
    if (!bookId || isDigital(item) || vistos.has(bookId)) continue;
    vistos.set(bookId, { bookId: String(bookId), title: titleOf(item) });
  }
  return [...vistos.values()];
}

// --- Base de dados ------------------------------------------------------------------------------

function mensagem(error) {
  if (!error) return 'Não foi possível guardar.';
  if (error.code === '42501') return 'Sem permissão para marcar o stock desta loja.';
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    return 'A disponibilidade por loja ainda não está na base de dados (migração por aplicar).';
  }
  return error.message || 'Não foi possível guardar.';
}

/** As lojas que esta pessoa pode marcar: todas, a quem gere o catálogo; a sua, a quem tem «Stock da loja». */
export async function lojasQuePossoMarcar() {
  const { data, error } = await supabase.rpc('store_stock_my_stores');
  if (error) throw new Error(mensagem(error));
  return data || [];
}

/** As marcas de uma loja: Map produto → true («temos») ou false («não temos»). */
export async function marcasDaLoja(storeId) {
  const { data, error } = await supabase.from('store_stock').select('book_id, available').eq('store_id', storeId);
  if (error) throw new Error(mensagem(error));
  return new Map((data || []).map((r) => [r.book_id, r.available]));
}

/** Marca vários produtos numa loja: true = temos, false = não temos, null = por marcar. Devolve quantos mudaram. */
export async function marcar(storeId, bookIds, available) {
  const { data, error } = await supabase.rpc('store_stock_set', { p_store_id: storeId, p_book_ids: bookIds, p_available: available });
  if (error) throw new Error(mensagem(error));
  return Number(data) || 0;
}

/**
 * As marcas de alguns produtos, em todas as lojas à vista (para a página do produto e o
 * levantamento). Nunca falha: sem a tabela ou sem rede, devolve uma lista vazia e o site mostra o
 * que mostrava antes.
 */
export async function marcasDosProdutos(bookIds) {
  const ids = [...new Set((bookIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  try {
    const { data, error } = await supabase.from('store_stock').select('store_id, book_id, available').in('book_id', ids);
    return error ? [] : data || [];
  } catch {
    return [];
  }
}
