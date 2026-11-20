// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários dos funcionários, da produção da Editora e das saídas de dinheiro (migrações
// funcionarios, producao e saidas), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/producao.mjs supabase/migrations
// Instruções em base.mjs e em docs/PRODUCAO.md.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn, re) => {
  try {
    await fn();
    fail++; console.log('FALHOU (devia recusar):', name);
  } catch (e) {
    if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', name, '→', e.message); } else ok++;
  }
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
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub]);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};

const admin = await user('admin@loja.ao', 'admin');
const rh = await user('rh@loja.ao', 'manager', { manage_staff: true });
const prod = await user('prod@loja.ao', 'manager', { manage_production: true });
const fin = await user('fin@loja.ao', 'manager', { manage_finance: true });
const vendas = await user('vendas@loja.ao', 'manager', { manage_orders: true });
const cliente = await user('cliente@exemplo.ao');
const [livro] = await q(`insert into public.stock_books (title, price, stock) values ('Hinário Adventista', 6000, 10) returning id`);
const stockDe = async (id) => Number((await q(`select stock from public.stock_books where id = $1`, [id]))[0].stock);

// =============================================================================================
// A. Fichas dos funcionários
// =============================================================================================
const [f1] = await as(rh, `insert into public.staff_members (full_name, job_title, department, phone, code)
  values ('  Maria Kiala  ', 'Paginadora', 'producao', '923456789', 'FUN-999') returning *`);
check('ficha nova: código FUN- do contador (o que vem do navegador não conta)', /^FUN-\d{3,}$/.test(f1.code) && f1.code !== 'FUN-999', f1.code);
check('ficha nova: nome limpo e telefone no formato do site', f1.full_name === 'Maria Kiala' && f1.phone === '+244 923 456 789', f1);
await raises('telefone inválido recusado', () => as(rh, `insert into public.staff_members (full_name, phone) values ('Pedro Teste', '12345')`), /check/);
check('o cliente não vê fichas', (await as(cliente, `select id from public.staff_members`)).length === 0);
check('quem só gere encomendas não vê fichas', (await as(vendas, `select id from public.staff_members`)).length === 0);
check('a produção vê as fichas (escolhe os responsáveis)', (await as(prod, `select id from public.staff_members`)).length === 1);
await raises('a produção não cria fichas', () => as(prod, `insert into public.staff_members (full_name) values ('Outro Nome')`), /row-level security/);
await raises('o código não se muda', async () => {
  const [r] = await as(rh, `update public.staff_members set code = 'FUN-777' where id = $1 returning code`, [f1.id]);
  if (r.code !== f1.code) return;
  throw new Error('código igual');
}, /código igual/);

// Uma pessoa, um código: ficha ligada a uma conta da equipa usa o código da conta.
const [contaAdmin] = await q(`select staff_code from public.profiles where id = $1`, [admin]);
const [fAdmin] = await as(rh, `insert into public.staff_members (full_name, profile_id) values ('Administrador Teste', $1) returning code`, [admin]);
check('ficha de quem tem conta da equipa: o mesmo código FUN-', fAdmin.code === contaAdmin.staff_code, { ficha: fAdmin.code, conta: contaAdmin.staff_code });
// … e uma conta que ainda é cliente fica com o código da ficha quando é promovida.
const futuro = await user('futuro@loja.ao');
const [fFuturo] = await as(rh, `insert into public.staff_members (full_name, profile_id) values ('Futuro Gestor', $1) returning code`, [futuro]);
await q(`update public.profiles set role = 'manager', permissions = '{"manage_orders": true}' where id = $1`, [futuro]);
const [contaFuturo] = await q(`select staff_code from public.profiles where id = $1`, [futuro]);
check('conta promovida a equipa usa o código da ficha', contaFuturo.staff_code === fFuturo.code, { ficha: fFuturo.code, conta: contaFuturo.staff_code });
check('a própria pessoa vê a sua ficha', (await as(futuro, `select code from public.staff_members`)).map((r) => r.code).join() === fFuturo.code);
const [saiu] = await as(rh, `update public.staff_members set status = 'saiu' where id = $1 returning left_on`, [fFuturo.id ?? (await q(`select id from public.staff_members where code = $1`, [fFuturo.code]))[0].id]);
check('saiu: a data de saída fica', !!saiu.left_on, saiu);

