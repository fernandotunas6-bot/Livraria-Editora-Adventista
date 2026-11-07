-- Comunidade literária premium (pedido do dono, 2026-11-07).
--
--   1. Temas (definidos pela equipa) e tipo de publicação (discussão, pergunta, citação,
--      recomendação), para filtrar e ordenar: Recentes, Em alta, Sem resposta.
--   2. A equipa fixa publicações no topo e marca respostas oficiais. Publica-se logo, como até
--      aqui, com as denúncias e as regras de links da migração `comunidade_links_seguros`.
--   3. Perfil público de leitor por uma chave aleatória (`profiles.reader_key`), nunca pelo
--      user_id: nome, data de entrada e actividade, sem email, telefone nem foto (o endereço da
--      foto tem o id da conta; os cartões mostram monogramas).
--   4. Clube do livro do mês, escolhido pela equipa.
--   5. Avisos ao autor quando alguém responde ou gosta (customer_notifications, tipo
--      `community`), agrupados e com interruptor no perfil (`profiles.community_notify`). O
--      envio por push é da Edge Function, como os avisos do atendimento.
--
-- As leituras públicas são funções novas (community_list, community_thread, community_reader,
-- community_reader_posts, community_sidebar, community_current_club). As da migração
-- `leituras_publicas_por_funcoes` ficam, para o site antigo não partir enquanto o novo é
-- publicado; saem numa migração de limpeza.

-- ── 1. Temas ────────────────────────────────────────────────────────────────

