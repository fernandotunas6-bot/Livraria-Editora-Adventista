-- Materiais para descarregar: PDFs de revistas, lições, folhetos e livros, gratuitos ou pagos.
--
--   * Os ficheiros ficam no bucket privado `downloads` (só PDF, até 50 MB). Ninguém lê o bucket
--     directamente: o site pede um link temporário, e o Storage só o passa a quem a regra de
--     acesso (private.can_download) deixa.
--   * Gratuito: qualquer visitante, com ou sem conta, desde que o material esteja publicado.
--   * Pago: ligado a um produto do catálogo (e, se quiser, a uma variante, por exemplo
--     "Edição digital"). Descarrega quem tem sessão e comprou esse produto numa encomenda que
--     conta: não cancelada e já paga, entregue ou confirmada pelo cliente. É a regra da
--     "compra verificada" (migração 20261106160000; no site, app/web/src/lib/purchase.js).
--     A encomenda é da conta pelo customer_id, ou pelo email da conta se este estiver
--     confirmado: um email por confirmar não abre os PDFs de outra pessoa.
--   * A equipa com manage_catalog carrega, publica e apaga (painel → Catálogo → Materiais).
--   * A lista pública passa pela vista `downloads_public`, sem o caminho do ficheiro, e diz a
--     quem lê se já pode descarregar (`can_download`).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('downloads', 'downloads', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.downloads (
  id text primary key default public.gen_record_id(),
  title text not null,
  description text not null default '',
  kind text not null default 'revista',
  edition text not null default '',
  cover text not null default '',
  file_path text not null default '',
  file_name text not null default '',
  file_size bigint not null default 0,
  access text not null default 'free',
  book_id text references public.stock_books (id) on delete set null,
  variant int,
  published boolean not null default false,
  sort_order int not null default 0,
  download_count int not null default 0,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint downloads_title_len check (char_length(btrim(title)) between 1 and 200),
  constraint downloads_text_len check (char_length(description) <= 2000 and char_length(edition) <= 80 and char_length(file_name) <= 200),
  constraint downloads_kind check (kind in ('revista', 'licao', 'folheto', 'livro', 'guia', 'outro')),
  constraint downloads_access check (access in ('free', 'paid')),
  constraint downloads_variant check (variant is null or variant >= 0),
  -- Um pago sem produto não teria como ser comprado.
  constraint downloads_paid_has_product check (access = 'free' or book_id is not null),
  constraint downloads_file_in_bucket check (file_path = '' or file_path ~ '^files/[A-Za-z0-9._-]+\.pdf$')
);

create unique index if not exists downloads_file_path_key on public.downloads (file_path) where file_path <> '';
create index if not exists downloads_list_idx on public.downloads (published, sort_order, created desc);
create index if not exists downloads_book_idx on public.downloads (book_id);

-- Antes de gravar: texto limpo, contador só pela função de download, publicar exige ficheiro.
create or replace function public.downloads_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created := now();
    new.download_count := 0;
  else
    new.created := old.created;
    if pg_trigger_depth() <= 1 and current_setting('app.download_count', true) is distinct from 'on' then
      new.download_count := old.download_count;
    end if;
  end if;
  new.title := btrim(coalesce(new.title, ''));
  new.description := btrim(coalesce(new.description, ''));
  new.edition := btrim(coalesce(new.edition, ''));
  new.file_name := btrim(coalesce(new.file_name, ''));
  if new.access = 'free' then new.variant := null; end if;
  if new.book_id is null then new.variant := null; end if;
  if new.published and coalesce(new.file_path, '') = '' then
    raise exception 'Carregue o PDF antes de publicar.';
  end if;
  new.updated := now();
  return new;
end;
$$;

drop trigger if exists downloads_before_save on public.downloads;
create trigger downloads_before_save
  before insert or update on public.downloads
  for each row execute function public.downloads_before_save();

revoke all on function public.downloads_before_save() from public, anon, authenticated;

-- Quem tem sessão comprou este produto (ou esta variante) numa encomenda que conta?
create or replace function private.bought_product(p_book_id text, p_variant int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and p_book_id is not null and exists (
    select 1
    from public.orders o
    where (
        o.customer_id = auth.uid()
        or lower(coalesce(o.customer_email, '')) = (
          select lower(u.email) from auth.users u
          where u.id = auth.uid() and u.email_confirmed_at is not null and coalesce(u.email, '') <> ''
        )
      )
      and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
      and coalesce(o.delivery_status, '') <> 'cancelled'
      and (o.payment_status = 'paid' or o.delivery_status = 'delivered' or o.customer_confirmed_at is not null)
      and jsonb_typeof(o.items) = 'array'
      and o.items @> case
        when p_variant is null then jsonb_build_array(jsonb_build_object('book_id', p_book_id))
        else jsonb_build_array(jsonb_build_object('book_id', p_book_id, 'variant', p_variant))
      end
  );
$$;

-- A regra de acesso, usada pela vista, pela função de download e pelo Storage.
create or replace function private.can_download(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.downloads d
    where d.id = p_id
      and d.file_path <> ''
      and (
        private.has_permission('manage_catalog')
        or (d.published and (d.access = 'free' or private.bought_product(d.book_id, d.variant)))
      )
  );
$$;

create or replace function private.can_download_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.downloads d
    where d.file_path = p_name and private.can_download(d.id)
  );
$$;

revoke all on function private.bought_product(text, int) from public;
revoke all on function private.can_download(text) from public;
revoke all on function private.can_download_object(text) from public;
grant execute on function private.bought_product(text, int) to anon, authenticated, service_role;
grant execute on function private.can_download(text) to anon, authenticated, service_role;
grant execute on function private.can_download_object(text) to anon, authenticated, service_role;

-- O site chama esta função antes de pedir o link: confirma o acesso, conta o download e
-- devolve o caminho e o nome do ficheiro. Sem acesso, diz porquê.
create or replace function public.start_download(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.downloads;
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

alter table public.downloads enable row level security;

drop policy if exists "downloads: a equipa do catálogo lê" on public.downloads;
create policy "downloads: a equipa do catálogo lê" on public.downloads
  for select to authenticated using ((select private.has_permission('manage_catalog')));
drop policy if exists "downloads: a equipa do catálogo cria" on public.downloads;
create policy "downloads: a equipa do catálogo cria" on public.downloads
  for insert to authenticated with check ((select private.has_permission('manage_catalog')));
drop policy if exists "downloads: a equipa do catálogo edita" on public.downloads;
create policy "downloads: a equipa do catálogo edita" on public.downloads
  for update to authenticated using ((select private.has_permission('manage_catalog')))
  with check ((select private.has_permission('manage_catalog')));
drop policy if exists "downloads: a equipa do catálogo apaga" on public.downloads;
create policy "downloads: a equipa do catálogo apaga" on public.downloads
  for delete to authenticated using ((select private.has_permission('manage_catalog')));

revoke all on public.downloads from anon;
grant select, insert, update, delete on public.downloads to authenticated;

-- Storage: ler (pedir o link temporário) segue a regra de acesso; escrever é da equipa.
drop policy if exists "downloads: lê com acesso" on storage.objects;
create policy "downloads: lê com acesso" on storage.objects for select to anon, authenticated
  using (bucket_id = 'downloads' and private.can_download_object(name));
drop policy if exists "downloads: a equipa envia" on storage.objects;
create policy "downloads: a equipa envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'downloads' and private.has_permission('manage_catalog'));
drop policy if exists "downloads: a equipa actualiza" on storage.objects;
create policy "downloads: a equipa actualiza" on storage.objects for update to authenticated
  using (bucket_id = 'downloads' and private.has_permission('manage_catalog'))
  with check (bucket_id = 'downloads' and private.has_permission('manage_catalog'));
drop policy if exists "downloads: a equipa apaga" on storage.objects;
create policy "downloads: a equipa apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'downloads' and private.has_permission('manage_catalog'));

-- Lista pública: só o publicado, sem o caminho do ficheiro. `can_download` é de quem lê.
create or replace view public.downloads_public as
select
  d.id, d.title, d.description, d.kind, d.edition, d.cover, d.file_size, d.access, d.book_id,
  d.variant, d.sort_order, d.download_count, d.created, d.updated,
  b.title as book_title,
  private.can_download(d.id) as can_download
from public.downloads d
left join public.stock_books b on b.id = d.book_id and coalesce(b.active, true)
where d.published and d.file_path <> '' and (d.access = 'free' or b.id is not null);

revoke all on public.downloads_public from public;
grant select on public.downloads_public to anon, authenticated;
