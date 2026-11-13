/**
 * Adapter de dados com uma API compatível com a lógica antiga de coleção/filtragem,
 * implementado sobre o Supabase para manter os ecrãs e integrações existentes.
 *
 * - Colecções = tabelas com o mesmo nome ("users" corresponde a "profiles").
 * - Filtros no formato legado (=, !=, >, >=, <, <=, ~, !~, &&, ||, parênteses).
 * - Ficheiros vão para o bucket "media" em <colecção>/<id>/<ficheiro>; a coluna guarda o nome.
 */
import { supabase, mediaUrl, APP_API_URL } from '@/lib/supabaseClient';
import { SIGN_OUT_KEY, authEventAction, authReturnInUrl, createReadyGate, sessionMethod, signOutReason } from '@/lib/authSession';
import { preventSilentSignIn } from '@/lib/savedCredentials';

const TABLE_FOR = { users: 'profiles' };

const FILE_FIELDS = {
  stock_books: ['cover_image'],
  site_settings: ['logo', 'favicon'],
  payment_methods: ['qr_code'],
  book_collections: ['cover_image'],
  physical_stores: ['image'],
  users: ['avatar'],
};

// Campos de relação, para "expand".
const RELATIONS = {
  angola_municipalities: { province: 'angola_provinces' },
  angola_localities: { municipality: 'angola_municipalities' },
  contact_campaigns: { group: 'contact_groups' },
  contact_notifications: { contact: 'contacts', group: 'contact_groups', campaign: 'contact_campaigns' },
};

// Ao enviar um ficheiro, a camada antiga também reflectia a URL correspondente no campo público.
const FILE_URL_MIRROR = { stock_books: { cover_image: 'cover' } };

const PROFILE_COLUMNS = ['name', 'avatar', 'role', 'permissions', 'phone'];

export class DataError extends Error {
  constructor(message, status = 400, data = {}) {
    super(message);
    this.status = status;
    this.data = { message, data };
    this.response = this.data;
  }
}

function toDataError(error, fallbackStatus = 400) {
  if (error instanceof DataError) return error;
  const status = error?.code === 'PGRST116' ? 404 : Number(error?.status) || fallbackStatus;
  let message = error?.message || 'Erro desconhecido';
  if (error?.code === '23505') message = 'Já existe um registo com esse valor.';
  if (error?.code === '42501') message = 'Sem permissão para esta operação.';
  return new DataError(message, status, error);
}

// ---------------------------------------------------------------------------
// Filtros legados → filtros do PostgREST
// ---------------------------------------------------------------------------
function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { tokens.push({ t: c }); i++; continue; }
    if (input.startsWith('&&', i) || input.startsWith('||', i)) { tokens.push({ t: input.slice(i, i + 2) }); i += 2; continue; }
    const op = ['!~', '!=', '>=', '<=', '=', '>', '<', '~'].find((o) => input.startsWith(o, i));
    if (op) { tokens.push({ t: 'op', v: op }); i += op.length; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < input.length && input[j] !== c) {
        if (input[j] === '\\' && j + 1 < input.length) { s += input[j + 1]; j += 2; continue; }
        s += input[j++];
      }
      tokens.push({ t: 'val', v: s });
      i = j + 1;
      continue;
    }
    const m = /^[^\s()=!<>~&|]+/.exec(input.slice(i));
    if (!m) throw new DataError(`Filtro inválido: ${input}`);
    const word = m[0];
    if (word === 'true' || word === 'false') tokens.push({ t: 'val', v: word === 'true' });
    else if (word === 'null') tokens.push({ t: 'val', v: null });
    else if (/^-?\d+(\.\d+)?$/.test(word)) tokens.push({ t: 'val', v: Number(word) });
    else tokens.push({ t: 'id', v: word });
    i += word.length;
  }
  return tokens;
}

