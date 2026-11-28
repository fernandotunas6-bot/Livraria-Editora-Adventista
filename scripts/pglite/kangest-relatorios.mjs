// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O balcão dos postos nos relatórios do site (migração 20261125160000_kangest_balcao_nos_relatorios), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest-relatorios.mjs supabase/migrations
// O que se confere: as facturas dos postos nas vendas ao vivo e no mês da loja, sem contar em dobro as das encomendas
// online; as notas de crédito a abater; a anulação; o pendente que muda; um posto antigo sem os campos novos; e o
// gerente de loja a ler só as cópias da loja dele.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (nome, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', nome, extra === undefined ? '' : JSON.stringify(extra)); }
};
const recusa = async (nome, fn, re) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', nome); }
  catch (e) { if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', nome, '→', e.message); } else ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const como = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '']);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};
const num = (v) => Number(v ?? 0);
const CHAVE = Buffer.alloc(32, 7).toString('base64');
const doc = (id, tipo, numero, extra = {}, linhas = null) => ({
  tipo: 'documento',
  documento: {
    documento_id: id, tipo_codigo: tipo, grupo: 'VENDAS', serie: 'A2026', numero, numero_doc: `${tipo} A2026/${numero}`,
    data_emissao: '2026-11-25', data_hora: '2026-11-25T10:30:00', armazem_id: 1, consumidor_final: true,
    total_liquido: 10000, total_iva: 1400, total: 11400, estado: 'N', hash: `H${id}`, hash_anterior: '', hash_controlo: 'abcd', hash_versao: 1,
    ...extra,
  },
  linhas: linhas ?? [{ linha: 1, referencia: 'LIV-001', descricao: 'O Desejado', quantidade: 2, preco_unitario: 5000, total: 11400 }],
});
const receber = async (posto, lote) => (await q(`select public.kangest_receber($1, $2::jsonb) r`, [posto, JSON.stringify(lote)]))[0].r;
const aoVivo = async (posto, id) => (await q(`select * from public.vendas_ao_vivo where origem = $1`, [`kangest:posto:${posto}:${id}`]))[0];
const mes = async (posto, loja) => (await q(`select total, docs from public.kangest_vendas where ligacao = $1 and store_id = $2 and ano = 2026 and mes = 11 and canal = 'balcao'`, [`posto:${posto}`, loja]))[0];

// --- uma loja, um posto e um livro -------------------------------------------------------------------------------
const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [outra] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('O Desejado', 5700, 3, true, 'LIV-001') returning id`);
const direccao = await pessoa('direccao@x.ao', 'manager', { view_reports: true });
const posto = (await q(`select public.kangest_posto_criar('Loja do Huambo', $1, 'resumo-1', null) id`, [loja.id]))[0].id;
await q(`select public.kangest_emparelhar('resumo-1', $1, '1.4.5 Livraria')`, [CHAVE]);
// uma encomenda online desta loja: a FR dela chega do posto com a referência da encomenda
await q(`insert into public.orders (order_number, customer_email, customer_name, phone, items, total, shipping_method, store_id)
         values ('LIV-900', 'c@x.ao', 'Cliente', '923000000', '[{"title":"O Desejado","quantity":1,"price":5700}]'::jsonb, 5700, 'pickup', $1)`, [loja.id]);

// --- as facturas do balcão nos relatórios ------------------------------------------------------------------------
const r1 = await receber(posto, [
  doc(1, 'FR', 1, { canal: 'balcao', operador: 'Ana', valor_pendente: 0 }),
  // uma FT a crédito, com vencimento e pendente
  doc(2, 'FT', 1, { canal: 'balcao', operador: 'Ana', vencimento: '2026-12-25', valor_pendente: 11400 }),
  // a FR de uma encomenda online (pela referência) e uma emitida pela API: ficam de fora do balcão
  doc(3, 'FR', 2, { canal: 'balcao', referencia: 'LIV-900' }),
  doc(4, 'FR', 3, { canal: 'api' }),
  // uma devolução: abate
  doc(5, 'NC', 1, { canal: 'balcao', doc_origem: 'FR A2026/1', total_liquido: 5000, total_iva: 700, total: 5700 },
    [{ linha: 1, referencia: 'LIV-001', descricao: 'O Desejado', quantidade: 1, preco_unitario: 5000, total: 5700 }]),
  // uma proforma não é venda
  doc(6, 'PP', 1, {}),
]);
check('recebidos', r1.recebidos === 6 && r1.erros.length === 0, r1);
const v1 = await aoVivo(posto, 1);
check('FR do balcão nas vendas ao vivo', v1 && v1.alvo === loja.id && v1.canal === 'balcao' && num(v1.total) === 114 && !v1.anulado, v1);
check('com a hora da loja (10:30 em Luanda = 09:30 UTC)', v1 && new Date(v1.quando).toISOString() === '2026-11-25T09:30:00.000Z', v1?.quando);
check('com os artigos e o livro do site', v1 && v1.itens[0].book_id === livro.id && num(v1.itens[0].quantidade) === 2, v1?.itens);
check('a FR da encomenda online não conta no balcão', !(await aoVivo(posto, 3)));
check('a emitida pela API também não', !(await aoVivo(posto, 4)));
check('a proforma também não', !(await aoVivo(posto, 6)));
const nc = await aoVivo(posto, 5);
check('a nota de crédito abate', nc && num(nc.total) === -57 && num(nc.itens[0].quantidade) === -1, nc);
let m = await mes(posto, loja.id);
check('o mês da loja: FR + FT − NC, 2 documentos', m && num(m.total) === 114 + 114 - 57 && m.docs === 2, m);
const v = (await como(direccao, `select v.total from public.vendas_do_kangest(2026) v where v.store_id = $1 and v.mes = 11`, [loja.id]))[0];
check('«Todas as livrarias» já vê o balcão', v && num(v.total) === 171, v);
const campos = (await q(`select canal, operador, vencimento::text, valor_pendente, doc_origem from public.kangest_documentos where posto_id = $1 and documento_id = 2`, [posto]))[0];
check('os campos novos ficam na cópia', campos.canal === 'balcao' && campos.operador === 'Ana' && campos.vencimento === '2026-12-25' && Number(campos.valor_pendente) === 11400, campos);

// --- repetir, anular e o pendente --------------------------------------------------------------------------------
const r2 = await receber(posto, [doc(1, 'FR', 1, { canal: 'balcao' })]);
check('o mesmo documento outra vez não conta duas', r2.repetidos === 1 && (await q(`select count(*)::int n from public.vendas_ao_vivo where origem like $1`, [`kangest:posto:${posto}:%`]))[0].n === 3);
await receber(posto, [doc(1, 'FR', 1, { estado: 'A', motivo_anulacao: 'Engano' })]);
check('anulada: fica marcada nas vendas ao vivo', (await aoVivo(posto, 1)).anulado === true);
m = await mes(posto, loja.id);
check('anulada: sai do mês da loja', m && num(m.total) === 114 - 57 && m.docs === 1, m);
// um recibo no KanGest paga metade da FT: só o pendente muda
await receber(posto, [doc(2, 'FT', 1, { canal: 'balcao', valor_pendente: 5700 })]);
check('o pendente muda com o recibo', Number((await q(`select valor_pendente from public.kangest_documentos where posto_id = $1 and documento_id = 2`, [posto]))[0].valor_pendente) === 5700);
await recusa('o resto da cópia continua fixo', () => q(`update public.kangest_documentos set operador = 'Outro' where posto_id = $1 and documento_id = 2`, [posto]), /não se altera/);
await recusa('o canal também', () => q(`update public.kangest_documentos set canal = 'api' where posto_id = $1 and documento_id = 2`, [posto]), /não se altera/);

// --- um posto com a versão anterior: sem os campos novos -----------------------------------------------------------
const antigo = (await q(`select public.kangest_posto_criar('Loja do Lubango', $1, 'resumo-2', null) id`, [outra.id]))[0].id;
await q(`select public.kangest_emparelhar('resumo-2', $1, '1.4.4 Livraria')`, [Buffer.alloc(32, 9).toString('base64')]);
const r3 = await receber(antigo, [doc(1, 'FR', 1)]);
check('posto antigo: recebido', r3.recebidos === 1 && r3.erros.length === 0, r3);
const ca = (await q(`select canal, operador, vencimento, valor_pendente, pendente_em from public.kangest_documentos where posto_id = $1`, [antigo]))[0];
check('posto antigo: os campos novos vazios', ca.canal === '' && ca.operador === '' && ca.vencimento === null && ca.valor_pendente === null && ca.pendente_em === null, ca);
check('posto antigo: a venda conta no balcão da loja dele', (await aoVivo(antigo, 1))?.alvo === outra.id);

// --- quem lê as cópias -------------------------------------------------------------------------------------------
const gerente = await pessoa('gerente@x.ao', 'manager', { view_store_dashboard: true });
const cliente = await pessoa('cliente@x.ao');
await q(`insert into public.staff_members (full_name, profile_id, store_id) values ('Gerente do Lubango', $1, $2)`, [gerente, outra.id]);
check('a direcção lê todas as cópias', (await como(direccao, `select count(*)::int n from public.kangest_documentos`))[0].n === 7);
const doGerente = await como(gerente, `select distinct store_id from public.kangest_documentos`);
check('o gerente lê só as da loja dele', doGerente.length === 1 && doGerente[0].store_id === outra.id, doGerente);
check('e as linhas delas', (await como(gerente, `select count(*)::int n from public.kangest_documento_linhas`))[0].n === 1);
check('um cliente não lê nada', (await como(cliente, `select count(*)::int n from public.kangest_documentos`))[0].n === 0);

// --- os mais e os menos vendidos, os sem vendas e as dívidas (20261125170000) ------------------------------------
// uma encomenda do site paga hoje, com o mesmo livro, na loja do Huambo
const [paga] = await q(`insert into public.orders (order_number, customer_email, customer_name, phone, items, total, shipping_method, store_id)
         values ('LIV-901', 'c@x.ao', 'Cliente do Site', '923000001', $2::jsonb, 11400, 'pickup', $1) returning id`,
  [loja.id, JSON.stringify([{ book_id: livro.id, title: 'O Desejado', quantity: 2, price: 5700 }])]);
// paga como o faz private.order_payments_sync (o estado resulta do que se pagou; ver kangest.mjs)
await db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_paid = total, payment_status = payment_status where id = $1`, [paga.id]);
});
const [outroLivro] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('Caminho a Cristo', 2500, 9, true, 'LIV-002') returning id`);
const vendidos = await como(direccao, `select * from public.produtos_vendidos('2026-11-01', '2026-11-30', $1)`, [loja.id]);
const d1 = vendidos.find((v) => v.book_id === livro.id);
// no Huambo: a FT (2) e a NC (−1) do balcão (a FR 1 foi anulada); o site: 2
check('vendidos: o balcão e o site juntos, com as NC a abater', d1 && num(d1.unidades_balcao) === 1 && num(d1.unidades_site) === 2 && num(d1.unidades) === 3, vendidos);
check('vendidos: sem a FR da encomenda online nem a da API', d1 && num(d1.unidades_balcao) === 1);
const todas = await como(direccao, `select * from public.produtos_vendidos('2026-11-01', '2026-11-30')`);
check('vendidos: todas as lojas somam o posto antigo do Lubango', num(todas.find((v) => v.book_id === livro.id)?.unidades_balcao) === 3, todas);
const sem = await como(direccao, `select * from public.produtos_sem_vendas('2026-11-01', '2026-11-30')`);
check('sem vendas: o livro com stock que não vendeu', sem.some((r) => r.book_id === outroLivro.id) && !sem.some((r) => r.book_id === livro.id), sem);
await recusa('período ao contrário', () => como(direccao, `select * from public.produtos_vendidos('2026-11-30', '2026-11-01')`), /Período inválido/);
check('o gerente vê os vendidos da loja dele', (await como(gerente, `select count(*)::int n from public.produtos_vendidos('2026-11-01', '2026-11-30', $1)`, [outra.id]))[0].n === 1);
await recusa('o gerente não vê os de outra loja', () => como(gerente, `select * from public.produtos_vendidos('2026-11-01', '2026-11-30', $1)`, [loja.id]), /Sem permissão/);
await recusa('nem todas as lojas', () => como(gerente, `select * from public.produtos_vendidos('2026-11-01', '2026-11-30')`), /Escolha a sua loja/);
await recusa('um cliente não vê nada', () => como(cliente, `select * from public.produtos_vendidos('2026-11-01', '2026-11-30', $1)`, [loja.id]), /Sem permissão/);
// as dívidas: a FT do Huambo com 57 Kz por pagar, e uma encomenda entregue e por pagar
await q(`insert into public.orders (order_number, customer_email, customer_name, phone, items, total, shipping_method, store_id, payment_status, delivery_status, amount_paid)
         values ('LIV-902', 'd@x.ao', 'Cliente Devedor', '923000002', '[]'::jsonb, 9000, 'pickup', $1, 'pending', 'delivered', 0)`, [loja.id]);
const div = await q(`select * from public.dividas_por_loja($1) order by origem`, [loja.id]);
check('dívidas: a FT do balcão e a encomenda entregue', div.length === 2 && num(div[0].pendente) === 57 && div[1].numero === 'LIV-902' && num(div[1].pendente) === 9000, div);
await recusa('as dívidas não se lêem pela API (só a Edge Function)', () => como(direccao, `select * from public.dividas_por_loja(null)`), /permission denied/);

// --- os fechos de caixa dos postos (20261125180000) ---------------------------------------------------------------
const fecho = (id, extra = {}) => ({ tipo: 'fecho', fecho: {
  fecho_id: id, sessao_id: 10 + id, numero_z: id, posto: 'Caixa 1', aberta_em: '2026-11-25T08:00:00', fechada_em: '2026-11-25T18:00:00',
  operador: 'Ana', fechado_por: 'Ana', total_vendido: 342000, numerario_esperado: 228000, valor_contado: 228000, online_total: 364000,
  online_incluidas: true, reconstruido: false, selo: 'a'.repeat(64), selo_resumo: 'b'.repeat(64),
  resumo: { sessao: { numero_z: id }, artigos: [{ descricao: 'O Desejado', quantidade: 2 }] }, encomendas: ['LIV-900'], ...extra } });
const rf = await receber(posto, [fecho(1), { tipo: 'fecho', fecho: { resumo: {} } }]);
check('fechos: recebido, e um sem número recusado', rf.fechos === 1 && rf.erros.length === 1 && rf.erros[0].tipo === 'fecho', rf);
check('fechos: repetido não duplica', (await receber(posto, [fecho(1)])).repetidos === 1 && (await q(`select count(*)::int n from public.kangest_fechos`))[0].n === 1);
const f1 = (await q(`select * from public.kangest_fechos where posto_id = $1 and fecho_id = 1`, [posto]))[0];
check('fechos: da loja do posto, com o resumo', f1.store_id === loja.id && f1.numero_z === 1 && f1.resumo.artigos[0].quantidade === 2 && Number(f1.online_total) === 364000, f1);
check('fechos: as encomendas que o Z fechou', (await q(`select order_number from public.kangest_fecho_encomendas where fecho = $1`, [f1.id])).map((r) => r.order_number).join() === 'LIV-900');
await recusa('fechos: não se altera', () => q(`update public.kangest_fechos set valor_contado = 1 where id = $1`, [f1.id]), /não se altera/);
await recusa('fechos: não se apaga', () => q(`delete from public.kangest_fechos where id = $1`, [f1.id]), /não se apagam/);
await receber(antigo, [fecho(1)]);
check('fechos: a direcção vê os de todas as lojas', (await como(direccao, `select count(*)::int n from public.kangest_fechos`))[0].n === 2);
const fg = await como(gerente, `select distinct store_id from public.kangest_fechos`);
check('fechos: o gerente vê só os da loja dele', fg.length === 1 && fg[0].store_id === outra.id, fg);
check('fechos: um cliente não vê nenhum', (await como(cliente, `select count(*)::int n from public.kangest_fechos`))[0].n === 0);
await recusa('fechos: a função de receber não se chama pela API', () => como(direccao, `select public.kangest_receber_fecho($1, null, '{}'::jsonb)`, [posto]), /permission denied/);

// --- o histórico importado do KIGEST (20261127180000) ------------------------------------------------------------
const mesDe = async (p, l, ano, m) => (await q(`select total::float8 total, docs from public.kangest_vendas where ligacao = $1 and store_id = $2 and ano = $3 and mes = $4 and canal = 'balcao'`, [`posto:${p}`, l, ano, m]))[0];
// a ligação antiga já pôs Março de 2025 nos relatórios; Abril de 2025 não tem nada
await q(`insert into public.kangest_vendas (ligacao, store_id, ano, mes, canal, total, docs, actualizado) values ('kigest-antiga', $1, 2025, 3, 'balcao', 999, 9, now())`, [loja.id]);
const importada = (id, numero, data) => doc(id, 'FR', numero, { serie: 'KIG', numero_doc: `FR KIG/${numero}`, data_emissao: data, data_hora: `${data}T09:00:00`, hash: `K${id}`, hash_anterior: 'nao-bate', importado: true });
const ri = await receber(posto, [importada(9001, 7, '2025-03-10'), importada(9002, 8, '2025-04-02')]);
check("importados: entram os dois", ri.recebidos === 2, ri);
const imp = await q(`select documento_id, importado, cadeia from public.kangest_documentos where posto_id = $1 and documento_id in (9001, 9002) order by documento_id`, [posto]);
check('importados: marcados e fora da cadeia do KanGest', imp.length === 2 && imp.every((d) => d.importado === true && d.cadeia === 'importada'), imp);
check('importados: num mês que a ligação antiga já tem, não contam outra vez', !(await aoVivo(posto, 9001)) && !(await mesDe(posto, loja.id, 2025, 3))?.docs, await mesDe(posto, loja.id, 2025, 3));
check('importados: num mês sem nada, entram nos relatórios', !!(await aoVivo(posto, 9002)) && (await mesDe(posto, loja.id, 2025, 4))?.docs === 1, await mesDe(posto, loja.id, 2025, 4));
check('importados: os do KanGest continuam na cadeia', (await q(`select count(*)::int n from public.kangest_documentos where posto_id = $1 and not importado and cadeia = 'importada'`, [posto]))[0].n === 0);

// --- as configurações do posto (20261127180000) ----------------------------------------------------------------
const R1 = 'a'.repeat(64);
const R2 = 'b'.repeat(64);
const guardar = async (resumo, dados) => (await q(`select public.kangest_configuracoes_receber($1, $2, $3::jsonb) r`, [posto, resumo, JSON.stringify(dados)]))[0].r;
check('configurações: guardadas', (await guardar(R1, { config: { 'vendas.precos_com_iva': '1' } })).guardadas === true);
await guardar(R1, { config: { 'vendas.precos_com_iva': '1' } });
check('configurações: a mesma fotografia não se repete', (await q(`select count(*)::int n from public.kangest_configuracoes where posto_id = $1`, [posto]))[0].n === 1);
await guardar(R2, { config: { 'vendas.precos_com_iva': '0' } });
check('configurações: outra versão fica ao lado', (await q(`select count(*)::int n from public.kangest_configuracoes where posto_id = $1`, [posto]))[0].n === 2);
for (let i = 0; i < 55; i++) await guardar(i.toString(16).padStart(64, 'c'), { i });
check('configurações: ficam as 50 mais recentes', (await q(`select count(*)::int n from public.kangest_configuracoes where posto_id = $1`, [posto]))[0].n === 50);
await recusa('configurações: um resumo que não é SHA-256', () => guardar('abc', {}), /inválidas/);
await recusa('configurações: as contas não as mandam', () => como(direccao, `select public.kangest_configuracoes_receber($1, $2, '{}'::jsonb)`, [posto, R1]), /permission denied/);
check('configurações: quem só vê relatórios não as lê', (await como(direccao, `select count(*)::int n from public.kangest_configuracoes`))[0].n === 0);
const config = await pessoa('config@x.ao', 'manager', { manage_settings: true });
check('configurações: quem gere as configurações lê-as', (await como(config, `select count(*)::int n from public.kangest_configuracoes`))[0].n === 50);

console.log(`kangest-relatorios: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
