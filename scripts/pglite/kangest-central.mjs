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
const semLoja = (await q(`select public.kangest_posto_criar('Sem loja', null, 'resumo-9', null) id`))[0].id;
await q(`select public.kangest_emparelhar('resumo-9', $1, '1.4.4')`, [Buffer.alloc(32, 5).toString('base64')]);
check('um posto sem loja não recebe encomendas', (await novidades({}, 50, semLoja)).encomendas.length === 0);
await q(`select public.kangest_posto_revogar($1)`, [semLoja]);
await recusa('um posto revogado não recebe novidades', () => novidades({}, 50, semLoja), /desconhecido ou revogado/);
await recusa('novidades: as contas não executam', () => como('authenticated', admin, `select public.kangest_novidades('${posto}'::uuid, '{}'::jsonb, 5)`), /permission denied/);

console.log(`kangest-central: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