create table if not exists public.community_topics (
  slug text primary key,
  name text not null,
  description text not null default '',
  icon text not null default 'book-open',
  sort_order int not null default 0,
  active boolean not null default true,
  created timestamptz not null default now(),
  constraint community_topics_slug check (char_length(slug) <= 40 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_topics_name check (char_length(btrim(name)) between 2 and 60),
  constraint community_topics_description check (char_length(description) <= 200),
  constraint community_topics_icon check (icon ~ '^[a-z0-9-]{1,40}$')
);

alter table public.community_topics enable row level security;

drop policy if exists "community_topics: todos lêem os activos" on public.community_topics;
create policy "community_topics: todos lêem os activos" on public.community_topics
  for select to anon, authenticated using (active or (select private.has_permission('manage_catalog')));
drop policy if exists "community_topics: a equipa cria" on public.community_topics;
create policy "community_topics: a equipa cria" on public.community_topics
  for insert to authenticated with check ((select private.has_permission('manage_catalog')));
drop policy if exists "community_topics: a equipa edita" on public.community_topics;
create policy "community_topics: a equipa edita" on public.community_topics
  for update to authenticated using ((select private.has_permission('manage_catalog')))
  with check ((select private.has_permission('manage_catalog')));
drop policy if exists "community_topics: a equipa apaga" on public.community_topics;
create policy "community_topics: a equipa apaga" on public.community_topics
  for delete to authenticated using ((select private.has_permission('manage_catalog')));

revoke all on public.community_topics from anon, authenticated;
grant select on public.community_topics to anon, authenticated;
grant insert, update, delete on public.community_topics to authenticated;

insert into public.community_topics (slug, name, description, icon, sort_order) values
  ('leituras', 'Leituras', 'O que está a ler, o que recomenda, o que o marcou.', 'book-open', 10),
  ('estudo-biblico', 'Estudo bíblico', 'Textos, temas e perguntas sobre a Bíblia.', 'scroll-text', 20),
  ('licao-escola-sabatina', 'Lição da Escola Sabatina', 'A lição da semana, em conversa.', 'calendar-days', 30),
  ('familia', 'Família', 'Casamento, filhos, lar e educação.', 'users', 40),
  ('saude', 'Saúde', 'Hábitos, alimentação e bem-estar.', 'heart-pulse', 50),
  ('profecia', 'Profecia', 'Daniel, Apocalipse e a esperança.', 'sunrise', 60),
  ('jovens', 'Jovens', 'Fé, escolhas e desafios de quem está a crescer.', 'sparkles', 70),
  ('testemunhos', 'Testemunhos', 'O que Deus fez, contado por quem viveu.', 'hand-heart', 80)
on conflict (slug) do nothing;

-- ── 2. Publicações: tema, tipo, contadores, fixar e resposta oficial ──────

alter table public.community_posts
  add column if not exists topic text references public.community_topics (slug) on update cascade on delete set null,
  add column if not exists kind text,
  add column if not exists replies_count int not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists is_official boolean not null default false;

alter table public.community_posts drop constraint if exists community_posts_kind;
alter table public.community_posts add constraint community_posts_kind
  check (kind is null or kind in ('discussao', 'pergunta', 'citacao', 'recomendacao'));

create index if not exists community_posts_topic_idx on public.community_posts (topic, created desc) where parent_id is null;
create index if not exists community_posts_kind_idx on public.community_posts (kind, created desc) where parent_id is null;
create index if not exists community_posts_activity_idx on public.community_posts (last_activity_at desc) where parent_id is null;
create index if not exists community_posts_pinned_idx on public.community_posts (pinned_at) where pinned_at is not null;

-- Publicações que já existem: tipo "discussão", actividade = criação, contagem das respostas.
alter table public.community_posts disable trigger community_posts_before_save;
update public.community_posts c set
  kind = case when c.parent_id is null then coalesce(c.kind, 'discussao') end,
  last_activity_at = coalesce(
    (select max(r.created) from public.community_posts r where r.parent_id = c.id and not r.hidden), c.created),
  replies_count = (select count(*) from public.community_posts r where r.parent_id = c.id and not r.hidden);
alter table public.community_posts enable trigger community_posts_before_save;

-- A gravação: a mesma da migração `comunidade_links_seguros` (dono, datas, texto, resposta a
-- uma publicação, links), mais o tema, o tipo e os campos que só a equipa e os triggers mudam.
create or replace function public.community_posts_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.community_posts;
  v_link jsonb;
  v_url text;
  v_problem text;
  v_count int := 0;
  v_staff boolean := private.is_staff();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
    new.created := now();
    new.likes_count := 0;
    new.reports_count := 0;
    new.replies_count := 0;
    new.hidden := false;
    new.moderation_note := '';
    new.last_activity_at := now();
    if not v_staff then
      new.pinned_at := null;
      new.is_official := false;
    end if;
    if auth.uid() is not null
       and not private.check_rate_limit('comunidade', auth.uid()::text, 10, interval '1 hour') then
      raise exception 'Muitas publicações seguidas. Tente daqui a pouco.';
    end if;
  else
    new.user_id := old.user_id;
    new.parent_id := old.parent_id;
    new.created := old.created;
    -- Contadores, actividade, ocultação, nota, fixar e oficial: só pelos triggers
    -- (profundidade > 1) ou pela equipa.
    if pg_trigger_depth() <= 1 then
      new.likes_count := old.likes_count;
      new.reports_count := old.reports_count;
      new.replies_count := old.replies_count;
      new.last_activity_at := old.last_activity_at;
      if not v_staff then
        new.hidden := old.hidden;
        new.moderation_note := old.moderation_note;
        new.pinned_at := old.pinned_at;
        new.is_official := old.is_official;
      end if;
    end if;
  end if;

  new.body := btrim(regexp_replace(coalesce(new.body, ''), E'\\n{3,}', E'\n\n', 'g'));
  new.quote := btrim(coalesce(new.quote, ''));
  new.quote_page := btrim(coalesce(new.quote_page, ''));
  new.moderation_note := left(coalesce(new.moderation_note, ''), 200);

  if new.parent_id is not null then
    select * into v_parent from public.community_posts where id = new.parent_id;
    if not found then raise exception 'A publicação que quer responder já não existe.'; end if;
    if v_parent.parent_id is not null then raise exception 'Só se responde a uma publicação, não a uma resposta.'; end if;
    -- A resposta segue o tema da publicação; não tem tipo nem se fixa.
    new.topic := v_parent.topic;
    new.kind := null;
    new.pinned_at := null;
  else
    new.kind := coalesce(nullif(btrim(coalesce(new.kind, '')), ''), 'discussao');
    if new.kind not in ('discussao', 'pergunta', 'citacao', 'recomendacao') then
      raise exception 'Tipo de publicação inválido.';
    end if;
    new.topic := nullif(btrim(coalesce(new.topic, '')), '');
    if new.topic is not null
       and (tg_op = 'INSERT' or new.topic is distinct from old.topic)
       and not exists (select 1 from public.community_topics t where t.slug = new.topic and t.active) then
      raise exception 'Escolha um tema da lista.';
    end if;
    -- Resposta oficial é de respostas, não de publicações.
    new.is_official := false;
  end if;

  if new.links is null or jsonb_typeof(new.links) <> 'array' then new.links := '[]'::jsonb; end if;

  if tg_op = 'INSERT'
     or new.body is distinct from old.body
     or new.quote is distinct from old.quote
     or new.links is distinct from old.links
     or (old.hidden and not new.hidden) then
    for v_link in select * from jsonb_array_elements(new.links) loop
      if jsonb_typeof(v_link) <> 'string' then
        raise exception 'Link inválido: só endereços http ou https.';
      end if;
    end loop;
    for v_url in select * from private.community_post_urls(new.links, new.body, new.quote) loop
      v_count := v_count + 1;
      v_problem := private.community_link_problem(v_url);
      if v_problem is not null then raise exception '%', v_problem; end if;
    end loop;
    if v_count > 5 then raise exception 'No máximo 5 links por publicação.'; end if;
  end if;

  new.updated := now();
  return new;
end;
$$;

revoke all on function public.community_posts_before_save() from public, anon, authenticated;

-- Respostas visíveis contadas na publicação, e a última actividade (para "Em alta" e
-- "Sem resposta"). Corre depois de cada resposta criada, apagada, oculta ou mostrada.
create or replace function private.community_replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent text := coalesce(new.parent_id, old.parent_id);
begin
  if v_parent is null then return null; end if;
  update public.community_posts p
  set replies_count = s.n,
      last_activity_at = greatest(p.created, coalesce(s.last, p.created))
  from (
    select count(*)::int as n, max(r.created) as last
    from public.community_posts r
    where r.parent_id = v_parent and not r.hidden
  ) s
  where p.id = v_parent;
  return null;
end;
$$;

drop trigger if exists community_posts_replies_count on public.community_posts;
create trigger community_posts_replies_count
  after insert or delete or update of hidden on public.community_posts
  for each row execute function private.community_replies_after_change();

revoke all on function private.community_replies_after_change() from public, anon, authenticated;

-- ── 3. Leitor: chave pública e avisos ───────────────────────────────────────

alter table public.profiles
  add column if not exists reader_key text,
  add column if not exists community_notify boolean not null default true;

update public.profiles set reader_key = public.gen_record_id() where reader_key is null;
alter table public.profiles alter column reader_key set default public.gen_record_id();
alter table public.profiles alter column reader_key set not null;
create unique index if not exists profiles_reader_key_key on public.profiles (reader_key);

-- A chave não se escolhe: quem edita o próprio perfil não a muda.
create or replace function private.profiles_keep_reader_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.reader_key is distinct from old.reader_key then
    new.reader_key := old.reader_key;
  end if;
  if new.reader_key is null or new.reader_key = '' then
    new.reader_key := public.gen_record_id();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_reader_key on public.profiles;
create trigger profiles_keep_reader_key
  before insert or update on public.profiles
  for each row execute function private.profiles_keep_reader_key();

revoke all on function private.profiles_keep_reader_key() from public, anon, authenticated;

-- ── 4. Clube do livro do mês ────────────────────────────────────────────────

create table if not exists public.community_book_clubs (
  id text primary key default public.gen_record_id(),
  book_id text not null references public.stock_books (id) on delete cascade,
  month date not null,
  title text not null default '',
  intro text not null default '',
  active boolean not null default true,
  created timestamptz not null default now(),
  constraint community_book_clubs_month check (month = date_trunc('month', month)::date),
  constraint community_book_clubs_title check (char_length(title) <= 120),
  constraint community_book_clubs_intro check (char_length(intro) <= 1000)
);
create unique index if not exists community_book_clubs_month_key on public.community_book_clubs (month);
create index if not exists community_book_clubs_book_idx on public.community_book_clubs (book_id);

alter table public.community_book_clubs enable row level security;

drop policy if exists "community_book_clubs: todos lêem os activos" on public.community_book_clubs;
create policy "community_book_clubs: todos lêem os activos" on public.community_book_clubs
  for select to anon, authenticated using (active or (select private.has_permission('manage_catalog')));
drop policy if exists "community_book_clubs: a equipa cria" on public.community_book_clubs;
create policy "community_book_clubs: a equipa cria" on public.community_book_clubs
  for insert to authenticated with check ((select private.has_permission('manage_catalog')));
drop policy if exists "community_book_clubs: a equipa edita" on public.community_book_clubs;
create policy "community_book_clubs: a equipa edita" on public.community_book_clubs
  for update to authenticated using ((select private.has_permission('manage_catalog')))
  with check ((select private.has_permission('manage_catalog')));
drop policy if exists "community_book_clubs: a equipa apaga" on public.community_book_clubs;
create policy "community_book_clubs: a equipa apaga" on public.community_book_clubs
  for delete to authenticated using ((select private.has_permission('manage_catalog')));

revoke all on public.community_book_clubs from anon, authenticated;
grant select on public.community_book_clubs to anon, authenticated;
grant insert, update, delete on public.community_book_clubs to authenticated;

-- O clube deste mês (hora de Luanda), com o livro e quantas publicações já tem.
create or replace function public.community_current_club()
returns table (
  id text, book_id text, month date, title text, intro text,
  book_title text, book_author text, book_cover text, posts_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.book_id, k.month, k.title, k.intro, b.title, coalesce(b.author, ''), coalesce(b.cover, ''),
         (select count(*)::int from public.community_posts c
          where c.book_id = k.book_id and c.parent_id is null and not c.hidden
            and c.created >= k.month::timestamp at time zone 'Africa/Luanda')
  from public.community_book_clubs k
  join public.stock_books b on b.id = k.book_id and coalesce(b.active, true)
  where k.active and k.month = date_trunc('month', now() at time zone 'Africa/Luanda')::date
  limit 1;
$$;

-- ── 5. Avisos ao autor ──────────────────────────────────────────────────────

alter table public.customer_notifications drop constraint if exists customer_notifications_kind_check;
alter table public.customer_notifications add constraint customer_notifications_kind_check
  check (kind in ('order', 'payment', 'delivery', 'support', 'community'));
create index if not exists customer_notifications_community_dispatch_idx
  on public.customer_notifications (created_at) where dispatched_at is null and kind = 'community';
create index if not exists customer_notifications_unread_idx
  on public.customer_notifications (customer_id, created_at desc) where read_at is null;

-- Nome curto de quem fez a acção, para o texto do aviso.
create or replace function private.community_actor_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select left(nullif(btrim(p.name), ''), 60) from public.profiles p where p.id = p_user), 'Um leitor');
$$;

