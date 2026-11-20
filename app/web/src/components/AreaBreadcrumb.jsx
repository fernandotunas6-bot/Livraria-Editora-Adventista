// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

/**
 * Onde se está, nas áreas da pessoa (a conta, a área do colportor): Início › A minha conta ›
 * Encomendas. `items`: [{ label, to? }] — o último é a página aberta. O mesmo papel do caminho
 * no topo do painel (Grupo › Secção › Vista).
 */
export default function AreaBreadcrumb({ items, className }) {
  const list = [{ label: 'Início', to: '/' }, ...items.filter(Boolean)];
  return (
    <Breadcrumb className={cn('mb-4', className)}>
      <BreadcrumbList>
        {list.map((item, i) => {
          const last = i === list.length - 1;
          return (
            <React.Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem>
                {last || !item.to ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild><Link to={item.to}>{item.label}</Link></BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
