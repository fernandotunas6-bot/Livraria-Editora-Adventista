import React, { Suspense, lazy, useEffect } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import { Navigate, Route, Routes, BrowserRouter as Router, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CartProvider } from '@/hooks/useCart';
import { AuthProvider } from '@/hooks/useAuth';
import { AuthDialogProvider } from '@/hooks/useAuthDialog';
import { SiteSettingsProvider, useSiteSettings } from '@/hooks/useSiteSettings';
import { IntegrationsProvider } from '@/hooks/useIntegrations';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import { isFloatingHidden } from '@/lib/floatingButtons';
import { BookLoader } from '@/components/ui/book-loader';
import MfaGate from '@/components/MfaGate.jsx';
import MobileBottomNav from '@/components/MobileBottomNav.jsx';
import ReaderActivity from '@/components/ReaderActivity.jsx';
import { toast } from 'sonner';
import { AUTH_REDIRECT_ERROR, withoutAuthError } from '@/lib/authRedirectError';
import { useRouteRemountKey } from '@/hooks/useRouteRemountKey';
import { useAfterLoad } from '@/hooks/useAfterLoad';
import { captureReferral } from '@/lib/colporteurReferral';

const HomePage = lazy(() => import('@/pages/HomePage.jsx'));
const ShopPage = lazy(() => import('@/pages/ShopPage.jsx'));

// Lazy-loaded pages to optimize initial bundle size & load speed
const CategoryPage = lazy(() => import('@/pages/CategoryPage.jsx'));
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage.jsx'));
const AboutPage = lazy(() => import('@/pages/AboutPage.jsx'));
const StoresPage = lazy(() => import('@/pages/StoresPage.jsx'));
const ContactPage = lazy(() => import('@/pages/ContactPage.jsx'));
const FAQPage = lazy(() => import('@/pages/FAQPage.jsx'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage.jsx'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage.jsx'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage.jsx'));
const CommunityPostPage = lazy(() => import('@/pages/CommunityPostPage.jsx'));
const ReaderProfilePage = lazy(() => import('@/pages/ReaderProfilePage.jsx'));
const MaterialsPage = lazy(() => import('@/pages/MaterialsPage.jsx'));
const ShippingReturnsPage = lazy(() => import('@/pages/ShippingReturnsPage.jsx'));
const SuccessPage = lazy(() => import('@/pages/SuccessPage.jsx'));
const LoginPage = lazy(() => import('@/pages/LoginPage.jsx'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage.jsx'));
const TrackOrderPage = lazy(() => import('@/pages/TrackOrderPage.jsx'));
const AdminPage = lazy(() => import('@/pages/AdminPage.jsx'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage.jsx'));
const CollectionsPage = lazy(() => import('@/pages/CollectionsPage.jsx'));
const UnsubscribePage = lazy(() => import('@/pages/UnsubscribePage.jsx'));
const SuggestionsPage = lazy(() => import('@/pages/SuggestionsPage.jsx'));
const OrderFeedbackPage = lazy(() => import('@/pages/OrderFeedbackPage.jsx'));
const ColporteurApplyPage = lazy(() => import('@/pages/ColporteurApplyPage.jsx'));
const ColporteurAreaPage = lazy(() => import('@/pages/ColporteurAreaPage.jsx'));
const NovidadesPage = lazy(() => import('@/pages/NovidadesPage.jsx'));

const PwaInstallBanner = lazy(() => import('@/components/PwaInstallBanner.jsx'));
// "Nova versão disponível — Actualizar" e "App actualizada" (lib/appVersion.js).
const AppUpdateNotice = lazy(() => import('@/components/AppUpdateNotice.jsx'));
const LivrariaAssistant = lazy(() => import('@/components/LivrariaAssistant.jsx'));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8">
      <BookLoader label="A carregar a página" />
    </div>
  );
}

function LegacyCategoryRedirect() {
  const { category } = useParams();
  return <Navigate to={category ? `/shop/${encodeURIComponent(category)}` : '/shop'} replace />;
}

/**
 * O alias em português do cancelamento de subscrição tem de levar a busca consigo: o token
 * vai em `?t=`, e um `<Navigate>` simples deixava-o pelo caminho, dando um link partido a
 * quem usasse este endereço.
 */
function UnsubscribeAliasRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/unsubscribe${search}`} replace />;
}

function LegacyCollectionRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/colecoes/${encodeURIComponent(slug)}` : '/colecoes'} replace />;
}

class RouteErrorBoundaryView extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // Uma página que rebentou volta a tentar em **qualquer** navegação, mesmo nas que já não
  // remontam a página (ver `useRouteRemountKey`): é o `resetKey`, que é sempre a
  // `location.key`, que o garante.
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('RouteErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-md text-center">
            <h1 className="text-4xl font-bold text-foreground mb-4">Algo correu mal</h1>
            <p className="text-muted-foreground mb-6">A página não pôde ser carregada. Tente recarregar ou voltar à loja.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Recarregar a página
              </button>
              <a href="/" className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                Voltar ao Início
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Fronteira de erros das rotas. A chave já não é a `location.key`: essa muda também quando a
 * própria página reescreve o endereço (filtros, ordenação, separadores), e cada escrita
 * desmontava a página inteira — na loja, no telemóvel, o painel de filtros fechava-se a cada
 * toque. Ver `hooks/useRouteRemountKey.js`.
 */
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  const remountKey = useRouteRemountKey();
  return (
    <RouteErrorBoundaryView key={remountKey} resetKey={location.key}>
      {children}
    </RouteErrorBoundaryView>
  );
}

/**
 * Um link de email expirado ou uma entrada com a Google falhada voltam ao site com o erro no
 * endereço (ver lib/authRedirectError.js). Mostra-se a razão em português e tira-se o erro do
 * endereço, para não voltar a aparecer ao recarregar. O /reset-password mostra-a na própria
 * página.
 */
function AuthRedirectNotice() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!AUTH_REDIRECT_ERROR) return undefined;
    const { pathname } = window.location;
    navigate(withoutAuthError(window.location.href), { replace: true });
    if (pathname === '/reset-password') return undefined;
    // Depois de o <Toaster> estar montado (vem a seguir na árvore).
    const t = setTimeout(() => toast.error(AUTH_REDIRECT_ERROR.message, { duration: 10000 }), 300);
    return () => clearTimeout(t);
  }, [navigate]);
  return null;
}

