// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { DEFAULT_HIDDEN, FLOATING_PAGE_KEYS, floatingPageOf, hiddenPages, isFloatingHidden } from './floatingButtons';

describe('floatingPageOf', () => {
  it('agrupa as rotas do site', () => {
    expect(floatingPageOf('/')).toBe('inicio');
    expect(floatingPageOf('/shop')).toBe('loja');
    expect(floatingPageOf('/catalog/livros')).toBe('loja');
    expect(floatingPageOf('/colecoes/essenciais')).toBe('loja');
    expect(floatingPageOf('/product/abc123')).toBe('produto');
    expect(floatingPageOf('/success')).toBe('encomenda');
    expect(floatingPageOf('/track')).toBe('encomenda');
    expect(floatingPageOf('/login')).toBe('entrar');
    expect(floatingPageOf('/reset-password')).toBe('entrar');
    expect(floatingPageOf('/perfil')).toBe('perfil');
    expect(floatingPageOf('/faq')).toBe('informacao');
    expect(floatingPageOf('/admin')).toBe('painel');
    expect(floatingPageOf('/painel-vendas-huambo')).toBe('painel');
  });
  it('não confunde rotas parecidas, e uma página desconhecida não tem grupo', () => {
    expect(floatingPageOf('/shopping')).toBe('');
    expect(floatingPageOf('/pagina-que-nao-existe')).toBe('');
  });
});

describe('isFloatingHidden', () => {
  it('sem nada gravado, usa as páginas por omissão', () => {
    expect(isFloatingHidden('chat', '/product/x', {})).toBe(true);
    expect(isFloatingHidden('top', '/success', {})).toBe(true);
    expect(isFloatingHidden('chat', '/login', {})).toBe(true);
    expect(isFloatingHidden('chat', '/shop', {})).toBe(false);
    expect(isFloatingHidden('top', '/', {})).toBe(false);
  });
  it('segue a escolha do painel, para cada botão', () => {
    const settings = { chat_hidden_on: ['painel'], scroll_top_hidden_on: [] };
    expect(isFloatingHidden('chat', '/admin', settings)).toBe(true);
    expect(isFloatingHidden('chat', '/product/x', settings)).toBe(false);
    expect(isFloatingHidden('top', '/product/x', settings)).toBe(false);
  });
  it('a lista vazia mostra os botões em todo o lado; chaves desconhecidas são ignoradas', () => {
    expect(hiddenPages({ chat_hidden_on: [] }, 'chat')).toEqual([]);
    expect(hiddenPages({ chat_hidden_on: ['xpto', 'loja'] }, 'chat')).toEqual(['loja']);
  });
  it('as omissões só usam chaves conhecidas', () => {
    for (const k of [...DEFAULT_HIDDEN.chat, ...DEFAULT_HIDDEN.top]) expect(FLOATING_PAGE_KEYS).toContain(k);
  });
});
