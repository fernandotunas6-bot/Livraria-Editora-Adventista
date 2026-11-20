import React, { useEffect, useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { getShopSlides } from '@/api/EcommerceApi';
import { sortSlides, getTransition, getSlideDuration } from '@/lib/slideTransitions';
import { resolveShopBgMode } from '@/lib/shopTheme';
import ShopHeroMotion from '@/components/ShopHeroMotion';
import PageBannerSlider, { SHOP_BANNER_IMAGES } from '@/components/PageBannerSlider';
import { playableVideoUrl } from '@/lib/videoUrl';

function ShopSlideMedia({ slide }) {
  // Ver lib/videoUrl.js: um endereço de plataforma (YouTube e afins) não toca num `<video>`.
  const videoSrc = slide.media_type === 'video' ? playableVideoUrl(slide.video_url) : '';
  if (videoSrc) {
    return (
      <video src={videoSrc} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline poster={slide.image} />
    );
  }
  if (slide.image) {
    const isSvg = slide.image.endsWith('.svg') || slide.image.includes('image/svg');
    return (
      <div
        className="absolute inset-0 w-full h-full bg-cover bg-center"
        style={{
          backgroundImage: `url(${slide.image})`,
          backgroundSize: isSvg ? 'contain' : 'cover',
          backgroundRepeat: isSvg ? 'repeat' : 'no-repeat',
        }}
      />
    );
  }
  return null;
}

export default function ShopHeroBackground({ settings, children }) {
  const mode = resolveShopBgMode(settings);
  // `Number(undefined)` é `NaN`, e `NaN ?? 0.55` continua `NaN`: o `??` só apanha `null` e
  // `undefined`. O valor por omissão nunca entrava e saía `rgba(12, 74, 110, NaN)` — cor
  // inválida, véu nenhum, e o texto branco do herói directamente sobre a fotografia. Limita-se
  // também ao intervalo útil, porque o painel aceita o número escrito à mão.
  const overlayPedido = Number(settings.shop_bg_overlay);
  const overlay = Number.isFinite(overlayPedido) ? Math.min(1, Math.max(0, overlayPedido)) : 0.55;
  const [slides, setSlides] = useState([]);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (mode === 'slides') {
      getShopSlides().then((data) => {
        setSlides(sortSlides(data));
        setCurrent(0);
      });
    }
  }, [mode]);

  const slide = slides[current];
  const duration = slide ? getSlideDuration(slide, 8000) : 8000;
  const transition = slide ? getTransition(slide) : null;

  const next = useCallback(() => {
    setCurrent((i) => (i + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (mode !== 'slides' || slides.length <= 1 || paused) return undefined;
    const t = setInterval(next, duration);
    return () => clearInterval(t);
  }, [mode, slides.length, paused, duration, next]);

  if (mode === 'image' && settings.shop_bg_image_url) {
    return (
      <PageBannerSlider
        images={[settings.shop_bg_image_url, ...SHOP_BANNER_IMAGES]}
        overlayOpacity={overlay}
        contentClassName="text-left"
      >
        {children}
      </PageBannerSlider>
    );
  }

  const gradientStyle = {
    background: 'linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-primary) 100%)',
  };

  // Um fundo que não se pinta deixa o texto branco do herói sobre o fundo claro da página:
  // ilegível, e sem nada que o denuncie. Em vez de listar os casos que correm bem — eram
  // três blocos iguais a repetir o mesmo gradiente —, pergunta-se o contrário: pintou-se
  // alguma coisa? O modo `image` com o endereço vazio não caía em ramo nenhum e dava
  // exactamente esse ecrã partido. Assim, qualquer modo que se acrescente amanhã e se
  // esqueça de pintar cai aqui em segurança.
  const pintouFundo = (mode === 'video' && Boolean(settings.shop_bg_video_url))
    || (mode === 'slides' && slides.length > 0 && Boolean(slide));

  return (
    <section
      className="text-white pt-16 pb-6 sm:pt-20 sm:pb-14 md:py-20 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {!pintouFundo && (
        <>
          <div className="absolute inset-0" style={gradientStyle} />
          <ShopHeroMotion />
        </>
      )}

      {mode === 'video' && playableVideoUrl(settings.shop_bg_video_url) && (
        <>
          <video src={playableVideoUrl(settings.shop_bg_video_url)} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline poster={settings.shop_bg_image_url || undefined} />
          <div className="absolute inset-0" style={{ background: `rgba(12, 74, 110, ${overlay})` }} />
        </>
      )}

      {mode === 'slides' && slides.length > 0 && slide && (
        <AnimatePresence mode="wait">
          <motion.div key={slide.id} className="absolute inset-0" {...(transition?.bg || {})}>
            <ShopSlideMedia slide={slide} />
            <div className="absolute inset-0" style={{ background: `rgba(12, 74, 110, ${overlay})` }} />
          </motion.div>
        </AnimatePresence>
      )}



      <div className="container-custom relative z-10">{children}</div>

      {mode === 'slides' && slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 hidden sm:flex gap-1.5">
          {slides.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      )}
    </section>
  );
}
