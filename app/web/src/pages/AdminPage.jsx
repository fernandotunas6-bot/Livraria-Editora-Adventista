import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { PRODUCT_TYPES, looksLikeProductCode, normalizeProductCode, orderItemTitle, productType, productTypeLabel } from '@/lib/productTypes';
import { Helmet } from 'react-helmet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Loader2, PackageSearch, Image, ShoppingBag, ChevronDown, ChevronUp, Phone, MapPin, AlertTriangle, Search, Star, Copy } from 'lucide-react';
import { sanitizeBookPayload } from '@/lib/bookSave';
import { pbErrorMessage } from '@/lib/mediaSave';
import BookFormModal from '@/components/admin/BookFormModal';
import BooksBulkBar from '@/components/admin/BooksBulkBar';
import { Checkbox } from '@/components/ui/checkbox';
import { pageTitle } from '@/lib/brand';
import pb from '@/lib/dataClient';
import { supabase } from '@/lib/supabaseClient';
import { ordersWithBookQuery } from '@/lib/bookOrders';
import { setOrderDeliveryStatus } from '@/api/PlatformApi';
import OrderPaymentsPanel from '@/components/admin/OrderPaymentsPanel';
import OrderColporteurDelivery from '@/components/admin/OrderColporteurDelivery';
import DeliveredPaymentDialog from '@/components/admin/DeliveredPaymentDialog';
import { deliveryNeedsPayment, moneySummary } from '@/lib/payments';
import { useAuth } from '@/hooks/useAuth';
import SessionGate from '@/components/SessionGate.jsx';
import { sessionDecision } from '@/lib/authSession';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import AdminShell from '@/components/admin/shell/AdminShell';
import AdminOverview from '@/components/admin/AdminOverview';
import { adminPermissions, buildAdminNav, findView, resolveSection, resolveView } from '@/lib/adminSections';
import { useAdminLayout } from '@/hooks/useAdminLayout';
import { useSignal } from '@/hooks/useSignal';
import { mergeOrders, newestUpdated } from '@/lib/ordersSync';
import { loadStaffRoleName } from '@/lib/staffRolesApi';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getOrderStatusLabel, getOrderStatusColor, formatOrderNumber, ORDER_STATUS, PAYMENT_STATUS, getPaymentStatusLabel, getPaymentStatusColor, getDeliveryStatusLabel, getDeliveryStatusColor, orderPaymentLabel, orderDeliveryAddress, orderPickupStore, orderLocality } from '@/lib/orderUtils';
import { kwanza } from '@/lib/money';
import { orderUnits, unitsLabel } from '@/lib/customerOrders';
import { displayAngolaPhone } from '@/lib/angolaPhone';
import { getLowStockBooks } from '@/api/EcommerceApi';
import { isBookVisible, isSaleActive, isSaleScheduled } from '@/lib/pricing';
import { hasCover, hasDescription } from '@/lib/bookContent';
import { downloadReceipt, receiptBrand, receiptFromOrder } from '@/lib/receipt';
import { useSiteSettings } from '@/hooks/useSiteSettings';
// Pequeno: os gráficos (a parte pesada) carregam lá dentro, só quando se abre a secção.
import OrdersReportSection from '@/components/admin/OrdersReportSection';

const CollectionsTab = lazy(() => import('@/components/admin/CollectionsTab'));
const SlidesTab = lazy(() => import('@/components/admin/SlidesTab'));
const SettingsTab = lazy(() => import('@/components/admin/SettingsTab'));
const UsersTab = lazy(() => import('@/components/admin/UsersTab'));
const PaymentsTab = lazy(() => import('@/components/admin/PaymentsTab'));
const AppsTab = lazy(() => import('@/components/admin/AppsTab'));
const SecurityLogTab = lazy(() => import('@/components/admin/SecurityLogTab'));
const PaymentsReportTab = lazy(() => import('@/components/admin/PaymentsReportTab'));
const StoresTab = lazy(() => import('@/components/admin/StoresTab'));
const CommunityTab = lazy(() => import('@/components/admin/CommunityTab'));
const DownloadsTab = lazy(() => import('@/components/admin/DownloadsTab'));
const NoticesTab = lazy(() => import('@/components/admin/NoticesTab'));
const ReleasesTab = lazy(() => import('@/components/admin/ReleasesTab'));
const ContactsManager = lazy(() => import('@/components/ContactsManager'));
const SupportCenter = lazy(() => import('@/components/SupportCenter'));
const VendasHuamboTab = lazy(() => import('@/components/admin/VendasHuamboTab'));
const OrderWatchPanel = lazy(() => import('@/components/admin/OrderWatchPanel'));
const OpsTeamsPanel = lazy(() => import('@/components/admin/OpsTeamsPanel'));
const StaffAlertBar = lazy(() => import('@/components/admin/StaffAlertBar'));
const ChurchRegistryTab = lazy(() => import('@/components/admin/igreja/ChurchRegistryTab'));
const ColportagemTab = lazy(() => import('@/components/admin/colportagem/ColportagemTab'));
const ProducaoTab = lazy(() => import('@/components/admin/producao/ProducaoTab'));
const FuncionariosTab = lazy(() => import('@/components/admin/funcionarios/FuncionariosTab'));
const FinanceTab = lazy(() => import('@/components/admin/FinanceTab'));

// Colunas das encomendas para a lista e os relatórios. Fica de fora o que é grande e
// só serve numa encomenda à vez: as duas assinaturas em base64 (até 200 KB e 600 KB
// cada) e a linha temporal. Com `select *` o painel descarregava tudo isso de todas as
// encomendas a cada abertura.
// Filtros da lista de produtos que o endereço pode trazer (?filtro=…).
const BOOK_FILTERS = ['featured', 'low_stock', 'no_cover', 'no_description', 'hidden', 'promo'];

const ORDER_LIST_FIELDS = [
  'id', 'order_number', 'created', 'updated', 'customer_email', 'customer_name', 'phone',
  'items', 'total', 'shipping_cost', 'status', 'payment_status', 'amount_paid', 'amount_refunded', 'paid_at', 'payment_method',
  'delivery_route', 'delivery_colporteur_id',
  'payment_method_code', 'payment_method_name', 'payment_reference',
  'delivery_status', 'tracking_number', 'carrier', 'estimated_delivery',
  'address', 'city', 'notes', 'order_type', 'sale_channel', 'shipping_method', 'pickup_store',
  'delivery_province', 'delivery_municipality', 'delivery_locality', 'delivery_street',
  'delivery_reference', 'delivery_address_full', 'delivery_relative_name', 'delivery_relative_phone',
  'delivery_recipient_name', 'delivery_confirmed_at', 'delivery_confirmed_by', 'checkout_signature_at',
  'customer_confirmed_at', 'customer_feedback',
];

/**
 * Uma secção do painel: só monta quando é a aberta. Fora do componente da página de propósito —
 * definida lá dentro seria um componente novo a cada pintura, e o React desmontava e voltava a
 * montar o conteúdo (perdendo o que se estava a escrever) sempre que a página actualizasse.
 */
function AdminSection({ active, value, children }) {
  return active === value ? children : null;
}

