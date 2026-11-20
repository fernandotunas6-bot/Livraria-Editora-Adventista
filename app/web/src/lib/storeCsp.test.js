import { describe, expect, it } from 'vitest';
import { STORE_SCRIPT_POLICY, applyStoreScriptPolicy, isStaffPath, needsReloadForStaff } from './storeCsp';

const novoDocumento = () => document.implementation.createHTMLDocument('teste');

describe('isStaffPath', () => {
  it('o painel e as moradas antigas', () => {
    for (const p of ['/admin', '/admin/', '/admin?tab=books', '/gestao', '/painel', '/painel-admin', '/painel-vendas.html', '/admin.html']) {
      expect(isStaffPath(p), p).toBe(true);
    }
  });
  it('a loja', () => {
    for (const p of ['/', '/shop', '/product/abc', '/administracao-de-empresas', '/painelx', '/track']) {
      expect(isStaffPath(p), p).toBe(false);
    }
  });
  it('no domínio do Painel de Gestão, tudo é painel', () => {
    expect(isStaffPath('/', true)).toBe(true);
  });
});

describe('applyStoreScriptPolicy', () => {
  it('na loja junta a política, só uma vez', () => {
    const doc = novoDocumento();
    expect(applyStoreScriptPolicy({ doc, pathname: '/shop' })).toBe(true);
    expect(applyStoreScriptPolicy({ doc, pathname: '/shop' })).toBe(true);
    const metas = doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].content).toBe(STORE_SCRIPT_POLICY);
  });
  it('a política da loja não deixa entrar os domínios da Google', () => {
    expect(STORE_SCRIPT_POLICY).not.toMatch(/google|gstatic/);
    expect(STORE_SCRIPT_POLICY).toMatch(/challenges\.cloudflare\.com/);
    expect(STORE_SCRIPT_POLICY).not.toMatch(/unsafe/);
  });
  it('no painel não junta nada', () => {
    const doc = novoDocumento();
    expect(applyStoreScriptPolicy({ doc, pathname: '/admin' })).toBe(false);
    expect(doc.querySelector('meta[http-equiv]')).toBeNull();
  });
  it('quem entra no painel vindo da loja recarrega', () => {
    const doc = novoDocumento();
    applyStoreScriptPolicy({ doc, pathname: '/' });
    expect(needsReloadForStaff('/admin', { doc })).toBe(true);
    expect(needsReloadForStaff('/shop', { doc })).toBe(false);
  });
});
