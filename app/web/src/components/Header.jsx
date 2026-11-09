import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import SafeLink from '@/components/SafeLink.jsx';
import { Search, ShoppingCart, Menu, X, User, ShoppingBag, LogOut, LayoutDashboard, Bell, Library, ShieldCheck, BadgeCheck } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useHeaderReveal } from '@/hooks/useHeaderReveal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useColporteurMe } from '@/hooks/useColporteurMe';
import { adminPermissions } from '@/lib/adminSections';
import { accountHref, colporteurHref, staffShortcuts } from '@/lib/siteAreas';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import BrandLogo from '@/components/BrandLogo';
import MegaMenu from '@/components/header/MegaMenu';
import NotificationBell from '@/components/NotificationBell.jsx';
import UserAvatar from '@/components/UserAvatar';
import { UserMenu, GuestAuthButton } from '@/components/UserMenu';
import { getUserDisplayName, getUserFirstName } from '@/lib/userUtils';
import { getProducts } from '@/api/EcommerceApi';
import { buildSearchSuggestions } from '@/lib/searchUtils';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '@/lib/recentSearches';
import SiteNoticeBar from '@/components/SiteNoticeBar';
import SkipToContent from '@/components/SkipToContent';
import { useSiteNotice } from '@/hooks/useSiteNotice';

// Menu do telemóvel: as mesmas secções do mega menu, em lista.
const NAV_LINKS = [
  { to: '/', label: 'Início' },
  { to: '/shop', label: 'Livros' },
  { to: '/colecoes', label: 'Coleções' },
  { to: '/comunidade', label: 'Comunidade' },
  { to: '/materiais', label: 'Materiais' },
  { to: '/lojas', label: 'Lojas' },
  { to: '/about', label: 'Sobre' },
  { to: '/faq', label: 'Ajuda' },
  { to: '/contact', label: 'Contacto' },
];

const OPEN_HEADER_SEARCH_EVENT = 'livraria:open-header-search';

export const openHeaderSearch = () => {
  window.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
};

