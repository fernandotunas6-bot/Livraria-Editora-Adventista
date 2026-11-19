/**
 * Adaptador do Painel de Vendas (pacote painel-vendas-huambo) para o Supabase.
 * createPainelApi() devolve a interface que a página do pacote pedia a window.claude.use('db' | 'user' | 'downloads'):
 *   anos/{ano}                → public.vendas_anos (da loja escolhida)
 *   historico/registo, notas/ → public.painel_vendas_docs (<id da loja>/<caminho>)
 *   config/admin              → não usado: a edição exige sessão de administrador da livraria (RLS no servidor)
 * Antes da migração painel_vendas_por_loja não há loja_id: o painel mostra os dados que existem (Loja do Huambo).
 */
import { supabase, mediaUrl } from '@/lib/supabaseClient';
import { buildDestaques, capaDe } from './destaques.js';
import { storeGallery } from '@/lib/stores';

const subs = {};
const fire = (key) => (subs[key] || []).forEach((fn) => fn());
const listen = (key, fn) => {
  (subs[key] ||= []).push(fn);
  fn();
  return () => { subs[key] = subs[key].filter((f) => f !== fn); };
};

const snap = (id, data) => ({ id: String(id), exists: !!data, data: () => data, metadata: {} });

function yearRowToDoc(row) {
  return {
    ano: row.ano,
    meses: row.meses,
    observacoes: row.observacoes,
    mes_em_curso: row.mes_em_curso,
    meta_anual: row.meta_anual == null ? null : Number(row.meta_anual),
    criterio: row.criterio,
    fonte: row.fonte || '',
    actualizado: row.actualizado,
  };
}

/**
 * Uma gravação recusada, com um código que os ecrãs sabem dizer:
 *  · `conflict` — alguém gravou o mesmo ano entretanto (40001, de public.vendas_anos_gravar);
 *  · `invalid_argument` — sem permissão (as regras da tabela recusaram, 42501);
 *  · `unavailable` — o resto (rede, servidor). Antes, tudo era «sem permissão», até uma falha de rede.
 */
function rejectWrite(error) {
  const code = error?.code === '40001' ? 'conflict'
    : (!error || error.code === '42501' || /row-level security|permiss/i.test(error.message || '')) ? 'invalid_argument'
      : 'unavailable';
  const err = new Error(error?.message || 'Sem permissão para gravar.');
  err.code = code;
  throw err;
}

/**
 * Grava pela função com bloqueio optimista (public.vendas_anos_gravar, migração
 * relatorios_gravacao_protegida): cada linha leva o `actualizado` que o ecrã leu ao abrir
 * (`esperado`; nulo = o ano ainda não existe) e a gravação é recusada se alguém gravou entretanto.
 * Todas as linhas gravam juntas ou nenhuma grava. Devolve { [lojaId]: actualizado } — o novo
 * `esperado` de cada loja —, ou null quando a função ainda não existe (migração por aplicar).
 */
async function gravarPelaFuncao(ano, linhas) {
  const { data, error } = await supabase.rpc('vendas_anos_gravar', { p_ano: Number(ano), p_linhas: linhas });
  if (error) {
    if (error.code === 'PGRST202') return null;
    rejectWrite(error);
  }
  return Object.fromEntries((data || []).map((r) => [r.loja_id, r.actualizado]));
}

const kz2 = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100) / 100);

/** true quando vendas_anos já tem loja_id (migração painel_vendas_por_loja aplicada). */
export async function detectMultiStore() {
  const { error } = await supabase.from('vendas_anos').select('loja_id').limit(1);
  return !error;
}

