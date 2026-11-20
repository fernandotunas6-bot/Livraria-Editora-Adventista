// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionMenuPreview, PermissionSwitches, opensText, permissionsByArea } from './PermissionAreas';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount(ui) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('permissões por área', () => {
  it('arrumadas pela ordem das áreas do painel', () => {
    expect(permissionsByArea().map((g) => g.label)).toEqual(['Catálogo', 'Editora', 'Vendas', 'Relatórios', 'Clientes', 'Pessoal', 'Igreja', 'Sistema']);
  });

  it('cada permissão diz o que abre, calculado do registo das secções', () => {
    expect(opensText('manage_colporteurs')).toBe('Colportagem, Registo da Igreja (só leitura)');
    expect(opensText('manage_settings')).not.toContain('Integrações');
  });

  it('os interruptores mudam só a permissão tocada', async () => {
    const onChange = vi.fn();
    const el = await mount(<PermissionSwitches value={{ manage_orders: true }} onChange={onChange} />);
    expect([...el.querySelectorAll('legend')].map((l) => l.textContent)).toContain('Igreja');
    const label = [...el.querySelectorAll('label')].find((l) => l.textContent.startsWith('Colportagem'));
    expect(label.textContent).toContain('Abre: Colportagem');
    act(() => label.querySelector('button[role="switch"]').click());
    expect(onChange).toHaveBeenCalledWith({ manage_orders: true, manage_colporteurs: true });
  });

  it('a pré-visualização mostra o menu que a pessoa vai ter', async () => {
    const el = await mount(<PermissionMenuPreview role="manager" permissions={{ manage_marketing: true }} />);
    expect(el.textContent).toContain('Clientes:');
    expect(el.textContent).toContain('Contactos e campanhas');
    expect(el.textContent).toContain('Sistema:');
    expect(el.textContent).toContain('Faixa de aviso');
    expect(el.textContent).not.toContain('Encomendas');
    expect(el.textContent).toContain('Só para administradores: Integrações, Registo de segurança');
  });

  it('sem permissões, diz que só vê o Início; para um cliente, nada', async () => {
    const el = await mount(<PermissionMenuPreview role="manager" permissions={{}} />);
    expect(el.textContent).toContain('Só o Início');
    act(() => root.render(<PermissionMenuPreview role="member" permissions={{ manage_orders: true }} />));
    expect(el.textContent).toBe('');
  });
});
