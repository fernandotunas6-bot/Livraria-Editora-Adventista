import React, { useCallback, useEffect, useRef, useState } from 'react';
import SafeLink from '@/components/SafeLink.jsx';
import { playableVideoUrl } from '@/lib/videoUrl';
import { safeLinkUrl } from '@/lib/safeLink';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getHeroSlides } from '@/api/EcommerceApi';
import { sortSlides, getTransition, getSlideDuration } from '@/lib/slideTransitions';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { siteSrcSet } from '@/lib/imageUrl';
import { prefersReducedMotion } from '@/lib/featureFlags';
import { useSwipe } from '@/hooks/useSwipe';

// Imagens feitas com as capas reais do catálogo (public/images/site); usadas só se não houver slides na base de dados.
const FALLBACK_SLIDES = [
  {
    id: '1',
    title: 'Catálogo Oficial da Livraria',
    subtitle: 'Centenas de títulos adventistas — teologia, família, saúde e muito mais.',
    image: '/images/site/slide-catalogo.webp',
    cta_text: 'Ver Catálogo Geral',
    cta_link: '/shop?category=Cat%C3%A1logo%20Geral',
    template: 'classic',
    is_primary: true,
    transition: 'fade',
    media_type: 'image',
  },
  {
    id: '2',
    title: 'Obras de Ellen G. White',
    subtitle: 'Clássicos da literatura adventista disponíveis na nossa loja.',
    image: '/images/site/slide-ellen-white.webp',
    cta_text: 'Pesquisar Ellen G. White',
    cta_link: '/shop?search=Ellen',
    template: 'classic',
    transition: 'slide',
    media_type: 'image',
  },
  {
    id: '3',
    title: 'Colportagem',
    subtitle: 'Títulos para evangelização e saúde com condições especiais.',
    image: '/images/site/slide-colportagem.webp',
    cta_text: 'Ver Colportagem',
    cta_link: '/shop?category=Colportagem',
    template: 'minimal',
    transition: 'wipe',
    media_type: 'image',
  },
];