/** Lojas físicas (a equipa vê também as inactivas). */
export async function listStores() {
  const { data } = await supabase.from('physical_stores').select('id, name, province, active, gallery').order('sort_order').order('name');
  return data || [];
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const cents = (v) => Math.round((Number(v) || 0) * 100);
// Luanda está em UTC+1 todo o ano: o mês de uma encomenda conta pela hora local.
const LUANDA_OFFSET_MS = 3600 * 1000;

/**
 * As vendas do sistema de TODAS as lojas, por mês, calculadas no servidor (função
 * public.vendas_do_sistema, migração relatorios_de_todas_as_livrarias): só totais, sem dados dos
 * clientes, para quem vê ou edita os relatórios. Devolve null quando a função ainda não existe
 * (migração por aplicar), para o painel de uma loja voltar ao cálculo antigo.
 *   { porLoja: { [lojaId]: { months[12], counts[12] } }, semLoja: { months, counts }, orders, balcao }
 * Com o KanGest ligado, os meses de cada loja somam também as vendas ao balcão (`balcao` diz quanto foi do balcão).
 */
export async function fetchSystemSalesAll(ano, { paidOnly = true } = {}) {
  const { data, error } = await supabase.rpc('vendas_do_sistema', { p_ano: ano, p_so_pagas: paidOnly });
  if (error) {
    if (error.code === 'PGRST202' || /vendas_do_sistema/.test(error.message || '')) return null;
    throw error;
  }
  const vazio = () => ({ months: Array(12).fill(0), counts: Array(12).fill(0) });
  const porLoja = {};
  const semLoja = vazio();
  let orders = 0;
  for (const r of data || []) {
    const alvo = r.loja_id ? (porLoja[r.loja_id] ||= vazio()) : semLoja;
    const m = Number(r.mes) - 1;
    if (m < 0 || m > 11) continue;
    alvo.months[m] = Math.round((alvo.months[m] + Number(r.valor || 0)) * 100) / 100;
    alvo.counts[m] += Number(r.encomendas || 0);
    orders += Number(r.encomendas || 0);
  }
  // As vendas ao balcão das livrarias, do KanGest (public.vendas_do_kangest, docs/KANGEST.md): somam-se às do site,
  // loja a loja e mês a mês, para o relatório ter a venda toda de cada livraria. Sem a ligação (ou sem a função),
  // fica só o site, como antes.
  const balcao = { porLoja: {}, total: 0 };
  const { data: kg, error: kgErro } = await supabase.rpc('vendas_do_kangest', { p_ano: ano, p_canal: 'balcao' });
  if (!kgErro) {
    for (const r of kg || []) {
      const m = Number(r.mes) - 1;
      if (m < 0 || m > 11) continue;
      const valor = Number(r.total || 0);
      const alvo = r.store_id ? (porLoja[r.store_id] ||= vazio()) : semLoja;
      alvo.months[m] = Math.round((alvo.months[m] + valor) * 100) / 100;
      alvo.counts[m] += Number(r.docs || 0);
      const b = (balcao.porLoja[r.store_id || ''] ||= Array(12).fill(0));
      b[m] = Math.round((b[m] + valor) * 100) / 100;
      balcao.total = Math.round((balcao.total + valor) * 100) / 100;
    }
  }
  return { porLoja, semLoja, orders, balcao };
}

/**
 * Vendas registadas no sistema (encomendas) de uma loja, por mês, em Kz sem portes.
 * Primeiro pela função do servidor (fetchSystemSalesAll); sem ela, pelo cálculo antigo abaixo,
 * que lê as encomendas no navegador e só funciona a quem gere encomendas.
 * Conta para a loja: levantamentos nessa loja e entregas ao domicílio na província da loja (a loja
 * gravada em cada encomenda, orders.store_id).
 * Exclui encomendas canceladas.
 *
 * Com `paidOnly` (o normal), conta o dinheiro que entrou, pelo mês em que entrou: encomendas com
 * `paid_at` nesse ano (pagamentos registados, migração pagamentos_registados), pelo pago menos o
 * reembolsado, sem os portes. Antes contava pelo mês da encomenda e pelo total: uma encomenda de
 * 31 de Janeiro paga a 3 de Fevereiro entrava em Janeiro, e um reembolso não descontava nada.
 */
async function fetchSystemSales(store, ano, { paidOnly = true } = {}) {
  const all = await fetchSystemSalesAll(ano, { paidOnly });
  if (all) {
    const s = all.porLoja[store.id] || { months: Array(12).fill(0), counts: Array(12).fill(0) };
    return { months: s.months, counts: s.counts, orders: s.counts.reduce((a, b) => a + b, 0) };
  }
  return fetchSystemSalesFromOrders(store, ano, { paidOnly });
}

async function fetchSystemSalesFromOrders(store, ano, { paidOnly = true } = {}) {
  const from = new Date(Date.UTC(ano, 0, 1) - LUANDA_OFFSET_MS).toISOString();
  const to = new Date(Date.UTC(ano + 1, 0, 1) - LUANDA_OFFSET_MS).toISOString();
  const dateField = paidOnly ? 'paid_at' : 'created';
  // A loja de cada encomenda (orders.store_id, migração lojas_donas_dos_dados) fica gravada quando
  // ela entra: mudar o nome de uma loja já não lhe tira as vendas. Antes da migração, conta-se como
  // antes, pelo nome da loja e pela província.
  const comLoja = !(await supabase.from('orders').select('store_id').limit(1)).error;
  const cols = 'created, paid_at, total, shipping_cost, amount_paid, amount_refunded, status, delivery_status, payment_status, shipping_method, pickup_store, delivery_province';
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from('orders')
      .select(comLoja ? `${cols}, store_id` : cols)
      .gte(dateField, from).lt(dateField, to)
      .order(dateField)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const months = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const o of rows) {
    if (o.status === 'cancelled' || o.delivery_status === 'cancelled') continue;
    const pickup = o.shipping_method === 'pickup' || !!o.pickup_store;
    const mine = comLoja
      ? o.store_id === store.id
      : (pickup ? norm(o.pickup_store) === norm(store.name) : norm(o.delivery_province) === norm(store.province));
    if (!mine) continue;
    // Pago: o que ficou (pago − reembolsado), até ao total, sem os portes. Vendido: o total.
    const value = paidOnly
      ? Math.min(cents(o.amount_paid) - cents(o.amount_refunded), cents(o.total)) - cents(o.shipping_cost)
      : cents(o.total) - cents(o.shipping_cost);
    if (paidOnly && value <= 0) continue;
    const m = new Date(new Date(o[dateField]).getTime() + LUANDA_OFFSET_MS).getUTCMonth();
    months[m] += Math.max(0, value);
    counts[m] += 1;
  }
  return { months: months.map((c) => c / 100), counts, orders: rows.length };
}

