-- Comunidade: o feed pede só as respostas que mostra.
--
-- `community_list_replies` devolvia todas as respostas de cada publicação da página (até 500),
-- e cada cartão do feed só mostra a oficial e as duas mais recentes; o resto é "Ver todas as
-- N respostas", que abre a conversa. Em telemóvel, com dados pagos ao MB, era o pedido mais
-- pesado da página.
--
-- Novo parâmetro opcional `p_per_parent`: por publicação, as respostas oficiais e as
-- `p_per_parent` mais recentes das outras. Sem ele (site anterior a esta versão, durante a
-- publicação), o comportamento é o de antes. A ordem continua: por publicação, a oficial
-- primeiro e depois por data.
--
-- A assinatura muda, por isso a função antiga sai primeiro: com as duas, o PostgREST não
-- saberia qual chamar quando só vem `p_parent_ids`.

drop function if exists public.community_list_replies(text[]);

create function public.community_list_replies(p_parent_ids text[], p_per_parent integer default null)
returns table(
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count integer, replies_count integer, created timestamp with time zone, updated timestamp with time zone,
  last_activity_at timestamp with time zone, topic text, kind text, pinned boolean, is_official boolean,
  author_name text, author_key text, author_is_staff boolean, mine boolean,
  book_title text, book_author text, book_cover text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.parent_id, r.book_id, r.body, r.quote, r.quote_page, r.links,
         r.likes_count, r.replies_count, r.created, r.updated, r.last_activity_at,
         r.topic, r.kind, false, r.is_official,
         r.author_name, r.author_key, r.author_is_staff, r.mine,
         null::text, null::text, null::text
  from (
    select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links,
           c.likes_count, c.replies_count, c.created, c.updated, coalesce(c.last_activity_at, c.created) as last_activity_at,
           c.topic, c.kind, c.is_official,
           left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100) as author_name, p.reader_key as author_key,
           coalesce(p.role in ('admin', 'manager'), false) as author_is_staff,
           coalesce(c.user_id = (select auth.uid()), false) as mine,
           row_number() over (partition by c.parent_id, c.is_official order by c.created desc) as recent
    from public.community_posts c
    left join public.profiles p on p.id = c.user_id
    where not c.hidden
      and c.parent_id = any(coalesce(p_parent_ids[1:100], array[]::text[]))
  ) r
  where p_per_parent is null or r.is_official or r.recent <= greatest(p_per_parent, 0)
  order by r.parent_id, r.is_official desc, r.created asc
  limit 500;
$$;

revoke all on function public.community_list_replies(text[], integer) from public;
grant execute on function public.community_list_replies(text[], integer) to anon, authenticated, service_role;

comment on function public.community_list_replies(text[], integer) is
  'Respostas visíveis das publicações indicadas; com p_per_parent, só as oficiais e as N mais recentes de cada uma.';