function SlideMedia({ slide, eager, still = false }) {
  // Só um ficheiro que a etiqueta `<video>` saiba tocar. Um link do YouTube colado no painel
  // dava um rectângulo preto, sem erro nem aviso (ver lib/videoUrl.js); agora cai na imagem.
  const videoSrc = slide.media_type === 'video' ? playableVideoUrl(slide.video_url) : '';
  if (videoSrc) {
    return (
      <video
        src={videoSrc}
        className="w-full h-full object-cover"
        // Quem pediu menos movimento no sistema vê a imagem de capa do vídeo, parada.
        autoPlay={!still}
        muted
        loop
        playsInline
        poster={slide.image || undefined}
      />
    );
  }
  const srcSet = siteSrcSet(slide.image);
  return (
    <img
      src={slide.image}
      // Os slides do site têm uma variante de 960 px: no telemóvel desciam 1920 px (até 150 KB)
      // para um ecrã de 390, e era a imagem que mais demorava a aparecer (A360-28).
      srcSet={srcSet || undefined}
      sizes={srcSet ? '100vw' : undefined}
      width={1920}
      height={1080}
      decoding="async"
      alt={slide.title}
      className="w-full h-full object-cover"
      loading={eager ? 'eager' : 'lazy'}
      // A primeira imagem é o maior elemento da página inicial (o LCP): pede-se antes das
      // capas. Minúsculas de propósito: o React 18 não conhece `fetchPriority`.
      fetchpriority={eager ? 'high' : undefined}
      // Imagem externa indisponível: fica só o fundo do slide, sem ícone de imagem partida.
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

function SlideContent({ slide }) {
  const template = slide.template || 'classic';
  // 0 significa "sem preço promocional" (é o valor por omissão do campo).
  const priceLabel = Number(slide.promo_price) > 0
    ? `Kz ${Number(slide.promo_price).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}`
    : null;

  // `SafeLink`: o endereço de cada slide é escrito no painel (ver components/SafeLink.jsx).
  const ctaButton = safeLinkUrl(slide.cta_link) ? (
    <SafeLink to={slide.cta_link}>
      <Button size="lg" className="btn-primary text-base md:text-lg px-6 md:px-8 py-5 md:py-6 rounded-full mt-6">
        {slide.cta_text || 'Explorar'}
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </SafeLink>
  ) : null;

  if (template === 'book_promo') {
    return (
      <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12 max-w-4xl text-white">
        {(slide.book_cover || slide.image) && (
          <img src={slide.book_cover || slide.image} alt={slide.book_title || slide.title} className="w-40 md:w-52 h-auto rounded-xl shadow-2xl ring-4 ring-white/20" />
        )}
        <div>
          {slide.promo_badge && <span className="inline-block bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full mb-3">{slide.promo_badge}</span>}
          <h1 className="text-3xl sm:text-4xl/10 md:text-5xl/none font-bold mb-3 leading-tight">{slide.title}</h1>
          {slide.book_author && <p className="text-[#22d3ee] font-medium mb-2">{slide.book_author}</p>}
          {slide.subtitle && <p className="text-lg text-white/85 mb-2">{slide.subtitle}</p>}
          {slide.body_html && <div className="text-sm text-white/75 prose prose-invert prose-sm max-w-none mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(slide.body_html) }} />}
          {priceLabel && <p className="text-3xl font-bold text-[#22d3ee]">{priceLabel}</p>}
          {ctaButton}
        </div>
      </div>
    );
  }

  if (template === 'split') {
    return (
      <div className="grid md:grid-cols-2 gap-8 items-center max-w-5xl text-white w-full">
        <div className="hidden md:block rounded-2xl overflow-hidden shadow-2xl aspect-4/3">
          <SlideMedia slide={slide} eager={false} />
        </div>
        <div>
          {slide.promo_badge && <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3">{slide.promo_badge}</span>}
          <h1 className="text-4xl md:text-5xl/none font-bold mb-4 leading-tight">{slide.title}</h1>
          {slide.subtitle && <p className="text-lg text-white/85 mb-4">{slide.subtitle}</p>}
          {slide.body_html && <div className="text-sm text-white/75 prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(slide.body_html) }} />}
          {ctaButton}
        </div>
      </div>
    );
  }

  if (template === 'minimal') {
    return (
      <div className="max-w-3xl mx-auto text-center text-white">
        {slide.promo_badge && <span className="inline-block bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">{slide.promo_badge}</span>}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 text-balance">{slide.title}</h1>
        {slide.subtitle && <p className="text-lg md:text-xl text-white/80 mb-4">{slide.subtitle}</p>}
        {slide.body_html && <div className="text-sm text-white/70 prose prose-invert prose-sm max-w-none mx-auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(slide.body_html) }} />}
        <div className="flex justify-center">{ctaButton}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl text-white">
      {slide.promo_badge && <span className="inline-block bg-amber-400/90 text-amber-900 text-xs font-bold px-3 py-1 rounded-full mb-3">{slide.promo_badge}</span>}
      <h1 className="text-4xl sm:text-5xl/none md:text-6xl/none lg:text-7xl/none font-bold mb-4 md:mb-6 text-balance leading-tight">{slide.title}</h1>
      {slide.subtitle && <p className="text-lg md:text-xl text-white/85 mb-4 max-w-xl">{slide.subtitle}</p>}
      {slide.body_html && <div className="text-sm text-white/75 prose prose-invert prose-sm max-w-none mb-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(slide.body_html) }} />}
      {priceLabel && <p className="text-2xl font-bold text-[#22d3ee] mb-2">{priceLabel}</p>}
      {ctaButton}
    </div>
  );
}

const HeroSlider = () => {
  const [slides, setSlides] = useState(FALLBACK_SLIDES);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  // Duas razões para parar, separadas: o rato ou o foco por cima (volta sozinho ao sair) e o
  // botão Parar (só volta quando a pessoa o pede). Juntas, sair com o rato desfazia o Parar.
  // WCAG 2.2.2: conteúdo que passa sozinho mais de 5 s tem de se poder parar — no telemóvel
  // não há rato por cima, e o botão era a única forma. Com "menos movimento" pedido no
  // sistema, começa parado.
  const [reduceMotion] = useState(() => prefersReducedMotion());
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(reduceMotion);
  const paused = hoverPaused || userPaused;
  // Retomar é uma ordem: anda logo, mesmo com o dedo (ou o foco) ainda no botão — sem isto, no
  // telemóvel o "Retomar" parecia não fazer nada até se tocar noutro sítio.
  const toggleAutoplay = () => {
    if (userPaused) {
      setUserPaused(false);
      setHoverPaused(false);
    } else {
      setUserPaused(true);
    }
  };
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef(null);
  // `true` depois de o carrossel avançar pela primeira vez: até lá, nada de animações de troca.
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (current !== 0) setAdvanced(true);
  }, [current]);

  useEffect(() => {
    getHeroSlides('home')
      .then((data) => {
        if (data.length > 0) {
          const sorted = sortSlides(data);
          setSlides(sorted);
          setCurrent(0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const slide = slides[current] || slides[0];
  const duration = getSlideDuration(slide);
  const transition = getTransition(slide);
  const isSplit = slide?.template === 'split';

  const goTo = useCallback((index) => {
    setCurrent((index + slides.length) % slides.length);
    setProgressKey((k) => k + 1);
  }, [slides.length]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);
  const swipe = useSwipe({ onNext: next, onPrev: prev });

  useEffect(() => {
    if (slides.length <= 1 || paused) return undefined;
    timerRef.current = setInterval(() => {
      setCurrent((i) => (i + 1) % slides.length);
      setProgressKey((k) => k + 1);
    }, duration);
    return () => clearInterval(timerRef.current);
  }, [slides.length, paused, duration, current]);

  if (!slide) return null;

  return (
    <section
      className="hero-height heroi-subida relative min-h-[520px] max-h-[900px] overflow-hidden bg-foreground"
      aria-label="Destaques"
      aria-roledescription="carrossel"
      {...(slides.length > 1 ? swipe : {})}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      {/* Sem animação no primeiro desenho nem quando os slides da base de dados substituem os de
          recurso (a chave só muda quando o carrossel avança): antes, o primeiro slide aparecia
          com um fade de 0,9 s e, quando a base de dados respondia, saía e entrava outro com mais
          um — e a imagem do herói é o maior elemento da página inicial. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={advanced ? `bg-${slide.id}-${current}` : 'bg-inicial'} className="absolute inset-0" {...transition.bg}>
          {!isSplit && (
            <>
              <SlideMedia slide={slide} eager={current === 0} still={reduceMotion} />
              {/* O véu é mais carregado no telemóvel: aí o texto atravessa o ecrã todo e a ponta
                  direita do subtítulo e do botão cai sobre a zona clara da imagem — em cima das
                  capas, que são o que há de mais claro. No computador o texto ocupa o terço
                  esquerdo e o gradiente original chega, por isso fica como estava. */}
              <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/70 to-black/50 md:from-black/75 md:via-black/45 md:to-black/20" />
            </>
          )}
          {isSplit && <div className="absolute inset-0 bg-linear-to-br from-(--brand-dark) to-(--brand-primary)" />}
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 h-full flex items-center">
        <div className="container-custom w-full">
          <AnimatePresence mode="wait">
            <motion.div key={advanced ? `text-${slide.id}-${current}` : 'text-inicial'} {...transition.text}>
              <SlideContent slide={slide} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {slides.length > 1 && (
        <>
          {/* As setas ficam em baixo, ao lado dos pontos, em todos os tamanhos. A meio
              tapavam o texto do slide — e não era só no telemóvel: a seta acaba sempre a
              56px da margem, e o `container-custom` só se afasta da borda acima dos 1280px
              que tem de largura máxima, por isso em tudo abaixo de ~1392px (um portátil de
              1366 incluído) a seta assentava em cima do título. Em baixo não há largura em
              que colida. Só o botão do assistente, preso ao fundo do ecrã, as tapava no
              telemóvel: a fila sobe o necessário para passar por cima dele (.heroi-subida,
              index.css), e num ecrã alto fica onde estava. */}
          <button type="button" onClick={prev} className="absolute left-4 heroi-seta z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors backdrop-blur-xs" aria-label="Slide anterior">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button type="button" onClick={next} className="absolute right-4 heroi-seta z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors backdrop-blur-xs" aria-label="Próximo slide">
            <ChevronRight className="h-6 w-6" />
          </button>
          {/* O ponto mede 8px: em vez de o engordar, o botão à volta dele passa a medir 24,
              o mínimo que a WCAG 2.5.8 pede em AA. O intervalo sai do contentor porque o
              preenchimento de cada botão já afasta os pontos — somados, davam alvos
              encostados a nada e uma fila larga de mais. */}
          <div className="absolute heroi-pontos left-1/2 -translate-x-1/2 z-20 flex">
            {/* Parar e retomar a passagem automática, ao lado dos pontos e da mesma altura. 36px
                de largura no telemóvel (acima dos 24 da WCAG 2.5.8): com seis slides num ecrã
                de 320px, a fila continua a caber entre as duas setas. */}
            <button
              type="button"
              onClick={toggleAutoplay}
              className="grid h-11 w-9 place-items-center text-white/80 transition-colors hover:text-white sm:h-6 sm:w-8"
              aria-label={userPaused ? 'Retomar a passagem dos destaques' : 'Parar a passagem dos destaques'}
            >
              {userPaused
                ? <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                : <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
            </button>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                className="group grid h-11 place-items-center px-2 sm:h-6"
                aria-label={`Ir para slide ${i + 1}${s.is_primary ? ' (principal)' : ''}`}
              >
                <span className={`block h-2 rounded-full transition-all duration-base ${i === current ? 'w-8 bg-white' : 'w-2 bg-white/40 group-hover:bg-white/60'}`} />
              </button>
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
            {!paused && (
              <motion.div
                key={`progress-${current}-${progressKey}`}
                className="h-full bg-(--brand-primary)"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: duration / 1000, ease: 'linear' }}
              />
            )}
          </div>
        </>
      )}

      {loading && <div className="absolute inset-0 z-30 bg-background/20 animate-pulse pointer-events-none" />}
    </section>
  );
};

export default HeroSlider;