function parseFilter(input) {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function primary() {
    const tok = next();
    if (!tok) throw new DataError(`Filtro incompleto: ${input}`);
    if (tok.t === '(') {
      const node = expr();
      next();
      return node;
    }
    const opTok = next();
    const valTok = next();
    if (tok.t !== 'id' || opTok?.t !== 'op' || !valTok) throw new DataError(`Filtro inválido: ${input}`);
    // "a = b" com identificador à direita não é usado pela app; trata como texto.
    return { field: tok.v, op: opTok.v, value: valTok.t === 'id' ? valTok.v : valTok.v };
  }
  function andExpr() {
    const items = [primary()];
    while (peek()?.t === '&&') { next(); items.push(primary()); }
    return items.length === 1 ? items[0] : { and: items };
  }
  function expr() {
    const items = [andExpr()];
    while (peek()?.t === '||') { next(); items.push(andExpr()); }
    return items.length === 1 ? items[0] : { or: items };
  }
  const tree = expr();
  if (pos < tokens.length) throw new DataError(`Filtro inválido: ${input}`);
  return tree;
}

function leafParts({ field, op, value }) {
  if (value === null) {
    if (op === '=') return [field, 'is', null];
    if (op === '!=') return [field, 'not.is', null];
  }
  const likeValue = (v) => {
    const s = String(v ?? '');
    return s.includes('%') ? s.replace(/%/g, '*') : `*${s}*`;
  };
  switch (op) {
    case '=': return [field, 'eq', value];
    case '!=': return [field, 'neq', value];
    case '>': return [field, 'gt', value];
    case '>=': return [field, 'gte', value];
    case '<': return [field, 'lt', value];
    case '<=': return [field, 'lte', value];
    case '~': return [field, 'ilike', likeValue(value)];
    case '!~': return [field, 'not.ilike', likeValue(value)];
    default: throw new DataError(`Operador não suportado: ${op}`);
  }
}

const quoteLogic = (v) => (v === null ? 'null' : typeof v === 'string' ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : String(v));

function toLogic(node) {
  if (node.and) return `and(${node.and.map(toLogic).join(',')})`;
  if (node.or) return `or(${node.or.map(toLogic).join(',')})`;
  const [field, op, value] = leafParts(node);
  return `${field}.${op}.${quoteLogic(value)}`;
}

function applyFilter(query, filter) {
  if (!filter || !String(filter).trim()) return query;
  const tree = parseFilter(String(filter));
  const nodes = tree.and || [tree];
  for (const node of nodes) {
    if (node.or) query = query.or(node.or.map(toLogic).join(','));
    else if (node.and) query = query.or(toLogic(node));
    else {
      const [field, op, value] = leafParts(node);
      query = op.startsWith('not.') ? query.not(field, op.slice(4), value) : query.filter(field, op, value);
    }
  }
  return query;
}

function applySort(query, sort) {
  const parts = String(sort || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) {
    // Ordem de inserção, mantendo um comportamento compatível sem "sort".
    return query.order('created', { ascending: true }).order('id', { ascending: false });
  }
  for (const part of parts) {
    if (part === '@random') continue;
    const desc = part.startsWith('-');
    query = query.order(part.replace(/^[-+]/, ''), { ascending: !desc });
  }
  return query;
}

// ---------------------------------------------------------------------------
// Registos
// ---------------------------------------------------------------------------
function decorate(collection, row) {
  if (!row) return row;
  const rec = { ...row, collectionName: collection, collectionId: collection };
  if (collection === 'users') {
    rec.verified = true;
    delete rec.pb_id;
  }
  return rec;
}

async function attachExpand(collection, records, expand) {
  if (!expand || !records.length) return records;
  const rel = RELATIONS[collection] || {};
  for (const field of String(expand).split(',').map((s) => s.trim()).filter(Boolean)) {
    const table = rel[field];
    if (!table) continue;
    const ids = [...new Set(records.map((r) => r[field]).filter(Boolean))];
    if (!ids.length) continue;
    const { data } = await supabase.from(table).select('*').in('id', ids);
    const byId = Object.fromEntries((data || []).map((r) => [r.id, decorate(table, r)]));
    for (const r of records) {
      if (r[field] && byId[r[field]]) r.expand = { ...(r.expand || {}), [field]: byId[r[field]] };
    }
  }
  return records;
}

function isFileValue(v) {
  return (typeof File !== 'undefined' && v instanceof File) || (typeof Blob !== 'undefined' && v instanceof Blob);
}

