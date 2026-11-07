import pb from '@/lib/dataClient';
import { APP_API_URL } from '@/lib/supabaseClient';

// Código da conversa de quem ainda não tem sessão. É secreto (só o hash fica no servidor) e
// fica neste browser: ao entrar na conta, a conversa passa para a conta e o código é apagado.
const TOKEN_KEY = 'livraria_chat_token';

export function getChatToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setChatToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* modo privado: a conversa dura o que durar a página */
  }
}

// `handoff`: true (servidor novo), false (servidor antigo, sem conversas guardadas) ou null (não se
// sabe: a leitura falhou). Uma falha momentânea da rede não pode pôr o chat no modo antigo.
const DEFAULT_CONFIG = { enabled: true, ai: false, provider: 'faq', handoff: null, whatsapp: '' };

export async function fetchChatConfig() {
  try {
    const res = await fetch(`${APP_API_URL}/chat/config`);
    if (!res.ok) return DEFAULT_CONFIG;
    const data = await res.json();
    return { ...DEFAULT_CONFIG, ...data, handoff: data.handoff === true };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Erro com o estado HTTP, para o chat distinguir "entre na conta" (401) de "rota antiga" (404). */
export class ChatApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Endereços por extenso: o apiRoutes.test.js confirma que cada um existe na Edge Function.
const CHAT_ROUTES = {
  session: `${APP_API_URL}/chat/session`,
  message: `${APP_API_URL}/chat`,
  escalate: `${APP_API_URL}/chat/escalate`,
  restart: `${APP_API_URL}/chat/new`,
  feedback: `${APP_API_URL}/chat/feedback`,
};

async function post(url, payload = {}) {
  const token = getChatToken();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
      },
      body: JSON.stringify({ ...payload, ...(token ? { token } : {}) }),
    });
  } catch {
    throw new ChatApiError('Sem ligação. Verifique a internet e tente outra vez.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChatApiError(data.message || 'Não foi possível falar com o assistente.', res.status);
  if (data.token) setChatToken(data.token);
  if (data.token_cleared) setChatToken('');
  return data;
}

/** Conversa actual (com o histórico), encomendas para associar e pedidos abertos. */
export const loadChatSession = () => post(CHAT_ROUTES.session);

/**
 * @param {{ message: string, page?: string, history?: Array<{role:string,content:string}> }} payload
 * `history` só serve à versão antiga do servidor, durante a publicação; a nova lê a conversa guardada.
 */
export const sendChatMessage = ({ message, page = '/', history = [] }) =>
  post(CHAT_ROUTES.message, { message: message.trim(), page, history: history.slice(-8) });

export const escalateChat = ({ details = '', orderId = '', reason = 'requested' } = {}) =>
  post(CHAT_ROUTES.escalate, { details: details.trim(), order_id: orderId || undefined, reason });

export const startNewChat = (page = '/') => post(CHAT_ROUTES.restart, { page });

export const sendChatFeedback = (messageId, value) => post(CHAT_ROUTES.feedback, { message_id: messageId, value });
