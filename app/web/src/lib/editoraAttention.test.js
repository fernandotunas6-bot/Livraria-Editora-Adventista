// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { editoraAttention, mergeAttention } from './editoraAttention';

const TODAY = '2026-11-08';
const orders = [
  { id: 'o1', code: 'PRD-001', title: 'Hinário', status: 'em_curso', due_date: '2026-11-20' },
  { id: 'o2', code: 'PRD-002', title: 'Lições', status: 'planeada', due_date: '2026-11-01' },
  { id: 'o3', code: 'PRD-003', title: 'Concluída', status: 'concluida', due_date: '2026-10-01' },
];
const stages = [
  { order_id: 'o1', name: 'Revisão', status: 'em_curso', due_date: '2026-10-28', responsible_id: 's1', position: 1 },
  { order_id: 'o1', name: 'Capa', status: 'por_fazer', due_date: '2026-11-06', position: 2 },
  { order_id: 'o2', name: 'Impressão', status: 'concluida', due_date: '2026-10-20', position: 1 },
  { order_id: 'o2', name: 'Acabamento', status: 'nao_aplica', position: 2 },
  // De uma ordem fechada: não conta.
  { order_id: 'o3', name: 'Antiga', status: 'por_fazer', due_date: '2026-09-01', position: 1 },
];
const staff = [{ id: 's1', full_name: 'Maria Kiala' }];
const ids = (r) => r.items.map((i) => i.id);

describe('editoraAttention', () => {
  it('a produção vê as etapas atrasadas (a mais atrasada primeiro, com o responsável) e as ordens por concluir', () => {
    const r = editoraAttention({ perms: { production: true }, orders, stages, staff, today: TODAY });
    expect(ids(r)).toEqual(['producao-etapas-atrasadas', 'producao-ordens-atrasadas', 'producao-por-concluir']);
    const late = r.items[0];
    expect(late.severity).toBe('critical'); // a Revisão está atrasada há 11 dias
    expect(late.title).toBe('2 etapas da produção atrasadas');
    expect(late.detail).toContain('«Revisão» de PRD-001 (Hinário), prazo 28/10, há 11 dias · Maria Kiala');
    expect(late.action).toEqual({ section: 'producao', view: 'etapas' });
    expect(r.items[2].detail).toContain('PRD-002');
    expect(r.badges.producao).toEqual({ count: 2, tone: 'warning' });
  });

  it('atrasada há poucos dias é «a tratar», não urgente; sem responsável diz isso', () => {
    const r = editoraAttention({ perms: { production: true }, orders: [orders[0]], stages: [stages[1]], today: TODAY });
    expect(r.items[0].severity).toBe('warning');
    expect(r.items[0].detail).toContain('sem responsável');
  });

  it('sem permissão nem da produção nem das finanças: nada', () => {
    expect(editoraAttention({ perms: { orders: true }, orders, stages, today: TODAY })).toEqual({ items: [], badges: {} });
  });

  it('as finanças: salários de meses fechados por pagar, e os do mês só a partir do dia 25', () => {
    const payroll = [
      { period: '2026-10-01', net: 150000, status: 'por_pagar' },
      { period: '2026-10-01', net: 90000, status: 'por_pagar' },
      { period: '2026-11-01', net: 120000, status: 'por_pagar' },
    ];
    const early = editoraAttention({ perms: { finance: true }, payroll, today: TODAY });
    expect(ids(early)).toEqual(['salarios-atrasados']);
    expect(early.items[0].title).toBe('2 salários de outubro de 2026 por pagar');
    expect(early.items[0].action).toEqual({ section: 'funcionarios', view: 'salarios' });
    expect(early.badges.funcionarios).toEqual({ count: 2, tone: 'warning' });
    const late = editoraAttention({ perms: { finance: true }, payroll: payroll.slice(2), today: '2026-11-26' });
    expect(late.items.map((i) => i.title)).toEqual(['Salários de novembro de 2026: 1 por pagar']);
  });

  it('as finanças: o que se deve aos fornecedores (os pagamentos anulados não contam)', () => {
    const r = editoraAttention({
      perms: { finance: true },
      suppliers: [{ id: 'f1', name: 'Gráfica Huambo' }, { id: 'f2', name: 'Papelaria' }],
      costs: [{ supplier_id: 'f1', amount: 450000 }, { supplier_id: 'f2', amount: 10000 }],
      payments: [{ supplier_id: 'f1', amount: 300000, status: 'pago' }, { supplier_id: 'f1', amount: 150000, status: 'anulado' }, { supplier_id: 'f2', amount: 10000 }],
      today: TODAY,
    });
    expect(ids(r)).toEqual(['fornecedores-por-pagar']);
    expect(r.items[0].title).toMatch(/^Kz 150.000 por pagar a 1 fornecedor$/);
    expect(r.items[0].detail).toMatch(/^Gráfica Huambo: Kz 150.000\.$/);
    expect(r.items[0].action).toEqual({ section: 'producao', view: 'contas' });
  });

  it('as finanças vêem o número da Produção, mas não os avisos de quem a gere', () => {
    const r = editoraAttention({ perms: { finance: true }, orders, stages, today: TODAY });
    expect(r.badges.producao.count).toBe(2);
    expect(ids(r)).toEqual([]);
  });
});

describe('mergeAttention', () => {
  it('junta pela urgência, mantendo a ordem dentro do mesmo nível', () => {
    const a = [{ id: 'a1', severity: 'warning' }, { id: 'a2', severity: 'info' }];
    const b = [{ id: 'b1', severity: 'critical' }, { id: 'b2', severity: 'warning' }];
    expect(mergeAttention(a, b).map((i) => i.id)).toEqual(['b1', 'a1', 'b2', 'a2']);
  });
});
