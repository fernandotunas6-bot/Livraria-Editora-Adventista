// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: StoreGallery } = await import('./StoreGallery');

let root;
let host;
function montar(props) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<StoreGallery {...props} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const FOTOS = [
  { url: '/images/lojas/huambo-1.webp', caption: 'Balcão de atendimento' },
  { url: '/images/lojas/huambo-2.webp', caption: 'A equipa' },
  { url: '/images/lojas/huambo-3.webp', caption: 'As prateleiras' },
];

const dialogo = () => document.querySelector('[role="dialog"]');
const porRotulo = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes(texto));
const clicar = (botao) => act(() => botao.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const tecla = (key) => act(() => dialogo().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('StoreGallery', () => {
  it('não mostra nada quando a loja não tem fotografias', () => {
    expect(montar({ photos: [], storeName: 'Loja do Huambo' }).textContent).toBe('');
    expect(montar({ photos: undefined, storeName: 'Loja do Huambo' }).textContent).toBe('');
  });

  it('mostra uma miniatura por fotografia, com a legenda no texto alternativo', () => {
    montar({ photos: FOTOS, storeName: 'Loja do Huambo' });
    const imagens = [...host.querySelectorAll('img')];
    expect(imagens).toHaveLength(3);
    expect(imagens[0].alt).toBe('Balcão de atendimento');
    // A variante de 480 px existe para estas, e é a que o telemóvel desce.
    expect(imagens[0].srcset).toContain('/images/lojas/480/huambo-1.webp 480w');
  });

  it('a miniatura abre a fotografia em grande, com a legenda', () => {
    montar({ photos: FOTOS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: A equipa'));
    expect(dialogo().textContent).toContain('A equipa');
    expect(dialogo().textContent).toContain('2/3');
  });

  it('as setas do teclado andam na galeria e dão a volta', () => {
    montar({ photos: FOTOS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: Balcão'));
    tecla('ArrowRight');
    expect(dialogo().textContent).toContain('2/3');
    tecla('ArrowLeft');
    tecla('ArrowLeft');
    expect(dialogo().textContent).toContain('3/3');
  });

  it('os botões de andar fazem o mesmo', () => {
    montar({ photos: FOTOS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: Balcão'));
    clicar(porRotulo(dialogo(), 'Fotografia seguinte'));
    expect(dialogo().textContent).toContain('2/3');
  });

  it('mudar de loja fecha a fotografia que estava aberta', () => {
    montar({ photos: FOTOS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: Balcão'));
    expect(dialogo()).toBeTruthy();
    act(() => root.render(<StoreGallery photos={[FOTOS[0]]} storeName="Loja do Lubango" />));
    expect(dialogo()).toBeNull();
  });

  it('com uma só fotografia não mostra as setas', () => {
    montar({ photos: [FOTOS[0]], storeName: 'Loja do Lubango' });
    clicar(porRotulo(host, 'Ver em grande: Balcão'));
    expect(porRotulo(dialogo(), 'Fotografia seguinte')).toBeUndefined();
  });

  it('uma fotografia sem legenda ainda tem um nome para quem não a vê', () => {
    montar({ photos: [{ url: '/images/lojas/x-1.webp', caption: '' }], storeName: 'Loja do Lubango' });
    expect(host.querySelector('img').alt).toBe('Loja do Lubango — fotografia 1');
    expect(porRotulo(host, 'Ver fotografia 1 de 1')).toBeTruthy();
  });
});

describe('StoreGallery com muitas fotografias', () => {
  const MUITAS = Array.from({ length: 12 }, (_, i) => ({
    url: `/images/lojas/huambo-${i + 1}.webp`, caption: `Fotografia ${i + 1}`,
  }));

  it('mostra nove peças e a última conta as que faltam', () => {
    montar({ photos: MUITAS, storeName: 'Loja do Huambo' });
    expect(host.querySelectorAll('li')).toHaveLength(9);
    expect(host.textContent).toContain('12 fotografias');
    expect(host.textContent).toContain('+4');
    expect(porRotulo(host, 'Ver as restantes 4 fotografias')).toBeTruthy();
  });

  it('a última peça abre a galeria onde o mosaico ficou', () => {
    montar({ photos: MUITAS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver as restantes 4 fotografias'));
    expect(dialogo().textContent).toContain('9/12');
    clicar(porRotulo(dialogo(), 'Fotografia seguinte'));
    expect(dialogo().textContent).toContain('Fotografia 10');
  });

  it('a primeira fotografia é a peça grande', () => {
    montar({ photos: MUITAS, storeName: 'Loja do Huambo' });
    expect(host.querySelector('li').className).toContain('col-span-2 row-span-2');
  });

  it('com uma só fotografia, ela ocupa o quadro todo', () => {
    montar({ photos: [MUITAS[0]], storeName: 'Loja do Huambo' });
    expect(host.querySelector('li').className).toContain('col-span-4');
    expect(host.textContent).toContain('1 fotografia');
  });
});

describe('StoreGallery: andar pela galeria aberta', () => {
  const MUITAS = Array.from({ length: 12 }, (_, i) => ({
    url: `/images/lojas/huambo-${i + 1}.webp`, caption: `Fotografia ${i + 1}`,
  }));

  const abrirGrande = () => {
    montar({ photos: MUITAS, storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: Fotografia 1'));
    return dialogo().querySelector('figure img');
  };

  /** Um arrasto de `dx` píxeis sobre a fotografia, como o de um dedo. */
  const arrastar = (alvo, dx, dy = 0, pointerType = 'touch') => {
    const evento = (tipo, x, y) => {
      const e = new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(e, 'pointerType', { value: pointerType });
      return e;
    };
    act(() => {
      alvo.dispatchEvent(evento('pointerdown', 200, 300));
      alvo.dispatchEvent(evento('pointerup', 200 + dx, 300 + dy));
    });
  };

  it('arrastar o dedo para a esquerda passa à fotografia seguinte', () => {
    arrastar(abrirGrande(), -120);
    expect(dialogo().textContent).toContain('2/12');
  });

  it('arrastar para a direita volta atrás, e dá a volta', () => {
    arrastar(abrirGrande(), 120);
    expect(dialogo().textContent).toContain('12/12');
  });

  it('um toque, ou um arrasto a subir, não muda de fotografia', () => {
    const foto = abrirGrande();
    arrastar(foto, -10);
    expect(dialogo().textContent).toContain('1/12');
    arrastar(foto, -60, -200);
    expect(dialogo().textContent).toContain('1/12');
  });

  it('o rato não arrasta: aí há setas, teclado e a tira de miniaturas', () => {
    arrastar(abrirGrande(), -120, 0, 'mouse');
    expect(dialogo().textContent).toContain('1/12');
  });

  it('a tira de miniaturas salta para a fotografia escolhida e diz qual está aberta', () => {
    abrirGrande();
    const tira = dialogo().querySelector('ul[aria-label="Todas as fotografias"]');
    expect(tira.querySelectorAll('li')).toHaveLength(12);
    clicar(porRotulo(tira, 'Fotografia 7'));
    expect(dialogo().textContent).toContain('7/12');
    const activa = dialogo().querySelector('ul[aria-label="Todas as fotografias"] [aria-current="true"]');
    expect(activa.getAttribute('aria-label')).toBe('Fotografia 7');
  });

  it('com duas fotografias não vale a pena tira nenhuma', () => {
    montar({ photos: MUITAS.slice(0, 2), storeName: 'Loja do Huambo' });
    clicar(porRotulo(host, 'Ver em grande: Fotografia 1'));
    expect(dialogo().querySelector('ul[aria-label="Todas as fotografias"]')).toBeNull();
  });
});
