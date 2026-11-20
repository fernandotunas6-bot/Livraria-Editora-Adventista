// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários dos relatórios de vendas de todas as livrarias (migrações 20261114120000 e 20261114140000):
// a permissão «Editar relatórios de vendas», quem lê, grava e apaga, o histórico no servidor, os
// documentos do relatório conjunto, as vendas do sistema por loja (vendas_do_sistema), os mais
// vendidos por produto, os lançados à mão e a biblioteca de imagens dos vídeos, com as migrações reais:
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
  check('a base de dados conhece edit_reports', keys.includes('edit_reports') && keys.includes('manage_store_stock') && keys.length === 16, keys); // + stock da loja (lojas_donas_dos_dados) e painel da sua loja (painel_gestao), que vêm depois
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

// --- 6. Os mais vendidos por produto, os lançados à mão e a biblioteca de imagens -----------
{
  const catalogo = await user('catalogo@loja.ao', 'manager', { manage_catalog: true });
  const [livro] = await q(`insert into public.stock_books (title, book_code, price, stock, cover, active)
                           values ('O Desejado de Todas as Nações', 'TESTE-VID-1', 8500, 10, 'https://exemplo.supabase.co/storage/v1/object/public/media/stock_books/x/capa.jpg', false) returning id`);
  const [biblia] = await q(`insert into public.stock_books (title, book_code, price, stock, active) values ('Bíblia de Estudo', 'TESTE-VID-2', 25000, 5, true) returning id`);
  const [huNome] = await q(`select name from public.physical_stores where id = $1`, [hu.id]);
  let n = 100;
  const venda = async ({ itens, pagoEm, loja = huNome.name, prov = '', total }) => {
    n++;
    const t = total ?? itens.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, items, total, shipping_cost, status, shipping_method, pickup_store, delivery_province)
      values ($1, 'cliente@exemplo.ao', 'Cliente Secreto', $2::jsonb, $3, 0, 'pending', $4, $5, $6) returning id`,
      [`PROD-${n}`, JSON.stringify(itens), t, loja ? 'pickup' : 'standard', loja, prov]);
    await db.exec('set session_replication_role = replica');
    await q(`update public.orders set amount_paid = $2, amount_refunded = 0, paid_at = $3, status = 'confirmed', delivery_status = 'confirmed' where id = $1`, [o.id, t, pagoEm]);
    await db.exec('set session_replication_role = origin');
  };
  await venda({ pagoEm: '2027-02-10T10:00:00Z', itens: [{ book_id: livro.id, title: 'O Desejado', quantity: 3, price: 8500 }, { book_id: biblia.id, title: 'Bíblia de Estudo', quantity: 1, price: 25000 }] });
  await venda({ pagoEm: '2027-02-12T10:00:00Z', itens: [{ book_id: livro.id, title: 'O Desejado', quantity: 2, price: 8500 }] });
  await venda({ pagoEm: '2027-03-01T10:00:00Z', itens: [{ title: 'Revista da Escola Sabatina', quantity: 4, price: 1500 }] });
  await venda({ pagoEm: '2027-03-02T10:00:00Z', itens: [{ title: 'revista da escola sabatina', quantity: '2', price: '1500' }, 'lixo'] });
  // Uma encomenda com itens estragados não rebenta a soma.
  await venda({ pagoEm: '2027-03-03T10:00:00Z', itens: [{ title: 'Caneta', quantity: 'muitas', price: 'x' }], total: 100 });

  const pv = await as(contab, `select * from public.produtos_mais_vendidos(2027)`);
  const de = (titulo, mes) => pv.find((r) => r.titulo === titulo && r.mes === mes);
  const fev = de('O Desejado de Todas as Nações', 2);
  check('o mais vendido de Fevereiro: unidades, valor e encomendas', fev && Number(fev.unidades) === 5 && Number(fev.valor) === 42500 && fev.encomendas === 2 && fev.loja_id === hu.id, pv);
  check('o título vem do catálogo e a capa também, mesmo do produto oculto', fev && fev.capa.includes('capa.jpg') && fev.codigo === 'TESTE-VID-1', fev);
  const rev = pv.filter((r) => r.mes === 3 && /revista/i.test(r.titulo));
  check('sem book_id, junta pelo título (sem maiúsculas)', rev.length === 1 && Number(rev[0].unidades) === 6 && Number(rev[0].valor) === 9000, rev);
  check('um item estragado conta como 1 unidade sem valor', Number(de('Caneta', 3)?.unidades) === 1 && Number(de('Caneta', 3)?.valor) === 0, pv);
  check('os totais por produto batem com as encomendas de vendas_do_sistema',
    (await as(contab, `select sum(encomendas)::int as n from public.vendas_do_sistema(2027)`))[0].n === 5);
  check('só totais, sem dados dos clientes', !Object.keys(pv[0]).some((k) => /email|nome|cliente|phone|customer/.test(k)), Object.keys(pv[0]));
  await raises('o atendimento não vê os mais vendidos', () => as(atendente, `select * from public.produtos_mais_vendidos(2027)`), /Sem permissão/);
  check('quem só edita os relatórios vê os mais vendidos', (await as(soEdita, `select count(*)::int as n from public.produtos_mais_vendidos(2027)`))[0].n > 0);

  const capas = await as(leitor, `select * from public.capas_dos_produtos($1::text[])`, [[livro.id, biblia.id, 'naoexiste']]);
  check('as capas chegam a quem vê os relatórios, também do produto oculto', capas.length === 2 && capas.some((c) => c.id === livro.id && c.capa.includes('capa.jpg')), capas);
  check('quem gere o catálogo também lê as capas', (await as(catalogo, `select count(*)::int as n from public.capas_dos_produtos($1::text[])`, [[livro.id]]))[0].n === 1);
  await raises('o atendimento não lê as capas por aqui', () => as(atendente, `select * from public.capas_dos_produtos($1::text[])`, [[livro.id]]), /Sem permissão/);

  // Mais vendidos à mão.
  await as(contab, `insert into public.vendas_produtos (loja_id, ano, mes, book_id, titulo, unidades, valor) values ($1, 2027, 2, $2, '  O   Desejado  ', 40, 340000)`, [hu.id, livro.id]);
  const [vp] = await q(`select * from public.vendas_produtos where loja_id = $1`, [hu.id]);
  check('o lançamento à mão grava-se, com o título arrumado e quem o fez', vp && vp.titulo === 'O Desejado' && vp.actualizado_por === contab, vp);
  check('quem só vê lê os lançamentos', (await as(leitor, `select count(*)::int as n from public.vendas_produtos`))[0].n === 1);
  await raises('quem só vê não lança', () => as(leitor, `insert into public.vendas_produtos (loja_id, ano, titulo, unidades) values ($1, 2027, 'X', 1)`, [hu.id]), /row-level security/);
  await raises('o mês 13 é recusado', () => as(contab, `insert into public.vendas_produtos (loja_id, ano, mes, titulo, unidades) values ($1, 2027, 13, 'X', 1)`, [hu.id]), /vendas_produtos_mes_check/);
  await raises('unidades negativas são recusadas', () => as(contab, `insert into public.vendas_produtos (loja_id, ano, titulo, unidades) values ($1, 2027, 'X', -1)`, [hu.id]), /vendas_produtos_unidades_check/);
  await raises('título vazio é recusado', () => as(contab, `insert into public.vendas_produtos (loja_id, ano, titulo, unidades) values ($1, 2027, '   ', 1)`, [hu.id]), /vendas_produtos_titulo_check/);
  check('o atendimento não lê os lançamentos', (await as(atendente, `select count(*)::int as n from public.vendas_produtos`))[0].n === 0);
  const apagado = await as(contab, `delete from public.vendas_produtos where id = $1 returning id`, [vp.id]);
  check('quem edita apaga um lançamento', apagado.length === 1);

  // A biblioteca de imagens.
  const url = 'https://exemplo.supabase.co/storage/v1/object/public/media/biblioteca/uploads/serra.jpg';
  await as(catalogo, `insert into public.biblioteca_imagens (url, caminho, titulo, tema, creditos) values ($1, 'biblioteca/uploads/serra.jpg', ' Serra da Leba ', 'natureza', 'Foto da equipa')`, [url]);
  const [img] = await q(`select * from public.biblioteca_imagens where url like 'https://%'`);
  check('quem gere o catálogo junta imagens à biblioteca', img && img.titulo === 'Serra da Leba' && img.criado_por === catalogo, img);
  check('quem vê os relatórios lê a biblioteca', (await as(leitor, `select count(*)::int as n from public.biblioteca_imagens`))[0].n >= 1);
  check('o atendimento não lê a biblioteca', (await as(atendente, `select count(*)::int as n from public.biblioteca_imagens`))[0].n === 0);
  await raises('quem só vê não junta imagens', () => as(leitor, `insert into public.biblioteca_imagens (url) values ($1)`, [url]), /row-level security/);
  await raises('um endereço que não é https é recusado', () => as(contab, `insert into public.biblioteca_imagens (url) values ('javascript:alert(1)')`), /biblioteca_imagens_url_check/);
  await as(contab, `insert into public.biblioteca_imagens (url, tema, titulo) values ('/images/site/opcoes/slide-familia-leque.webp', 'livros', 'Família · leque')`);
  check('uma imagem do próprio site junta-se pelo caminho', (await q(`select 1 from public.biblioteca_imagens where url like '/images/%'`)).length === 1);
  await raises('um caminho do site fora de /images é recusado', () => as(contab, `insert into public.biblioteca_imagens (url) values ('/admin?x=1')`), /biblioteca_imagens_url_check/);
  await raises('um tema inventado é recusado', () => as(contab, `insert into public.biblioteca_imagens (url, tema) values ($1, 'praia')`, [url]), /biblioteca_imagens_tema_check/);
  await raises('um caminho fora da pasta biblioteca é recusado', () => as(contab, `insert into public.biblioteca_imagens (url, caminho) values ($1, 'stock_books/x.jpg')`, [url]), /biblioteca_imagens_caminho_check/);
  await as(contab, `update public.biblioteca_imagens set activa = false, criado_por = $2 where id = $1`, [img.id, contab]);
  const [img2] = await q(`select activa, criado_por from public.biblioteca_imagens where id = $1`, [img.id]);
  check('quem edita os relatórios desactiva; quem criou não se muda', img2.activa === false && img2.criado_por === catalogo, img2);

  // O Storage: a pasta biblioteca/ é de quem gere as imagens dos vídeos.
  const pode = async (id, nome) => (await as(id, `select private.can_write_media($1) as p`, [nome]))[0].p;
  check('quem edita os relatórios envia para biblioteca/', await pode(contab, 'biblioteca/uploads/a.jpg'));
  check('quem gere o catálogo envia para biblioteca/', await pode(catalogo, 'biblioteca/uploads/a.jpg'));
  check('quem só vê não envia para biblioteca/', !(await pode(leitor, 'biblioteca/uploads/a.jpg')));
  check('as outras pastas continuam como estavam', (await pode(catalogo, 'stock_books/x/a.jpg')) && !(await pode(contab, 'stock_books/x/a.jpg')) && !(await pode(catalogo, 'site_settings/a.jpg')));
}

// --- Gravação protegida (vendas_anos_gravar, migração relatorios_gravacao_protegida) -------------
// Uma gravação leva o `actualizado` que o ecrã leu ao abrir; se alguém gravou entretanto, é recusada.
{
  const ler = async (loja, ano) => (await q(`select meses, mes_em_curso, fonte, origem, actualizado::text as a from public.vendas_anos where loja_id = $1 and ano = $2`, [loja, ano]))[0];
  const gravar = (id, ano, linhas) => as(id, `select loja_id, actualizado::text as a from public.vendas_anos_gravar($1, $2::jsonb)`, [ano, JSON.stringify(linhas)]);

  const criado = await gravar(contab, 2031, [{ loja_id: lu.id, esperado: null, meses: JSON.parse(meses([100000, 200000])), mes_em_curso: 2, fonte: 'Excel da loja', origem: 'importacao' }]);
  const r0 = await ler(lu.id, 2031);
  check('a gravação cria um ano novo e devolve o actualizado', criado.length === 1 && r0 && r0.origem === 'importacao' && r0.mes_em_curso === 2 && criado[0].a === r0.a, { criado, r0 });

  // Duas pessoas abrem o mesmo ano; a primeira grava, a segunda (com o que leu antes) é recusada.
  const lido = r0.a;
  await gravar(contab, 2031, [{ loja_id: lu.id, esperado: lido, meses: JSON.parse(meses([100000, 250000, 300000])) }]);
  const r1 = await ler(lu.id, 2031);
  check('quem grava com o ano actual grava, e só os campos que mandou', r1.meses[2] === 300000 && r1.mes_em_curso === 2 && r1.fonte === 'Excel da loja' && r1.a !== lido, r1);
  await raises('a segunda pessoa, com o que leu antes, é recusada', () => gravar(soEdita, 2031, [{ loja_id: lu.id, esperado: lido, meses: JSON.parse(meses([1, 2])) }]), /mudaram depois de os abrir/);
  const r2 = await ler(lu.id, 2031);
  check('e os números da primeira ficam', r2.meses[2] === 300000 && r2.meses[0] === 100000 && r2.a === r1.a, r2);
  await raises('criar um ano que alguém criou entretanto é recusado', () => gravar(soEdita, 2031, [{ loja_id: lu.id, esperado: null, meses: JSON.parse(meses([1])) }]), /criou/);

  // Várias lojas no mesmo pedido: ou gravam todas ou nenhuma.
  const h0 = await gravar(contab, 2031, [{ loja_id: hu.id, esperado: null, meses: JSON.parse(meses([5])) }]);
  await raises('uma loja desactualizada no pedido recusa o pedido inteiro', () => gravar(contab, 2031, [
    { loja_id: hu.id, esperado: h0[0].a, meses: JSON.parse(meses([6])) },
    { loja_id: lu.id, esperado: lido, meses: JSON.parse(meses([7])) },
  ]), /mudaram depois de os abrir/);
  check('…e a loja que estava certa não mudou', (await ler(hu.id, 2031)).meses[0] === 5);
  const juntos = await gravar(contab, 2031, [
    { loja_id: hu.id, esperado: h0[0].a, meses: JSON.parse(meses([6])), mes_em_curso: null },
    { loja_id: lu.id, esperado: r2.a, meses: JSON.parse(meses([7])), mes_em_curso: null, origem: 'sistema' },
  ]);
  const [hu1, lu1] = [await ler(hu.id, 2031), await ler(lu.id, 2031)];
  check('duas lojas actuais gravam juntas', juntos.length === 2 && hu1.meses[0] === 6 && lu1.meses[0] === 7 && lu1.mes_em_curso === null && lu1.origem === 'sistema', { juntos, hu1, lu1 });
  await raises('a mesma loja duas vezes no pedido é recusada', () => gravar(contab, 2031, [{ loja_id: hu.id, esperado: hu1.a }, { loja_id: hu.id, esperado: hu1.a }]), /duas vezes/);

  await raises('quem só vê não grava pela função', () => gravar(leitor, 2031, [{ loja_id: hu.id, esperado: hu1.a, meses: JSON.parse(meses([1])) }]), /Sem permissão/);
  await raises('o atendimento não grava pela função', () => gravar(atendente, 2031, [{ loja_id: hu.id, esperado: hu1.a, meses: JSON.parse(meses([1])) }]), /Sem permissão/);
  await raises('meses negativos continuam recusados', () => gravar(contab, 2031, [{ loja_id: hu.id, esperado: hu1.a, meses: JSON.parse(meses([-1])) }]), /vendas_anos_meses_validos/);
  await raises('um anónimo não chama a função', () => db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    await tx.query(`select public.vendas_anos_gravar(2031, '[]'::jsonb)`);
  }), /permission denied/);

  const hist = await q(`select accao, por, origem from public.vendas_alteracoes where ano = 2031 order by id`);
  check('cada gravação pela função fica no histórico, com o autor', hist.length === 5 && hist.every((h) => h.por === contab), hist);

  // As linhas que vieram das importações (migrações) ficaram com a origem «importacao».
  const imp = await q(`select origem, fonte from public.vendas_anos where actualizado_por is null and (fonte = 'Relatório Síntese 2025/26' or fonte like 'Painel de Vendas da Loja %')
                         and exists (select 1 from jsonb_array_elements(meses) e where jsonb_typeof(e) = 'number')`);
  check('os anos importados por migração estão marcados como importação', imp.length > 0 && imp.every((r) => r.origem === 'importacao'), imp);
}

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
