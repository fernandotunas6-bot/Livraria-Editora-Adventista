// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários da base central do KanGest Livraria (migração 20261125100000_kangest_base_central), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest-central.mjs supabase/migrations
// Instruções em base.mjs e em docs/KANGEST-SINCRONIZACAO.md.
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
const como = (role, sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const CHAVE = Buffer.alloc(32, 7).toString('base64');
const doc = (id, numero, hash, anterior, extra = {}) => ({
  tipo: 'documento',
  documento: {
    documento_id: id, tipo_codigo: 'FR', grupo: 'vendas', serie: 'A2026', numero, numero_doc: `FR A2026/${numero}`,
    data_emissao: '2026-11-25', data_hora: `2026-11-25T10:0${numero % 10}:00`, armazem_id: 1, consumidor_final: true,
    total_liquido: 10000, total_iva: 1400, total: 11400, estado: 'N', hash, hash_anterior: anterior, hash_controlo: 'abcd', hash_versao: 1,
    ...extra,
  },
  linhas: [{ linha: 1, referencia: 'LIV-001', descricao: 'O Desejado', quantidade: 2, preco_unitario: 5000, total: 11400 }],
});
const receber = async (posto, lote) => (await q(`select public.kangest_receber($1, $2::jsonb) r`, [posto, JSON.stringify(lote)]))[0].r;
const cadeia = async (posto, numero) => (await q(`select cadeia from public.kangest_documentos where posto_id = $1 and numero = $2`, [posto, numero]))[0]?.cadeia;

// --- só o servidor ---------------------------------------------------------------------------------------------
for (const t of ['kangest_postos']) {
  await recusa(`${t}: o público não lê`, () => como('anon', null, `select * from public.${t}`), /permission denied/);
  await recusa(`${t}: as contas não lêem`, () => como('authenticated', null, `select * from public.${t}`), /permission denied/);
}
for (const [f, a] of [['kangest_receber', `'00000000-0000-4000-8000-000000000000'::uuid, '[]'::jsonb`], ['kangest_emparelhar', `'x', 'y', 'z'`],
  ['kangest_posto_criar', `'x', null, 'y', null`], ['kangest_posto_revogar', `'00000000-0000-4000-8000-000000000000'::uuid`],
  ['kangest_nonce', `'00000000-0000-4000-8000-000000000000'::uuid, 'n'`]]) {
  await recusa(`${f}: as contas não executam`, () => como('authenticated', null, `select public.${f}(${a})`), /permission denied/);
}

// --- criar e emparelhar ----------------------------------------------------------------------------------------
const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('O Desejado', 5700, 3, true, 'LIV-001') returning id`);
const posto = (await q(`select public.kangest_posto_criar('Loja do Huambo', $1, 'resumo-1', null) id`, [loja.id]))[0].id;
check('posto criado por emparelhar', (await q(`select estado from public.kangest_postos where id = $1`, [posto]))[0].estado === 'por_emparelhar');
await recusa('código errado', () => q(`select public.kangest_emparelhar('outro', $1, '1.4.4')`, [CHAVE]), /Código inválido/);
await recusa('chave que não é Ed25519', () => q(`select public.kangest_emparelhar('resumo-1', 'curta', '1.4.4')`), /não é uma chave Ed25519/);
await recusa('lote de um posto por emparelhar', () => receber(posto, []), /desconhecido ou revogado/);
const par = (await q(`select public.kangest_emparelhar('resumo-1', $1, '1.4.4 Livraria') r`, [CHAVE]))[0].r;
check('emparelhado: devolve o posto e a loja', par.id === posto && par.loja === 'Livraria — Huambo', par);
const p1 = (await q(`select estado, chave_publica, codigo_resumo, versao_programa from public.kangest_postos where id = $1`, [posto]))[0];
check('activo, com a chave, sem o código', p1.estado === 'activo' && p1.chave_publica === CHAVE && p1.codigo_resumo === null && p1.versao_programa === '1.4.4 Livraria', p1);
await recusa('o mesmo código não serve duas vezes', () => q(`select public.kangest_emparelhar('resumo-1', $1, '1.4.4')`, [CHAVE]), /Código inválido/);
const fora = (await q(`select public.kangest_posto_criar('Outro', null, 'resumo-2', null) id`))[0].id;
await q(`update public.kangest_postos set codigo_expira = now() - interval '1 minute' where id = $1`, [fora]);
await recusa('código fora de prazo', () => q(`select public.kangest_emparelhar('resumo-2', $1, '1.4.4')`, [CHAVE]), /fora de prazo/);

// --- nonces ----------------------------------------------------------------------------------------------------
check('nonce novo', (await q(`select public.kangest_nonce($1, 'abcdefghijklmnop1') r`, [posto]))[0].r === true);
check('o mesmo nonce outra vez: recusado', (await q(`select public.kangest_nonce($1, 'abcdefghijklmnop1') r`, [posto]))[0].r === false);

// --- receber: uma vez só, a cadeia, as linhas ligadas ao produto ------------------------------------------------
const r1 = await receber(posto, [doc(11, 1, 'H1', ''), doc(12, 2, 'H2', 'H1')]);
check('dois documentos recebidos', r1.recebidos === 2 && r1.repetidos === 0 && r1.erros.length === 0, r1);
check('cadeia certa no primeiro e no segundo', (await cadeia(posto, 1)) === 'certa' && (await cadeia(posto, 2)) === 'certa');
const linha = (await q(`select l.book_id, l.quantidade::float8 q from public.kangest_documento_linhas l join public.kangest_documentos d on d.id = l.documento where d.posto_id = $1 and d.numero = 1`, [posto]))[0];
check('a linha liga-se ao produto do site pela referência', linha.book_id === livro.id && linha.q === 2, linha);
check('a loja do posto', (await q(`select store_id from public.kangest_documentos where posto_id = $1 and numero = 1`, [posto]))[0].store_id === loja.id);

const r2 = await receber(posto, [doc(11, 1, 'H1', ''), doc(12, 2, 'H2', 'H1')]);
check('o mesmo lote outra vez: nada em dobro', r2.recebidos === 0 && r2.repetidos === 2, r2);
check('continuam dois', (await q(`select count(*)::int n from public.kangest_documentos where posto_id = $1`, [posto]))[0].n === 2);

// fora de ordem: o 4 chega antes do 3; quando o 3 chega, o 4 fica conferido
await receber(posto, [doc(14, 4, 'H4', 'H3')]);
check('sem o anterior: por conferir', (await cadeia(posto, 4)) === 'por_conferir');
await receber(posto, [doc(13, 3, 'H3', 'H2')]);
check('chegou o anterior: os dois certos', (await cadeia(posto, 3)) === 'certa' && (await cadeia(posto, 4)) === 'certa');

// elo partido
const r5 = await receber(posto, [doc(15, 5, 'H5', 'OUTRO')]);
check('elo partido: fica marcado e conta', (await cadeia(posto, 5)) === 'partida' && r5.partidas === 1, r5);

// um documento estragado não leva os outros
const r6 = await receber(posto, [doc(16, 6, 'H6', 'H5'), { tipo: 'documento', documento: { documento_id: 17 } }, { tipo: 'outra coisa' }]);
check('um com erro, os outros entram', r6.recebidos === 1 && r6.erros.length === 2, r6);
check('o erro fica no posto', (await q(`select ultimo_erro, ultima_sinc from public.kangest_postos where id = $1`, [posto]))[0].ultimo_erro !== '');

// --- anulação: a única mudança aceite -------------------------------------------------------------------------
const r7 = await receber(posto, [doc(12, 2, 'H2', 'H1', { estado: 'A', motivo_anulacao: 'Engano no cliente' })]);
const anul = (await q(`select estado, motivo_anulacao, anulado_em from public.kangest_documentos where posto_id = $1 and numero = 2`, [posto]))[0];
check('anulado com o motivo', r7.anulados === 1 && anul.estado === 'A' && anul.motivo_anulacao === 'Engano no cliente' && anul.anulado_em !== null, { r7, anul });
check('a anulação repetida não conta outra vez', (await receber(posto, [doc(12, 2, 'H2', 'H1', { estado: 'A' })])).repetidos === 1);
check('o anulado não volta a normal', (await receber(posto, [doc(12, 2, 'H2', 'H1')])).repetidos === 1
  && (await q(`select estado from public.kangest_documentos where posto_id = $1 and numero = 2`, [posto]))[0].estado === 'A');

// --- as cópias não se alteram nem se apagam (nem pelo servidor) ------------------------------------------------
await recusa('mudar o total', () => q(`update public.kangest_documentos set total = 1 where posto_id = $1 and numero = 1`, [posto]), /não se altera/);
await recusa('mudar o hash', () => q(`update public.kangest_documentos set hash = 'X' where posto_id = $1 and numero = 1`, [posto]), /não se altera/);
await recusa('apagar', () => q(`delete from public.kangest_documentos where posto_id = $1 and numero = 1`, [posto]), /não se apagam/);
await recusa('mudar uma linha', () => q(`update public.kangest_documento_linhas set total = 1`), /não se altera/);
await recusa('apagar uma linha', () => q(`delete from public.kangest_documento_linhas`), /não se apagam/);
await recusa('apagar um posto com documentos', () => q(`delete from public.kangest_postos where id = $1`, [posto]), /violates foreign key|viola/);
await q(`delete from public.stock_books where id = $1`, [livro.id]);
check('apagar o produto só desliga a linha', (await q(`select count(*)::int n from public.kangest_documento_linhas where book_id is null`))[0].n >= 1);

// --- quem lê as cópias: só quem vê os relatórios de vendas -----------------------------------------------------
const membro = (await q(`insert into auth.users (email, email_confirmed_at) values ('m@x.ao', now()) returning id`))[0].id;
const admin = (await q(`insert into auth.users (email, email_confirmed_at) values ('a@x.ao', now()) returning id`))[0].id;
await q(`update public.profiles set role = 'admin' where id = $1`, [admin]);
await recusa('o público não lê as cópias', () => como('anon', null, `select * from public.kangest_documentos`), /permission denied/);
check('um membro não vê nenhuma', (await como('authenticated', membro, `select id from public.kangest_documentos`)).length === 0);
check('quem vê os relatórios vê-as', (await como('authenticated', admin, `select id from public.kangest_documentos`)).length === 6);
await recusa('nem quem vê os relatórios as altera', () => como('authenticated', admin, `update public.kangest_documentos set estado = 'A'`), /permission denied/);

// --- revogar e emparelhar outra vez ----------------------------------------------------------------------------
await q(`select public.kangest_posto_revogar($1)`, [posto]);
const rev = (await q(`select estado, chave_publica from public.kangest_postos where id = $1`, [posto]))[0];
check('revogado sem a chave', rev.estado === 'revogado' && rev.chave_publica === null, rev);
await recusa('o posto revogado não entrega lotes', () => receber(posto, [doc(18, 7, 'H7', 'H6')]), /desconhecido ou revogado/);
check('revogar apaga os nonces', (await q(`select count(*)::int n from private.kangest_nonces where posto_id = $1`, [posto]))[0].n === 0);
await q(`select public.kangest_posto_novo_codigo($1, 'resumo-3')`, [posto]);
const outraChave = Buffer.alloc(32, 9).toString('base64');
await q(`select public.kangest_emparelhar('resumo-3', $1, '1.4.4')`, [outraChave]);
check('emparelhado outra vez com a chave nova; os documentos continuam',
  (await q(`select chave_publica from public.kangest_postos where id = $1`, [posto]))[0].chave_publica === outraChave
  && (await receber(posto, [doc(18, 7, 'H7', 'H6')])).recebidos === 1);

// --- novidades para o posto (20261125110000): as encomendas da loja dele e o catálogo, pela ordem da alteração ------
const [outraLoja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const encomenda = async (numero, store) => (await q(
  `insert into public.orders (order_number, customer_email, customer_name, phone, items, total, shipping_method, store_id)
   values ($1, 'c@x.ao', 'Cliente da Loja', '923000000', '[{"title":"O Desejado","quantity":1,"price":5700}]'::jsonb, 5700, 'pickup', $2) returning id`,
  [numero, store]))[0].id;
for (const n of ['LIV-1', 'LIV-2', 'LIV-3']) await encomenda(n, loja.id);
await encomenda('LIV-OUTRA', outraLoja.id);
const novidades = async (cursores, limite = 2, quem = posto) =>
  (await q(`select public.kangest_novidades($1, $2::jsonb, $3) r`, [quem, JSON.stringify(cursores), limite]))[0].r;
const n1 = await novidades({});
check('primeira página: duas encomendas da loja do posto, e há mais', n1.encomendas.length === 2 && n1.mais.encomendas === true, n1.mais);
const n2 = await novidades(n1.cursores);
check('segunda página: a que faltava, sem repetir', n2.encomendas.length === 1 && !n1.encomendas.some((e) => e.id === n2.encomendas[0].id) && n2.mais.encomendas === false, n2.encomendas);
check('nunca as de outra loja', ![...n1.encomendas, ...n2.encomendas].some((e) => e.numero === 'LIV-OUTRA'));
const primeira = n1.encomendas[0];
check('a encomenda leva o que a loja precisa', primeira.cliente === 'Cliente da Loja' && primeira.telefone === '923000000' && primeira.levantamento === true
  && Array.isArray(primeira.itens) && primeira.itens[0].title === 'O Desejado', primeira);
const n3 = await novidades(n2.cursores);
check('sem nada novo: vazio, e o cursor fica onde estava', n3.encomendas.length === 0 && JSON.stringify(n3.cursores.encomendas) === JSON.stringify(n2.cursores.encomendas), n3.cursores);
await q(`update public.orders set status = 'confirmed' where order_number = 'LIV-1'`);
const n4 = await novidades(n3.cursores);
check('a encomenda alterada volta a vir, com o estado novo', n4.encomendas.length === 1 && n4.encomendas[0].numero === 'LIV-1' && n4.encomendas[0].estado === 'confirmed', n4.encomendas);
const totalProdutos = (await q(`select count(*)::int n from public.stock_books`))[0].n;
const cat = await novidades({}, 500);
check('o catálogo vem todo, com os ocultos', cat.produtos.length === Math.min(totalProdutos, 500) && cat.produtos.some((x) => x.activo === false), { vieram: cat.produtos.length, totalProdutos });
// as igrejas do registo da Igreja (20261126160000): todas, paginadas, e a alterada volta a vir
for (const [cn, nome] of [['101', 'Igreja Central de Exemplo'], ['102', 'Grupo do Bairro Exemplo'], ['103', 'Companhia da Vila Exemplo']]) {
  await q(`insert into public.churches (cn, name, address, delegate_name) values ($1, $2, 'Rua Exemplo', 'Delegado Exemplo')`, [cn, nome]);
}
const i1 = await novidades({}, 2);
check('igrejas: a primeira página traz duas, e há mais', i1.igrejas.length === 2 && i1.mais.igrejas === true, i1.mais);
const i2 = await novidades(i1.cursores, 2);
check('igrejas: a segunda traz a que faltava, sem repetir', i2.igrejas.length === 1 && !i1.igrejas.some((x) => x.id === i2.igrejas[0].id), i2.igrejas);
check('a igreja leva o que a loja precisa para facturar', i1.igrejas[0].nome && i1.igrejas[0].cn && i1.igrejas[0].morada === 'Rua Exemplo' && i1.igrejas[0].activa === true
  && !('notes' in i1.igrejas[0]) && !('delegate_pastor_id' in i1.igrejas[0]), i1.igrejas[0]);
await q(`update public.churches set active = false, updated = now() + interval '1 second' where cn = '101'`);
const i3 = await novidades(i2.cursores, 2);
check('a igreja alterada volta a vir', i3.igrejas.length === 1 && i3.igrejas[0].cn === '101' && i3.igrejas[0].activa === false, i3.igrejas);
const semLoja = (await q(`select public.kangest_posto_criar('Sem loja', null, 'resumo-9', null) id`))[0].id;
await q(`select public.kangest_emparelhar('resumo-9', $1, '1.4.4')`, [Buffer.alloc(32, 5).toString('base64')]);
check('um posto sem loja não recebe encomendas', (await novidades({}, 50, semLoja)).encomendas.length === 0);
await q(`select public.kangest_posto_revogar($1)`, [semLoja]);
await recusa('um posto revogado não recebe novidades', () => novidades({}, 50, semLoja), /desconhecido ou revogado/);
await recusa('novidades: as contas não executam', () => como('authenticated', admin, `select public.kangest_novidades('${posto}'::uuid, '{}'::jsonb, 5)`), /permission denied/);

// --- o ERP financeiro central (20261126170000): os movimentos da tesouraria, que não se alteram ------------------
const mov = (id, extra = {}) => ({ tipo: 'movimento', movimento: { movimento_id: id, data: '2026-11-26', data_hora: '2026-11-26T10:00:00', conta: 'Caixa', tipo: 'entrada', valor: 570000, categoria: 'Vendas', documento: 'FR 2026/7', anulado: false, ...extra } });
const mv1 = await receber(posto, [mov(1), mov(2, { tipo: 'saida', valor: 120000, categoria: 'Despesas' })]);
check('os movimentos entram', mv1.movimentos === 2 && mv1.erros.length === 0, mv1);
const mv2 = await receber(posto, [mov(1)]);
check('o mesmo movimento outra vez não se grava em dobro', mv2.movimentos === 0 && mv2.repetidos === 1, mv2);
const mv3 = await receber(posto, [mov(1, { anulado: true })]);
check('a anulação só marca o movimento', mv3.movimentos === 1 && (await q(`select anulado from public.kangest_movimentos where posto_id = $1 and movimento_id = 1`, [posto]))[0].anulado === true, mv3);
check('a anulação repetida não muda nada', (await receber(posto, [mov(1, { anulado: true })])).repetidos === 1);
await recusa('um movimento não se altera', () => q(`update public.kangest_movimentos set valor = 1 where posto_id = $1 and movimento_id = 2`, [posto]), /não se alteram/);
await recusa('a anulação não volta atrás', () => q(`update public.kangest_movimentos set anulado = false where posto_id = $1 and movimento_id = 1`, [posto]), /não se alteram/);
await recusa('um movimento não se apaga', () => q(`delete from public.kangest_movimentos where posto_id = $1`, [posto]), /não se apagam/);
check('um movimento sem data válida vai para os erros', (await receber(posto, [mov(3, { data: 'ontem' })])).erros.length === 1);
const resumoFin = (await como('authenticated', admin, `select public.kangest_financeiro('2026-11-01', '2026-11-30') r`))[0].r;
check('o resumo financeiro: sem o anulado, por loja e por centro de custo', resumoFin.total.entradas === 0 && resumoFin.total.saidas === 120000 && resumoFin.anulados === 1
  && resumoFin.lojas.length === 1 && resumoFin.categorias.some((c) => c.categoria === 'Despesas'), resumoFin);
await recusa('o resumo financeiro: só quem lê os pagamentos', () => como('authenticated', '00000000-0000-4000-8000-0000000000ff', `select public.kangest_financeiro('2026-11-01', '2026-11-30')`), /Sem acesso/);

// --- tempo real (20261125120000): o tópico secreto de cada posto e o sinal sem dados --------------------------------
const topico = async (id) => (await q(`select topico from public.kangest_postos where id = $1`, [id]))[0].topico;
const t1 = await topico(posto);
check('o posto emparelhado tem um tópico secreto (32 caracteres ao acaso)', /^[0-9a-f]{32}$/.test(t1 || ''), t1);
const outroPosto = (await q(`select public.kangest_posto_criar('Outro', $1, 'resumo-tr', null) id`, [loja.id]))[0].id;
const empar = (await q(`select public.kangest_emparelhar('resumo-tr', $1, '1.4.4') r`, [Buffer.alloc(32, 6).toString('base64')]))[0].r;
check('o emparelhamento devolve o tópico, e cada posto tem o seu', empar.topico && empar.topico === (await topico(outroPosto)) && empar.topico !== t1, empar);
// as encomendas continuam a gravar-se com o gatilho do sinal (sem o serviço de tempo real, o sinal perde-se)
await encomenda('LIV-TR-1', loja.id);
await q(`update public.orders set status = 'confirmed' where order_number = 'LIV-TR-1'`);
check('as encomendas gravam-se com o sinal do KanGest', (await q(`select count(*)::int n from public.orders where order_number = 'LIV-TR-1' and status = 'confirmed'`))[0].n === 1);
await q(`select public.kangest_posto_novo_codigo($1, 'resumo-tr2')`, [outroPosto]);
check('pedir novo código apaga o tópico', (await topico(outroPosto)) === null);
await q(`select public.kangest_emparelhar('resumo-tr2', $1, '1.4.4')`, [Buffer.alloc(32, 7).toString('base64')]);
check('emparelhar outra vez dá um tópico novo', (await topico(outroPosto)) && (await topico(outroPosto)) !== empar.topico);
await q(`select public.kangest_posto_revogar($1)`, [outroPosto]);
check('revogar apaga o tópico', (await topico(outroPosto)) === null);

// --- o stock, os preços e os artigos pelos postos (20261125140000) ------------------------------------------------
const emparelhado = async (nome, loja_id, resumo, byte) => {
  const id = (await q(`select public.kangest_posto_criar($1, $2, $3, null) id`, [nome, loja_id, resumo]))[0].id;
  await q(`select public.kangest_emparelhar($1, $2, '1.4.5')`, [resumo, Buffer.alloc(32, byte).toString('base64')]);
  return id;
};
const [lojaA] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const [lojaB] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Bié', 'Bié', 'Cuíto', true) returning id`);
const [livroS] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('Caminho a Cristo', 2500, 9, true, 'LIV-STK') returning id`);
const pA = await emparelhado('Loja do Lubango', lojaA.id, 'resumo-stk-a', 11);
const pB = await emparelhado('Loja do Bié', lojaB.id, 'resumo-stk-b', 12);
const pSem = await emparelhado('Escritório', null, 'resumo-stk-c', 13);
const stock = (ref, armazens, artigo_id = 7) => ({ tipo: 'stock', artigo_id, referencia: ref, armazens });
const artigo = (a, artigo_id = 7) => ({ tipo: 'artigo', artigo_id, artigo: { tipo: 'P', ativo: true, codigo_barras: '', ...a } });
const linhasDe = async (p) => q(`select armazem_id, disponivel::int, online, store_id from public.kangest_stock where ligacao = $1 order by armazem_id`, [`posto:${p}`]);
const temos = async (store) => (await q(`select available from public.store_stock where store_id = $1 and book_id = $2`, [store, livroS.id]))[0]?.available;
const stockDoLivro = async () => (await q(`select stock::int from public.stock_books where id = $1`, [livroS.id]))[0].stock;

let r = await receber(pA, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 5, reservado: 1, disponivel: 4 }])]);
check('stock: o posto com loja grava o estado do armazém', r.stock === 1 && r.erros.length === 0, r);
check('stock: fica na loja do posto e não conta para o site por omissão', JSON.stringify(await linhasDe(pA)) === JSON.stringify([{ armazem_id: 1, disponivel: 4, online: false, store_id: lojaA.id }]), await linhasDe(pA));
check('stock: o «temos» da loja do posto', (await temos(lojaA.id)) === true);
check('stock: o stock à venda no site não muda (a primeira loja ligada não é o site todo)', (await stockDoLivro()) === 9, await stockDoLivro());
await receber(pA, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 5, reservado: 1, disponivel: 4 }])]);
check('stock: o mesmo lote outra vez não dobra nada', (await linhasDe(pA)).length === 1);
await receber(pA, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 0, reservado: 0, disponivel: 0 }, { armazem_id: 2, quantidade: 3, reservado: 0, disponivel: 3 }])]);
await receber(pA, [stock('LIV-STK', [{ armazem_id: 2, quantidade: 0, reservado: 0, disponivel: 0 }])]);
check('stock: o armazém que já não vem sai, e o que ficou a zero fica a zero', JSON.stringify((await linhasDe(pA)).map((l) => [l.armazem_id, l.disponivel])) === '[[2,0]]', await linhasDe(pA));
check('stock: a loja sem nada fica «não temos»', (await temos(lojaA.id)) === false);

const conf = async (p, stock_online, manda_catalogo) => (await q(`select public.kangest_posto_configurar($1, $2, $3) r`, [p, stock_online, manda_catalogo]))[0].r;
await receber(pA, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 4, reservado: 0, disponivel: 4 }])]);
await receber(pB, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 7, reservado: 1, disponivel: 6 }])]);
check('stock: ainda nenhum posto conta, o site fica como estava', (await stockDoLivro()) === 9);
let c = await conf(pA, true, null);
check('configurar: o posto passa a contar para o site', c.stock_online === true && c.manda_catalogo === false, c);
check('configurar: o stock que já tinha mandado passa a contar', (await stockDoLivro()) === 4, await stockDoLivro());
await conf(pB, true, null);
check('stock: dois postos que contam somam-se', (await stockDoLivro()) === 10, await stockDoLivro());
check('stock: cada loja com o seu «temos»', (await temos(lojaA.id)) === true && (await temos(lojaB.id)) === true);
await conf(pB, false, null);
check('configurar: deixar de contar tira o stock dele do site', (await stockDoLivro()) === 4, await stockDoLivro());

r = await receber(pSem, [stock('LIV-STK', [{ armazem_id: 1, quantidade: 50, reservado: 0, disponivel: 50 }])]);
check('stock: um posto sem loja e sem contar para o site é ignorado, sem erro', r.ignorados === 1 && r.stock === 0 && r.erros.length === 0, r);
check('stock: e não grava nada', (await linhasDe(pSem)).length === 0);
r = await receber(pA, [stock('', [])]);
check('stock: sem referência é um erro desse item', r.erros.length === 1 && r.erros[0].tipo === 'stock' && /referência/.test(r.erros[0].erro), r);

r = await receber(pA, [artigo({ referencia: 'LIV-STK', descricao: 'Caminho a Cristo', preco1_iva: 300000 })]);
check('artigo: de um posto que não manda no catálogo é ignorado', r.ignorados === 1 && r.artigos === 0, r);
check('artigo: e o preço do site fica', (await q(`select price::int p from public.stock_books where id = $1`, [livroS.id]))[0].p === 2500);
await conf(pA, null, true);
r = await receber(pA, [artigo({ referencia: 'LIV-STK', descricao: 'Caminho a Cristo', preco1_iva: 300000 })]);
check('artigo: o posto do catálogo manda no preço (PVP com IVA, de cêntimos para kwanzas)', r.artigos === 1 && (await q(`select price::int p from public.stock_books where id = $1`, [livroS.id]))[0].p === 3000, r);
r = await receber(pA, [artigo({ referencia: 'LIV-NOVO-A', descricao: '  Nosso   Hinário  ', preco1_iva: 450000, codigo_barras: '978000' })]);
const novo = (await q(`select title, price::int p, active, kangest_novo_em is not null novo from public.stock_books where kigest_ref = 'LIV-NOVO-A'`))[0];
check('artigo: um artigo que o site não tem entra oculto, à espera de fotografia', novo && novo.active === false && novo.novo && novo.title === 'Nosso Hinário' && novo.p === 4500, novo);
await receber(pA, [artigo({ referencia: 'LIV-SERV', descricao: 'Portes', tipo: 'S', preco1_iva: 100000 }), artigo({ referencia: 'LIV-INACT', descricao: 'Velho', ativo: false })]);
check('artigo: os serviços e os inactivos não dão produto', (await q(`select count(*)::int n from public.stock_books where kigest_ref in ('LIV-SERV', 'LIV-INACT')`))[0].n === 0);
c = await conf(pB, null, true);
check('configurar: só um posto manda no catálogo', c.manda_catalogo === true && (await q(`select manda_catalogo from public.kangest_postos where id = $1`, [pA]))[0].manda_catalogo === false);
r = await receber(pA, [{ tipo: 'outra-coisa', artigo_id: 3 }]);
check('lote: um tipo desconhecido é um erro desse item', r.erros.length === 1 && /Tipo desconhecido/.test(r.erros[0].erro) && r.erros[0].artigo_id === 3, r);

await conf(pB, true, null);
check('antes de revogar, os dois contam', (await stockDoLivro()) === 10);
await q(`select public.kangest_posto_revogar($1)`, [pB]);
check('revogar: o stock do posto sai do site', (await linhasDe(pB)).length === 0 && (await stockDoLivro()) === 4, await stockDoLivro());
check('revogar: e os interruptores desligam-se', (await q(`select stock_online, manda_catalogo from public.kangest_postos where id = $1`, [pB]))[0].manda_catalogo === false);
await recusa('configurar: as contas não executam', () => como('authenticated', null, `select public.kangest_posto_configurar('${pA}'::uuid, true, true)`), /permission denied/);
await recusa('configurar: posto desconhecido', () => conf('00000000-0000-4000-8000-000000000009', true, null), /desconhecido/);

// --- os documentos das encomendas online pelos postos (20261125150000) ------------------------------------------
const [lojaE] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Benguela', 'Benguela', 'Benguela', true) returning id`);
const pE = await emparelhado('Loja de Benguela', lojaE.id, 'resumo-enc-e', 21);
const pE2 = await emparelhado('Segundo de Benguela', lojaE.id, 'resumo-enc-e2', 22);
const filaDe = async (order_id) => q(`select accao, estado, posto_id from public.kangest_fila where order_id = $1 order by accao`, [order_id]);
const encomendasDo = async (p, emitir, portes = null, generico = null, modo = null) =>
  (await q(`select public.kangest_posto_encomendas($1, $2, $3, $4, $5) r`, [p, emitir, portes, generico, modo]))[0].r;

