// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect } from 'react';
import { m as motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Painel de filtros do telemóvel (loja e categorias), o mesmo nas duas páginas.
 *
 * O "Ver N livros" ficava no fim da lista de filtros: depois de escolher uma colecção lá em
 * cima, era preciso descer tudo para ver os resultados. Agora fica preso ao fundo do painel
 * (por cima da área segura do iPhone), ao lado de "Limpar", como nas lojas grandes — o número
 * actualiza-se a cada escolha e diz logo quantos livros sobram.
 *
 * Tocar fora ou Escape fecha; a página de trás fica quieta enquanto está aberto.
 */
export default function MobileFilterDrawer({ open, onClose, titleId, count = 0, filterCount = 0, onClear, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs lg:hidden" onClick={onClose}>
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        className="fixed inset-y-0 left-0 flex w-full max-w-sm flex-col border-r border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="flex items-center justify-between border-b border-border px-6 pb-3"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <h2 id={titleId} className="text-xl font-semibold">Filtros</h2>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onClose} aria-label="Fechar os filtros">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {children}
        </div>
        <div
          className="flex gap-2 border-t border-border bg-background px-6 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {filterCount > 0 && onClear && (
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClear}>
              Limpar ({filterCount})
            </Button>
          )}
          <Button type="button" className="btn-primary h-12 flex-2" onClick={onClose} aria-live="polite">
            {count === 0 ? 'Sem livros com estes filtros' : `Ver ${count} ${count === 1 ? 'livro' : 'livros'}`}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