function formDataToObject(fd) {
  const out = {};
  for (const [k, v] of fd.entries()) {
    const key = k.replace(/[+-]$/, '');
    out[key] = v;
  }
  return out;
}

function safeFileName(file) {
  const original = file?.name || 'ficheiro';
  const dot = original.lastIndexOf('.');
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'ficheiro';
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  return `${base}_${Math.random().toString(36).slice(2, 12)}.${ext}`;
}

function storagePrefix(collection, id) {
  return `${collection}/${id}`;
}

async function uploadFile(collection, id, file) {
  const name = safeFileName(file);
  const { error } = await supabase.storage.from('media').upload(`${storagePrefix(collection, id)}/${name}`, file, {
    contentType: file.type || undefined,
    upsert: true,
  });
  if (error) throw toDataError(error);
  return name;
}

async function removeFile(collection, id, name) {
  if (!name) return;
  await supabase.storage.from('media').remove([`${storagePrefix(collection, id)}/${name}`]).catch(() => {});
}

/** Separa ficheiros (File/Blob ou null em campos de ficheiro) dos restantes campos. */
function splitPayload(collection, data) {
  const body = data instanceof FormData ? formDataToObject(data) : { ...(data || {}) };
  const fileFields = FILE_FIELDS[collection] || [];
  const files = {};
  for (const [k, v] of Object.entries(body)) {
    if (isFileValue(v)) { files[k] = v; delete body[k]; }
    else if (fileFields.includes(k) && (v === null || v === '')) { files[k] = null; delete body[k]; }
  }
  return { body, files };
}

async function applyFiles(collection, id, files, previous) {
  const patch = {};
  for (const [field, value] of Object.entries(files)) {
    const old = previous?.[field];
    if (value === null) {
      await removeFile(collection, id, old);
      patch[field] = '';
    } else {
      patch[field] = await uploadFile(collection, id, value);
      if (old && old !== patch[field]) await removeFile(collection, id, old);
      const mirror = FILE_URL_MIRROR[collection]?.[field];
      if (mirror) patch[mirror] = mediaUrl(collection, id, patch[field]);
    }
  }
  return patch;
}

async function appApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${APP_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new DataError(out.message || 'Erro no servidor', res.status, out);
  return out;
}

// ---------------------------------------------------------------------------
// authStore (sessão do Supabase Auth com o perfil em public.profiles)
// ---------------------------------------------------------------------------
const PROFILE_CACHE_KEY = 'livraria_profile';
const listeners = new Set();

function readCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredSession() {
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  } catch {
    return null;
  }
}

const endedListeners = new Set();
// Um fim de sessão que chega antes de alguém ouvir (no arranque, o aviso pode vir antes de a
// página montar) fica à espera do primeiro ouvinte.
let pendingEnded = null;

function readSignOutMark() {
  try {
    return localStorage.getItem(SIGN_OUT_KEY);
  } catch {
    return null;
  }
}

function writeSignOutMark(reason) {
  try {
    if (reason) localStorage.setItem(SIGN_OUT_KEY, JSON.stringify({ reason, at: Date.now() }));
    else localStorage.removeItem(SIGN_OUT_KEY);
  } catch {
    // armazenamento indisponível
  }
}

