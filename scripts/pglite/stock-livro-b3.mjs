// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// A fase B3 (rascunho): o stock à venda a sair do livro único de stock, com o interruptor desligado por omissão
// (migração 20261127140000_stock_livro_b3):
//   PGLITE_MODULE=… node scripts/pglite/stock-livro-b3.mjs supabase/migrations
// O que se confere: com a fonte «fotografias» nada muda; com «livro», o stock à venda é a soma do livro dos postos que
// contam para o site com as reservas do site, e o «temos / não temos» de cada loja sai do livro; mudar a fonte fica no
// registo de segurança; ninguém de fora a muda.
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
const servidor = (sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await tx.exec(`set local role service_role`);
  return (await tx.query(sql, params)).rows;
});
const como = (sql, role) => db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); return (await tx.query(sql)).rows; });
const stock = async (id) => Number((await q(`select stock from public.stock_books where id = $1`, [id]))[0].stock);
const temos = async (loja, livro) => (await q(`select available from public.store_stock where store_id = $1 and book_id = $2`, [loja, livro]))[0]?.available;

const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('O Desejado', 5700, 10, true, 'LIV-001') returning id`);
const posto = (await q(`select public.kangest_posto_criar('Caixa do Huambo', $1, 'r-b3', null) id`, [loja.id]))[0].id;
await q(`update public.kangest_postos set estado = 'activo', chave_publica = 'x', stock_online = true where id = $1`, [posto]);
const receber = (aberturas, movimentos, epoca = 'e1') => servidor(`select public.stock_livro_receber($1, $2, $3::jsonb, $4::jsonb)`, [posto, epoca, JSON.stringify(aberturas), JSON.stringify(movimentos)]);

check('por omissão, a fonte é «fotografias»', (await q(`select private.stock_livro_fonte() f`))[0].f === 'fotografias');
await receber([{ armazem_id: 1, referencia: 'LIV-001', quantidade: 12 }], []);
check('com as fotografias, o livro não mexe no stock à venda', (await stock(livro.id)) === 10);

// muda para o livro: o stock à venda passa a ser o do livro
const n = (await servidor(`select public.stock_livro_mudar_fonte('livro') n`))[0].n;
check('mudar a fonte recalcula os produtos', Number(n) >= 1, n);
check('o stock à venda é o do livro (12)', (await stock(livro.id)) === 12);
check('a loja tem', (await temos(loja.id, livro.id)) === true);
const reg = await q(`select summary, alerted from public.security_audit_log where table_name = 'stock_livro_definicoes'`);
check('fica no registo de segurança, com aviso', reg.length === 1 && reg[0].alerted === true && reg[0].summary.includes('livro'), reg);

// uma venda no posto: o stock à venda desce logo
await receber([], [{ mov_id: 1, armazem_id: 1, referencia: 'LIV-001', quantidade: -5, tipo: 'venda', documento: 'FR A/1' }]);
check('a venda do posto desce o stock à venda (7)', (await stock(livro.id)) === 7);
// uma reserva do site (B2): desce também
await q(`insert into public.stock_movimentos (store_id, referencia, book_id, tipo, quantidade, origem, documento, chave, momento)
         values ($1, 'LIV-001', $2, 'reserva', -2, 'site:checkout', 'ENC-1', 'site:reserva:t1', now())`, [loja.id, livro.id]);
check('a reserva do site desce o stock à venda (5)', (await stock(livro.id)) === 5);
// vende tudo: o stock à venda não fica negativo, e a loja deixa de ter
await receber([], [{ mov_id: 2, armazem_id: 1, referencia: 'LIV-001', quantidade: -10, tipo: 'venda', documento: 'FR A/2' }]);
check('nunca negativo à venda (0)', (await stock(livro.id)) === 0);
check('a loja deixa de ter', (await temos(loja.id, livro.id)) === false);

// um posto que não conta para o site não mexe no stock à venda
await q(`update public.kangest_postos set stock_online = false where id = $1`, [posto]);
await servidor(`select public.kangest_recalcular_stock('LIV-001')`);
check('sem postos online, o stock à venda fica como estava', (await stock(livro.id)) === 0);

// voltar às fotografias
await servidor(`select public.stock_livro_mudar_fonte('fotografias')`);
check('de volta às fotografias', (await q(`select private.stock_livro_fonte() f`))[0].f === 'fotografias');
await recusa('uma fonte desconhecida', () => servidor(`select public.stock_livro_mudar_fonte('outra')`), /fotografias. ou .livro/);
await recusa('ninguém de fora muda a fonte', () => como(`select public.stock_livro_mudar_fonte('livro')`, 'authenticated'), /permission denied/);
await recusa('nem lê o disponível', () => como(`select public.stock_livro_disponivel('LIV-001')`, 'anon'), /permission denied/);

console.log(`stock-livro-b3: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
