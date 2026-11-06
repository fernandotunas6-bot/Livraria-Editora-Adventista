-- Comunidade: publicações de qualquer assunto, com respostas num nível, referência a um livro,
-- citação e links externos. Os links publicam-se logo (decisão do dono), por isso:
--
--   * só http(s), sem credenciais no endereço, até 5 por publicação;
--   * cada pessoa denuncia uma vez; à terceira denúncia de contas diferentes a publicação fica
--     oculta até a equipa decidir (painel → Comunidade);
--   * limite de 10 publicações por hora por conta;
--   * a leitura pública passa pela vista `community_posts_public`, que mostra o nome do perfil
--     mas nunca o email nem o `user_id` (o site mostra as iniciais: o endereço do avatar teria
--     o id da conta).
--
-- O site valida o mesmo em app/web/src/lib/communityLinks.js; esta é a regra que manda.

create table if not exists public.community_posts (
  id text primary key default public.gen_record_id(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id text references public.community_posts (id) on delete cascade,
  book_id text references public.stock_books (id) on delete set null,
  body text not null,
  quote text not null default '',
  quote_page text not null default '',
  links jsonb not null default '[]'::jsonb,
  likes_count int not null default 0,
  reports_count int not null default 0,
  hidden boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint community_posts_body_len check (char_length(body) between 1 and 2000),
  constraint community_posts_quote_len check (char_length(quote) <= 500 and char_length(quote_page) <= 40),
  constraint community_posts_links_array check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5)
);

create index if not exists community_posts_feed_idx on public.community_posts (created desc) where parent_id is null;
create index if not exists community_posts_parent_idx on public.community_posts (parent_id, created);
create index if not exists community_posts_book_idx on public.community_posts (book_id, created desc);
create index if not exists community_posts_user_idx on public.community_posts (user_id);

