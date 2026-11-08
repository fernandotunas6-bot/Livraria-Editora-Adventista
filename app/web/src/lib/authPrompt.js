/**
 * Quando sugerir a um visitante que crie conta (ou que entre, se já teve uma neste navegador).
 *
 * Regras, por ordem:
 * 1. Nunca antes de se saber se há sessão (`ready`), e nunca a quem já tem sessão.
 * 2. Nunca nas páginas de entrada, de recuperação, do painel nem de cancelamento de
 *    subscrição — ali a pessoa está a fazer outra coisa.
 * 3. No máximo uma vez por sessão do navegador.
 * 4. Depois de fechado, só volta passados 7 dias; depois de fechado 3 vezes, 60 dias.
 *    Um convite que volta sempre que se fecha deixa de ser convite.
 * 5. Só depois de a pessoa mostrar interesse: a terceira ficha de livro vista nesta sessão.
 *
 * "Teve conta neste navegador" não é sessão: serve só para mudar o texto para "Bem-vindo de
 * volta" e preencher o email. Quem decide se a pessoa está autenticada é o Supabase Auth.
 */

export const NUDGE_KEY = 'livraria_convite_conta';
export const NUDGE_SESSION_KEY = 'livraria_convite_conta_mostrado';
export const VIEWS_SESSION_KEY = 'livraria_fichas_vistas';
export const HAD_ACCOUNT_KEY = 'livraria_teve_conta';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 7 * DAY_MS;
export const LONG_COOLDOWN_MS = 60 * DAY_MS;
export const MAX_DISMISSALS = 3;
export const VIEWS_BEFORE_NUDGE = 3;

const EXCLUDED_PATHS = ['/login', '/forgot-password', '/reset-password', '/admin', '/unsubscribe', '/cancelar-subscricao', '/success', '/confirmar-encomenda', '/track', '/profile'];

export function isExcludedPath(pathname = '') {
  return EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Estado guardado: `{ dismissedAt, dismissals }`. Valores estragados contam como vazios. */
export function readNudgeState(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object') return { dismissedAt: 0, dismissals: 0 };
    const dismissedAt = Number(v.dismissedAt) || 0;
    const dismissals = Math.max(0, Math.floor(Number(v.dismissals) || 0));
    return { dismissedAt, dismissals };
  } catch {
    return { dismissedAt: 0, dismissals: 0 };
  }
}

export function dismissNudge(state, now = Date.now()) {
  const s = readNudgeState(state);
  return { dismissedAt: now, dismissals: s.dismissals + 1 };
}

export function inCooldown(state, now = Date.now()) {
  const s = readNudgeState(state);
  if (!s.dismissedAt) return false;
  const wait = s.dismissals >= MAX_DISMISSALS ? LONG_COOLDOWN_MS : COOLDOWN_MS;
  return now - s.dismissedAt < wait;
}

/**
 * Decide se o convite abre agora.
 * @param {object} p
 * @param {boolean} p.ready  o arranque da sessão terminou
 * @param {boolean} p.isAuthed  há sessão válida
 * @param {string} p.pathname
 * @param {number} p.productViews  fichas de livro vistas nesta sessão
 * @param {boolean} p.shownThisSession
 * @param {object} p.state  `{ dismissedAt, dismissals }`
 * @param {boolean} [p.busy]  outro painel aberto (carrinho, diálogo)
 */
export function shouldNudge({ ready, isAuthed, pathname, productViews, shownThisSession, state, busy = false, now = Date.now() }) {
  if (!ready || isAuthed || busy) return false;
  if (isExcludedPath(pathname)) return false;
  if (shownThisSession) return false;
  if (inCooldown(state, now)) return false;
  return productViews >= VIEWS_BEFORE_NUDGE;
}

/** Quem já entrou neste navegador vê "Entrar"; os outros, "Criar conta". */
export function nudgeMode(hadAccount) {
  return hadAccount ? 'login' : 'signup';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Caracteres de controlo: um nome guardado nunca os deve ter, e um nome com eles não se mostra.
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * A conta lembrada neste navegador: `{ email, name, provider }`, ou `null`.
 *
 * Serve só para identificar quem volta — "Continuar como Maria", o email já preenchido e o
 * caminho certo à frente (a palavra-passe ou a Google). Nada disto dá acesso: quem decide se a
 * pessoa entra é o Supabase Auth. `provider` é `'email'`, `'google'` ou `''` (não se sabe: as
 * contas lembradas antes de 2026-11-08 só tinham o email). Qualquer coisa estranha dá `null`.
 */
export function readHadAccount(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const email = typeof v?.email === 'string' ? v.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return null;
    const name = typeof v.name === 'string' ? v.name.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const provider = v.provider === 'google' || v.provider === 'email' ? v.provider : '';
    return { email, name, provider };
  } catch {
    return null;
  }
}

