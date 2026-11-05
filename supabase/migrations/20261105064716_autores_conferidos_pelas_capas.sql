-- Autores que não batiam com a capa do livro (2026-11-05). Conferidos na capa ampliada e, quando
-- havia, numa fonte externa (página da CPB, catálogos da edição original):
--  - LIV-043 "Herdeiros do Reino": Herdenir Klaft → Josanan Alves (nome impresso na capa)
--  - LIV-079 "Um Minuto Para Sempre": Braulio Fonseca → Odailson Fonseca (capa; 365 reflexões do
--    pastor Odailson Fonseca)
--  - LIV-090 "Sobreviventes": Levi Plecitran → Lori Peckham (capa; tradução de "Guide's Greatest
--    Survivor Stories")
--  - LIV-092 "Soldado Desarmado": Harold R. Nell → Frances M. Doss (capa; CPB, ISBN 978-85-345-2353-0)
-- Só muda o autor se ainda tiver o valor antigo; guarda-o antes em private.correcoes_dados.

with mudar(codigo, antes, depois) as (values
  ('LIV-043', 'Herdenir Klaft', 'Josanan Alves'),
  ('LIV-079', 'Braulio Fonseca', 'Odailson Fonseca'),
  ('LIV-090', 'Levi Plecitran', 'Lori Peckham'),
  ('LIV-092', 'Harold R. Nell', 'Frances M. Doss')
), copia as (
  insert into private.correcoes_dados (migracao, tabela, accao, linha)
  select '20261105064716', 'stock_books', 'alterada', jsonb_build_object('id', b.id, 'book_code', b.book_code, 'author', b.author)
  from public.stock_books b join mudar m on m.codigo = b.book_code and b.author = m.antes
  returning 1
)
update public.stock_books b
   set author = m.depois
  from mudar m
 where m.codigo = b.book_code and b.author = m.antes;
