// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  friendlyDbError, monthLabel, monthStart, orderCost, orderOverdue, orderProgress, payrollNet, payrollTotals,
  pendingStages, shiftMonth, stageOverdue, supplierBalances, todayLuanda,
} from './production';

const HOJE = '2026-11-08';

describe('prazos e progresso', () => {
  it('hoje conta pela hora de Luanda (UTC+1)', () => {
    expect(todayLuanda(Date.parse('2026-11-08T23:30:00Z'))).toBe('2026-11-09');
    expect(todayLuanda(Date.parse('2026-11-08T22:59:00Z'))).toBe('2026-11-08');
  });

  it('etapa atrasada: prazo passado e ainda por fazer', () => {
    expect(stageOverdue({ due_date: '2026-11-07', status: 'por_fazer' }, HOJE)).toBe(true);
    expect(stageOverdue({ due_date: '2026-11-07', status: 'em_curso' }, HOJE)).toBe(true);
    expect(stageOverdue({ due_date: '2026-11-08', status: 'por_fazer' }, HOJE)).toBe(false);
    expect(stageOverdue({ due_date: '2026-11-01', status: 'concluida' }, HOJE)).toBe(false);
    expect(stageOverdue({ due_date: '2026-11-01', status: 'nao_aplica' }, HOJE)).toBe(false);
    expect(stageOverdue({ due_date: null, status: 'por_fazer' }, HOJE)).toBe(false);
  });

  it('ordem atrasada: só as abertas', () => {
    expect(orderOverdue({ due_date: '2026-11-01', status: 'em_curso' }, HOJE)).toBe(true);
    expect(orderOverdue({ due_date: '2026-11-01', status: 'concluida' }, HOJE)).toBe(false);
  });

  it('progresso: feitas e "não se aplica" contam; a etapa actual é a primeira por fazer', () => {
    const p = orderProgress([
      { position: 3, name: 'Impressão', status: 'por_fazer', due_date: '2026-11-01' },
      { position: 1, name: 'Revisão', status: 'concluida' },
      { position: 2, name: 'Capa', status: 'nao_aplica' },
      { position: 4, name: 'Acabamento', status: 'por_fazer' },
    ], HOJE);
    expect(p).toMatchObject({ total: 4, done: 2, pct: 50, overdue: 1, ready: false });
    expect(p.current.name).toBe('Impressão');
    expect(orderProgress([{ position: 1, status: 'concluida' }], HOJE)).toMatchObject({ pct: 100, ready: true, current: null });
    expect(orderProgress([], HOJE)).toMatchObject({ total: 0, pct: 0, ready: false });
  });
});

describe('custos e contas dos fornecedores', () => {
  it('custo por exemplar: pela tiragem, ou pelo que entrou depois de concluída', () => {
    const costs = [{ amount: '750000' }, { amount: 25000 }];
    expect(orderCost({ quantity: 500 }, costs)).toEqual({ total: 775000, units: 500, perUnit: 1550 });
    expect(orderCost({ quantity: 500, received_quantity: 480 }, costs).perUnit).toBe(1614.58);
    expect(orderCost({ quantity: 0 }, costs).perUnit).toBe(0);
  });

  it('o que se deve: custos − pagamentos, sem os anulados; mais devido primeiro', () => {
    const suppliers = [{ id: 'a', name: 'Gráfica A' }, { id: 'b', name: 'Papel B' }, { id: 'c', name: 'Sem movimento' }];
    const costs = [{ supplier_id: 'a', amount: 750000 }, { supplier_id: 'b', amount: 100000 }, { supplier_id: null, amount: 5 }];
    const payments = [
      { supplier_id: 'a', amount: 500000, status: 'pago' },
      { supplier_id: 'a', amount: 1234, status: 'anulado' },
      { supplier_id: 'b', amount: 100000, status: 'pago' },
    ];
    const rows = supplierBalances(suppliers, costs, payments);
    expect(rows.map((r) => [r.supplier.id, r.costs, r.paid, r.balance])).toEqual([
      ['a', 750000, 500000, 250000],
      ['b', 100000, 100000, 0],
    ]);
  });
});

describe('etapas por fazer', () => {
  const orders = [
    { id: 'o1', code: 'PRD-001', status: 'em_curso' },
    { id: 'o2', code: 'PRD-002', status: 'planeada' },
    { id: 'o3', code: 'PRD-003', status: 'concluida' },
  ];
  const staff = [{ id: 'f1', full_name: 'Maria' }];
  const stages = [
    { id: 's1', order_id: 'o1', position: 1, status: 'concluida' },
    { id: 's2', order_id: 'o1', position: 2, status: 'em_curso', due_date: '2026-11-05', responsible_id: 'f1' },
    { id: 's3', order_id: 'o2', position: 1, status: 'por_fazer', due_date: '2026-11-20' },
    { id: 's4', order_id: 'o2', position: 2, status: 'por_fazer' },
    { id: 's5', order_id: 'o3', position: 1, status: 'por_fazer', due_date: '2026-11-01' },
    { id: 's6', order_id: 'o1', position: 3, status: 'por_fazer', due_date: '2026-11-10' },
  ];
  it('só das ordens abertas; atrasadas primeiro, depois pelo prazo, sem prazo no fim', () => {
    const list = pendingStages({ orders, stages, staff, today: HOJE });
    expect(list.map((x) => x.stage.id)).toEqual(['s2', 's6', 's3', 's4']);
    expect(list[0]).toMatchObject({ overdue: true, responsible: { full_name: 'Maria' } });
    expect(list[3].responsible).toBeNull();
  });
});

describe('salários', () => {
  it('meses', () => {
    expect(monthStart('2026-11-17')).toBe('2026-11-01');
    expect(shiftMonth('2026-11-01', -1)).toBe('2026-10-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(monthLabel('2026-11-01')).toBe('Novembro de 2026');
    expect(monthLabel('2026-03-01')).toBe('Março de 2026');
  });

  it('líquido = base + subsídios − descontos (como a coluna da base de dados)', () => {
    expect(payrollNet({ base_salary: '160000', allowances: 20000, deductions: 4800 })).toBe(175200);
  });

  it('totais do mês: sem as anuladas; pagos e por pagar', () => {
    const t = payrollTotals([
      { status: 'pago', base_salary: 160000, allowances: 20000, deductions: 4800, net: 175200 },
      { status: 'por_pagar', base_salary: 90000, allowances: 0, deductions: 0, net: 90000 },
      { status: 'anulado', base_salary: 90000, allowances: 0, deductions: 0, net: 90000 },
    ]);
    expect(t).toEqual({
      count: 2, base: 250000, allowances: 20000, deductions: 4800, net: 265200,
      paid: 175200, paidCount: 1, due: 90000, dueCount: 1,
    });
  });
});

describe('erros da base de dados em palavras do painel', () => {
  it('traduz os que as pessoas encontram', () => {
    expect(friendlyDbError(new Error('update or delete on table "suppliers" violates foreign key constraint'))).toMatch(/desactive-o/);
    expect(friendlyDbError(new Error('new row violates check constraint "staff_members_phone_check"'))).toMatch(/telefone/);
    expect(friendlyDbError(new Error('duplicate key value violates unique constraint "staff_payroll_um_por_mes"'))).toMatch(/já tem o salário/);
    expect(friendlyDbError(new Error('Faltam etapas por concluir: Impressão.'))).toBe('Faltam etapas por concluir: Impressão.');
  });
});
