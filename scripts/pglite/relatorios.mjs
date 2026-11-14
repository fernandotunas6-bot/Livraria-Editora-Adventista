// Cenários dos relatórios de vendas de todas as livrarias (migração 20261114100000): a permissão
// «Editar relatórios de vendas», quem lê, grava e apaga, o histórico no servidor, os documentos do
// relatório conjunto e as vendas do sistema por loja (vendas_do_sistema), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/relatorios.mjs supabase/migrations
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
const as = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '']);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};

const admin = await user('admin@loja.ao', 'admin');
const contab = await user('contabilidade@loja.ao', 'manager', { view_reports: true, edit_reports: true });
const leitor = await user('leitor@loja.ao', 'manager', { view_reports: true });
const soEdita = await user('so.edita@loja.ao', 'manager', { edit_reports: true });
const atendente = await user('atendente@loja.ao', 'manager', { manage_orders: true });

// A loja do Huambo (criada pela migração painel_vendas_por_loja, com 2025, 2026 e 2027) e outra.
const [hu] = await q(`select loja_id as id from public.vendas_anos group by loja_id limit 1`);
const [lu] = await q(`insert into public.physical_stores (name, province, address, active, pickup_enabled)
                      values ('Livraria do Lubango', 'Huíla', 'Lubango', true, false) returning id`);
const anos = await q(`select ano from public.vendas_anos where loja_id = $1 order by ano`, [hu.id]);
check('os dados do Huambo continuam lá', anos.map((a) => a.ano).join() === '2025,2026,2027', anos);

// --- 1. A permissão --------------------------------------------------------------------------
{
  const keys = (await q(`select private.permission_keys() as k`))[0].k;
  check('a base de dados conhece edit_reports', keys.includes('edit_reports') && keys.length === 14, keys);
  await as(admin, `select public.users_admin_update($1, null, null, 'manager', '{"view_reports":true,"edit_reports":true,"inventada":true}'::jsonb)`, [leitor]);
  const [p] = await q(`select permissions from public.profiles where id = $1`, [leitor]);
  check('users_admin_update guarda edit_reports', p.permissions.edit_reports === true && !('inventada' in p.permissions), p.permissions);
  await as(admin, `select public.users_admin_update($1, null, null, 'manager', '{"view_reports":true}'::jsonb)`, [leitor]);
  const can = async (id) => (await as(id, `select private.can_edit_reports() as c`))[0].c;
  check('o administrador edita', await can(admin));
  check('a contabilidade (ver + editar) edita', await can(contab));
  check('quem só vê não edita', !(await can(leitor)));
  check('«Editar relatórios de vendas» sozinha edita (é a da pessoa que lança os números)', await can(soEdita));
  check('o atendimento não edita', !(await can(atendente)));
}

