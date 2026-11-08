import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Mail, Shield, ShoppingBag, LogOut, Loader2, ChevronRight, BookOpen, LayoutDashboard, Truck,
  Heart, Trash2, Bell, Copy, Check, Wallet, BadgeCheck, ShoppingCart as CartIcon,
} from 'lucide-react';
import { toast as notify } from 'sonner';
import DigitalLibrary from '@/components/downloads/DigitalLibrary';
import NotificationsTab from '@/components/community/NotificationsTab';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ColporteurProfileLink from '@/components/colportagem/ColporteurProfileLink';
import AreaBreadcrumb from '@/components/AreaBreadcrumb';
import ReaderLevelCard from '@/components/account/ReaderLevelCard';
import { useReaderStatus } from '@/hooks/useReader';
import { useSignal } from '@/hooks/useSignal';
import { accountTopic } from '@/lib/realtimeSignals';
import { useColporteurMe } from '@/hooks/useColporteurMe';
import { adminPermissions, buildAdminNav, navAreas } from '@/lib/adminSections';
import { ACCOUNT_VIEW_ALIASES, DEFAULT_ACCOUNT_VIEW, accountViews, colporteurHref, resolveAccountView } from '@/lib/siteAreas';
import ShoppingCart from '@/components/ShoppingCart';
import CustomerOrders from '@/components/account/CustomerOrders';
import AccountPrivacy from '@/components/account/AccountPrivacy';
import { pageTitle } from '@/lib/brand';
import { ALLOWED_IMAGE_ACCEPT, ALLOWED_IMAGE_LABEL, imageFileError } from '@/lib/imageTypes';
import { useAuth } from '@/hooks/useAuth';
import SessionGate from '@/components/SessionGate.jsx';
import { sessionDecision } from '@/lib/authSession';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserAvatar from '@/components/UserAvatar';
import { getUserDisplayName } from '@/lib/userUtils';
import { formatAngolaPhone } from '@/lib/angolaPhone';
import PhoneInput from '@/components/PhoneInput';
import MfaSettings from '@/components/MfaSettings';
import GoogleWorkspaceHub from '@/components/GoogleWorkspaceHub';
import ContactsManager from '@/components/ContactsManager';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Switch } from '@/components/ui/switch';
import { getPaymentMethods } from '@/api/PlatformApi';
import { getProduct } from '@/api/EcommerceApi';
import { isPaidUpfront } from '@/lib/paymentMethods';
import { appUpdatesWanted, isPushSupported, setAppUpdatesPush, subscribeToPush, requestPushPermission } from '@/lib/pushNotifications';
import { ROLES } from '@/lib/permissions';
import { customerOrderStage, isOrderFinished } from '@/lib/customerOrders';
import { kwanza } from '@/lib/money';
import { cn } from '@/lib/utils';

const dateOnly = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-AO');
};

