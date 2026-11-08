// Cenários dos livros digitais (migração livros_digitais), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/digitais.mjs supabase/migrations
// Instruções em base.mjs e em docs/PAGAMENTOS.md ("Testes").
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn, re) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', name); }
  catch (e) { if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', name, '→', e.message); } else ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const svc = (sql, params = [], actor = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', $1, true)`, [JSON.stringify(actor ? { 'x-actor-id': actor } : {})]);
  await tx.exec('set local role service_role');
  return (await tx.query(sql, params)).rows;
});
const as = (sub, sql, params = []) => db.transaction(async (tx) => {
  const role = sub ? 'authenticated' : 'anon';
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null, confirmed = true) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, ${confirmed ? 'now()' : 'null'}) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};

const admin = await user('admin@loja.ao', 'admin');
const catalogo = await user('catalogo@loja.ao', 'manager', { manage_catalog: true });
const encomendas = await user('encomendas@loja.ao', 'manager', { manage_orders: true });
const caixa = await user('caixa@loja.ao', 'manager', { manage_orders: true, confirm_payments: true });
const marketing = await user('marketing@loja.ao', 'manager', { manage_marketing: true });
const maria = await user('maria@exemplo.ao');
const joao = await user('joao@exemplo.ao');
const porConfirmar = await user('semconfirmar@exemplo.ao', 'member', null, false);

await q(`insert into public.payment_methods (name, code, type, enabled) values
  ('Transferência Bancária', 'transferencia', 'transfer', true), ('Pagamento na Entrega', 'entrega', 'offline', true)`);
// Um livro com duas edições: impressa (0) e digital (1).
const [livro] = await q(`insert into public.stock_books (title, price, stock, versions) values
  ('O Desejado', 6000, 100, '[{"label":"Impresso","format":"","price":"","stock":"","isbn":""},{"label":"Edição digital","format":"PDF","price":"3000","stock":"","isbn":""}]')
  returning id`);
const [revista] = await q(`insert into public.stock_books (title, price, stock) values ('Revista Adventista', 1500, 100) returning id`);
const [pdfLivro] = await q(`insert into public.downloads (title, access, book_id, variant, file_path, file_name, published)
  values ('O Desejado (PDF)', 'paid', $1, 1, 'files/desejado.pdf', 'desejado.pdf', true) returning id`, [livro.id]);
const [pdfRevista] = await q(`insert into public.downloads (title, access, book_id, file_path, file_name, published)
  values ('Revista de Novembro (PDF)', 'paid', $1, 'files/revista.pdf', 'revista.pdf', true) returning id`, [revista.id]);
const [gratis] = await q(`insert into public.downloads (title, access, file_path, file_name, published)
  values ('Folheto grátis', 'free', 'files/folheto.pdf', 'folheto.pdf', true) returning id`);

let seq = 0;
const encomenda = async ({ customer = maria, email = 'maria@exemplo.ao', items = [{ book_id: livro.id, quantity: 1, variant: 1 }] } = {}) => {
  seq++;
  const order = {
    order_number: `ENC-D${String(seq).padStart(3, '0')}`, customer_email: email, customer_name: 'Maria Lopes',
    customer_id: customer, phone: '923000000', payment_method_code: 'transferencia', payment_method_name: 'Transferência Bancária',
    delivery_status: 'received', status: 'pending', shipping_method: 'pickup',
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify(items), JSON.stringify({ method: 'pickup', free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const rpc = async (fn, args, actor = caixa) => (await svc(`select ${fn} as r`, args, actor))[0].r;
const pode = async (who, id) => (await as(who, `select private.can_download($1) as ok`, [id]))[0].ok;
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const biblioteca = async (who) => as(who, `select * from public.my_digital_library()`);
const painel = async (who, search = '', state = '') => as(who, `select * from public.digital_access_overview($1, $2)`, [search, state]);

// --- 1. Só abre pago ------------------------------------------------------------------------
const o1 = await encomenda();
check('a edição digital entra na encomenda', o1.items[0].variant === 1 && Number(o1.total) === 3000, o1.items);
check('por pagar: fechado', !(await pode(maria, pdfLivro.id)));
await raises('por pagar: o download explica porquê', () => as(maria, `select public.start_download($1)`, [pdfLivro.id]), /quando o pagamento da encomenda estiver confirmado/);
check('biblioteca: por pagar', (await biblioteca(maria))[0]?.state === 'awaiting_payment', await biblioteca(maria));

// A regra antiga abria com a encomenda entregue ou com a recepção confirmada pelo cliente.
await svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [o1.id], admin);
check('entregue e por pagar: continua fechado', !(await pode(maria, pdfLivro.id)));
await svc(`update public.orders set customer_confirmed_at = now() where id = $1`, [o1.id], admin);
check('recepção confirmada e por pagar: continua fechado', !(await pode(maria, pdfLivro.id)));

await rpc(`public.order_payment_report($1, $2)`, [o1.id, 'TRF-778899'], null);
check('pagamento indicado pelo cliente: fechado', !(await pode(maria, pdfLivro.id)));
check('biblioteca: pagamento por confirmar', (await biblioteca(maria))[0]?.state === 'payment_review');

await rpc(`public.order_payment_record($1, 1000)`, [o1.id]);
check('pago em parte: fechado', (await order(o1.id)).payment_status !== 'paid' && !(await pode(maria, pdfLivro.id)));

const antes = Number((await q(`select count(*) from public.customer_notifications where order_id = $1 and title like 'Livro%'`, [o1.id]))[0].count);
await rpc(`public.order_payment_record($1, 2000)`, [o1.id]);
check('pago: o estado da encomenda é pago', (await order(o1.id)).payment_status === 'paid');
check('pago: abre', await pode(maria, pdfLivro.id));
const avisos = await q(`select title, body, href from public.customer_notifications where order_id = $1 and title like 'Livro%'`, [o1.id]);
check('pago: aviso "Livro digital disponível" na conta', antes === 0 && avisos.length === 1 && avisos[0].href === '/profile?tab=biblioteca' && avisos[0].body.includes('O Desejado (PDF)'), avisos);

const [d1] = await as(maria, `select public.start_download($1, 'open') as r`, [pdfLivro.id]);
check('pago: o download devolve o ficheiro e o modo', d1.r.path === 'files/desejado.pdf' && d1.r.mode === 'open', d1.r);
await as(maria, `select public.start_download($1)`, [pdfLivro.id]);
const [lib] = await biblioteca(maria);
check('biblioteca: disponível, com 2 aberturas/downloads registados', lib.state === 'open' && Number(lib.downloads) === 2 && !!lib.last_download, lib);
check('biblioteca: a encomenda e o estado do pagamento', lib.order_number === o1.order_number && lib.payment_status === 'paid');
const ev = await q(`select mode from public.download_events where download_id = $1 order by id`, [pdfLivro.id]);
check('registo: abrir e descarregar', JSON.stringify(ev.map((e) => e.mode)) === '["open","download"]', ev);
await raises('o cliente não lê o registo directamente', () => as(maria, `select * from public.download_events`), /permission denied/);

// A edição impressa não dá o PDF ligado à edição digital.
const oImpresso = await encomenda({ customer: joao, email: 'joao@exemplo.ao', items: [{ book_id: livro.id, quantity: 1, variant: 0 }] });
await rpc(`public.order_payment_record($1, $2::numeric)`, [oImpresso.id, oImpresso.total]);
check('a edição impressa paga não abre o PDF da digital', !(await pode(joao, pdfLivro.id)));
check('…nem aparece na biblioteca', (await biblioteca(joao)).length === 0);

// --- 2. Quem é o dono ----------------------------------------------------------------------
check('outra conta: fechado', !(await pode(joao, pdfLivro.id)));
check('anónimo: o pago fechado, o grátis aberto', !(await pode(null, pdfLivro.id)) && await pode(null, gratis.id));
await raises('anónimo: entrar para abrir', () => as(null, `select public.start_download($1)`, [pdfLivro.id]), /Entre na sua conta/);
const oEmail = await encomenda({ customer: null, email: 'semconfirmar@exemplo.ao', items: [{ book_id: revista.id, quantity: 1 }] });
await rpc(`public.order_payment_record($1, $2::numeric)`, [oEmail.id, oEmail.total]);
check('encomenda pelo email: com o email por confirmar, fechado', !(await pode(porConfirmar, pdfRevista.id)));
await q(`update auth.users set email_confirmed_at = now() where id = $1`, [porConfirmar]);
check('…com o email confirmado, abre', await pode(porConfirmar, pdfRevista.id));
const oConvidado = await encomenda({ customer: null, email: 'convidado@exemplo.ao', items: [{ book_id: revista.id, quantity: 1 }] });
await rpc(`public.order_payment_record($1, $2::numeric)`, [oConvidado.id, oConvidado.total]);

// --- 3. Reembolso e cancelamento ----------------------------------------------------------
const o2 = await encomenda({ items: [{ book_id: revista.id, quantity: 1 }] });
await rpc(`public.order_payment_record($1, $2::numeric)`, [o2.id, o2.total]);
check('revista paga: abre', await pode(maria, pdfRevista.id));
await rpc(`public.order_refund_record($1, $2::numeric, 'transferencia', 'DEV-1', null, '', 'Cliente desistiu da compra')`, [o2.id, o2.total]);
check('reembolsada: fecha', (await order(o2.id)).payment_status === 'refunded' && !(await pode(maria, pdfRevista.id)));
check('biblioteca: reembolsado', (await biblioteca(maria)).find((r) => r.download_id === pdfRevista.id)?.state === 'refunded');
const o3 = await encomenda({ items: [{ book_id: revista.id, quantity: 1 }] });
await rpc(`public.order_payment_record($1, $2::numeric)`, [o3.id, o3.total]);
check('outra encomenda paga do mesmo livro: abre de novo', await pode(maria, pdfRevista.id));
check('biblioteca: um livro só uma vez, pela encomenda paga', (await biblioteca(maria)).filter((r) => r.download_id === pdfRevista.id).map((r) => r.order_number).join() === o3.order_number);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [o3.id], admin);
check('cancelada: fecha', !(await pode(maria, pdfRevista.id)));

// --- 4. Bloquear e desbloquear ------------------------------------------------------------
await raises('o cliente não bloqueia', () => as(maria, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, 'teste')`, [pdfLivro.id, joao]), /row-level security/);
await raises('o marketing não bloqueia', () => as(marketing, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, 'teste')`, [pdfLivro.id, maria]), /row-level security/);
await raises('motivo curto de mais', () => as(encomendas, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, 'x')`, [pdfLivro.id, maria]), /download_blocks_reason_len/);
await raises('o autor do bloqueio não se escolhe', () => as(encomendas, `insert into public.download_blocks (download_id, user_id, reason, blocked_by) values ($1, $2, 'Partilha', $3)`, [pdfLivro.id, maria, admin]), /permission denied/);
const [bloq] = await as(encomendas, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, '  Partilhou   o ficheiro num grupo ') returning *`, [pdfLivro.id, maria]);
check('quem gere encomendas bloqueia, com o motivo limpo e o autor', bloq.reason === 'Partilhou o ficheiro num grupo' && bloq.blocked_by === encomendas, bloq);
check('bloqueado: fecha, mesmo pago', !(await pode(maria, pdfLivro.id)));
await raises('bloqueado: o download diz que foi a loja', () => as(maria, `select public.start_download($1)`, [pdfLivro.id]), /bloqueado pela loja/);
check('biblioteca: bloqueado', (await biblioteca(maria)).find((r) => r.download_id === pdfLivro.id)?.state === 'blocked');
const [auditB] = await q(`select summary, actor_id from public.security_audit_log where table_name = 'download_blocks' order by at desc limit 1`);
check('bloquear fica no registo de segurança', /Acesso bloqueado: O Desejado \(PDF\) — maria@exemplo.ao/.test(auditB?.summary) && auditB.actor_id === encomendas, auditB);
await raises('um bloqueio por pessoa e livro', () => as(catalogo, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, 'Outra vez')`, [pdfLivro.id, maria]), /download_blocks_one/);
await as(catalogo, `delete from public.download_blocks where download_id = $1 and user_id = $2`, [pdfLivro.id, maria]);
check('desbloqueado (pelo catálogo): abre de novo', await pode(maria, pdfLivro.id));
check('desbloquear fica no registo', (await q(`select 1 from public.security_audit_log where table_name = 'download_blocks' and summary like 'Acesso desbloqueado%'`)).length === 1);
check('a equipa do catálogo descarrega para ver o ficheiro, sem pagar', await pode(catalogo, pdfLivro.id));

