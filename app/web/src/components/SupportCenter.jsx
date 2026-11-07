import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Bot, Check, ChevronLeft, Loader2, Lock, MessageCircle, RefreshCw, Send, Sparkles, Star, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeForSearch } from '@/lib/searchUtils';
import { CodeChip } from '@/components/admin/users/userFormat';
import { getDeliveryStatusLabel, getOrderStatusLabel, getPaymentStatusLabel } from '@/lib/orderUtils';
import SupportRating from '@/components/assistant/SupportRating';
import SupportReport from '@/components/admin/SupportReport';
import { suggestSupportReply } from '@/lib/opsApi';
import {
  addSupportNote,
  createSupportThread,
  getSupportThread,
  listCustomerNotifications,
  listCustomerOrdersForSupport,
  listStaffNotifications,
  listSupportAssignees,
  listSupportMessages,
  listSupportThreads,
  listSupportTeams,
  listSavedReplies,
  saveSavedReply,
  deleteSavedReply,
  fillSavedReply,
  setSupportTeam,
  slaState,
  markCustomerNotificationRead,
  markStaffNotificationRead,
  markSupportThreadRead,
  sendSupportMessage,
  updateSupportThread,
} from '@/lib/supportApi';

const STATUS_LABELS = {
  bot: 'Com o assistente',
  open: 'Aberta',
  pending: 'A aguardar cliente',
  closed: 'Resolvida',
};

// Para o cliente, os estados lêem-se do lado dele.
const CUSTOMER_STATUS_LABELS = {
  bot: 'Conversa com o assistente',
  open: 'A aguardar a equipa',
  pending: 'A equipa respondeu',
  closed: 'Resolvido',
};

const CATEGORY_LABELS = {
  order: 'Encomenda',
  payment: 'Pagamento',
  delivery: 'Entrega',
  return: 'Devolução',
  product: 'Livros',
  account: 'Conta',
  other: 'Outro assunto',
};

const PRIORITY_LABELS = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

const threadTitle = (thread) => `${thread.ticket_number ? `#${thread.ticket_number} · ` : ''}${thread.subject}`;

/** Quem escreveu: pelo author_kind (migração nova) ou, antes dela, pelo remetente. */
function authorOf(message, thread) {
  if (message.author_kind) return message.author_kind;
  return message.sender_id && message.sender_id === thread?.customer_id ? 'customer' : 'staff';
}

const NOTIFICATION_KINDS = {
  order: 'Encomenda',
  payment: 'Pagamento',
  delivery: 'Entrega',
  support: 'Atendimento',
  new_order: 'Nova encomenda',
  order_stuck: 'Encomenda parada',
  order_problem: 'Problema do cliente',
  order_confirmed: 'Cliente confirmou a recepção',
  payment_reported: 'Pagamento indicado pelo cliente',
  order_overdue: 'Entrega fora do prazo',
  order_unacknowledged: 'Encomenda por assumir',
  ticket_sla: 'Prazo de pedido de ajuda',
  escalation: 'Escalada: ninguém assumiu',
  ops_test: 'Teste de avisos',
  security: 'Segurança',
};

// Avisos da vigilância: levam ao Acompanhamento, onde se assume e trata.
const WATCH_KINDS = new Set(['order_stuck', 'order_overdue', 'order_unacknowledged', 'escalation', 'order_problem']);

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' });
}

function unreadThread(thread, staff, userId) {
  const lastRead = staff ? thread.staff_last_read_at : thread.customer_last_read_at;
  return thread.last_sender_id !== userId
    && new Date(thread.last_message_at).getTime() > new Date(lastRead).getTime();
}