const Header = ({ onCartOpen, pinned = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartItems } = useCart();
  const { user, isAuthed, isAdmin, canAccessAdmin, hasPermission, logout } = useAuth();
  const { openAuth } = useAuthDialog();
  const { settings } = useSiteSettings();
  const { notice, dismiss: dismissNotice } = useSiteNotice();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // "Área do colportor" no menu do telemóvel: pergunta-se quando o menu abre.
  const colporteur = useColporteurMe(user?.id, { enabled: isAuthed && mobileOpen });
  const [hasFocus, setHasFocus] = useState(false);
  const [searchCatalog, setSearchCatalog] = useState([]);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // O que se procurou antes, neste aparelho: aparece com o campo vazio (lib/recentSearches.js).
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches());
  const searchInputRef = useRef(null);
  const headerRef = useRef(null);

  const revealed = useHeaderReveal(pinned || mobileOpen || searchOpen || hasFocus);
  const searchFormRef = useRef(null);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const searchSuggestions = useMemo(
    () => buildSearchSuggestions(searchCatalog, search),
    [searchCatalog, search],
  );

  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get('search') || '');
  }, [location.search]);

  useEffect(() => {
    const handleOpenSearch = () => {
      setSearchOpen(true);
      setMobileOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener(OPEN_HEADER_SEARCH_EVENT, handleOpenSearch);
    return () => window.removeEventListener(OPEN_HEADER_SEARCH_EVENT, handleOpenSearch);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // O menu fecha ao mudar de página (também pela barra de baixo, que não passa por aqui) e com
  // a tecla Escape.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    // Com o menu aberto, a página de trás fica quieta (o menu desloca-se por dentro). Isto
    // também tira de cena o "Voltar ao topo" (ver usePageScrollLocked).
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  // As barras que colam por baixo (as letras do catálogo, os filtros da loja) precisam de
  // saber onde o cabeçalho acaba, senão colam ao topo e ficam escondidas por trás dele.
  // Antes `--header-offset` era lido em dois sítios mas nunca escrito, e cada um ficava
  // pelo seu palpite — 64px num, 0px no outro. Agora é a medida real, que muda quando a
  // pesquisa ou o menu abrem.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const publish = () => {
      document.documentElement.style.setProperty('--header-offset', `${Math.round(el.offsetHeight)}px`);
    };
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.removeProperty('--header-offset');
    };
  }, []);

  useEffect(() => {
    if (!searchOpen || searchCatalog.length > 0) return undefined;
    let active = true;
    getProducts({})
      .then(({ products }) => { if (active) setSearchCatalog(products || []); })
      .catch((err) => console.warn('Não foi possível carregar sugestões de pesquisa:', err));
    return () => { active = false; };
  }, [searchOpen, searchCatalog.length]);

  useEffect(() => {
    setActiveSuggestion(-1);
  }, [search]);

  useEffect(() => {
    if (!searchSuggestionsOpen) return undefined;
    const closeOutside = (event) => {
      if (searchFormRef.current && !searchFormRef.current.contains(event.target)) {
        setSearchSuggestionsOpen(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [searchSuggestionsOpen]);

  const handleSearch = (e) => {
    e.preventDefault();
    const query = search.trim();
    if (!query) return;
    setRecentSearches(addRecentSearch(query));
    navigate(`/shop?search=${encodeURIComponent(query)}`);
    setMobileOpen(false);
    setSearchOpen(false);
    setSearchSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const chooseSearchSuggestion = (suggestion) => {
    setSearch(suggestion.texto);
    setRecentSearches(addRecentSearch(suggestion.texto));
    setSearchSuggestionsOpen(false);
    setActiveSuggestion(-1);
    if (suggestion.tipo === 'livro' && suggestion.id) {
      navigate(`/product/${suggestion.id}`);
    } else {
      navigate(`/shop?search=${encodeURIComponent(suggestion.texto)}`);
    }
    setSearchOpen(false);
  };

  const searchRecent = (term) => {
    setSearch(term);
    setRecentSearches(addRecentSearch(term));
    navigate(`/shop?search=${encodeURIComponent(term)}`);
    setSearchOpen(false);
    setSearchSuggestionsOpen(false);
  };

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = () => {
    logout();
    closeMobile();
    navigate('/');
  };

  return (
    <>
      {/* Primeiro elemento focável da loja: salta o cabeçalho e vai ao conteúdo (WCAG 2.4.1). */}
      <SkipToContent />
      {/* Faixa de aviso (painel → Sistema → Faixa de aviso), no fluxo da página: empurra o
          conteúdo em vez de o tapar e sobe com ele ao descer. */}
      <SiteNoticeBar notice={notice} onDismiss={dismissNotice} />
      {/* Barra fina por cima do herói.
          O cabeçalho completo sai de cena no topo da página para a imagem de entrada se ver
          inteira (ver `useHeaderReveal`) — mas isso deixava quem acaba de chegar sem
          navegação nenhuma: nem logótipo, nem conta, nem carrinho, até rolar duzentos
          pixels. Esta barra ocupa esse lugar com o mínimo indispensável, sobre um véu que a
          mantém legível por cima de qualquer imagem, e sai de cena quando o cabeçalho
          verdadeiro entra. Monta e desmonta em vez de ficar escondida, para não deixar
          botões invisíveis no caminho de quem navega pelo teclado. */}
      {/* Com faixa de aviso, a barra fica logo abaixo dela (`--notice-offset`, medido pela faixa)
          e acompanha a página em vez de ficar presa ao ecrã: só existe nos primeiros píxeis de
          deslocamento, antes de o cabeçalho completo entrar. */}
      {!pinned && !revealed && (
        <div
          className={cn(
            'inset-x-0 z-30 bg-linear-to-b from-black/50 via-black/25 to-transparent animate-in fade-in duration-base',
            notice ? 'absolute' : 'safe-top fixed top-0',
          )}
          style={notice ? { top: 'var(--notice-offset, 0px)' } : undefined}
        >
          <div className="container-custom flex h-14 items-center justify-between gap-3">
            <BrandLogo variant="light" collapseToIcon />
            <div className="flex items-center gap-1">
              {/* A pesquisa saiu da barra de baixo: no topo da página tem de estar à mão. */}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-white hover:bg-white/15"
                onClick={openHeaderSearch}
                aria-label="Abrir pesquisa"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full text-white hover:bg-white/15"
                onClick={onCartOpen}
                aria-label={`Carrinho com ${cartCount} itens`}
              >
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#dc2626] text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Button>
              <NotificationBell className="text-white hover:bg-white/15" />
              {isAuthed ? (
                <Link to="/profile" aria-label="Minha conta">
                  <UserAvatar user={user} size="sm" className="ring-2 ring-white/40" />
                </Link>
              ) : (
                <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15" aria-label="Entrar ou criar conta" onClick={() => openAuth()}>
                  <User className="h-5 w-5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Por trás do menu aberto, um véu: tocar fora fecha-o (em vez de mexer na página por
          baixo sem se ver), e o deslizar não passa para a página. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-48 touch-none bg-black/40 animate-in fade-in duration-base lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}
    <header
      ref={headerRef}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHasFocus(false);
      }}
      className={cn(
        'safe-top top-0 border-b border-border shadow-xs glass-topbar text-white',
        // Com o menu aberto, acima do véu e dos botões flutuantes (o chat está em z-45).
        mobileOpen ? 'z-49' : 'z-40',
        // Onde a página abre com imagem de largura inteira, o cabeçalho sai do fluxo para
        // a poder descobrir: em `sticky` continuava a ocupar lugar, e escondê-lo deixava
        // uma faixa vazia por cima dela — exactamente o que se queria tirar.
        //
        // Onde a página abre com conteúdo normal — ficha de livro, perfil, confirmação de
        // encomenda — não há imagem para descobrir, e escondê-lo só deixava o texto colado
        // ao topo, sem navegação. Aí fica `sticky`, no fluxo, como sempre esteve.
        pinned ? 'sticky' : 'fixed inset-x-0 transition-transform duration-base ease-brand',
        // Com o menu aberto o cabeçalho pode passar da altura do ecrã; aí desloca-se por
        // dentro em vez de cortar o fim da lista.
        mobileOpen && 'max-h-dvh overflow-y-auto',
        !pinned && (revealed ? 'translate-y-0' : '-translate-y-full')
      )}
    >
      {/* Barra superior — mensagem de boas-vindas */}
      <div className="hidden sm:block text-white/90 text-center text-xs py-1.5 px-4 border-b border-white/5 bg-white/5">
        {isAuthed ? (
          <span>
            {(settings.header_welcome_logged || 'Bem-vindo de volta, {nome}').replace('{nome}', getUserFirstName(user))}
            {(settings.header_cta_text || settings.header_cta_link) && (
              <>
                {' · '}
                {/* `SafeLink`: o endereço vem do painel e nem o React nem o Router o filtram. */}
                <SafeLink to={settings.header_cta_link || '/shop'} className="underline underline-offset-2 hover:text-white">
                  {settings.header_cta_text || 'Explorar novidades'}
                </SafeLink>
              </>
            )}
          </span>
        ) : (
          <span>
            {settings.header_welcome_guest || 'Envio em todo o país · Compre sem conta'}
            {' · '}
            {/* Comprar não exige conta; o cliente acompanha a encomenda pelo número e email. */}
            <Link to="/track" className="underline underline-offset-2 hover:text-white">Rastrear encomenda</Link>
          </span>
        )}
      </div>

      <div className="container-custom">
        <div className="flex items-center justify-between h-16 gap-3">
          <BrandLogo variant="light" collapseToIcon />

          <div className="hidden lg:block">
            <MegaMenu />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => {
                if (!searchOpen) openHeaderSearch();
                else setSearchOpen(false);
              }}
              aria-expanded={searchOpen}
              aria-controls="header-search"
              aria-label={searchOpen ? 'Fechar pesquisa' : 'Abrir pesquisa'}
            >
              {searchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full text-white/80 hover:text-white hover:bg-white/10"
                  onClick={onCartOpen}
                  aria-label={`Carrinho com ${cartCount} itens`}
                >
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#dc2626] text-white text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center ring-2 ring-neutral-900">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Ver Carrinho de Compras</TooltipContent>
            </Tooltip>

            <NotificationBell className="text-white/80 hover:text-white hover:bg-white/10" />

            {isAuthed ? (
              <>
                <UserMenu className="hidden sm:flex text-white" />
                <Link to="/profile" className="sm:hidden" aria-label="Minha conta">
                  <UserAvatar user={user} size="sm" className="ring-2 ring-[#22d3ee]/30" />
                </Link>
              </>
            ) : (
              <>
                <GuestAuthButton className="hidden sm:flex text-white" />
                <Button variant="ghost" size="icon" className="sm:hidden rounded-full text-white hover:bg-white/10" aria-label="Entrar ou criar conta" onClick={() => openAuth()}>
                  <User className="h-5 w-5" aria-hidden="true" />
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-full text-white hover:bg-white/10 transition-transform duration-base active:scale-95"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation-menu"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            >
              {mobileOpen ? <X className="h-5 w-5 animate-in spin-in-90 duration-base" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        <form
          ref={searchFormRef}
          id="header-search"
          onSubmit={handleSearch}
          role="search"
          aria-label="Pesquisa de livros"
          // Fechada, sai do caminho do teclado e dos leitores de ecrã (antes só aria-hidden,
          // e o campo continuava a receber o foco sem se ver).
          {...(searchOpen ? {} : { inert: '' })}
          className={`relative grid transition-[grid-template-rows,opacity] duration-base ${
            searchOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex gap-2 pb-4">
              <Input
                ref={searchInputRef}
                type="search"
                enterKeyHint="search"
                placeholder="Pesquisar livros, autores..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchSuggestionsOpen(true); }}
                onFocus={() => setSearchSuggestionsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && searchSuggestions.length > 0) {
                    e.preventDefault();
                    setSearchSuggestionsOpen(true);
                    setActiveSuggestion((current) => (current + 1) % searchSuggestions.length);
                  } else if (e.key === 'ArrowUp' && searchSuggestions.length > 0) {
                    e.preventDefault();
                    setSearchSuggestionsOpen(true);
                    setActiveSuggestion((current) => (current <= 0 ? searchSuggestions.length - 1 : current - 1));
                  } else if (e.key === 'Enter' && searchSuggestionsOpen && activeSuggestion >= 0) {
                    e.preventDefault();
                    chooseSearchSuggestion(searchSuggestions[activeSuggestion]);
                  } else if (e.key === 'Escape') {
                    setSearchSuggestionsOpen(false);
                    setActiveSuggestion(-1);
                  }
                }}
                className="min-w-0 flex-1 rounded-full bg-white/10 border-white/10 text-white placeholder-white/50 focus-visible:ring-[#22d3ee]"
                aria-label="Pesquisar livros, autores e coleções"
                role="combobox"
                aria-expanded={searchSuggestionsOpen && searchSuggestions.length > 0}
                aria-controls="header-search-suggestions"
                aria-activedescendant={activeSuggestion >= 0 ? `header-search-suggestion-${activeSuggestion}` : undefined}
                aria-autocomplete="list"
                tabIndex={searchOpen ? 0 : -1}
              />
              <Button type="submit" className="rounded-full bg-[#22d3ee] text-neutral-950 hover:bg-[#22d3ee]/90">
                Pesquisar
              </Button>
            </div>
            {searchOpen && !search.trim() && recentSearches.length > 0 && (
              <div className="-mt-1 flex flex-wrap items-center gap-2 pb-4" aria-label="Pesquisas recentes" role="group">
                <span className="text-xs text-white/60">Recentes:</span>
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => searchRecent(term)}
                    className="inline-flex min-h-9 max-w-48 items-center truncate rounded-full border border-white/15 bg-white/10 px-3 text-xs text-white/90 hover:bg-white/15"
                  >
                    {term}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { clearRecentSearches(); setRecentSearches([]); searchInputRef.current?.focus(); }}
                  className="inline-flex min-h-9 items-center px-2 text-xs font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>
          {searchOpen && searchSuggestionsOpen && searchSuggestions.length > 0 && (
            <ul
              id="header-search-suggestions"
              role="listbox"
              aria-label="Sugestões de pesquisa"
              className="elev-overlay absolute left-0 right-0 top-full z-50 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover py-1 text-left text-foreground shadow-xl"
            >
              {searchSuggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.tipo}-${suggestion.id || suggestion.texto}`}
                  id={`header-search-suggestion-${index}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                >
                  <button
                    type="button"
                    tabIndex={searchOpen ? 0 : -1}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    onClick={() => chooseSearchSuggestion(suggestion)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted ${index === activeSuggestion ? 'bg-muted' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{suggestion.texto}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {suggestion.tipo === 'livro' ? 'livro' : suggestion.tipo === 'autor' ? 'autor' : 'editora'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div
          id="mobile-navigation-menu"
          className={`lg:hidden space-y-4 border-t border-white/10 pt-4 mobile-menu-container ${mobileOpen ? 'open' : ''}`}
          aria-hidden={!mobileOpen}
        >
          {/* Secção de conta no mobile */}
          {isAuthed ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-marca/5 border border-marca/15">
              <UserAvatar user={user} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-white">{getUserDisplayName(user)}</p>
                <p className="text-xs text-white/60 truncate">{user?.email}</p>
                {isAdmin && (
                  <span className="text-[10px] font-medium text-[#22d3ee]">Administrador</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/70 mb-3">Entre para acompanhar encomendas e guardar preferências.</p>
              <GuestAuthButton fullWidth />
            </div>
          )}

          <nav className="flex flex-col gap-1" aria-label="Navegação Móvel">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={closeMobile}
                className={`flex min-h-11 items-center px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                  location.pathname === to
                    ? 'bg-[#22d3ee]/15 text-[#22d3ee]'
                    : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`}
                tabIndex={mobileOpen ? 0 : -1}
              >
                {label}
              </Link>
            ))}

            {isAuthed && (
              <>
                <div className="h-px bg-white/10 my-2" />
                <Link
                  to="/profile"
                  onClick={closeMobile}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  <User className="h-4 w-4 text-[#22d3ee]" /> Minha Conta
                </Link>
                <Link
                  to={accountHref('orders')}
                  onClick={closeMobile}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  <ShoppingBag className="h-4 w-4 text-[#22d3ee]" /> Encomendas
                </Link>
                <Link
                  to="/profile?tab=notifications"
                  onClick={closeMobile}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  <Bell className="h-4 w-4 text-[#22d3ee]" /> Notificações
                </Link>
                <Link
                  to="/profile?tab=biblioteca"
                  onClick={closeMobile}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  <Library className="h-4 w-4 text-[#22d3ee]" /> A minha biblioteca
                </Link>
                {colporteur && (
                  <Link
                    to={colporteurHref()}
                    onClick={closeMobile}
                    className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                    tabIndex={mobileOpen ? 0 : -1}
                  >
                    <BadgeCheck className="h-4 w-4 text-[#22d3ee]" /> Área do colportor
                  </Link>
                )}
                {canAccessAdmin && (
                  <Link
                    to="/admin"
                    onClick={closeMobile}
                    className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-white/80 hover:bg-white/5 hover:text-white"
                    tabIndex={mobileOpen ? 0 : -1}
                  >
                    <LayoutDashboard className="h-4 w-4 text-[#22d3ee]" /> Painel da equipa
                  </Link>
                )}
                {/* As secções do painel que esta pessoa pode abrir (antes: "Painel de Vendas" a
                    toda a equipa, mesmo a quem não lhe tinha acesso). */}
                {canAccessAdmin && staffShortcuts(adminPermissions({ isAdmin, hasPermission }), 3).map(({ id, to, label, icon: Icon }) => (
                  <Link
                    key={id}
                    to={to}
                    onClick={closeMobile}
                    className="flex min-h-11 items-center gap-3 py-2.5 pl-10 pr-3 text-sm font-medium rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
                    tabIndex={mobileOpen ? 0 : -1}
                  >
                    <Icon className="h-4 w-4 text-[#22d3ee]/80" aria-hidden="true" /> {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg hover:bg-destructive/10 text-destructive w-full text-left"
                  tabIndex={mobileOpen ? 0 : -1}
                >
                  <LogOut className="h-4 w-4" /> Terminar Sessão
                </button>
              </>
            )}
            <Link
              to="/track"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-11 items-center px-3 py-2.5 text-sm font-semibold rounded-lg hover:bg-white/5 text-[#22d3ee]"
              tabIndex={mobileOpen ? 0 : -1}
            >
              Rastrear Encomenda
            </Link>
            <Link
              to="/privacidade"
              onClick={closeMobile}
              className="flex min-h-11 items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
              tabIndex={mobileOpen ? 0 : -1}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Política de privacidade
            </Link>
          </nav>
        </div>
      </div>
    </header>
    </>
  );
};

export default Header;
