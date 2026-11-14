// Cenários da migração 20261114200000_colportores_igrejas_cartao_avaliacoes, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/colportores.mjs supabase/migrations
// Instruções em base.mjs e em docs/COLPORTAGEM.md (secções 6 a 9).
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
const como = (role, sub, email, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true),
                         set_config('request.jwt.claim.email', $3, true), set_config('request.headers', '{}', true)`, [role, sub || '', email || '']);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const anon = (sql, params) => como('anon', '', '', sql, params);
const user = async (email, role = 'member', permissions = {}) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  await q(`update public.profiles set role = $2, permissions = $3::jsonb where id = $1`, [u.id, role, JSON.stringify(permissions)]);
  return { id: u.id, email };
};
const as = (u, sql, params) => como('authenticated', u.id, u.email, sql, params);

// Pessoas: administrador, gestor da colportagem, gestor do catálogo, dois clientes e dois colportores.
const admin = await user('admin@loja.ao', 'admin');
const gestor = await user('gestor@loja.ao', 'manager', { manage_colporteurs: true });
const catalogo = await user('catalogo@loja.ao', 'manager', { manage_catalog: true });
const cliente = await user('cliente@exemplo.ao');
const outro = await user('outro@exemplo.ao');
const contaA = await user('ana@colportor.ao');
const contaB = await user('bento@colportor.ao');

// Registo da Igreja: um campo, um distrito, duas igrejas.
await q(`insert into public.angola_provinces (id, name, slug) values ('huambo', 'Huambo', 'huambo')`);
await q(`insert into public.angola_municipalities (id, name, province) values ('huambo-m', 'Huambo', 'huambo')`);
const [campo] = await q(`insert into public.church_fields (name, short_name, kind) values ('Missão Centro de Angola', 'MCA', 'missao') returning id`);
const [distrito] = await q(`insert into public.church_districts (field_id, name, province_id, municipality_id) values ($1, 'Distrito Centro', 'huambo', 'huambo-m') returning id`, [campo.id]);
const [igreja] = await q(`insert into public.churches (cn, name, district_id) values ('001', 'Igreja Central do Huambo', $1) returning id, field_id`, [distrito.id]);
const [igreja2] = await q(`insert into public.churches (cn, name, district_id) values ('002', 'Igreja da Cidade Baixa', $1) returning id`, [distrito.id]);
check('a igreja herda o campo do distrito', igreja.field_id === campo.id);

// 1. Igrejas: contactos e localização ----------------------------------------------------------
await q(`update public.churches set phone = '923456789', email = 'central@igreja.ao', responsible_name = 'Ancião João', members_count = 320, latitude = -12.77, longitude = 15.73 where id = $1`, [igreja.id]);
await q(`update public.churches set phone = '241000000' where id = $1`, [igreja2.id]);
await raises('telefone da igreja com 8 algarismos', () => q(`update public.churches set phone = '92345678' where id = $1`, [igreja.id]));
await raises('latitude sem longitude', () => q(`update public.churches set longitude = null where id = $1`, [igreja.id]), /coordenadas_juntas/);
await raises('coordenadas fora de Angola', () => q(`update public.churches set latitude = 38.7, longitude = -9.1 where id = $1`, [igreja.id]));

// A loja do Huambo (a migração 20261114180000 dá a cada colportor a loja que serve a sua província).
let [lojaHuambo] = await q(`select id from public.physical_stores where name ilike '%Huambo%' or province ilike 'Huambo' limit 1`);
if (!lojaHuambo) [lojaHuambo] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria Adventista — Huambo', 'Huambo', 'Huambo', true) returning id`);
await q(`update public.physical_stores set service_provinces = array['Huambo'] where id = $1`, [lojaHuambo.id]);