// =============================================================================================
// B. Produção
// =============================================================================================
const [grafica] = await as(prod, `insert into public.suppliers (name, kind, phone, iban) values ('Gráfica Huambo', 'grafica', '+244923000111', 'ao06 0000 1111 2222 3333 4444 5') returning *`);
check('fornecedor: código FOR- e IBAN em maiúsculas', /^FOR-\d{3}$/.test(grafica.code) && grafica.iban === 'AO06 0000 1111 2222 3333 4444 5', grafica);
check('as finanças vêem os fornecedores', (await as(fin, `select id from public.suppliers`)).length === 1);
check('recursos humanos não vêem fornecedores', (await as(rh, `select id from public.suppliers`)).length === 0);

const [o1] = await as(prod, `insert into public.production_orders (title, book_id, kind, quantity, supplier_id)
  values ('Hinário Adventista — reimpressão', $1, 'reimpressao', 500, $2) returning *`, [livro.id, grafica.id]);
const etapas = async (orderId) => q(`select * from public.production_stages where order_id = $1 order by position`, [orderId]);
check('ordem nova: código PRD- e planeada', /^PRD-\d{3}$/.test(o1.code) && o1.status === 'planeada', o1);
check('reimpressão: 5 etapas por omissão', (await etapas(o1.id)).length === 5);
const [novo] = await as(prod, `insert into public.production_orders (title, kind, quantity) values ('Livro novo', 'novo_titulo', 1000) returning id`);
check('título novo: 8 etapas, da revisão à recepção', (await etapas(novo.id)).map((e) => e.name).join('|')
  === 'Original recebido|Revisão|Paginação|Capa|Prova aprovada|Impressão|Acabamento|Recepção na loja');
await raises('uma ordem não nasce concluída', () => as(prod, `insert into public.production_orders (title, quantity, status) values ('X título', 10, 'concluida')`), /começa planeada/);
await raises('concluir à mão (sem a entrada no stock) é recusado', () => as(prod, `update public.production_orders set status = 'concluida' where id = $1`, [o1.id]), /pelos botões/);
await raises('as finanças não criam ordens', () => as(fin, `insert into public.production_orders (title, quantity) values ('Outra', 5)`), /row-level security/);

// Etapas: responsável, prazo, começar põe a ordem em curso.
const [e1] = await etapas(o1.id);
await as(prod, `update public.production_stages set responsible_id = $2, due_date = current_date + 3, status = 'em_curso' where id = $1`,
  [e1.id, f1.id]);
const [e1b] = await etapas(o1.id);
check('etapa começada: data de início e responsável', !!e1b.started_at && e1b.responsible_id === f1.id && !e1b.done_at, e1b);
const [o1b] = await q(`select status, start_date from public.production_orders where id = $1`, [o1.id]);
check('começar uma etapa põe a ordem em curso, com a data de início', o1b.status === 'em_curso' && !!o1b.start_date, o1b);
await raises('não se apaga uma ordem em curso (cancela-se)', () => as(prod, `delete from public.production_orders where id = $1`, [o1.id]), /cancele/);

// Mudar a ordem das etapas.
const antes = (await etapas(o1.id)).map((e) => e.name);
await as(prod, `select public.production_stage_move($1, 1)`, [e1.id]);
const depois = (await etapas(o1.id)).map((e) => e.name);
check('descer uma etapa troca-a com a seguinte', depois[0] === antes[1] && depois[1] === antes[0], { antes, depois });
await raises('as finanças não mudam etapas', () => as(fin, `select public.production_stage_move($1, -1)`, [e1.id]), /Sem permissão/);

// Custos.
await as(prod, `insert into public.production_costs (order_id, supplier_id, description, amount) values ($1, $2, 'Impressão de 500 exemplares', 750000), ($1, null, 'Transporte', 25000)`,
  [o1.id, grafica.id]);
const [custo] = await q(`select sum(amount)::numeric as t from public.production_costs where order_id = $1`, [o1.id]);
check('custos registados', Number(custo.t) === 775000, custo);

