import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Bell, RotateCcw, Headset, Loader2, ArrowDown } from 'lucide-react';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useAuth } from '@/hooks/useAuth';
import { useChatPosition } from '@/hooks/useChatPosition';
import {
  escalateChat, fetchChatConfig, loadChatSession, sendChatFeedback, sendChatMessage, startNewChat,
} from '@/lib/assistantApi';
import ChatRichMessage from '@/components/assistant/ChatRichMessage';
import ChatHome from '@/components/assistant/ChatHome';
import HandoffCard from '@/components/assistant/HandoffCard';
import SupportRating from '@/components/assistant/SupportRating';
import { TicketWaiting, useNow } from '@/components/assistant/TeamAvailability';
import { teamAvailability } from '@/lib/teamHours';
import SupportCenter from '@/components/SupportCenter';
import { countUnreadSupportReplies, markThreadNotificationsRead } from '@/lib/supportApi';

const DEFAULT_WELCOME = 'Olá! Sou o assistente da livraria. Posso ver as suas encomendas, responder sobre envios, pagamentos e devoluções, e encontrar livros. Se precisar, passo a conversa à nossa equipa.';

// Os atalhos iniciais estão no ecrã de início (ChatHome); depois, cada resposta traz sugestões.

const TICKET_STATUS = {
  open: 'A aguardar a equipa',
  pending: 'A equipa respondeu',
  closed: 'Resolvido',
};

// Com a equipa a responder, o chat procura mensagens novas enquanto está aberto.
const POLL_MS = 15000;

function toApiHistory(messages) {
  return messages
    .filter((m) => m.text && (m.role === 'user' || m.role === 'bot'))
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;

const MAX_LENGTH = 800;
const GROUP_GAP_MS = 5 * 60 * 1000;

const asDate = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? null : d;
};
const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();

