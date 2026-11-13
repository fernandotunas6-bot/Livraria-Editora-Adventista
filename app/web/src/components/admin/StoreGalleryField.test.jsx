import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// O campo de imagem fala com o Storage e com o Google Drive; aqui interessa só o que ele
// devolve quando uma fotografia é aceite.
vi.mock('@/components/admin/ImageField', () => ({
  default: ({ label, onChange }) => (
    <button type="button" onClick={() => onChange('/images/lojas/nova.webp')}>{label}</button>
  ),
}));

const { default: StoreGalleryField } = await import('./StoreGalleryField');
const { GALERIA_MAX_FOTOS } = await import('@/lib/stores');

let root;
let host;
function montar(props) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<StoreGalleryField {...props} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const carregar = (texto) => [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).includes(texto));
const clicar = (botao) => act(() => botao.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const FOTOS = [
  { url: '/images/lojas/huambo-1.webp', caption: 'Balcão' },
  { url: '/images/lojas/huambo-2.webp', caption: 'Equipa' },
];

describe('StoreGalleryField', () => {
  it('mostra cada fotografia com a sua legenda', () => {
    montar({ photos: FOTOS, onChange: vi.fn() });
    expect(host.querySelectorAll('li')).toHaveLength(2);
    expect([...host.querySelectorAll('input')].map((i) => i.value)).toEqual(['Balcão', 'Equipa']);
    expect(host.textContent).toContain('a primeira abre a galeria');
  });

  it('junta a fotografia que o campo de imagem devolve', () => {
    const onChange = vi.fn();
    montar({ photos: FOTOS, onChange });
    clicar(carregar('Juntar outra fotografia'));
    expect(onChange).toHaveBeenCalledWith([...FOTOS, { url: '/images/lojas/nova.webp', caption: '' }]);
  });

  it('convida a juntar a primeira quando a loja ainda não tem nenhuma', () => {
    montar({ photos: [], onChange: vi.fn() });
    expect(carregar('Juntar a primeira fotografia')).toBeTruthy();
  });

  it('remove a fotografia escolhida', () => {
    const onChange = vi.fn();
    montar({ photos: FOTOS, onChange });
    clicar(carregar('Remover a fotografia 1'));
    expect(onChange).toHaveBeenCalledWith([FOTOS[1]]);
  });

  it('troca a ordem com as setas', () => {
    const onChange = vi.fn();
    montar({ photos: FOTOS, onChange });
    clicar(carregar('Descer a fotografia 1'));
    expect(onChange).toHaveBeenCalledWith([FOTOS[1], FOTOS[0]]);
  });

  it('não deixa subir a primeira nem descer a última', () => {
    montar({ photos: FOTOS, onChange: vi.fn() });
    expect(carregar('Subir a fotografia 1').disabled).toBe(true);
    expect(carregar('Descer a fotografia 2').disabled).toBe(true);
  });

  it('com a galeria cheia, diz que é preciso remover uma antes de juntar outra', () => {
    const cheia = Array.from({ length: GALERIA_MAX_FOTOS }, (_, i) => ({ url: `/${i}.webp`, caption: '' }));
    montar({ photos: cheia, onChange: vi.fn() });
    expect(host.textContent).toContain('Galeria completa');
    expect(carregar('Juntar')).toBeUndefined();
  });

  it('avisa enquanto uma fotografia ainda está a ser enviada', () => {
    montar({ photos: [{ url: 'blob:http://localhost/abc', caption: '' }], onChange: vi.fn() });
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/a ser enviada/);
  });
});