export default function SupportCenter({ compact = false, onOpenAssistant }) {
  const { user, isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const staff = isAdmin || hasPermission('manage_orders');
  const [section, setSection] = useState(staff ? 'threads' : 'notifications');
  const [threads, setThreads] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [savedReplies, setSavedReplies] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [threadStatusFilter, setThreadStatusFilter] = useState('active');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [composeMode, setComposeMode] = useState('reply');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newOrderId, setNewOrderId] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // A conversa aberta continua à vista mesmo quando sai do filtro (fechada, assumida pela
  // equipa): a lista vem filtrada do servidor, por isso é pedida à parte.
  const selectedIdRef = useRef('');
  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setError('');
    try {
      const [listed, notificationRows, extra] = await Promise.all([
        listSupportThreads({ staff, customerId: user.id, statusFilter: threadStatusFilter }),
        staff ? listStaffNotifications() : listCustomerNotifications(),
        staff ? listSupportAssignees() : listCustomerOrdersForSupport(user.id),
      ]);
      let threadRows = listed;
      const openId = selectedIdRef.current;
      if (openId && !listed.some((thread) => thread.id === openId)) {
        const pinned = await getSupportThread(openId, { staff }).catch(() => null);
        if (pinned) threadRows = [...listed, pinned];
      }
      setThreads(threadRows);
      setNotifications(notificationRows);
      if (staff) {
        setAssignees(extra);
        listSupportTeams().then(setTeams).catch(() => {});
        listSavedReplies().then(setSavedReplies).catch(() => {});
      } else setOrders(extra);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o atendimento.');
    } finally {
      setLoading(false);
    }
  }, [staff, user?.id, threadStatusFilter]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedId) || null,
    [threads, selectedId],
  );

  const visibleThreads = useMemo(() => {
    const query = normalizeForSearch(threadSearch);
    return threads.filter((thread) => {
      if (staff && threadStatusFilter === 'active' && !['open', 'pending'].includes(thread.status)) return false;
      if (staff && threadStatusFilter !== 'active' && threadStatusFilter !== 'all'
        && thread.status !== threadStatusFilter) return false;
      if (staff && assigneeFilter === 'mine' && thread.assigned_to !== user?.id) return false;
      if (staff && assigneeFilter === 'unassigned' && thread.assigned_to) return false;
      if (!query) return true;
      return [
        thread.subject,
        thread.customer?.name,
        thread.customer?.email,
        thread.customer?.customer_code,
        thread.order?.order_number,
        thread.order_id,
        thread.ticket_number ? `#${thread.ticket_number}` : '',
        thread.ticket_number ? String(thread.ticket_number) : '',
      ].some((value) => normalizeForSearch(value).includes(query));
    });
  }, [threads, staff, threadStatusFilter, assigneeFilter, threadSearch, user?.id]);

  const loadMessages = useCallback(async (threadId) => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    try {
      const rows = await listSupportMessages(threadId);
      setMessages(rows);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as mensagens.');
    }
  }, []);

  useEffect(() => {
    loadMessages(selectedId);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = window.setInterval(async () => {
      try {
        await markSupportThreadRead(selectedId);
        await loadMessages(selectedId);
      } catch (err) {
        setError(err.message || 'Não foi possível actualizar a conversa.');
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadMessages, selectedId]);

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const unreadMessages = threads.filter((thread) => unreadThread(thread, staff, user?.id)).length;

  const openThread = async (thread) => {
    selectedIdRef.current = thread.id;
    setSelectedId(thread.id);
    setShowNewThread(false);
    setSection('threads');
    try {
      await markSupportThreadRead(thread.id);
      await Promise.all([loadMessages(thread.id), refresh()]);
    } catch (err) {
      setError(err.message || 'Não foi possível abrir esta conversa.');
    }
  };

  const markNotificationRead = async (notification) => {
    try {
      if (!notification.read_at) {
        if (staff) await markStaffNotificationRead(notification.id);
        else await markCustomerNotificationRead(notification.id);
      }
      if (notification.thread_id) {
        // A conversa pode não estar na lista (filtro de outro estado): pede-se à parte.
        const thread = threads.find((item) => item.id === notification.thread_id)
          || await getSupportThread(notification.thread_id, { staff }).catch(() => null);
        if (thread) {
          await openThread(thread);
          return;
        }
      }
      await refresh();
      if (notification.order_id) {
        navigate(staff ? (WATCH_KINDS.has(notification.kind) ? '/admin?tab=acompanhamento' : '/admin?tab=orders') : notification.href || '/profile?tab=orders');
      } else if (staff && notification.kind === 'security') {
        // Aviso do registo de segurança (alteração a pagamentos, permissões, contactos…).
        navigate('/admin?tab=seguranca');
      } else if (notification.href?.startsWith('/')) {
        navigate(notification.href);
      }
    } catch (err) {
      setError(err.message || 'Não foi possível actualizar a notificação.');
    }
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    if (!selectedId || !messageDraft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      if (staff && composeMode === 'note') await addSupportNote(selectedId, messageDraft);
      else await sendSupportMessage(selectedId, messageDraft);
      setMessageDraft('');
      await Promise.all([loadMessages(selectedId), refresh()]);
    } catch (err) {
      setError(err.message || 'A mensagem não foi enviada.');
    } finally {
      setSending(false);
    }
  };

  const submitNewThread = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const id = await createSupportThread({
        subject: newSubject,
        body: newBody,
        orderId: newOrderId || null,
      });
      setNewSubject('');
      setNewBody('');
      setNewOrderId('');
      setShowNewThread(false);
      setSelectedId(id);
      setSection('threads');
      await Promise.all([refresh(), loadMessages(id)]);
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar a conversa.');
    } finally {
      setCreating(false);
    }
  };

  const changeThread = async (field, value) => {
    if (!selectedThread) return;
    const next = {
      threadId: selectedThread.id,
      // Uma conversa ainda com o assistente passa a "Aberta" quando a equipa mexe noutro campo.
      status: field === 'status' ? value : (selectedThread.status === 'bot' ? 'open' : selectedThread.status),
      assignedTo: field === 'assigned_to' ? (value === '_none' ? null : value) : selectedThread.assigned_to,
      priority: field === 'priority' ? value : (selectedThread.priority || null),
      category: field === 'category' ? value : (selectedThread.category || null),
    };
    try {
      await updateSupportThread(next);
      await refresh();
    } catch (err) {
      setError(err.message || 'Não foi possível actualizar a conversa.');
    }
  };

  const staffName = (id) => {
    if (id && id === user?.id) return 'Você';
    const person = assignees.find((a) => a.id === id);
    return person?.name || person?.email || 'Equipa';
  };

  const viewNotifications = (
    <div className="space-y-2">
      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Ainda não tem notificações.
        </div>
      ) : notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          onClick={() => markNotificationRead(notification)}
          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${notification.read_at ? 'bg-card' : 'border-primary/30 bg-primary/5'}`}
        >
          <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Bell className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{notification.title}</span>
              {!notification.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">{notification.body}</span>
            <span className="mt-2 block text-[11px] text-muted-foreground">
              {NOTIFICATION_KINDS[notification.kind] || 'Aviso'} · {formatDate(notification.created_at)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  const viewThreadList = (
    <div className="space-y-2">
      {!staff && (
        <Button type="button" className="w-full btn-primary" onClick={() => { setShowNewThread(true); setSelectedId(''); }}>
          <MessageCircle className="mr-2 h-4 w-4" /> Nova conversa
        </Button>
      )}
      {staff && !compact && (
        <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
          <Input
            value={threadSearch}
            onChange={(event) => setThreadSearch(event.target.value)}
            placeholder="Pesquisar cliente ou assunto…"
            aria-label="Pesquisar conversas"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Select value={threadStatusFilter} onValueChange={setThreadStatusFilter}>
              <SelectTrigger aria-label="Filtrar conversas por estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Abertas e pendentes</SelectItem>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="pending">A aguardar cliente</SelectItem>
                <SelectItem value="bot">Com o assistente (agora)</SelectItem>
                <SelectItem value="closed">Resolvidas</SelectItem>
                <SelectItem value="all">Todos os estados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger aria-label="Filtrar conversas por responsável"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                <SelectItem value="mine">Atribuídas a mim</SelectItem>
                <SelectItem value="unassigned">Sem responsável</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {visibleThreads.length} de {threads.length} conversas (máximo de 100 recentes)
          </p>
        </div>
      )}
      {visibleThreads.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <MessageCircle className="mx-auto mb-2 h-6 w-6 opacity-50" />
          {threads.length === 0
            ? (staff
              ? (threadStatusFilter === 'active' ? 'Não há pedidos à espera. Em "Com o assistente" vê as conversas em curso.' : 'Não há conversas neste estado.')
              : 'Ainda não iniciou uma conversa com a equipa.')
            : 'Nenhuma conversa corresponde a estes filtros.'}
        </div>
      ) : visibleThreads.map((thread) => {
        const unread = unreadThread(thread, staff, user?.id);
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => openThread(thread)}
            className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === thread.id ? 'border-primary bg-primary/5' : 'bg-card'}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold">
                  {thread.channel === 'assistant' && <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Começou no assistente" />}
                  <span className="truncate">{threadTitle(thread)}</span>
                </span>
                {staff && (
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{thread.customer?.name || thread.customer?.email || (thread.customer_id ? 'Cliente' : 'Visitante sem conta')}</span>
                    <CodeChip code={thread.customer?.customer_code} />
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {staff && Object.values(slaState(thread)).includes('late') && (
                  <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">Fora do prazo</span>
                )}
                {staff && ['high', 'urgent'].includes(thread.priority) && thread.status !== 'closed' && (
                  <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">{PRIORITY_LABELS[thread.priority]}</span>
                )}
                {unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
            </span>
            <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {(staff ? STATUS_LABELS : CUSTOMER_STATUS_LABELS)[thread.status] || thread.status}
                {staff && thread.category && thread.category !== 'other' ? ` · ${CATEGORY_LABELS[thread.category] || thread.category}` : ''}
              </span>
              <span>{formatDate(thread.last_message_at)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const threadView = selectedThread && (
    <section className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="space-y-3 border-b p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {compact && (
              <Button type="button" size="sm" variant="ghost" className="-ml-2 mb-1 h-7" onClick={() => setSelectedId('')}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Conversas
              </Button>
            )}
            <h3 className="text-base font-semibold leading-snug">{threadTitle(selectedThread)}</h3>
            {staff && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedThread.customer?.name || selectedThread.customer?.email || (selectedThread.customer_id ? 'Cliente' : 'Visitante sem conta')}
                {selectedThread.customer?.email && selectedThread.customer?.name ? ` · ${selectedThread.customer.email}` : ''}
                {selectedThread.customer?.customer_code && <span className="ml-2 align-middle"><CodeChip code={selectedThread.customer.customer_code} /></span>}
              </p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${selectedThread.status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
            {(staff ? STATUS_LABELS : CUSTOMER_STATUS_LABELS)[selectedThread.status] || selectedThread.status}
          </span>
        </div>
        {staff && selectedThread.status === 'bot' && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
            <Bot className="mr-1 inline h-3.5 w-3.5 text-primary" />
            O assistente está a responder a este cliente. Se enviar uma resposta, a conversa passa a pedido, fica atribuída a si e o assistente deixa de responder.
          </p>
        )}
        {staff && !selectedThread.customer_id && selectedThread.status !== 'closed' && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-50 p-2.5 text-xs text-amber-900">
            Visitante sem conta: só vê a resposta se voltar a abrir o chat no mesmo browser.
          </p>
        )}
        {staff && selectedThread.ai_summary && (
          <details className="rounded-lg border bg-muted/40 p-2.5 text-xs" open={selectedThread.status === 'open'}>
            <summary className="cursor-pointer font-semibold">Resumo da passagem para a equipa</summary>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{selectedThread.ai_summary}</p>
          </details>
        )}
        {staff && selectedThread.ticket_number && ['open', 'pending'].includes(selectedThread.status) && (selectedThread.first_response_due_at || selectedThread.resolution_due_at) && (() => {
          const sla = slaState(selectedThread);
          const tone = (st) => (st === 'late' ? 'bg-destructive/10 text-destructive font-semibold' : st === 'soon' ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground');
          return (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {sla.first && <span className={`rounded-full px-2 py-1 ${tone(sla.first)}`}>{sla.first === 'late' ? 'Primeira resposta em atraso' : 'Responder até'} · {formatDate(selectedThread.first_response_due_at)}</span>}
              {sla.resolution && <span className={`rounded-full px-2 py-1 ${tone(sla.resolution)}`}>{sla.resolution === 'late' ? 'Resolução em atraso' : 'Resolver até'} · {formatDate(selectedThread.resolution_due_at)}</span>}
            </div>
          );
        })()}
        {staff && selectedThread.csat_score && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Avaliação do cliente:
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={`h-3.5 w-3.5 ${n <= selectedThread.csat_score ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
            ))}
            {selectedThread.csat_comment ? <span className="ml-1">«{selectedThread.csat_comment}»</span> : null}
          </p>
        )}
        {staff && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={selectedThread.status === 'bot' ? '' : selectedThread.status} onValueChange={(value) => changeThread('status', value)}>
              <SelectTrigger aria-label="Estado da conversa" className="h-9"><SelectValue placeholder="Com o assistente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="pending">A aguardar cliente</SelectItem>
                <SelectItem value="closed">Resolvida</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedThread.assigned_to || '_none'} onValueChange={(value) => changeThread('assigned_to', value)}>
              <SelectTrigger aria-label="Responsável pela conversa" className="h-9"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sem responsável</SelectItem>
                {assignees.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>
                    {assignee.name || assignee.email || 'Funcionário'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedThread.priority && (
              <Select value={selectedThread.priority} onValueChange={(value) => changeThread('priority', value)}>
                <SelectTrigger aria-label="Prioridade" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>Prioridade {label.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {teams.length > 0 && selectedThread.ticket_number && (
              <Select
                value={selectedThread.team_id || '_none'}
                onValueChange={async (value) => {
                  try {
                    await setSupportTeam(selectedThread.id, value === '_none' ? null : value);
                    await refresh();
                  } catch (err) {
                    setError(err.message || 'Não foi possível mudar a equipa.');
                  }
                }}
              >
                <SelectTrigger aria-label="Equipa" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem equipa</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>Equipa: {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {selectedThread.category && (
              <Select value={selectedThread.category} onValueChange={(value) => changeThread('category', value)}>
                <SelectTrigger aria-label="Categoria" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {selectedThread.order && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
            <p className="font-semibold">Encomenda {selectedThread.order.order_number || selectedThread.order.id}</p>
            <p className="mt-1 text-muted-foreground">
              Estado: {getOrderStatusLabel(selectedThread.order.status) || '—'}
              {' · '}Pagamento: {getPaymentStatusLabel(selectedThread.order.payment_status)}
              {' · '}Entrega: {getDeliveryStatusLabel(selectedThread.order.delivery_status)}
            </p>
          </div>
        )}
      </header>
      <div className={`flex-1 space-y-3 overflow-y-auto p-3 ${compact ? 'max-h-64' : 'max-h-[480px]'}`}>
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há mensagens nesta conversa.</p>
        ) : messages.map((message) => {
          const author = authorOf(message, selectedThread);
          const when = formatDate(message.created_at);
          if (author === 'system') {
            return (
              <p key={message.id} className="mx-auto max-w-[92%] rounded-lg bg-muted/60 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                {message.body} · {when}
              </p>
            );
          }
          if (author === 'note') {
            return (
              <div key={message.id} className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                  <Lock className="h-3 w-3" /> Nota interna · {staffName(message.sender_id)} · só a equipa vê
                </p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <time className="mt-1 block text-[10px] text-amber-800/70" dateTime={message.created_at}>{when}</time>
              </div>
            );
          }
          // Do lado direito fica quem está a ver: o cliente vê as suas; a equipa vê as da equipa.
          const mine = staff ? author === 'staff' : author === 'customer';
          const label = author === 'assistant' ? 'Assistente'
            : author === 'staff' ? (staff ? staffName(message.sender_id) : 'Equipa')
              : (staff ? (selectedThread.customer?.name || 'Cliente') : 'Você');
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                mine ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : author === 'assistant' ? 'rounded-bl-sm border border-primary/15 bg-primary/5'
                    : 'rounded-bl-sm bg-muted'
              }`}
              >
                <p className={`mb-0.5 flex items-center gap-1 text-[10px] font-semibold ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {author === 'assistant' && <Sparkles className="h-3 w-3" />} {label}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <time className={`mt-1 block text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} dateTime={message.created_at}>
                  {when}
                </time>
              </div>
            </div>
          );
        })}
      </div>
      {!staff && selectedThread.status === 'bot' ? (
        // Uma conversa ainda com o assistente continua no assistente (é lá que ele responde).
        <div className="border-t p-3 text-center">
          <Button type="button" size="sm" className="btn-primary" onClick={() => onOpenAssistant?.()} disabled={!onOpenAssistant}>
            <Sparkles className="mr-1.5 h-4 w-4" /> Continuar no assistente
          </Button>
        </div>
      ) : selectedThread.status !== 'closed' ? (
        <form onSubmit={submitMessage} className="space-y-2 border-t p-3">
          {staff && (
            <div className="flex gap-1" role="tablist" aria-label="Tipo de mensagem">
              {[['reply', 'Responder ao cliente'], ['note', 'Nota interna']].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={composeMode === mode}
                  onClick={() => setComposeMode(mode)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${composeMode === mode
                    ? (mode === 'note' ? 'bg-amber-100 text-amber-900' : 'bg-primary/10 text-primary')
                    : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {mode === 'note' && <Lock className="mr-1 inline h-3 w-3" />}{label}
                </button>
              ))}
              <button
                type="button"
                disabled={suggesting}
                onClick={async () => {
                  setSuggesting(true);
                  setError('');
                  try {
                    const r = await suggestSupportReply(selectedThread.id);
                    setMessageDraft((d) => (d.trim() ? `${d.trim()}\n\n${r.reply}` : r.reply));
                    setComposeMode('reply');
                  } catch (err) {
                    setError(err.message || 'Não foi possível sugerir uma resposta.');
                  } finally {
                    setSuggesting(false);
                  }
                }}
                title="Rascunho escrito pela IA com a conversa, as encomendas do cliente e as regras da loja. Leia e corrija antes de enviar."
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Sugerir resposta
              </button>
              <button
                type="button"
                onClick={() => setShowSaved((v) => !v)}
                aria-expanded={showSaved}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                Respostas rápidas{savedReplies.length ? ` (${savedReplies.length})` : ''}
              </button>
            </div>
          )}
          {staff && showSaved && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
              {savedReplies.length === 0 && <p className="p-2 text-xs text-muted-foreground">Ainda não há respostas rápidas.</p>}
              {savedReplies.map((r) => (
                <div key={r.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const text = fillSavedReply(r.body, selectedThread);
                      setMessageDraft((d) => (d.trim() ? `${d.trim()}\n\n${text}` : text));
                      setComposeMode('reply');
                      setShowSaved(false);
                    }}
                    className="min-w-0 flex-1 rounded-md p-2 text-left text-xs hover:bg-background"
                  >
                    <span className="block font-semibold">{r.title}</span>
                    <span className="line-clamp-2 text-muted-foreground">{fillSavedReply(r.body, selectedThread)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Apagar a resposta rápida ${r.title}`}
                    onClick={async () => {
                      if (!window.confirm(`Apagar a resposta rápida "${r.title}"?`)) return;
                      try {
                        await deleteSavedReply(r.id);
                        setSavedReplies((list) => list.filter((x) => x.id !== r.id));
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                    className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={!messageDraft.trim()}
                onClick={async () => {
                  const title = window.prompt('Título da resposta rápida (use {nome}, {pedido} e {encomenda} no texto):', '');
                  if (!title) return;
                  try {
                    await saveSavedReply({ title, body: messageDraft });
                    setSavedReplies(await listSavedReplies());
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                className="w-full rounded-md border border-dashed p-2 text-xs font-semibold text-primary disabled:opacity-50"
              >
                Guardar o texto escrito como resposta rápida
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              maxLength={4000}
              rows={2}
              placeholder={staff
                ? (composeMode === 'note' ? 'Nota só para a equipa (o cliente não a vê)…' : 'Responder ao cliente…')
                : 'Escreva à equipa…'}
              aria-label="Mensagem de atendimento"
              className={`min-h-10 resize-y text-sm ${staff && composeMode === 'note' ? 'border-amber-500/50 bg-amber-50/50' : ''}`}
            />
            <Button type="submit" size="icon" aria-label={composeMode === 'note' && staff ? 'Guardar nota' : 'Enviar mensagem'} disabled={sending || !messageDraft.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2 border-t p-3">
          {!staff && selectedThread.ticket_number && !selectedThread.csat_score && selectedThread.csat_score !== undefined && (
            <SupportRating compact threadId={selectedThread.id} onRated={refresh} />
          )}
          <p className="text-center text-xs text-muted-foreground">
            Conversa resolvida. {staff ? 'Mude o estado para a reabrir.' : 'Se precisar de mais ajuda, escreva no assistente ou inicie uma nova conversa.'}
          </p>
        </div>
      )}
    </section>
  );

  const newThreadForm = (
    <form onSubmit={submitNewThread} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Falar com a equipa</h3>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewThread(false)}>Cancelar</Button>
      </div>
      <Input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} maxLength={160} placeholder="Assunto" required />
      {orders.length > 0 && (
        <Select value={newOrderId || '_none'} onValueChange={(value) => setNewOrderId(value === '_none' ? '' : value)}>
          <SelectTrigger aria-label="Associar encomenda"><SelectValue placeholder="Associar encomenda (opcional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Sem encomenda associada</SelectItem>
            {orders.map((order) => (
              <SelectItem key={order.id} value={order.id}>
              {order.order_number || order.id} · {getOrderStatusLabel(order.status) || 'Em processamento'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} maxLength={4000} rows={4} placeholder="Como podemos ajudar?" required />
      <Button type="submit" className="w-full btn-primary" disabled={creating || !newSubject.trim() || !newBody.trim()}>
        {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar mensagem
      </Button>
    </form>
  );

  return (
    <div className={`space-y-4 ${compact ? '' : 'rounded-2xl border bg-background p-4 sm:p-6'}`}>
      {!compact && (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{staff ? 'Atendimento ao cliente' : 'Notificações e atendimento'}</h2>
            <p className="text-sm text-muted-foreground">
              {staff ? 'Organize conversas, responsáveis, estados e contexto das encomendas.' : 'Acompanhe avisos e fale directamente com a equipa.'}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </header>
      )}

      {staff && !compact && <SupportReport />}

      <nav className="flex gap-2 border-b pb-2" aria-label="Área de atendimento">
        <Button
          type="button"
          size="sm"
          variant={section === 'notifications' ? 'default' : 'ghost'}
          onClick={() => { setSection('notifications'); setSelectedId(''); setShowNewThread(false); }}
        >
          <Bell className="mr-1.5 h-4 w-4" />
          Notificações{unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={section === 'threads' ? 'default' : 'ghost'}
          onClick={() => { setSection('threads'); setShowNewThread(false); }}
        >
          <MessageCircle className="mr-1.5 h-4 w-4" />
          {staff ? 'Conversas' : 'Mensagens'}{unreadMessages > 0 ? ` (${unreadMessages})` : ''}
        </Button>
      </nav>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          {error.toLowerCase().includes('support_') || error.toLowerCase().includes('customer_notifications')
            ? <span className="mt-1 block">O centro de atendimento ainda precisa da migração do Supabase.</span>
            : null}
        </div>
      )}

      {loading && threads.length === 0 && notifications.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : section === 'notifications' ? viewNotifications : (
        <div className={compact ? 'space-y-3' : 'grid gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]'}>
          {!(compact && (selectedThread || showNewThread)) && viewThreadList}
          <div className="min-w-0">
            {showNewThread ? newThreadForm : threadView || (
              <div className="hidden min-h-[360px] items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground lg:flex">
                <div>
                  <UserRound className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Seleccione uma conversa para ver o histórico e o contexto.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!compact && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="h-3 w-3" /> As conversas são privadas e visíveis apenas ao cliente e à equipa autorizada.
          <Link to={staff ? '/admin?tab=orders' : '/profile?tab=orders'} className="ml-auto text-primary hover:underline">
            {staff ? 'Encomendas' : 'A minha conta'}
          </Link>
        </p>
      )}
    </div>
  );
}