export function dayLabel(date, now = new Date()) {
  if (!date) return '';
  if (sameDay(date, now)) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Arruma as mensagens em blocos, como os mensageiros: separador de dia, avatar no início de
 * cada bloco do mesmo autor e a hora só no fim do bloco (ou depois de uma pausa de 5 minutos).
 */
export function layoutMessages(messages, now = new Date()) {
  const authorKey = (m) => `${m.role}:${m.author || ''}`;
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const at = asDate(msg.created_at);
    const prevAt = asDate(prev?.created_at);
    const nextAt = asDate(next?.created_at);
    const newDay = !!at && (!prevAt || !sameDay(at, prevAt));
    const startsGroup = !prev || newDay || authorKey(prev) !== authorKey(msg) || (at && prevAt && at - prevAt > GROUP_GAP_MS);
    const endsGroup = !next || authorKey(next) !== authorKey(msg) || (nextAt && !sameDay(nextAt, at))
      || (at && nextAt && nextAt - at > GROUP_GAP_MS);
    return {
      msg,
      day: newDay ? dayLabel(at, now) : '',
      showAvatar: !!startsGroup,
      time: endsGroup && at ? at.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }) : '',
    };
  });
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2" aria-label="O assistente está a escrever">
      <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary shadow-xs">
        <img src="/logo-icon-light.svg" alt="" className="h-4 w-4 object-contain" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3 shadow-xs">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LivrariaAssistant() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, isAuthed, isAdmin, hasPermission } = useAuth();
  const { settings } = useSiteSettings();
  const { fixedStyle } = useChatPosition();
  const now = useNow();

  const canUseStaffInbox = isAdmin || hasPermission('manage_orders');
  const canUseSupport = isAuthed && (canUseStaffInbox || pathname !== '/login');
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState('assistant');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatConfig, setChatConfig] = useState({ enabled: true, ai: false, provider: 'faq', handoff: false, whatsapp: '' });
  // Servidor antigo (sem conversas guardadas) durante a publicação: o chat funciona como antes.
  const [legacy, setLegacy] = useState(false);
  const [session, setSession] = useState({ loaded: false, loading: false, conversation: null, orders: [], openTickets: [] });
  const [messages, setMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const [handoff, setHandoff] = useState({ dismissedFor: null, forced: false, busy: false, error: '' });
  const scrollRef = useRef(null);
  const lastRef = useRef(null);
  const inputRef = useRef(null);
  const tempId = useRef(0);
  // Mensagens já mostradas: só as novas entram com animação (o histórico aparece de uma vez).
  const shownIds = useRef(new Set());
  // O cliente está a ler mais acima? Então uma mensagem nova não o arrasta: aparece um botão.
  const atBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  // Respostas da equipa por ler: o ponto no botão, para o cliente saber sem abrir o chat.
  const [unread, setUnread] = useState(0);
  const watchReplies = isAuthed && !canUseStaffInbox;
  const refreshUnread = useCallback(async () => {
    if (!watchReplies) { setUnread(0); return; }
    setUnread(await countUnreadSupportReplies().catch(() => 0));
  }, [watchReplies]);
  useEffect(() => {
    refreshUnread();
    if (!watchReplies) return undefined;
    const timer = window.setInterval(() => { if (!document.hidden) refreshUnread(); }, 60000);
    return () => window.clearInterval(timer);
  }, [watchReplies, refreshUnread]);

  useEffect(() => {
    fetchChatConfig().then((cfg) => {
      setChatConfig(cfg);
      // Só o servidor antigo responde sem `handoff`; numa falha de rede (null) tenta-se a sessão,
      // e um 404 aí é que decide o modo antigo.
      if (cfg.handoff === false) setLegacy(true);
    });
  }, []);

  const applySession = useCallback((data) => {
    setSession({
      loaded: true,
      loading: false,
      conversation: data.conversation || null,
      orders: data.orders || [],
      openTickets: data.open_tickets || [],
    });
    for (const m of data.messages || []) shownIds.current.add(m.id);
    setMessages(data.messages || []);
  }, []);

  const refreshSession = useCallback(async ({ quiet = false } = {}) => {
    if (legacy) return;
    if (!quiet) setSession((s) => ({ ...s, loading: true }));
    try {
      applySession(await loadChatSession());
      if (!quiet) setNotice('');
    } catch (err) {
      if (err.status === 404) setLegacy(true);
      else if (!quiet) setNotice(err.message);
      setSession((s) => ({ ...s, loaded: true, loading: false }));
    }
  }, [legacy, applySession]);

  // A conversa carrega na primeira abertura, e outra vez quando a sessão muda (ao entrar, a
  // conversa do browser passa para a conta; ao sair, começa uma nova).
  useEffect(() => {
    if (open && !session.loaded && !session.loading && chatConfig.handoff !== false && !legacy) refreshSession();
  }, [open, session.loaded, session.loading, chatConfig.handoff, legacy, refreshSession]);
  const lastUser = useRef(user?.id || '');
  useEffect(() => {
    if (lastUser.current === (user?.id || '')) return;
    lastUser.current = user?.id || '';
    setSession({ loaded: false, loading: false, conversation: null, orders: [], openTickets: [] });
    setMessages([]);
  }, [user?.id]);

  // ?ajuda=1 abre o assistente (regresso depois de entrar); ?atendimento=1 abre as mensagens.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const wantsHelp = params.has('ajuda');
    const wantsSupport = params.has('atendimento');
    if (!wantsHelp && !wantsSupport) return;
    setOpen(true);
    setActivePanel(wantsSupport && canUseSupport ? 'support' : 'assistant');
    params.delete('ajuda');
    params.delete('atendimento');
    const rest = params.toString();
    navigate(`${pathname}${rest ? `?${rest}` : ''}`, { replace: true });
  }, [search, pathname, navigate, canUseSupport]);

  const status = session.conversation?.status || 'bot';
  const withTeam = !!session.conversation && status !== 'bot';
  useEffect(() => {
    if (!open || legacy || !withTeam || status === 'closed') return undefined;
    const timer = window.setInterval(() => refreshSession({ quiet: true }), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, legacy, withTeam, status, refreshSession]);

  // Aberto numa conversa com a equipa: as respostas dessa conversa ficam lidas.
  const openTicketId = open && session.conversation?.ticket_number ? session.conversation.id : '';
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!openTicketId || !watchReplies) return;
    markThreadNotificationsRead(openTicketId).then(refreshUnread).catch(() => {});
  }, [openTicketId, lastMessageId, watchReplies, refreshUnread]);

  // Resposta nova com o início à vista (com livros, era mais alta do que a janela); a pergunta
  // do cliente e o indicador "a escrever" descem até ao fundo.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const last = messages[messages.length - 1];
    // A ler mais acima e chegou uma mensagem que não é dele: não o arrastar, avisar.
    if (!atBottom.current && last && last.role !== 'user') {
      setNewBelow(true);
      return;
    }
    if (!sending && last && last.role !== 'user' && messages.length > 1 && lastRef.current) {
      box.scrollTop = Math.max(0, lastRef.current.offsetTop - 12);
    } else {
      box.scrollTop = box.scrollHeight;
    }
    setNewBelow(false);
  }, [messages, open, sending, activePanel, handoff.forced]);

  // Registadas depois de mostradas: só uma mensagem que aparece pela primeira vez anima.
  useEffect(() => {
    for (const m of messages) shownIds.current.add(m.id);
  }, [messages]);

  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (atBottom.current) setNewBelow(false);
  }, []);
  const toBottom = () => {
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    atBottom.current = true;
    setNewBelow(false);
  };

  // A caixa de escrita cresce com o texto (até ~5 linhas) e volta ao tamanho de uma linha.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input, open]);

  // Esc fecha; no telemóvel o chat ocupa o ecrã todo, por isso a página por trás não rola.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const lock = isPhone();
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = 'hidden';
    // No computador, pronto a escrever; no telemóvel não, para o teclado não tapar a conversa.
    if (!lock) setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (lock) document.body.style.overflow = prev;
    };
  }, [open]);

  const send = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const temp = { id: `tmp-${(tempId.current += 1)}`, role: 'user', text: trimmed, pending: true, created_at: new Date().toISOString() };
    atBottom.current = true;
    setMessages((m) => [...m, temp]);
    setInput('');
    setNotice('');
    setSending(true);
    setHandoff((h) => ({ ...h, forced: false, error: '' }));
    try {
      const data = await sendChatMessage({ message: trimmed, page: pathname, history: toApiHistory(messages) });
      if (Array.isArray(data.messages)) {
        setMessages((m) => [...m.filter((x) => x.id !== temp.id), ...data.messages]);
        if (data.conversation) setSession((s) => ({ ...s, loaded: true, conversation: data.conversation }));
      } else {
        // Servidor antigo: a resposta vem solta e nada fica guardado.
        setLegacy(true);
        setMessages((m) => [...m.map((x) => (x.id === temp.id ? { ...x, pending: false } : x)), {
          id: `tmp-${(tempId.current += 1)}`,
          role: 'bot',
          created_at: new Date().toISOString(),
          text: data.reply || 'Desculpe, não consegui responder agora.',
          suggestions: data.suggestions,
          links: data.links,
          products: data.products,
        }]);
      }
    } catch (err) {
      // A mensagem volta para o campo de escrita: nada do que o cliente escreveu se perde.
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(trimmed);
      const wa = settings?.whatsapp ? ` Também pode escrever-nos pelo WhatsApp ${settings.whatsapp}.` : '';
      setNotice(`${err.message || 'Ocorreu um erro.'}${err.status === 429 ? '' : wa}`);
    } finally {
      setSending(false);
    }
  }, [sending, messages, pathname, settings?.whatsapp]);

  const confirmHandoff = useCallback(async ({ details, orderId }) => {
    setHandoff((h) => ({ ...h, busy: true, error: '' }));
    const lastBot = [...messages].reverse().find((m) => m.role === 'bot');
    try {
      const data = await escalateChat({ details, orderId, reason: lastBot?.handoff_reason || (handoff.forced ? 'feedback' : 'requested') });
      applySession({ ...data, orders: session.orders, open_tickets: session.openTickets });
      setHandoff({ dismissedFor: null, forced: false, busy: false, error: '' });
    } catch (err) {
      setHandoff((h) => ({ ...h, busy: false, error: err.message || 'Não foi possível passar à equipa.' }));
    }
  }, [messages, applySession, session.orders, session.openTickets, handoff.forced]);

  const giveFeedback = useCallback(async (message, value) => {
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, feedback: value } : x)));
    try {
      const data = await sendChatFeedback(message.id, value);
      if (data.offer_handoff) setHandoff((h) => ({ ...h, forced: true, dismissedFor: null }));
    } catch {
      setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, feedback: null } : x)));
    }
  }, []);

  const newConversation = useCallback(async () => {
    setNotice('');
    try {
      await startNewChat(pathname);
      setHandoff({ dismissedFor: null, forced: false, busy: false, error: '' });
      await refreshSession();
    } catch (err) {
      setNotice(err.message);
    }
  }, [pathname, refreshSession]);

  if (pathname === '/login' || (pathname.startsWith('/admin') && !canUseStaffInbox)) return null;
  if (chatConfig.enabled === false && !canUseSupport) return null;
  const showAssistant = chatConfig.enabled !== false && !pathname.startsWith('/admin');
  const showSupportTab = canUseSupport;
  const supportPanelLabel = canUseStaffInbox ? 'Atendimento' : 'Mensagens';
  const onSupport = showSupportTab && (!showAssistant || activePanel === 'support');
  const conversation = session.conversation;
  const ticket = conversation?.ticket_number ? conversation : null;
  const title = pathname.startsWith('/admin') ? 'Atendimento da Livraria' : 'Assistente da Livraria';
  const subtitle = onSupport ? 'Mensagens da equipa'
    : ticket ? `Pedido #${ticket.ticket_number} · ${TICKET_STATUS[ticket.status] || ''}`
      : 'Responde de imediato';

  const lastBot = [...messages].reverse().find((m) => m.role === 'bot');
  const lastMessage = messages[messages.length - 1];
  const offerKey = lastBot?.id ?? null;
  const showHandoff = !legacy && chatConfig.handoff !== false && status === 'bot' && !sending
    && ((lastBot?.offer_handoff && lastMessage === lastBot && handoff.dismissedFor !== offerKey) || handoff.forced);
  const loginHref = `/login?redirect=${encodeURIComponent(`${pathname}?ajuda=1`)}`;
  const welcomeText = chatConfig.welcome || DEFAULT_WELCOME;
  const laid = layoutMessages(messages);
  const lastSpoken = [...messages].reverse().find((m) => m.role === 'bot' || m.role === 'staff');
  const teamHours = chatConfig.team_hours || null;
  // Num pedido, o ponto do cabeçalho diz se a equipa está a trabalhar agora (o assistente está sempre).
  const team = teamAvailability(teamHours, now);
  const headerDotOn = ticket ? ticket.status !== 'closed' && (team ? team.open : true) : true;
  // O cliente escreveu e espera pela equipa: diz o que acontece a seguir e quando.
  const waitingForTeam = !!ticket && ticket.status === 'open' && !sending && lastMessage?.role !== 'staff';

  return (
    <div style={fixedStyle} className="flex flex-col items-start gap-2 pointer-events-none">
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={() => setOpen(true)}
            title="Ajuda"
            // Cor da marca com um aro branco: o azul-escuro de antes perdia-se no carrossel e no
            // rodapé, ambos escuros. O aro separa o botão de qualquer fundo, claro ou escuro.
            className="pointer-events-auto relative flex h-12 items-center gap-2 rounded-full bg-primary px-3.5 text-primary-foreground shadow-[0_6px_24px_rgba(0,0,0,0.28)] ring-2 ring-white/90 transition-colors hover:bg-primary/90 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-white 2xl:pr-4"
            aria-label={`${showSupportTab ? 'Ajuda, mensagens e atendimento' : 'Assistente da livraria'}${unread ? ` — ${unread} resposta(s) da equipa por ler` : ''}`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.92 }}
          >
            {/* A etiqueta só onde cabe na margem lateral: em 1366 px o botão com texto (~94 px)
                ficava por cima da capa do livro e das grelhas; só o ícone (48 px) cabe nos ~75 px
                de margem. O nome continua no aria-label e na dica. */}
            {showSupportTab ? (
              <span className="relative">
                <MessageCircle className="h-5 w-5 shrink-0" />
                <Bell className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-primary p-px text-primary-foreground" />
              </span>
            ) : (
              <MessageCircle className="h-5 w-5 shrink-0" />
            )}
            <span className="hidden text-sm font-semibold 2xl:inline">Ajuda</span>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white" aria-hidden>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            // Telemóvel: ecrã inteiro, por cima do cabeçalho e da barra de navegação. A partir de
            // 640 px: janela flutuante no canto.
            className="pointer-events-auto fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background sm:static sm:inset-auto sm:h-auto sm:max-h-[min(78vh,640px)] sm:w-[400px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl"
          >
            <header className="flex shrink-0 items-center gap-3 bg-primary px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-primary-foreground sm:pt-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                {ticket ? <Headset className="h-5 w-5" /> : <img src="/logo-icon-light.svg" alt="" className="h-5 w-5 object-contain" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{ticket && !onSupport ? 'Equipa da Livraria' : title}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-primary-foreground/75">
                  <span className={`h-1.5 w-1.5 rounded-full ${headerDotOn ? 'bg-emerald-400' : 'bg-white/50'}`} aria-hidden />
                  {subtitle}
                </p>
              </div>
              {!onSupport && !legacy && conversation && (
                <button
                  type="button"
                  onClick={newConversation}
                  title={ticket && ticket.status !== 'closed' ? `Nova conversa (o pedido #${ticket.ticket_number} continua aberto nas Mensagens)` : 'Nova conversa'}
                  aria-label="Nova conversa"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {(showAssistant && showSupportTab) && (
              <nav className="flex shrink-0 gap-1 border-b border-border bg-background p-1.5" aria-label="Assistente e mensagens">
                {[
                  ['assistant', Sparkles, 'Assistente'],
                  ['support', MessageCircle, supportPanelLabel],
                ].map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivePanel(key)}
                    aria-pressed={activePanel === key}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      activePanel === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </nav>
            )}

            {onSupport ? (
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3">
                <SupportCenter compact onOpenAssistant={() => setActivePanel('assistant')} />
              </div>
            ) : showAssistant ? (
              <>
                {!ticket && session.openTickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActivePanel('support')}
                    className="flex shrink-0 items-center gap-2 border-b border-border bg-amber-50 px-4 py-2 text-left text-xs text-amber-900 hover:bg-amber-100"
                  >
                    <Headset className="h-3.5 w-3.5 shrink-0" />
                    Tem o pedido #{session.openTickets[0].ticket_number} aberto com a equipa. Ver mensagens
                  </button>
                )}
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-3 py-4 sm:min-h-[300px]"
                >
                  {/* O que o assistente ou a equipa acabou de dizer, lido pelos leitores de ecrã. */}
                  <p className="sr-only" aria-live="polite">{lastSpoken?.text || ''}</p>
                  {session.loading && !session.loaded && (
                    <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar a conversa…
                    </p>
                  )}
                  {messages.length === 0 && !(session.loading && !session.loaded) && (
                    <ChatHome
                      name={user?.name}
                      welcome={welcomeText}
                      disabled={sending}
                      onPick={send}
                      onSearch={() => inputRef.current?.focus()}
                      teamHours={teamHours}
                    />
                  )}
                  <div className="space-y-1.5">
                    {laid.map(({ msg, day, showAvatar, time }, i) => {
                      const isLast = i === laid.length - 1;
                      const fresh = !shownIds.current.has(msg.id);
                      return (
                        <React.Fragment key={msg.id ?? `m-${i}`}>
                          {day && (
                            <div className="flex items-center gap-2 py-2 text-[11px] font-medium text-muted-foreground" role="separator">
                              <span className="h-px flex-1 bg-border" /> {day} <span className="h-px flex-1 bg-border" />
                            </div>
                          )}
                          <motion.div
                            ref={isLast ? lastRef : undefined}
                            initial={fresh ? { opacity: 0, y: 8 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className={showAvatar && i > 0 ? 'pt-2' : ''}
                          >
                            <ChatRichMessage
                              message={msg}
                              onSuggestionClick={send}
                              // Sugestões só na última resposta, e não quando a equipa já está na conversa.
                              showSuggestions={isLast && !sending && !withTeam && !showHandoff && (msg.role === 'bot')}
                              disabled={sending}
                              onFeedback={!legacy && msg === lastBot && status === 'bot' ? giveFeedback : undefined}
                              showAvatar={showAvatar}
                              time={time}
                              authed={isAuthed}
                            />
                          </motion.div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {sending && status === 'bot' && <div className="pt-2"><TypingBubble /></div>}
                  {/* Os cartões ficam na coluna das bolhas do assistente (depois do avatar). */}
                  {showHandoff && (
                    <div className="mt-3 pl-9">
                      <HandoffCard
                        authed={isAuthed}
                        orders={session.orders}
                        whatsapp={chatConfig.whatsapp || settings?.whatsapp || ''}
                        loginHref={loginHref}
                        busy={handoff.busy}
                        error={handoff.error}
                        onConfirm={confirmHandoff}
                        onDismiss={() => setHandoff({ dismissedFor: offerKey, forced: false, busy: false, error: '' })}
                        teamHours={teamHours}
                      />
                    </div>
                  )}
                  {waitingForTeam && (
                    <div className="mt-3 pl-9">
                      <TicketWaiting hours={teamHours} authed={isAuthed} />
                    </div>
                  )}
                  {newBelow && (
                    <div className="pointer-events-none sticky bottom-1 z-10 flex justify-center">
                      <button
                        type="button"
                        onClick={toBottom}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"
                      >
                        <ArrowDown className="h-3.5 w-3.5" /> Nova mensagem
                      </button>
                    </div>
                  )}
                  {ticket?.status === 'closed' && (
                    ticket.can_rate && isAuthed ? (
                      <div className="mt-3 pl-9">
                        <SupportRating compact threadId={ticket.id} onRated={() => refreshSession({ quiet: true })} />
                      </div>
                    ) : (
                      <p className="mt-3 text-center text-xs text-muted-foreground">
                        Pedido resolvido{ticket.csat_score ? ' e avaliado — obrigado' : ''}. Se escrever, começa uma nova conversa.
                      </p>
                    )
                  )}
                </div>

                {notice && (
                  <p role="alert" className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                    {notice}
                  </p>
                )}

                {/* As mensagens podem ir para um fornecedor de IA fora de Angola (Gemini, DeepSeek):
                    o visitante tem de o saber antes de escrever. Com a equipa responde uma pessoa,
                    por isso o aviso sai. Fica acima do formulário, que é o último elemento e leva o
                    espaço da safe-area do telemóvel. Não diz "dados pessoais": o assistente pede o
                    número e o email da compra para mostrar uma encomenda. */}
                {!withTeam && (
                  <p className="shrink-0 border-t border-border bg-background px-3 pt-1.5 text-center text-[10px] text-muted-foreground">
                    As respostas do assistente podem ser geradas por um serviço de IA externo. Não escreva palavras-passe nem dados de pagamento.
                  </p>
                )}
                <form
                  className={`flex shrink-0 items-end gap-2 bg-background px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3 ${withTeam ? 'border-t border-border pt-3' : ''}`}
                  onSubmit={(e) => { e.preventDefault(); send(input); }}
                >
                  <div className="relative min-w-0 flex-1">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      // Enter envia; Shift+Enter muda de linha. Durante a composição de acentos
                      // (teclados com teclas mortas, IME) o Enter não envia.
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder={withTeam && status !== 'closed' ? 'Escreva à equipa…' : 'Escreva a sua pergunta…'}
                      aria-label={withTeam ? 'Mensagem para a equipa' : 'Mensagem para o assistente'}
                      // 16 px no telemóvel: abaixo disso o Safari do iPhone amplia a página ao tocar.
                      className="block max-h-32 min-h-[44px] w-full resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2.5 text-base leading-snug placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:min-h-[40px] sm:py-2 sm:text-sm/5"
                      disabled={sending}
                      maxLength={MAX_LENGTH}
                      enterKeyHint="send"
                    />
                    {input.length > MAX_LENGTH - 150 && (
                      <span className="pointer-events-none absolute bottom-1 right-3 text-[10px] text-muted-foreground" aria-live="polite">
                        {input.length}/{MAX_LENGTH}
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    aria-label="Enviar"
                    disabled={sending || !input.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-opacity hover:bg-primary/90 disabled:opacity-40 sm:h-10 sm:w-10"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 p-6 text-center text-sm text-muted-foreground">
                O assistente está temporariamente indisponível.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
