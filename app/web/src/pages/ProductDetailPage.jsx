import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getProduct, getProductQuantities, trackBookView, formatCurrency } from '@/api/EcommerceApi';
import { discountPercent } from '@/lib/productGrid';

/** Caracteres do resumo ao lado do preço; o texto inteiro está em "Detalhes". */
const SUMMARY_CHARS = 320;
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { shareBookOnWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { 
  ShoppingCart as ShoppingCartIcon, Loader2, ChevronLeft, ChevronRight, CheckCircle, 
  XCircle, Minus, Plus, BookOpen, User, Layers, Eye, MessageCircle, Heart, Star, Sparkles, Trash2, ThumbsUp,
  Truck, Wallet, Store,
} from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useReviews } from '@/hooks/useReviews';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header.jsx';
import { pageTitle } from '@/lib/brand';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import BookPreviewModal from '@/components/BookPreviewModal';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import SampleReaderModal from '@/components/SampleReaderModal';
import RecentlyViewed from '@/components/RecentlyViewed.jsx';
import DiscoveryFeed from '@/components/DiscoveryFeed.jsx';
import StickyBuyBar from '@/components/StickyBuyBar.jsx';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { MOTION } from '@/lib/motion';

// Star rating helper component
const StarRating = ({ rating, size = 16, interactive = false, onChange }) => {
  const [hoverRating, setHoverRating] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = interactive
          ? (hoverRating || rating) >= star
          : rating >= star;
        return (
          <Star
            key={star}
            size={size}
            className={`transition-colors duration-fast ${
              isFilled ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
            } ${interactive ? 'cursor-pointer hover:scale-110' : ''}`}
            onClick={() => interactive && onChange && onChange(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
};

const placeholderImage = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K";

function ProductDetailPage() {
  const { id } = useParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [sampleReaderOpen, setSampleReaderOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [product, setProduct] = useState(null);
  // A barra de compra do fundo observa estes botões: só aparece quando eles saem do ecrã.
  // Em estado, e não num `ref`: o observador precisa de saber quando o elemento aparece, e
  // um `ref` não avisa ninguém de que foi preenchido.
  const [botoesCompra, setBotoesCompra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  // Separadores controlados: o resumo e as estrelas do topo abrem "Detalhes" e "Avaliações".
  const [tab, setTab] = useState('details');
  const tabsRef = useRef(null);
  const openTab = (value) => {
    setTab(value);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { addToCart } = useCart();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const isWish = product ? isInWishlist(product.id) : false;

  // Avaliações
  const { isAuthed, user } = useAuth();
  const { openAuth } = useAuthDialog();
  const { reviews, loading: loadingReviews, stats, hasPurchased, submitReview, deleteReview, userReview, submitting, helpfulVotesEnabled, votingReviewId, toggleHelpfulVote } = useReviews(product?.id);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [editingReview, setEditingReview] = useState(false);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    const success = await submitReview(reviewRating, reviewComment);
    if (success) {
      setReviewComment('');
      setReviewRating(5);
      setEditingReview(false);
    }
  };

  const handleAddToCart = useCallback(async (openCart = false) => {
    if (product && selectedVariant) {
      const availableQuantity = selectedVariant.inventory_quantity;
      try {
        await addToCart(product, selectedVariant, quantity, availableQuantity, { silent: true });
        toast({
          variant: 'cart-success',
          product,
          onCartOpen: () => setIsCartOpen(true)
        });
        if (openCart) setIsCartOpen(true);
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: error.message,
        });
      }
    }
  }, [product, selectedVariant, quantity, addToCart, toast]);

  const handleBuyNow = useCallback(async () => {
    await handleAddToCart(true);
  }, [handleAddToCart]);

  const handleQuantityChange = useCallback((amount) => {
    setQuantity(prevQuantity => {
      const newQuantity = prevQuantity + amount;
      if (newQuantity < 1) return 1;
      return newQuantity;
    });
  }, []);

  const handlePrevImage = useCallback(() => {
    if (product?.images?.length > 1) {
      setCurrentImageIndex(prev => prev === 0 ? product.images.length - 1 : prev - 1);
    }
  }, [product?.images?.length]);

  const handleNextImage = useCallback(() => {
    if (product?.images?.length > 1) {
      setCurrentImageIndex(prev => prev === product.images.length - 1 ? 0 : prev + 1);
    }
  }, [product?.images?.length]);

  const handleVariantSelect = useCallback((variant) => {
    setSelectedVariant(variant);
    if (variant.image_url && product?.images?.length > 0) {
      const imageIndex = product.images.findIndex(image => image.url === variant.image_url);
      if (imageIndex !== -1) {
        setCurrentImageIndex(imageIndex);
      }
    }
  }, [product?.images]);

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedProduct = await getProduct(id);
        trackBookView(fetchedProduct.id);

        try {
          const quantitiesResponse = await getProductQuantities({
            fields: 'inventory_quantity',
            product_ids: [fetchedProduct.id]
          });

          const variantQuantityMap = new Map();
          quantitiesResponse.variants.forEach(variant => {
            variantQuantityMap.set(variant.id, variant.inventory_quantity);
          });

          const productWithQuantities = {
            ...fetchedProduct,
            variants: fetchedProduct.variants.map(variant => ({
              ...variant,
              inventory_quantity: variantQuantityMap.get(variant.id) ?? variant.inventory_quantity
            }))
          };

          setProduct(productWithQuantities);
          // Fica no navegador de quem visita, para poder voltar a este livro depois de ver
          // outros. Nada vai para o servidor: é um atalho, não um registo de hábitos.
          addRecentlyViewed(productWithQuantities);

          if (productWithQuantities.variants && productWithQuantities.variants.length > 0) {
            setSelectedVariant(productWithQuantities.variants[0]);
          }

        } catch (quantityError) {
          throw quantityError;
        }
      } catch (err) {
        setError(err.message || 'Não foi possível carregar o livro');
      } finally {
        setLoading(false);
      }
    };

    fetchProductData();
  }, [id]);

  if (loading) {
    return (
      <>
        <Header pinned onCartOpen={() => setIsCartOpen(true)} />
        <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
        <div className="flex justify-center items-center h-[60vh]">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
        </div>
        <Footer />
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <Header pinned onCartOpen={() => setIsCartOpen(true)} />
        <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
        <div className="container-custom py-12">
          <div className="text-center text-destructive p-8 bg-card border border-border rounded-xl">
            <XCircle className="mx-auto h-16 w-16 mb-4" />
            <p className="mb-6">Erro ao carregar o livro: {error}</p>
            <Link to="/shop">
              <Button variant="outline">Voltar à Loja</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const price = selectedVariant?.sale_price_formatted ?? selectedVariant?.price_formatted;
  const originalPrice = selectedVariant?.price_formatted;
  const availableStock = selectedVariant ? selectedVariant.inventory_quantity : 0;
  const isStockManaged = selectedVariant?.manage_inventory ?? false;
  const canAddToCart = !isStockManaged || quantity <= availableStock;

  const currentImage = product.images[currentImageIndex];

  const genre = product.type?.value || product.category || '';
  const discount = discountPercent(selectedVariant);
  const availability = !product.purchasable
    ? { ok: false, label: 'Esgotado de momento', tone: 'text-destructive' }
    : isStockManaged && !canAddToCart
      ? { ok: false, label: `Só ${availableStock} disponíve${availableStock === 1 ? 'l' : 'is'}`, tone: 'text-destructive' }
      : isStockManaged && availableStock > 0 && product.stock_low
        ? { ok: true, label: `Restam ${availableStock} — pode esgotar em breve`, tone: 'text-orange-700 dark:text-orange-400' }
        : { ok: true, label: 'Em stock, pronto a enviar', tone: 'text-emerald-700 dark:text-emerald-400' };
  const freeShippingLabel = formatCurrency((Number(settings.shipping_free_threshold) || 20000) * 100);
  const plainDescription = (product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const summaryIsShort = plainDescription.length > SUMMARY_CHARS;
  const summary = summaryIsShort
    ? `${plainDescription.slice(0, plainDescription.lastIndexOf(' ', SUMMARY_CHARS))}…`
    : plainDescription;
  const specs = [
    ['Autor', product.subtitle],
    ['Editora', product.publisher],
    ['Idioma', product.language],
    ['Páginas', product.pages > 0 ? product.pages : null],
    ['Ano', product.year > 0 ? product.year : null],
    ['ISBN', product.isbn],
    ['Género', genre],
    ['Código', product.book_code],
  ].filter(([, v]) => v);
  const hasMultipleImages = product.images.length > 1;

  return (
    <>
      <Helmet>
        <title>{pageTitle(product.title)}</title>
        <meta name="description" content={(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 160) || product.title} />
      </Helmet>

      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="container-custom pb-12 pt-6 md:pt-8">
        {/* Caminho: no telemóvel só até ao género, o título já está logo abaixo em grande. */}
        <nav aria-label="Caminho" className="mb-5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:mb-8">
          <Link to="/" className="-my-1.5 shrink-0 py-1.5 hover:text-primary">Início</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          <Link to="/shop" className="-my-1.5 shrink-0 py-1.5 hover:text-primary">Loja</Link>
          {genre && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
              <Link to={`/shop?category=${encodeURIComponent(genre)}`} className="-my-1.5 truncate py-1.5 hover:text-primary">{genre}</Link>
            </>
          )}
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 opacity-60 md:block" aria-hidden="true" />
          <span className="hidden truncate text-foreground md:block" aria-current="page">{product.title}</span>
        </nav>

        {/* `min-w-0` nas duas colunas: um item de grid tem `min-width: auto` por omissão e
            recusa-se a encolher abaixo do conteúdo (dava deslocamento horizontal no telemóvel). */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <motion.div
            className="min-w-0 lg:sticky lg:top-24 lg:self-start"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: MOTION.base }}
          >
            {/* A capa inteira, na proporção dos livros (2:3): sem cortes nem moldura vazia. */}
            <div className="relative mx-auto mb-4 aspect-[2/3] w-full max-w-[15rem] overflow-hidden rounded-xl bg-muted shadow-lg sm:max-w-xs lg:max-w-sm">
              <img
                src={!currentImage?.url ? placeholderImage : currentImage.url}
                alt={`Capa de ${product.title}`}
                className="h-full w-full object-cover"
              />

              {hasMultipleImages && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground transition-colors hover:bg-background"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground transition-colors hover:bg-background"
                    aria-label="Imagem seguinte"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}

              {discount > 0 && product.purchasable && (
                <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-sm font-bold text-white shadow tabular-nums">−{discount}%</span>
              )}
              {!discount && product.ribbon_text && (
                <span className="absolute left-3 top-3 rounded-full bg-brand-solid px-3 py-1 text-xs font-bold shadow">
                  {product.ribbon_text}
                </span>
              )}
            </div>

            {hasMultipleImages && (
              <div className="mx-auto flex max-w-sm gap-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`Ver imagem ${index + 1}`}
                    className={`h-20 w-14 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                      index === currentImageIndex ? 'border-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <img src={!image.url ? placeholderImage : image.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: MOTION.base, delay: 0.1 }}
            className="flex min-w-0 flex-col"
          >
            {/* 1. O quê e de quem */}
            <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">{product.title}</h1>
            {product.subtitle && (
              <p className="mt-2 text-base text-muted-foreground md:text-lg">
                de{' '}
                <Link to={`/shop?author=${encodeURIComponent(product.subtitle)}`} className="font-medium text-primary hover:underline">
                  {product.subtitle}
                </Link>
              </p>
            )}
            {product.marketing_hook && (
              <p className="mt-2 font-medium text-primary">{product.marketing_hook}</p>
            )}
            <button
              type="button"
              onClick={() => openTab('reviews')}
              className="mt-3 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <StarRating rating={Math.round(stats.average)} size={16} />
              {stats.total > 0
                ? <span>{stats.average} · {stats.total} {stats.total === 1 ? 'avaliação' : 'avaliações'}</span>
                : <span>Seja o primeiro a avaliar</span>}
            </button>
            {product.social_proof && (
              <p className="mt-3 inline-block w-fit rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
                ✓ {product.social_proof}
              </p>
            )}

            {/* 2. Preço e disponibilidade, juntos */}
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-bold text-brand-ink tabular-nums md:text-4xl">{price}</span>
                {selectedVariant?.sale_price_in_cents && (
                  <span className="text-lg text-muted-foreground line-through tabular-nums">{originalPrice}</span>
                )}
                {discount > 0 && (
                  <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-sm font-semibold text-rose-700">Poupa {discount}%</span>
                )}
              </div>
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${availability.tone}`}>
                {availability.ok ? <CheckCircle size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
                {availability.label}
              </p>

              {product.variants.length > 1 && (
                <div className="mt-5">
                  <h2 className="mb-2 text-sm font-semibold text-foreground">Edição</h2>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map(variant => (
                      <Button
                        key={variant.id}
                        variant={selectedVariant?.id === variant.id ? 'default' : 'outline'}
                        onClick={() => handleVariantSelect(variant)}
                        className={`transition-all ${selectedVariant?.id === variant.id ? 'btn-primary' : 'border-border hover:border-primary'}`}
                      >
                        {variant.title}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Comprar */}
              <div ref={setBotoesCompra} className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-border">
                    <Button onClick={() => handleQuantityChange(-1)} variant="ghost" size="icon" className="h-11 w-11 rounded-l-lg hover:bg-muted" aria-label="Menos um">
                      <Minus size={18} />
                    </Button>
                    <span className="w-10 text-center font-semibold text-foreground tabular-nums" aria-live="polite">{quantity}</span>
                    <Button onClick={() => handleQuantityChange(1)} variant="ghost" size="icon" className="h-11 w-11 rounded-r-lg hover:bg-muted" aria-label="Mais um">
                      <Plus size={18} />
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleAddToCart(true)}
                    variant="outline"
                    className="h-11 min-w-0 flex-1 border-primary/50 px-3 text-primary hover:bg-primary/10"
                    disabled={!canAddToCart || !product.purchasable}
                  >
                    <ShoppingCartIcon className="mr-2 h-4 w-4 shrink-0" />
                    {/* Num ecrã de 375 px o texto inteiro empurrava o coração para fora. */}
                    <span className="truncate sm:hidden">Carrinho</span>
                    <span className="hidden truncate sm:inline">Adicionar ao carrinho</span>
                  </Button>
                  <Button
                    onClick={() => toggleWishlist(product)}
                    variant="outline"
                    size="icon"
                    className={`h-11 w-11 shrink-0 ${isWish ? 'border-red-500 text-red-500 hover:bg-red-50' : 'border-border hover:bg-muted'}`}
                    aria-label={isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    title={isWish ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                  >
                    <Heart className={`h-5 w-5 ${isWish ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                  </Button>
                </div>
                <Button
                  onClick={handleBuyNow}
                  size="lg"
                  className="btn-primary h-12 w-full text-base"
                  disabled={!canAddToCart || !product.purchasable}
                >
                  Comprar agora
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setShowPreview(true)} variant="ghost" size="sm" className="h-10 text-primary hover:bg-primary/10">
                  <BookOpen className="mr-1.5 h-4 w-4" /> Ler amostra grátis
                </Button>
                {(settings.whatsapp || settings.contact_phone) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 text-green-700 hover:bg-green-50"
                    onClick={() => shareBookOnWhatsApp(product, settings.whatsapp || settings.contact_phone)}
                  >
                    <MessageCircle className="mr-1.5 h-4 w-4" /> Pedir ou partilhar no WhatsApp
                  </Button>
                )}
              </div>

              {/* 4. O que acontece depois de comprar */}
              <ul className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
                <li className="flex items-start gap-2.5">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><strong className="font-medium text-foreground">Entrega em todo o país.</strong> <span className="text-muted-foreground">Grátis a partir de {freeShippingLabel}.</span></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><strong className="font-medium text-foreground">Pagamento na entrega</strong> <span className="text-muted-foreground">ou por transferência.</span></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><strong className="font-medium text-foreground">Levantamento nas lojas,</strong> <Link to="/lojas" className="text-primary hover:underline">ver moradas</Link>.</span>
                </li>
              </ul>
            </div>

            {/* 5. Resumo: o texto completo fica em "Detalhes", sem se repetir aqui. */}
            {summary && (
              <div className="mt-6">
                <h2 className="mb-2 text-base font-semibold text-foreground">Sobre o livro</h2>
                <p className="leading-relaxed text-muted-foreground">{summary}</p>
                {summaryIsShort && (
                  <button type="button" onClick={() => openTab('details')} className="mt-2 text-sm font-medium text-primary hover:underline">
                    Ler a descrição completa
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>

        <div ref={tabsRef} className="mt-14 scroll-mt-24 border-t border-border pt-10">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-8 flex-wrap h-auto gap-1">
              <TabsTrigger value="details"><BookOpen className="h-4 w-4 mr-1.5" />Detalhes</TabsTrigger>
              {product.preview_enabled && product.sample_pages?.length > 0 && (
                <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1.5" />Pré-visualização</TabsTrigger>
              )}
              {(product.author_bio || product.author_photo) && (
                <TabsTrigger value="author"><User className="h-4 w-4 mr-1.5" />Sobre o Autor</TabsTrigger>
              )}
              {product.variants?.length > 1 && (
                <TabsTrigger value="versions"><Layers className="h-4 w-4 mr-1.5" />Versões</TabsTrigger>
              )}
              <TabsTrigger value="reviews"><MessageCircle className="h-4 w-4 mr-1.5" />Avaliações ({stats.total})</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div className="min-w-0 space-y-8">
                  {product.description ? (
                    <div className="prose max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} />
                  ) : (
                    <p className="text-muted-foreground">Sem descrição disponível.</p>
                  )}

                  {Array.isArray(product.benefit_bullets) && product.benefit_bullets.length > 0 && (
                    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                      <p className="mb-3 font-semibold text-foreground">Porquê este livro?</p>
                      <ul className="space-y-2">
                        {product.benefit_bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {product.additional_info?.length > 0 && (
                    <div className="space-y-6">
                      {[...product.additional_info]
                        .sort((a, b) => a.order - b.order)
                        .map((info) => (
                          <div key={info.id} className="border-l-2 border-primary/30 pl-4">
                            <h3 className="mb-2 text-lg font-semibold text-foreground">{info.title}</h3>
                            <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(info.description) }} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Ficha técnica: o que se compara entre edições e se pede ao telefone. */}
                <aside className="min-w-0">
                  <h3 className="mb-3 text-base font-semibold text-foreground">Características</h3>
                  <dl className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                    {specs.map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {product.target_audience && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Ideal para:</span> {product.target_audience}
                    </p>
                  )}
                </aside>
              </div>
            </TabsContent>

            {product.preview_enabled && product.sample_pages?.length > 0 && (
              <TabsContent value="preview">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <p className="text-sm text-muted-foreground">Explore as primeiras páginas antes de comprar.</p>
                  <Button size="sm" className="bg-primary hover:bg-[#0ea5c9]/90 text-white" onClick={() => setSampleReaderOpen(true)}>
                    <BookOpen className="h-4 w-4 mr-1.5" /> Modo Leitura
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {product.sample_pages.map((page, i) => {
                    const url = typeof page === 'string' ? page : page.url;
                    return (
                      <div key={i} className="rounded-xl overflow-hidden border shadow-sm bg-muted/30">
                        <img src={url} alt={`Página ${i + 1}`} className="w-full h-auto object-contain" />
                        <p className="text-xs text-center py-2 text-muted-foreground">Página {i + 1}</p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}

            {(product.author_bio || product.author_photo) && (
              <TabsContent value="author">
                <div className="flex flex-col sm:flex-row gap-6 max-w-3xl">
                  {product.author_photo && (
                    <img src={product.author_photo} alt={product.subtitle} className="w-32 h-32 rounded-full object-cover ring-4 ring-[#0ea5c9]/20 shrink-0" />
                  )}
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{product.subtitle}</h3>
                    {product.author_bio ? (
                      <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.author_bio) }} />
                    ) : (
                      <p className="text-muted-foreground">Informação sobre o autor em breve.</p>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {product.variants?.length > 1 && (
              <TabsContent value="versions">
                <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
                  {product.variants.map((v) => (
                    <div
                      key={v.id}
                      role="button"
                      tabIndex={0}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedVariant?.id === v.id ? 'ring-2 ring-[#0ea5c9] border-[#0ea5c9]/40' : 'hover:border-[#0ea5c9]/30'}`}
                      onClick={() => handleVariantSelect(v)}
                      onKeyDown={(e) => e.key === 'Enter' && handleVariantSelect(v)}
                    >
                      <p className="font-semibold">{v.title}</p>
                      {v.format && <p className="text-sm text-muted-foreground">{v.format}</p>}
                      {v.isbn && <p className="text-xs font-mono text-muted-foreground mt-1">ISBN: {v.isbn}</p>}
                      <p className="text-primary font-bold mt-2">{v.sale_price_formatted || v.price_formatted}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.inventory_quantity} em stock</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            <TabsContent value="reviews" className="space-y-8 mt-6">
              <div className="grid md:grid-cols-12 gap-8">
                {/* Left side: stats and review submission form */}
                <div className="md:col-span-5 space-y-6">
                  <div className="bg-muted/10 border p-6 rounded-2xl">
                    <h4 className="font-bold text-lg mb-4">Resumo das Avaliações</h4>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="text-center">
                        <p className="text-4xl font-extrabold text-foreground">{stats.average}</p>
                        <p className="text-xs text-muted-foreground mt-1">de 5 estrelas</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <StarRating rating={Math.round(stats.average)} size={20} />
                        <p className="text-xs text-muted-foreground mt-1">{stats.total} {stats.total === 1 ? 'avaliação' : 'avaliações'}</p>
                      </div>
                    </div>

                    {/* Progress bars for rating distribution */}
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((starValue) => {
                        const count = stats.counts[starValue] || 0;
                        const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                        return (
                          <div key={starValue} className="flex items-center gap-3 text-xs">
                            <span className="w-3 font-medium">{starValue}</span>
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="w-8 text-right text-muted-foreground">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submission form or existing user review indicator */}
                  <div className="bg-card border p-6 rounded-2xl shadow-sm">
                    {userReview && !editingReview ? (
                      <div className="space-y-4">
                        <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" /> A sua avaliação
                        </h4>
                        <div className="p-4 bg-muted/20 border rounded-xl">
                          <div className="flex justify-between items-center mb-2">
                            <StarRating rating={userReview.rating} size={14} />
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setReviewRating(userReview.rating); setReviewComment(userReview.comment); setEditingReview(true); }}
                                className="h-7 px-2"
                              >
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { if (window.confirm('Eliminar a sua avaliação deste livro?')) deleteReview(); }}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm text-foreground break-words italic">"{userReview.comment}"</p>
                          {userReview.isVerified && (
                            <span className="inline-flex items-center gap-1 mt-3 text-[10px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded border border-green-100">
                              ★ Compra Verificada
                            </span>
                          )}
                        </div>
                      </div>
                    ) : isAuthed ? (
                      <form onSubmit={handleReviewSubmit} className="space-y-4">
                        <h4 className="font-bold text-base">{editingReview ? 'Editar a sua avaliação' : 'Deixe a sua avaliação'}</h4>
                        
                        {/* Verified Buyer status highlight */}
                        {hasPurchased ? (
                          <div className="bg-green-50 text-green-800 text-xs p-3 rounded-lg border border-green-200 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-green-600 shrink-0" />
                            <span>Vimos que comprou este livro! O seu comentário terá o selo <strong>Compra Verificada</strong>.</span>
                          </div>
                        ) : (
                          <div className="bg-amber-50/50 text-amber-800/80 text-[11px] p-2.5 rounded-lg border border-amber-100 leading-relaxed">
                            Apenas compradores verificados deste livro recebem o selo especial de verificação, mas todos os membros podem avaliar!
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-xs font-semibold block text-muted-foreground">Classificação</label>
                          <StarRating rating={reviewRating} size={28} interactive onChange={setReviewRating} />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold block text-muted-foreground" htmlFor="review-comment">O seu comentário</label>
                          <textarea
                            id="review-comment"
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder="Partilhe a sua opinião sobre este livro..."
                            rows={4}
                            maxLength={1000}
                            className="w-full text-sm p-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-[#0ea5c9] bg-background"
                            required
                          />
                        </div>

                        <Button type="submit" disabled={submitting} className="w-full btn-primary h-11 bg-primary text-white hover:bg-[#0ea5c9]/90">
                          {submitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              A enviar avaliação...
                            </>
                          ) : (
                            editingReview ? 'Guardar alterações' : 'Publicar Avaliação'
                          )}
                        </Button>
                        {editingReview && (
                          <Button type="button" variant="ghost" className="w-full" onClick={() => { setEditingReview(false); setReviewComment(''); setReviewRating(5); }}>
                            Cancelar
                          </Button>
                        )}
                      </form>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-4">Inicie sessão para deixar uma avaliação e partilhar a sua experiência.</p>
                        <Button type="button" variant="outline" className="w-full border-[#0ea5c9] text-primary hover:bg-[#0ea5c9]/10" onClick={() => openAuth({ reason: 'review', mode: 'login' })}>
                          Entrar na conta
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: other reviews list */}
                <div className="md:col-span-7 space-y-4">
                  <h4 className="font-bold text-lg">Comentários dos Leitores ({reviews.length})</h4>
                  
                  {loadingReviews ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : reviews.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-2xl bg-muted/5">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Este livro ainda não tem avaliações escritas.</p>
                      <p className="text-xs text-muted-foreground/80 mt-1">Seja o primeiro a partilhar a sua opinião!</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                      {reviews.map((r) => (
                        <div key={r.id} className="p-4 border rounded-xl bg-card hover:shadow-sm transition-all">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-[#0ea5c9]/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-[#0ea5c9]/25">
                                {r.userAvatar ? (
                                  <img src={r.userAvatar} alt={r.userName} className="h-full w-full rounded-full object-cover" />
                                ) : (
                                  r.userName.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <h5 className="font-bold text-sm leading-tight">{r.userName}</h5>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(r.createdAt || Date.now()).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            
                            <StarRating rating={r.rating} size={12} />
                          </div>
                          
                          <p className="text-sm text-muted-foreground leading-relaxed pl-1 whitespace-pre-wrap">{r.comment}</p>

                          {helpfulVotesEnabled && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                type="button"
                                variant={r.hasHelpfulVote ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-8 gap-1.5 px-2"
                                aria-label={`Marcar comentário como útil, ${r.helpfulCount} votos`}
                                aria-pressed={r.hasHelpfulVote}
                                disabled={Boolean(votingReviewId) || r.userId === user?.id}
                                onClick={() => toggleHelpfulVote(r)}
                              >
                                <ThumbsUp className="h-4 w-4" />
                                <span>Útil</span>
                                <span>{r.helpfulCount}</span>
                              </Button>
                            </div>
                          )}
                          
                          {r.isVerified && (
                            <div className="mt-3">
                              <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded border border-green-100">
                                ★ Compra Verificada
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

      </main>

      <SampleReaderModal
        open={sampleReaderOpen}
        onClose={() => setSampleReaderOpen(false)}
        pages={product.sample_pages || []}
        title={product.title}
      />
      <BookPreviewModal product={product} open={showPreview} onClose={() => setShowPreview(false)} onCartOpen={() => setIsCartOpen(true)} />

      <RecentlyViewed currentId={product.id} />

      {/* Como nas grandes lojas: debaixo do livro, o catálogo continua enquanto se desce. */}
      <DiscoveryFeed excludeId={product.id} onCartOpen={() => setIsCartOpen(true)} title="Também lhe pode interessar" />

      <StickyBuyBar
        alvo={botoesCompra}
        price={price}
        originalPrice={originalPrice}
        onBuy={handleBuyNow}
        disabled={!canAddToCart || !product.purchasable}
        label={product.purchasable ? 'Comprar' : 'Esgotado'}
      />

      <Footer />
    </>
  );
}

export default ProductDetailPage;