/**
 * O que guardar para lembrar a conta que acabou de entrar. Uma sessão que não diz como se entrou
 * (`provider` vazio) não apaga o que já se sabia da mesma conta. Devolve o texto a guardar, ou
 * `null` se o email não servir.
 */
export function hadAccountValue({ email, name = '', provider = '' } = {}, previous = null) {
  const prev = readHadAccount(previous);
  const clean = readHadAccount({ email, name, provider });
  if (!clean) return null;
  if (!clean.provider && prev?.email === clean.email) clean.provider = prev.provider;
  return JSON.stringify(clean);
}

/** Primeiro nome, para "Continuar como Maria"; sem nome, a parte do email antes do @. */
export function rememberedFirstName(account) {
  const name = String(account?.name || '').trim();
  if (name) return name.split(' ')[0];
  return String(account?.email || '').split('@')[0] || '';
}

/** Validação em tempo real do formulário. Devolve mensagens só para os campos já tocados. */
export function validateAuthForm({ mode, name = '', email = '', password = '' }) {
  const errors = {};
  if (mode === 'signup' && name.trim().length < 2) errors.name = 'Indique o seu nome.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errors.email = 'Indique um email válido, por exemplo nome@gmail.com.';
  if (password.length < 8) {
    errors.password = mode === 'signup' ? 'Use pelo menos 8 caracteres.' : 'A palavra-passe tem pelo menos 8 caracteres.';
  }
  return errors;
}

/** Acesso ao armazenamento sem rebentar em janelas privadas ou com dados bloqueados. */
export function safeStorage(kind = 'local') {
  try {
    const s = kind === 'session' ? window.sessionStorage : window.localStorage;
    const probe = '__livraria__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Título, descrição e texto de "fechar" do modal, conforme o motivo por que abriu.
 * O motivo diz à pessoa porque lhe pedimos conta *agora*; sem ele, o modal parece um muro.
 */
export function authDialogCopy(reason = '', mode = 'signup') {
  const signup = mode === 'signup';
  switch (reason) {
    case 'delivery':
      return {
        title: signup ? 'Crie conta para receber em casa' : 'Entre para receber em casa',
        description: 'A entrega ao domicílio precisa de conta, para acompanhar a encomenda e confirmar a recepção. O seu carrinho fica como está.',
        dismiss: 'Voltar ao carrinho',
      };
    case 'review':
      return {
        title: signup ? 'Crie conta para avaliar' : 'Entre para avaliar este livro',
        description: 'As avaliações ficam ligadas a uma conta, para cada leitor só avaliar uma vez.',
        dismiss: 'Agora não',
      };
    case 'order':
      return {
        title: 'Guarde esta encomenda na sua conta',
        description: 'Use o email da compra: a encomenda aparece logo no seu perfil, com o estado da entrega.',
        dismiss: 'Agora não',
        benefits: true,
      };
    case 'session-ended':
      return {
        title: 'A sua sessão terminou',
        description: 'Por segurança, entre de novo neste aparelho. O carrinho e o que estava a ver ficam como estavam.',
        dismiss: 'Agora não',
      };
    case 'nudge':
      return signup
        ? {
          title: 'Crie a sua conta em segundos',
          description: 'É grátis e não precisa de nada para comprar — mas fica tudo mais fácil.',
          dismiss: 'Agora não, continuar a ver',
          benefits: true,
        }
        : {
          title: 'Bem-vindo de volta',
          description: 'Entre para continuar de onde parou.',
          dismiss: 'Agora não, continuar a ver',
        };
    default:
      return signup
        ? { title: 'Criar conta', description: 'Registe-se em segundos.', dismiss: 'Agora não', benefits: true }
        : { title: 'Entrar', description: 'Aceda à sua conta.', dismiss: 'Agora não' };
  }
}