// --- 2. Quem lê e quem grava -----------------------------------------------------------------
const meses = (vals) => JSON.stringify([...vals, ...Array(12 - vals.length).fill(null)]);
{
  const r = await as(leitor, `select count(*)::int as n from public.vendas_anos`);
  check('quem vê relatórios lê as vendas', r[0].n === 3, r);
  const a = await as(atendente, `select count(*)::int as n from public.vendas_anos`);
  check('o atendimento não lê as vendas', a[0].n === 0, a);
  const e = await as(soEdita, `select count(*)::int as n from public.vendas_anos`);
  check('quem edita os relatórios lê as vendas', e[0].n === 3, e);

  await as(contab, `insert into public.vendas_anos (loja_id, ano, meses, origem) values ($1, 2026, $2::jsonb, 'sistema')`, [lu.id, meses([420000, 390000])]);
  const [row] = await q(`select * from public.vendas_anos where loja_id = $1 and ano = 2026`, [lu.id]);
  check('a contabilidade cria o ano de outra loja', !!row && row.origem === 'sistema');
  check('o servidor regista quem gravou', row.actualizado_por === contab, row.actualizado_por);

  await raises('quem só vê não cria', () => as(leitor, `insert into public.vendas_anos (loja_id, ano, meses) values ($1, 2025, $2::jsonb)`, [lu.id, meses([1])]), /row-level security/);
  await as(soEdita, `insert into public.vendas_anos (loja_id, ano, meses) values ($1, 2025, $2::jsonb)`, [lu.id, meses([300000])]);
  check('quem edita cria o ano anterior de outra loja', (await q(`select 1 from public.vendas_anos where loja_id = $1 and ano = 2025`, [lu.id])).length === 1);

  const upd = await as(leitor, `update public.vendas_anos set meses = $2::jsonb where loja_id = $1 and ano = 2026 returning ano`, [lu.id, meses([1, 2])]);
  check('quem só vê não altera (0 linhas)', upd.length === 0, upd);

  // O navegador manda uma hora qualquer; fica a do servidor.
  await as(contab, `update public.vendas_anos set meses = $2::jsonb, actualizado = '2001-01-01', origem = 'misto' where loja_id = $1 and ano = 2026`, [lu.id, meses([420000, 395000, 560000.25])]);
  const [row2] = await q(`select actualizado, origem from public.vendas_anos where loja_id = $1 and ano = 2026`, [lu.id]);
  check('a hora da gravação é a do servidor', new Date(row2.actualizado).getFullYear() > 2020, row2.actualizado);

  const del = await as(contab, `delete from public.vendas_anos where loja_id = $1 and ano = 2026 returning ano`, [lu.id]);
  check('a contabilidade não apaga um ano inteiro', del.length === 0, del);

  await raises('um mês negativo é recusado', () => as(contab, `update public.vendas_anos set meses = $2::jsonb where loja_id = $1 and ano = 2026`, [lu.id, meses([-5])]), /vendas_anos_meses_validos/);
  await raises('um mês em texto é recusado', () => as(contab, `update public.vendas_anos set meses = '["1000",null,null,null,null,null,null,null,null,null,null,null]'::jsonb where loja_id = $1 and ano = 2026`, [lu.id]), /vendas_anos_meses_validos/);
}

// --- 3. O histórico no servidor --------------------------------------------------------------
{
  const h = await q(`select * from public.vendas_alteracoes where loja_id = $1 and ano = 2026 order by id`, [lu.id]);
  check('duas gravações no histórico (criar e alterar)', h.length === 2, h.map((x) => x.accao));
  check('a criação diz os meses que passaram a ter valor e a origem',
    h[0].accao === 'insert' && h[0].meses.length === 2 && h[0].meses[0].para === 420000 && h[0].origem === 'sistema' && h[0].por === contab, h[0]);
  check('a criação não lista como mudança os campos que nasceram vazios', Object.keys(h[0].outros).length === 0, h[0].outros);
  check('a alteração diz só os meses que mudaram, de → para',
    h[1].accao === 'update' && h[1].meses.length === 2 && h[1].meses[0].mes === 2 && h[1].meses[0].de === 390000 && h[1].meses[0].para === 395000
      && h[1].meses[1].mes === 3 && h[1].meses[1].de === null && h[1].origem === 'misto', h[1]);

  await as(contab, `update public.vendas_anos set meses = $2::jsonb where loja_id = $1 and ano = 2026`, [lu.id, '[420000.00, 395000, 560000.25, null, null, null, null, null, null, null, null, null]']);
  const n = (await q(`select count(*)::int as n from public.vendas_alteracoes where loja_id = $1 and ano = 2026`, [lu.id]))[0].n;
  check('gravar os mesmos valores (420000 = 420000.00) não acrescenta histórico', n === 2, n);

  await as(contab, `update public.vendas_anos set meta_anual = 7000000, mes_em_curso = 4 where loja_id = $1 and ano = 2026`, [lu.id]);
  const [m] = await q(`select outros from public.vendas_alteracoes where loja_id = $1 and ano = 2026 order by id desc limit 1`, [lu.id]);
  check('a meta e o mês em curso também ficam no histórico', m.outros.meta_anual && m.outros.mes_em_curso && m.outros.mes_em_curso.para === 4, m.outros);

  const lidos = await as(leitor, `select count(*)::int as n from public.vendas_alteracoes`);
  check('quem vê relatórios lê o histórico', lidos[0].n >= 3, lidos);
  const nada = await as(atendente, `select count(*)::int as n from public.vendas_alteracoes`);
  check('o atendimento não lê o histórico', nada[0].n === 0, nada);
  await raises('ninguém escreve no histórico pela API', () => as(admin, `insert into public.vendas_alteracoes (loja_id, ano, accao) values ($1, 2026, 'update')`, [lu.id]), /permission denied/);
  await raises('ninguém apaga o histórico pela API', () => as(admin, `delete from public.vendas_alteracoes`), /permission denied/);

  await as(admin, `delete from public.vendas_anos where loja_id = $1 and ano = 2026`, [lu.id]);
  const [d] = await q(`select accao, meses from public.vendas_alteracoes where loja_id = $1 and ano = 2026 order by id desc limit 1`, [lu.id]);
  check('o administrador apaga e fica registado', d.accao === 'delete' && d.meses.length === 3, d);
}

