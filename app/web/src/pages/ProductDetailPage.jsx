import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getProduct, getProductQuantities, getRelatedProducts, trackBookView } from '@/api/EcommerceApi';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { shareBookOnWhatsApp } from '@/lib/whatsapp';
import RelatedProducts from '@/components/RelatedProducts';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { 
  ShoppingCart as ShoppingCartIcon, Loader2, ChevronLeft, ChevronRight, CheckCircle, 
  XCircle, Minus, Plus, BookOpen, User, Layers, Eye, MessageCircle, Heart, Star, Sparkles, Trash2, ThumbsUp
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
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import SampleReaderModal from '@/components/SampleReaderModal';
import RecentlyViewed from '@/components/RecentlyViewed.jsx';
import DiscoveryFeed from '@/components/DiscoveryFeed.jsx';
import StickyBuyBar from '@/components/StickyBuyBar.jsx';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { MOTION } from '@/lib/motion';
import { hasReadingSample, variantNames } from '@/lib/productTypes';

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
  const [product, setProduct] = useState(null);
  // A barra de compra do fundo observa estes botões: só aparece quando eles saem do ecrã.
  // Em estado, e não num `ref`: o observador precisa de saber quando o elemento aparece, e
  // um `ref` não avisa ninguém de que foi preenchido.
  const [botoesCompra, setBotoesCompra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState([]);
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
        // Com o carrinho aberto, o aviso ficava por cima de "Continuar para Checkout".
        if (openCart) {
          setIsCartOpen(true);
        } else {
          toast({
            variant: 'cart-success',
            product,
            onCartOpen: () => setIsCartOpen(true)
          });
        }
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
            // Começa na primeira variante com stock: abrir num tamanho esgotado parecia o produto todo esgotado.
            const vs = productWithQuantities.variants;
            setSelectedVariant(vs.find((v) => v.inventory_quantity > 0) || vs[0]);
          }

          const bookGenre = productWithQuantities.type?.value || productWithQuantities.category || '';
          getRelatedProducts(productWithQuantities.subtitle, productWithQuantities.id, 4, bookGenre)
            .then((res) => setRelatedProducts(res.products || []))
            .catch(() => {});
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

  // Texto simples da descrição (já sem HTML), para o resumo junto ao botão de compra.
  const descriptionText = typeof DOMParser !== 'undefined' && product.description
    ? (new DOMParser().parseFromString(sanitizeHtml(product.description), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim()
    : '';
  const descriptionTruncated = descriptionText.length > 280;
  const descriptionExcerpt = descriptionTruncated ? `${descriptionText.slice(0, 280).replace(/\s+\S*$/, '')}…` : descriptionText;

  const currentImage = product.images[currentImageIndex];
  const hasMultipleImages = product.images.length > 1;

  return (
    <>
      <Helmet>
        <title>{pageTitle(product.title)}</title>
        <meta name="description" content={(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 160) || product.title} />
      </Helmet>

      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="container-custom py-12">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="-my-1.5 inline-block py-1.5 hover:text-primary transition-colors">Início</Link>
          <span>/</span>
          <Link to="/shop" className="-my-1.5 inline-block py-1.5 hover:text-primary transition-colors">Loja</Link>
          <span>/</span>
          <span className="text-foreground">{product.title}</span>
        </nav>

        {/* `min-w-0` nas duas colunas: um item de grid tem `min-width: auto` por omissão e
            recusa-se a encolher abaixo do conteúdo. Era o que empurrava a coluna para 399px
            dentro de um contentor de 343 e dava 40px de deslocamento horizontal no
            telemóvel — a página inteira arrastava-se para o lado. */}
        <div className="grid lg:grid-cols-2 gap-12">
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: MOTION.base }}
          >
            <div className="relative overflow-hidden rounded-2xl bg-muted aspect-[3/4] max-h-[78vh] mx-auto w-full mb-4">
              <img
                src={!currentImage?.url ? placeholderImage : currentImage.url}
                alt={product.title}
                className="w-full h-full object-contain p-3"
              />

              {hasMultipleImages && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-colors"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-colors"
                    aria-label="Next image"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}

              {product.ribbon_text && (
                <div className="absolute top-4 left-4 bg-brand-solid text-sm font-bold px-4 py-2 rounded-full">
                  {product.ribbon_text}
                </div>
              )}
            </div>

            {hasMultipleImages && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-16 h-20 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      index === currentImageIndex ? 'border-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={!image.url ? placeholderImage : image.url}
                      alt={`${product.title} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: MOTION.base, delay: 0.2 }}
            className="flex flex-col min-w-0"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-3 text-foreground">{product.title}</h1>
            {product.marketing_hook && (
              <p className="text-lg text-primary font-medium mb-2">{product.marketing_hook}</p>
            )}
            {product.subtitle && (
              <p className="text-xl text-muted-foreground mb-4">{product.subtitle}</p>
            )}
            {product.social_proof && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 inline-block">
                ✓ {product.social_proof}
              </p>
            )}

            {(product.book_code || product.sku || product.isbn) && (
              <div className="flex flex-wrap gap-3 mb-6 text-sm">
                {product.book_code && (
                  <span className="px-3 py-1 rounded-lg bg-muted font-mono text-primary">
                    Código: {product.book_code}
                  </span>
                )}
                {product.sku && product.sku !== product.book_code && (
                  <span className="px-3 py-1 rounded-lg bg-muted font-mono text-muted-foreground">
                    SKU: {product.sku}
                  </span>
                )}
                {product.isbn && (
                  <span className="px-3 py-1 rounded-lg bg-muted font-mono text-muted-foreground">
                    ISBN: {product.isbn}
                  </span>
                )}
              </div>
            )}

            {(product.publisher || product.language || product.pages || product.year) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-sm">
                {product.publisher && <div><span className="text-muted-foreground">Editora</span><p className="font-medium">{product.publisher}</p></div>}
                {product.language && <div><span className="text-muted-foreground">Idioma</span><p className="font-medium">{product.language}</p></div>}
                {product.pages > 0 && <div><span className="text-muted-foreground">Páginas</span><p className="font-medium">{product.pages}</p></div>}
                {product.year > 0 && <div><span className="text-muted-foreground">Ano</span><p className="font-medium">{product.year}</p></div>}
              </div>
            )}

            <div className="flex items-baseline gap-3 mb-8">
              <span className="text-4xl font-bold text-brand-ink">{price}</span>
              {selectedVariant?.sale_price_in_cents && (
                <span className="text-2xl text-muted-foreground line-through">{originalPrice}</span>
              )}
            </div>

            {product.variants.length > 1 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 text-foreground">{variantNames(product.product_type).one}</h3>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map(variant => (
                    <Button
                      key={variant.id}
                      aria-pressed={selectedVariant?.id === variant.id}
                      aria-label={variant.inventory_quantity > 0 ? undefined : `${variant.title} (esgotado)`}
                      variant={selectedVariant?.id === variant.id ? 'default' : 'outline'}
                      onClick={() => handleVariantSelect(variant)}
                      className={`transition-all ${selectedVariant?.id === variant.id ? 'btn-primary' : 'border-border hover:border-primary'} ${variant.inventory_quantity > 0 ? '' : 'line-through opacity-60'}`}
                    >
                      {variant.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center border border-border rounded-lg">
                <Button onClick={() => handleQuantityChange(-1)} variant="ghost" size="icon" className="rounded-l-lg hover:bg-muted">
                  <Minus size={18} />
                </Button>
                <span className="w-12 text-center font-semibold text-foreground">{quantity}</span>
                <Button onClick={() => handleQuantityChange(1)} variant="ghost" size="icon" className="rounded-r-lg hover:bg-muted">
                  <Plus size={18} />
                </Button>
              </div>
            </div>

            <div ref={setBotoesCompra} className="flex flex-col sm:flex-row gap-3 mb-4">
              <Button
                onClick={handleBuyNow}
                size="lg"
                className="flex-1 btn-primary text-lg py-6"
                disabled={!canAddToCart || !product.purchasable}
              >
                <ShoppingCartIcon className="mr-2 h-5 w-5" />
                Comprar Agora
              </Button>
              <Button
                onClick={() => handleAddToCart(false)}
                size="lg"
                variant="outline"
                className="flex-1 text-lg py-6 border-marca text-primary hover:bg-marca/10"
                disabled={!canAddToCart || !product.purchasable}
              >
                Adicionar ao Carrinho
              </Button>
              <Button
                onClick={() => toggleWishlist(product)}
                size="lg"
                variant="outline"
                className={`px-4 py-6 border-2 transition-all duration-base ${isWish ? 'border-red-500 text-red-500 hover:bg-red-50' : 'border-border hover:bg-muted'}`}
                title={isWish ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
              >
                <Heart className={`h-6 w-6 ${isWish ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
              </Button>
            </div>
            {/* Só com páginas verdadeiras do livro, carregadas no painel. */}
            {hasReadingSample(product) && (
              <Button
                onClick={() => setSampleReaderOpen(true)}
                variant="outline"
                className="w-full mb-3 border-marca/40 text-primary hover:bg-marca/5 py-6 text-lg rounded-xl"
              >
                <BookOpen className="mr-2 h-5 w-5" />
                Ler Amostra Grátis (Primeiras Páginas)
              </Button>
            )}
            {(settings.whatsapp || settings.contact_phone) && (
              <Button
                variant="outline"
                className="w-full mb-4 border-green-500/40 text-green-700 hover:bg-green-50"
                onClick={() => shareBookOnWhatsApp(product, settings.whatsapp || settings.contact_phone)}
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                Partilhar / Pedir via WhatsApp
              </Button>
            )}


            {isStockManaged && canAddToCart && product.purchasable && (
              <p className="text-sm text-brand-ink flex items-center justify-center gap-2 mb-4">
                <CheckCircle size={16} /> {availableStock} em stock
              </p>
            )}

            {isStockManaged && !canAddToCart && product.purchasable && (
              <p className="text-sm text-destructive flex items-center justify-center gap-2 mb-4">
                <XCircle size={16} />
                {availableStock > 0
                  ? `Stock insuficiente. Apenas ${availableStock} disponíve${availableStock !== 1 ? 'is' : 'l'}.`
                  : variantNames(product.product_type).soldOut}
              </p>
            )}

            {!product.purchasable && (
              <p className="text-sm text-destructive flex items-center justify-center gap-2 mb-4">
                <XCircle size={16} /> Indisponível no momento
              </p>
            )}

            {/* Resumo da descrição depois do botão de compra: o texto completo, em "Detalhes",
                empurrava o botão para fora do primeiro ecrã. */}
            {descriptionExcerpt && (
              <div className="mb-6">
                <p className="text-muted-foreground leading-relaxed">{descriptionExcerpt}</p>
                {descriptionTruncated && (
                  <button
                    type="button"
                    onClick={() => document.getElementById('detalhes-produto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="mt-1 text-sm font-medium text-primary hover:underline"
                  >
                    Ler a descrição completa
                  </button>
                )}
              </div>
            )}

            {Array.isArray(product.benefit_bullets) && product.benefit_bullets.length > 0 && (
              <div className="mb-8 p-4 rounded-xl bg-marca/5 border border-marca/15">
                <p className="font-semibold mb-3 text-foreground">Porquê este livro?</p>
                <ul className="space-y-2">
                  {product.benefit_bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.target_audience && (
              <p className="text-sm text-muted-foreground mb-8">
                <span className="font-medium text-foreground">Ideal para:</span> {product.target_audience}
              </p>
            )}

            {product.additional_info?.length > 0 && (
              <div className="mt-8 space-y-6">
                {product.additional_info
                  .sort((a, b) => a.order - b.order)
                  .map((info) => (
                    <div key={info.id} className="border-l-2 border-primary/30 pl-4">
                      <h3 className="text-lg font-semibold mb-2 text-foreground">{info.title}</h3>
                      <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(info.description) }} />
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        </div>

        <div className="mt-16 border-t border-border pt-10">
          <Tabs defaultValue="details" id="detalhes-produto" className="scroll-mt-24">
            <TabsList className="mb-8 flex-wrap h-auto gap-1">
              <TabsTrigger value="details"><BookOpen className="h-4 w-4 mr-1.5" />Detalhes</TabsTrigger>
              {hasReadingSample(product) && (
                <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1.5" />Pré-visualização</TabsTrigger>
              )}
              {(product.author_bio || product.author_photo) && (
                <TabsTrigger value="author"><User className="h-4 w-4 mr-1.5" />Sobre o Autor</TabsTrigger>
              )}
              {product.variants?.length > 1 && (
                <TabsTrigger value="versions"><Layers className="h-4 w-4 mr-1.5" />{variantNames(product.product_type).many}</TabsTrigger>
              )}
              <TabsTrigger value="reviews"><MessageCircle className="h-4 w-4 mr-1.5" />Avaliações ({stats.total})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="max-w-3xl">
              {product.description ? (
                <div className="prose max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} />
              ) : (
                <p className="text-muted-foreground">Sem descrição disponível.</p>
              )}
            </TabsContent>

            {hasReadingSample(product) && (
              <TabsContent value="preview">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <p className="text-sm text-muted-foreground">Explore as primeiras páginas antes de comprar.</p>
                  <Button size="sm" className="bg-primary hover:bg-marca/90 text-white" onClick={() => setSampleReaderOpen(true)}>
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
                    <img src={product.author_photo} alt={product.subtitle} className="w-32 h-32 rounded-full object-cover ring-4 ring-marca/20 shrink-0" />
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
                    <button
                      type="button"
                      key={v.id}
                      aria-pressed={selectedVariant?.id === v.id}
                      className={`text-left p-4 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedVariant?.id === v.id ? 'ring-2 ring-marca border-marca/40' : 'hover:border-marca/30'}`}
                      onClick={() => handleVariantSelect(v)}
                    >
                      <p className="font-semibold">{v.title}</p>
                      {v.format && <p className="text-sm text-muted-foreground">{v.format}</p>}
                      {v.isbn && <p className="text-xs font-mono text-muted-foreground mt-1">ISBN: {v.isbn}</p>}
                      <p className="text-primary font-bold mt-2">{v.sale_price_formatted || v.price_formatted}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.inventory_quantity > 0 ? `${v.inventory_quantity} em stock` : 'Esgotado'}</p>
                    </button>
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
                            className="w-full text-sm p-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-marca bg-background"
                            required
                          />
                        </div>

                        <Button type="submit" disabled={submitting} className="w-full btn-primary h-11 bg-primary text-white hover:bg-marca/90">
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
                        <Button type="button" variant="outline" className="w-full border-marca text-primary hover:bg-marca/10" onClick={() => openAuth({ reason: 'review', mode: 'login' })}>
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
                              <div className="h-9 w-9 rounded-full bg-marca/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-marca/25">
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

        <RelatedProducts products={relatedProducts} author={product.subtitle} onCartOpen={() => setIsCartOpen(true)} />
      </main>

      <SampleReaderModal
        open={sampleReaderOpen}
        onClose={() => setSampleReaderOpen(false)}
        pages={product.sample_pages || []}
        title={product.title}
      />

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