// Concluir: só com as etapas feitas, e uma só vez.
await raises('concluir com etapas por fazer diz quais', () => as(prod, `select public.production_complete($1)`, [o1.id]), /Faltam etapas por concluir: .*Impressão/);
await as(prod, `update public.production_stages set status = 'concluida' where order_id = $1 and position <= 4`, [o1.id]);
await as(prod, `update public.production_stages set status = 'nao_aplica' where order_id = $1 and position = 5`, [o1.id]);
await raises('as finanças não concluem', () => as(fin, `select public.production_complete($1, 480)`, [o1.id]), /Sem permissão/);
const stockAntes = await stockDe(livro.id);
const [fim] = await as(prod, `select public.production_complete($1, 480) as r`, [o1.id]);
check('concluir: a tiragem recebida entra no stock', await stockDe(livro.id) === stockAntes + 480 && fim.r.received === 480, { antes: stockAntes, r: fim.r });
const [mov] = await q(`select reason, reference, delta, actor from public.stock_movements where book_id = $1 order by id desc limit 1`, [livro.id]);
check('histórico do stock: "produção", com o código da ordem e quem concluiu', mov.reason === 'producao' && mov.reference === o1.code && mov.delta === 480 && mov.actor === prod, mov);
const [o1c] = await q(`select * from public.production_orders where id = $1`, [o1.id]);
check('ordem concluída, com a quantidade recebida e quem concluiu', o1c.status === 'concluida' && o1c.received_quantity === 480 && o1c.completed_by === prod, o1c);
await raises('concluir outra vez é recusado (o stock não entra duas vezes)', () => as(prod, `select public.production_complete($1)`, [o1.id]), /já foi concluída/);
check('… e o stock não mexeu', await stockDe(livro.id) === stockAntes + 480);
await raises('ordem concluída: as etapas não mudam', () => as(prod, `update public.production_stages set notes = 'x' where order_id = $1`, [o1.id]), /fechada/);
await raises('ordem concluída: os custos não mudam', () => as(prod, `insert into public.production_costs (order_id, description, amount) values ($1, 'Extra', 10)`, [o1.id]), /fechada/);
await raises('ordem concluída: o título não muda', () => as(prod, `update public.production_orders set title = 'Outro título' where id = $1`, [o1.id]), /só as notas/);
await as(prod, `update public.production_orders set notes = 'Recebidos 480 de 500 (20 com defeito).' where id = $1`, [o1.id]);
check('ordem concluída: as notas mudam', (await q(`select notes from public.production_orders where id = $1`, [o1.id]))[0].notes.startsWith('Recebidos'));
await raises('título novo sem produto: concluir pede para ligar ao catálogo', async () => {
  await q(`update public.production_stages set status = 'concluida' where order_id = $1`, [novo.id]);
  await as(prod, `select public.production_complete($1)`, [novo.id]);
}, /Ligue a ordem/);

// Cancelar e apagar.
await raises('cancelar pede o motivo', () => as(prod, `select public.production_cancel($1, '')`, [novo.id]), /porque se cancela/);
await as(prod, `select public.production_cancel($1, 'O autor desistiu.')`, [novo.id]);
check('ordem cancelada, com o motivo', (await q(`select status, cancel_reason from public.production_orders where id = $1`, [novo.id]))[0].status === 'cancelada');
await raises('uma ordem cancelada não se apaga', () => as(prod, `delete from public.production_orders where id = $1`, [novo.id]), /cancele|não se apaga/);
const [rascunho] = await as(prod, `insert into public.production_orders (title, quantity) values ('Rascunho', 50) returning id`);
await as(prod, `delete from public.production_orders where id = $1`, [rascunho.id]);
check('uma ordem planeada apaga-se (com as etapas)', (await q(`select count(*)::int as n from public.production_stages where order_id = $1`, [rascunho.id]))[0].n === 0);
await raises('um fornecedor com ordens não se apaga', () => as(prod, `delete from public.suppliers where id = $1`, [grafica.id]), /foreign key/);

// =============================================================================================
// C. Saídas: pagamentos a fornecedores
// =============================================================================================
await raises('a produção não regista pagamentos', () => as(prod, `insert into public.supplier_payments (supplier_id, amount) values ($1, 100)`, [grafica.id]), /row-level security/);
const [pg1] = await as(fin, `insert into public.supplier_payments (supplier_id, order_id, amount, method, reference) values ($1, $2, 500000, 'transferencia', 'TRF-889') returning *`,
  [grafica.id, o1.id]);
