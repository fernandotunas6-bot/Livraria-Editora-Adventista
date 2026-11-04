import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toggleWishlist = vi.fn();
vi.mock('@/hooks/useCart', () => ({ useCart: () => ({ addToCart: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useWishlist', () => ({ useWishlist: () => ({ isInWishlist: () => false, toggleWishlist }) }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { whatsapp: '+244900000000' } }) }));

const { default: ProductCard } = await import('./ProductCard');

const livro = (extra = {}) => ({
  id: 'b1', title: 'O Grande Conflito', subtitle: 'Ellen G. White', book_code: 'LIV-001', image: '/c.jpg',
  purchasable: true, type: { value: 'Ellen G. White' },
  variants: [{ id: 'b1-default', inventory_quantity: 5, price_in_cents: 2000000, price_formatted: 'Kz 20 000,00', sale_price_in_cents: null, sale_price_formatted: null }],
  ...extra,
});

let root;
let host;
function mount(props) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter><TooltipProvider><ProductCard {...props} /></TooltipProvider></MemoryRouter>));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const labels = (el) => [...el.querySelectorAll('button, a')].map((b) => b.getAttribute('aria-label') || b.textContent.trim());

describe('ProductCard (grelha)', () => {
  it('mostra título, autor, preço e todas as acções', () => {
    const el = mount({ product: livro() });
    expect(el.querySelector('h3').textContent).toBe('O Grande Conflito');
    expect(el.textContent).toContain('Ellen G. White');
    expect(el.textContent).toContain('Kz 20 000,00');
    const l = labels(el);
    expect(l).toContain('Adicionar aos Favoritos');
    expect(l).toContain('Partilhar no WhatsApp');
    expect(l).toContain('Visualização rápida de O Grande Conflito');
    expect(l).toContain('Comprar');
    expect(l).toContain('Ver detalhes de O Grande Conflito');
    expect(el.textContent).not.toMatch(/−\d+%/);
  });

  it('desconto só com promoção real, e o preço antigo riscado', () => {
    const v = { id: 'b1-default', inventory_quantity: 5, price_in_cents: 2000000, price_formatted: 'Kz 20 000,00', sale_price_in_cents: 1500000, sale_price_formatted: 'Kz 15 000,00' };
    const el = mount({ product: livro({ variants: [v] }) });
    expect(el.textContent).toContain('−25%');
    expect(el.querySelector('.line-through').textContent).toBe('Kz 20 000,00');
  });

  it('esgotado: sem "Comprar", com "Ver detalhes"', () => {
    const el = mount({ product: livro({ variants: [{ ...livro().variants[0], inventory_quantity: 0 }] }) });
    expect(el.textContent).toContain('Esgotado');
    expect(labels(el)).not.toContain('Comprar');
    expect(labels(el)).toContain('Ver detalhes');
  });

  it('o modo lista continua o de antes', () => {
    const el = mount({ product: livro(), viewMode: 'list' });
    expect(el.querySelector('.w-28.h-36')).not.toBeNull();
    expect(labels(el)).toContain('Visualizar');
  });
});
