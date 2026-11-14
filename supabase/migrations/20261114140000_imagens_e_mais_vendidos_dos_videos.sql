-- Imagens e mais vendidos nos vídeos dos relatórios (pedido do dono, 2026-11-14).
--
-- Os vídeos dos relatórios de vendas passam a ter imagens animadas: paisagens, fotografias da
-- biblioteca e o livro mais vendido em 3D. Para isso:
--
-- 1. public.biblioteca_imagens: a biblioteca de imagens dos vídeos (paisagens, livros, lojas…),
--    com tema, créditos e se está activa. As enviadas ficam no bucket público `media`, na pasta
--    `biblioteca/`; as do próprio site (/images/…: as composições com as capas do catálogo e as
--    fotografias das lojas) juntam-se pelo caminho. Lê quem vê os relatórios ou gere o catálogo;
--    gere quem edita os relatórios ou gere o catálogo.
--
-- 2. public.vendas_produtos: os mais vendidos lançados à mão, por loja, ano e (se quiser) mês —
--    para as vendas do balcão, que o site não vê (o KiGest das lojas). Um produto do catálogo
--    (book_id) traz a capa; sem ele, fica só o título. Lê quem vê os relatórios; grava quem os
--    edita.
--
-- 3. public.produtos_mais_vendidos(ano, so_pagas): as encomendas do site somadas por loja, mês e
--    produto, com a capa do catálogo — sem dados de clientes. As mesmas encomendas, lojas e meses
--    de vendas_do_sistema (private.vendas_encomendas). O valor de cada produto é o preço de venda
--    vezes a quantidade; um reembolso parcial não se reparte pelos produtos.
--
-- 4. public.capas_dos_produtos(ids): o título e a capa de produtos do catálogo, também dos ocultos
--    (um produto que vendeu e depois saiu do site continua a aparecer no vídeo), para quem vê os
--    relatórios.
--
-- Reverter: drop das funções public.produtos_mais_vendidos, public.capas_dos_produtos,
-- private.can_read_video_images, private.can_manage_video_images, private.biblioteca_before_save,
-- private.vendas_produtos_before_save; drop das tabelas biblioteca_imagens e vendas_produtos; repor
-- private.can_write_media de 20261101172336 (sem a pasta biblioteca).

-- ---------------------------------------------------------------------------------------------
-- Quem
-- ---------------------------------------------------------------------------------------------
create or replace function private.can_read_video_images()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_sales_reports() or private.has_permission('manage_catalog');
$$;
revoke all on function private.can_read_video_images() from public, anon;
grant execute on function private.can_read_video_images() to authenticated, service_role;

create or replace function private.can_manage_video_images()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_reports() or private.has_permission('manage_catalog');
$$;
revoke all on function private.can_manage_video_images() from public, anon;
grant execute on function private.can_manage_video_images() to authenticated, service_role;

-- A pasta biblioteca/ do bucket media: quem gere as imagens dos vídeos. O resto como em
-- 20261101172336_permissoes_storage.
create or replace function private.can_write_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (storage.foldername(p_name))[1]
    when 'stock_books' then private.has_permission('manage_catalog')
    when 'book_collections' then private.has_permission('manage_catalog')
    when 'hero_slides' then private.has_permission('manage_catalog')
    when 'site_settings' then private.has_permission('manage_settings')
    when 'physical_stores' then private.has_permission('manage_settings')
    when 'payment_methods' then private.has_permission('manage_payments')
    when 'biblioteca' then private.can_manage_video_images()
    -- Avatares: o próprio, ou quem gere utilizadores.
    when 'users' then (storage.foldername(p_name))[2] = (select auth.uid())::text
                      or private.has_permission('manage_users')
    else private.is_admin()
  end;