const authStore = {
  token: '',
  record: null,
  get model() { return this.record; },
  get isValid() { return !!this.token && !!this.record; },
  /** Como se entrou nesta sessão (`'email'`, `'google'` ou `''`), lido do token. */
  get method() { return sessionMethod(this.token); },
  /** `true` enquanto a conta fica à vista com a sessão por renovar (sem rede ao abrir). */
  get offline() { return keptOffline; },
  onChange(callback, fireImmediately = false) {
    listeners.add(callback);
    if (fireImmediately) callback(this.token, this.record);
    return () => listeners.delete(callback);
  },
  clear() {
    // Um perfil ainda a caminho (de uma entrada ou renovação de há instantes) já não é desta sessão.
    authGeneration += 1;
    // Antes do `signOut`: os outros separadores recebem o `SIGNED_OUT` e têm de saber que foi a
    // pessoa a sair, e não o servidor a terminar a sessão.
    writeSignOutMark('user');
    setAuth('', null);
    // Só este aparelho. `signOut()` sem argumento é `scope: 'global'` no supabase-js (auth-js
    // 2.118.0): carregar em "Sair" no telemóvel terminava a sessão em todos os aparelhos da conta.
    // Terminar em todo o lado é o `logoutEverywhere` (Perfil → Segurança). Ideia do PR #3.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  },
  /** Marca a saída como pedida pela pessoa (para quem chama o `signOut` directamente). */
  noteUserSignOut() { writeSignOutMark('user'); },
  /** Como acabou a última sessão neste aparelho (`lib/authSession.js`, `readSignOut`). */
  get lastSignOut() { return readSignOutMark(); },
  /**
   * Avisa quando o servidor termina a sessão sem a pessoa ter saído (terminada noutro aparelho,
   * palavra-passe mudada, conta suspensa). Recebe o perfil que estava à vista.
   */
  onSessionEnded(callback) {
    endedListeners.add(callback);
    if (pendingEnded) {
      const shown = pendingEnded;
      pendingEnded = null;
      setTimeout(() => callback(shown), 0);
    }
    return () => endedListeners.delete(callback);
  },
  /** `true` quando o arranque já determinou se existe sessão (com ou sem utilizador). */
  get isReady() { return authGate.ready; },
  onReady(callback) { return authGate.onReady(callback); },
};

// Cada mudança de sessão tem um número. O perfil é lido depois do aviso do Auth (fora do callback):
// se entretanto a pessoa saiu, ou chegou um aviso mais recente, a resposta antiga não escreve por
// cima. Antes, carregar em "Sair" logo depois de entrar (ou de voltar à app) podia devolver a
// conta à vista com o token já revogado.
let authGeneration = 0;

/**
 * `cache: false` para um perfil incompleto (a leitura falhou): fica à vista nesta visita, mas não
 * substitui o perfil guardado — sem papel nem permissões, a equipa ficava sem painel até a rede
 * voltar e o perfil ser lido outra vez.
 */
function setAuth(token, record, { cache = true } = {}) {
  const changed = authStore.token !== token || JSON.stringify(authStore.record) !== JSON.stringify(record);
  authStore.token = token;
  authStore.record = record;
  try {
    if (record && !cache) {
      // nada: fica o perfil completo que já estava guardado
    } else if (record) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(record));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // armazenamento indisponível
  }
  if (changed) listeners.forEach((cb) => cb(token, record));
}

/**
 * O perfil da conta. Lança quando a leitura falha: o supabase-js não lança, devolve `{ error }`,
 * e esse erro era ignorado — uma falha de rede numa renovação do token passava por "conta sem
 * perfil" (sem nome, papel `member`) e ficava guardada.
 */
async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw toDataError(error);
  return decorate('users', { ...(data || { id: user.id, name: '', role: 'member' }), email: user.email || data?.email || '' });
}

/** Perfil mínimo de uma conta, quando o da base de dados ainda não existe ou não se leu. */
function minimalProfile(user) {
  return decorate('users', { id: user.id, name: '', role: 'member', email: user.email || '' });
}

/** O perfil, com uma segunda tentativa: na rede móvel, a primeira falha muitas vezes sozinha. */
async function loadProfileRetry(user) {
  try {
    return await loadProfile(user);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return loadProfile(user);
  }
}

// Sessão guardada: disponível de imediato (o papel vem do perfil em cache até ser confirmado).
const stored = readStoredSession();
const cachedProfile = readCachedProfile();
const cachedSession = !!(stored?.access_token && stored?.user && cachedProfile?.id === stored.user.id);
if (cachedSession) {
  authStore.token = stored.access_token;
  authStore.record = cachedProfile;
}

// Enquanto o supabase-js arranca (lê o armazenamento, renova o token ou consome o
// `#access_token=…` que a Google devolve) ainda não se sabe se há sessão. As guardas das
// páginas protegidas esperam por este sinal em vez de assumirem que não há ninguém: era aí
// que o login com a Google acabava de volta no ecrã de entrada.
const authGate = createReadyGate();