// Colportores: A activo da igreja central, B activo sem igreja (só texto), C candidato.
const colportor = async (code, nome, telefone, conta, church = null, outra = '') => {
  const [c] = await q(`insert into public.colporteurs (code, full_name, phone, status, profile_id, church_id, church_other, start_date)
    values ($1, $2, $3, 'activo', $4, $5, $6, '2026-02-01') returning id`, [code, nome, telefone, conta ? conta.id : null, church, outra]);
  return c.id;
};
const A = await colportor('CPT-0001', 'Ana Colportora', '923000001', contaA, igreja.id);
const B = await colportor('CPT-0002', 'Bento Colportor', '923000002', contaB, null, 'Igreja do Bairro');
const [C] = await q(`insert into public.colporteurs (full_name, phone, church_id) values ('Carla Candidata', '923000003', $1) returning id`, [igreja.id]);

// 2. Cartão -------------------------------------------------------------------------------------
await raises('um cliente não emite cartões', () => as(cliente, `select public.colporteur_card($1::uuid)`, [A]), /Sem permissão/);
const [{ c: c1 }] = await as(gestor, `select public.colporteur_card($1::uuid) as c`, [A]);
check('o cartão tem o código de verificação de 8 símbolos', /^[A-HJ-NP-Z2-9]{8}$/.test(c1.card_check), c1);
check('o cartão diz a igreja, o distrito e o campo', c1.church === 'Igreja Central do Huambo' && c1.district === 'Distrito Centro' && c1.field === 'MCA', c1);
check('o cartão vale até 31 de Dezembro do ano em que foi emitido', /^\d{4}-12-31$/.test(c1.valid_until), c1);
check('o cartão diz a loja do colportor (a da sua província)', /Huambo/.test(c1.store || ''), c1);
const [{ c: c2 }] = await as(gestor, `select public.colporteur_card($1::uuid) as c`, [A]);
check('abrir o cartão outra vez não muda o código', c2.card_check === c1.card_check);
const [{ c: c3 }] = await as(gestor, `select public.colporteur_card($1::uuid, true) as c`, [A]);
check('reemitir dá outro código', c3.card_check !== c1.card_check);
const ev = await q(`select detail from public.colporteur_events where colporteur_id = $1 and kind = 'cartao' order by id`, [A]);
check('o histórico regista a emissão e a reemissão', ev.length === 2 && ev[0].detail.accao === 'emitido' && ev[1].detail.accao === 'reemitido', ev);
await raises('candidato não tem cartão', () => as(gestor, `select public.colporteur_card($1::uuid)`, [C.id]), /activos/);
const [{ c: proprio }] = await as(contaA, `select public.colporteur_card() as c`);
check('o próprio colportor vê o seu cartão', proprio.card_check === c3.card_check && proprio.code === 'CPT-0001');
await raises('o próprio não reemite', () => as(contaA, `select public.colporteur_card(null, true)`), /equipa reemite/);
await raises('um cliente não tem cartão', () => as(cliente, `select public.colporteur_card()`), /não é de um colportor/);
await raises('o código de verificação não se muda à mão', () => as(gestor, `update public.colporteurs set card_check = 'ABCDEFGH' where id = $1`, [A]), /botão «Cartão»/);
await as(gestor, `update public.colporteurs set notes = 'Boa colportora' where id = $1`, [A]);
check('a equipa continua a editar o resto da ficha', (await q(`select notes from public.colporteurs where id = $1`, [A]))[0].notes === 'Boa colportora');