const antes = await encomenda('LIV-E-0', lojaE.id);
check('encomendas: sem o interruptor, a fila não enche (como até aqui)', (await filaDe(antes)).length === 0);
const cfg = await encomendasDo(pE, true, ' PORTES ', '', 'MB');
check('encomendas: o posto liga a emissão, com os portes e o modo por omissão', cfg.emitir_encomendas === true && cfg.artigo_portes === 'PORTES' && cfg.pagamentos['*'] === 'MB', cfg);
await recusa('encomendas: dois postos não emitem pela mesma loja', () => encomendasDo(pE2, true), /Outro posto já emite/);
await recusa('encomendas: um posto sem loja não emite', () => encomendasDo(pSem, true), /sem loja/);
await recusa('encomendas: o modo de pagamento tem de ser um código do KanGest', () => encomendasDo(pE, null, null, null, 'multicaixa'), /2 a 4 letras/);
const e1 = await encomenda('LIV-E-1', lojaE.id);
check('encomendas: uma encomenda da loja do posto entra na fila (a NE)', JSON.stringify(await filaDe(e1)) === JSON.stringify([{ accao: 'ne', estado: 'pendente', posto_id: null }]), await filaDe(e1));
const eOutra = await encomenda('LIV-E-OUTRA', lojaB.id);
check('encomendas: a de uma loja sem posto que emite não entra', (await filaDe(eOutra)).length === 0);
// pago como o faz private.order_payments_sync (o pagamento resulta dos pagamentos registados; ver kangest.mjs)
await db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_paid = total, payment_status = payment_status where id = $1`, [e1]);
});
check('encomendas: paga, a FR entra a seguir à NE', (await filaDe(e1)).map((l) => l.accao).join() === 'fr,ne', await filaDe(e1));
const res = await q(`select id, accao, posto_id, estado from public.kangest_reservar_posto($1, 10) order by id`, [pE]);
check('reserva: o posto fica com as linhas da loja dele', res.length === 2 && res.every((l) => l.posto_id === pE && l.estado === 'processando'), res);
check('reserva: o que já está reservado não sai outra vez', (await q(`select count(*)::int n from public.kangest_reservar_posto($1, 10)`, [pE]))[0].n === 0);
check('reserva: outro posto da mesma loja (que não emite) não leva nada', (await q(`select count(*)::int n from public.kangest_reservar_posto($1, 10)`, [pE2]))[0].n === 0);
await q(`update public.kangest_fila set actualizado = now() - interval '11 minutes' where order_id = $1`, [e1]);
check('reserva: uma linha presa há mais de 10 minutos volta a sair (o KanGest repete com a mesma chave)', (await q(`select count(*)::int n from public.kangest_reservar_posto($1, 10)`, [pE]))[0].n === 2);
const e2 = await encomenda('LIV-E-2', lojaE.id);
await q(`update public.orders set status = 'cancelled' where id = $1`, [e2]);
check('encomendas: cancelada antes de chegar ao KanGest, a NE fica de parte', (await filaDe(e2))[0]?.estado === 'ignorado', await filaDe(e2));
await recusa('reserva: as contas não executam', () => como('authenticated', null, `select * from public.kangest_reservar_posto('${pE}'::uuid, 1)`), /permission denied/);
await recusa('configurar encomendas: as contas não executam', () => como('authenticated', null, `select public.kangest_posto_encomendas('${pE}'::uuid, true, null, null, null)`), /permission denied/);
await q(`select public.kangest_posto_revogar($1)`, [pE]);
check('revogar: o posto deixa de emitir', (await q(`select emitir_encomendas from public.kangest_postos where id = $1`, [pE]))[0].emitir_encomendas === false);
const e3 = await encomenda('LIV-E-3', lojaE.id);
check('revogar: as encomendas seguintes da loja já não entram na fila', (await filaDe(e3)).length === 0);
check('revogar: e a reserva não lhe dá nada', (await q(`select count(*)::int n from public.kangest_reservar_posto($1, 10)`, [pE]))[0].n === 0);

console.log(`kangest-central: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