// ---------------------------------------------------------------------------------------------
// Imagens e mais vendidos dos vídeos (migração imagens_e_mais_vendidos_dos_videos)
// ---------------------------------------------------------------------------------------------
const semFuncao = (e) => e && (e.code === 'PGRST202' || e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find/i.test(e.message || ''));

/**
 * Os mais vendidos de um ano: as encomendas do site (produtos_mais_vendidos) e os lançados à mão
 * (vendas_produtos), juntos por buildDestaques. Sem a migração, devolve null (o vídeo sai sem os
 * quadros dos mais vendidos).
 */
export async function carregarDestaques(ano, { paidOnly = true } = {}) {
  const [sis, man] = await Promise.all([
    supabase.rpc('produtos_mais_vendidos', { p_ano: ano, p_so_pagas: paidOnly }),
    supabase.from('vendas_produtos').select('id, loja_id, ano, mes, book_id, titulo, unidades, valor, nota').eq('ano', ano),
  ]);
  if (sis.error && !semFuncao(sis.error)) throw sis.error;
  if (sis.error && man.error) return null;
  const manual = man.error ? [] : man.data || [];
  const ids = [...new Set(manual.map((r) => r.book_id).filter(Boolean))];
  let capas = {};
  if (ids.length) {
    const { data } = await supabase.rpc('capas_dos_produtos', { p_ids: ids });
    capas = Object.fromEntries((data || []).map((b) => [b.id, capaDe({ book_id: b.id, capa: b.capa, capa_ficheiro: b.capa_ficheiro }, mediaUrl)]));
  }
  return buildDestaques({ sistema: sis.error ? [] : sis.data || [], manual, capas, mediaUrl });
}

const ORDEM_TEMAS = ['natureza', 'livros', 'lojas', 'pessoas', 'outro'];

/** As fotografias activas da biblioteca, primeiro as de natureza. [] sem a migração. */
export async function carregarFotos() {
  const { data, error } = await supabase.from('biblioteca_imagens').select('url, tema, posicao').eq('activa', true).order('posicao').limit(40);
  if (error) return [];
  return (data || []).sort((a, b) => ORDEM_TEMAS.indexOf(a.tema) - ORDEM_TEMAS.indexOf(b.tema)).map((r) => r.url);
}