check('pagamento a fornecedor registado, por quem', pg1.status === 'pago' && pg1.created_by === fin, pg1);
check('a produção vê os pagamentos (sabe o que falta pagar)', (await as(prod, `select id from public.supplier_payments`)).length === 1);
await raises('um pagamento não se corrige', () => as(fin, `update public.supplier_payments set amount = 1 where id = $1`, [pg1.id]), /não se corrige/);
await raises('um pagamento não se apaga', () => as(fin, `delete from public.supplier_payments where id = $1`, [pg1.id]), /permission denied|não se apagam/);
await raises('data no futuro recusada', () => as(fin, `insert into public.supplier_payments (supplier_id, amount, paid_on) values ($1, 10, current_date + 5)`, [grafica.id]), /futuro/);
const [pgErr] = await as(fin, `insert into public.supplier_payments (supplier_id, amount) values ($1, 1234) returning id`, [grafica.id]);
await raises('anular pede o motivo', () => as(fin, `update public.supplier_payments set status = 'anulado' where id = $1`, [pgErr.id]), /porque se anula/);
await as(fin, `update public.supplier_payments set status = 'anulado', void_reason = 'Valor errado.' where id = $1`, [pgErr.id]);
const [anulado] = await q(`select status, voided_by, voided_at from public.supplier_payments where id = $1`, [pgErr.id]);
check('pagamento anulado, por quem e quando', anulado.status === 'anulado' && anulado.voided_by === fin && !!anulado.voided_at, anulado);
await raises('anular duas vezes é recusado', () => as(fin, `update public.supplier_payments set status = 'anulado', void_reason = 'outra vez' where id = $1`, [pgErr.id]), /já está anulado/);
const audit = await q(`select summary from public.security_audit_log where table_name = 'supplier_payments' order by at`);
check('o registo de segurança guarda o pagamento e a anulação', audit.length === 3 && audit.some((a) => /anulado/.test(a.summary)), audit);

// Mudar o IBAN de um fornecedor avisa os administradores.
await as(prod, `update public.suppliers set iban = 'AO06 9999 8888 7777 6666 5555 4' where id = $1`, [grafica.id]);
const alertas = await q(`select title from public.staff_notifications where kind = 'security' and staff_id = $1 and title like '%IBAN do fornecedor%'`, [admin]);
check('IBAN de fornecedor mudado: aviso de segurança aos administradores', alertas.length === 1, alertas);

// =============================================================================================
// D. Salários
// =============================================================================================
await as(fin, `insert into public.staff_pay_profiles (staff_id, base_salary, allowances, iban) values ($1, 150000, 20000, 'ao06 1111 2222')`, [f1.id]);
check('rh não vê salários', (await as(rh, `select staff_id from public.staff_pay_profiles`)).length === 0);
check('a produção não vê salários', (await as(prod, `select staff_id from public.staff_pay_profiles`)).length === 0);
await raises('rh não escreve salários', () => as(rh, `insert into public.staff_pay_profiles (staff_id, base_salary) values ($1, 1)`, [fAdmin.id ?? f1.id]), /row-level security/);
await as(fin, `update public.staff_pay_profiles set base_salary = 160000 where staff_id = $1`, [f1.id]);
const alertaSalario = await q(`select title from public.staff_notifications where kind = 'security' and staff_id = $1 and title like '%Salário%'`, [admin]);
check('salário mudado: aviso de segurança aos administradores', alertaSalario.length === 1, alertaSalario);

const mes = '2026-11-01';
const [g1] = await as(fin, `select public.payroll_generate($1::date) as n`, ['2026-11-17']);
check('gerar o mês: uma linha por quem tem salário', g1.n === 1, g1);
const [g2] = await as(fin, `select public.payroll_generate($1::date) as n`, [mes]);
check('gerar outra vez não repete', g2.n === 0, g2);
await raises('rh não gera salários', () => as(rh, `select public.payroll_generate($1::date)`, [mes]), /Sem permissão/);
const [linha] = await q(`select * from public.staff_payroll where staff_id = $1 and period = $2`, [f1.id, mes]);
check('linha do mês: base e subsídios do salário, líquido calculado', Number(linha.base_salary) === 160000 && Number(linha.allowances) === 20000 && Number(linha.net) === 180000, linha);
await as(fin, `update public.staff_payroll set deductions = 4800 where id = $1`, [linha.id]);
check('descontos tiram ao líquido', Number((await q(`select net from public.staff_payroll where id = $1`, [linha.id]))[0].net) === 175200);
await raises('descontos maiores do que o salário recusados', () => as(fin, `update public.staff_payroll set deductions = 999999 where id = $1`, [linha.id]), /check/);
await raises('pagar sem dizer como é recusado', () => as(fin, `update public.staff_payroll set status = 'pago' where id = $1`, [linha.id]), /como se pagou/);
await as(fin, `update public.staff_payroll set status = 'pago', method = 'transferencia', reference = 'SAL-11' where id = $1`, [linha.id]);
const [paga] = await q(`select * from public.staff_payroll where id = $1`, [linha.id]);
check('salário pago: data de hoje, quem decidiu', paga.status === 'pago' && !!paga.paid_on && paga.decided_by === fin, paga);
await raises('salário pago não muda', () => as(fin, `update public.staff_payroll set deductions = 0 where id = $1`, [linha.id]), /já está pago/);
await raises('salário pago não se apaga', () => as(fin, `delete from public.staff_payroll where id = $1`, [linha.id]), /não se apaga/);
// Uma linha anulada deixa gerar outra.
await as(fin, `insert into public.staff_pay_profiles (staff_id, base_salary) values ($1, 90000)`, [fAdmin.id ?? (await q(`select id from public.staff_members where code = $1`, [fAdmin.code]))[0].id]);
const [g3] = await as(fin, `select public.payroll_generate($1::date) as n`, [mes]);
check('outra pessoa com salário: entra no mês', g3.n === 1, g3);
const [l2] = await q(`select id from public.staff_payroll where period = $1 and status = 'por_pagar'`, [mes]);
await as(fin, `update public.staff_payroll set status = 'anulado', void_reason = 'Gerada por engano.' where id = $1`, [l2.id]);
const [g4] = await as(fin, `select public.payroll_generate($1::date) as n`, [mes]);
check('depois de anular, gerar faz uma linha nova', g4.n === 1, g4);
const auditSal = await q(`select summary from public.security_audit_log where table_name = 'staff_payroll' order by at`);
check('o registo de segurança guarda o salário pago e o anulado', auditSal.some((a) => /Salário pago/.test(a.summary)) && auditSal.some((a) => /Salário anulado/.test(a.summary)), auditSal);