// 3. Verificação pública -------------------------------------------------------------------------
const [{ v: errado }] = await anon(`select public.colporteur_verify('CPT-0001', 'AAAAAAAA') as v`);
check('sem o código de verificação certo não diz nada', errado.found === false && Object.keys(errado).length === 1, errado);
const [{ v: velho }] = await anon(`select public.colporteur_verify('CPT-0001', $1) as v`, [c1.card_check]);
check('o cartão reemitido invalida o anterior', velho.found === false);
const [{ v: certo }] = await anon(`select public.colporteur_verify('cpt1', $1) as v`, [c3.card_check.toLowerCase().replace(/(.{4})/, '$1-')]);
check('aceita «cpt1» e o código em minúsculas com hífen', certo.found === true && certo.valid === true && certo.code === 'CPT-0001', certo);
check('a verificação não mostra o telefone nem o email', !('phone' in certo) && !('email' in certo) && !JSON.stringify(certo).includes('923000001'), certo);
check('a verificação diz o nome, a categoria, a igreja e a loja', certo.full_name === 'Ana Colportora' && certo.category === 'aspirante' && certo.church === 'Igreja Central do Huambo' && /Huambo/.test(certo.store || ''), certo);
await q(`select set_config('app.colporteur_rpc', '1', false)`);
await q(`update public.colporteurs set status = 'suspenso', status_reason = 'teste' where id = $1`, [A]);
const [{ v: susp }] = await anon(`select public.colporteur_verify('CPT-0001', $1) as v`, [c3.card_check]);
check('suspenso: o cartão aparece como não válido', susp.found === true && susp.valid === false && susp.status === 'suspenso', susp);
await q(`update public.colporteurs set status = 'activo' where id = $1`, [A]);
await q(`select set_config('app.colporteur_rpc', '', false)`);
// A data do cartão só muda por colporteur_card(); aqui, para simular um cartão do ano passado,
// abre-se a guarda como a função faz.
const semGuarda = (sql, params) => db.transaction(async (tx) => {
  await tx.query(`select set_config('app.colporteur_card', '1', true)`);
  return (await tx.query(sql, params)).rows;
});
await semGuarda(`update public.colporteurs set card_issued_at = '2025-03-01' where id = $1`, [A]);
const [{ v: caducado }] = await anon(`select public.colporteur_verify('CPT-0001', $1) as v`, [c3.card_check]);
check('um cartão do ano passado está caducado', caducado.found && caducado.valid === false && caducado.expired === true, caducado);
await semGuarda(`update public.colporteurs set card_issued_at = now() where id = $1`, [A]);
await raises('anónimo não emite cartões', () => anon(`select public.colporteur_card()`));