-- Resposta: avisa o autor da publicação (nunca quem responde a si mesmo). Resposta marcada
-- oficial: avisa o autor da pergunta.
create or replace function private.community_notify_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.community_posts;
begin
  if new.parent_id is null then return null; end if;
  select * into v_parent from public.community_posts where id = new.parent_id;
  if not found or v_parent.user_id = new.user_id then return null; end if;
  if not coalesce((select p.community_notify from public.profiles p where p.id = v_parent.user_id), true) then
    return null;
  end if;

  if tg_op = 'INSERT' and not new.hidden then
    insert into public.customer_notifications (customer_id, kind, title, body, href)
    values (
      v_parent.user_id, 'community', 'Nova resposta à sua publicação',
      left(private.community_actor_name(new.user_id) || ': ' || new.body, 300),
      '/comunidade/p/' || new.parent_id
    );
  elsif tg_op = 'UPDATE' and new.is_official and not old.is_official then
    insert into public.customer_notifications (customer_id, kind, title, body, href)
    values (
      v_parent.user_id, 'community', 'A sua publicação tem uma resposta oficial',
      left('A equipa da livraria destacou uma resposta: ' || new.body, 300),
      '/comunidade/p/' || new.parent_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists community_posts_notify_reply on public.community_posts;
create trigger community_posts_notify_reply
  after insert or update of is_official on public.community_posts
  for each row execute function private.community_notify_reply();

-- Gostos: um aviso por publicação a cada 6 horas, actualizado com quem mais gostou. Retirar o
-- gosto antes do envio retira o aviso, se mais ninguém tiver gostado entretanto.
create or replace function private.community_notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.community_posts;
  v_href text;
  v_notice public.customer_notifications;
  v_others int;
  v_snippet text;
begin
  select * into v_post from public.community_posts where id = coalesce(new.post_id, old.post_id);
  if not found then return null; end if;
  v_href := '/comunidade/p/' || coalesce(v_post.parent_id, v_post.id);

  if tg_op = 'DELETE' then
    if old.user_id <> v_post.user_id and not exists (
      select 1 from public.community_likes l where l.post_id = v_post.id and l.user_id <> v_post.user_id
    ) then
      delete from public.customer_notifications n
      where n.customer_id = v_post.user_id and n.kind = 'community' and n.href = v_href
        and n.title = 'Gostaram da sua publicação' and n.dispatched_at is null and n.read_at is null;
    end if;
    return null;
  end if;

  if new.user_id = v_post.user_id then return null; end if;
  if not coalesce((select p.community_notify from public.profiles p where p.id = v_post.user_id), true) then
    return null;
  end if;

  v_snippet := left(regexp_replace(v_post.body, '\s+', ' ', 'g'), 80);
  select * into v_notice from public.customer_notifications n
  where n.customer_id = v_post.user_id and n.kind = 'community' and n.href = v_href
    and n.title = 'Gostaram da sua publicação' and n.read_at is null
    and n.created_at > now() - interval '6 hours'
  order by n.created_at desc limit 1;

  if found then
    select count(*)::int - 1 into v_others from public.community_likes l
    where l.post_id = v_post.id and l.created >= v_notice.created_at - interval '1 second' and l.user_id <> v_post.user_id;
    update public.customer_notifications
    set body = left(private.community_actor_name(new.user_id)
                    || case when v_others > 0
                         then ' e mais ' || v_others || case when v_others = 1 then ' pessoa' else ' pessoas' end || ' gostaram de «'
                         else ' gostou de «' end
                    || v_snippet || '»', 300)
    where id = v_notice.id;
  else
    insert into public.customer_notifications (customer_id, kind, title, body, href)
    values (
      v_post.user_id, 'community', 'Gostaram da sua publicação',
      left(private.community_actor_name(new.user_id) || ' gostou de «' || v_snippet || '»', 300),
      v_href
    );
  end if;
  return null;
end;
$$;

drop trigger if exists community_likes_notify on public.community_likes;
create trigger community_likes_notify
  after insert or delete on public.community_likes
  for each row execute function private.community_notify_like();

revoke all on function private.community_actor_name(uuid) from public, anon, authenticated;
revoke all on function private.community_notify_reply() from public, anon, authenticated;
revoke all on function private.community_notify_like() from public, anon, authenticated;

-- Marcar todos os avisos do próprio como lidos (o sino do cabeçalho).
create or replace function public.customer_mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if auth.uid() is null then raise exception 'Sessão obrigatória.'; end if;
  update public.customer_notifications set read_at = now()
  where customer_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.customer_mark_all_notifications_read() from public, anon;
grant execute on function public.customer_mark_all_notifications_read() to authenticated;

-- ── 6. Leituras públicas ────────────────────────────────────────────────────
-- Nenhuma devolve user_id nem email. `author_key` é a chave pública do leitor.

-- Publicações (sem as respostas). Ordem: recentes (fixadas primeiro na primeira página),
-- em_alta (gostos e respostas com o tempo a pesar, últimos 30 dias) ou sem_resposta.
create or replace function public.community_list(
  p_topic text default null,
  p_kind text default null,
  p_sort text default 'recentes',
  p_book_id text default null,
  p_query text default null,
  p_before timestamptz default null,
  p_offset int default 0,
  p_limit int default 20
)
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, replies_count int, created timestamptz, updated timestamptz, last_activity_at timestamptz,
  topic text, kind text, pinned boolean, is_official boolean,
  author_name text, author_key text, author_is_staff boolean, mine boolean,
  book_title text, book_author text, book_cover text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sort text := case when p_sort in ('recentes', 'em_alta', 'sem_resposta') then p_sort else 'recentes' end;
  v_query text := nullif(btrim(left(coalesce(p_query, ''), 80)), '');
  v_pat text;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 1000);
  v_first boolean := p_before is null and coalesce(p_offset, 0) = 0;