$$;
revoke all on function private.can_write_media(text) from public;
grant execute on function private.can_write_media(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. A biblioteca de imagens
-- ---------------------------------------------------------------------------------------------
create table if not exists public.biblioteca_imagens (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  caminho text,
  titulo text not null default '',
  tema text not null default 'natureza',
  creditos text not null default '',
  activa boolean not null default true,
  posicao integer not null default 0,
  largura integer,
  altura integer,
  criado timestamptz not null default now(),
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  actualizado timestamptz not null default now(),
  -- Um endereço https (as enviadas, no Storage) ou uma imagem do próprio site (/images/…: as
  -- composições com as capas do catálogo e as fotografias das lojas, da mesma origem do painel).
  constraint biblioteca_imagens_url_check check ((url ~ '^https://' or url ~ '^/images/[A-Za-z0-9._/-]+$') and char_length(url) <= 1000),
  constraint biblioteca_imagens_caminho_check check (caminho is null or caminho ~ '^biblioteca/[A-Za-z0-9._/-]{1,200}$'),
  constraint biblioteca_imagens_titulo_check check (char_length(titulo) <= 120),
  constraint biblioteca_imagens_tema_check check (tema in ('natureza', 'livros', 'lojas', 'pessoas', 'outro')),
  constraint biblioteca_imagens_creditos_check check (char_length(creditos) <= 300),
  constraint biblioteca_imagens_medidas_check check ((largura is null or largura between 1 and 20000) and (altura is null or altura between 1 and 20000))
);
comment on table public.biblioteca_imagens is
  'Imagens dos vídeos dos relatórios (paisagens, livros, lojas). Ficheiros em media/biblioteca/. Ver docs/RELATORIOS.md.';
create index if not exists biblioteca_imagens_tema_idx on public.biblioteca_imagens (tema, posicao) where activa;
create index if not exists biblioteca_imagens_criado_por_idx on public.biblioteca_imagens (criado_por);

alter table public.biblioteca_imagens enable row level security;
drop policy if exists "biblioteca_imagens: lê" on public.biblioteca_imagens;
create policy "biblioteca_imagens: lê" on public.biblioteca_imagens for select to authenticated
  using ((select private.can_read_video_images()));
drop policy if exists "biblioteca_imagens: cria" on public.biblioteca_imagens;
create policy "biblioteca_imagens: cria" on public.biblioteca_imagens for insert to authenticated
  with check ((select private.can_manage_video_images()));
drop policy if exists "biblioteca_imagens: edita" on public.biblioteca_imagens;
create policy "biblioteca_imagens: edita" on public.biblioteca_imagens for update to authenticated
  using ((select private.can_manage_video_images())) with check ((select private.can_manage_video_images()));
drop policy if exists "biblioteca_imagens: apaga" on public.biblioteca_imagens;
create policy "biblioteca_imagens: apaga" on public.biblioteca_imagens for delete to authenticated
  using ((select private.can_manage_video_images()));
revoke all on public.biblioteca_imagens from anon;

create or replace function private.biblioteca_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.titulo := left(btrim(regexp_replace(coalesce(new.titulo, ''), '\s+', ' ', 'g')), 120);
  new.creditos := left(btrim(coalesce(new.creditos, '')), 300);
  if tg_op = 'INSERT' then
    new.criado := now();
    new.criado_por := coalesce(auth.uid(), new.criado_por);
  else
    new.criado := old.criado;
    new.criado_por := old.criado_por;
  end if;
  new.actualizado := now();
  return new;
end;
$$;
revoke all on function private.biblioteca_before_save() from public, anon, authenticated;
drop trigger if exists biblioteca_before_save on public.biblioteca_imagens;
create trigger biblioteca_before_save
  before insert or update on public.biblioteca_imagens
  for each row execute function private.biblioteca_before_save();

-- ---------------------------------------------------------------------------------------------
-- 2. Os mais vendidos lançados à mão
-- ---------------------------------------------------------------------------------------------
create table if not exists public.vendas_produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.physical_stores (id) on delete restrict,
  ano integer not null,
  mes smallint,
  book_id text references public.stock_books (id) on delete set null,
  titulo text not null,
  unidades numeric(12, 2) not null default 0,
  valor numeric(16, 2),
  nota text not null default '',
  actualizado timestamptz not null default now(),
  actualizado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  constraint vendas_produtos_ano_check check (ano between 2000 and 2100),
  constraint vendas_produtos_mes_check check (mes is null or mes between 1 and 12),
  constraint vendas_produtos_titulo_check check (char_length(btrim(titulo)) between 1 and 200),
  constraint vendas_produtos_unidades_check check (unidades >= 0),
  constraint vendas_produtos_valor_check check (valor is null or valor >= 0),
  constraint vendas_produtos_nota_check check (char_length(nota) <= 300)
);
comment on table public.vendas_produtos is
  'Mais vendidos lançados à mão por loja, ano e mês (mês nulo = o ano todo), para os vídeos dos relatórios.';
create index if not exists vendas_produtos_loja_ano_idx on public.vendas_produtos (loja_id, ano, mes);
create index if not exists vendas_produtos_book_idx on public.vendas_produtos (book_id) where book_id is not null;
create index if not exists vendas_produtos_actualizado_por_idx on public.vendas_produtos (actualizado_por);

alter table public.vendas_produtos enable row level security;
drop policy if exists "vendas_produtos: relatórios lê" on public.vendas_produtos;
create policy "vendas_produtos: relatórios lê" on public.vendas_produtos for select to authenticated
  using ((select private.can_read_sales_reports()));
drop policy if exists "vendas_produtos: relatórios cria" on public.vendas_produtos;
create policy "vendas_produtos: relatórios cria" on public.vendas_produtos for insert to authenticated
  with check ((select private.can_edit_reports()));
drop policy if exists "vendas_produtos: relatórios edita" on public.vendas_produtos;
create policy "vendas_produtos: relatórios edita" on public.vendas_produtos for update to authenticated
  using ((select private.can_edit_reports())) with check ((select private.can_edit_reports()));
