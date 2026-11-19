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
  // o azul do logótipo e o ciano dos arcos, para os fundos e os acentos
  marinho: '#0b2a55',
  marinhoProfundo: '#071a36',
  azul: '#1d4f91',
  ciano: '#0ea5c8',
};

// Cada loja com a sua cor (a mesma na fita, nas últimas vendas e na lista), pela ordem em que o painel as dá.
const CORES_LOJAS = ['#0ea5c8', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];
export const COR_ONLINE = '#10b981';

/** A cor de uma loja: o online é sempre verde; as outras pela posição na lista de lojas. */
export function corDaLoja(id, alvos) {
  if (id === 'online') return COR_ONLINE;
  const i = (alvos || []).filter((a) => a.id !== 'online').findIndex((a) => a.id === id);
  return CORES_LOJAS[(i < 0 ? 0 : i) % CORES_LOJAS.length];
}

/** Medalha do ranking (1.º, 2.º, 3.º). */
export const MEDALHAS = ['#f5c542', '#c0c7d1', '#d08a4f'];