begin
  if v_query is not null then
    v_pat := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links,
         c.likes_count, c.replies_count, c.created, c.updated, coalesce(c.last_activity_at, c.created),
         c.topic, c.kind, c.pinned_at is not null, c.is_official,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100), p.reader_key,
         coalesce(p.role in ('admin', 'manager'), false),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title, b.author, b.cover
  from public.community_posts c
  left join public.profiles p on p.id = c.user_id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where not c.hidden
    and c.parent_id is null
    and (p_topic is null or c.topic = p_topic)
    and (p_kind is null or c.kind = p_kind)
    and (p_book_id is null or c.book_id = p_book_id)
    and (v_pat is null or c.body ilike v_pat or c.quote ilike v_pat or coalesce(b.title, '') ilike v_pat)
    and (v_sort <> 'sem_resposta' or c.replies_count = 0)
    and (v_sort <> 'em_alta' or c.created > now() - interval '30 days')
    and (v_sort <> 'recentes' or p_before is null or c.created < p_before)
  order by
    case when v_sort = 'recentes' and v_first and c.pinned_at is not null then 0 else 1 end,
    case when v_sort = 'recentes' and v_first then c.pinned_at end desc nulls last,
    case when v_sort = 'em_alta'
      then (c.likes_count + 2 * c.replies_count + 1)::numeric
           / power((extract(epoch from (now() - c.created)) / 3600.0 + 2)::numeric, 1.5)
    end desc nulls last,
    c.created desc
  limit v_limit
  offset case when v_sort = 'recentes' then 0 else v_offset end;
