// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { resumoDasConfiguracoes } from './kangestConfiguracoes';

describe('o resumo das configurações de um posto', () => {
  it('mostra a empresa e quantas há de cada', () => {
    const r = resumoDasConfiguracoes({
      empresa: { nome: 'Livraria Adventista — Huambo', nif: '5000000000', regime_iva: 'GERAL' },
      config: { 'vendas.precos_com_iva': '1', 'stock.sem_stock': 'avisar' },
      tabelas: { series: [{}, {}], armazens: [{}], taxas_iva: [{}, {}, {}] },
    });
    expect(r).toEqual([
      { rotulo: 'Empresa', valor: 'Livraria Adventista — Huambo' },
      { rotulo: 'NIF', valor: '5000000000' },
      { rotulo: 'Regime do IVA', valor: 'GERAL' },
      { rotulo: 'Séries', valor: '2' },
      { rotulo: 'Armazéns', valor: '1' },
      { rotulo: 'Taxas de IVA', valor: '3' },
      { rotulo: 'Opções', valor: '2' },
    ]);
  });

  it('não falha com uma fotografia vazia ou estragada', () => {
    expect(resumoDasConfiguracoes(null)).toEqual([]);
    expect(resumoDasConfiguracoes({ empresa: 'x', tabelas: 3 })).toEqual([{ rotulo: 'Opções', valor: '0' }]);
  });
});
