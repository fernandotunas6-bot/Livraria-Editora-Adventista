-- Livros que cada cliente com sessão abriu, para as sugestões na loja (/sugestoes) e nos emails.
-- A Edge Function grava (service role) em POST /catalog/view; o cliente só lê e apaga o seu histórico.
create table public.book_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null references public.stock_books (id) on delete cascade,
  views integer not null default 1,
  last_viewed timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index book_views_user_recent_idx on public.book_views (user_id, last_viewed desc);
create index book_views_book_id_idx on public.book_views (book_id);

alter table public.book_views enable row level security;

create policy "book_views: o próprio vê" on public.book_views for select to authenticated
  using (user_id = (select auth.uid()));
create policy "book_views: o próprio apaga" on public.book_views for delete to authenticated
  using (user_id = (select auth.uid()));

-- Regista (ou soma) uma visita; só a service role a chama.
create or replace function public.record_book_view(p_user uuid, p_book text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.book_views (user_id, book_id)
  values (p_user, p_book)
  on conflict (user_id, book_id)
  do update set views = public.book_views.views + 1, last_viewed = now();
$$;

revoke all on function public.record_book_view(uuid, text) from public, anon, authenticated;
grant execute on function public.record_book_view(uuid, text) to service_role;
