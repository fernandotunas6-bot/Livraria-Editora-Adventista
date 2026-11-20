// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Link } from 'react-router-dom';
import { isInternalLink, safeLinkUrl } from '@/lib/safeLink';

/**
 * Uma ligação cujo endereço vem da configuração do site (painel), e não do código.
 *
 * O site tem três sítios assim, todos escritos pelo painel e todos em páginas que toda a
 * gente vê: as colunas do rodapé, o botão da barra do topo (`header_cta_link`) e o botão de
 * cada slide da página inicial (`cta_link`). Os três mandavam o valor directo para `<Link>`
 * ou `<a href>`, e **nenhuma das duas bibliotecas o filtra**:
 *
 * - o React 18.3 rende um `href="javascript:…"` com um aviso na consola, e mais nada;
 * - o React Router 7 passa `javascript:`, `data:` e `//outro-site` intactos para o `href`
 *   (verificado com as versões deste projecto).
 *
 * O CSP (`script-src` sem `unsafe-inline`) trava a execução, por isso nada disto é
 * explorável hoje. Mas o CSP é uma tranca só, e a regra desta casa é ter duas — o
 * `sanitizeHtml` limita os esquemas, o `safeInternalPath` recusa `//host`, o `emails.ts` tem
 * o `safeUrl`. Este componente é a mesma ideia para os links da configuração.
 *
 * Além da segurança, arruma duas coisas que davam links partidos: um endereço externo que
 * ia para o `<Link>` do React Router como se fosse um caminho da aplicação, e um `http://`
 * numa página `https://` (conteúdo misto, que o navegador bloqueia). Interno ou externo
 * decide-se pelo próprio endereço, nunca por uma etiqueta ao lado dele.
 *
 * Um endereço recusado não vira link: fica o texto, para quem escreveu a configuração
 * perceber que ali está algo por corrigir em vez de ver um botão que não leva a lado nenhum.
 */
export default function SafeLink({ to, children, className = '', fallbackClassName = '', ...rest }) {
  const url = safeLinkUrl(to);
  if (!url) return <span className={fallbackClassName || className}>{children}</span>;

  if (isInternalLink(url)) {
    return <Link to={url} className={className} {...rest}>{children}</Link>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
      {children}
    </a>
  );
}
