// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Percentagem do colportor. A regra que conta está na base de dados
 * (`private.colporteur_pct`, migração 20261107101000_colportores); esta cópia serve a matriz e
 * a simulação do painel. Os casos de `colporteurCommission.cases.json` correm contra as duas.
 *
 * Ordem:
 * 1. excepção do próprio colportor — a mais específica (tipo de produto vale 2, modo 1);
 * 2. regra geral mais específica — categoria vale 4, tipo de produto 2, modo de venda 1;
 * 3. a percentagem base das definições.
 * Só contam as que estão em vigor na data; em empate, a que começou mais tarde.
 */

export const CATEGORIES = {
  aspirante: { label: 'Aspirante', hint: 'Novo colportor, com cartão de identificação.' },
  estudante: { label: 'Estudante', hint: 'Plano de bolsa: trabalha nas férias para pagar os estudos.' },
  tempo_parcial: { label: 'Tempo parcial', hint: 'Não cumpre as horas de tempo inteiro.' },
  licenciado: { label: 'Licenciado', hint: 'Cumpriu os requisitos do campo.' },
  credenciado: { label: 'Credenciado', hint: '12 meses ou mais e os requisitos do campo.' },
};

export const SALE_MODES = {
  consignacao: { label: 'Consignação', hint: 'A Livraria entrega os livros; o colportor paga o que vende e devolve o resto.' },
  compra: { label: 'Compra com desconto', hint: 'O colportor compra à Livraria com o desconto e revende ao preço de capa.' },
  site: { label: 'Venda no site', hint: 'O cliente compra no site com o código do colportor.' },
};

export const STATUSES = {
  candidatura: { label: 'Candidatura', tone: 'blue' },
  em_analise: { label: 'Em análise', tone: 'amber' },
  activo: { label: 'Activo', tone: 'green' },
  suspenso: { label: 'Suspenso', tone: 'red' },
  inactivo: { label: 'Inactivo', tone: 'muted' },
  recusado: { label: 'Recusado', tone: 'muted' },
};

/** Para onde se pode passar a partir de cada estado (igual a colporteur_set_status). */
export const STATUS_FLOW = {
  candidatura: ['em_analise', 'activo', 'recusado'],
  em_analise: ['candidatura', 'activo', 'recusado'],
  activo: ['suspenso', 'inactivo'],
  suspenso: ['activo', 'inactivo'],
  inactivo: ['activo'],
  recusado: ['candidatura', 'em_analise'],
};

export const today = () => new Date().toISOString().slice(0, 10);

/** A linha está em vigor na data (YYYY-MM-DD)? */
export function inForce(row, date = today()) {
  return String(row.valid_from) <= date && (!row.valid_to || String(row.valid_to) >= date);
}

const newer = (a, b) => String(b.valid_from).localeCompare(String(a.valid_from));

/**
 * @returns {{ pct: number, source: 'excepcao'|'regra'|'base', row: object|null }}
 */
export function resolvePct({ category, productType = null, saleMode = null, date = today(), rules = [], overrides = [], basePct = 0 }) {
  const fits = (r) => (r.product_type == null || r.product_type === productType) && (r.sale_mode == null || r.sale_mode === saleMode) && inForce(r, date);
  const best = (rows, score) => rows.sort((a, b) => score(b) - score(a) || newer(a, b))[0] || null;

  const o = best(overrides.filter(fits), (r) => (r.product_type != null) * 2 + (r.sale_mode != null));
  if (o) return { pct: Number(o.pct), source: 'excepcao', row: o };
  const r = best(rules.filter((x) => fits(x) && (x.category == null || x.category === category)),
    (x) => (x.category != null) * 4 + (x.product_type != null) * 2 + (x.sale_mode != null));
  if (r) return { pct: Number(r.pct), source: 'regra', row: r };
  return { pct: Number(basePct) || 0, source: 'base', row: null };
}

/** Matriz categoria × modo de venda (sem tipo de produto), para a tabela do painel. */
export function commissionMatrix({ rules, basePct, date = today() }) {
  return Object.fromEntries(Object.keys(CATEGORIES).map((cat) => [cat, Object.fromEntries(
    Object.keys(SALE_MODES).map((mode) => [mode, resolvePct({ category: cat, saleMode: mode, date, rules, basePct })]),
  )]));
}

/** Kz com separador de milhares, como no resto do site. */
export function kz(value) {
  return `${Number(value || 0).toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
}
