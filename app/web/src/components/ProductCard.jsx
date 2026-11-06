import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Loader2, Eye, MessageCircle, Heart, Star, AlertTriangle, Check, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { useWishlist } from '@/hooks/useWishlist';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { shareBookOnWhatsApp } from '@/lib/whatsapp';
import QuickViewModal from '@/components/QuickViewModal';
import { MOTION } from '@/lib/motion';
import { PRODUCT_GRID_CLASS, discountPercent } from '@/lib/productGrid';

const PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K";

function ProductCard({ product, onCartOpen, index = 0, viewMode = 'grid', onQuickView }) {
  const { addToCart } = useCart();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const [adding, setAdding] = useState(false);
  // Confirmação no próprio botão, logo onde o dedo esteve. O aviso que sobe do fundo do
  // ecrã diz a mesma coisa, mas longe do sítio onde se carregou — e em telemóvel pode ficar
  // tapado pelo teclado ou pela barra do sistema.
  const [added, setAdded] = useState(false);
  const { isInWishlist, toggleWishlist } = useWishlist();
  const isWish = isInWishlist(product.id);

  const variant = product.variants?.[0];
  const inStock = product.purchasable && (variant?.inventory_quantity ?? 0) > 0;
  const qty = variant?.inventory_quantity ?? 0;
  // A marca vem da base de dados, com o limite definido em Configurações → Regras da loja.
  const isLowStock = inStock && !!product.stock_low;
  const price = variant?.sale_price_formatted || variant?.price_formatted;
  const originalPrice = variant?.sale_price_formatted ? variant?.price_formatted : null;
  const waPhone = settings.whatsapp || settings.contact_phone;

  const handleAddToCart = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!variant || !inStock) return;
    setAdding(true);
    try {
      await addToCart(product, variant, 1, variant.inventory_quantity, { silent: true });
      toast({
        variant: 'cart-success',
        product,
        onCartOpen
      });
      // O carrinho já não abre a cada livro: interrompia quem quer juntar vários. O aviso tem "Ver".
      setAdded(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Stock insuficiente', description: err.message });
    } finally {
      setAdding(false);
    }
  };

  // Volta ao normal sozinho. O temporizador é limpo se o cartão sair do ecrã antes disso —
  // sem a limpeza, o React avisa que se tentou mexer num componente já desmontado.
  useEffect(() => {
    if (!added) return undefined;
    const t = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(t);
  }, [added]);

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (waPhone) shareBookOnWhatsApp(product, waPhone);
  };

  const handleQuickView = (e) => {
    if (onQuickView) {
      e.preventDefault();
      e.stopPropagation();
      onQuickView(product);
    }
  };

  const isList = viewMode === 'list';

  const cardActions = (
    // Os botões medem 32px mas a .tap-target estende-os a 44 num ecrã de toque. Com os
    // 4px de intervalo que tinham, essas áreas invisíveis entravam 8px umas nas outras e
    // um toque entre dois ícones calhava ao vizinho. 12px põem o passo exactamente nos
    // 44 — encostadas, nunca sobrepostas. A partir de sm os botões já medem 40 e os 4px
    // originais chegam para o mesmo passo.
    <div className={`flex items-center gap-3 sm:gap-1 ${isList ? 'justify-start' : 'justify-center px-2 pt-3'}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            className="tap-target h-8 w-8 rounded-full border bg-background shadow-sm hover:bg-muted control-press sm:h-10 sm:w-10"
            aria-label={isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
          >
            <Heart className={`mx-auto h-4 w-4 transition-colors ${isWish ? 'text-red-500 fill-red-500' : 'text-muted-foreground hover:text-red-500'}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleQuickView}
            className="tap-target h-8 w-8 rounded-full border bg-background shadow-sm hover:bg-muted control-press sm:h-10 sm:w-10"
            aria-label="Visualizar"
          >
            <Eye className="mx-auto h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Visualização Rápida</TooltipContent>
      </Tooltip>
      {waPhone && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleShare}
              className="tap-target h-8 w-8 rounded-full bg-green-700 text-white shadow-sm hover:bg-green-800 control-press sm:h-10 sm:w-10"
              aria-label="Partilhar no WhatsApp"
            >
              <MessageCircle className="mx-auto h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Partilhar no WhatsApp</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  // Modo lista: o cartão de sempre, sem mudanças. Só é construído quando é lista: antes era
  // montado em todos os cartões da grelha e deitado fora.
  if (isList) return (
    <div className={`group h-full flex ${isList ? 'flex-row gap-4' : 'flex-col'}`}>
      <div className={`bg-card rounded-xl overflow-hidden surface-raise border border-border h-full flex flex-1 ${isList ? 'flex-row' : 'flex-col'}`}>
          <div className={`relative overflow-hidden bg-muted shrink-0 ${isList ? 'w-28 h-36' : 'aspect-[2/3] sm:aspect-[3/4]'}`}>
            <Link to={`/product/${product.id}`} onClick={handleQuickView} className="block h-full">
            <img
              src={product.image || PLACEHOLDER}
              alt={product.title}
              className="media-zoom w-full h-full object-cover"
              /* As primeiras da grelha carregam já — uma delas é o maior elemento visível e
                 define o LCP, e adiá-la seria atrasar justamente o que se quer medir. As
                 restantes esperam por chegar perto do ecrã: eram 24 capas a disputar a rede
                 ao mesmo tempo, e a maioria fica abaixo da dobra. */
              loading={index < 6 ? 'eager' : 'lazy'}
              decoding="async"
              onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER; }}
            />
            </Link>
            {/* Ícones, não autocolantes de texto: o mesmo cartão chegava a dizer o stock
                quatro vezes (marca na imagem, faixa do admin, etiqueta do preço e "últimas N").
                Fica uma marca por estado aqui, e o número aparece uma única vez, junto ao
                preço. A faixa do admin só aparece quando não há aviso de stock, para não
                empilhar três marcas no canto. */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
              {product.featured && (
                <span
                  className="h-6 w-6 rounded-full bg-amber-400 text-amber-950 shadow-sm flex items-center justify-center"
                  title="Destaque"
                >
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span className="sr-only">Destaque</span>
                </span>
              )}
              {isLowStock && (
                <span
                  className="h-6 w-6 rounded-full bg-rose-500 text-white shadow-sm flex items-center justify-center"
                  title={qty > 0 ? `Últimas ${qty} unidades` : 'Poucas unidades'}
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{qty > 0 ? `Últimas ${qty} unidades` : 'Poucas unidades'}</span>
                </span>
              )}
              {/* A faixa do admin só acrescenta quando não repete a estrela: muitos livros
                  têm ribbon_text "Destaque", e ficavam com a estrela e o rótulo a dizer o
                  mesmo. "Destaque da semana" ou outro texto continua a aparecer. */}
              {product.ribbon_text && inStock && !isLowStock
                && product.ribbon_text.trim().toLowerCase() !== 'destaque' && (
                <span className="bg-primary text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
                  {product.ribbon_text}
                </span>
              )}
            </div>
            {!inStock && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                <span className="bg-destructive text-white text-xs font-bold px-3 py-1 rounded-full">Esgotado</span>
              </div>
            )}
          </div>
          {!isList && cardActions}
          <div className={`p-4 flex flex-col flex-grow ${isList ? 'justify-center' : ''}`}>
            {isList && cardActions}
            <Link to={`/product/${product.id}`} onClick={handleQuickView} className="flex flex-col flex-grow">
              {product.book_code && <code className="text-[10px] text-brand-ink font-mono mb-1">{product.book_code}</code>}
              <h3 className="font-semibold text-foreground mb-0.5 line-clamp-2 group-hover:text-primary transition-colors">
                {product.title}
              </h3>
              {product.subtitle && (
                <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{product.subtitle}</p>
              )}
              {product.type?.value && (
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full w-fit mb-2">{product.type.value}</span>
              )}
              <div className="mt-auto pt-2 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-brand-ink font-bold">{price}</p>
                  {originalPrice && <p className="text-xs text-muted-foreground line-through">{originalPrice}</p>}
                </div>
                {inStock && isLowStock && qty > 0 && (
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">Restam {qty}</span>
                )}
              </div>
            </Link>
          </div>
      </div>
      {inStock && !isList && (
        // Num cartão de 160 px os dois botões lado a lado precisavam de 209 px e
        // transbordavam. Em ecrã estreito fica só "Comprar": tocar no cartão já abre o livro.
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className={`h-11 sm:h-8 flex-1 rounded-lg text-xs ${added ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-primary/30 hover:bg-primary/10'}`}
            onClick={handleAddToCart}
            disabled={adding}
          >
            {adding
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : added
                ? <Check className="h-4 w-4 mr-1" />
                : <ShoppingCart className="h-4 w-4 mr-1" />}
            {added ? 'No carrinho' : 'Comprar'}
          </Button>
          <Link to={`/product/${product.id}`} className="hidden sm:block flex-1">
            <Button size="sm" variant="secondary" className="h-11 sm:h-8 w-full rounded-lg text-xs hover:bg-primary/10 hover:text-primary">
              Ver Detalhes
            </Button>
          </Link>
        </div>
      )}
      {!inStock && !isList && (
        <div className="flex gap-2 mt-2 w-full">
          <Link to={`/product/${product.id}`} className="w-full">
            <Button size="sm" variant="outline" className="w-full rounded-lg text-xs border-primary/30 hover:bg-primary/10 hover:text-primary">
              Ver Detalhes
            </Button>
          </Link>
        </div>
      )}
    </div>
  );


  // Cartão da grelha, compacto como nas grandes lojas: capa inteira (2:3, a proporção das
  // capas), favoritos e partilha sobre a capa, título em duas linhas, preço em destaque e as
  // acções dentro do cartão. Tudo o que o cartão fazia continua: favoritos, visualização
  // rápida, partilha no WhatsApp, comprar, ver detalhes, destaque, stock baixo, esgotado e
  // promoção.
  const discount = discountPercent(variant);
  const iconButton = 'tap-target flex h-8 w-8 items-center justify-center rounded-full shadow-sm control-press';

  return (
    <div className="group h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card surface-raise transition-shadow duration-base hover:shadow-md">
        <div className="relative aspect-[2/3] shrink-0 overflow-hidden bg-muted">
          <Link to={`/product/${product.id}`} onClick={handleQuickView} className="block h-full" tabIndex={-1} aria-hidden="true">
            <img
              src={product.image || PLACEHOLDER}
              alt=""
              className="media-zoom h-full w-full object-cover"
              loading={index < 6 ? 'eager' : 'lazy'}
              decoding="async"
              onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER; }}
            />
          </Link>

          {/* right-12: as etiquetas quebram linha antes da coluna de favoritos/WhatsApp, em vez
              de passarem por baixo dela num cartão estreito. */}
          <div className="pointer-events-none absolute left-2 right-12 top-2 z-10 flex flex-wrap items-center gap-1.5">
            {product.featured && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm" title="Destaque">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span className="sr-only">Destaque</span>
              </span>
            )}
            {discount > 0 && inStock && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm tabular-nums">−{discount}%</span>
            )}
            {/* Com stock baixo, a etiqueta do admin (muitas vezes "Últimas unidades") repetia o
                "Restam N" por baixo do preço. */}
            {product.ribbon_text && inStock && !isLowStock && !discount
              && product.ribbon_text.trim().toLowerCase() !== 'destaque' && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                {product.ribbon_text}
              </span>
            )}
          </div>

          <div className="absolute right-2 top-2 z-20 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              className={`${iconButton} bg-background/90 backdrop-blur-sm hover:bg-background`}
              aria-label={isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
              title={isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
            >
              <Heart className={`h-4 w-4 transition-colors ${isWish ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
            </button>
            {waPhone && (
              <button
                type="button"
                onClick={handleShare}
                className={`${iconButton} bg-green-700 text-white hover:bg-green-800`}
                aria-label="Partilhar no WhatsApp"
                title="Partilhar no WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            )}
          </div>

          {!inStock && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50">
              <span className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-white">Esgotado</span>
            </div>
          )}

          {/* Visualização rápida: aparece ao passar o rato (e ao focar com o teclado). No
              telemóvel, tocar no cartão já a abre onde ela existe. */}
          <button
            type="button"
            onClick={handleQuickView}
            className="absolute inset-x-2 bottom-2 z-20 hidden items-center justify-center gap-1.5 rounded-lg bg-background/95 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-opacity duration-base hover:bg-background focus-visible:opacity-100 sm:flex sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Visualização rápida de ${product.title}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Visualização rápida
          </button>
        </div>

        {/* Ordem de qualquer livraria online: título, autor, preço, disponibilidade. Cada
            linha tem altura reservada (título em duas, autor numa, disponibilidade numa), para
            que os preços e os botões fiquem alinhados em toda a fila, com ou sem subtítulo.
            O código interno (LIV-…) fica na página do livro e na pesquisa. */}
        <Link to={`/product/${product.id}`} onClick={handleQuickView} className="flex flex-1 flex-col px-2.5 pt-2 sm:px-3 sm:pt-2.5">
          <h3 className="line-clamp-2 min-h-[2.75em] text-[13px] font-medium leading-snug text-foreground transition-colors [font-family:inherit] group-hover:text-primary sm:text-sm">
            {product.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 min-h-[1.4em] text-[11px] text-muted-foreground sm:text-xs">{product.subtitle || '\u00a0'}</p>
          <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1.5">
            <span className="text-[15px] font-bold text-brand-ink tabular-nums sm:text-base">{price}</span>
            {originalPrice && <span className="text-[11px] text-muted-foreground line-through tabular-nums">{originalPrice}</span>}
          </div>
          <p className={`text-[11px] font-medium ${!inStock ? 'text-muted-foreground' : isLowStock ? 'text-orange-700 dark:text-orange-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {!inStock ? 'Esgotado' : isLowStock && qty > 0 ? `Restam ${qty}` : 'Em stock'}
          </p>
        </Link>

        <div className="px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3">
          {inStock ? (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className={`h-10 flex-1 rounded-lg px-2 text-xs sm:h-8 ${added ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-primary/30 hover:bg-primary/10'}`}
                onClick={handleAddToCart}
                disabled={adding}
              >
                {adding
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : added
                    ? <Check className="mr-1 h-4 w-4" />
                    : <ShoppingCart className="mr-1 h-4 w-4" />}
                {added ? 'No carrinho' : 'Comprar'}
              </Button>
              {/* Página do livro: só o ícone, para caber ao lado de "Comprar" num cartão de
                  cinco colunas (com texto, "Detalhes" ficava cortado). Em ecrã estreito fica só
                  "Comprar": tocar no cartão já abre o livro. */}
              <Button asChild size="sm" variant="secondary" className="hidden h-8 w-8 shrink-0 rounded-lg p-0 hover:bg-primary/10 hover:text-primary sm:inline-flex">
                <Link to={`/product/${product.id}`} aria-label={`Ver detalhes de ${product.title}`} title="Ver detalhes">
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-10 w-full rounded-lg text-xs border-primary/30 hover:bg-primary/10 hover:text-primary sm:h-8">
              <Link to={`/product/${product.id}`}>Ver detalhes</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const gridContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    }
  }
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: MOTION.spring
  }
};

/**
 * `memo` porque a grelha tem 24 cartões e o pai volta a renderizar por muitas razões que
 * não lhes dizem respeito: abrir o painel de filtros, mudar de página, escrever na busca.
 * Sem isto, cada uma dessas acções refazia os 24 — era o que punha o INP em 272 ms, com o
 * tempo todo na apresentação e nenhum no código do handler.
 *
 * Para `memo` servir de alguma coisa, as funções passadas têm de ser estáveis: ver os
 * `useCallback` em `ShopPage`. Uma função criada no JSX do pai muda de identidade a cada
 * render e anula a comparação.
 */
const MemoProductCard = memo(ProductCard);
export default MemoProductCard;

export function ProductGrid({ products, isLoading, onCartOpen, viewMode = 'grid', onQuickView }) {
  const [quickView, setQuickView] = useState(null);
  const handleQuickView = onQuickView || setQuickView;

  if (isLoading) {
    return (
      <div className={viewMode === 'list' ? 'product-grid grid grid-cols-1 gap-6' : PRODUCT_GRID_CLASS}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl aspect-[2/3]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <motion.div
        variants={gridContainerVariants}
        initial="hidden"
        animate="show"
        className={viewMode === 'list' ? 'product-grid grid grid-cols-1 gap-6' : PRODUCT_GRID_CLASS}
      >
        {products.map((product, index) => (
          <motion.div key={product.id} variants={gridItemVariants}>
            <MemoProductCard product={product} onCartOpen={onCartOpen} index={index} viewMode={viewMode} onQuickView={handleQuickView} />
          </motion.div>
        ))}
      </motion.div>
      {!onQuickView && (
        <QuickViewModal product={quickView} open={!!quickView} onClose={() => setQuickView(null)} onCartOpen={onCartOpen} />
      )}
    </>
  );
}