// --- 4. Documentos do relatório conjunto -----------------------------------------------------
{
  await as(contab, `insert into public.painel_vendas_docs (path, data) values ('consolidado/notas/ano-2026', '{"texto":"Lubango abriu em Março."}'::jsonb)`);
  const [doc] = await as(leitor, `select data from public.painel_vendas_docs where path = 'consolidado/notas/ano-2026'`);
  check('a nota do relatório conjunto grava-se e lê-se', doc && doc.data.texto === 'Lubango abriu em Março.', doc);
  await raises('um caminho inventado é recusado', () => as(contab, `insert into public.painel_vendas_docs (path, data) values ('consolidado/segredos', '{}'::jsonb)`), /painel_vendas_docs_path_check/);
  await as(contab, `insert into public.painel_vendas_docs (path, data) values ($1, '{"entradas":[]}'::jsonb)`, [`${lu.id}/historico/registo`]);
  check('o histórico do painel de cada loja continua a gravar-se', (await q(`select 1 from public.painel_vendas_docs where path = $1`, [`${lu.id}/historico/registo`])).length === 1);
  await raises('quem só vê não grava documentos', () => as(leitor, `insert into public.painel_vendas_docs (path, data) values ('consolidado/notas/ano-2027', '{}'::jsonb)`), /row-level security/);
}

