-- Sugestões: a colecção também conta.
--
-- O `rankSuggestions` (emails e página /sugestoes) escolhia os livros só pelo **género**. As
-- colecções desta livraria são séries — Conflito dos Séculos, lições, devocionais de um ano —
-- e é o sinal mais forte que existe: quem leu o primeiro volume quer o segundo, e isso vale
-- mais do que "outro livro de saúde qualquer". O autor estava no catálogo mas também não era
-- usado.
--
-- Esta migração só acrescenta `collection_id` ao que a função devolve; o resto da definição é
-- igual à de `20261105065500_capas_certas_do_catalogo`. A Edge Function antiga ignora a
-- coluna nova, por isso a ordem de publicação não importa aqui.
--
-- **O `drop` antes do `create` não é opcional.** Acrescentar uma coluna ao `returns table`
-- muda o tipo de retorno da função, e o `create or replace` não o deixa mudar:
-- `cannot change return type of existing function (42P13)`, que recusa a migração inteira.
-- Só o `drop` o permite. Nada em SQL depende desta função (quem a chama é a Edge Function,
-- pela API), por isso o `drop` não arrasta mais nada; as permissões são repostas no fim,
-- como têm de ser, porque um `drop` leva as concessões com ele.
--
-- Reverter: `drop function public.suggestable_books();` e voltar a criá-la com a lista de
-- colunas da migração `20261105065500_capas_certas_do_catalogo.sql`, repondo depois o
-- `revoke`/`grant` do fim deste ficheiro.

drop function if exists public.suggestable_books();

create function public.suggestable_books()
returns table (
  id text, title text, author text, genre text, collection_id text,
  price double precision, sale_price double precision,
  sale_starts_at timestamptz, sale_ends_at timestamptz, cover text, cover_image text,
  featured boolean, created timestamptz, stock double precision, cover_bytes integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.title, b.author, b.genre, b.collection_id,
         b.price, b.sale_price, b.sale_starts_at, b.sale_ends_at,
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
