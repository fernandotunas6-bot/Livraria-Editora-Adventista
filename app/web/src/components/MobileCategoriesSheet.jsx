import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { getProducts } from '@/api/EcommerceApi';
import { buildShowcaseCategories, categoryShopLink } from '@/lib/catalogCategories';
import { cn } from '@/lib/utils';

// Carregada à parte (React.lazy na MobileBottomNav), só quando alguém toca em "Categorias":
// a folha e o que ela usa pesavam ~19 KB gzip na página inicial de todos os visitantes.
/** Folha de categorias: só as que têm livros de facto (as mesmas regras da vitrine). */
export default function MobileCategoriesSheet({ open, onOpenChange }) {
  const [categories, setCategories] = useState(null);

  useEffect(() => {
    if (!open || categories) return;
    let active = true;
    getProducts({})
      .then(({ products }) => { if (active) setCategories(buildShowcaseCategories(products || [])); })
      .catch(() => { if (active) setCategories([]); });
    return () => { active = false; };
  }, [open, categories]);

  const linha = 'flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm hover:bg-muted transition-colors';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Explorar a livraria</DrawerTitle>
          <DrawerDescription>Escolha uma categoria ou veja todos os livros.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Link to="/shop" className={cn(linha, 'font-semibold')}>
            Todos os livros <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>
          {!categories ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A carregar categorias…
            </p>
          ) : categories.map((cat) => (
            <Link key={cat.id} to={categoryShopLink(cat)} className={linha}>
              <span className="min-w-0">
                <span className="block font-medium">{cat.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{cat.books.length} {cat.books.length === 1 ? 'livro' : 'livros'} · {cat.description}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
          <Link to="/colecoes" className={linha}>
            Coleções <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>
          <div className="mt-3 border-t pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mais na livraria</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                ['/comunidade', 'Comunidade'], ['/materiais', 'Materiais para descarregar'],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">{label}</Link>
              ))}
            </div>
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajuda e informações</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                ['/track', 'Seguir encomenda'], ['/lojas', 'Lojas'], ['/shipping-returns', 'Envios e devoluções'],
                ['/faq', 'Perguntas frequentes'], ['/contact', 'Contactos'], ['/about', 'Sobre nós'],
                ['/privacidade', 'Privacidade'],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{label}</Link>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