/** O que os vídeos precisam além dos números, guardado por ano durante a visita. */
function extrasDoVideo() {
  const cache = new Map();
  return (ano) => {
    if (!cache.has(ano)) {
      cache.set(ano, Promise.all([carregarDestaques(ano).catch(() => null), carregarFotos().catch(() => [])])
        .then(([destaques, fotos]) => ({ destaques, fotos })));
    }
    return cache.get(ano);
  };
}

function makeDb(lojaId) {
  const multi = !!lojaId;
  const key = (k) => `${lojaId || '-'}:${k}`;
  const docPath = (path) => (multi ? `${lojaId}/${path}` : path);
  const anos = () => {
    let q = supabase.from('vendas_anos').select('*');
    if (multi) q = q.eq('loja_id', lojaId);
    return q;
  };
  return {
    collection(name) {
      return {
        onSnapshot(next, onError) {
          if (name !== 'anos') { next({ docs: [], metadata: { fromCache: false } }); return () => {}; }
          return listen(key('anos'), async () => {
            const { data, error } = await anos().order('ano');
            if (error) { onError?.(error); return; }
            next({ docs: (data || []).map((r) => snap(r.ano, yearRowToDoc(r))), metadata: { fromCache: false } });
          });
        },
      };
    },
    doc(path) {
      const [col, id] = path.split('/');
      const read = async () => {
        if (col === 'anos') {
          const { data } = await anos().eq('ano', Number(id)).maybeSingle();
          return snap(id, data ? yearRowToDoc(data) : null);
        }
        if (col === 'config') return snap(id, null);
        const { data } = await supabase.from('painel_vendas_docs').select('data').eq('path', docPath(path)).maybeSingle();
        return snap(id, data?.data || null);
      };
      return {
        get: read,
        onSnapshot(next, onError) {
          return listen(key(path), () => read().then(next).catch((e) => onError?.(e)));
        },
        /**
         * Grava o documento. Para um ano (`anos/<ano>`), `opts.esperado` é o `actualizado` lido ao
         * abrir (null para um ano novo): com ele a gravação é protegida contra a de outra pessoa
         * entretanto, e devolve { actualizado } — o do servidor, para a gravação seguinte.
         */
        async set(value, opts = {}) {
          if (col === 'config') rejectWrite();
          let error;
          if (col === 'anos' && multi && Object.prototype.hasOwnProperty.call(opts, 'esperado')) {
            const ano = Number(value.ano ?? id);
            const feito = await gravarPelaFuncao(ano, [{
              loja_id: lojaId,
              esperado: opts.esperado || null,
              meses: (value.meses || []).map(kz2),
              observacoes: value.observacoes,
              mes_em_curso: value.mes_em_curso ?? null,
              meta_anual: value.meta_anual ?? null,
              criterio: value.criterio || 'media',
              fonte: value.fonte || '',
              origem: value.origem || 'manual',
            }]);
            if (feito) {
              fire(key(path));
              fire(key(col));
              return { actualizado: feito[lojaId] || null };
            }
          }
          if (col === 'anos') {
            const row = {
              ano: Number(value.ano ?? id),
              meses: value.meses,
              observacoes: value.observacoes,
              mes_em_curso: value.mes_em_curso ?? null,
              meta_anual: value.meta_anual ?? null,
              criterio: value.criterio || 'media',
              fonte: value.fonte || '',
              actualizado: value.actualizado || new Date().toISOString(),
              origem: value.origem || 'manual',
            };
            if (multi) row.loja_id = lojaId;
            const conflito = { onConflict: multi ? 'loja_id,ano' : 'ano' };
            ({ error } = await supabase.from('vendas_anos').upsert(row, conflito));
            // Sem a migração relatorios_de_todas_as_livrarias não há a coluna origem.
            if (error && /origem/.test(error.message || '')) {
              delete row.origem;
              ({ error } = await supabase.from('vendas_anos').upsert(row, conflito));
            }
          } else {
            ({ error } = await supabase.from('painel_vendas_docs').upsert({ path: docPath(path), data: value, actualizado: new Date().toISOString() }));
          }
          if (error) rejectWrite(error);
          fire(key(path));
          fire(key(col));
        },
        async delete() {
          if (col !== 'anos') rejectWrite();
          let q = supabase.from('vendas_anos').delete().eq('ano', Number(id));
          if (multi) q = q.eq('loja_id', lojaId);
          const { error } = await q;
          if (error) rejectWrite(error);
          fire(key(path));
          fire(key(col));
        },
      };
    },
  };
}

