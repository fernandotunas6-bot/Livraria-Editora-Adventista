-- Leituras públicas da comunidade e dos materiais por funções, em vez de vistas.
--
-- As vistas community_posts_public e downloads_public eram SECURITY DEFINER de propósito (os
-- visitantes lêem as publicações sem o user_id e os materiais sem o caminho do PDF), mas os
-- advisors do Supabase marcam-nas como ERROR (security_definer_view) e o painel do projecto
-- mostra-as como falha. As funções fazem a mesma projecção, com os filtros como parâmetros
-- (a base usa os índices; não se devolve a tabela toda para filtrar depois).
--
-- E o download passa a ter limite: 30 por hora por conta ou, sem sessão, por endereço IP.
-- Sem limite, o contador de downloads enchia-se chamando start_download à mão.

drop view if exists public.community_posts_public;
drop view if exists public.downloads_public;

-- ── Comunidade ──────────────────────────────────────────────────────────────

-- Publicações (sem as respostas), mais recentes primeiro. `p_before` é a data da última já mostrada.
create or replace function public.community_feed(p_book_id text default null, p_before timestamptz default null, p_limit int default 20)
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, created timestamptz, updated timestamptz, author_name text, mine boolean, book_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links, c.likes_count, c.created, c.updated,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title
  from public.community_posts c
  left join public.profiles p on p.id = c.user_id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where not c.hidden
    and c.parent_id is null
    and (p_book_id is null or c.book_id = p_book_id)
    and (p_before is null or c.created < p_before)
  order by c.created desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Respostas das publicações indicadas, da mais antiga para a mais recente.
create or replace function public.community_replies(p_parent_ids text[])
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, created timestamptz, updated timestamptz, author_name text, mine boolean, book_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links, c.likes_count, c.created, c.updated,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title
  from public.community_posts c
  left join public.profiles p on p.id = c.user_id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where not c.hidden
    and c.parent_id = any(coalesce(p_parent_ids[1:100], array[]::text[]))
  order by c.created asc
  limit 500;
$$;

-- Uma publicação (depois de a criar, para vir com o nome do autor).
create or replace function public.community_post(p_id text)
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, created timestamptz, updated timestamptz, author_name text, mine boolean, book_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links, c.likes_count, c.created, c.updated,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title
  from public.community_posts c
  left join public.profiles p on p.id = c.user_id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where not c.hidden and c.id = p_id;
$$;

revoke all on function public.community_feed(text, timestamptz, int) from public;
revoke all on function public.community_replies(text[]) from public;
revoke all on function public.community_post(text) from public;
grant execute on function public.community_feed(text, timestamptz, int) to anon, authenticated;
grant execute on function public.community_replies(text[]) to anon, authenticated;
grant execute on function public.community_post(text) to anon, authenticated;

-- ── Materiais ───────────────────────────────────────────────────────────────

-- Materiais publicados (com `p_book_id`, só os desse produto), sem o caminho do ficheiro.
-- `can_download` é de quem lê.
create or replace function public.downloads_list(p_book_id text default null)
returns table (
  id text, title text, description text, kind text, edition text, cover text, file_size bigint,
  access text, book_id text, variant int, sort_order int, download_count int, created timestamptz,
  updated timestamptz, book_title text, can_download boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.title, d.description, d.kind, d.edition, d.cover, d.file_size, d.access, d.book_id,
         d.variant, d.sort_order, d.download_count, d.created, d.updated, b.title,
         private.can_download(d.id)
  from public.downloads d
  left join public.stock_books b on b.id = d.book_id and coalesce(b.active, true)
  where d.published and d.file_path <> '' and (d.access = 'free' or b.id is not null)
    and (p_book_id is null or d.book_id = p_book_id)
  order by d.sort_order asc, d.created desc
  limit 300;
$$;

revoke all on function public.downloads_list(text) from public;
grant execute on function public.downloads_list(text) to anon, authenticated;

-- O endereço de quem pede, como o PostgREST o recebe (Cloudflare e proxies à frente).
create or replace function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1),
    h ->> 'x-real-ip',
    ''
  )), '')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) s;
$$;

revoke all on function private.request_ip() from public;

-- A mesma função da migração `materiais_para_descarregar`, com o limite antes de contar.
create or replace function public.start_download(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.downloads;
  v_client text := coalesce(auth.uid()::text, private.request_ip(), 'anonimo');
begin
  select * into v from public.downloads where id = p_id;
  if not found or (not v.published and not private.has_permission('manage_catalog')) or v.file_path = '' then
    raise exception 'Este material já não está disponível.';
  end if;
  if not private.can_download(p_id) then
    if auth.uid() is null then
      raise exception 'Entre na sua conta para descarregar o que comprou.';
    end if;
    raise exception 'Este PDF abre depois de a compra estar paga.';
  end if;
  if not private.check_rate_limit('download', v_client, 30, interval '1 hour') then
    raise exception 'Muitos downloads seguidos. Tente daqui a pouco.';
  end if;

  perform set_config('app.download_count', 'on', true);
  update public.downloads set download_count = download_count + 1 where id = p_id;
  perform set_config('app.download_count', 'off', true);

  return jsonb_build_object(
    'path', v.file_path,
    'file_name', coalesce(nullif(v.file_name, ''), 'material.pdf')
  );
end;
$$;

revoke all on function public.start_download(text) from public;
grant execute on function public.start_download(text) to anon, authenticated;
