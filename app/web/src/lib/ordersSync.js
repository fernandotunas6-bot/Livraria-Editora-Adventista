// Actualizar a lista de encomendas do painel sem a pedir toda: só as que mudaram desde a última
// vez (coluna `updated`, com o relógio do servidor), juntas às que já lá estão.

/** Junta as encomendas que mudaram às que o painel já tem (pelo id), mais recentes primeiro. */
export function mergeOrders(current = [], changed = []) {
  if (!changed?.length) return current;
  const byId = new Map(current.map((o) => [o.id, o]));
  for (const o of changed) byId.set(o.id, { ...(byId.get(o.id) || {}), ...o });
  return [...byId.values()].sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
}

/**
 * A data de actualização mais recente entre as encomendas recebidas e a que já se tinha: o ponto
 * de partida do pedido seguinte (`updated >= …`). Compara as datas como texto ISO do servidor.
 */
export function newestUpdated(list = [], previous = null) {
  let max = previous;
  for (const o of list) if (o?.updated && (!max || o.updated > max)) max = o.updated;
  return max;
}