create table if not exists public.community_likes (
  post_id text not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists community_likes_user_idx on public.community_likes (user_id);

create table if not exists public.community_reports (
  post_id text not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null default '',
  created timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint community_reports_reason_len check (char_length(reason) <= 300)
);
create index if not exists community_reports_user_idx on public.community_reports (user_id);

-- Antes de gravar: dono e datas fixos, texto limpo, links e resposta validados, contadores e
-- ocultação só pelos triggers (ou, a ocultação, pela equipa).
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
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.user_id := auth.uid(); end if;
    new.created := now();
    new.likes_count := 0;
    new.reports_count := 0;
    new.hidden := false;
    if auth.uid() is not null
       and not private.check_rate_limit('comunidade', auth.uid()::text, 10, interval '1 hour') then
      raise exception 'Muitas publicações seguidas. Tente daqui a pouco.';
    end if;
  else
    new.user_id := old.user_id;
    new.parent_id := old.parent_id;
    new.created := old.created;
    -- Contadores só mudam pelos triggers dos gostos e das denúncias (profundidade > 1).
    if pg_trigger_depth() <= 1 then
      new.likes_count := old.likes_count;
      new.reports_count := old.reports_count;
      if new.hidden is distinct from old.hidden and not private.is_staff() then
        new.hidden := old.hidden;
      end if;
    end if;
  end if;

  new.body := btrim(regexp_replace(coalesce(new.body, ''), E'\\n{3,}', E'\n\n', 'g'));
  new.quote := btrim(coalesce(new.quote, ''));
  new.quote_page := btrim(coalesce(new.quote_page, ''));

  if new.parent_id is not null then
    select * into v_parent from public.community_posts where id = new.parent_id;
    if not found then raise exception 'A publicação que quer responder já não existe.'; end if;
    if v_parent.parent_id is not null then raise exception 'Só se responde a uma publicação, não a uma resposta.'; end if;
  end if;

  if new.links is null or jsonb_typeof(new.links) <> 'array' then new.links := '[]'::jsonb; end if;
  for v_link in select * from jsonb_array_elements(new.links) loop
    v_url := v_link #>> '{}';
    if jsonb_typeof(v_link) <> 'string'
       or char_length(v_url) > 500
       or v_url !~* '^https?://[^\s<>"'']+$'
       or v_url ~* '^https?://[^/]*@' then
      raise exception 'Link inválido: só endereços http ou https.';
    end if;
  end loop;

  new.updated := now();
  return new;
end;
$$;

drop trigger if exists community_posts_before_save on public.community_posts;
create trigger community_posts_before_save
  before insert or update on public.community_posts
  for each row execute function public.community_posts_before_save();

-- Gostos e denúncias actualizam os contadores; à terceira denúncia a publicação fica oculta.
create or replace function public.community_counts_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post text := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'community_likes' then
    update public.community_posts
      set likes_count = (select count(*) from public.community_likes where post_id = v_post)
      where id = v_post;
  else
    update public.community_posts p
      set reports_count = c.n,
          hidden = p.hidden or c.n >= 3
      from (select count(*)::int as n from public.community_reports where post_id = v_post) c
      where p.id = v_post;
  end if;
  return null;
end;
$$;

drop trigger if exists community_likes_counts on public.community_likes;
create trigger community_likes_counts
  after insert or delete on public.community_likes
  for each row execute function public.community_counts_after_change();

drop trigger if exists community_reports_counts on public.community_reports;
create trigger community_reports_counts
  after insert or delete on public.community_reports
  for each row execute function public.community_counts_after_change();

-- Gosto e denúncia escrevem sempre para a própria conta.
create or replace function public.community_own_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  if tg_table_name = 'community_reports' then new.reason := left(btrim(coalesce(new.reason, '')), 300); end if;
  return new;
end;
$$;

drop trigger if exists community_likes_own on public.community_likes;
create trigger community_likes_own before insert on public.community_likes
  for each row execute function public.community_own_row();
drop trigger if exists community_reports_own on public.community_reports;
create trigger community_reports_own before insert on public.community_reports
  for each row execute function public.community_own_row();

revoke all on function public.community_posts_before_save() from public, anon, authenticated;
revoke all on function public.community_counts_after_change() from public, anon, authenticated;
revoke all on function public.community_own_row() from public, anon, authenticated;

alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;

-- A tabela não se lê directamente em público: tem o user_id. Lêem-na o autor e a equipa; os
-- outros lêem a vista.
drop policy if exists "community_posts: autor e equipa lêem" on public.community_posts;
create policy "community_posts: autor e equipa lêem" on public.community_posts
  for select to authenticated using (user_id = auth.uid() or private.is_staff());
drop policy if exists "community_posts: o próprio publica" on public.community_posts;
create policy "community_posts: o próprio publica" on public.community_posts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "community_posts: o próprio ou a equipa edita" on public.community_posts;
create policy "community_posts: o próprio ou a equipa edita" on public.community_posts
  for update to authenticated using (user_id = auth.uid() or private.is_staff())
  with check (user_id = auth.uid() or private.is_staff());
drop policy if exists "community_posts: o próprio ou a equipa apaga" on public.community_posts;
create policy "community_posts: o próprio ou a equipa apaga" on public.community_posts
  for delete to authenticated using (user_id = auth.uid() or private.is_staff());

drop policy if exists "community_likes: os próprios" on public.community_likes;
create policy "community_likes: os próprios" on public.community_likes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "community_likes: o próprio gosta" on public.community_likes;
create policy "community_likes: o próprio gosta" on public.community_likes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "community_likes: o próprio tira" on public.community_likes;
create policy "community_likes: o próprio tira" on public.community_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "community_reports: o próprio e a equipa lêem" on public.community_reports;
create policy "community_reports: o próprio e a equipa lêem" on public.community_reports
  for select to authenticated using (user_id = auth.uid() or private.is_staff());
drop policy if exists "community_reports: o próprio denuncia" on public.community_reports;
create policy "community_reports: o próprio denuncia" on public.community_reports
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "community_reports: a equipa limpa" on public.community_reports;
create policy "community_reports: a equipa limpa" on public.community_reports
  for delete to authenticated using (private.is_staff());

-- Sem conta só se lê a vista. O RLS já devolvia 0 linhas, mas sem permissão nem se tenta.
revoke all on public.community_posts, public.community_likes, public.community_reports from anon;
grant select, insert, update, delete on public.community_posts to authenticated;
grant select, insert, delete on public.community_likes to authenticated;
grant select, insert, delete on public.community_reports to authenticated;

-- Leitura pública: só o visível, com o nome do perfil e sem email nem user_id. `mine` diz ao
-- site se a publicação é de quem lê (para o botão Apagar) sem revelar a conta.
create or replace view public.community_posts_public as
select
  c.id, c.parent_id, c.book_id, c.body, c.quote, c.quote_page, c.links, c.likes_count,
  c.created, c.updated,
  left(coalesce(nullif(btrim(p.name), ''), 'Leitor'), 100) as author_name,
  (c.user_id = auth.uid()) as mine,
  b.title as book_title
from public.community_posts c
left join public.profiles p on p.id = c.user_id
left join public.stock_books b on b.id = c.book_id and coalesce(b.active, true)
where not c.hidden;

revoke all on public.community_posts_public from public;
grant select on public.community_posts_public to anon, authenticated;