// Com a sessão e o perfil da mesma conta já guardados neste aparelho, a conta aparece logo, sem
// esperar pela rede: no telemóvel com rede fraca, abrir a app na conta ficava até 8 segundos em
// "A verificar a sua sessão…" (o supabase-js insiste na renovação até meio minuto). Se a sessão
// tiver sido terminada noutro sítio, o `SIGNED_OUT` chega a seguir e a conta sai, com o aviso.
// Não com o regresso de uma entrada no endereço: aí a sessão que vai ficar pode ser outra.
if (cachedSession && typeof window !== 'undefined' && !authReturnInUrl(window.location.href)) authGate.resolve();

// Sem rede ao abrir a app, a conta fica à vista com a sessão por renovar (`authEventAction`,
// caso `keep`). O supabase-js volta a tentar sozinho de minuto a minuto com a página à vista;
// quando a rede volta, tenta-se logo, para a pessoa não esperar por esse minuto.
let keptOffline = false;

supabase.auth.onAuthStateChange((event, session) => {
  const action = authEventAction(event, session, readStoredSession());
  if (action === 'keep') {
    keptOffline = true;
    authGate.resolve();
    return;
  }
  keptOffline = false;
  const generation = ++authGeneration;
  if (action === 'signed-out') {
    const shown = authStore.record;
    setAuth('', null);
    // A conta estava à vista e ninguém carregou em "Sair": foi o servidor que a terminou.
    if (event === 'SIGNED_OUT' && shown && signOutReason(readSignOutMark()) === 'ended') {
      writeSignOutMark('ended');
      // O navegador deixa de entrar sozinho com a palavra-passe guardada: sem isto, "Terminar
      // sessão em todos os aparelhos" para um telemóvel perdido não servia de nada, se lá
      // estivesse a palavra-passe.
      preventSilentSignIn();
      if (!endedListeners.size) pendingEnded = shown;
      endedListeners.forEach((cb) => {
        try {
          cb(shown);
        } catch {
          // um ouvinte partido não impede os outros
        }
      });
    }
    authGate.resolve();
    return;
  }
  writeSignOutMark(null);
  // Fora do callback: o supabase-js não permite chamadas ao cliente dentro dele.
  setTimeout(async () => {
    let record;
    let complete = true;
    try {
      record = await loadProfileRetry(session.user);
    } catch {
      // Sem perfil novo: fica o que estava à vista, se for desta conta; senão, um mínimo que não
      // vai para a cache (a próxima renovação lê-o outra vez).
      complete = authStore.record?.id === session.user.id;
      record = complete ? authStore.record : minimalProfile(session.user);
    }
    if (generation === authGeneration) setAuth(session.access_token, record, { cache: complete });
    authGate.resolve();
  }, 0);
});

/**
 * Tenta renovar a sessão já. O supabase-js guarda a última falha de renovação durante um minuto e
 * responde com ela a quem pedir de novo (para não insistir durante uma falha da rede): com a rede
 * de volta, ficava até um minuto sem sessão válida, e o perfil mostrava as encomendas vazias.
 * Quando a rede volta, ou a pessoa volta à app, essa falha já não diz nada e esquece-se — como o
 * próprio supabase-js faz quando outro separador renova. (`lastRefreshFailure` é interno do
 * auth-js 2.11x: se mudar de nome, fica a tentativa normal dele, de minuto a minuto.)
 */
function retryRefreshNow() {
  try {
    if (supabase.auth && 'lastRefreshFailure' in supabase.auth) supabase.auth.lastRefreshFailure = null;
  } catch {
    // sem acesso: fica a tentativa normal do supabase-js
  }
  supabase.auth.getSession().catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (keptOffline) retryRefreshNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (keptOffline && document.visibilityState === 'visible' && navigator.onLine !== false) retryRefreshNow();
  });
}

function translateAuthError(error) {
  const msg = String(error?.message || '');
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) return new DataError('Email ou palavra-passe incorrectos.', 400);
  if (lower.includes('email not confirmed')) return new DataError('Confirme o seu email (enviámos um link) antes de entrar.', 400);
  if (lower.includes('already registered')) return new DataError('Já existe uma conta com este email.', 400);
  if (lower.includes('password should be')) return new DataError('A palavra-passe deve ter pelo menos 6 caracteres.', 400);
  if (lower.includes('rate limit')) return new DataError('Demasiados pedidos. Tente novamente dentro de alguns minutos.', 429);
  if (lower.includes('failed to fetch')) return new DataError('Servidor indisponível. Verifique a ligação à internet.', 0);
  return new DataError(msg || 'Não foi possível autenticar.', Number(error?.status) || 400);
}

