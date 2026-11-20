// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { parseYoutube } from '@/lib/youtube';

/**
 * Vídeo de apresentação de um produto (YouTube).
 *
 * Mostra a miniatura com um botão de "play"; a moldura do YouTube só entra na página quando
 * alguém carrega. A razão é o custo: uma moldura do YouTube são mais de 500 KB e vários
 * pedidos a servidores da Google, e quem abre a ficha de um livro quase nunca vem pelo
 * vídeo — com ligações móveis a pagar por MB, carregá-la a todos é gastar dinheiro do
 * visitante. O domínio é o `youtube-nocookie.com`, que não escreve cookies de publicidade.
 *
 * Nada do que vem da base de dados chega ao `src`: o `parseYoutube` constrói o endereço a
 * partir do identificador que reconheceu, e devolve `null` a qualquer outra coisa — e aí o
 * componente não desenha nada, em vez de desenhar uma moldura para um sítio desconhecido.
 */
export default function ProductVideo({ url, title = 'Vídeo de apresentação', className = '' }) {
  const [a_tocar, setATocar] = useState(false);
  const video = parseYoutube(url);
  if (!video) return null;

  const legenda = `${title}: ver no YouTube`;

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted aspect-video">
        {a_tocar ? (
          <iframe
            title={title}
            src={video.autoplayUrl}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => setATocar(true)}
            className="group absolute inset-0 h-full w-full cursor-pointer"
            aria-label={`Ver o vídeo: ${title}`}
          >
            <img
              src={video.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Escurecimento por cima da miniatura: o botão branco tem de se ler sobre
                qualquer capa de vídeo, clara ou escura. */}
            <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40" aria-hidden="true" />
            <span
              className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-110 motion-reduce:transition-none"
              aria-hidden="true"
            >
              <Play className="ml-0.5 h-7 w-7 fill-current text-brand-ink" />
            </span>
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        O vídeo está no YouTube e só é carregado quando o abre.{' '}
        <a
          href={video.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {legenda} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
