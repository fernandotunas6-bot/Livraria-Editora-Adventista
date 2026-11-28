// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O resumo legível das configurações de um posto do KanGest (a fotografia de sinc/configuracoes.rs): a empresa, o NIF,
 * o regime do IVA, e quantas séries, armazéns, taxas, modos de pagamento e chaves há. Para o painel ver de relance o
 * que ficou guardado.
 */
const TABELAS = [
  ['series', 'Séries'],
  ['armazens', 'Armazéns'],
  ['taxas_iva', 'Taxas de IVA'],
  ['modos_pagamento', 'Modos de pagamento'],
  ['tipos_documento', 'Tipos de documento'],
  ['familias', 'Famílias'],
  ['contas', 'Contas'],
  ['perfis', 'Perfis'],
];

export function resumoDasConfiguracoes(f) {
  if (!f || typeof f !== 'object') return [];
  const out = [];
  const e = f.empresa && typeof f.empresa === 'object' ? f.empresa : null;
  if (e?.nome) out.push({ rotulo: 'Empresa', valor: String(e.nome) });
  if (e?.nif) out.push({ rotulo: 'NIF', valor: String(e.nif) });
  if (e?.regime_iva) out.push({ rotulo: 'Regime do IVA', valor: String(e.regime_iva) });
  const t = f.tabelas && typeof f.tabelas === 'object' ? f.tabelas : {};
  for (const [k, rotulo] of TABELAS) {
    if (Array.isArray(t[k])) out.push({ rotulo, valor: String(t[k].length) });
  }
  const config = f.config && typeof f.config === 'object' ? Object.keys(f.config).length : 0;
  out.push({ rotulo: 'Opções', valor: String(config) });
  return out;
}