/** Guarda o código do colportor que vem no link (?c=CPT-0007) para o checkout. */
function ColporteurReferralCapture() {
  const { search } = useLocation();
  useEffect(() => { captureReferral(search); }, [search]);
  return null;
}

function GlobalWidgets() {
  const { pathname } = useLocation();
  const { settings } = useSiteSettings();
  // O assistente só entra ao primeiro gesto ou uns segundos depois do load
  // (hooks/useAfterLoad.js): o código dele, o /chat/config e o canal em tempo real competiam
  // com a página pela rede do telemóvel.
  const afterLoad = useAfterLoad();
  // Páginas sem o assistente: escolha do painel (lib/floatingButtons.js).
  const showAssistant = afterLoad && !isFloatingHidden('chat', pathname, settings);

  return (
    <Suspense fallback={null}>
      <AppUpdateNotice />
      <PwaInstallBanner />
      {showAssistant && <LivrariaAssistant />}
      <MobileBottomNav />
      <ReaderActivity />
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="livraria-theme">
    <TooltipProvider>
    <SiteSettingsProvider>
    <IntegrationsProvider>
    <AuthProvider>
    <CartProvider>
      <Router>
        <AuthDialogProvider>
        <ScrollToTop />
        <AuthRedirectNotice />
        <ColporteurReferralCapture />
        <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />

              <Route path="/shop" element={<ShopPage />} />
              <Route path="/loja" element={<Navigate to="/shop" replace />} />
              <Route path="/catalog" element={<Navigate to="/shop" replace />} />
              <Route path="/catalog/:category" element={<LegacyCategoryRedirect />} />
              <Route path="/shop/:category" element={<CategoryPage />} />

              <Route path="/colecoes" element={<CollectionsPage />} />
              <Route path="/colecoes/:slug" element={<CollectionsPage />} />
              <Route path="/colecao/:slug" element={<LegacyCollectionRedirect />} />

              <Route path="/product/:id" element={<ProductDetailPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/sobre" element={<Navigate to="/about" replace />} />
              <Route path="/lojas" element={<StoresPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/contacto" element={<Navigate to="/contact" replace />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/shipping-returns" element={<ShippingReturnsPage />} />
              <Route path="/envios-devolucoes" element={<Navigate to="/shipping-returns" replace />} />
              <Route path="/envios-e-devolucoes" element={<Navigate to="/shipping-returns" replace />} />

              <Route path="/success" element={<SuccessPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/track" element={<TrackOrderPage />} />
              <Route path="/sugestoes" element={<SuggestionsPage />} />
              <Route path="/comunidade" element={<CommunityPage />} />
              <Route path="/privacidade" element={<PrivacyPage />} />
              <Route path="/privacy" element={<Navigate to="/privacidade" replace />} />
              <Route path="/politica-de-privacidade" element={<Navigate to="/privacidade" replace />} />
              <Route path="/comunidade/p/:id" element={<CommunityPostPage />} />
              <Route path="/comunidade/leitor/:key" element={<ReaderProfilePage />} />
              <Route path="/materiais" element={<MaterialsPage />} />
              <Route path="/novidades" element={<NovidadesPage />} />
              <Route path="/versoes" element={<Navigate to="/novidades" replace />} />
              <Route path="/confirmar-encomenda" element={<OrderFeedbackPage />} />
              <Route path="/para-si" element={<Navigate to="/sugestoes" replace />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route path="/cancelar-subscricao" element={<UnsubscribeAliasRedirect />} />
              <Route path="/rastreio" element={<Navigate to="/track" replace />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/perfil" element={<Navigate to="/profile" replace />} />

              {/* Colportagem: o link de candidatura é próprio, para quem se quer tornar colportor. */}
              <Route path="/colportor" element={<ColporteurAreaPage />} />
              <Route path="/colportor/candidatura" element={<ColporteurApplyPage />} />
              <Route path="/ser-colportor" element={<Navigate to="/colportor/candidatura" replace />} />
              <Route path="/colportores" element={<Navigate to="/colportor/candidatura" replace />} />

              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
              <Route path="/painel" element={<Navigate to="/admin" replace />} />
              <Route path="/painel-admin" element={<Navigate to="/admin" replace />} />
              <Route path="/painel-vendas.html" element={<Navigate to="/admin?tab=vendas-huambo" replace />} />
              <Route path="/painel-vendas" element={<Navigate to="/admin?tab=vendas-huambo" replace />} />
              <Route path="/painel-vendas-huambo.html" element={<Navigate to="/admin?tab=vendas-huambo" replace />} />
              <Route path="/painel-vendas-huambo" element={<Navigate to="/admin?tab=vendas-huambo" replace />} />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
        <Toaster />
        <MfaGate />
        <GlobalWidgets />
        </AuthDialogProvider>
      </Router>
    </CartProvider>
    </AuthProvider>
    </IntegrationsProvider>
    </SiteSettingsProvider>
    </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;