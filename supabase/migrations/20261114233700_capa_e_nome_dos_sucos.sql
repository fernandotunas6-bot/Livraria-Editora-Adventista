-- «O Poder Medicinal dos Sucos» (LIV-159, KiGest 30042026): a capa verdadeira, o nome inteiro, o
-- autor e a descrição (2026-11-14).
--
-- O livro estava à venda com uma capa tipográfica: a internet só tinha a edição brasileira e o ISBN
-- da loja é o da portuguesa (docs/catalogo/CAPAS-INTERNET.md). O dono mandou a fotografia da capa
-- do exemplar da loja; endireitada com scripts/catalogo/capa_da_fotografia.py, foi gravada por cima
-- da tipográfica com o mesmo nome de ficheiro, por isso a base de dados não muda para a capa.
--
-- A capa confirma o resto: o nome é «O Poder Medicinal dos Sucos e Shakes — Bebidas saudáveis para
-- fortalecer seu corpo» e o autor é o Dr. Jorge Pamplona (escrito como no «21 Dias para Mudar»,
-- para os dois aparecerem juntos na pesquisa). A descrição tinha sido escrita só a partir do nome
-- do artigo no KiGest.
--
-- Como nas migrações anteriores do catálogo, cada passo só mexe no que ainda está como estava, para
-- não pisar o que alguém tenha corrigido no painel; pode correr mais de uma vez.

-- 1 — Nome: o KiGest cortou «e Shakes».
update public.stock_books
   set title = 'O Poder Medicinal dos Sucos e Shakes',
       updated = now()
 where kigest_ref = '30042026'
   and title = 'O Poder Medicinal dos Sucos';

-- 2 — Autor, que os produtos do KiGest não tinham.
update public.stock_books
   set author = 'Jorge Pamplona',
       updated = now()
 where kigest_ref = '30042026'
   and coalesce(btrim(author), '') = '';

-- 3 — Descrição, só se ainda for a que foi escrita a partir do nome do artigo (impressão md5).
update public.stock_books
   set description = '<p>«O Poder Medicinal dos Sucos e Shakes — Bebidas saudáveis para fortalecer seu corpo», do Dr. Jorge Pamplona.</p><p>Sucos, shakes e outras bebidas feitas com frutas e legumes: o que cada uma faz pelo organismo e como se prepara em casa, com tratamentos detox e de emagrecimento. Em capa dura e ilustrado a cores.</p>',
       updated = now()
 where kigest_ref = '30042026'
   and md5(description) = '7be198561efd44a3f47a565511c6d934';
