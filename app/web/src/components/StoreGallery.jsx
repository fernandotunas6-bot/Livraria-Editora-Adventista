import React, { useEffect, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { lojaSrcSet } from '@/lib/stores';

/**
 * As fotografias de uma loja: uma tira de miniaturas que abre a fotografia em grande.
 *
 * As lojas são o sítio onde se vai levantar a encomenda, e até aqui a página mostrava delas
 * apenas um mapa e uma morada — quem nunca lá foi não fazia ideia do que ia encontrar. As
 * fotografias vêm das próprias lojas (ver `scripts/imagens/lojas.py`).
 */
export default function StoreGallery({ photos, storeName, className = '' }) {
  const [aberta, setAberta] = useState(null);

  // Mudar de loja fecha a fotografia que estava aberta: senão ficava a da loja anterior.
  useEffect(() => { setAberta(null); }, [photos]);

  if (!photos?.length) return null;

  const total = photos.length;
  const actual = aberta == null ? null : photos[aberta];
  const andar = (passo) => setAberta((i) => (i == null ? null : (i + passo + total) % total));

  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Camera className="h-3.5 w-3.5" aria-hidden /> Fotografias da loja
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`Fotografias da ${storeName}`}>
        {photos.map((foto, i) => (
          <li key={foto.url}>
            <button
              type="button"
              onClick={() => setAberta(i)}
              className="group block w-full overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={foto.caption ? `Ver em grande: ${foto.caption}` : `Ver fotografia ${i + 1} de ${total}`}
            >
              <img
                src={foto.url}
                srcSet={lojaSrcSet(foto.url) || undefined}
                sizes="(min-width: 640px) 160px, 45vw"
                alt={foto.caption || `${storeName} — fotografia ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="aspect-4/3 w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={aberta != null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-3xl p-2 sm:p-3">
          <DialogTitle className="sr-only">{`${storeName} — fotografia ${(aberta ?? 0) + 1} de ${total}`}</DialogTitle>
          <DialogDescription className="sr-only">{actual?.caption || 'Fotografia da loja'}</DialogDescription>
          {actual && (
            <figure className="m-0">
              <img
                src={actual.url}
                alt={actual.caption || `${storeName} — fotografia ${(aberta ?? 0) + 1}`}
                className="max-h-[75vh] w-full rounded-lg object-contain"
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
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