const AdminPage = () => {
  const { user, ready, isAuthed, isAdmin, canAccessAdmin, hasPermission, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings: siteSettings } = useSiteSettings();

  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [duplicatingBook, setDuplicatingBook] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState([]);
  // Tipo de um produto novo (o "Adicionar produto" pergunta qual).
  const [newProductType, setNewProductType] = useState('livro');

  // Os filtros das listas ficam no endereço (/admin?tab=orders&estado=pending&encomenda=LA-…):
  // recarregar, voltar atrás ou mandar a ligação a um colega abre a lista como estava. Valores
  // desconhecidos no endereço valem "todos". Uma só escrita por acção (o `setSearchParams` não
  // junta chamadas seguidas: a segunda apagava a primeira).
  // Filtros substituem a entrada do histórico (escrever na procura não enche o «voltar»); mudar de
  // secção ou de vista acrescenta uma, para o «voltar» do navegador (e do telemóvel) regressar ao
  // contexto anterior em vez de sair do painel.
  const updateParams = useCallback((patch, { replace = true } = {}) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    return next;
  }, { replace }), [setSearchParams]);
  const param = (key, allowed) => {
    const v = searchParams.get(key) || '';
    return !allowed || allowed.includes(v) ? v : '';
  };
  const bookSearch = param('produto');
  const setBookSearch = (v) => updateParams({ produto: v });
  const bookFilter = param('filtro', BOOK_FILTERS) || 'all';
  const setBookFilter = (v) => updateParams({ filtro: v });
  // Tipo de produto no catálogo ('all' ou um valor de PRODUCT_TYPES).
  const typeFilter = param('tipo', PRODUCT_TYPES.map((t) => t.value)) || 'all';
  const setTypeFilter = (v) => updateParams({ tipo: v });
  const orderFilter = param('estado', Object.keys(ORDER_STATUS)) || 'all';
  const setOrderFilter = (v) => updateParams({ estado: v });
  const orderSearch = param('encomenda');
  const setOrderSearch = (v) => updateParams({ encomenda: v });
  const paymentFilter = param('pagamento', Object.keys(PAYMENT_STATUS)) || 'all';
  const setPaymentFilter = (v) => updateParams({ pagamento: v });
  // Encomenda a marcar como entregue com dinheiro por receber (DeliveredPaymentDialog).
  const [deliveryDialog, setDeliveryDialog] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [lowStockBooks, setLowStockBooks] = useState([]);

  // `sessionDecision` garante a ordem: nada é decidido antes de se saber se há sessão.
  // Decidir antes disso expulsava para `/login` quem tinha sessão válida mas ainda não lida.
  const access = sessionDecision({ ready, isAuthed, allowed: canAccessAdmin });

  useEffect(() => {
    if (access === 'login') navigate('/login', { state: { from: '/admin' } });
    else if (access === 'forbidden') navigate('/profile');
  }, [access, navigate]);

  // As permissões e as secções vêm do registo central (lib/adminSections.js), que as duas
  // disposições do painel, a gaveta do telemóvel e a procura (Ctrl+K) partilham.
  const perms = adminPermissions({ isAdmin, hasPermission });
  const canManageCatalog = perms.catalog;
  const canManageOrders = perms.orders;
  const canManageSettings = perms.settings;
  const canManageUsers = perms.users;
  const canManagePayments = perms.payments;
  // Confirmar dinheiro é separado de gerir os métodos (IBAN, links): migração pagamentos_registados.
  const canConfirmPayments = perms.confirmPayments;
  const canManageMarketing = perms.marketing;
  // Quem gere colportores também precisa de ver as igrejas e os pastores (só leitura).
  const canSeeChurchRegistry = perms.churchRegistry;
  const canManageColporteurs = perms.colporteurs;
  // Separadores no topo ou barra lateral: escolha de cada pessoa, neste aparelho.
  const { layout, setLayout, sidebarOpen, setSidebarOpen } = useAdminLayout(user?.id);
  // O cargo de quem está no painel (Caixa, Atendimento…), no menu da conta.
  const [myCargo, setMyCargo] = useState(null);
  useEffect(() => {
    if (!user?.id || isAdmin) { setMyCargo(null); return undefined; }
    let alive = true;
    loadStaffRoleName(user.id).then((name) => { if (alive) setMyCargo(name); }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id, isAdmin]);

  // Só a primeira carga mostra a espera; as seguintes (depois de gravar, ou a actualização
  // automática) trocam os dados por baixo, sem a lista piscar nem perder o lugar.
  const loadedOnce = useRef(false);
  // A data de actualização mais recente das encomendas que o painel já tem (relógio do servidor):
  // a partir dela, cada actualização pede só as que mudaram.
  const ordersSince = useRef(null);
  const loadOrders = useCallback(async ({ incremental = false } = {}) => {
    if (!canManageOrders) return [];
    const since = incremental ? ordersSince.current : null;
    const list = await pb.collection('orders').getFullList({
      sort: '-created', fields: ORDER_LIST_FIELDS.join(','),
      ...(since ? { filter: `updated >= "${since}"` } : {}),
    });
    ordersSince.current = newestUpdated(list, ordersSince.current);
    if (since) setOrders((prev) => mergeOrders(prev, list));
    else setOrders(list);
    return list;
  }, [canManageOrders]);

  const loadCatalog = useCallback(async () => {
    const [booksList, lowStock] = await Promise.all([
      pb.collection('stock_books').getFullList({ sort: '-featured,title' }),
      canManageCatalog ? getLowStockBooks() : [],
    ]);
    setBooks(booksList);
    setLowStockBooks(lowStock);
  }, [canManageCatalog]);

  const loadAll = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      // Os slides carrega-os o próprio separador (SlidesTab); aqui só serviam para o número no
      // nome do separador, que saiu.
      await Promise.all([loadCatalog(), loadOrders().catch(() => setOrders([]))]);
    } catch (err) {
      console.error(err);
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [loadCatalog, loadOrders]);

  // Tempo real: a base de dados avisa quando mudam encomendas ou o catálogo, e o painel pede só
  // isso — as encomendas que mudaram desde a última vez e/ou o catálogo (uma encomenda nova manda
  // os dois sinais quase juntos: o stock desceu). Ver lib/realtimeSignals.js. Enquanto actualiza,
  // o ícone da barra do topo roda, pelo menos 0,7 s para se ver.
  const syncRef = useRef(null);
  const [signalLoads, setSignalLoads] = useState(0);
  const live = useSignal('painel', ['orders', 'catalogo'], (_event, _payload, signals) => {
    const events = new Set(signals.map((s) => s.event));
    const started = Date.now();
    setSignalLoads((n) => n + 1);
    Promise.all([
      events.has('catalogo') ? loadCatalog() : null,
      events.has('orders') ? loadOrders({ incremental: true }) : null,
    ])
      .then(() => syncRef.current?.markSynced())
      .catch((err) => console.error(err))
      .finally(() => setTimeout(() => setSignalLoads((n) => Math.max(0, n - 1)), Math.max(0, 700 - (Date.now() - started))));
  }, { enabled: access === 'allow' });

  // Sincronizado: encomendas, produtos e stock actualizam-se sozinhos — na hora, pelos sinais em
  // tempo real; e por consulta completa de 5 em 5 minutos com o canal ligado (de minuto a minuto
  // sem ele), ao voltar ao painel e quando a rede volta. Os números ao lado das secções e o Início
  // acompanham, sem recarregar a página.
  const sync = useAutoRefresh(loadAll, { intervalMs: live ? 5 * 60_000 : 60_000, enabled: access === 'allow' });
  syncRef.current = sync;
  const { markSynced } = sync;
  // A barra do topo diz «Em tempo real» com o canal do painel ligado, e o ícone roda enquanto
  // actualiza (pela consulta ou por um sinal).
  const syncState = { ...sync, syncing: sync.syncing || signalLoads > 0, realtime: live ? 'live' : 'off' };
  useEffect(() => { loadAll().then(markSynced); }, [loadAll, markSynced]);

  const handleSaveBook = async (data) => {
    setSaving(true);
    try {
      const payload = sanitizeBookPayload(data);
      if (!payload.title?.trim()) {
        throw new Error('O título do livro é obrigatório.');
      }
      // O checkout no servidor recusa livros sem preço.
      if (!(payload.price > 0)) {
        throw new Error('Indique um preço maior que zero; sem preço o livro não pode ser comprado.');
      }
      if (payload.sale_price && payload.sale_price >= payload.price) {
        throw new Error('O preço promocional tem de ser menor do que o preço normal.');
      }
      if (payload.sale_starts_at && payload.sale_ends_at && payload.sale_ends_at <= payload.sale_starts_at) {
        throw new Error('A promoção tem de terminar depois de começar.');
      }
      if (editingBook) {
        // Vídeo apagado no formulário: o `sanitizeBookPayload` não envia o campo quando está
        // vazio (ver lá o porquê), por isso é aqui que se diz explicitamente para o limpar.
        if (editingBook.video_url && !payload.video_url) payload.video_url = '';
        // O formulário leva o stock que leu ao abrir. Uma venda feita entretanto (o checkout
        // desconta-o na base de dados) era apagada ao gravar outra coisa qualquer, como a
        // descrição. Stock não mexido não vai no pedido; stock mexido confere primeiro o actual.
        const openedWith = Number(editingBook.stock) || 0;
        if (payload.stock === openedWith) {
          delete payload.stock;
        } else {
          const { stock: current } = await pb.collection('stock_books').getOne(editingBook.id, { fields: 'id,stock' });
          if ((Number(current) || 0) !== openedWith
            && !confirm(`O stock deste livro mudou desde que abriu o formulário (era ${openedWith}, agora é ${Number(current) || 0} — provavelmente uma venda).\n\nGravar ${payload.stock} na mesma?`)) {
            return;
          }
        }
        await pb.collection('stock_books').update(editingBook.id, payload);
        toast({ title: 'Livro atualizado', description: `Código: ${payload.book_code || editingBook.book_code}` });
      } else {
        const created = await pb.collection('stock_books').create(payload);
        toast({ title: 'Livro publicado', description: `ID: ${created.id.slice(0, 8)}… · Código: ${created.book_code}` });
      }
      setShowBookForm(false);
      setEditingBook(null);
      setDuplicatingBook(null);
      loadAll();
    } catch (err) {
      const msg = err?.data?.data?.code === '23505'
        ? `Já existe outro livro com o código ${data.book_code}. Use um código diferente.`
        : pbErrorMessage(err);
      toast({ variant: 'destructive', title: 'Erro ao guardar livro', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const openEditBook = (b) => {
    setDuplicatingBook(null);
    setEditingBook(b);
    setShowBookForm(true);
  };

  const openDuplicateBook = (b) => {
    setEditingBook(null);
    setDuplicatingBook(b);
    setShowBookForm(true);
  };

  const handleDeleteBook = async (b) => {
    // As encomendas guardam uma cópia dos itens; eliminar o livro não as apaga, mas convém avisar.
    const { count, error: countError } = await ordersWithBookQuery(supabase, b.id);
    const warning = count
      ? `\n\nEste livro aparece em ${count} encomenda(s). As encomendas mantêm o título, mas o livro desaparece da loja, das listas de desejos e das avaliações. Para o tirar só de venda, ponha o stock a 0.`
      : countError
        ? '\n\nNão foi possível confirmar se este livro aparece em encomendas. Para o tirar só de venda, ponha o stock a 0.'
        : '';
    if (!confirm(`Eliminar "${b.title}"? Esta acção não pode ser desfeita.${warning}`)) return;
    try {
      await pb.collection('stock_books').delete(b.id);
      toast({ title: 'Livro eliminado' });
      loadAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao eliminar', description: pbErrorMessage(err) });
    }
  };

  const toggleFeatured = async (b) => {
    const featured = !b.featured;
    setBooks((prev) => prev.map((x) => (x.id === b.id ? { ...x, featured } : x)));
    try {
      await pb.collection('stock_books').update(b.id, { featured });
      toast({ title: featured ? 'Livro destacado na homepage' : 'Destaque removido' });
    } catch (err) {
      setBooks((prev) => prev.map((x) => (x.id === b.id ? { ...x, featured: !featured } : x)));
      toast({ variant: 'destructive', title: 'Erro', description: pbErrorMessage(err) });
    }
  };

  const filteredBooks = books.filter((b) => {
    if (typeFilter !== 'all' && (b.product_type || 'livro') !== typeFilter) return false;
    if (bookFilter === 'featured' && !b.featured) return false;
    if (bookFilter === 'low_stock' && !(b.stock_alert || b.stock_low)) return false;
    if (bookFilter === 'no_cover' && hasCover(b)) return false;
    if (bookFilter === 'no_description' && hasDescription(b)) return false;
    if (bookFilter === 'hidden' && isBookVisible(b)) return false;
    if (bookFilter === 'promo' && !(isSaleActive(b) || isSaleScheduled(b))) return false;
    const q = bookSearch.trim().toLowerCase();
    if (!q) return true;
    // Código escrito de qualquer forma ("liv63", "UNI-4") encontra o produto exacto.
    if (looksLikeProductCode(q)) return normalizeProductCode(q) === normalizeProductCode(b.book_code);
    return [b.title, b.author, b.book_code, b.sku, b.isbn, b.genre, productTypeLabel(b.product_type)].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const handleOrderStatus = async (order, newStatus) => {
    // Cancelar devolve o stock à loja (trigger orders_before_update, uma só vez). Reabrir
    // depois não volta a descontá-lo, e a loja ficava a vender livros que já saíram — por
    // isso cancelar pede confirmação e uma encomenda cancelada não se reabre daqui.
    if (order.status === 'cancelled') {
      toast({ variant: 'destructive', title: 'Encomenda cancelada', description: 'O stock já foi devolvido. Para voltar a vender estes livros a este cliente, registe uma encomenda nova.' });
      return;
    }
    if (newStatus === 'cancelled'
      && !confirm(`Cancelar a encomenda ${formatOrderNumber(order)}?\n\nO stock dos livros volta à loja e a encomenda não pode ser reaberta.`)) return;
    try {
      // Ao cancelar, o trigger orders_before_update devolve o stock (uma só vez, via stock_restored).
      // O cancelamento vai pela API, que também avisa o cliente (email, WhatsApp, push).
      if (newStatus === 'cancelled') await setOrderDeliveryStatus(order.id, 'cancelled');
      else await pb.collection('orders').update(order.id, { status: newStatus });
      toast({ title: 'Estado atualizado', description: getOrderStatusLabel(newStatus) });
      loadAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const handleDeliveryStatus = async (order, deliveryStatus, extra) => {
    if (order.delivery_status === deliveryStatus) return;
    // Entregar com dinheiro por receber pede quanto se recebeu, ou o motivo (o servidor recusa
    // sem um dos dois): foi o que faltou à encomenda de 245 000 Kz entregue por pagar.
    if (deliveryStatus === 'delivered' && !extra && deliveryNeedsPayment(order)) {
      setDeliveryDialog(order);
      return;
    }
    try {
      const res = await setOrderDeliveryStatus(order.id, deliveryStatus, extra);
      toast({
        title: 'Estado de entrega actualizado',
        description: [res?.email_sent ? 'Cliente avisado por email' : '', res?.notice || ''].filter(Boolean).join(' · ') || undefined,
        duration: res?.notice ? 12000 : 5000,
      });
      setDeliveryDialog(null);
      loadAll();
    } catch (err) {
      // A lista estava desactualizada e o servidor diz que falta o pagamento: pergunta-o.
      if (err?.status === 409 && deliveryStatus === 'delivered' && !extra) {
        setDeliveryDialog(order);
        return;
      }
      if (extra) throw err; // o diálogo mostra o erro
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const updateTracking = async (order, tracking, carrier, estimatedDelivery) => {
    // estimated_delivery é timestamptz: vazio tem de ir como null ('' faz o Postgres recusar o pedido todo).
    const day = (v) => (v ? String(v).slice(0, 10) : '');
    const data = {
      tracking_number: (tracking || '').trim(),
      carrier: (carrier || '').trim(),
      estimated_delivery: estimatedDelivery ? estimatedDelivery : null,
    };
    const unchanged = data.tracking_number === (order.tracking_number || '')
      && data.carrier === (order.carrier || '')
      && day(data.estimated_delivery) === day(order.estimated_delivery);
    if (unchanged) return;
    try {
      await pb.collection('orders').update(order.id, data);
      toast({ title: 'Tracking actualizado' });
      loadAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const getOrderChannelLabel = (o) => {
    if (o.order_type === 'whatsapp_order' || o.sale_channel === 'whatsapp') return 'WhatsApp';
    if (o.order_type === 'online_purchase' || o.sale_channel === 'web_purchase') return 'Compra Online';
    return o.sale_channel || o.order_type || '—';
  };

  // A assinatura do comprador não vem na lista (é grande); busca-se só desta encomenda.
  const handleReceipt = async (order) => {
    let full = order;
    try {
      const { checkout_signature_data } = await pb.collection('orders')
        .getOne(order.id, { fields: 'id,checkout_signature_data' });
      full = { ...order, checkout_signature_data };
    } catch (err) {
      console.error('Assinatura do recibo:', err);
      toast({ title: 'Recibo sem assinatura', description: 'Não foi possível ler a assinatura desta encomenda.' });
    }
    downloadReceipt(receiptFromOrder(full), receiptBrand(siteSettings));
  };

  const filteredOrders = orders.filter((o) => {
    if (orderFilter !== 'all' && o.status !== orderFilter) return false;
    if (paymentFilter !== 'all' && (o.payment_status || 'pending') !== paymentFilter) return false;
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      // Também pelos produtos da encomenda: código ("LIV-063", "liv63") ou nome.
      const items = Array.isArray(o.items) ? o.items : [];
      if (looksLikeProductCode(q)) {
        const code = normalizeProductCode(q);
        if (!items.some((it) => normalizeProductCode(it.book_code || '') === code)) return false;
        return true;
      }
      const hay = [o.order_number, o.id, o.customer_name, o.customer_email, o.phone, o.payment_reference, ...items.map((it) => `${it.book_code || ''} ${it.title || ''}`)].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  // Pagamentos por P2P/transferência que o cliente diz ter feito e falta confirmar.
  const awaitingPaymentCount = orders.filter((o) => o.payment_status === 'awaiting_confirmation' && o.status !== 'cancelled').length;
  const paymentLabelOf = orderPaymentLabel;
  // Receita é o que entrou (pago menos reembolsado), a mesma definição dos relatórios e do
  // resumo diário (lib/payments.js · moneySummary); o resto das encomendas activas é por receber.
  const money = moneySummary(orders);

  const bookMetrics = [
    // `filter`: carregar no indicador mostra a lista correspondente (o mesmo critério do filtro).
    { label: 'Produtos no catálogo', value: books.length, icon: PackageSearch, filter: 'all' },
    { label: 'Com stock', value: books.filter((book) => Number(book.stock) > 0).length, icon: ShoppingBag },
    { label: 'Em destaque', value: books.filter((book) => book.featured).length, icon: Star, filter: 'featured' },
    { label: 'Sem capa', value: books.filter((book) => !hasCover(book)).length, icon: Image, filter: 'no_cover' },
    { label: 'Sem descrição', value: books.filter((book) => !hasDescription(book)).length, icon: AlertTriangle, filter: 'no_description' },
  ];

  // O que pede acção, ao lado do nome da secção (não totais): encomendas por confirmar, stock
  // a acabar, pagamentos que o cliente diz ter feito.
  const nav = buildAdminNav(perms, {
    orders: { count: pendingCount, tone: 'info' },
    books: { count: lowStockBooks.length, tone: 'warning' },
    'pagamentos-caixa': { count: awaitingPaymentCount, tone: 'warning' },
  });
  // A secção fica no endereço (/admin?tab=orders): os avisos, os emails e outras páginas
  // ligam directamente a uma. Sem secção, ou sem acesso a ela, abre o Início.
  const activeTab = resolveSection(nav, searchParams.get('tab'));
  const currentSection = nav.flatMap((g) => g.items).find((i) => i.id === activeTab);
  // A vista da secção (Colportagem › Contas) fica em `vista`: /admin?tab=colportagem&vista=contas.
  // Sem vista, ou sem acesso a ela, a de omissão. `viewExplicit`: estava no endereço.
  const requestedView = searchParams.get('vista');
  const activeView = resolveView(currentSection, requestedView);
  const viewExplicit = !!findView(currentSection, requestedView);
  // A última vista aberta em cada secção, nesta visita: voltar à Colportagem volta às Contas.
  const lastViews = useRef({});
  if (activeView && viewExplicit) lastViews.current[activeTab] = activeView;
  const attentionCount = canManageOrders ? pendingCount + awaitingPaymentCount : 0;
  // Abrir as encomendas já filtradas (do Início e da procura).
  const openOrders = ({ status = 'all', payment = 'all', search = '' } = {}) => {
    updateParams({ tab: 'orders', vista: null, estado: status, pagamento: payment, encomenda: search }, { replace: activeTab === 'orders' });
  };
  const openProducts = ({ filter = 'all', search = '' } = {}) => {
    updateParams({ tab: 'books', vista: null, filtro: filter, tipo: null, produto: search }, { replace: activeTab === 'books' });
  };
  // Ir para uma secção (e vista). Sem vista pedida, a última aberta nessa secção; a vista é
  // própria de cada secção, por isso a de outra não fica no endereço.
  const goToSection = (id, opts = {}) => {
    if (id === 'books' && opts.filter) { openProducts({ filter: opts.filter }); return; }
    const view = opts.view !== undefined ? opts.view : (lastViews.current[id] ?? null);
    if (id === activeTab && (view || null) === (requestedView || null)) return;
    updateParams({ tab: id, vista: view }, { replace: !!opts.replace });
  };
  const setActiveTab = (id) => goToSection(id);
  const addProduct = (type = 'livro') => {
    setNewProductType(type);
    setEditingBook(null);
    setDuplicatingBook(null);
    setShowBookForm(true);
  };
  const spinner = <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  // Acções da secção, à direita do título (o mesmo sítio em todas).
  const sectionActions = activeTab === 'books' && canManageCatalog ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="btn-primary h-10 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar produto <ChevronDown className="h-4 w-4 opacity-80" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo de produto</DropdownMenuLabel>
        {PRODUCT_TYPES.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => addProduct(t.value)} className="justify-between">
            {t.label} <span className="font-mono text-xs text-muted-foreground">{t.prefix}-</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  if (access === 'wait') return <SessionGate />;
  if (access !== 'allow') return null;

  return (
    <>
      {/* O separador do navegador diz a secção e quantas encomendas pedem acção: com o painel
          aberto noutro separador, vê-se de relance. */}
      <Helmet><title>{pageTitle(`${attentionCount ? `(${attentionCount}) ` : ''}${activeView ? `${findView(currentSection, activeView)?.label} · ` : ''}${currentSection?.label || 'Painel'} · Painel`)}</title></Helmet>
      <AdminShell
        sync={syncState}
        nav={nav}
        active={activeTab}
        view={activeView}
        viewExplicit={viewExplicit}
        onNavigate={goToSection}
        layout={layout}
        onLayoutChange={setLayout}
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        user={user}
        roleLabel={isAdmin ? 'Administrador' : myCargo ? `Gestor · ${myCargo}` : 'Gestor'}
        onProfile={() => navigate('/profile')}
        onLogout={() => { logout(); navigate('/'); }}
        actions={sectionActions}
        onSearchOrders={canManageOrders ? (q) => openOrders({ search: q }) : undefined}
        onSearchProducts={canManageCatalog ? (q) => openProducts({ search: q }) : undefined}
        findProduct={canManageCatalog ? (code) => books.find((b) => normalizeProductCode(b.book_code) === code) || null : undefined}
        onEditProduct={canManageCatalog ? (b) => { setActiveTab('books'); openEditBook(b); } : undefined}
        alerts={canManageOrders ? (
          // Encomendas novas e alertas urgentes, com som, para quem está na loja com o painel aberto.
          <Suspense fallback={null}>
            <StaffAlertBar
              onOpen={(alert) => {
                if (alert.thread_id) setActiveTab('support');
                else setActiveTab('acompanhamento');
              }}
            />
          </Suspense>
        ) : null}
      >
            <AdminSection active={activeTab} value="inicio">
              <AdminOverview
                userName={user?.name}
                perms={perms}
                orders={orders}
                books={books}
                lowStockBooks={lowStockBooks}
                loading={loading}
                onNavigate={goToSection}
                onOpenOrders={openOrders}
                onEditBook={openEditBook}
                onAddProduct={() => addProduct('livro')}
              />
            </AdminSection>

            {canManageSettings && (
              <AdminSection active={activeTab} value="settings">
                <Suspense fallback={spinner}>
                  <SettingsTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageUsers && (
              <AdminSection active={activeTab} value="users">
                <Suspense fallback={spinner}>
                  <UsersTab />
                </Suspense>
              </AdminSection>
            )}
            {canManagePayments && (
              <AdminSection active={activeTab} value="payments">
                <Suspense fallback={spinner}>
                  <PaymentsTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageSettings && (
              <AdminSection active={activeTab} value="stores">
                <Suspense fallback={spinner}>
                  <StoresTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageMarketing && (
              <AdminSection active={activeTab} value="contacts">
                <Suspense fallback={spinner}>
                  <ContactsManager />
                </Suspense>
              </AdminSection>
            )}
            {canManageOrders && (
              <AdminSection active={activeTab} value="support">
                <Suspense fallback={spinner}>
                  <SupportCenter />
                </Suspense>
              </AdminSection>
            )}
            {(canManageSettings || canManageMarketing) && (
              <AdminSection active={activeTab} value="notices">
                <Suspense fallback={spinner}>
                  <NoticesTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageSettings && (
              <AdminSection active={activeTab} value="versoes">
                <Suspense fallback={spinner}>
                  <ReleasesTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageCatalog && (
              <AdminSection active={activeTab} value="downloads">
                <Suspense fallback={spinner}>
                  <DownloadsTab books={books} />
                </Suspense>
              </AdminSection>
            )}
            {canManageCatalog && (
              <AdminSection active={activeTab} value="community">
                <Suspense fallback={spinner}>
                  <CommunityTab />
                </Suspense>
              </AdminSection>
            )}
            {isAdmin && (
              <AdminSection active={activeTab} value="apps">
                <Suspense fallback={spinner}>
                  <AppsTab />
                </Suspense>
              </AdminSection>
            )}
            {(perms.reports || canConfirmPayments) && (
              <AdminSection active={activeTab} value="pagamentos-caixa">
                <Suspense fallback={spinner}>
                  <PaymentsReportTab canConfirm={canConfirmPayments} currentUserName={user?.name || user?.email || ''} />
                </Suspense>
              </AdminSection>
            )}
            {isAdmin && (
              <AdminSection active={activeTab} value="seguranca">
                <Suspense fallback={spinner}>
                  <SecurityLogTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageColporteurs && (
              <AdminSection active={activeTab} value="colportagem">
                <Suspense fallback={spinner}>
                  <ColportagemTab />
                </Suspense>
              </AdminSection>
            )}
            {canSeeChurchRegistry && (
              <AdminSection active={activeTab} value="igreja">
                <Suspense fallback={spinner}>
                  <ChurchRegistryTab />
                </Suspense>
              </AdminSection>
            )}
            {/* Produção da Editora, funcionários e saídas de dinheiro (migrações funcionarios, producao
                e saidas): as mesmas regras de lib/adminSections.js. */}
            {(perms.production || perms.finance) && (
              <AdminSection active={activeTab} value="producao">
                <Suspense fallback={spinner}>
                  <ProducaoTab />
                </Suspense>
              </AdminSection>
            )}
            {(perms.staff || perms.finance) && (
              <AdminSection active={activeTab} value="funcionarios">
                <Suspense fallback={spinner}>
                  <FuncionariosTab />
                </Suspense>
              </AdminSection>
            )}
            {perms.finance && (
              <AdminSection active={activeTab} value="financas">
                <Suspense fallback={spinner}>
                  <FinanceTab />
                </Suspense>
              </AdminSection>
            )}
            {(canManageUsers || canManageOrders) && (
              <AdminSection active={activeTab} value="equipas">
                <Suspense fallback={spinner}>
                  <OpsTeamsPanel canEdit={canManageUsers} />
                </Suspense>
              </AdminSection>
            )}
            {canManageOrders && (
              <AdminSection active={activeTab} value="acompanhamento">
                <Suspense fallback={spinner}>
                  <OrderWatchPanel onOpenOrder={(ref) => openOrders({ search: ref })} />
                </Suspense>
              </AdminSection>
            )}
            {canAccessAdmin && (
              <AdminSection active={activeTab} value="vendas-huambo">
                <Suspense fallback={spinner}>
                  <VendasHuamboTab />
                </Suspense>
              </AdminSection>
            )}
            {canManageCatalog && (
              <AdminSection active={activeTab} value="collections">
                <Suspense fallback={spinner}>
                  <CollectionsTab books={books} onBooksChange={loadAll} />
                </Suspense>
              </AdminSection>
            )}

            {/* Produtos, slider e encomendas usam os dados que a página carrega; enquanto chegam, o
                indicador de espera só nessas secções. */}
            {loading ? (
              ['books', 'orders'].includes(activeTab) ? spinner : null
            ) : (
              <>
                {canManageCatalog && (
                <AdminSection active={activeTab} value="books">
                  {/* Stock a acabar: aqui e no Início (antes ficava por cima de todas as secções). */}
                  {lowStockBooks.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-50/80 px-4 py-3 text-sm dark:bg-amber-950/20">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
                        <strong className="font-semibold">{lowStockBooks.length} produto{lowStockBooks.length !== 1 ? 's' : ''}</strong> a precisar de reposição
                        {lowStockBooks.length <= 3 && <>: {lowStockBooks.map((b) => b.title).join(', ')}</>}.
                      </span>
                      {bookFilter !== 'low_stock' ? (
                        <Button size="sm" variant="outline" className="h-8 bg-background" onClick={() => setBookFilter('low_stock')}>Mostrar só esses</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 bg-background" onClick={() => setBookFilter('all')}>Mostrar todos</Button>
                      )}
                    </div>
                  )}
                  {/* Tipos de produto: separadores com contagem; os tipos sem produtos ficam de fora. */}
                  <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por tipo de produto">
                    {[{ value: 'all', plural: 'Todos', prefix: '' }, ...PRODUCT_TYPES].map((t) => {
                      const count = t.value === 'all' ? books.length : books.filter((b) => (b.product_type || 'livro') === t.value).length;
                      if (t.value !== 'all' && count === 0) return null;
                      const active = typeFilter === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setTypeFilter(t.value)}
                          aria-pressed={active}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/60'}`}
                        >
                          {t.plural} <span className={active ? undefined : 'text-muted-foreground'}>({count})</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6" aria-label="Estatísticas do catálogo">
                    {bookMetrics.map(({ label, value, icon: Icon, filter }) => {
                      const body = (
                        <>
                          <Icon className="h-4 w-4 text-muted-foreground mb-2" aria-hidden="true" />
                          <p className="text-2xl font-bold">{value}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </>
                      );
                      if (!filter) return <div key={label} className="rounded-xl border bg-card p-4">{body}</div>;
                      const active = bookFilter === filter;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setBookFilter(filter)}
                          aria-pressed={active}
                          title={`Mostrar: ${label.toLowerCase()}`}
                          className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${active && filter !== 'all' ? 'border-primary ring-1 ring-primary' : ''}`}
                        >
                          {body}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        value={bookSearch}
                        onChange={(e) => setBookSearch(e.target.value)}
                        placeholder="Pesquisar por nome, autor, código (ex.: UNI-004), SKU ou ISBN... (tecla /)"
                        aria-label="Pesquisar produtos"
                        className="pl-9"
                      />
                    </div>
                    <Select value={bookFilter} onValueChange={setBookFilter}>
                      <SelectTrigger className="sm:w-56" aria-label="Mostrar"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os produtos</SelectItem>
                        <SelectItem value="featured">Em destaque</SelectItem>
                        <SelectItem value="low_stock">Stock baixo ou esgotado</SelectItem>
                        <SelectItem value="no_cover">Sem capa</SelectItem>
                        <SelectItem value="no_description">Sem descrição</SelectItem>
                        <SelectItem value="hidden">Ocultos da loja</SelectItem>
                        <SelectItem value="promo">Em promoção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <BooksBulkBar
                    selected={books.filter((b) => selectedBookIds.includes(b.id))}
                    onClear={() => setSelectedBookIds([])}
                    onDone={() => { setSelectedBookIds([]); loadAll(); }}
                  />
                  <div className="bg-card border rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="pl-4 w-8">
                            <Checkbox
                              aria-label="Seleccionar todos os produtos visíveis na lista"
                              checked={filteredBooks.length > 0 && filteredBooks.every((b) => selectedBookIds.includes(b.id))}
                              onCheckedChange={(v) => setSelectedBookIds(v ? filteredBooks.map((b) => b.id) : [])}
                            />
                          </th>
                          <th className="p-4 w-14" />
                          <th className="p-4">Código</th>
                          <th className="p-4">Nome</th>
                          <th className="p-4 hidden lg:table-cell">Autor / Marca</th>
                          <th className="p-4 hidden md:table-cell">Categoria</th>
                          <th className="p-4">Preço</th>
                          <th className="p-4">Stock</th>
                          <th className="p-4 hidden sm:table-cell">Destaque</th>
                          <th className="p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {books.length === 0 && (
                          <tr>
                            <td colSpan={10} className="p-12 text-center text-muted-foreground">
                              <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-40" />
                              <p className="font-medium">Nenhum produto no catálogo</p>
                              <p className="text-sm mt-1">Clique em Adicionar e escolha o tipo de produto.</p>
                            </td>
                          </tr>
                        )}
                        {books.length > 0 && filteredBooks.length === 0 && (
                          <tr>
                            <td colSpan={10} className="p-10 text-center text-muted-foreground">Nenhum produto corresponde à pesquisa.</td>
                          </tr>
                        )}
                        {filteredBooks.map((b) => (
                          <tr key={b.id} className={`hover:bg-muted/30 ${selectedBookIds.includes(b.id) ? 'bg-marca/5' : ''}`}>
                            <td className="pl-4">
                              <Checkbox
                                aria-label={`Seleccionar ${b.title}`}
                                checked={selectedBookIds.includes(b.id)}
                                onCheckedChange={(v) => setSelectedBookIds((prev) => (v ? [...prev, b.id] : prev.filter((id) => id !== b.id)))}
                              />
                            </td>
                            <td className="p-4">
                              <div className="h-12 w-9 rounded overflow-hidden bg-muted border shrink-0">
                                {b.cover ? (
                                  <img src={b.cover} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground/40 text-[10px]">—</div>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <code className="text-xs font-mono text-primary">{b.book_code || '—'}</code>
                              {b.sku && b.sku !== b.book_code && (
                                <span className="block text-[10px] text-muted-foreground font-mono">{b.sku}</span>
                              )}
                            </td>
                            <td className="p-4 font-medium max-w-[180px]">
                              <span className="block truncate">{b.title}</span>
                              {(b.product_type || 'livro') !== 'livro' && (
                                <span className="inline-block mt-0.5 mr-1 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">{productTypeLabel(b.product_type)}</span>
                              )}
                              {Array.isArray(b.versions) && b.versions.length > 0 && (
                                <span className="inline-block mt-0.5 mr-1 text-[10px] text-muted-foreground" title={b.versions.map((v) => `${v.label || '?'}: ${v.stock ?? '—'}`).join(' · ')}>
                                  {b.versions.length} {productType(b.product_type).sized ? 'tamanhos' : 'variantes'}
                                </span>
                              )}
                              {!isBookVisible(b) && <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">Oculto</span>}
                            </td>
                            <td className="p-4 text-muted-foreground hidden lg:table-cell">{b.author}</td>
                            <td className="p-4 text-muted-foreground hidden md:table-cell">{b.genre}</td>
                            <td className="p-4 whitespace-nowrap">
                              {isSaleActive(b) ? (
                                <>
                                  <span className="text-rose-600 font-medium">{kwanza(b.sale_price)}</span>
                                  <span className="block text-[10px] text-muted-foreground line-through">{kwanza(b.price)}</span>
                                </>
                              ) : (
                                <>
                                  {kwanza(b.price)}
                                  {isSaleScheduled(b) && <span className="block text-[10px] text-rose-600">promoção agendada</span>}
                                </>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={Number(b.stock) <= 5 ? 'text-red-600 font-medium' : ''}>{b.stock}</span>
                              {(b.stock_alert || b.stock_low) && (
                                <span className="ml-1 inline-flex items-center text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                                  {b.stock_alert ? 'Esgotado' : 'Baixo'}
                                </span>
                              )}
                            </td>
                            <td className="p-4 hidden sm:table-cell">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleFeatured(b)}
                                title={b.featured ? 'Remover destaque' : 'Destacar na homepage'}
                                aria-label={b.featured ? `Remover o destaque de ${b.title}` : `Destacar ${b.title} na página inicial`}
                                aria-pressed={!!b.featured}
                              >
                                <Star className={`h-4 w-4 ${b.featured ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
                              </Button>
                            </td>
                            <td className="p-4 text-right whitespace-nowrap">
                              <Button variant="ghost" size="icon" onClick={() => openEditBook(b)} disabled={!canManageCatalog} title="Editar" aria-label={`Editar ${b.title}`}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => openDuplicateBook(b)} disabled={!canManageCatalog} title="Duplicar" aria-label={`Duplicar ${b.title}`}><Copy className="h-4 w-4" aria-hidden="true" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteBook(b)} disabled={!canManageCatalog} title="Eliminar" aria-label={`Eliminar ${b.title}`}><Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminSection>
                )}

                {canManageCatalog && (
                <AdminSection active={activeTab} value="slides">
                  <SlidesTab onChange={loadAll} />
                </AdminSection>
                )}

                {canManageOrders && (
                <AdminSection active={activeTab} value="orders">
                  <DeliveredPaymentDialog
                    order={deliveryDialog}
                    canConfirm={canConfirmPayments}
                    currentUserName={user?.name || user?.email || ''}
                    onCancel={() => setDeliveryDialog(null)}
                    onSubmit={(extra) => handleDeliveryStatus(deliveryDialog, 'delivered', extra)}
                  />

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setPaymentFilter(paymentFilter === 'awaiting_confirmation' ? 'all' : 'awaiting_confirmation')}
                      className={`text-left bg-card border rounded-xl p-4 transition-colors hover:border-orange-400 ${paymentFilter === 'awaiting_confirmation' ? 'border-orange-500 ring-1 ring-orange-500' : ''}`}
                      title="Mostrar só estas encomendas"
                    >
                      <p className="text-sm text-muted-foreground">Pagamentos por confirmar</p>
                      <p className={`text-2xl font-bold ${awaitingPaymentCount ? 'text-orange-600' : 'text-foreground'}`}>{awaitingPaymentCount}</p>
                    </button>
                    <div className="bg-card border rounded-xl p-4">
                      <p className="text-sm text-muted-foreground">Total Encomendas</p>
                      <p className="text-2xl font-bold">{orders.length}</p>
                    </div>
                    <div className="bg-card border rounded-xl p-4">
                      <p className="text-sm text-muted-foreground">Pendentes</p>
                      <p className={`text-2xl font-bold ${pendingCount ? 'text-amber-600' : 'text-foreground'}`}>{pendingCount}</p>
                    </div>
                    <div className="bg-card border rounded-xl p-4">
                      <p className="text-sm text-muted-foreground">Recebido</p>
                      <p className="text-2xl font-bold text-primary">{kwanza(money.received)}</p>
                      {money.receivable > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">+ {kwanza(money.receivable)} por receber</p>
                      )}
                      {money.refundDue > 0 && (
                        <p className="text-xs text-destructive mt-1">{kwanza(money.refundDue)} por reembolsar</p>
                      )}
                    </div>
                  </div>

                  {/* Estados com o número de cada um (um toque filtra; o título está no cabeçalho do
                      painel). Os filtros ficam no endereço da página. */}
                  <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                    {[['all', 'Todas', orders.length], ...Object.keys(ORDER_STATUS).map((st) => [st, getOrderStatusLabel(st), orders.filter((o) => o.status === st).length])]
                      .filter(([value, , count]) => value === 'all' || count > 0 || orderFilter === value)
                      .map(([value, label, count]) => {
                        const on = orderFilter === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setOrderFilter(value)}
                            aria-pressed={on}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/60'}`}
                          >
                            {label} <span className={on ? undefined : 'text-muted-foreground'}>{count}</span>
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {filteredOrders.length === orders.length ? `${orders.length} encomendas` : `${filteredOrders.length} de ${orders.length} encomendas`}
                      {(orderFilter !== 'all' || paymentFilter !== 'all' || orderSearch) && (
                        <>
                          {' · '}
                          <button type="button" className="font-medium text-primary hover:underline" onClick={() => openOrders()}>Limpar filtros</button>
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                          type="search"
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          placeholder="Cliente, email, nº, telefone ou código… (tecla /)"
                          aria-label="Procurar encomendas"
                          className="h-9 w-64 pl-8"
                        />
                      </div>
                      <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="w-[190px]" aria-label="Pagamento"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os pagamentos</SelectItem>
                        {['awaiting_confirmation', 'pending', 'partially_paid', 'paid', 'failed', 'refunded'].map((ps) => (
                          <SelectItem key={ps} value={ps}>{getPaymentStatusLabel(ps)}</SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {filteredOrders.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border rounded-xl bg-card">
                      <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>Nenhuma encomenda encontrada</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {filteredOrders.map((o) => (
                      <div key={o.id} className="bg-card border rounded-xl overflow-hidden">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={expandedOrder === o.id}
                          className="p-4 flex flex-wrap justify-between gap-3 cursor-pointer hover:bg-muted/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                            e.preventDefault();
                            setExpandedOrder(expandedOrder === o.id ? null : o.id);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold">{formatOrderNumber(o)}</p>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getOrderStatusColor(o.status)}`}>
                                {getOrderStatusLabel(o.status)}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${o.order_type === 'whatsapp_order' ? 'bg-green-100 text-green-800' : 'bg-marca/10 text-primary'}`}>
                                {getOrderChannelLabel(o)}
                              </span>
                              {o.delivery_status && o.status !== 'cancelled' && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${getDeliveryStatusColor(o.delivery_status)}`}>
                                  {getDeliveryStatusLabel(o.delivery_status)}
                                </span>
                              )}
                              {/* O pagamento à vista na lista: era preciso abrir a encomenda para saber se estava paga. */}
                              {o.status !== 'cancelled' && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${getPaymentStatusColor(o.payment_status || 'pending')}`}>
                                  {/* "Pendente" repetia a etiqueta do estado ao lado: no pagamento diz o que é. */}
                                  {{ paid: 'Paga', pending: 'Por pagar' }[o.payment_status || 'pending'] || getPaymentStatusLabel(o.payment_status)}
                                </span>
                              )}
                              {o.customer_feedback?.outcome === 'ok' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800" title={`Confirmado em ${new Date(o.customer_confirmed_at).toLocaleString('pt-AO')}`}>
                                  ✓ Cliente confirmou
                                </span>
                              )}
                              {o.customer_feedback?.outcome === 'problem' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800" title={o.customer_feedback.message}>
                                  ! Problema reportado
                                </span>
                              )}
                            </div>
                            {o.customer_feedback?.outcome === 'problem' && (
                              <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                                <strong>Cliente:</strong> {o.customer_feedback.message}
                                {o.customer_feedback.resolved_at
                                  ? <span className="ml-2 text-emerald-700">✓ Resolvido{o.customer_feedback.resolution ? `: ${o.customer_feedback.resolution}` : ''}</span>
                                  : <span className="ml-2 text-red-900">· por resolver (ver Acompanhamento)</span>}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                              {o.customer_name || 'Cliente'} · {o.customer_email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(o.created).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {' · '}{unitsLabel(orderUnits(o))}
                              {' · '}{o.shipping_method === 'pickup' ? `Levantamento${orderPickupStore(o) ? ` · ${orderPickupStore(o)}` : ''}` : `Entrega${orderLocality(o, ', ') ? ` · ${orderLocality(o, ', ')}` : ''}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-bold text-primary tabular-nums">{kwanza(o.total)}</p>
                            {expandedOrder === o.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {expandedOrder === o.id && (
                          <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                              {o.phone && (
                                <p className="flex items-center gap-2 text-muted-foreground">
                                  <Phone className="h-4 w-4" /> {displayAngolaPhone(o.phone)}
                                </p>
                              )}
                              {(o.delivery_relative_name || o.delivery_relative_phone) && (
                                <p className="flex items-start gap-2 text-muted-foreground text-sm">
                                  <Phone className="h-4 w-4 shrink-0 mt-0.5" />
                                  <span>
                                    Contacto próximo: <strong>{o.delivery_relative_name || '—'}</strong>
                                    {o.delivery_relative_phone && (
                                      <span className="block text-xs">{displayAngolaPhone(o.delivery_relative_phone)}</span>
                                    )}
                                  </span>
                                </p>
                              )}
                              {/* Só entregas: o levantamento aparece em "Envio", mais abaixo. Antes, a loja
                                  dos levantamentos saía aqui duas vezes ("Levantamento: X, X"). */}
                              {orderDeliveryAddress(o) && (
                                <p className="flex items-start gap-2 text-muted-foreground">
                                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                  <span>
                                    {orderDeliveryAddress(o)}
                                    {orderLocality(o) && (
                                      <span className="block text-xs mt-0.5">{orderLocality(o)}</span>
                                    )}
                                    {o.delivery_reference && <span className="block text-xs text-primary">Ref: {o.delivery_reference}</span>}
                                    {o.delivery_confirmed_at && (
                                      <span className="block text-xs text-green-700 mt-1">
                                        ✓ Confirmado por {o.delivery_confirmed_by || o.delivery_recipient_name} em {new Date(o.delivery_confirmed_at).toLocaleString('pt-AO')}
                                      </span>
                                    )}
                                  </span>
                                </p>
                              )}
                              {paymentLabelOf(o) && (
                                <p className="text-muted-foreground">
                                  Pagamento: <strong className="text-foreground">{paymentLabelOf(o)}</strong>
                                </p>
                              )}
                              {o.payment_reference && (
                                <p className="text-muted-foreground flex items-center gap-2">
                                  Referência: <code className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded">{o.payment_reference}</code>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => navigator.clipboard?.writeText(o.payment_reference).then(() => toast({ title: 'Referência copiada' }))}
                                  >
                                    copiar
                                  </button>
                                </p>
                              )}
                              {o.payment_status && (
                                <p className="text-muted-foreground">
                                  Estado pagamento: {getPaymentStatusLabel(o.payment_status)}
                                </p>
                              )}
                              {o.shipping_method && (
                                <p className="text-muted-foreground">
                                  Envio: {o.shipping_method === 'pickup' ? `Levantamento — ${orderPickupStore(o) || 'Loja'}` : o.shipping_method === 'express' ? 'Expressa' : 'Domicílio'}
                                </p>
                              )}
                            </div>

                            <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                              {(o.items || []).map((item, i) => (
                                <div key={i} className="flex justify-between gap-3 text-sm">
                                  <span>
                                    {item.quantity}× {orderItemTitle(item)}
                                    {item.book_code && <code className="ml-1 text-[10px] text-muted-foreground font-mono">{item.book_code}</code>}
                                  </span>
                                  <span className="font-medium text-right whitespace-nowrap">
                                    {kwanza(Number(item.price) * item.quantity)}
                                    {Number(item.list_price) > Number(item.price) && (
                                      <span className="block text-[10px] text-muted-foreground line-through font-normal">
                                        {kwanza(Number(item.list_price) * item.quantity)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {o.notes && (
                              <p className="text-sm text-muted-foreground italic">Nota: {o.notes}</p>
                            )}

                            <div>
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleReceipt(o)}>
                                Emitir recibo
                              </Button>
                            </div>
                            <OrderPaymentsPanel
                              order={o}
                              canConfirm={canConfirmPayments}
                              currentUserName={user?.name || user?.email || ''}
                              onChanged={loadAll}
                            />
                            {/* Entrega ao domicílio: o colportor mais próximo (migração entregas_por_colportor). */}
                            {['delivery', 'express'].includes(o.shipping_method) && (
                              <OrderColporteurDelivery order={o} onChanged={loadAll} />
                            )}

                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Estado da encomenda</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.keys(ORDER_STATUS).map((status) => (
                                  <Button key={status} size="sm" variant={o.status === status ? 'default' : 'outline'} className={o.status === status ? 'btn-primary' : ''} onClick={() => handleOrderStatus(o, status)} disabled={o.status === status || o.status === 'cancelled'}>
                                    {getOrderStatusLabel(status)}
                                  </Button>
                                ))}
                              </div>
                              {o.status === 'cancelled' && (
                                <p className="text-xs text-muted-foreground">Cancelada: o stock já voltou à loja, por isso a encomenda não se reabre.</p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Estado da entrega</p>
                              <div className="flex flex-wrap gap-1">
                                {['received', 'confirmed', 'preparing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'].map((ds) => (
                                  <Button key={ds} size="sm" variant={o.delivery_status === ds ? 'default' : 'outline'} className={`text-xs h-7 ${o.delivery_status === ds ? 'btn-primary' : ''}`} onClick={() => handleDeliveryStatus(o, ds)}>
                                    {getDeliveryStatusLabel(ds)}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-2">
                              <Input placeholder="Nº tracking" defaultValue={o.tracking_number || ''} onBlur={(e) => updateTracking(o, e.target.value, o.carrier, o.estimated_delivery)} />
                              <Input placeholder="Transportadora" defaultValue={o.carrier || ''} onBlur={(e) => updateTracking(o, o.tracking_number, e.target.value, o.estimated_delivery)} />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Data prevista de entrega</Label>
                              <Input
                                type="date"
                                defaultValue={o.estimated_delivery ? String(o.estimated_delivery).slice(0, 10) : ''}
                                onBlur={(e) => updateTracking(o, o.tracking_number, o.carrier, e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Totais e produtos mais vendidos: facturação, só com «Ver relatórios». */}
                  {perms.reports && <OrdersReportSection orders={orders} />}
                </AdminSection>
                )}
              </>
            )}
      </AdminShell>

        <BookFormModal
          open={showBookForm}
          onClose={() => { setShowBookForm(false); setEditingBook(null); setDuplicatingBook(null); }}
          onSave={handleSaveBook}
          editing={editingBook}
          template={duplicatingBook}
          initialType={newProductType}
          saving={saving}
        />
    </>
  );
};

export default AdminPage;