drop policy if exists "vendas_produtos: relatórios apaga" on public.vendas_produtos;
create policy "vendas_produtos: relatórios apaga" on public.vendas_produtos for delete to authenticated
  using ((select private.can_edit_reports()));
revoke all on public.vendas_produtos from anon;

create or replace function private.vendas_produtos_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.titulo := left(btrim(regexp_replace(coalesce(new.titulo, ''), '\s+', ' ', 'g')), 200);
  new.nota := left(btrim(coalesce(new.nota, '')), 300);
  new.actualizado := now();
  new.actualizado_por := coalesce(auth.uid(), case when tg_op = 'UPDATE' then old.actualizado_por end);
  return new;
end;
$$;
revoke all on function private.vendas_produtos_before_save() from public, anon, authenticated;
drop trigger if exists vendas_produtos_before_save on public.vendas_produtos;
create trigger vendas_produtos_before_save
  before insert or update on public.vendas_produtos
  for each row execute function private.vendas_produtos_before_save();

-- ---------------------------------------------------------------------------------------------
-- 3. Os mais vendidos do site, por loja, mês e produto
-- ---------------------------------------------------------------------------------------------
create or replace function public.produtos_mais_vendidos(p_ano integer, p_so_pagas boolean default true)
returns table (loja_id text, mes integer, book_id text, titulo text, codigo text, capa text, capa_ficheiro text,
               unidades numeric, valor numeric, encomendas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_sales_reports() then
    raise exception 'Sem permissão para ver as vendas.' using errcode = '42501';
  end if;
  if p_ano is null or p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano inválido.' using errcode = '22023';
  end if;
  return query
  with itens as (
    select e.encomenda, e.loja_id, e.mes,
           nullif(btrim(coalesce(it ->> 'book_id', '')), '') as book_id,
           nullif(btrim(coalesce(it ->> 'title', '')), '') as titulo,
           nullif(btrim(coalesce(it ->> 'book_code', '')), '') as codigo,
           greatest(coalesce(case when (it ->> 'quantity') ~ '^\s*\d+(\.\d+)?\s*$' then (it ->> 'quantity')::numeric end, 1), 0) as qtd,
           coalesce(case when (it ->> 'price') ~ '^\s*\d+(\.\d+)?\s*$' then (it ->> 'price')::numeric end, 0) as preco
    from private.vendas_encomendas(p_ano, p_so_pagas) e,
         jsonb_array_elements(e.itens) it
    where jsonb_typeof(it) = 'object'
  ),
  somas as (
    select i.loja_id, i.mes, i.book_id,
           -- Sem book_id (encomendas antigas, WhatsApp), agrupa pelo título.
           case when i.book_id is null then lower(coalesce(i.titulo, '')) else '' end as chave,
           max(i.titulo) as titulo, max(i.codigo) as codigo,
           sum(i.qtd) as unidades, round(sum(i.qtd * i.preco), 2) as valor,
           count(distinct i.encomenda)::integer as encomendas
    from itens i
    where i.book_id is not null or i.titulo is not null
    group by i.loja_id, i.mes, i.book_id, case when i.book_id is null then lower(coalesce(i.titulo, '')) else '' end
  )
  select s.loja_id, s.mes, s.book_id,
         coalesce(nullif(b.title, ''), s.titulo, 'Produto'),
         coalesce(nullif(b.book_code, ''), s.codigo, ''),
         coalesce(b.cover, ''), coalesce(b.cover_image, ''),
         s.unidades, s.valor, s.encomendas
  from somas s
  left join public.stock_books b on b.id = s.book_id
  order by s.loja_id nulls last, s.mes, s.unidades desc, s.valor desc;
end;
$$;
comment on function public.produtos_mais_vendidos(integer, boolean) is
  'Unidades e valor de cada produto vendido no site, por loja e mês (sem dados pessoais). Quem vê ou edita os relatórios.';
revoke all on function public.produtos_mais_vendidos(integer, boolean) from public, anon;
grant execute on function public.produtos_mais_vendidos(integer, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Capas dos produtos (também dos ocultos), para os vídeos
-- ---------------------------------------------------------------------------------------------
create or replace function public.capas_dos_produtos(p_ids text[])
returns table (id text, titulo text, codigo text, capa text, capa_ficheiro text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_video_images() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select b.id, b.title, coalesce(b.book_code, ''), coalesce(b.cover, ''), coalesce(b.cover_image, '')
  from public.stock_books b
  where b.id = any ((coalesce(p_ids, array[]::text[]))[1:200]);
end;
$$;
comment on function public.capas_dos_produtos(text[]) is
  'Título e capa de até 200 produtos do catálogo (também os ocultos), para os vídeos dos relatórios.';
revoke all on function public.capas_dos_produtos(text[]) from public, anon;
grant execute on function public.capas_dos_produtos(text[]) to authenticated, service_role;
