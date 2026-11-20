// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import PostComposer from '@/components/community/PostComposer';

/**
 * Escrever no telemóvel: o compositor numa folha que sobe do fundo (como a das categorias),
 * em vez de abrir no meio do feed e empurrar as publicações. O botão "Publicar" fica preso ao
 * fundo da folha, por cima do teclado, e o rascunho fica guardado se a folha fechar.
 */
export default function ComposerSheet({ open, onOpenChange, ...composer }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="flex max-h-[92dvh] flex-col bg-editorial-papel">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-xl text-editorial-tinta">Nova publicação</DrawerTitle>
          <DrawerDescription>Cite uma passagem, faça uma pergunta ou recomende uma leitura.</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          {open && (
            <PostComposer
              {...composer}
              stickyActions
              onCancel={() => onOpenChange(false)}
              onSent={() => onOpenChange(false)}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
