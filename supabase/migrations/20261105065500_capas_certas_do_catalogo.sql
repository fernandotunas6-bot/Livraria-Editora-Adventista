-- Capas certas para os 102 livros do catálogo (2026-11-05). Cada livro passa a apontar para a
-- sua capa em https://livrariaadventista.com/images/capas/<código>.jpg (app/web/public/images/capas).
--
-- O que estava mal, conferido à vista capa a capa:
--  - 4 livros tinham a capa certa (LIV-001, LIV-013, LIV-014, LIV-023);
--  - 50 mostravam a capa de outro livro (a imagem de cada um estava, quase sempre, no livro
--    seguinte — por exemplo, "Nisto Cremos" mostrava "Medicina Alternativa");
--  - 48 tinham uma imagem em branco.
-- Origem das capas: 54 das imagens já publicadas (postas no livro certo), 7 da pasta covers_clean
-- que nunca tinham sido usadas, e 41 da loja da Casa Publicadora Brasileira (a editora).
--
-- `cover_image` fica vazio: o site usa `cover`, mas a função do assistente preferia o ficheiro.
-- Os ficheiros antigos no Storage ficam (não se apaga nada); deixam só de ser usados.
--
-- Duas gralhas nos títulos, que as próprias capas mostram:
--  - LIV-031 "Odna das Alianças"  → "O DNA das Alianças"
--  - LIV-059 "Nem Cairão ao Teu Lado" → "Mil Cairão ao Teu Lado"
--
-- Guarda antes o valor antigo em private.correcoes_dados. Pode correr-se mais de uma vez: só toca
-- nos livros que ainda não estão como deve ser. Reverter: repor `cover`, `cover_image` e `title`
-- a partir de private.correcoes_dados where migracao = '20261105065500'.

insert into private.correcoes_dados (migracao, tabela, accao, linha)
select '20261105065500', 'stock_books', 'alterada',
       jsonb_build_object('id', id, 'book_code', book_code, 'title', title, 'cover', cover, 'cover_image', cover_image)
from public.stock_books
where book_code in (
  'COL-001', 'COL-002', 'LIV-001', 'LIV-002', 'LIV-003', 'LIV-004', 'LIV-005', 'LIV-006',
  'LIV-007', 'LIV-008', 'LIV-009', 'LIV-010', 'LIV-011', 'LIV-012', 'LIV-013', 'LIV-014',
  'LIV-015', 'LIV-016', 'LIV-017', 'LIV-018', 'LIV-019', 'LIV-020', 'LIV-021', 'LIV-022',
  'LIV-023', 'LIV-024', 'LIV-025', 'LIV-026', 'LIV-027', 'LIV-028', 'LIV-029', 'LIV-030',
  'LIV-031', 'LIV-032', 'LIV-033', 'LIV-034', 'LIV-035', 'LIV-036', 'LIV-037', 'LIV-038',
  'LIV-039', 'LIV-040', 'LIV-041', 'LIV-042', 'LIV-043', 'LIV-044', 'LIV-045', 'LIV-046',
  'LIV-047', 'LIV-048', 'LIV-049', 'LIV-050', 'LIV-051', 'LIV-052', 'LIV-053', 'LIV-054',
  'LIV-055', 'LIV-056', 'LIV-057', 'LIV-058', 'LIV-059', 'LIV-060', 'LIV-061', 'LIV-062',
  'LIV-063', 'LIV-064', 'LIV-065', 'LIV-066', 'LIV-067', 'LIV-068', 'LIV-069', 'LIV-070',
  'LIV-071', 'LIV-072', 'LIV-073', 'LIV-074', 'LIV-075', 'LIV-076', 'LIV-077', 'LIV-078',
  'LIV-079', 'LIV-080', 'LIV-081', 'LIV-082', 'LIV-083', 'LIV-084', 'LIV-085', 'LIV-086',
  'LIV-087', 'LIV-088', 'LIV-089', 'LIV-090', 'LIV-091', 'LIV-092', 'LIV-093', 'LIV-094',
  'LIV-095', 'LIV-096', 'LIV-097', 'LIV-098', 'LIV-099', 'LIV-100'
)
  and (cover is distinct from 'https://livrariaadventista.com/images/capas/' || book_code || '.jpg'
       or coalesce(cover_image, '') <> ''
       or (book_code = 'LIV-031' and title like 'Odna das Alianças%')
       or (book_code = 'LIV-059' and title = 'Nem Cairão ao Teu Lado'));