// --- 5. As vendas do sistema por loja e por mês ----------------------------------------------
{
  // Mais uma loja na Huíla (inactiva, depois do Lubango) e as encomendas de 2026.
  await q(`insert into public.physical_stores (name, province, address, active, pickup_enabled, sort_order)
           values ('Quiosque da Matala', 'Huila', 'Matala', false, false, 99)`);
  const [huNome] = await q(`select name from public.physical_stores where id = $1`, [hu.id]);
  let n = 0;
  const enc = async ({ total, portes = 0, pago = total, reembolso = 0, pagoEm, criada = pagoEm, metodo = 'standard', loja = '', prov = '', estado = 'confirmed', entrega = 'confirmed' }) => {
    n++;
    const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, items, total, shipping_cost, status, shipping_method, pickup_store, delivery_province)
      values ($1, 'cliente@exemplo.ao', 'Cliente Secreto', '[]'::jsonb, $2, $3, 'pending', $4, $5, $6) returning id`, [`REL-${n}`, total, portes, metodo, loja, prov]);
    // amount_paid e paid_at são calculados pelos pagamentos; aqui põem-se directamente.
    await db.exec('set session_replication_role = replica');
    await q(`update public.orders set amount_paid = $2, amount_refunded = $3, paid_at = $4, created = $5, status = $6, delivery_status = $7 where id = $1`,
      [o.id, pago, reembolso, pagoEm, criada, estado, entrega]);
    await db.exec('set session_replication_role = origin');
  };
  // Huambo: levantamento na loja (sem acentos nem maiúsculas iguais ao nome) e entrega na província.
  await enc({ total: 10000, pagoEm: '2026-03-10T10:00:00Z', metodo: 'pickup', loja: huNome.name.toUpperCase() });
  await enc({ total: 5500, portes: 500, pagoEm: '2026-03-20T10:00:00Z', prov: 'Huambo' });
  // Paga às 23:30 UTC de 31 de Março = 00:30 de 1 de Abril em Luanda: conta em Abril.
  await enc({ total: 2000, pagoEm: '2026-03-31T23:30:00Z', prov: 'huambo' });
  // Reembolsada em parte: conta o que ficou. Cancelada: não conta. Por pagar: não conta.
  await enc({ total: 8000, reembolso: 3000, pagoEm: '2026-05-05T10:00:00Z', prov: 'Huambo' });
  await enc({ total: 9000, pagoEm: '2026-05-06T10:00:00Z', prov: 'Huambo', estado: 'cancelled' });
  await enc({ total: 7000, pago: 0, pagoEm: null, criada: '2026-05-07T10:00:00Z', prov: 'Huambo' });
  // Huíla tem duas lojas: a entrega conta só para a primeira activa (Lubango), nunca para as duas.
  await enc({ total: 4000, pagoEm: '2026-03-15T10:00:00Z', prov: 'Huíla' });
  // Luanda não tem loja: vem à parte, sem loja.
  await enc({ total: 3000, pagoEm: '2026-03-16T10:00:00Z', prov: 'Luanda' });
  // De outro ano: não entra.
  await enc({ total: 99999, pagoEm: '2025-12-31T12:00:00Z', prov: 'Huambo' });

  const linhas = await as(contab, `select * from public.vendas_do_sistema(2026)`);
  const de = (loja, mes) => linhas.find((l) => l.loja_id === loja && l.mes === mes);
  check('Março no Huambo: levantamento + entrega sem portes', Number(de(hu.id, 3)?.valor) === 15000 && de(hu.id, 3)?.encomendas === 2, linhas);
  check('o pagamento das 00:30 de Luanda conta no mês de Luanda', Number(de(hu.id, 4)?.valor) === 2000, linhas);
  check('o reembolso desconta; a cancelada e a por pagar não contam', Number(de(hu.id, 5)?.valor) === 5000 && de(hu.id, 5)?.encomendas === 1, linhas);
  check('a entrega na Huíla conta só para uma loja', Number(de(lu.id, 3)?.valor) === 4000 && linhas.filter((l) => l.mes === 3 && Number(l.valor) === 4000).length === 1, linhas);
  check('a província sem loja vem à parte', Number(de(null, 3)?.valor) === 3000, linhas);
  check('outro ano não entra', !linhas.some((l) => Number(l.valor) >= 99999), linhas);
  check('só totais, sem dados dos clientes', Object.keys(linhas[0]).sort().join() === 'encomendas,loja_id,mes,valor', Object.keys(linhas[0]));

  const todas = await as(contab, `select * from public.vendas_do_sistema(2026, false)`);
  const maio = todas.find((l) => l.loja_id === hu.id && l.mes === 5);
  check('«todas, excepto canceladas» conta pela data da encomenda, pagas ou não', Number(maio?.valor) === 15000 && maio?.encomendas === 2, todas);

  check('quem só edita os relatórios também as lê', (await as(soEdita, `select count(*)::int as n from public.vendas_do_sistema(2026)`))[0].n > 0);
  await raises('o atendimento não as lê', () => as(atendente, `select * from public.vendas_do_sistema(2026)`), /Sem permissão/);
  await raises('um cliente não as lê', async () => { const c = await user('cliente2@exemplo.ao'); await as(c, `select * from public.vendas_do_sistema(2026)`); }, /Sem permissão/);
  await raises('um ano absurdo é recusado', () => as(contab, `select * from public.vendas_do_sistema(1900)`), /Ano inválido/);
}

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
