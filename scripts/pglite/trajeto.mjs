// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários do trajeto com GPS (migração trajeto_gps), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/trajeto.mjs supabase/migrations
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
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};

await q(`insert into public.angola_provinces (id, name, slug) values ('luanda', 'Luanda', 'luanda')`);
await q(`insert into public.angola_municipalities (id, name, province) values ('viana', 'Viana', 'luanda')`);

const admin = await user('admin@loja.ao', 'admin');
const estafeta = await user('estafeta@loja.ao', 'manager', { manage_orders: true });
const marketing = await user('marketing@loja.ao', 'manager', { manage_marketing: true });
const cliente = await user('cliente@exemplo.ao');
const colPerfil = await user('cpt-0001@colportor.ao');
const [col] = await q(`insert into public.colporteurs (code, full_name, phone, status, profile_id, municipality_id, province_id, latitude, longitude)
  values ('CPT-0001', 'Ana Colportora', '923000001', 'activo', $1, 'viana', 'luanda', -8.885, 13.37) returning id`, [colPerfil]);

await q(`insert into public.payment_methods (name, code, type, enabled) values ('Transferência', 'transferencia', 'transfer', true)`);
const [livro] = await q(`insert into public.stock_books (title, price, stock) values ('Livro A', 5000, 100) returning id`);
// A colportora tem os livros à consignação: aceita e sai logo, sem os levantar na loja.
await q(`insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price) values ($1, $2, 9, 'entrega', 5000)`, [col.id, livro.id]);

