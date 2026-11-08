import React, { useEffect, useState } from 'react';
import { ShoppingCart as ShoppingCartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Barra de compra presa ao fundo, só no telemóvel (abaixo de 768 px).
 *
 * A ficha de um livro mede quase 6000px num ecrã de telemóvel, e os botões de compra ficam
 * a mais de mil do topo: no primeiro ecrã via-se a capa e o título, e nem preço nem botão.
 *
 * **Aparece sempre que os botões verdadeiros não estão à vista** — por baixo do ecrã (ao
 * chegar à página) ou já passados para cima (ao descer a ler a descrição e as avaliações),
 * como nas lojas grandes, em que comprar e juntar ao carrinho estão sempre ao alcance do
 * polegar. Quando os botões verdadeiros entram no ecrã, a barra sai: não se repete o que já
 * está à vista.
 *
 * Mede no deslocamento e não com `IntersectionObserver`. O observador seria o instrumento
 * indicado, e isolado comportava-se bem, mas dentro deste ecrã avisava à entrada dos botões
 * e não à saída — e uma barra que depende de um aviso que pode não chegar é pior do que uma
 * medição simples. Uma leitura por fotograma, agendada com `requestAnimationFrame` e só
 * enquanto a página se move, custa pouco: é um `getBoundingClientRect` sobre um elemento.
 *
 * Recebe o **elemento** e não um objecto `ref`: assim é uma dependência a sério do efeito,
 * que volta a correr assim que o elemento aparece em vez de ficar preso a um `ref` vazio.
 */
/** Altura da barra, para quem flutua no fundo se afastar dela. */
const ALTURA_BARRA = 72;

/** Os botões estão fora do ecrã (acima ou abaixo)? Exportada para os testes. */
export function buttonsOffScreen(rect, viewportHeight) {
  if (!rect) return false;
  return rect.bottom < 0 || rect.top > viewportHeight;
}

export default function StickyBuyBar({ alvo, price, originalPrice, onBuy, onAdd, disabled = false, label = 'Comprar' }) {
  const isMobile = useIsMobile();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!alvo || !isMobile) {
      setVisivel(false);
      return undefined;
    }
    let agendado = false;

    const medir = () => {
      agendado = false;
      setVisivel(buttonsOffScreen(alvo.getBoundingClientRect(), window.innerHeight));
    };

    const aoMover = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(medir);
    };

    // Posição de entrada: quem chega por uma âncora, ou a quem o navegador restaura o
    // deslocamento, já pode estar abaixo dos botões sem nunca ter deslocado nada.
    medir();
    window.addEventListener('scroll', aoMover, { passive: true });
    window.addEventListener('resize', aoMover, { passive: true });
    return () => {
      window.removeEventListener('scroll', aoMover);
      window.removeEventListener('resize', aoMover);
    };
  }, [alvo, isMobile]);

  // Avisa o resto da página da altura que esta barra ocupa, para o assistente, o botão de
  // subir e os avisos se afastarem em vez de ficarem por cima dela. Uma variável no documento
  // mantém isto desacoplado: nenhum desses componentes precisa de saber que esta barra existe.
  // Só quando se vê mesmo (antes ficava a 72 px também no tablet, onde a barra não aparece).
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty('--barra-compra', visivel ? `${ALTURA_BARRA}px` : '0px');
    return () => raiz.style.setProperty('--barra-compra', '0px');
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xs animate-in slide-in-from-bottom-4 duration-200 md:hidden"
      style={{ boxShadow: '0 -4px 16px -6px rgb(0 0 0 / 0.14)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-primary tabular-nums">{price}</p>
          {/* Só quando há mesmo promoção: sem ela, `originalPrice` é igual ao preço e a
              barra mostrava o mesmo valor duas vezes, uma delas riscada. */}
          {originalPrice && originalPrice !== price && (
            <p className="truncate text-xs text-muted-foreground line-through tabular-nums">{originalPrice}</p>
          )}
        </div>
        {onAdd && (
          <Button
            onClick={onAdd}
            disabled={disabled}
            variant="outline"
            className="h-12 w-12 shrink-0 border-marca p-0 text-primary hover:bg-marca/10"
            aria-label="Adicionar ao carrinho"
            title="Adicionar ao carrinho"
          >
            <ShoppingCartIcon className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}
        <Button onClick={onBuy} disabled={disabled} className="btn-primary h-12 shrink-0 px-5 text-base">
          {label}
        </Button>
      </div>
    </div>
  );
}