update public.stock_books
   set cover = 'https://livrariaadventista.com/images/capas/' || book_code || '.jpg',
       cover_image = ''
 where book_code in (
  'COL-001', 'COL-002', 'LIV-001', 'LIV-002', 'LIV-003', 'LIV-004', 'LIV-005', 'LIV-006',
  'LIV-007', 'LIV-008', 'LIV-009', 'LIV-010', 'LIV-011', 'LIV-012', 'LIV-013', 'LIV-014',
  'LIV-015', 'LIV-016', 'LIV-017', 'LIV-018', 'LIV-019', 'LIV-020', 'LIV-021', 'LIV-022',
  'LIV-023', 'LIV-024', 'LIV-025', 'LIV-026', 'LIV-027', 'LIV-028', 'LIV-029', 'LIV-030',
  'LIV-031', 'LIV-032', 'LIV-033', 'LIV-034', 'LIV-035', 'LIV-036', 'LIV-037', 'LIV-038',
  'LIV-039', 'LIV-040', 'LIV-041', 'LIV-042', 'LIV-043', 'LIV-044', 'LIV-045', 'LIV-046',
  'LIV-047', 'LIV-048', 'LIV-049', 'LIV-050', 'LIV-051', 'LIV-052', 'LIV-053', 'LIV-054',
  'LIV-055', 'LIV-056', 'LIV-057', 'LIV-058', 'LIV-059', 'LIV-060', 'LIV-061', 'LIV-062',
  'LIV-063', 'LIV-064', 'LIV-065', 'LIV-066', 'LIV-067', 'LIV-068', 'LIV-069', 'LIV-070',
  'LIV-071', 'LIV-072', 'LIV-073', 'LIV-074', 'LIV-075', 'LIV-076', 'LIV-077', 'LIV-078',
  'LIV-079', 'LIV-080', 'LIV-081', 'LIV-082', 'LIV-083', 'LIV-084', 'LIV-085', 'LIV-086',
  'LIV-087', 'LIV-088', 'LIV-089', 'LIV-090', 'LIV-091', 'LIV-092', 'LIV-093', 'LIV-094',
  'LIV-095', 'LIV-096', 'LIV-097', 'LIV-098', 'LIV-099', 'LIV-100'
)
   and (cover is distinct from 'https://livrariaadventista.com/images/capas/' || book_code || '.jpg'
        or coalesce(cover_image, '') <> '');

update public.stock_books
   set title = 'O DNA das Alianças' || substr(title, length('Odna das Alianças') + 1)
 where book_code = 'LIV-031' and title like 'Odna das Alianças%';

update public.stock_books
   set title = 'Mil Cairão ao Teu Lado'
 where book_code = 'LIV-059' and title = 'Nem Cairão ao Teu Lado';

-- As sugestões medem a capa pelo ficheiro no Storage (`cover_image`). Com `cover_image` vazio,
-- `cover_bytes` vinha 0 para todos os livros e a Edge Function tratava-os a todos como "sem capa".
-- Sem ficheiro no Storage, `cover_bytes` passa a null: "sem informação", que conta como capa boa.
create or replace function public.suggestable_books()
returns table (
  id text, title text, author text, genre text, price double precision, sale_price double precision,
  sale_starts_at timestamptz, sale_ends_at timestamptz, cover text, cover_image text,
  featured boolean, created timestamptz, stock double precision, cover_bytes integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.title, b.author, b.genre, b.price, b.sale_price, b.sale_starts_at, b.sale_ends_at,
         b.cover, b.cover_image, b.featured, b.created, b.stock,
         case when coalesce(b.cover_image, '') = '' then null
              else coalesce((o.metadata->>'size')::integer, 0) end as cover_bytes
  from public.stock_books b
  left join storage.objects o
    on o.bucket_id = 'media' and o.name = 'stock_books/' || b.id || '/' || b.cover_image
  where b.active and b.stock > 0;
$$;

revoke all on function public.suggestable_books() from public, anon, authenticated;
grant execute on function public.suggestable_books() to service_role;