end;
$$;

-- Uma publicação com as respostas (a oficial primeiro). Um id de resposta abre a publicação dela.
create or replace function public.community_thread(p_id text)
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, replies_count int, created timestamptz, updated timestamptz, last_activity_at timestamptz,
  topic text, kind text, pinned boolean, is_official boolean,
  author_name text, author_key text, author_is_staff boolean, mine boolean,
  book_title text, book_author text, book_cover text
)
language sql
stable
security definer
set search_path = ''
as $$
  -- A publicação principal tem de estar visível: oculta, não se mostram as respostas.
  with root as (
    select r.id
    from public.community_posts x
    join public.community_posts r on r.id = coalesce(x.parent_id, x.id)
    where x.id = p_id and not r.hidden
  )
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links,
         c.likes_count, c.replies_count, c.created, c.updated, coalesce(c.last_activity_at, c.created),
         c.topic, c.kind, c.pinned_at is not null, c.is_official,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100), p.reader_key,
         coalesce(p.role in ('admin', 'manager'), false),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title, b.author, b.cover
  from public.community_posts c
  join root on c.id = root.id or c.parent_id = root.id
  left join public.profiles p on p.id = c.user_id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where not c.hidden
    and (c.parent_id is not null or c.id = root.id)
  order by (c.parent_id is not null), c.is_official desc, c.created asc
  limit 501;