/** Código (CLI-… ou FUN-…) com botão de copiar: é o que se dita ao telefone à loja. */
function CodeChip({ label, code, icon: Icon }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify(code);
    }
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs font-medium text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label} <span className="font-mono text-foreground">{code}</span>
      <button
        type="button" onClick={copy}
        className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Copiar ${code}`} title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      </button>
    </span>
  );
}

function SummaryTile({ icon: Icon, value, label, hint, tone = 'default', onClick, to }) {
  const body = (
    <>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10',
        tone === 'action' ? 'bg-amber-500/15 text-amber-700' : 'bg-marca/10 text-primary')}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground sm:text-base">
          {value !== undefined && <span className="mr-1 tabular-nums">{value}</span>}{label}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">{hint}</span>
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary sm:block" aria-hidden="true" />
    </>
  );
  const cls = cn('group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-marca/40 sm:p-4',
    tone === 'action' && 'border-amber-300/70');
  return to
    ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

const ProfilePage = () => {
  const { user, ready, isAuthed, isAdmin, canAccessAdmin, hasPermission, logout, logoutEverywhere, updateProfile, changePassword, fetchUserOrders, updateAvatar } = useAuth();
  // As mesmas permissões que o servidor exige em /contacts/*.
  const canManageContacts = isAdmin || hasPermission('manage_marketing') || hasPermission('manage_users');
  const { wishlist, loading: loadingWishlist, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const isStaff = user?.role === 'admin' || user?.role === 'manager';
  // Métodos pagos antes do envio (transferência, Multicaixa): as encomendas por pagar com eles
  // mostram "Pagar e indicar a referência", que abre o rastreio com a caixa "Como pagar".
  const [upfrontCodes, setUpfrontCodes] = useState(() => new Set());
  useEffect(() => {
    getPaymentMethods()
      .then((res) => setUpfrontCodes(new Set((res.methods || []).filter((m) => isPaidUpfront(m.type)).map((m) => m.code))))
      .catch(() => {});
  }, []);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // O separador fica no URL (/profile?tab=wishlist), como no painel: permite ligar-lhe
  // directamente do rodapé e do menu, e sobrevive a um recarregamento.
  const [searchParams, setSearchParams] = useSearchParams();
  // As vistas da conta vêm de lib/siteAreas.js; as da equipa (Workspace, CRM) só para quem pode.
  const views = accountViews({ canAccessAdmin, canManageContacts });
  const PROFILE_TABS = views.map((v) => v.id);
  // `?tab=pdfs` (ligações antigas) abre a Biblioteca.
  const requestedTab = ACCOUNT_VIEW_ALIASES[searchParams.get('tab')] || searchParams.get('tab') || '';
  const tabFromUrl = PROFILE_TABS.includes(requestedTab) ? requestedTab : '';
  // O separador vem sempre do endereço: o «voltar» do navegador regressa ao anterior.
  const activeTab = resolveAccountView(tabFromUrl || location.state?.tab || DEFAULT_ACCOUNT_VIEW, { canAccessAdmin, canManageContacts });
  const activeView = views.find((v) => v.id === activeTab);
  // As outras áreas da pessoa: a de colportor (se tem ficha) e o painel (se tem permissões).
  const colporteur = useColporteurMe(user?.id, { enabled: isAuthed });
  const staffAreas = canAccessAdmin ? navAreas(buildAdminNav(adminPermissions({ isAdmin, hasPermission }))) : [];
  // O nível de leitor (Conta nova → Leitor → assíduo → de honra) e o que falta para o seguinte.
  // Volta a pedir quando chega um sinal da conta (pagamento confirmado, aviso de nível novo).
  const [readerTick, setReaderTick] = useState(0);
  const reader = useReaderStatus({ refreshKey: readerTick });

  const tabsRef = useRef(null);
  const tabClicked = useRef(false);
  const changeTab = (tab) => {
    if (tab === activeTab) return;
    tabClicked.current = true;
    const next = new URLSearchParams(searchParams);
    if (tab === 'orders') next.delete('tab');
    else next.set('tab', tab);
    // Uma entrada no histórico por separador: o «voltar» regressa ao anterior.
    setSearchParams(next);
  };
  const openTab = (tab) => {
    changeTab(tab);
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [movingToCart, setMovingToCart] = useState('');
  const [appUpdates, setAppUpdates] = useState(() => appUpdatesWanted());

  const handleAppUpdatesToggle = async (enabled) => {
    setAppUpdates(enabled);
    try {
      await setAppUpdatesPush(settings?.vapid_public_key, enabled);
      toast({ title: enabled ? 'Novidades da app ligadas' : 'Novidades da app desligadas', description: enabled ? undefined : 'Os avisos das encomendas continuam.' });
    } catch (err) {
      setAppUpdates(!enabled);
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const handlePushToggle = async (enabled) => {
    if (!isPushSupported()) {
      toast({ variant: 'destructive', title: 'Não suportado', description: 'O seu browser não suporta notificações push.' });
      return;
    }
    if (!settings?.push_enabled || !settings?.vapid_public_key) {
      toast({ variant: 'destructive', title: 'Indisponível', description: 'Notificações push não estão activas na loja.' });
      return;
    }
    setPushLoading(true);
    try {
      if (enabled) {
        const perm = await requestPushPermission();
        if (perm !== 'granted') {
          toast({ variant: 'destructive', title: 'Permissão negada', description: 'Active notificações nas definições do browser.' });
          setPushEnabled(false);
          return;
        }
        await subscribeToPush(settings.vapid_public_key);
        setPushEnabled(true);
        toast({ title: 'Notificações activadas', description: 'Receberá alertas de encomendas e novidades.' });
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setPushEnabled(false);
        toast({ title: 'Notificações desactivadas' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
      setPushEnabled(false);
    } finally {
      setPushLoading(false);
    }
  };

  // `sessionDecision` garante a ordem: nada é decidido antes de se saber se há sessão. Era
  // aqui que o login com a Google acabava de volta no ecrã de entrada, por a sessão vir no
  // endereço e só ser guardada depois de o supabase-js a processar.
  const access = sessionDecision({ ready, isAuthed });

  useEffect(() => {
    if (access === 'login') navigate('/login', { state: { from: '/profile' } });
  }, [access, navigate]);

  useEffect(() => {
    // Chegou por um link para um separador (menu, sino, rodapé): no telemóvel o cartão do
    // perfil ocupa o ecrã todo e o separador ficava escondido lá em baixo; desce até ele.
    // Um clique nos próprios separadores não mexe no scroll.
    const wanted = tabFromUrl || location.state?.tab;
    if (wanted && !tabClicked.current && window.matchMedia?.('(max-width: 767px)').matches) {
      const t = setTimeout(() => tabsRef.current?.scrollIntoView({ block: 'start' }), 150);
      return () => clearTimeout(t);
    }
    tabClicked.current = false;
    return undefined;
  }, [tabFromUrl, location.state?.tab]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone ? formatAngolaPhone(user.phone) : '');
    }
  }, [user]);

  const loadOrders = useCallback(async () => {
    if (!user?.email) return;
    setLoadingOrders(true);
    try {
      const list = await fetchUserOrders(user.email);
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [user?.email, fetchUserOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  // Tempo real: uma encomenda que muda (pagamento confirmado, enviada, entregue) ou um aviso novo
  // aparecem na hora — e com eles o nível de leitor, que sobe com o pagamento do livro.
  useSignal(accountTopic(user?.id), ['orders', 'avisos'], (event) => {
    if (event === 'orders') loadOrders();
    setReaderTick((n) => n + 1);
  }, { enabled: !!user?.id, debounceMs: 500 });

  const summary = useMemo(() => {
    const active = orders.filter((o) => !isOrderFinished(o));
    const toPay = active.filter((o) => ['to_pay', 'payment_failed'].includes(customerOrderStage(o, { upfront: upfrontCodes.has(o.payment_method_code) }).key));
    return { active: active.length, toPay: toPay.length };
  }, [orders, upfrontCodes]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    const emailChanged = email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
    try {
      await updateProfile({ name, email, phone });
      if (emailChanged) {
        setEmail(user?.email || '');
        toast({
          title: 'Confirme o novo email',
          description: `Enviámos um link para ${email.trim()}. Até o confirmar, a conta e as encomendas continuam no email actual.`,
        });
      } else {
        toast({ title: 'Perfil actualizado' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'As palavras-passe não coincidem' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: 'A palavra-passe deve ter pelo menos 8 caracteres' });
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast({ title: 'Palavra-passe alterada' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const [endingSessions, setEndingSessions] = useState(false);
  const handleLogoutEverywhere = async () => {
    if (!confirm('Terminar a sessão em todos os aparelhos, incluindo este?\n\nVai ter de voltar a entrar com a palavra-passe em cada um.')) return;
    setEndingSessions(true);
    try {
      await logoutEverywhere();
      toast({ title: 'Sessões terminadas', description: 'Saiu da conta em todos os aparelhos.' });
      navigate('/login');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
      setEndingSessions(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Tipo e tamanho (lib/imageTypes.js). O tipo é verificado aqui porque o `accept` do
    // input é só uma sugestão da janela de ficheiros: sem isto passava um SVG, que é um
    // documento capaz de levar `<script>`, para um bucket público.
    const problem = imageFileError(file, 2);
    if (problem) {
      toast({ variant: 'destructive', title: 'Foto não aceite', description: problem });
      return;
    }
    setAvatarUploading(true);
    try {
      await updateAvatar(file);
      toast({ title: 'Foto actualizada' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setAvatarUploading(false);
    }
  };

  // Da lista de desejos para o carrinho, com o preço e o stock de agora.
  const moveToCart = async (bookId) => {
    setMovingToCart(bookId);
    try {
      const product = await getProduct(bookId);
      const variant = product.variants?.[0];
      const available = Number(variant?.inventory_quantity ?? 0);
      if (!variant || available <= 0) {
        notify.error('Este livro está esgotado de momento.');
        return;
      }
      if ((product.variants || []).length > 1 || /-v\d+$/.test(String(variant.id))) {
        navigate(`/product/${bookId}`);
        return;
      }
      await addToCart(product, variant, 1, available, { silent: true });
      notify.success(`"${product.title}" está no carrinho`);
      setIsCartOpen(true);
    } catch (err) {
      notify.error(err.message || 'Não foi possível juntar ao carrinho.');
    } finally {
      setMovingToCart('');
    }
  };

  if (access === 'wait') return <SessionGate />;
  if (access !== 'allow') return null;

  const roleLabel = ROLES[user?.role]?.label;

  return (
    <>
      <Helmet><title>{pageTitle(`${activeView ? `${activeView.label} · ` : ''}A minha conta`)}</title></Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="min-h-screen bg-muted/20">
        <div className="container-custom py-6 md:py-10">
          <AreaBreadcrumb items={[{ label: 'A minha conta', to: '/profile' }, activeView && { label: activeView.label }]} />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Cabeçalho do perfil: compacto no telemóvel, para as encomendas aparecerem cedo. */}
            <div className="mb-5 rounded-2xl border bg-linear-to-br from-marca/10 via-background to-background p-4 sm:p-6 md:mb-6 md:p-8">
              <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                <UserAvatar user={user} size="lg" className="h-14 w-14 text-lg ring-4 ring-marca/20 sm:h-20 sm:w-20 sm:text-2xl" />
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-bold sm:text-2xl md:text-3xl">{getUserDisplayName(user)}</h1>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{user?.email}</span>
                  </p>
                </div>
                <div className={cn('flex gap-2', canAccessAdmin ? 'w-full sm:w-auto' : 'ml-auto')}>
                  {canAccessAdmin && (
                    <Button asChild size="sm" className="btn-primary flex-1 sm:flex-none">
                      <Link to="/admin"><LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" /> Painel</Link>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className={cn(canAccessAdmin && 'flex-1 sm:flex-none')} onClick={() => { logout(); navigate('/'); }}>
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isStaff && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-marca/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <Shield className="h-3 w-3" aria-hidden="true" /> Equipa · {roleLabel}
                  </span>
                )}
                {isStaff && <CodeChip label="Funcionário" code={user?.staff_code} icon={BadgeCheck} />}
                <CodeChip label="Cliente" code={user?.customer_code} icon={User} />
                {dateOnly(user?.created) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Desde {dateOnly(user?.created)}
                  </span>
                )}
              </div>
              {user?.customer_code && (
                <p className="mt-2 text-xs text-muted-foreground">Diga o código de cliente quando falar com a loja: encontram as suas encomendas mais depressa.</p>
              )}
            </div>

            {/* Resumo: o que precisa de si primeiro. */}
            <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 md:mb-8">
              <SummaryTile icon={ShoppingBag} value={summary.active} label="em curso" hint={`${orders.length} ${orders.length === 1 ? 'encomenda' : 'encomendas'} no total`} onClick={() => openTab('orders')} />
              <SummaryTile icon={Wallet} value={summary.toPay} label="por pagar" hint={summary.toPay ? 'Pague e indique a referência' : 'Nada pendente'} tone={summary.toPay ? 'action' : 'default'} onClick={() => openTab('orders')} />
              <SummaryTile icon={Heart} value={wishlist.length} label="na lista de desejos" hint="Livros guardados para depois" onClick={() => openTab('wishlist')} />
              <SummaryTile icon={Truck} label="Rastrear encomenda" hint="Com o número e o email" to="/track" />
            </div>
            <ReaderLevelCard status={reader} className="mb-6 md:mb-8" />
            <div className="mb-6 empty:hidden md:mb-8 [&>a]:max-w-md"><ColporteurProfileLink /></div>

            {/* Tabs principais */}
            {/* Tabs principais. No computador, o menu da conta à esquerda (a conta, as ferramentas
                da equipa e as outras áreas da pessoa); no telemóvel, a fila de separadores. As
                vistas vêm de lib/siteAreas.js e a aberta fica no endereço (?tab=…). */}
            <Tabs ref={tabsRef} value={activeTab} onValueChange={changeTab} className="w-full scroll-mt-20 grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
              <aside aria-label="Menu da conta" className="space-y-4 lg:sticky lg:top-24 lg:rounded-xl lg:border lg:border-border lg:bg-background lg:p-2">
                <div>
                  <p className="hidden px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:block">A minha conta</p>
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 lg:flex-col lg:items-stretch lg:gap-0.5 lg:bg-transparent lg:p-0 [&>button]:min-h-10">
                    {views.filter((v) => !v.staff).map((v) => (
                    <TabsTrigger
                      key={v.id}
                      value={v.id}
                      className="lg:justify-start lg:px-2.5 lg:py-2 lg:data-[state=active]:bg-marca/10 lg:data-[state=active]:text-primary lg:data-[state=active]:shadow-none"
                    >
                      <v.icon className="h-4 w-4 mr-2" />{v.label}
                    </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {views.some((v) => v.staff) && (
                  <div>
                    <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equipa</p>
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 lg:flex-col lg:items-stretch lg:gap-0.5 lg:bg-transparent lg:p-0 [&>button]:min-h-10">
                      {views.filter((v) => v.staff).map((v) => (
                    <TabsTrigger
                        key={v.id}
                        value={v.id}
                        className="lg:justify-start lg:px-2.5 lg:py-2 lg:data-[state=active]:bg-marca/10 lg:data-[state=active]:text-primary lg:data-[state=active]:shadow-none"
                      >
                        <v.icon className="h-4 w-4 mr-2" />{v.label}
                      </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                )}
                {(colporteur || canAccessAdmin) && (
                  <div className="hidden lg:block">
                    <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outras áreas</p>
                    <ul className="space-y-0.5 text-sm">
                      {colporteur && (
                        <li><Link to={colporteurHref()} className="flex items-center gap-2 rounded-md px-2.5 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><BookOpen className="h-4 w-4" />Área do colportor</Link></li>
                      )}
                      {canAccessAdmin && (
                        <li>
                          <Link to="/admin" className="flex items-center gap-2 rounded-md px-2.5 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                            <LayoutDashboard className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                              Painel da equipa
                              {/* As áreas que esta pessoa vê no painel, não uma lista fixa. */}
                              <span className="block truncate text-xs font-normal">{isAdmin ? 'Todas as áreas' : staffAreas.join(' · ') || 'Início'}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </aside>

              <div className="min-w-0">
              <TabsContent value="orders">
                <CustomerOrders
                  orders={orders}
                  loading={loadingOrders}
                  user={user}
                  settings={settings}
                  upfrontCodes={upfrontCodes}
                  onChanged={loadOrders}
                  onCartOpen={() => setIsCartOpen(true)}
                />
              </TabsContent>

              <TabsContent value="notifications">
                <NotificationsTab userId={user?.id} />
              </TabsContent>

              <TabsContent value="settings">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-6 rounded-xl border bg-card p-6">
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Foto de perfil</h3>
                      <div className="flex items-center gap-4">
                        <UserAvatar user={user} size="lg" className="h-20 w-20" />
                        <div>
                          <p className="mb-2 text-sm text-muted-foreground">
                            {user?.avatar ? 'Foto do Google ou carregada por si' : `Adicione a sua foto (${ALLOWED_IMAGE_LABEL}, máx. 2 MB)`}
                          </p>
                          <label className="cursor-pointer">
                            <input type="file" accept={ALLOWED_IMAGE_ACCEPT} className="hidden" onChange={handleAvatarChange} disabled={avatarUploading} />
                            <Button type="button" variant="outline" size="sm" asChild>
                              <span>{avatarUploading ? 'A carregar…' : 'Alterar foto'}</span>
                            </Button>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Dados pessoais</h3>
                      <form onSubmit={handleSaveProfile} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="profile-name">Nome</Label>
                          <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="O seu nome" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="profile-email">Email</Label>
                          <Input id="profile-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone</Label>
                          <PhoneInput value={phone} onChange={setPhone} />
                          <p className="text-[11px] text-muted-foreground">Usado para pré-preencher a compra e para o contacto na entrega.</p>
                        </div>
                        <Button type="submit" className="btn-primary" disabled={saving}>
                          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                          Guardar alterações
                        </Button>
                      </form>
                    </div>
                  </div>

                  {isPushSupported() && (
                    <div className="h-fit rounded-xl border bg-card p-6">
                      <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                        <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                        Notificações no aparelho
                      </h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Receba neste aparelho os avisos de cada passo das encomendas e as respostas da comunidade.
                      </p>
                      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Activar notificações</p>
                          {!settings?.push_enabled && (
                            <p className="text-xs text-muted-foreground">A loja ainda não as ligou.</p>
                          )}
                        </div>
                        <Switch
                          checked={pushEnabled}
                          disabled={pushLoading || !settings?.push_enabled}
                          onCheckedChange={handlePushToggle}
                          aria-label="Activar notificações neste aparelho"
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Novidades da app</p>
                          <p className="text-xs text-muted-foreground">
                            Um aviso quando sai uma versão nova com novidades.{' '}
                            <Link to="/novidades" className="font-medium text-primary hover:underline">Ver as novidades</Link>
                          </p>
                        </div>
                        <Switch
                          checked={pushEnabled && appUpdates}
                          disabled={pushLoading || !pushEnabled}
                          onCheckedChange={handleAppUpdatesToggle}
                          aria-label="Receber as novidades da app neste aparelho"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="security">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-6">
                    <div className="rounded-xl border bg-card p-6">
                      <h3 className="mb-4 text-lg font-bold">Alterar a palavra-passe</h3>
                      <form onSubmit={handleChangePassword} className="space-y-4">
                        {/* O utilizador escondido ajuda os gestores de palavras-passe a saber de que conta é. */}
                        <input type="email" autoComplete="username" value={user?.email || ''} readOnly hidden />
                        <div className="space-y-2">
                          <Label htmlFor="pw-current">Palavra-passe actual</Label>
                          <Input id="pw-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pw-new">Nova palavra-passe</Label>
                          <Input id="pw-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                          <p className="text-[11px] text-muted-foreground">Pelo menos 8 caracteres.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pw-confirm">Repita a nova palavra-passe</Label>
                          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </div>
                        <Button type="submit" variant="outline" disabled={saving}>
                          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                          Alterar a palavra-passe
                        </Button>
                      </form>
                    </div>
                    <MfaSettings isStaff={canAccessAdmin} />
                    <div className="rounded-xl border bg-card p-6">
                      <h3 className="mb-1 text-lg font-bold">Sessões abertas</h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Perdeu um telemóvel ou entrou num computador que não é seu? Termine a sessão em todos os aparelhos.
                        Nos outros, a sessão fecha no máximo dentro de uma hora.
                      </p>
                      <Button type="button" variant="outline" onClick={handleLogoutEverywhere} disabled={endingSessions}>
                        {endingSessions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Terminar sessão em todos os aparelhos
                      </Button>
                    </div>
                  </div>
                  <div>
                    <AccountPrivacy
                      user={user}
                      isStaff={isStaff}
                      onDeleted={() => { logout(); navigate('/'); }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="biblioteca">
                {activeTab === 'biblioteca' && <DigitalLibrary userId={user?.id} />}
              </TabsContent>

              <TabsContent value="wishlist">
                <div className="rounded-xl border bg-card p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                    <Heart className="h-5 w-5 fill-red-500 text-red-500" aria-hidden="true" />
                    Lista de desejos ({wishlist.length})
                  </h3>

                  {loadingWishlist ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="A carregar" />
                    </div>
                  ) : wishlist.length === 0 ? (
                    <div className="flex flex-col items-center rounded-xl border border-dashed py-12 text-center">
                      <Heart className="mb-3 h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
                      <p className="mb-4 text-muted-foreground">A sua lista de desejos está vazia.</p>
                      <Button asChild className="btn-primary">
                        <Link to="/shop">Ir à loja</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                      {wishlist.map((item) => (
                        <div key={item.id} className="flex flex-col justify-between overflow-hidden rounded-xl border bg-background transition-all hover:border-marca/30">
                          <Link to={`/product/${item.bookId}`} className="flex gap-3 p-4">
                            <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                              {item.bookCover ? (
                                <img src={item.bookCover} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <BookOpen className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="line-clamp-2 text-sm font-bold">{item.bookTitle}</h4>
                              <p className="mt-1 text-xs font-semibold text-primary">
                                {item.bookPrice > 0 ? kwanza(item.bookPrice) : 'Grátis'}
                              </p>
                              {dateOnly(item.addedAt) && (
                                <p className="mt-2 text-[10px] text-muted-foreground">Guardado a {dateOnly(item.addedAt)}</p>
                              )}
                            </div>
                          </Link>
                          <div className="flex gap-2 border-t bg-muted/10 p-3">
                            <Button size="sm" className="btn-primary flex-1 text-xs" onClick={() => moveToCart(item.bookId)} disabled={movingToCart === item.bookId}>
                              {movingToCart === item.bookId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CartIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                              Juntar ao carrinho
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromWishlist(item.bookId)}
                              className="px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Tirar ${item.bookTitle} da lista`}
                              title="Tirar da lista"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {canAccessAdmin && (
                <TabsContent value="workspace">
                  <GoogleWorkspaceHub />
                </TabsContent>
              )}

              {canManageContacts && (
                <TabsContent value="crm">
                  <ContactsManager />
                </TabsContent>
              )}
              </div>
            </Tabs>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default ProfilePage;
