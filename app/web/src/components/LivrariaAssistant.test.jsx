import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = { user: null, isAuthed: false, isAdmin: false, hasPermission: () => false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { whatsapp: '923 000 000' } }) }));
vi.mock('@/hooks/useChatPosition', () => ({ useChatPosition: () => ({ fixedStyle: {} }) }));
vi.mock('@/components/SupportCenter', () => ({ default: () => <div>centro de atendimento</div> }));
const support = {
  rateSupportThread: vi.fn(async () => {}),
  countUnreadSupportReplies: vi.fn(async () => 0),
  markThreadNotificationsRead: vi.fn(async () => {}),
};
vi.mock('@/lib/supportApi', () => support);

const api = {
  fetchChatConfig: vi.fn(),
  loadChatSession: vi.fn(),
  sendChatMessage: vi.fn(),
  escalateChat: vi.fn(),
  startNewChat: vi.fn(),
  sendChatFeedback: vi.fn(),
};
vi.mock('@/lib/assistantApi', () => api);

const { default: LivrariaAssistant } = await import('./LivrariaAssistant');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(path = '/') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><LivrariaAssistant /></MemoryRouter>));
  await flush();
}
async function openChat() {
  await act(async () => document.querySelector('button[title="Ajuda"]').click());
  await flush();
  await flush();
}
const text = () => host.textContent;
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
async function type(value) {
  const input = host.querySelector('input[aria-label^="Mensagem"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector('form:last-of-type').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await flush();
}

const CONFIG = { enabled: true, ai: false, provider: 'faq', handoff: true, whatsapp: '923 000 000' };
const bot = (id, textValue, extra = {}) => ({ id, role: 'bot', text: textValue, links: [], suggestions: [], products: [], offer_handoff: false, feedback: null, ...extra });

beforeEach(() => {
  Object.assign(auth, { user: null, isAuthed: false });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  Element.prototype.scrollIntoView = () => {};
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchChatConfig.mockResolvedValue(CONFIG);
  api.loadChatSession.mockResolvedValue({ conversation: null, messages: [], orders: [], open_tickets: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('LivrariaAssistant', () => {
  it('visitante: boas-vindas e sugestões; ao pedir a equipa, convite para entrar (com regresso ao chat) e WhatsApp', async () => {
    await mount('/shop');
    await openChat();
    expect(api.loadChatSession).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Sou o assistente da livraria');
    expect(button('Falar com a equipa')).toBeTruthy();

    api.sendChatMessage.mockResolvedValue({
      conversation: { id: 't1', status: 'bot', ticket_number: null },
      messages: [
        { id: 1, role: 'user', text: 'Falar com a equipa' },
        bot(2, 'Claro. Para a nossa equipa lhe responder, entre na sua conta.', { offer_handoff: true, handoff_reason: 'requested' }),
      ],
    });
    await act(async () => button('Falar com a equipa').click());
    await flush();

    expect(api.sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Falar com a equipa', page: '/shop' }));
    const login = [...host.querySelectorAll('a')].find((a) => a.textContent.includes('Entrar ou criar conta'));
    expect(decodeURIComponent(login.getAttribute('href'))).toBe('/login?redirect=/shop?ajuda=1');
    const wa = [...host.querySelectorAll('a')].find((a) => a.textContent.includes('WhatsApp'));
    expect(wa.getAttribute('href')).toBe('https://wa.me/244923000000');
  });

  it('cliente com conta: passa à equipa com a encomenda e os detalhes, e o chat passa a pedido numerado', async () => {
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'bot', ticket_number: null },
      messages: [
        { id: 1, role: 'user', text: 'Paguei mas continua pendente' },
        bot(2, 'Um problema com um pagamento tem de ser visto pela nossa equipa.', { offer_handoff: true, handoff_reason: 'sensitive' }),
      ],
      orders: [{ id: 'o1', order_number: 'ENC-K3J9XA4F2', state: 'a aguardar pagamento' }],
      open_tickets: [],
    });
    api.escalateChat.mockResolvedValue({
      conversation: { id: 't1', status: 'open', ticket_number: 1004, subject: 'Pagamento · ENC-K3J9XA4F2' },
      messages: [
        { id: 1, role: 'user', text: 'Paguei mas continua pendente' },
        bot(2, 'Um problema com um pagamento…'),
        { id: 3, role: 'system', text: 'Pedido de ajuda #1004 aberto.' },
      ],
    });
    await mount('/');
    await openChat();
    expect(text()).toContain('Passar à equipa');

    const select = host.querySelector('select');
    await act(async () => {
      select.value = 'o1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const textarea = host.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      setter.call(textarea, 'Comprovativo enviado ontem');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Passar à equipa').closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();

    expect(api.escalateChat).toHaveBeenCalledWith({ details: 'Comprovativo enviado ontem', orderId: 'o1', reason: 'sensitive' });
    expect(text()).toContain('Pedido #1004');
    expect(text()).toContain('Pedido de ajuda #1004 aberto.');
    expect(host.querySelector('input[aria-label="Mensagem para a equipa"]').getAttribute('placeholder')).toBe('Escreva à equipa…');
    expect(text()).not.toContain('Continuar com o assistente');
  });

  it('mostra a resposta da equipa com o nome, e pede a avaliação depois de resolvido', async () => {
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'closed', ticket_number: 1004, can_rate: true, csat_score: null },
      messages: [
        { id: 1, role: 'user', text: 'Onde está?' },
        { id: 4, role: 'staff', text: 'Já seguiu hoje.', author: 'Ana' },
      ],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    expect(text()).toContain('Ana · Equipa');
    expect(text()).toContain('Já seguiu hoje.');
    expect(text()).toContain('Como correu o atendimento?');
    expect(text()).toContain('Resolvido');
  });

  it('"não ajudou" oferece a equipa', async () => {
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'bot', ticket_number: null },
      messages: [{ id: 1, role: 'user', text: 'prazo' }, bot(2, 'Luanda: 5 a 7 dias úteis.')],
      orders: [],
      open_tickets: [],
    });
    api.sendChatFeedback.mockResolvedValue({ ok: true, offer_handoff: true });
    await mount('/');
    await openChat();
    await act(async () => button('Não ajudou').click());
    await flush();
    expect(api.sendChatFeedback).toHaveBeenCalledWith(2, -1);
    expect(text()).toContain('Obrigado. Vamos melhorar.');
    expect(text()).toContain('Falar com a equipa');
    expect(text()).toContain('Entrar ou criar conta');
  });

  it('se o envio falhar, o texto volta ao campo e aparece o aviso', async () => {
    api.sendChatMessage.mockRejectedValue(Object.assign(new Error('Sem ligação.'), { status: 0 }));
    await mount('/');
    await openChat();
    await type('Tem o livro Nisto Cremos?');
    await submit();
    expect(host.querySelector('input[aria-label^="Mensagem"]').value).toBe('Tem o livro Nisto Cremos?');
    expect(host.querySelector('[role="alert"]').textContent).toContain('Sem ligação.');
    expect(host.querySelector('[role="alert"]').textContent).toContain('923 000 000');
  });

  it('servidor antigo (durante a publicação): funciona como antes, sem pedir a conversa guardada', async () => {
    api.fetchChatConfig.mockResolvedValue({ ...CONFIG, handoff: false });
    api.sendChatMessage.mockResolvedValue({ reply: 'Resposta antiga', suggestions: [], links: [], products: [] });
    await mount('/');
    await openChat();
    await type('Olá');
    await submit();
    expect(api.loadChatSession).not.toHaveBeenCalled();
    expect(text()).toContain('Resposta antiga');
  });

  it('cliente com conta: ponto no botão com as respostas da equipa por ler; ao abrir o pedido, ficam lidas', async () => {
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    support.countUnreadSupportReplies.mockResolvedValueOnce(2).mockResolvedValue(0);
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't9', status: 'pending', ticket_number: 1009 },
      messages: [{ id: 5, role: 'staff', text: 'Já seguiu.', author: 'Ana' }],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    const launcher = document.querySelector('button[title="Ajuda"]');
    expect(launcher.getAttribute('aria-label')).toContain('2 resposta(s) da equipa por ler');
    expect(launcher.textContent).toContain('2');
    await openChat();
    expect(support.markThreadNotificationsRead).toHaveBeenCalledWith('t9');
  });
});