$$;

-- Respostas de várias publicações (para os cartões do feed), a oficial primeiro em cada uma.
create or replace function public.community_list_replies(p_parent_ids text[])
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, replies_count int, created timestamptz, updated timestamptz, last_activity_at timestamptz,
  topic text, kind text, pinned boolean, is_official boolean,
  author_name text, author_key text, author_is_staff boolean, mine boolean,
  book_title text, book_author text, book_cover text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links,
         c.likes_count, c.replies_count, c.created, c.updated, coalesce(c.last_activity_at, c.created),
         c.topic, c.kind, false, c.is_official,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100), p.reader_key,
         coalesce(p.role in ('admin', 'manager'), false),
         coalesce(c.user_id = (select auth.uid()), false),
         null::text, null::text, null::text
  from public.community_posts c
  left join public.profiles p on p.id = c.user_id
  where not c.hidden
    and c.parent_id = any(coalesce(p_parent_ids[1:100], array[]::text[]))
  order by c.parent_id, c.is_official desc, c.created asc
  limit 500;
$$;

-- Perfil público de um leitor: nome, desde quando, actividade e selos. Sem email nem fotografia.
create or replace function public.community_reader(p_key text)
returns table (
  author_key text, author_name text, since timestamptz, is_staff boolean, is_founder boolean,
  posts_count int, replies_count int, likes_received int, books_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.reader_key, left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100), p.created,
         coalesce(p.role in ('admin', 'manager'), false),
         -- Membro fundador: publicou nos três primeiros meses da comunidade.
         exists (select 1 from public.community_posts f where f.user_id = p.id and f.created < '2027-02-01'),
         (select count(*)::int from public.community_posts c where c.user_id = p.id and c.parent_id is null and not c.hidden),
         (select count(*)::int from public.community_posts c where c.user_id = p.id and c.parent_id is not null and not c.hidden),
         (select coalesce(sum(c.likes_count), 0)::int from public.community_posts c where c.user_id = p.id and not c.hidden),
         (select count(distinct c.book_id)::int from public.community_posts c where c.user_id = p.id and c.book_id is not null and not c.hidden)
  from public.profiles p
  where p.reader_key = p_key;
$$;