// =============================================================================================
// E. Entradas e saídas
// =============================================================================================
await q(`insert into public.payment_methods (name, code, type, enabled) values ('Transferência', 'transferencia', 'transfer', true)`);
const order = { order_number: 'ENC-CX1', customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente', customer_id: cliente, phone: '923000000',
  payment_method_code: 'transferencia', payment_method_name: 'Transferência', delivery_status: 'received', status: 'pending', shipping_method: 'pickup' };
const [enc] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
  [JSON.stringify(order), JSON.stringify([{ book_id: livro.id, quantity: 2 }]), JSON.stringify({ method: 'pickup', free_threshold: 0, cost: 0, express_cost: 0 })]);
const caixa = await user('caixa@loja.ao', 'manager', { manage_orders: true, confirm_payments: true });
await svc(`select public.order_payment_record($1, 12000, 'transferencia', 'TRF-55501', now())`, [enc.o.id], caixa);

const hoje = (await q(`select (now() at time zone 'Africa/Luanda')::date::text as d`))[0].d;
const [cx] = await as(fin, `select public.cash_flow_report($1::date, $2::date) as r`, [hoje, hoje]);
const r = cx.r;
check('entradas: o pagamento confirmado do cliente', Number(r.entradas.clientes) === 12000 && Number(r.entradas.liquido) === 12000, r.entradas);
check('saídas: o fornecedor (sem o anulado) e o salário pago', Number(r.saidas.fornecedores) === 500000 && Number(r.saidas.salarios) === 175200 && Number(r.saidas.total) === 675200, r.saidas);
check('saldo = entradas − saídas', Number(r.saldo) === 12000 - 675200, r.saldo);
check('por pagar aos fornecedores: custos − pagamentos', Number(r.por_pagar.fornecedores) === 750000 - 500000, r.por_pagar);
check('salários por pagar: as linhas por pagar', Number(r.por_pagar.salarios) === 90000 && r.por_pagar.salarios_count === 1, r.por_pagar);
check('por fornecedor: o que se pagou a cada um', r.por_fornecedor.length === 1 && Number(r.por_fornecedor[0].paid) === 500000, r.por_fornecedor);
await raises('a produção não vê as entradas e saídas', () => as(prod, `select public.cash_flow_report($1::date, $2::date)`, [hoje, hoje]), /Sem acesso/);
await raises('quem gere encomendas também não', () => as(vendas, `select public.cash_flow_report($1::date, $2::date)`, [hoje, hoje]), /Sem acesso/);

