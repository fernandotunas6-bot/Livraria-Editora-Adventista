// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Uma secção do painel que se pode expandir para o ecrã inteiro, para ver e gerir as listas com mais espaço (pedido do
 * dono, 26/11): «Expandir», por cima da secção, e «Voltar» ou Esc para sair. É a mesma secção, com os filtros e os
 * botões a funcionar. Fica na camada 45: por cima do cabeçalho do painel (40) e por baixo das janelas (50), para uma
 * janela aberta a partir da lista expandida aparecer à frente dela.
 */
export default function SeccaoExpansivel({ children }) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!aberta) return undefined;
    const tecla = (e) => {
      // uma janela aberta (Radix) fecha-se primeiro com o seu próprio Esc
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][data-state="open"]')) setAberta(false);
    };
    window.addEventListener('keydown', tecla);
    const corpo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = corpo;
    };
  }, [aberta]);
  if (!aberta) {
    return (
      <div>
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setAberta(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Ver esta secção em ecrã inteiro"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Expandir
          </button>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[45] overflow-auto bg-background p-3 sm:p-6" role="region" aria-label="Secção expandida">
      <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex justify-end bg-background/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <button
          type="button"
          onClick={() => setAberta(false)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Minimize2 className="h-4 w-4" /> Voltar <kbd className="ml-1 rounded border px-1 text-[10px]">Esc</kbd>
        </button>
      </div>
      {children}
    </div>
  );
}
