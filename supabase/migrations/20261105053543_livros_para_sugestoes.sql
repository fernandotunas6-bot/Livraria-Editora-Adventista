-- Livros que se podem sugerir (visíveis, com stock), com o tamanho do ficheiro da capa.
-- Uma capa com poucos KB é uma imagem vazia: as sugestões preferem os livros com capa a sério.
-- Só a service role (Edge Function) a chama.
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
         coalesce((o.metadata->>'size')::integer, 0) as cover_bytes
  from public.stock_books b
  left join storage.objects o
    on o.bucket_id = 'media' and o.name = 'stock_books/' || b.id || '/' || b.cover_image
  where b.active and b.stock > 0;
$$;

revoke all on function public.suggestable_books() from public, anon, authenticated;
grant execute on function public.suggestable_books() to service_role;