create or replace function public.community_reader_posts(p_key text, p_before timestamptz default null, p_limit int default 20)
returns table (
  id text, parent_id text, book_id text, body text, quote text, quote_page text, links jsonb,
  likes_count int, replies_count int, created timestamptz, updated timestamptz, last_activity_at timestamptz,
  topic text, kind text, pinned boolean, is_official boolean,
  author_name text, author_key text, author_is_staff boolean, mine boolean,
  book_title text, book_author text, book_cover text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links,
         c.likes_count, c.replies_count, c.created, c.updated, coalesce(c.last_activity_at, c.created),
         c.topic, c.kind, c.pinned_at is not null, c.is_official,
         left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100), p.reader_key,
         coalesce(p.role in ('admin', 'manager'), false),
         coalesce(c.user_id = (select auth.uid()), false),
         b.title, b.author, b.cover
  from public.profiles p
  join public.community_posts c on c.user_id = p.id
  left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
  where p.reader_key = p_key and not c.hidden and c.parent_id is null
    and (p_before is null or c.created < p_before)
  order by c.created desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- A coluna lateral: números da comunidade, temas activos com publicações nos últimos 30 dias e
-- os livros mais falados nos últimos 60.
create or replace function public.community_sidebar()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'members', (select count(distinct c.user_id) from public.community_posts c where not c.hidden),
    'posts_week', (select count(*) from public.community_posts c
                   where not c.hidden and c.parent_id is null and c.created > now() - interval '7 days'),
    'posts_total', (select count(*) from public.community_posts c where not c.hidden and c.parent_id is null),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'icon', t.icon, 'posts', t.n) order by t.sort_order, t.name)
      from (
        select tp.slug, tp.name, tp.icon, tp.sort_order,
               (select count(*) from public.community_posts c
                where c.topic = tp.slug and c.parent_id is null and not c.hidden and c.created > now() - interval '30 days') as n
        from public.community_topics tp where tp.active
      ) t
    ), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'author', x.author, 'cover', x.cover, 'posts', x.n) order by x.n desc, x.title)
      from (
        select b.id, b.title, coalesce(b.author, '') as author, coalesce(b.cover, '') as cover, count(*) as n
        from public.community_posts c
        join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
        where not c.hidden and c.created > now() - interval '60 days'
        group by b.id, b.title, b.author, b.cover
        order by count(*) desc, b.title
        limit 5
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.community_current_club() from public;
revoke all on function public.community_list(text, text, text, text, text, timestamptz, int, int) from public;
revoke all on function public.community_thread(text) from public;
revoke all on function public.community_list_replies(text[]) from public;
revoke all on function public.community_reader(text) from public;
revoke all on function public.community_reader_posts(text, timestamptz, int) from public;
revoke all on function public.community_sidebar() from public;
grant execute on function public.community_current_club() to anon, authenticated;
grant execute on function public.community_list(text, text, text, text, text, timestamptz, int, int) to anon, authenticated;
grant execute on function public.community_thread(text) to anon, authenticated;
grant execute on function public.community_list_replies(text[]) to anon, authenticated;
grant execute on function public.community_reader(text) to anon, authenticated;
grant execute on function public.community_reader_posts(text, timestamptz, int) to anon, authenticated;
grant execute on function public.community_sidebar() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendador: também acorda a função para os avisos da comunidade (só push). Respostas saem
-- logo; os gostos esperam 30 minutos para chegarem agrupados num único push.
-- ---------------------------------------------------------------------------
create or replace function private.run_staff_dispatch()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
  v_open boolean;
  v_local timestamp := now() at time zone 'Africa/Luanda';
begin
  select (extract(isodow from v_local)::smallint = any (s.open_days)
          and extract(hour from v_local) >= s.open_hour
          and extract(hour from v_local) < s.close_hour)
  into v_open
  from public.staff_ops_settings s where s.id = 1;
  v_open := coalesce(v_open, true);

  -- Com a loja fechada, só o crítico sai para a equipa (o resto espera pela abertura); as
  -- respostas aos clientes e os avisos da comunidade saem a qualquer hora.
  if not exists (
    select 1 from public.staff_notifications n
    where n.dispatched_at is null and n.created_at > now() - interval '2 days'
      and (v_open or n.severity = 'critical')
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind = 'support' and c.created_at > now() - interval '2 days'
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind = 'community' and c.created_at > now() - interval '2 days'
      and (c.title <> 'Gostaram da sua publicação' or c.created_at < now() - interval '30 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Avisos: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/staff-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function private.run_staff_dispatch() from public, anon, authenticated;