const TYPES = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  webm: 'video/webm',
  mp4: 'video/mp4',
};

const downloads = {
  async save({ filename, data }) {
    const ext = filename.split('.').pop();
    const blob = data instanceof Blob ? data : new Blob([data], { type: TYPES[ext] || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  },
};

/**
 * Interface do painel para a sessão actual.
 * profile = { id, role } do utilizador com sessão (useAuth);
 * opts = { lojaId (só com a migração aplicada), store: { id, name, province } | null, canReadOrders }.
 */
export function createPainelApi(profile, opts = {}) {
  const isAdmin = profile?.role === 'admin';
  // canEdit: «Editar relatórios de vendas» (ou administrador); canReadSales: ver os relatórios.
  const { lojaId = null, store = null, canReadOrders = false, canEdit = isAdmin, canReadSales = false } = opts;
  const user = {
    id: async () => profile?.id || null,
    isOwner: async () => false,
    canEdit: async () => !!canEdit,
    can: async () => !!canEdit,
    async profiles(ids) {
      const { data } = await supabase.from('profiles').select('id, name, email').in('id', ids);
      return Object.fromEntries((data || []).map((p) => [p.id, { name: p.name || p.email }]));
    },
  };
  const sales = store && (canReadSales || canReadOrders)
    ? { available: true, storeName: store.name, fetch: (ano, o) => fetchSystemSales(store, ano, o) }
    : { available: false, reason: !store ? 'Esta loja ainda não existe no separador Lojas.' : 'Precisa da permissão «Ver relatórios» ou «Editar relatórios de vendas» para ver as vendas do sistema.' };
  // Os mais vendidos desta loja e as fotografias da biblioteca, para o vídeo.
  const todos = extrasDoVideo();
  const extras = canReadSales || canEdit
    ? async (ano) => {
      const x = await todos(ano);
      return { destaques: x.destaques && store ? x.destaques.porLoja[store.id] || null : null, fotos: x.fotos };
    }
    : null;
  // O histórico das gravações desta loja no servidor (vendas_alteracoes), o mesmo do relatório
  // conjunto. O documento <loja>/historico/registo, que o próprio painel escrevia, era editável por
  // quem grava e deixou de ser o histórico mostrado.
  const historico = lojaId && (canReadSales || canEdit) ? (ano) => carregarHistorico(ano, 80, lojaId) : null;
  return { db: makeDb(lojaId), user, downloads, store, sales, extras, historico };
}

// ---------------------------------------------------------------------------------------------
// Relatório conjunto (todas as livrarias): consolidado-ui.js
// ---------------------------------------------------------------------------------------------

const ANO_CAMPOS = 'loja_id, ano, meses, observacoes, mes_em_curso, meta_anual, criterio, fonte, actualizado, actualizado_por';

/** As lojas com os anos de cada uma, numa consulta por tabela (não uma por loja). */
async function carregarLojas() {
  const [{ data: lojas, error: e1 }, anos] = await Promise.all([
    supabase.from('physical_stores').select('id, name, province, active, sort_order, gallery').order('sort_order').order('name'),
    (async () => {
      // A coluna origem só existe com a migração relatorios_de_todas_as_livrarias.
      let r = await supabase.from('vendas_anos').select(ANO_CAMPOS + ', origem').order('ano');
      if (r.error) r = await supabase.from('vendas_anos').select(ANO_CAMPOS).order('ano');
      return r;
    })(),
  ]);
  if (e1) throw e1;
  if (anos.error) throw anos.error;
  const porLoja = {};
  (anos.data || []).forEach((r) => {
    (porLoja[r.loja_id] ||= {})[r.ano] = { ...yearRowToDoc(r), origem: r.origem || 'manual', actualizado_por: r.actualizado_por || null };
  });
  // As fotografias de cada loja (separador Lojas) vão para o modo apresentação do relatório conjunto.
  return (lojas || []).map((l) => ({ id: l.id, name: l.name, province: l.province, active: l.active !== false, fotos: storeGallery(l), years: porLoja[l.id] || {} }));
}

/** O histórico das gravações no servidor (vendas_alteracoes); null sem a migração. */
async function carregarHistorico(ano, limite = 120, lojaId = null) {
  let q = supabase.from('vendas_alteracoes').select('id, em, loja_id, ano, accao, por, origem, meses, outros').order('em', { ascending: false }).limit(limite);
  if (ano != null) q = q.eq('ano', ano);
  if (lojaId) q = q.eq('loja_id', lojaId);
  const { data, error } = await q;
  if (error) return null;
  const ids = [...new Set((data || []).map((h) => h.por).filter(Boolean))];
  let nomes = {};
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, name, email').in('id', ids);
    nomes = Object.fromEntries((ps || []).map((p) => [p.id, p.name || p.email]));
  }
  return (data || []).map((h) => ({ ...h, quem: (h.por && nomes[h.por]) || (h.por ? 'Alguém da equipa' : 'Directamente na base de dados') }));
}

/**
 * Grava os meses (e o mês em curso) de várias lojas num ano, num pedido só.
 * `linhas` = [{ lojaId, meses: [12], mes_em_curso, origem, esperado }], com `esperado` = o
 * `actualizado` do ano dessa loja quando a grelha abriu (null se ainda não havia ano). As restantes
 * colunas (meta, critério, fonte, observações) não se tocam. Se alguém gravou uma destas lojas
 * entretanto, nada é gravado e o erro tem o código `conflict`.
 */
async function gravarMeses(ano, linhas) {
  if (!linhas.length) return {};
  const feito = await gravarPelaFuncao(ano, linhas.map((l) => ({
    loja_id: l.lojaId,
    esperado: l.esperado || null,
    meses: l.meses.map(kz2),
    mes_em_curso: l.mes_em_curso ?? null,
    origem: l.origem || 'manual',
  })));
  if (feito) return feito;
  // Sem a migração relatorios_gravacao_protegida: como antes, sem bloqueio.
  const rows = linhas.map((l) => ({
    loja_id: l.lojaId,
    ano: Number(ano),
    meses: l.meses.map((v) => (v == null ? null : Math.round(Number(v) * 100) / 100)),
    mes_em_curso: l.mes_em_curso ?? null,
    origem: l.origem || 'manual',
  }));
  let { error } = await supabase.from('vendas_anos').upsert(rows, { onConflict: 'loja_id,ano', defaultToNull: false });
  // Sem a migração relatorios_de_todas_as_livrarias não há a coluna origem.
  if (error && /origem/.test(error.message || '')) {
    ({ error } = await supabase.from('vendas_anos').upsert(rows.map(({ origem, ...r }) => r), { onConflict: 'loja_id,ano', defaultToNull: false }));
  }
  if (error) rejectWrite(error);
  return {};
}

const NOTA = (ano) => `consolidado/notas/ano-${Number(ano)}`;

async function lerNota(ano) {
  const { data } = await supabase.from('painel_vendas_docs').select('data, actualizado').eq('path', NOTA(ano)).maybeSingle();
  return data ? { texto: String(data.data?.texto || ''), actualizado: data.actualizado } : { texto: '', actualizado: null };
}

async function gravarNota(ano, texto) {
  const { error } = await supabase.from('painel_vendas_docs').upsert({
    path: NOTA(ano), data: { texto: String(texto || '').slice(0, 4000) }, actualizado: new Date().toISOString(),
  });
  if (error) rejectWrite(error);
}

/**
 * Interface do relatório conjunto para a sessão actual.
 * opts = { canEdit: «Editar relatórios de vendas» ou administrador }.
 */
export function createConsolidadoApi(opts = {}) {
  return {
    canEdit: !!opts.canEdit,
    carregar: carregarLojas,
    sistema: (ano, o) => fetchSystemSalesAll(ano, o),
    gravarMeses,
    historico: carregarHistorico,
    lerNota,
    gravarNota,
    downloads,
    extras: extrasDoVideo(),
  };
}