// 4. Avaliações dos colportores --------------------------------------------------------------------
const [livro] = await q(`insert into public.stock_books (title, price, stock, cover) values ('O Grande Conflito', 5000, 100, '/images/capas/LIV-001.jpg') returning id`);
const [livro2] = await q(`insert into public.stock_books (title, price, stock) values ('Daniel', 3000, 100) returning id`);
const svc = (sql, params = [], actor = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', $1, true)`, [JSON.stringify(actor ? { 'x-actor-id': actor } : {})]);
  await tx.exec('set local role service_role');
  return (await tx.query(sql, params)).rows;
});
await q(`insert into public.payment_methods (name, code, type, enabled) values ('Transferência', 'transferencia', 'transfer', true)`);
// A encomenda entra como no site (o pagamento começa pendente; o colportor vem do código) e
// depois muda de estado como faria a equipa.
const encomenda = async (n, extra = {}) => {
  const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, customer_id, items, total, colporteur_code, shipping_method)
    values ($1, 'cliente@exemplo.ao', 'Maria Cliente', $2, $3::jsonb, 10000, $4, 'delivery') returning id, order_number`,
  [n, cliente.id, JSON.stringify([{ book_id: livro.id, quantity: 2 }]), extra.codigo || null]);
  if (extra.pago !== false) {
    // O pagamento regista-se como no painel (o estado «pago» resulta dele); depois, a entrega.
    await svc(`select public.order_payment_record($1, 10000::numeric, 'transferencia', $2)`, [o.id, `TRF-${n}`], admin.id);
    await q(`update public.orders set delivery_status = 'delivered' where id = $1`, [o.id]);
  }
  return o;
};
// E1: comprada com o código de A, paga e entregue. E2: entregue por B (entrega feita), sem código.
// E3: com o código de A, mas por pagar.
const E1 = await encomenda('ENC-R1', { codigo: 'cpt1' });
const E2 = await encomenda('ENC-R2');
const E3 = await encomenda('ENC-R3', { codigo: 'CPT-0001', pago: false });
const e1 = (await q(`select colporteur_id, payment_status, delivery_status from public.orders where id = $1`, [E1.id]))[0];
check('a encomenda E1 ficou com A, paga e entregue', e1.colporteur_id === A && e1.payment_status === 'paid' && e1.delivery_status === 'delivered', e1);
await q(`insert into public.colporteur_deliveries (order_id, colporteur_id, status, expires_at, delivered_at) values ($1, $2, 'delivered', now(), now())`, [E2.id, B]);

const [{ t: alvos1 }] = await as(cliente, `select public.colporteur_review_targets('ENC-R1') as t`);
check('E1: o cliente pode avaliar quem lhe vendeu (código)', alvos1.length === 1 && alvos1[0].colporteur_id === A && alvos1[0].kind === 'venda' && alvos1[0].review === null, alvos1);
const [{ t: alvos2 }] = await as(cliente, `select public.colporteur_review_targets('ENC-R2') as t`);
check('E2: o cliente pode avaliar quem entregou', alvos2.length === 1 && alvos2[0].colporteur_id === B && alvos2[0].kind === 'entrega', alvos2);
const [{ t: alvos3 }] = await as(cliente, `select public.colporteur_review_targets('ENC-R3') as t`);
check('E3: por pagar, ainda não se avalia', alvos3.length === 0, alvos3);
const [{ t: alheia }] = await as(outro, `select public.colporteur_review_targets('ENC-R1') as t`);
check('outra pessoa não vê os colportores da encomenda', alheia.length === 0);
const [{ t: anonimo }] = await anon(`select public.colporteur_review_targets('ENC-R1') as t`).catch(() => [{ t: null }]);
check('sem sessão não há avaliação', anonimo === null || anonimo.length === 0);

await as(cliente, `select public.colporteur_review_save('ENC-R1', $1::uuid, 4, '  Muito simpática  ')`, [A]);
await as(cliente, `select public.colporteur_review_save('ENC-R1', $1::uuid, 5, 'Muito simpática e pontual')`, [A]);
const rev = await q(`select * from public.colporteur_reviews where order_id = $1`, [E1.id]);
check('uma avaliação por encomenda; gravar outra vez muda-a', rev.length === 1 && rev[0].rating === 5 && rev[0].comment === 'Muito simpática e pontual' && rev[0].kind === 'venda', rev);
await raises('6 estrelas', () => as(cliente, `select public.colporteur_review_save('ENC-R1', $1::uuid, 6, '')`, [A]), /1 a 5/);
await raises('avaliar quem não teve nada com a encomenda', () => as(cliente, `select public.colporteur_review_save('ENC-R1', $1::uuid, 5, '')`, [B]), /paga e entregue/);
await raises('avaliar a encomenda de outra pessoa', () => as(outro, `select public.colporteur_review_save('ENC-R1', $1::uuid, 1, 'mau')`, [A]), /não encontrada/);
await raises('avaliar uma encomenda por pagar', () => as(cliente, `select public.colporteur_review_save('ENC-R3', $1::uuid, 5, '')`, [A]), /paga e entregue/);
await raises('ninguém escreve na tabela directamente', () => as(cliente, `insert into public.colporteur_reviews (colporteur_id, order_id, kind, rating) values ($1, $2, 'venda', 5)`, [A, E1.id]));
await as(cliente, `select public.colporteur_review_save('ENC-R2', $1::uuid, 2, 'Chegou atrasado')`, [B]);
const [{ t: depois }] = await as(cliente, `select public.colporteur_review_targets('ENC-R1') as t`);
check('o cliente vê a avaliação que deu', depois[0].review && depois[0].review.rating === 5);
check('o cliente lê as suas avaliações na tabela', (await as(cliente, `select id from public.colporteur_reviews`)).length === 2);
check('outra pessoa não lê as avaliações', (await as(outro, `select id from public.colporteur_reviews`)).length === 0);

const [{ l: daA }] = await as(contaA, `select public.colporteur_reviews_list() as l`);
check('o colportor vê a média e os comentários', Number(daA.avg) === 5 && daA.count === 1 && daA.items[0].comment === 'Muito simpática e pontual', daA);
check('o colportor não sabe quem escreveu', !('order_number' in daA.items[0]) && !('customer' in daA.items[0]) && !JSON.stringify(daA).includes('Maria'), daA);
await raises('o colportor não lê as avaliações de outro', () => as(contaA, `select public.colporteur_reviews_list($1::uuid)`, [B]), /Sem permissão/);
const [{ l: equipaB }] = await as(gestor, `select public.colporteur_reviews_list($1::uuid) as l`, [B]);
check('a equipa vê a encomenda e o primeiro nome do cliente', equipaB.items[0].order_number === 'ENC-R2' && equipaB.items[0].customer === 'Maria', equipaB);

await raises('ocultar sem motivo', () => as(gestor, `select public.colporteur_review_hide($1::uuid, true, '')`, [equipaB.items[0].id]), /porque oculta/);
await raises('um cliente não modera', () => as(cliente, `select public.colporteur_review_hide($1::uuid, true, 'não gosto')`, [equipaB.items[0].id]), /Sem permissão/);
await as(gestor, `select public.colporteur_review_hide($1::uuid, true, 'Linguagem imprópria')`, [equipaB.items[0].id]);
const [{ l: deB }] = await as(contaB, `select public.colporteur_reviews_list() as l`);
check('a avaliação oculta não conta para a média nem aparece ao colportor', deB.count === 0 && deB.avg === null && deB.items.length === 0, deB);
const notas = await as(gestor, `select * from public.colporteur_ratings() order by rating_avg desc`);
check('as médias da equipa só contam as visíveis', notas.length === 1 && notas[0].colporteur_id === A && Number(notas[0].rating_avg) === 5 && notas[0].rating_count === 1, notas);
await as(gestor, `select public.colporteur_review_hide($1::uuid, false)`, [equipaB.items[0].id]);
check('mostrar outra vez', (await q(`select hidden, hidden_reason from public.colporteur_reviews where id = $1`, [equipaB.items[0].id]))[0].hidden === false);

// 5. Igrejas e colportores ---------------------------------------------------------------------------
await q(`insert into public.colporteur_reports (colporteur_id, week_start, hours, status, sales, sales_value) values
  ($1, date_trunc('week', now())::date, 30, 'validado', $2::jsonb, 25000),
  ($1, (date_trunc('week', now()) - interval '7 days')::date, 12, 'enviado', $3::jsonb, 0)`,
[A, JSON.stringify([{ book_id: livro.id, qty: 3, source: 'consignacao' }, { book_id: livro2.id, qty: 1, source: 'proprio' }]), JSON.stringify([{ book_id: livro2.id, qty: 50 }])]);
const [{ r: todas }] = await as(gestor, `select public.church_colporteurs() as r`);
const central = todas.find((x) => x.church_id === igreja.id);
check('por igreja: activos, candidaturas e categorias', central.active_count === 1 && central.candidates === 1 && central.by_category.aspirante === 1, central);
check('por igreja: horas e vendas só dos relatórios validados', Number(central.hours) === 30 && Number(central.sales) === 25000, central);
check('por igreja: o campo, o distrito e a média', central.field === 'MCA' && central.district === 'Distrito Centro' && Number(central.rating_avg) === 5, central);
check('a lista geral não leva os colportores', central.colporteurs === null);
const baixa = todas.find((x) => x.church_id === igreja2.id);
check('uma igreja sem colportores aparece a zeros', baixa.active_count === 0 && Number(baixa.hours) === 0 && baixa.rating_avg === null, baixa);
const [{ r: uma }] = await as(gestor, `select public.church_colporteurs($1::uuid) as r`, [igreja.id]);
check('com uma igreja, a lista dos seus colportores (sem os recusados)', uma.length === 1 && uma[0].colporteurs.length === 2 && uma[0].colporteurs[0].code === 'CPT-0001', uma);
check('na lista da igreja, a loja de cada colportor', /Huambo/.test(uma[0].colporteurs[0].store || ''), uma[0].colporteurs[0]);
await raises('um cliente não vê as igrejas', () => as(cliente, `select public.church_colporteurs()`), /Sem permissão/);
const [{ d: directorio }] = await anon(`select public.church_directory() as d`);
check("a lista pública diz o campo de cada igreja e não tem contactos", directorio.churches[0].field === "MCA" && !JSON.stringify(directorio).includes("central@igreja.ao") && !JSON.stringify(directorio).includes("923456789"), directorio.churches[0]);

// 6. Livros mais vendidos por colportor e por igreja -------------------------------------------------
await as(cliente, `insert into public.book_reviews (book_id, rating, comment) values ($1, 4, 'Um livro muito bom')`, [livro.id]);
const [{ b: deA }] = await as(gestor, `select public.colporteur_top_books($1::uuid) as b`, [A]);
// Relatório validado: 3 + 1; vendas no site com o código de A: E1 (2, paga). E3 não conta (por pagar).
check('A: relatórios validados e vendas no site pagas', deA.length === 2 && deA[0].book_id === livro.id && Number(deA[0].qty) === 5 && Number(deA[1].qty) === 1, deA);
check('com a capa e a média das avaliações do livro', deA[0].cover === '/images/capas/LIV-001.jpg' && Number(deA[0].rating_avg) === 4 && deA[0].rating_count === 1, deA[0]);
const [{ b: daIgreja }] = await as(gestor, `select public.colporteur_top_books(null, $1::uuid) as b`, [igreja.id]);
check('por igreja soma os seus colportores', daIgreja.length === 2 && Number(daIgreja[0].qty) === 5);
const [{ b: meus }] = await as(contaA, `select public.colporteur_top_books($1::uuid) as b`, [A]);
check('o colportor vê os seus', meus.length === 2);
await raises('o colportor não vê os de outro', () => as(contaA, `select public.colporteur_top_books($1::uuid)`, [B]), /Sem permissão/);

// 7. Avaliações dos livros: ocultar ---------------------------------------------------------------
const [br] = await q(`select id from public.book_reviews where book_id = $1`, [livro.id]);
await as(cliente, `update public.book_reviews set hidden = true, comment = 'Um livro muito bom mesmo' where id = $1`, [br.id]);
check('o autor edita, mas o «hidden» não lhe pertence', (await q(`select hidden, comment from public.book_reviews where id = $1`, [br.id]))[0].hidden === false);
await raises('um cliente não modera livros', () => as(cliente, `select public.book_review_hide($1, true, 'spam')`, [br.id]), /Sem permissão/);
await raises('a colportagem não modera livros', () => as(gestor, `select public.book_review_hide($1, true, 'spam')`, [br.id]), /Sem permissão/);
await as(catalogo, `select public.book_review_hide($1, true, 'Fala de outro livro')`, [br.id]);
check('oculta: o público já não a vê', (await anon(`select id from public.book_reviews where id = $1`, [br.id])).length === 0);
check('oculta: o autor continua a vê-la', (await as(cliente, `select id from public.book_reviews where id = $1`, [br.id])).length === 1);
check('oculta: a equipa do catálogo vê-a', (await as(catalogo, `select id from public.book_reviews where id = $1`, [br.id])).length === 1);
await as(cliente, `update public.book_reviews set hidden = false where id = $1`, [br.id]);
check('o autor não a volta a mostrar', (await q(`select hidden from public.book_reviews where id = $1`, [br.id]))[0].hidden === true);
const [{ b: semOculta }] = await as(gestor, `select public.colporteur_top_books($1::uuid) as b`, [A]);
check('a média do livro deixa de contar a oculta', semOculta[0].rating_avg === null && semOculta[0].rating_count === 0, semOculta[0]);
const [{ r: recentes }] = await as(catalogo, `select public.book_reviews_recent(10, true) as r`);
check('a lista de moderação mostra as ocultas, com o motivo', recentes.length === 1 && recentes[0].hidden_reason === 'Fala de outro livro' && recentes[0].title === 'O Grande Conflito', recentes);
await raises('a lista de moderação é do catálogo', () => as(cliente, `select public.book_reviews_recent()`), /Sem permissão/);
await as(catalogo, `select public.book_review_hide($1, false)`, [br.id]);
check('mostrar outra vez limpa o motivo', (await q(`select hidden, hidden_reason from public.book_reviews where id = $1`, [br.id]))[0].hidden_reason === '');

console.log(`colportores: ${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
