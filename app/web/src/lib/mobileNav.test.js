import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OPEN_CART_EVENT, OPEN_HEADER_SEARCH_EVENT, activeTab, bottomNavVisible, requestCartOpen } from './mobileNav';

describe('evento de pesquisa', () => {
  it('é o mesmo que o cabeçalho ouve', () => {
    const header = readFileSync(path.resolve(__dirname, '../components/Header.jsx'), 'utf8');
    expect(header).toContain(`OPEN_HEADER_SEARCH_EVENT = '${OPEN_HEADER_SEARCH_EVENT}'`);
  });
});

describe('bottomNavVisible', () => {
  it('aparece nas páginas de descoberta e de conta', () => {
    for (const p of ['/', '/shop', '/shop/biblias', '/colecoes', '/colecoes/x', '/profile', '/track', '/about', '/contact', '/faq', '/lojas', '/success'])
      expect(bottomNavVisible(p), p).toBe(true);
  });
  it('não aparece na ficha do livro (tem a barra de compra) nem nos ecrãs de tarefa', () => {
    for (const p of ['/product/abc', '/admin', '/admin?tab=orders', '/painel', '/login', '/forgot-password', '/reset-password', '/unsubscribe'])
      expect(bottomNavVisible(p), p).toBe(false);
  });
});

describe('activeTab', () => {
  it('marca o separador da página', () => {
    expect(activeTab('/')).toBe('inicio');
    expect(activeTab('/shop')).toBe('categorias');
    expect(activeTab('/colecoes/biblias')).toBe('categorias');
    expect(activeTab('/profile')).toBe('conta');
    expect(activeTab('/about')).toBeNull();
  });
});

describe('requestCartOpen', () => {
  let off;
  afterEach(() => off?.());
  it('diz se algum carrinho respondeu', () => {
    expect(requestCartOpen()).toBe(false);
    const h = (e) => { e.detail.handled = true; };
    window.addEventListener(OPEN_CART_EVENT, h);
    off = () => window.removeEventListener(OPEN_CART_EVENT, h);
    expect(requestCartOpen()).toBe(true);
  });
});
