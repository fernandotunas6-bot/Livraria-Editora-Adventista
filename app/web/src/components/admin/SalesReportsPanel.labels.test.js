import { describe, expect, it } from 'vitest';
import { monthLabel, ordersLabel, shortTitle } from '@/components/admin/SalesReportsPanel';

describe('textos do relatório de vendas', () => {
  it('mês com maiúscula só na primeira letra ("Novembro de 2026", não "Novembro De 2026")', () => {
    expect(monthLabel('novembro de 2026')).toBe('Novembro de 2026');
    expect(monthLabel('')).toBe('');
  });
  it('plural dos pedidos', () => {
    expect(ordersLabel(1)).toBe('1 pedido');
    expect(ordersLabel(0)).toBe('0 pedidos');
    expect(ordersLabel(4)).toBe('4 pedidos');
  });
  it('títulos longos cortados para o eixo do gráfico', () => {
    expect(shortTitle('1844 - Uma Explicação Simples das Principais Profecias de Daniel')).toBe('1844 - Uma Explicação Simpl…');
    expect(shortTitle('9 Virtudes da Fé')).toBe('9 Virtudes da Fé');
    expect(shortTitle('x'.repeat(40)).length).toBe(28);
  });
});