// ---------------------------------------------------------------------------
// Colecções
// ---------------------------------------------------------------------------
function collection(name) {
  const table = TABLE_FOR[name] || name;

  const select = (fields) => {
    const cols = fields ? String(fields).split(',').map((s) => s.trim()).filter(Boolean).join(',') : '*';
    return cols || '*';
  };

  const api = {
    async getList(page = 1, perPage = 30, options = {}) {
      const from = (page - 1) * perPage;
      let query = supabase.from(table).select(select(options.fields), { count: 'exact' });
      query = applySort(applyFilter(query, options.filter), options.sort).range(from, from + perPage - 1);
      const { data, error, count } = await query;
      if (error) throw toDataError(error);
      const items = await attachExpand(name, (data || []).map((r) => decorate(name, r)), options.expand);
      const totalItems = count ?? items.length;
      return { page, perPage, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / perPage)), items };
    },

    async getFullList(batchOrOptions = {}, maybeOptions = {}) {
      const options = typeof batchOrOptions === 'number' ? maybeOptions : batchOrOptions;
      const pageSize = 1000;
      const all = [];
      for (let from = 0; ; from += pageSize) {
        let query = supabase.from(table).select(select(options.fields));
        query = applySort(applyFilter(query, options.filter), options.sort).range(from, from + pageSize - 1);
        const { data, error } = await query;
        if (error) throw toDataError(error);
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return attachExpand(name, all.map((r) => decorate(name, r)), options.expand);
    },

    async getOne(id, options = {}) {
      const { data, error } = await supabase.from(table).select(select(options.fields)).eq('id', id).maybeSingle();
      if (error) throw toDataError(error);
      if (!data) throw new DataError('Registo não encontrado.', 404);
      const [rec] = await attachExpand(name, [decorate(name, data)], options.expand);
      return rec;
    },

    async getFirstListItem(filter, options = {}) {
      const { items } = await api.getList(1, 1, { ...options, filter });
      if (!items.length) throw new DataError('Registo não encontrado.', 404);
      return items[0];
    },

    async create(data) {
      if (name === 'users') return createUser(data);
      const { body, files } = splitPayload(name, data);
      const { data: row, error } = await supabase.from(table).insert(body).select().single();
      if (error) throw toDataError(error);
      if (!Object.keys(files).length) return decorate(name, row);
      return api.update(row.id, files);
    },

    async update(id, data) {
      if (name === 'users') return updateUser(id, data);
      const { body, files } = splitPayload(name, data);
      if (Object.keys(files).length) {
        const { data: previous } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
        Object.assign(body, await applyFiles(name, id, files, previous));
      }
      const { data: row, error } = await supabase.from(table).update(body).eq('id', id).select().maybeSingle();
      if (error) throw toDataError(error);
      if (!row) throw new DataError('Registo não encontrado ou sem permissão.', 404);
      return decorate(name, row);
    },

    async delete(id) {
      if (name === 'users') {
        await appApi('/admin/users/delete', { id });
        return true;
      }
      const { data: previous } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw toDataError(error);
      for (const field of FILE_FIELDS[name] || []) await removeFile(name, id, previous?.[field]);
      return true;
    },

    // --- Equivalentes da colecção "users" para a camada compatível ---
    async authWithPassword(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw translateAuthError(error);
      // A entrada já valeu: uma falha a ler o perfil não a desfaz. O `SIGNED_IN` que o Auth manda a
      // seguir volta a ler o perfil e acerta o papel e as permissões.
      let record;
      let complete = true;
      try {
        record = await loadProfile(data.user);
      } catch {
        complete = false;
        record = minimalProfile(data.user);
      }
      setAuth(data.session.access_token, record, { cache: complete });
      return { token: data.session.access_token, record };
    },

    async requestPasswordReset(email, redirectTo) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || `${window.location.origin}/reset-password`,
      });
      if (error) throw translateAuthError(error);
      return true;
    },

    // O link do email já abre uma sessão de recuperação; aqui só se define a nova palavra-passe.
    async confirmPasswordReset(_token, password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw translateAuthError(error);
      return true;
    },
  };
  return api;
}

