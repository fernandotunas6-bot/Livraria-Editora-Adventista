// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GALERIA_MOSAICO, lojaSrcSet, mosaicoDaGaleria } from '@/lib/stores';

/**
 * As fotografias de uma loja, no quadro da loja escolhida.
 *
 * As lojas são o sítio onde se vai levantar a encomenda, e a página mostrava delas apenas um
 * mapa e uma morada — quem nunca lá foi não fazia ideia do que ia encontrar. As fotografias vêm
 * das próprias lojas (`scripts/imagens/lojas.py` ou o painel).
 *
 * O arranjo é um mosaico e não uma fila de quadrados iguais: a primeira fotografia (a que a
 * loja pôs à frente, normalmente a fachada ou a montra) fica grande e as outras acompanham-na
 * em pequeno. Com quatro fotografias uma fila igual já se lia como uma tabela; com dez era uma
 * parede. Por isso mostram-se no máximo nove, e a última conta as que faltam — quem carrega
 * nela abre a galeria nessa fotografia e anda daí para a frente.
 */

export default function StoreGallery({ photos, storeName, className = '' }) {
  const [aberta, setAberta] = useState(null);
  // Onde o dedo pousou, para saber se o arrasto foi para o lado (ver `comecarArrasto`).
  const arrasto = useRef(null);
  const tiraRef = useRef(null);
  const tiraActiva = useRef(null);

  // Mudar de loja fecha a fotografia que estava aberta: senão ficava a da loja anterior.
  useEffect(() => { setAberta(null); }, [photos]);

  // A miniatura da fotografia aberta vem para o meio da tira: com uma dúzia delas, a tira corre
  // para o lado e a que está a ser vista ficava fora do ecrã. Conta-se pela posição estática
  // (`offsetLeft`), e não com `scrollIntoView`, que ao abrir o diálogo não pegava — a animação
  // de entrada ainda vai a meio e o que se pediu perde-se.
  // Espera-se por dois desenhos: ao abrir, o diálogo põe o foco onde entende e isso arrasta a
  // tira de volta ao princípio — fazê-lo antes dele era trabalho perdido.
  useEffect(() => {
    const frames = [];
    const centrar = () => {
      const tira = tiraRef.current;
      const activa = tiraActiva.current;
      if (!tira || !activa) return;
      tira.scrollLeft = (activa.offsetLeft - tira.offsetLeft) - (tira.clientWidth - activa.offsetWidth) / 2;
    };
    frames.push(requestAnimationFrame(() => frames.push(requestAnimationFrame(centrar))));
    return () => frames.forEach(cancelAnimationFrame);
  }, [aberta]);

  const total = photos?.length || 0;
  const mostradas = useMemo(() => (photos || []).slice(0, GALERIA_MOSAICO), [photos]);
  const grelha = useMemo(() => mosaicoDaGaleria(total), [total]);
  const escondidas = total - GALERIA_MOSAICO;

  if (!total) return null;

  const actual = aberta == null ? null : photos[aberta];
  const andar = (passo) => setAberta((i) => (i == null ? null : (i + passo + total) % total));

  // Arrastar o dedo para o lado: a partir de 48 px conta como passar à fotografia seguinte ou à
  // anterior. O rato fica de fora — aí há setas, teclado e a tira de miniaturas, e um arrasto
  // por cima da imagem não quer dizer nada.
  const comecarArrasto = (e) => {
    arrasto.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
  };
  const acabarArrasto = (e) => {
    const inicio = arrasto.current;
    arrasto.current = null;
    if (!inicio) return;
    const dx = e.clientX - inicio.x;
    // Só conta o que é mesmo horizontal: a subir ou a descer, quem manda é a página.
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(e.clientY - inicio.y)) andar(dx < 0 ? 1 : -1);
  };

  return (
    <div className={className}>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Camera className="h-3.5 w-3.5" aria-hidden /> Fotografias da loja
        <span className="ml-auto font-semibold normal-case tracking-normal text-muted-foreground/80">
          {total === 1 ? '1 fotografia' : `${total} fotografias`}
        </span>
      </p>

      {/* As linhas têm altura fixa para o mosaico encaixar: a fotografia grande ocupa duas. */}
      <ul
        className="grid auto-rows-[68px] grid-cols-4 gap-2 sm:auto-rows-[92px] sm:gap-2.5"
        aria-label={`Fotografias da ${storeName}`}
      >
        {mostradas.map((foto, i) => {
          const grande = grelha[i]?.includes('col-span-2') || grelha[i]?.includes('col-span-4');
          const ultima = escondidas > 0 && i === GALERIA_MOSAICO - 1;
          return (
            <li key={`${foto.url}-${i}`} className={grelha[i]}>
              <button
                type="button"
                onClick={() => setAberta(i)}
                className="group relative block h-full w-full overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={ultima
                  ? `Ver as restantes ${escondidas + 1} fotografias`
                  : (foto.caption ? `Ver em grande: ${foto.caption}` : `Ver fotografia ${i + 1} de ${total}`)}
              >
                <img
                  src={foto.url}
                  srcSet={lojaSrcSet(foto.url) || undefined}
                  sizes={grande ? '(min-width: 640px) 320px, 50vw' : '(min-width: 640px) 160px, 25vw'}
                  alt={foto.caption || `${storeName} — fotografia ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                />
                {/* A legenda da fotografia grande aparece sobre ela, num véu que nasce do fundo:
                    o mosaico fica com uma linha de texto, e não com quatro. */}
                {grande && foto.caption && !ultima && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-black/75 via-black/35 to-transparent px-3 pb-2 pt-6 text-left text-xs font-medium leading-snug text-white sm:block">
                    {foto.caption}
                  </span>
                )}
                {ultima && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-white backdrop-blur-[1px] transition-colors group-hover:bg-black/65">
                    <Images className="h-4 w-4" aria-hidden />
                    <span className="text-sm font-bold leading-none">+{escondidas + 1}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog open={aberta != null} onOpenChange={(o) => !o && setAberta(null)}>
        {/* As setas do teclado andam na galeria, como em qualquer visualizador de fotografias;
            o Escape fecha-a (do próprio diálogo). */}
        <DialogContent
          className="max-w-3xl p-2 sm:p-3"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); andar(1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); andar(-1); }
          }}
        >
          <DialogTitle className="sr-only">{`${storeName} — fotografia ${(aberta ?? 0) + 1} de ${total}`}</DialogTitle>
          <DialogDescription className="sr-only">{actual?.caption || 'Fotografia da loja'}</DialogDescription>
          {actual && (
            // `min-w-0`: sem isto a tira de miniaturas (que corre para o lado) alargava a
            // figura para lá do diálogo, e o contador e as setas saíam pela borda fora.
            <figure className="m-0 min-w-0">
              {/* No telemóvel a galeria percorre-se com o dedo, como em qualquer aplicação de
                  fotografias; as setas ficam para o rato e para o teclado. */}
              <img
                src={actual.url}
                alt={actual.caption || `${storeName} — fotografia ${(aberta ?? 0) + 1}`}
                className="max-h-[75vh] w-full touch-pan-y rounded-lg object-contain select-none"
                draggable={false}
                onPointerDown={comecarArrasto}
                onPointerUp={acabarArrasto}
                onPointerCancel={() => { arrasto.current = null; }}
              />
              <figcaption className="flex items-center justify-between gap-3 px-1 pt-2 text-sm text-muted-foreground">
                <span className="min-w-0">{actual.caption}</span>
                {total > 1 && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => andar(-1)} aria-label="Fotografia anterior" className="rounded-full p-1.5 hover:bg-muted">
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="tabular-nums text-xs">{(aberta ?? 0) + 1}/{total}</span>
                    <button type="button" onClick={() => andar(1)} aria-label="Fotografia seguinte" className="rounded-full p-1.5 hover:bg-muted">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                )}
              </figcaption>

              {/* A tira de miniaturas: com uma dúzia de fotografias, andar de seta em seta até
                  à que interessa era o único caminho. Daqui salta-se logo para ela, e vê-se
                  onde se está no meio das outras. */}
              {total > 2 && (
                <ul ref={tiraRef} className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Todas as fotografias">
                  {photos.map((foto, i) => (
                    <li key={`tira-${foto.url}-${i}`}>
                      <button
                        type="button"
                        ref={i === aberta ? tiraActiva : undefined}
                        onClick={() => setAberta(i)}
                        aria-label={foto.caption || `Fotografia ${i + 1} de ${total}`}
                        aria-current={i === aberta ? 'true' : undefined}
                        className={`block h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${
                          i === aberta ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      >
                        <img
                          src={foto.url}
                          srcSet={lojaSrcSet(foto.url) || undefined}
                          sizes="64px"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
