import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { noticeLinkKind, noticeTone } from '@/lib/siteNotices';

/**
 * Faixa de aviso no topo da página, por cima do cabeçalho (painel → Sistema → Faixa de aviso).
 *
 * Fica no fluxo da página e não presa ao ecrã: empurra o conteúdo para baixo em vez de tapar
 * o título, e sai de cena ao descer, como o resto do topo. A altura fica em `--notice-offset`
 * para a barra fina do cabeçalho (a que aparece sobre a imagem de entrada) se pôr logo abaixo.
 * `preview` é a versão do painel: sem medir nem publicar nada.
 */
export default function SiteNoticeBar({ notice, onDismiss, preview = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (preview) return undefined;
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.removeProperty('--notice-offset');
      return undefined;
    }
    const publish = () => root.style.setProperty('--notice-offset', `${Math.round(el.offsetHeight)}px`);
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--notice-offset');
    };
  }, [notice, preview]);

  if (!notice) return null;
  const tone = noticeTone(notice.tone);
  const kind = noticeLinkKind(notice.link_url);
  const label = String(notice.link_label || '').trim() || 'Saber mais';
  const linkClass = 'whitespace-nowrap font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-current rounded-sm';
  const canClose = notice.dismissible !== false && typeof onDismiss === 'function';

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Aviso da loja"
      className={cn(!preview && 'safe-top', 'relative z-30 text-[13px] sm:text-sm', tone.className)}
    >
      <div className={cn('container-custom relative flex min-h-10 items-center justify-center py-1.5 sm:py-2', canClose ? 'pr-10 pl-10' : 'px-4')}>
        {/* max-w-none: os parágrafos do site têm max-w-prose, que partia a frase a meio do ecrã. */}
        <p className="max-w-none text-center leading-snug">
          <span>{notice.message}</span>
          {kind === 'internal' && (
            <>{' '}<Link to={notice.link_url} className={linkClass}>{label}</Link></>
          )}
          {kind === 'external' && (
            <>{' '}<a href={notice.link_url} target="_blank" rel="noopener noreferrer" className={linkClass}>{label}<span className="sr-only"> (abre noutro separador)</span></a></>
          )}
        </p>
        {canClose && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar aviso"
            className="tap-target absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-80 transition-opacity hover:opacity-100 hover:bg-black/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-current"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