async function createUser(data) {
  const { email, password, name } = data instanceof FormData ? formDataToObject(data) : data;
  const { data: result, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name || '' }, emailRedirectTo: `${window.location.origin}/login` },
  });
  if (error) throw translateAuthError(error);
  if (!result.user) throw new DataError('Não foi possível criar a conta.');
  // Email que já tem conta confirmada: com a confirmação de email activa, o Supabase não dá erro
  // (para não revelar quem tem conta) e devolve um utilizador sem identidades, sem enviar email
  // nenhum. Antes a pessoa lia "enviámos um link de confirmação" e ficava à espera de um email
  // que nunca chegava; agora o formulário passa a "Entrar" com o email preenchido.
  if (!result.session && Array.isArray(result.user.identities) && result.user.identities.length === 0) {
    return { alreadyRegistered: true, email };
  }
  // Com a confirmação de email activa, o Supabase cria a conta mas não abre sessão.
  if (!result.session) return { needsConfirmation: true, email };
  const record = await loadProfile(result.user);
  setAuth(result.session.access_token, record);
  return record;
}

async function updateUser(id, data) {
  const { body, files } = splitPayload('users', data);
  const isSelf = authStore.record?.id === id;

  if (isSelf && (body.password || body.email)) {
    const attrs = {};
    if (body.password) attrs.password = body.password;
    if (body.email && body.email !== authStore.record?.email) attrs.email = body.email;
    if (Object.keys(attrs).length) {
      const { error } = await supabase.auth.updateUser(attrs);
      if (error) throw translateAuthError(error);
    }
  }

  const patch = {};
  for (const key of PROFILE_COLUMNS) if (key in body) patch[key] = body[key];
  if (Object.keys(files).length) {
    const { data: previous } = await supabase.from('profiles').select('avatar').eq('id', id).maybeSingle();
    Object.assign(patch, await applyFiles('users', id, files, previous));
  }

  let row;
  if (Object.keys(patch).length) {
    const { data: saved, error } = await supabase.from('profiles').update(patch).eq('id', id).select().maybeSingle();
    if (error) throw toDataError(error);
    if (!saved) throw new DataError('Sem permissão para alterar este utilizador.', 403);
    row = saved;
  } else {
    const { data: current } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    row = current;
  }
  // O email novo só passa a valer depois de confirmado no link que o Supabase envia;
  // até lá a conta (e as encomendas) continuam no email actual.
  const record = decorate('users', { ...row, email: isSelf ? (authStore.record?.email || row?.email) : row?.email });
  if (isSelf) setAuth(authStore.token, record);
  return record;
}

const files = {
  getURL(record, filename) {
    if (!record || !filename) return '';
    return mediaUrl(record.collectionName || record.collectionId || 'stock_books', record.id, filename);
  },
};
files.getUrl = files.getURL;

/**
 * Cabeçalho `Authorization` com o token válido da sessão, para os `fetch` à Edge Function.
 *
 * Não usar `pb.authStore.token`: é o último token conhecido, e ao voltar a um separador parado
 * mais de uma hora (o supabase-js pára a renovação com a página escondida), ou ao abrir a app com
 * a sessão guardada, está caducado. A Edge Function trata um token inválido como visitante, sem
 * erro: a visita não ficava no histórico da conta, as sugestões não eram "para si" e o
 * assistente respondia como a um anónimo. O `getSession()` renova primeiro, se for preciso.
 */
export async function authHeaders() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

/** Equivalente a pb.send('/api/app/...') — chama a Edge Function "app". */
async function send(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${APP_API_URL}${String(path).replace(/^\/api\/app/, '')}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new DataError(out.message || `Erro ${res.status}`, res.status, out);
  return out;
}

const pb = {
  collection,
  files,
  authStore,
  send,
  autoCancellation() {},
};

export default pb;
