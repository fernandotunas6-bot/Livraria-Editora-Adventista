// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import { formatCurrency, getProduct, trackBookView } from '@/api/EcommerceApi';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { buildBookShareMessage, buildWhatsAppShareUrl, shareBookOnWhatsApp } from '@/lib/whatsapp';
import { copyText, nativeShare } from '@/lib/nativeShare';
import { discountPercent } from '@/lib/productGrid';
import { shippingRules } from '@/lib/shipping';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { 
  ShoppingCart as ShoppingCartIcon, Loader2, ChevronLeft, ChevronRight, CheckCircle, 
  XCircle, Minus, Plus, BookOpen, User, Layers, Eye, MessageCircle, Heart, Star, Sparkles, Trash2, ThumbsUp, MessagesSquare,
  Truck, Wallet, Youtube, Share2,
} from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useReviews } from '@/hooks/useReviews';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header.jsx';
import { pageTitle } from '@/lib/brand';
import { isYoutubeUrl } from '@/lib/youtube';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import SampleReaderModal from '@/components/SampleReaderModal';
import RecentlyViewed from '@/components/RecentlyViewed.jsx';
import DiscoveryFeed from '@/components/DiscoveryFeed.jsx';
import RelatedProducts from '@/components/RelatedProducts.jsx';
import ProductVideo from '@/components/ProductVideo.jsx';
import StickyBuyBar from '@/components/StickyBuyBar.jsx';
import { deliveryWindow, formatWindow } from '@/lib/deliveryEstimate';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import { MOTION } from '@/lib/motion';
import { hasReadingSample, productType, variantNames } from '@/lib/productTypes';
import { breadcrumbJsonLd, jsonLdString, productJsonLd } from '@/lib/structuredData';
import CommunityFeed from '@/components/community/CommunityFeed';
import ProductDownloads from '@/components/downloads/ProductDownloads';
import StoreAvailability from '@/components/StoreAvailability';
import { DIGITAL_FORA_DA_APP, variantIndexOf } from '@/lib/digitalEditions';
import { loadMyLibrary } from '@/lib/digitalLibrary';

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
  // A biblioteca de quem tem sessão, só nos produtos com edição digital (para o "Já é seu").
  const [library, setLibrary] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // A proporção da fotografia à vista, medida quando carrega: a caixa toma-a (entre 0,6 e 1,6),
  // para uma fotografia deitada não ficar no meio de uma caixa 3:4 com cinzento por cima e por
  // baixo, e para o título caber no primeiro ecrã do telemóvel. Guarda-se com o endereço, para
  // não se usar a proporção de outra fotografia ao mudar de imagem.
  const [proporcaoDaFoto, setProporcaoDaFoto] = useState({ url: null, valor: null });
  // Separadores controlados: as estrelas do topo e o "Ler a descrição completa" abrem o
  // separador certo e levam o ecrã até lá.
  // O separador fica no endereço (`?tab=discussion`, ou `?tab=discussao`): a discussão de um
  // livro, ou as avaliações, partilham-se com um link que já abre lá.
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_ALIASES = { discussao: 'discussion', avaliacoes: 'reviews', detalhes: 'details' };
  const rawTab = searchParams.get('tab') || 'details';
  const tab = TAB_ALIASES[rawTab] || rawTab;
  const setTab = (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === 'details') next.delete('tab'); else next.set('tab', value);
      return next;
    }, { replace: true });
  };
  const tabsRef = useRef(null);
  const openTab = (value) => {
    setTab(value);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
        await addToCart(product, selectedVariant, selectedVariant.digital === true ? 1 : quantity, availableQuantity, { silent: true });
        // Com o carrinho aberto, o aviso ficava por cima de "Continuar para finalizar a compra".
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

  useEffect(() => {
    if (!user?.id || !product?.has_digital) { setLibrary(null); return undefined; }
    let alive = true;
    loadMyLibrary()
      .then((rows) => { if (alive) setLibrary(rows.filter((r) => r.book_id === product.id)); })
      .catch(() => { if (alive) setLibrary(null); });
    return () => { alive = false; };
  }, [user?.id, product?.id, product?.has_digital]);

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
        // O stock já vem com o livro (`bookToProduct` e `variantStock`). Havia um segundo pedido
        // (`getProductQuantities`) que voltava a ler a mesma linha da mesma tabela para fazer a
        // mesma conta: no telemóvel, mais uma ida à rede antes de a página aparecer.
        const fetchedProduct = await getProduct(id);
        trackBookView(fetchedProduct.id);
        setProduct(fetchedProduct);
        // Fica no navegador de quem visita, para poder voltar a este livro depois de ver
        // outros. Nada vai para o servidor: é um atalho, não um registo de hábitos.
        addRecentlyViewed(fetchedProduct);

        if (fetchedProduct.variants && fetchedProduct.variants.length > 0) {
          // Começa na primeira variante com stock: abrir num tamanho esgotado parecia o produto todo esgotado.
          const vs = fetchedProduct.variants;
          const first = vs.find((v) => v.inventory_quantity > 0) || vs[0];
          setSelectedVariant(first);
          // A imagem acompanha a variante: se a primeira com stock for outra cor, mostra essa.
          const img = (fetchedProduct.images || []).findIndex((i) => i.url === first?.image_url);
          setCurrentImageIndex(img > 0 ? img : 0);
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
        {/* A forma da ficha enquanto chega (capa, título, preço, botões), em vez de um
            spinner num ecrã vazio: a página não salta quando o livro aparece. */}
        <main className="container-custom py-6 md:py-12" aria-busy="true">
          <p className="sr-only" role="status">A carregar o livro…</p>
          <Skeleton className="mb-6 h-4 w-44" />
          <div className="grid gap-8 md:grid-cols-2 md:gap-12">
            <Skeleton className="mx-auto aspect-3/4 w-full max-w-md rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-9 w-11/12" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </main>
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

  // Separador do vídeo só quando há um endereço do YouTube que se consegue mostrar: um
  // separador vazio é pior do que separador nenhum.
  const temVideo = isYoutubeUrl(product?.video_url);
  const price = selectedVariant?.sale_price_formatted ?? selectedVariant?.price_formatted;
  const originalPrice = selectedVariant?.price_formatted;
  const availableStock = selectedVariant ? selectedVariant.inventory_quantity : 0;
  const isStockManaged = selectedVariant?.manage_inventory ?? false;
  // Edição digital (lib/digitalEditions.js): sem stock nem envio, uma por conta.
  const isDigital = selectedVariant?.digital === true;
  // Já é seu? A biblioteca diz se esta edição está paga (abre) ou encomendada por pagar. Só
  // conta o PDF ligado a esta variante (ou ao produto sem variantes): um PDF do produto inteiro
  // também vem com o impresso, e não diz que edição se comprou.
  const selectedIndex = variantIndexOf(selectedVariant?.id);
  const ownedRow = isDigital
    ? (library || []).find((r) => (selectedIndex === null ? r.variant == null : Number(r.variant) === selectedIndex)
      && ['open', 'payment_review', 'awaiting_payment', 'partially_paid'].includes(r.state))
    : null;
  const canAddToCart = (!isStockManaged || quantity <= availableStock) && !ownedRow;

  // Texto simples da descrição (já sem HTML), para o resumo junto ao botão de compra.
  const descriptionText = typeof DOMParser !== 'undefined' && product.description
    ? (new DOMParser().parseFromString(sanitizeHtml(product.description), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim()
    : '';
  const descriptionTruncated = descriptionText.length > 280;
  const descriptionExcerpt = descriptionTruncated ? `${descriptionText.slice(0, 280).replace(/\s+\S*$/, '')}…` : descriptionText;

  const genre = product.type?.value || '';
  const discount = discountPercent(selectedVariant);

  // Dados estruturados (lib/structuredData.js): o preço, a disponibilidade e o caminho da
  // página, para a Google os poder mostrar nos resultados. Seguem a variante escolhida.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const productUrl = `${origin}/product/${encodeURIComponent(product.id)}`;
  const structuredData = jsonLdString([
    productJsonLd(product, { origin, variant: selectedVariant, isBook: productType(product.product_type).isBook }),
    breadcrumbJsonLd([
      { name: 'Início', url: `${origin}/` },
      { name: 'Loja', url: `${origin}/shop` },
      genre && { name: genre, url: `${origin}/shop?category=${encodeURIComponent(genre)}` },
      { name: product.title, url: productUrl },
    ]),
  ]);

  // Uma linha só sobre o stock, logo abaixo do preço, em vez dos três avisos soltos que
  // estavam espalhados pela coluna.
  const availability = product.digital_fora_da_app && !product.purchasable
    ? { ok: false, label: DIGITAL_FORA_DA_APP, tone: 'text-muted-foreground' }
    : isDigital
    ? { ok: true, label: 'Edição digital: sem portes — abre na sua biblioteca quando o pagamento for confirmado', tone: 'text-emerald-700 dark:text-emerald-400' }
    : !product.purchasable
    ? { ok: false, label: 'Esgotado de momento' , tone: 'text-destructive' }
    : isStockManaged && availableStock <= 0
      // Com variantes, a mensagem do tipo ("Este tamanho esgotou. Escolha outro." numa t-shirt,
      // "Esta edição esgotou…" num livro, auditoria 9.11); sem variantes, o produto esgotou.
      ? { ok: false, label: product.variants?.length > 1 ? variantNames(product.product_type, product.versions).soldOut : 'Esgotado', tone: 'text-destructive' }
      : isStockManaged && !canAddToCart
        ? { ok: false, label: `Só ${availableStock} disponíve${availableStock === 1 ? 'l' : 'is'}`, tone: 'text-destructive' }
        : isStockManaged && product.stock_low
          ? { ok: true, label: `Restam ${availableStock} — pode esgotar em breve`, tone: 'text-orange-700 dark:text-orange-400' }
          : { ok: true, label: 'Em stock, pronto a enviar', tone: 'text-emerald-700 dark:text-emerald-400' };

  // Partilhar o livro: a folha do sistema no telemóvel; sem ela, copia-se a ligação; e se nem
  // isso der, abre-se o WhatsApp para escolher a conversa.
  const shareBook = async () => {
    const url = `${window.location.origin}/product/${product.id}`;
    const result = await nativeShare({
      title: product.title,
      text: product.subtitle ? `${product.title}, de ${product.subtitle}` : product.title,
      url,
    });
    if (result !== 'unsupported') return;
    if (await copyText(url)) {
      toast({ title: 'Ligação copiada', description: 'Cole-a numa conversa para partilhar o livro.' });
      return;
    }
    window.open(buildWhatsAppShareUrl(buildBookShareMessage(product)), '_blank', 'noopener,noreferrer');
  };

  // O limiar vem das mesmas regras do carrinho e do servidor (`shippingRules`): um limiar a 0
  // nas Configurações significa envio sempre grátis, e não os 20 000 Kz por omissão.
  const { freeThresholdCents } = shippingRules(settings);
  const shippingLine = freeThresholdCents > 0
    ? `Grátis a partir de ${formatCurrency(freeThresholdCents)}.`
    : 'Grátis em todas as encomendas.';
  // Quando chega, em datas (os prazos de "Envios e devoluções"), só para o que está em stock.
  const arrivesLuanda = availability.ok ? formatWindow(deliveryWindow('luanda')) : '';
  const arrivesProvinces = availability.ok ? formatWindow(deliveryWindow('provincias')) : '';

  // Ficha técnica: o que se compara entre edições e se pergunta ao telefone.
  const specs = [
    ['Autor', product.subtitle],
    ['Editora', product.publisher],
    ['Idioma', product.language],
    ['Páginas', product.pages > 0 ? product.pages : null],
    ['Ano', product.year > 0 ? product.year : null],
    ['ISBN', product.isbn],
    ['Género', genre],
    ['Código', product.book_code],
    ['SKU', product.sku && product.sku !== product.book_code ? product.sku : null],
  ].filter(([, value]) => value);

  const currentImage = product.images[currentImageIndex];
  const proporcao = proporcaoDaFoto.url === currentImage?.url ? proporcaoDaFoto.valor : null;
  const hasMultipleImages = product.images.length > 1;

  return (
    <>
      <Helmet>
        <title>{pageTitle(product.title)}</title>
        <meta name="description" content={(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 160) || product.title} />
        {structuredData && <script type="application/ld+json">{structuredData}</script>}
      </Helmet>

      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="container-custom py-12">
        <nav aria-label="Caminho" className="mb-8 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="-my-1.5 shrink-0 py-1.5 transition-colors hover:text-primary">Início</Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          <Link to="/shop" className="-my-1.5 shrink-0 py-1.5 transition-colors hover:text-primary">Loja</Link>
          {genre && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
              <Link to={`/shop?category=${encodeURIComponent(genre)}`} className="-my-1.5 truncate py-1.5 transition-colors hover:text-primary">{genre}</Link>
            </>
          )}
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 opacity-60 md:block" aria-hidden="true" />
          <span className="hidden truncate text-foreground md:block" aria-current="page">{product.title}</span>
        </nav>

        {/* `min-w-0` nas duas colunas: um item de grid tem `min-width: auto` por omissão e
            recusa-se a encolher abaixo do conteúdo. Era o que empurrava a coluna para 399px
            dentro de um contentor de 343 e dava 40px de deslocamento horizontal no
            telemóvel — a página inteira arrastava-se para o lado. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <motion.div
            className="min-w-0 lg:sticky lg:top-24 lg:self-start"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: MOTION.base }}
          >
            <div
              className="relative overflow-hidden rounded-2xl bg-muted aspect-3/4 max-h-[78vh] mx-auto w-full mb-4"
              style={proporcao ? { aspectRatio: String(proporcao) } : undefined}
            >
              {/* A capa é o maior elemento da ficha (o LCP): pede-se antes das capas dos
                  relacionados. Minúsculas de propósito: o React 18 não conhece `fetchPriority`
                  e passa o atributo tal como está. */}
              <img
                src={!currentImage?.url ? placeholderImage : currentImage.url}
                alt={product.title}
                fetchpriority="high"
                className="w-full h-full object-contain p-3"
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  if (w && h) setProporcaoDaFoto({ url: currentImage?.url, valor: Math.min(1.6, Math.max(0.6, w / h)) });
                }}
              />

              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-colors"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft size={24} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background text-foreground p-2 rounded-full transition-colors"
                    aria-label="Imagem seguinte"
                  >
                    <ChevronRight size={24} aria-hidden="true" />
                  </button>
                </>
              )}

              {discount > 0 && product.purchasable && (
                <span className="absolute left-4 top-4 rounded-full bg-rose-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm tabular-nums">
                  −{discount}%
                </span>
              )}
              {!discount && product.ribbon_text && (
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
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`Ver imagem ${index + 1} de ${product.images.length}`}
                    aria-current={index === currentImageIndex ? 'true' : undefined}
                    className={`shrink-0 w-16 h-20 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-colors ${
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 text-foreground text-balance">{product.title}</h1>
            {product.marketing_hook && (
              <p className="text-lg text-primary font-medium mb-2">{product.marketing_hook}</p>
            )}
            {product.subtitle && (
              <p className="mb-2 text-xl text-muted-foreground">
                de{' '}
                <Link to={`/shop?author=${encodeURIComponent(product.subtitle)}`} className="font-medium text-primary hover:underline">
                  {product.subtitle}
                </Link>
              </p>
            )}
            {/* A colecção a que o livro pertence. As colecções desta livraria são séries
                (Conflito dos Séculos, lições, devocionais de um ano), e quem está num volume
                procura os outros — mas a ficha não tinha ligação nenhuma para a série: o
                caminho de migalhas leva ao género, e o autor à pesquisa por autor. A rota
                `/colecoes/:slug` aceita também o id da colecção. */}
            {product.collection_id && product.collection_title && (
              <p className="mb-2 text-sm text-muted-foreground">
                Da colecção{' '}
                <Link to={`/colecoes/${encodeURIComponent(product.collection_id)}`} className="font-medium text-primary hover:underline">
                  {product.collection_title}
                </Link>
              </p>
            )}
            <button
              type="button"
              onClick={() => openTab('reviews')}
              className="mb-4 flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <StarRating rating={Math.round(stats.average)} size={16} />
              {stats.total > 0
                ? <span>{stats.average} · {stats.total} {stats.total === 1 ? 'avaliação' : 'avaliações'}</span>
                : <span>Seja o primeiro a avaliar</span>}
            </button>
            {product.social_proof && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 inline-block">
                ✓ {product.social_proof}
              </p>
            )}

            {/* A ficha técnica (códigos, editora, idioma, páginas, ano) está em "Detalhes":
                aqui em cima só o que decide a compra. */}
            <div className="mb-8">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-4xl font-bold text-brand-ink tabular-nums">{price}</span>
                {selectedVariant?.sale_price_in_cents && (
                  <span className="text-2xl text-muted-foreground line-through tabular-nums">{originalPrice}</span>
                )}
                {discount > 0 && (
                  <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-sm font-semibold text-rose-700">Poupa {discount}%</span>
                )}
              </div>
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${availability.tone}`}>
                {availability.ok ? <CheckCircle size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
                {availability.label}
              </p>
            </div>

            {product.variants.length > 1 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 text-foreground">{variantNames(product.product_type, product.versions).one}</h3>
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

            {isDigital && product.digital_fora_da_app ? null : isDigital ? (
              // A edição digital é uma por conta, e fica na biblioteca: sem quantidade nem envio.
              <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" data-edicao-digital>
                {ownedRow ? (
                  ownedRow.state === 'open' ? (
                    <p className="text-foreground">
                      <strong>Já é seu.</strong> Está na sua biblioteca, pronto a abrir ou descarregar.{' '}
                      <Link to="/profile?tab=biblioteca" className="font-medium text-primary underline underline-offset-2 hover:no-underline">Abrir a biblioteca</Link>
                    </p>
                  ) : (
                    <p className="text-foreground">
                      <strong>Já encomendou esta edição</strong> (encomenda {ownedRow.order_number}): abre quando o pagamento for confirmado.{' '}
                      <Link to="/profile?tab=orders" className="font-medium text-primary underline underline-offset-2 hover:no-underline">Ver a encomenda e pagar</Link>
                    </p>
                  )
                ) : (
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Edição digital (PDF).</strong> Sem portes nem morada: depois do pagamento confirmado,
                    abre em Perfil → Biblioteca, neste e noutros aparelhos. Precisa de conta.
                  </p>
                )}
              </div>
            ) : (
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center border border-border rounded-lg">
                <Button onClick={() => handleQuantityChange(-1)} variant="ghost" size="icon" className="rounded-l-lg hover:bg-muted" aria-label="Diminuir quantidade">
                  <Minus size={18} />
                </Button>
                <span className="w-12 text-center font-semibold text-foreground">{quantity}</span>
                <Button onClick={() => handleQuantityChange(1)} variant="ghost" size="icon" className="rounded-r-lg hover:bg-muted" aria-label="Aumentar quantidade">
                  <Plus size={18} />
                </Button>
              </div>
            </div>
            )}

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
              {/* No telemóvel o botão ocupa a largura toda: com só o coração parecia um botão
                  vazio. Lá diz o que faz; no computador fica o quadrado com o coração. */}
              <Button
                onClick={() => toggleWishlist(product)}
                size="lg"
                variant="outline"
                className={`px-4 py-6 border-2 transition-all duration-base ${isWish ? 'border-red-500 text-red-500 hover:bg-red-50' : 'border-border hover:bg-muted'}`}
                title={isWish ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                aria-label={isWish ? 'Remover dos favoritos' : 'Guardar nos favoritos'}
                aria-pressed={isWish}
              >
                <Heart className={`h-6 w-6 ${isWish ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} aria-hidden="true" />
                <span className="ml-2 text-base font-medium sm:hidden" aria-hidden="true">{isWish ? 'Nos favoritos' : 'Guardar nos favoritos'}</span>
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
            {/* PDFs ligados ao produto: gratuitos, ou para quem o comprou (materiais). */}
            <ProductDownloads productId={product.id} product={product} />
            {/* Duas coisas diferentes que estavam num só botão: perguntar à livraria (abre a
                conversa com ela) e partilhar o livro com alguém (a folha do telemóvel). */}
            <div className="mb-4 flex gap-2">
              {(settings.whatsapp || settings.contact_phone) && (
                <Button
                  variant="outline"
                  className="min-h-11 flex-1 border-green-500/40 text-green-700 hover:bg-green-50"
                  onClick={() => shareBookOnWhatsApp(product, settings.whatsapp || settings.contact_phone)}
                >
                  <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
                  Perguntar pelo WhatsApp
                </Button>
              )}
              <Button variant="outline" className="min-h-11 flex-1" onClick={shareBook}>
                <Share2 className="mr-2 h-5 w-5" aria-hidden="true" />
                Partilhar
              </Button>
            </div>

            {/* O que acontece depois de comprar: a dúvida que trazia as pessoas ao WhatsApp. */}
            <ul className="mb-6 space-y-2.5 border-t border-border pt-4 text-sm">
              <li className="flex items-start gap-2.5">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <strong className="font-medium text-foreground">Entrega em todo o país.</strong> <span className="text-muted-foreground">{shippingLine}</span>
                  {arrivesLuanda && (
                    <span className="mt-0.5 block text-muted-foreground">
                      Chegada estimada: <strong className="font-medium text-foreground">{arrivesLuanda}</strong> em Luanda,{' '}
                      {arrivesProvinces} nas outras províncias. <Link to="/shipping-returns" className="text-primary underline underline-offset-2 hover:no-underline">Prazos</Link>
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span><strong className="font-medium text-foreground">Pagamento na entrega</strong> <span className="text-muted-foreground">ou por transferência.</span></span>
              </li>
              {/* As lojas que marcaram «temos» neste produto; sem nenhuma, a linha de sempre. */}
              <StoreAvailability bookId={product.id} />
            </ul>

            {/* Resumo da descrição depois do botão de compra: o texto completo, em "Detalhes",
                empurrava o botão para fora do primeiro ecrã. */}
            {descriptionExcerpt && (
              <div className="mb-6">
                <p className="text-muted-foreground leading-relaxed">{descriptionExcerpt}</p>
                {descriptionTruncated && (
                  <button
                    type="button"
                    onClick={() => openTab('details')}
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

          </motion.div>
        </div>

        <div ref={tabsRef} className="mt-16 scroll-mt-24 border-t border-border pt-10">
          <Tabs value={tab} onValueChange={setTab}>
            {/* No telemóvel numa só fila que desliza (partia em três linhas). */}
            <TabsList className="mb-8 flex h-auto w-full justify-start gap-1 overflow-x-auto scrollbar-none sm:w-auto sm:flex-wrap [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="details"><BookOpen className="h-4 w-4 mr-1.5" />Detalhes</TabsTrigger>
              {hasReadingSample(product) && (
                <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1.5" />Pré-visualização</TabsTrigger>
              )}
              {temVideo && (
                <TabsTrigger value="video"><Youtube className="h-4 w-4 mr-1.5" />Vídeo</TabsTrigger>
              )}
              {(product.author_bio || product.author_photo) && (
                <TabsTrigger value="author"><User className="h-4 w-4 mr-1.5" />Sobre o Autor</TabsTrigger>
              )}
              {product.variants?.length > 1 && (
                <TabsTrigger value="versions"><Layers className="h-4 w-4 mr-1.5" />{variantNames(product.product_type, product.versions).many}</TabsTrigger>
              )}
              <TabsTrigger value="reviews"><MessageCircle className="h-4 w-4 mr-1.5" />Avaliações ({stats.total})</TabsTrigger>
              <TabsTrigger value="discussion"><MessagesSquare className="h-4 w-4 mr-1.5" />Discussão</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <div className="min-w-0">
                  {product.description ? (
                    <div className="prose max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} />
                  ) : (
                    <p className="text-muted-foreground">Sem descrição disponível.</p>
                  )}
                </div>

                {specs.length > 0 && (
                  <aside className="min-w-0">
                    <h3 className="mb-3 text-base font-semibold text-foreground">Características</h3>
                    <dl className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                      {specs.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                          <dt className="shrink-0 text-muted-foreground">{label}</dt>
                          <dd className="min-w-0 wrap-break-word text-right font-medium text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </aside>
                )}
              </div>
            </TabsContent>

            {temVideo && (
              <TabsContent value="video">
                <div className="max-w-3xl">
                  <p className="mb-4 text-sm text-muted-foreground">
                    A apresentação deste produto, pela livraria.
                  </p>
                  <ProductVideo url={product.video_url} title={product.title} />
                </div>
              </TabsContent>
            )}

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
                      <div key={i} className="rounded-xl overflow-hidden border shadow-xs bg-muted/30">
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
                      className={`text-left p-4 rounded-xl border cursor-pointer transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${selectedVariant?.id === v.id ? 'ring-2 ring-marca border-marca/40' : 'hover:border-marca/30'}`}
                      onClick={() => handleVariantSelect(v)}
                    >
                      <p className="font-semibold">{v.title}</p>
                      {v.format && <p className="text-sm text-muted-foreground">{v.format}</p>}
                      {v.isbn && <p className="text-xs font-mono text-muted-foreground mt-1">ISBN: {v.isbn}</p>}
                      <p className="text-primary font-bold mt-2">{v.sale_price_formatted || v.price_formatted}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.digital ? 'Edição digital — sem portes, na sua biblioteca' : v.inventory_quantity > 0 ? `${v.inventory_quantity} em stock` : 'Esgotado'}</p>
                    </button>
                  ))}
                </div>
              </TabsContent>
            )}

            {/* Conversa aberta sobre o livro, com respostas, citações e links (a comunidade, filtrada
                por este livro). As avaliações ficam no separador ao lado. */}
            <TabsContent value="discussion" className="mt-6 max-w-2xl">
              <CommunityFeed book={{ id: product.id, title: product.title }} />
            </TabsContent>

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
                  <div className="bg-card border p-6 rounded-2xl shadow-xs">
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
                          <p className="text-sm text-foreground wrap-break-word italic">"{userReview.comment}"</p>
                          {userReview.isVerified && (
                            <span className="inline-flex items-center gap-1 mt-3 text-[10px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded border border-green-100">
                              ★ Compra Verificada
                            </span>
                          )}
                          {userReview.hidden && (
                            <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              A equipa ocultou esta avaliação: só você a vê e não conta para a média do livro.
                            </p>
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
                          <div className="bg-amber-50/50 text-amber-800/80 text-xs p-2.5 rounded-lg border border-amber-100 leading-relaxed">
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
                            className="w-full text-sm p-3 rounded-xl border border-input focus:outline-hidden focus:ring-2 focus:ring-marca bg-background"
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
                        <div key={r.id} className="p-4 border rounded-xl bg-card hover:shadow-xs transition-all">
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
                                <p className="text-xs text-muted-foreground mt-0.5">
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

      {/* Primeiro o que é parecido com **este** livro (mesma colecção, autor, género), depois
          o que a pessoa já viu, e só no fim o catálogo a continuar. É a ordem de quem está em
          frente a uma prateleira: o livro ao lado, o que já tinha na mão, a loja toda. */}
      <RelatedProducts
        product={product}
        onCartOpen={() => setIsCartOpen(true)}
      />

      <RecentlyViewed currentId={product.id} />

      {/* Como nas grandes lojas: debaixo do livro, o catálogo continua enquanto se desce. */}
      <DiscoveryFeed excludeId={product.id} onCartOpen={() => setIsCartOpen(true)} title="Também lhe pode interessar" />

      <StickyBuyBar
        alvo={botoesCompra}
        price={price}
        originalPrice={originalPrice}
        onBuy={handleBuyNow}
        onAdd={product.purchasable ? () => handleAddToCart(false) : undefined}
        disabled={!canAddToCart || !product.purchasable}
        label={product.purchasable ? 'Comprar' : product.digital_fora_da_app ? 'Indisponível' : 'Esgotado'}
      />

      <Footer />
    </>
  );
}

export default ProductDetailPage;