// =============================================================================================
// F. Tempo real
// =============================================================================================
// O PGlite não tem o serviço de tempo real: um realtime.send mínimo, com a assinatura do Supabase,
// guarda os sinais para os ver (private.realtime_signal chama-o pelo nome, na hora).
await db.exec(`
  create schema if not exists realtime;
  create table if not exists realtime.messages (
    topic text not null, event text not null, payload jsonb, private boolean,
    inserted_at timestamptz not null default clock_timestamp());
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
  returns void language sql
  as $$ insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$;
`);
const sinais = async (fn) => {
  await q('delete from realtime.messages');
  await fn();
  return q(`select topic, event, private from realtime.messages order by inserted_at`);
};
const conta = (m, event) => m.filter((x) => x.topic === 'painel' && x.event === event && x.private === true).length;
let m = await sinais(() => as(rh, `insert into public.staff_members (full_name) values ('Novo Funcionário')`));
check('ficha nova: um sinal «funcionarios» no painel (privado)', conta(m, 'funcionarios') === 1, m);
m = await sinais(() => as(rh, `update public.staff_members set notes = 'actualizada' where status = 'activo'`));
check('várias fichas mudadas de uma vez: um sinal só', conta(m, 'funcionarios') === 1, m);
m = await sinais(() => as(prod, `insert into public.production_orders (title, quantity) values ('Sinal', 10)`));
check('ordem nova com as etapas: sinais «producao», um por instrução (não um por etapa)', conta(m, 'producao') >= 1 && conta(m, 'producao') <= 2, m);
check('… e nada de «financas»', conta(m, 'financas') === 0, m);
m = await sinais(() => as(fin, `insert into public.supplier_payments (supplier_id, amount) values ($1, 1000)`, [grafica.id]));
check('pagamento a fornecedor: «financas» e «producao» (as contas dos fornecedores)', conta(m, 'financas') === 1 && conta(m, 'producao') === 1, m);
m = await sinais(() => as(fin, `update public.staff_pay_profiles set notes = 'revisto'`));
check('dados de pagamento dos funcionários: «financas»', conta(m, 'financas') === 1, m);
m = await sinais(() => svc(`select public.order_payment_record($1, 100, 'transferencia', 'TRF-55502', now())`, [enc.o.id], caixa));
check('pagamento de cliente: «financas» (as entradas) e «orders» de sempre', conta(m, 'financas') >= 1 && conta(m, 'orders') >= 1, m);

// Catálogo (migração sinais_afinados): as visitas não são mudanças do catálogo.
m = await sinais(() => svc(`select public.increment_book_views($1)`, [livro.id]));
check('uma visita a um livro (views_count) não dá sinal «catalogo»', conta(m, 'catalogo') === 0, m);
m = await sinais(() => q(`update public.stock_books set price = price + 1 where id = $1`, [livro.id]));
check('mudar o preço dá «catalogo»', conta(m, 'catalogo') === 1, m);
m = await sinais(() => q(`update public.stock_books set price = price where id = $1`, [livro.id]));
check('gravar sem mudar nada não dá sinal', conta(m, 'catalogo') === 0, m);
m = await sinais(() => q(`insert into public.stock_books (title, price, stock) values ('Livro do sinal', 100, 1)`));
check('produto novo dá «catalogo»', conta(m, 'catalogo') === 1, m);
m = await sinais(() => q(`delete from public.stock_books where title = 'Livro do sinal'`));
check('apagar um produto dá «catalogo»', conta(m, 'catalogo') === 1, m);

// Quem ouve o painel é a equipa (private.is_staff): os gestores só com as permissões novas também.
const daEquipa = (sub) => as(sub, `select private.is_staff() as v`).then((x) => x[0].v);
check('produção, finanças e recursos humanos ouvem o painel', (await daEquipa(prod)) && (await daEquipa(fin)) && (await daEquipa(rh)));
check('o cliente não ouve o painel', !(await daEquipa(cliente)));

// =============================================================================================
// G. As chaves das permissões (private.permission_keys)
// =============================================================================================
{
  const keys = (await q(`select private.permission_keys() as k`))[0].k;
  check('a base de dados conhece as três chaves novas e as de antes',
    ['manage_production', 'manage_staff', 'manage_finance', 'view_reports', 'manage_orders'].every((k) => keys.includes(k)), keys);
  const novo = await user('novo.gestor@loja.ao');
  await as(admin, `select public.users_admin_update($1, null, null, 'manager', '{"manage_production":true,"manage_finance":true,"inventada":true}'::jsonb)`, [novo]);
  const [p] = await q(`select permissions from public.profiles where id = $1`, [novo]);
  check('users_admin_update guarda as chaves novas (e deita fora as inventadas)',
    p.permissions.manage_production === true && p.permissions.manage_finance === true && p.permissions.manage_staff === false && !('inventada' in p.permissions), p.permissions);
}

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
