import React, { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Feather } from 'lucide-react';
import { engagePath } from '@/lib/readerLevels';

/**
 * No lugar da caixa de publicar, para quem ainda não é Leitor: criar publicações é para a
 * Comunidade de Leitores. Responder e gostar continuam abertos (nas publicações).
 */
const ReaderGate = forwardRef(function ReaderGate({ status }, ref) {
  const engage = engagePath(status);
  return (
    <div ref={ref} tabIndex={-1} className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4 outline-hidden sm:p-5">
      <p className="flex items-center gap-2 font-semibold text-editorial-tinta">
        <Feather className="h-4 w-4 text-editorial-ouro" aria-hidden="true" /> Publicar é para a Comunidade de Leitores
      </p>
      <p className="mt-1 text-sm text-editorial-tinta-suave">
        Entra ao comprar o seu primeiro livro. Até lá, pode ler, gostar e responder às publicações.
      </p>
      {engage?.enabled && <p className="mt-1 text-sm text-editorial-tinta-suave">{engage.text}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/shop" className="inline-flex items-center gap-1.5 rounded-full bg-editorial-petroleo px-3.5 py-1.5 text-sm font-medium text-white hover:bg-editorial-petroleo/90">
          <BookOpen className="h-4 w-4" aria-hidden="true" /> Ver livros
        </Link>
        <Link to="/profile" className="inline-flex items-center rounded-full border border-editorial-filete px-3.5 py-1.5 text-sm font-medium text-editorial-tinta hover:bg-editorial-tela">
          O meu nível
        </Link>
      </div>
    </div>
  );
});

export default ReaderGate;
