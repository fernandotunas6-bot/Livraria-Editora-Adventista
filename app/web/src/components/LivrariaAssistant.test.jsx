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
  const input = host.querySelector('textarea[aria-label^="Mensagem"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector('textarea[aria-label^="Mensagem"]').form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
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
  vi.useRealTimers();
});

// Horário por omissão do servidor (Luanda = UTC+1) e um relógio fixo: só o Date é falso, os
// temporizadores continuam reais para o act() e o flush().
const TEAM_HOURS = { open_hour: 8, close_hour: 18, open_days: [1, 2, 3, 4, 5, 6] };
const clockAt = (iso) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

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
    expect(host.querySelector('textarea[aria-label="Mensagem para a equipa"]').getAttribute('placeholder')).toBe('Escreva à equipa…');
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
    expect(host.querySelector('textarea[aria-label^="Mensagem"]').value).toBe('Tem o livro Nisto Cremos?');
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

  it('uma falha ao ler a configuração não prende o chat no modo antigo: carrega a conversa guardada', async () => {
    api.fetchChatConfig.mockResolvedValue({ ...CONFIG, handoff: null });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'bot', ticket_number: null },
      messages: [{ id: 1, role: 'user', text: 'Olá de ontem' }],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    expect(api.loadChatSession).toHaveBeenCalled();
    expect(text()).toContain('Olá de ontem');
  });

  it('ecrã de início: saudação com o nome e atalhos que enviam a pergunta', async () => {
    Object.assign(auth, { user: { id: 'u1', name: 'Maria João' }, isAuthed: true });
    api.sendChatMessage.mockResolvedValue({ conversation: { id: 't1', status: 'bot' }, messages: [] });
    await mount('/');
    await openChat();
    expect(text()).toContain('Olá, Maria! Como podemos ajudar?');
    await act(async () => button('Envios e prazos').click());
    await flush();
    expect(api.sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Quanto custa a entrega?' }));
  });

  it('Enter envia; Shift+Enter não', async () => {
    api.sendChatMessage.mockResolvedValue({ conversation: { id: 't1', status: 'bot' }, messages: [] });
    await mount('/');
    await openChat();
    await type('Olá');
    const box = host.querySelector('textarea[aria-label^="Mensagem"]');
    await act(async () => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    expect(api.sendChatMessage).not.toHaveBeenCalled();
    await act(async () => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await flush();
    expect(api.sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Olá' }));
  });

  it('cartão da encomenda: passos, rastreio e o texto sem repetir o que o cartão mostra', async () => {
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'bot', ticket_number: null },
      messages: [
        { id: 1, role: 'user', text: 'A minha encomenda', created_at: '2026-11-07T10:00:00Z' },
        bot(2, 'A encomenda **ENC-1** (feita a 03/11/2026) está **em trânsito**. Pagamento: confirmado. Código de rastreio: TRK1.', {
          created_at: '2026-11-07T10:00:05Z',
          order_card: {
            number: 'ENC-1', made: '03/11/2026', stage: 'in_transit', stage_label: 'em trânsito', cancelled: false, pickup: false,
            steps: [
              { key: 'awaiting_payment', label: 'Recebida', done: true, current: false },
              { key: 'paid', label: 'Paga', done: true, current: false },
              { key: 'preparing', label: 'Em preparação', done: true, current: false },
              { key: 'shipped', label: 'Em trânsito', done: false, current: true },
              { key: 'delivered', label: 'Entregue', done: false, current: false },
            ],
            payment: 'confirmado', payment_method: '', tracking: 'TRK1', carrier: 'Correios', eta: '08/11/2026', pickup_store: '', items: 'Nisto Cremos', total: '23 500 Kz',
          },
        }),
      ],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    const card = host.querySelector('section[aria-label^="Encomenda ENC-1"]');
    expect(card).toBeTruthy();
    expect(card.querySelector('[aria-current="step"]').textContent).toContain('Em trânsito');
    expect(card.textContent).toContain('Correios · TRK1');
    expect(card.textContent).toContain('08/11/2026');
    // O balão de texto fica só com a primeira frase: o cartão já mostra o pagamento e o rastreio.
    const bubbles = [...host.querySelectorAll('.whitespace-pre-line')].map((n) => n.textContent);
    expect(bubbles.some((t) => t.includes('Código de rastreio'))).toBe(false);
  });

  it('horário da equipa: fora de horas, o atalho diz quando volta e o cartão de passagem também', async () => {
    clockAt('2026-11-07T19:00:00Z'); // sábado, 20h em Luanda
    api.fetchChatConfig.mockResolvedValue({ ...CONFIG, team_hours: TEAM_HOURS });
    await mount('/');
    await openChat();
    expect(button('Falar com a equipa').textContent).toContain('Volta na segunda-feira às 08h');
    api.sendChatMessage.mockResolvedValue({
      conversation: { id: 't1', status: 'bot' },
      messages: [{ id: 1, role: 'user', text: 'Falar com a equipa' }, bot(2, 'Posso passar esta conversa à equipa.', { offer_handoff: true })],
    });
    await act(async () => button('Falar com a equipa').click());
    await flush();
    expect(text()).toContain('A equipa volta na segunda-feira às 08h. Segunda a sábado, das 08h às 18h.');
  });

  it('pedido aberto à espera da equipa: diz quando respondem e que pode fechar o chat', async () => {
    clockAt('2026-11-06T09:00:00Z'); // sexta, 10h em Luanda
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    api.fetchChatConfig.mockResolvedValue({ ...CONFIG, team_hours: TEAM_HOURS });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'open', ticket_number: 1004 },
      messages: [
        { id: 1, role: 'user', text: 'Paguei e continua pendente' },
        { id: 2, role: 'system', text: 'Pedido de ajuda #1004 aberto.' },
      ],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    const note = host.querySelector('[role="status"]');
    expect(note.textContent).toContain('A aguardar resposta da equipa');
    expect(note.textContent).toContain('A equipa está disponível (até às 18h).');
    expect(note.textContent).toContain('avisamos na sua conta');
  });

  it('a equipa já respondeu: sem nota de espera', async () => {
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    api.fetchChatConfig.mockResolvedValue({ ...CONFIG, team_hours: TEAM_HOURS });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'pending', ticket_number: 1004 },
      messages: [{ id: 1, role: 'user', text: 'Olá' }, { id: 2, role: 'staff', text: 'Bom dia!', author: 'Ana' }],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    expect(text()).not.toContain('A aguardar resposta da equipa');
  });

  it('endereços clicáveis: links e emails da equipa; do assistente, só o email', async () => {
    Object.assign(auth, { user: { id: 'u1' }, isAuthed: true });
    api.loadChatSession.mockResolvedValue({
      conversation: { id: 't1', status: 'pending', ticket_number: 1004 },
      messages: [
        bot(1, 'Escreva para apoio@livraria.ao ou veja https://exemplo.com/x.'),
        { id: 2, role: 'staff', author: 'Ana', text: 'Pague aqui: https://pagar.ao/ref/123. Dúvidas: ana@livraria.ao.' },
      ],
      orders: [],
      open_tickets: [],
    });
    await mount('/');
    await openChat();
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://pagar.ao/ref/123');
    expect(hrefs).toContain('mailto:ana@livraria.ao');
    expect(hrefs).toContain('mailto:apoio@livraria.ao');
    expect(hrefs).not.toContain('https://exemplo.com/x');
    const pay = host.querySelector('a[href="https://pagar.ao/ref/123"]');
    expect(pay.getAttribute('target')).toBe('_blank');
    expect(pay.getAttribute('rel')).toContain('noopener');
    expect(text()).toContain('https://pagar.ao/ref/123. Dúvidas');
  });
});