let seq = 0;
const encomenda = async (extra = {}) => {
  seq++;
  const method = extra.shipping_method || 'delivery';
  const order = {
    order_number: `ENC-G${seq}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente Teste', customer_id: cliente,
    phone: '923000000', payment_method_code: 'transferencia', payment_method_name: 'Transferência', delivery_status: 'received',
    status: 'pending', shipping_method: method, delivery_province_id: 'luanda', delivery_province: 'Luanda',
    delivery_municipality_id: 'viana', delivery_municipality: 'Viana', delivery_street: 'Rua 1',
    delivery_address_full: 'Rua 1, Zango, Viana, Luanda', delivery_gps_lat: -8.90, delivery_gps_lng: 13.37,
    ...(method === 'pickup' ? { pickup_store: 'Loja Central' } : {}),
    ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify([{ book_id: livro.id, quantity: 1 }]), JSON.stringify({ method, free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const pagar = (o) => svc(`select public.order_payment_record($1, $2::numeric, 'transferencia', $3)`, [o.id, o.total, `TRF-${o.order_number}`], admin);
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const pos = async (id) => (await q(`select * from public.delivery_positions where order_id = $1`, [id]))[0];
const share = (who, id, lat, lng, acc = 8) => as(who, `select public.delivery_share_position($1, $2, $3, $4) as r`, [id, lat, lng, acc]).then((x) => x[0].r);
const destino = (id, lat, lng, acc = 12) => svc(`select public.order_set_destination($1, $2, $3, $4) as r`, [id, lat, lng, acc]).then((x) => x[0].r);
const entrega = async (o) => (await q(`select * from public.colporteur_deliveries where order_id = $1 and status in ('offered', 'accepted')`, [o.id]))[0];
const step = (d, s, extra = {}) => svc(`select public.colporteur_delivery_step($1::uuid, $2::uuid, $3, $4, $5, $6, $7) as r`,
  [d.id, colPerfil, s, extra.name || '', '', extra.sig || '', '']).then((x) => x[0].r);
const SIG = 'data:image/png;base64,iVBORw0KGgo=';

// --- 1. Quem recebe afina o ponto -----------------------------------------------------------
const o1 = await encomenda();
await pagar(o1);
let d1 = await entrega(o1);
check('paga: oferecida à colportora', !!d1 && d1.colporteur_id === col.id, d1);
await svc(`select public.colporteur_delivery_respond($1::uuid, $2::uuid, true, '')`, [d1.id, colPerfil]);
d1 = await entrega(o1);
const r1 = await destino(o1.id, -8.9012, 13.3734, 9.5);
const a1 = await order(o1.id);
check('o cliente afina o ponto: com a precisão e a hora', Number(a1.delivery_gps_lat) === -8.9012 && Number(a1.delivery_gps_accuracy) === 9.5 && !!a1.delivery_gps_updated_at, a1);
check('…e diz quanto mudou (cerca de 400 m)', Number(r1.moved_m) > 350 && Number(r1.moved_m) < 450, r1);
const avisoCol = await q(`select title, body from public.customer_notifications where customer_id = $1 and title like 'O cliente afinou%'`, [colPerfil]);
check('a colportora é avisada do ponto novo', avisoCol.length === 1 && /mudou \d+ m/.test(avisoCol[0].body), avisoCol);
await destino(o1.id, -8.90121, 13.37341, 6);
check('um ajuste de 1 m não volta a avisar', (await q(`select 1 from public.customer_notifications where customer_id = $1 and title like 'O cliente afinou%'`, [colPerfil])).length === 1);
await raises('fora de Angola: recusado', () => destino(o1.id, 38.72, -9.14), /fora de Angola/);
await raises('precisão de 5 km: pede para arrastar o ponto', () => destino(o1.id, -8.9, 13.37, 5000), /pouco precisa/);
await raises('só pela Edge Function (o cliente não chama a função)', () => as(cliente, `select public.order_set_destination($1, -8.9, 13.37, 10)`, [o1.id]), /permission denied/);

// --- 2. Quem entrega partilha a posição ------------------------------------------------------
await raises('antes de sair para entrega: ainda não', () => share(colPerfil, o1.id, -8.885, 13.37), /saiu para entrega/);
await step(d1, 'out_for_delivery');
const s1 = await share(colPerfil, o1.id, -8.885, 13.37, 12);
let p1 = await pos(o1.id);
check('saiu para entrega: a colportora partilha, com o nome e o primeiro ponto', p1.courier_kind === 'colportor' && p1.courier_name === 'Ana Colportora' && p1.trail.length === 1 && !s1.skipped, p1);
check('…e sabe a que distância está do cliente', Number(s1.distance_km) > 1.5 && Number(s1.distance_km) < 2.5, s1);
const s2 = await share(colPerfil, o1.id, -8.886, 13.37);
check('menos de 4 s depois: ignorado (dois separadores, pressa)', s2.skipped === true && (await pos(o1.id)).trail.length === 1, s2);
await q(`update public.delivery_positions set updated_at = now() - interval '10 seconds' where order_id = $1`, [o1.id]);
await share(colPerfil, o1.id, -8.8875, 13.37);
p1 = await pos(o1.id);
check('andou 280 m: novo ponto no trajeto', p1.trail.length === 2 && Number(p1.lat) === -8.8875, p1.trail);
await q(`update public.delivery_positions set updated_at = now() - interval '10 seconds' where order_id = $1`, [o1.id]);
await share(colPerfil, o1.id, -8.88752, 13.37);
p1 = await pos(o1.id);
check('andou 2 m: a posição actualiza, o trajeto não cresce', p1.trail.length === 2 && Number(p1.lat) === -8.88752, p1);
await raises('o cliente não partilha a posição da entrega', () => share(cliente, o1.id, -8.9, 13.37), /Só quem entrega/);
await raises('o marketing também não', () => share(marketing, o1.id, -8.9, 13.37), /Só quem entrega/);
await raises('fora de Angola: recusado', () => share(colPerfil, o1.id, 38.72, -9.14), /fora de Angola/);
await raises('GPS com ±9 km: espera por um sinal melhor', () => share(colPerfil, o1.id, -8.9, 13.37, 9000), /Sinal de GPS fraco/);

// O trajeto guarda no máximo 200 pontos.
const longo = Array.from({ length: 205 }, (_, i) => ({ lat: -8.8 - i * 0.001, lng: 13.37, at: new Date(Date.now() - (300 - i) * 60_000).toISOString() }));
await q(`update public.delivery_positions set trail = $2::jsonb, updated_at = now() - interval '10 seconds' where order_id = $1`, [o1.id, JSON.stringify(longo)]);
await share(colPerfil, o1.id, -8.95, 13.37);
p1 = await pos(o1.id);
check('o trajeto fica com os últimos 200 pontos', p1.trail.length === 200 && Number(p1.trail[199].lat) === -8.95 && Math.abs(Number(p1.trail[0].lat) - longo[6].lat) < 1e-9, { n: p1.trail.length, first: p1.trail[0] });

// --- 3. O que cada um vê ------------------------------------------------------------------------
const info = (await as(colPerfil, `select public.delivery_route_info($1) as r`, [o1.id]))[0].r;
check('quem entrega vê o ponto do cliente, com a precisão', Number(info.destination.lat) === -8.90121 && Number(info.destination.accuracy) === 6 && info.courier_kind === 'colportor', info.destination);
check('…a morada, o telefone e a sua partilha', /Zango/.test(info.address) && info.phone === '923000000' && info.sharing.mine === true && info.sharing.trail.length === 200);
const minhas = (await as(colPerfil, `select public.colporteur_my_deliveries() as m`))[0].m;
const minha = minhas.deliveries.find((x) => x.order_id === o1.id);
check('as entregas da colportora trazem a encomenda e a precisão do ponto', !!minha && Number(minha.customer?.gps?.accuracy) === 6 && !!minha.customer?.gps?.updated_at, minha?.customer?.gps);
await raises('o cliente não chama a vista de quem entrega', () => as(cliente, `select public.delivery_route_info($1)`, [o1.id]), /Sem acesso/);
check('a colportora lê a sua posição', (await as(colPerfil, `select order_id from public.delivery_positions`)).length === 1);
check('o cliente não lê as posições directamente', (await as(cliente, `select order_id from public.delivery_positions`)).length === 0);
check('quem gere encomendas lê', (await as(estafeta, `select order_id from public.delivery_positions`)).length === 1);
await raises('sem sessão: nada', () => as(null, `select * from public.delivery_positions`), /permission denied/);

// --- 4. A equipa também entrega ------------------------------------------------------------------
const o2 = await encomenda();
await pagar(o2);
const d2 = await entrega(o2);
await svc(`select public.colporteur_delivery_respond($1::uuid, $2::uuid, false, 'Longe')`, [d2.id, colPerfil]);
await svc(`update public.orders set delivery_status = 'shipped' where id = $1`, [o2.id], admin);
await share(estafeta, o2.id, -8.83, 13.23, 15);
const p2 = await pos(o2.id);
check('a equipa (Gerir encomendas) partilha numa entrega sua', p2.courier_kind === 'equipa' && p2.courier_profile === estafeta, p2);
await raises('a colportora que recusou já não partilha', () => share(colPerfil, o2.id, -8.9, 13.37), /Só quem entrega/);

// --- 5. Parar, e parar sozinho ---------------------------------------------------------------
await as(estafeta, `select public.delivery_stop_sharing($1)`, [o2.id]);
check('parar: fica parada', !!(await pos(o2.id)).stopped_at);
await share(estafeta, o2.id, -8.84, 13.24, 10);
const p2b = await pos(o2.id);
check('recomeçar: trajeto novo', !p2b.stopped_at && p2b.trail.length === 1 && Number(p2b.trail[0].lat) === -8.84, p2b.trail);
await step(d1, 'delivered', { name: 'Maria Cliente', sig: SIG });
check('entregue: a partilha pára sozinha', !!(await pos(o1.id)).stopped_at);
await raises('entregue: já não partilha', () => share(colPerfil, o1.id, -8.9, 13.37), /já não está a caminho/);
await raises('entregue: o ponto de entrega já não muda', () => destino(o1.id, -8.9, 13.37), /já foi entregue/);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [o2.id], admin);
check('cancelada: a partilha pára sozinha', !!(await pos(o2.id)).stopped_at);

// --- 6. Sem entrega ao domicílio --------------------------------------------------------------
const o3 = await encomenda({ shipping_method: 'pickup' });
await pagar(o3);
await svc(`update public.orders set delivery_status = 'shipped' where id = $1`, [o3.id], admin);
await raises('levantamento: não há trajeto', () => share(estafeta, o3.id, -8.83, 13.23), /não tem entrega ao domicílio/);
await raises('levantamento: não há ponto de entrega', () => destino(o3.id, -8.83, 13.23), /não tem entrega ao domicílio/);

// --- 7. A limpeza ------------------------------------------------------------------------------
const job = await q(`select schedule, command from cron.job where jobname = 'trajetos-limpeza'`);
check('a limpeza dos trajetos está agendada', job.length === 1 && /delivery_positions/.test(job[0].command), job);
await q(`update public.delivery_positions set stopped_at = now() - interval '8 days' where order_id = $1`, [o1.id]);
await q(job[0].command);
check('a limpeza apaga os trajetos parados há mais de 7 dias', !(await pos(o1.id)) && !!(await pos(o2.id)));

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