// --- 5. O painel ---------------------------------------------------------------------------
await raises('o cliente não vê o painel', () => painel(maria), /Sem permissão/);
await raises('o marketing não vê o painel', () => painel(marketing), /Sem permissão/);
const rows = await painel(encomendas);
check('quem gere encomendas vê o painel', rows.length > 0);
check('o catálogo também', (await painel(catalogo)).length === rows.length);
const linha = (num, id) => rows.find((r) => r.order_number === num && r.download_id === id);
check('painel: aberto, com o cliente, o código e os downloads', linha(o1.order_number, pdfLivro.id)?.state === 'open'
  && linha(o1.order_number, pdfLivro.id)?.customer_email === 'maria@exemplo.ao' && Number(linha(o1.order_number, pdfLivro.id)?.downloads) === 2,
  linha(o1.order_number, pdfLivro.id));
check('painel: reembolsado', linha(o2.order_number, pdfRevista.id)?.state === 'refunded');
check('painel: canceladas não aparecem', !rows.some((r) => r.order_number === o3.order_number));
check('painel: pago sem conta (o cliente ainda não entrou)', linha(oConvidado.order_number, pdfRevista.id)?.state === 'no_account', linha(oConvidado.order_number, pdfRevista.id));
check('painel: pela conta com o email confirmado', linha(oEmail.order_number, pdfRevista.id)?.state === 'open' && linha(oEmail.order_number, pdfRevista.id)?.customer_id === porConfirmar);
const o4 = await encomenda({ customer: joao, email: 'joao@exemplo.ao' });
await rpc(`public.order_payment_report($1, $2)`, [o4.id, 'TRF-111222'], null);
const comPorConfirmar = await painel(encomendas);
check('painel: o pagamento por confirmar vem primeiro (é o que a equipa tem de fazer)', comPorConfirmar[0].state === 'payment_review' && comPorConfirmar[0].order_number === o4.order_number, comPorConfirmar[0]);
check('painel: filtrar por estado', (await painel(encomendas, '', 'payment_review')).every((r) => r.state === 'payment_review'));
// O João tem duas encomendas, mas só a da edição digital (o4) dá um livro digital.
check('painel: procurar pelo email, pelo número ou pelo livro', (await painel(encomendas, 'joao@')).length === 1
  && (await painel(encomendas, o1.order_number.toLowerCase())).length === 1 && (await painel(encomendas, 'revista')).every((r) => r.download_id === pdfRevista.id));
await as(encomendas, `insert into public.download_blocks (download_id, user_id, reason) values ($1, $2, 'Partilha do ficheiro')`, [pdfLivro.id, maria]);
const bl = (await painel(encomendas, o1.order_number)).find((r) => r.download_id === pdfLivro.id);
check('painel: bloqueado, com o motivo', bl?.state === 'blocked' && bl.block_reason === 'Partilha do ficheiro' && !!bl.blocked_at, bl);

// --- 6. A lista pública continua a dizer quem pode -----------------------------------------
const lista = await as(maria, `select id, can_download from public.downloads_list(null)`);
check('downloads_list: o bloqueado não abre, o grátis sim', lista.find((r) => r.id === pdfLivro.id)?.can_download === false && lista.find((r) => r.id === gratis.id)?.can_download === true);
await raises('a biblioteca é só de quem tem sessão', () => as(null, `select * from public.my_digital_library()`), /permission denied/);
await raises('o painel nem se chama sem sessão', () => as(null, `select * from public.digital_access_overview()`), /permission denied/);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
