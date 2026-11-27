// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MOTION } from '@/lib/motion';
import { useSwipe } from '@/hooks/useSwipe';

export const SHOP_BANNER_IMAGES = [
  '/images/site/loja-banner.webp',
  '/images/site/opcoes/loja-doutrina.webp',
  '/images/site/opcoes/loja-ellen-white.webp',
  '/images/site/opcoes/loja-familia.webp',
  '/images/site/opcoes/loja-leque.webp',
  '/images/site/opcoes/loja-parede.webp',
  '/images/site/opcoes/loja-prateleira.webp',
];

/**
 * O véu dos banners com livros (revisão do estilo de 27/11, escolha 8): mais escuro do lado do texto e mais claro do lado
 * dos livros, para o texto se ler e as capas se verem.
 */
export function veuDoLadoDoTexto(opacidade) {
  const o = Number.isFinite(opacidade) ? Math.min(1, Math.max(0, opacidade)) : 0.55;
  const cor = (a) => `rgba(12, 74, 110, ${Math.round(a * 1000) / 1000})`;
  return `linear-gradient(90deg, ${cor(Math.min(1, o + 0.25))} 0%, ${cor(o)} 45%, ${cor(o * 0.45)} 100%)`;
}

export default function PageBannerSlider({
  children,
  images = SHOP_BANNER_IMAGES,
  // O que mostrar quando `images` vem vazia. Por omissão, os banners da loja. A página das
  // lojas passa `[]`: enquanto as lojas carregam vê-se a cor da marca, e não um relance de
  // capas de livros que depois dá lugar às fotografias das lojas.
  fallbackImages = SHOP_BANNER_IMAGES,
  overlayOpacity = 0.65,
  contentClassName = 'text-left',
  ariaLabel = 'Banners da livraria',
  // No telemóvel, mais baixo e sem os pontos (a imagem continua a mudar sozinha): na loja, os
  // livros têm de aparecer no primeiro ecrã (análise crítica de 2026-11-20).
  compactOnMobile = false,
  // Na loja, os livros ficam à direita, longe do texto, e o véu escurece o lado do texto (revisão do estilo de 27/11).
  // No computador, a imagem ocupa só a parte da direita e desvanece para a cor da faixa; no telemóvel, o enquadramento
  // leva os livros para a beira direita.
  livrosADireita = false,
}) {
  const configuredSlides = [...new Set((images || []).filter(Boolean))];
  const slides = configuredSlides.length > 0 ? configuredSlides : fallbackImages;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const activeIndex = current % slides.length;
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setCurrent((index) => (index + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, reducedMotion]);

  const navigate = (direction) => {
    setCurrent((index) => (index + direction + slides.length) % slides.length);
  };
  const swipe = useSwipe({ onNext: () => navigate(1), onPrev: () => navigate(-1) });

  return (
    <section
      role="region"
      aria-roledescription="carrossel"
      aria-label={ariaLabel}
      // No telemóvel, espaço para a barra fina do cabeçalho (56px, com o logótipo) e para a
      // área segura do topo (ver .pt-below-thin-bar): sem isto o texto centrado subia para
      // debaixo do logótipo.
      className={`pt-below-thin-bar relative isolate flex ${compactOnMobile ? 'min-h-[150px] sm:min-h-[240px]' : 'min-h-[240px]'} items-center overflow-hidden bg-[#0c4a6e] text-white md:min-h-[290px]`}
      {...(slides.length > 1 ? swipe : {})}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      {slides.length > 0 && (
        <AnimatePresence mode="sync">
          <motion.img
            key={slides[activeIndex]}
            src={slides[activeIndex]}
            alt=""
            aria-hidden="true"
            className={livrosADireita
              ? 'absolute inset-0 h-full w-full object-cover object-[20%_center] md:left-[38%] md:w-[62%] md:object-[65%_center] md:[mask-image:linear-gradient(to_right,transparent,#000_30%)] md:[-webkit-mask-image:linear-gradient(to_right,transparent,#000_30%)]'
              : 'absolute inset-0 h-full w-full object-cover object-[65%_center] md:object-center'}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.8, ease: MOTION.ease }}
            loading="eager"
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
          />
        </AnimatePresence>
      )}
      <div
        className="absolute inset-0"
        style={{
          background: livrosADireita
            ? veuDoLadoDoTexto(overlayOpacity)
            : `linear-gradient(90deg, rgba(12, 74, 110, ${overlayOpacity}) 0%, rgba(12, 74, 110, ${overlayOpacity * 0.82}) 58%, rgba(12, 74, 110, ${overlayOpacity * 0.68}) 100%)`,
        }}
      />

      <div className={`container-custom relative z-10 ${compactOnMobile ? 'pb-4 pt-6 sm:pb-14 sm:pt-10' : 'pb-14 pt-10'} md:py-14 ${contentClassName}`}>
        {children}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Banner anterior"
            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/25 p-2 text-white transition hover:bg-black/50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-white sm:block md:left-6"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="Próximo banner"
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/25 p-2 text-white transition hover:bg-black/50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-white sm:block md:right-6"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          {/* O ponto mede 8px: quem cresce é o botão à volta dele, até aos 24 que a WCAG
              2.5.8 pede em AA. O intervalo sai do contentor porque o preenchimento de cada
              botão já afasta os pontos — somados, davam uma fila larga de mais. */}
          <div className={`absolute bottom-0 left-1/2 z-20 ${compactOnMobile ? 'hidden sm:flex' : 'flex'} -translate-x-1/2 sm:bottom-3`}>
            {slides.map((image, index) => (
              <button
                key={image}
                type="button"
                onClick={() => setCurrent(index)}
                aria-label={`Mostrar banner ${index + 1}`}
                aria-pressed={activeIndex === index}
                className="group grid h-11 place-items-center px-2 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-white sm:h-6"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${
                    activeIndex === index ? 'w-7 bg-white' : 'w-2 bg-white/60 group-hover:bg-white'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
