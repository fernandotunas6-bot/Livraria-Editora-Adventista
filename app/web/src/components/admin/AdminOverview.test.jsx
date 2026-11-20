// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminOverview, { upToDateAreas } from './AdminOverview';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (props) => act(() => root.render(
  <AdminOverview userName="Ana" orders={[]} books={[]} lowStockBooks={[]} onNavigate={() => {}} onOpenOrders={() => {}}
    onEditBook={() => {}} onAddProduct={() => {}} {...props} />,
));
const buttons = () => [...host.querySelectorAll('button')];

describe('Início: a Editora e as finanças', () => {
  it('os avisos da Editora entram no «Precisa de atenção», pela urgência, e o «Ver» abre a vista certa', () => {
    const onNavigate = vi.fn();
    render({
      perms: { production: true, finance: true },
      onNavigate,
      extraAttention: [
        { id: 'fornecedores-por-pagar', severity: 'info', title: 'Kz 150 000,00 por pagar a 1 fornecedor', detail: 'Gráfica', action: { section: 'producao', view: 'contas' } },
        { id: 'producao-etapas-atrasadas', severity: 'critical', title: '2 etapas da produção atrasadas', detail: 'Revisão', action: { section: 'producao', view: 'etapas' } },
      ],
    });
    const list = host.querySelector('section[aria-labelledby="painel-atencao"]');
    expect(list.textContent).toContain('Precisa de atenção (2)');
    const rows = [...list.querySelectorAll('li')];
    expect(rows[0].textContent).toContain('2 etapas da produção atrasadas');
    expect(rows[0].textContent).toContain('Urgente');
    act(() => rows[0].querySelector('button').click());
    expect(onNavigate).toHaveBeenCalledWith('producao', { filter: undefined, view: 'etapas' });
  });

  it('atalhos para a Produção, os Funcionários e as Entradas e saídas, para quem os pode abrir', () => {
    const onNavigate = vi.fn();
    render({ perms: { finance: true }, onNavigate });
    const labels = buttons().map((b) => b.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['Produção da Editora', 'Funcionários', 'Entradas e saídas']));
    act(() => buttons().find((b) => b.textContent.includes('Entradas e saídas')).click());
    expect(onNavigate).toHaveBeenCalledWith('financas');
    render({ perms: { staff: true }, onNavigate });
    const only = buttons().map((b) => b.textContent.trim());
    expect(only).toContain('Funcionários');
    expect(only).not.toContain('Produção da Editora');
    expect(only).not.toContain('Entradas e saídas');
  });

  it('«Tudo em dia» diz só o que a pessoa vê', () => {
    render({ perms: { production: true } });
    expect(host.querySelector('[role="status"]').textContent).toBe(' Tudo em dia: nada atrasado na produção.');
    expect(upToDateAreas({ orders: true, catalog: true })).toBe('nas encomendas, nos pagamentos nem no catálogo');
    expect(upToDateAreas({ orders: true, catalog: true, production: true, finance: true }))
      .toBe('nas encomendas, nos pagamentos, no catálogo, na produção nem nos salários');
    expect(upToDateAreas({})).toBe('');
  });
});
