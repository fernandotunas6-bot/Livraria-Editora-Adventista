/**
 * A marca do Painel de Gestão: o logótipo da Livraria & Editora Adventista (o azul, e o branco para os fundos
 * escuros) e as cores. Para outro cliente, troca-se só este ficheiro.
 */
import logoAzul from '@/painel-vendas/logo-livraria-adventista.png';
import logoBranco from '@/painel-vendas/logo-livraria-adventista-claro.png';

export const MARCA = {
  nome: 'Livraria & Editora Adventista',
  logoAzul,
  logoBranco,
  // A paleta editorial do site (index.css, --color-editorial-*): o azul petróleo e o branco, com o ouro nos acentos.
  petroleo: '#0a748f',
  petroleoEscuro: '#075a70',
  petroleoProfundo: '#05404f',
  petroleoClaro: '#7fd3e6',
  ouro: '#b8892f',
  ouroTexto: '#7a5716',
  tinta: '#1d2a3f',
  papel: '#fffdf8',
  // ouro claro: texto pequeno sobre o petróleo (contraste acima de 4,5 na faixa escura)
  ouroClaro: '#fcefc7',
  // os nomes por papel que os componentes usam (faixa, fundos escuros, barras, linhas)
  marinho: '#075a70',
  marinhoProfundo: '#05404f',
  azul: '#0a748f',
  ciano: '#0a748f',
};

// Cada loja com a sua cor (a mesma na fita, nas últimas vendas e na lista), pela ordem em que o painel as dá.
const CORES_LOJAS = ['#0a748f', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];
export const COR_ONLINE = '#10b981';

/** A cor de uma loja: o online é sempre verde; as outras pela posição na lista de lojas. */
export function corDaLoja(id, alvos) {
  if (id === 'online') return COR_ONLINE;
  const i = (alvos || []).filter((a) => a.id !== 'online').findIndex((a) => a.id === id);
  return CORES_LOJAS[(i < 0 ? 0 : i) % CORES_LOJAS.length];
}

/** Medalha do ranking (1.º, 2.º, 3.º). */
export const MEDALHAS = ['#d4a73f', '#c0c7d1', '#c9875a'];
