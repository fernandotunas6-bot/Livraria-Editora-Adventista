-- KanGest: o programa de facturação das livrarias ligado ao site (docs/KANGEST.md).
--
-- Substitui a exportação manual do KiGest (docs/catalogo/KIGEST.md) por uma ligação contínua à
-- API do KanGest, em três sentidos:
--
--   * stock e preços → site: o KanGest avisa (webhook assinado) quando muda o stock ou o artigo;
--     o site guarda o disponível de cada armazém em `kangest_stock` e o stock à venda passa a ser
--     a soma dos armazéns que servem o site, menos as encomendas que ainda não chegaram ao KanGest;
--   * encomendas → KanGest: cada encomenda vira uma nota de encomenda (NE, reserva o stock na
--     loja), o pagamento confirmado uma Factura/Recibo (FR) a partir dela e o cancelamento anula a
--     NE. Os gatilhos só põem o pedido na fila (`kangest_fila`); quem fala com o KanGest é a Edge
--     Function, com novas tentativas. Uma loja sem Internet nunca impede uma compra;
--   * vendas ao balcão → relatórios: os totais de cada loja e de cada mês (`kangest_vendas`).
--
-- Nada muda até a ligação ser activada (`kangest_estado.activo`, que a Edge Function escreve
-- quando tem a configuração KANGEST_LIGACOES): as encomendas de antes não vão para a fila.
-- Não há segredos neste ficheiro — o repositório é público.

-- ---------------------------------------------------------------------------
-- 1. Estado da ligação (activa, cursores da sincronização)
-- ---------------------------------------------------------------------------
create table if not exists public.kangest_estado (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);
alter table public.kangest_estado enable row level security;
revoke all on public.kangest_estado from anon, authenticated;
comment on table public.kangest_estado is
  'Ligação ao KanGest: activo (true/false) e cursores da sincronização. Só a Edge Function (service_role) escreve.';

create or replace function private.kangest_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select valor = 'true'::jsonb from public.kangest_estado where chave = 'activo'), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. Fila de documentos a emitir no KanGest
-- ---------------------------------------------------------------------------
create table if not exists public.kangest_fila (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  accao text not null check (accao in ('ne', 'fr', 'anular')),
  estado text not null default 'pendente' check (estado in ('pendente', 'feito', 'erro', 'ignorado')),
  tentativas int not null default 0,
  proxima timestamptz not null default now(),
  erro text not null default '',
  resultado jsonb,
  criado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (order_id, accao)
);
create index if not exists kangest_fila_pendentes_idx on public.kangest_fila (proxima) where estado = 'pendente';
alter table public.kangest_fila enable row level security;
revoke all on public.kangest_fila from anon, authenticated;
-- Os documentos do KanGest de uma encomenda, para o painel e o recibo: número, QR da AGT, estado.
create or replace function public.kangest_da_encomenda(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(f.accao, jsonb_build_object('estado', f.estado, 'erro', f.erro, 'tentativas', f.tentativas,
                                                        'resultado', coalesce(f.resultado, '{}'::jsonb), 'actualizado', f.actualizado))
    from public.kangest_fila f where f.order_id = p_order_id), '{}'::jsonb);
end;
$$;
revoke all on function public.kangest_da_encomenda(text) from public, anon;
grant execute on function public.kangest_da_encomenda(text) to authenticated, service_role;

comment on table public.kangest_fila is
  'Documentos por emitir no KanGest: ne (encomenda feita), fr (pagamento confirmado), anular (encomenda cancelada). '
  'Escreve-se pelo gatilho orders_kangest; a Edge Function processa (POST /cron/kangest).';

-- O que o KanGest devolveu (id e número da NE e da FR, o QR da AGT, a ligação) fica em `resultado`, na
-- fila: escrever nas encomendas passaria pelos gatilhos delas (auditoria, avisos, pagamentos).
-- NIF do cliente para a factura (opcional; sem ele a factura é a Consumidor Final).
alter table public.orders add column if not exists customer_nif text not null default '';

create or replace function private.kangest_cancelada(o public.orders)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(o.status, '') = 'cancelled' or coalesce(o.delivery_status, '') = 'cancelled';
$$;

create or replace function private.orders_kangest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kangest_activo() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not private.kangest_cancelada(new) then
      insert into public.kangest_fila (order_id, accao) values (new.id, 'ne') on conflict do nothing;
      if coalesce(new.payment_status, '') = 'paid' then
        insert into public.kangest_fila (order_id, accao) values (new.id, 'fr') on conflict do nothing;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.payment_status, '') = 'paid' and coalesce(old.payment_status, '') <> 'paid' and not private.kangest_cancelada(new) then
    -- encomenda de antes da activação: a NE também vai (a FR sai dela)
    insert into public.kangest_fila (order_id, accao) values (new.id, 'ne') on conflict do nothing;
    insert into public.kangest_fila (order_id, accao) values (new.id, 'fr') on conflict do nothing;
  end if;
  if private.kangest_cancelada(new) and not private.kangest_cancelada(old) then
    -- a NE que ainda não saiu deixa de ir; a que já saiu anula-se
    update public.kangest_fila set estado = 'ignorado', erro = 'Encomenda cancelada antes de chegar ao KanGest.', actualizado = now()
      where order_id = new.id and estado in ('pendente', 'erro');
    if exists (select 1 from public.kangest_fila where order_id = new.id and accao = 'ne' and estado = 'feito') then
      insert into public.kangest_fila (order_id, accao) values (new.id, 'anular') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_kangest on public.orders;
create trigger orders_kangest
  after insert or update of payment_status, status, delivery_status on public.orders
  for each row execute function private.orders_kangest();

-- ---------------------------------------------------------------------------
-- 3. Stock vindo do KanGest
-- ---------------------------------------------------------------------------
-- Uma linha por ligação (um KanGest), artigo (referência) e armazém. `online`: este armazém vende
-- no site. `store_id`: a livraria desse armazém (para o «temos / não temos» de cada loja).
create table if not exists public.kangest_stock (
  ligacao text not null,
  referencia text not null,
  armazem_id bigint not null,
  quantidade numeric not null default 0,
  reservado numeric not null default 0,
  disponivel numeric not null default 0,
  online boolean not null default true,
  store_id text references public.physical_stores (id) on delete set null,
  actualizado timestamptz not null default now(),
  primary key (ligacao, referencia, armazem_id)
);
create index if not exists kangest_stock_ref_idx on public.kangest_stock (referencia);
create index if not exists kangest_stock_store_idx on public.kangest_stock (store_id);
alter table public.kangest_stock enable row level security;
revoke all on public.kangest_stock from anon, authenticated;

-- O histórico de stock (stock_movements) aceita o motivo «kangest»: o stock que veio do KanGest.
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('inicial', 'venda', 'cancelamento', 'ajuste', 'consignacao', 'devolucao_consignacao', 'compra_colportor', 'producao', 'kangest'));

-- Stock à venda de um produto do KanGest: o disponível dos armazéns online, menos as encomendas do
-- site que ainda não têm NE no KanGest (já saíram do stock do site, mas o KanGest ainda não as
-- reservou). Também marca o «temos / não temos» de cada loja ligada. Produtos com tamanhos e
-- variantes (versions) ficam como estão: o stock é de cada variante e o KanGest não o tem.
create or replace function public.kangest_recalcular_stock(p_referencia text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  b record;
  v_disp numeric;
  v_pendente numeric;
begin
  if coalesce(btrim(p_referencia), '') = '' then
    return 0;
  end if;
  select coalesce(sum(disponivel), 0) into v_disp
    from public.kangest_stock where referencia = p_referencia and online;
  for b in
    select id from public.stock_books
    where kigest_ref = p_referencia
      and (versions is null or jsonb_typeof(versions) <> 'array' or jsonb_array_length(versions) = 0)
  loop
    select coalesce(sum((it ->> 'quantity')::numeric), 0) into v_pendente
      from public.kangest_fila f
      join public.orders o on o.id = f.order_id
      cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
      where f.accao = 'ne' and f.estado in ('pendente', 'erro')
        and it ->> 'book_id' = b.id and coalesce(it ->> 'digital', '') <> 'true'
        and not private.kangest_cancelada(o);
    perform set_config('app.stock_reason', 'kangest', true);
    perform set_config('app.stock_ref', p_referencia, true);
    update public.stock_books set stock = greatest(v_disp - v_pendente, 0) where id = b.id and stock is distinct from greatest(v_disp - v_pendente, 0);
    perform set_config('app.stock_reason', '', true);
    perform set_config('app.stock_ref', '', true);

    insert into public.store_stock (store_id, book_id, available, updated)
    select s.store_id, b.id, sum(s.disponivel) > 0, now()
      from public.kangest_stock s
      where s.referencia = p_referencia and s.store_id is not null
      group by s.store_id
    on conflict (store_id, book_id) do update set available = excluded.available, updated = now()
      where public.store_stock.available is distinct from excluded.available;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.kangest_recalcular_stock(text) from public, anon, authenticated;
grant execute on function public.kangest_recalcular_stock(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Vendas ao balcão (KanGest), por loja e por mês
-- ---------------------------------------------------------------------------
create table if not exists public.kangest_vendas (
  ligacao text not null,
  store_id text not null default '',
  ano int not null,
  mes int not null check (mes between 1 and 12),
  canal text not null check (canal in ('balcao', 'api')),
  total numeric(14, 2) not null default 0,
  docs int not null default 0,
  actualizado timestamptz not null default now(),
  primary key (ligacao, store_id, ano, mes, canal)
);
alter table public.kangest_vendas enable row level security;
revoke all on public.kangest_vendas from anon, authenticated;
grant select on public.kangest_vendas to authenticated;
drop policy if exists "kangest_vendas: quem vê os relatórios" on public.kangest_vendas;
create policy "kangest_vendas: quem vê os relatórios" on public.kangest_vendas
  for select to authenticated using ((select private.can_read_sales_reports()));

-- Totais de um ano para o painel (Relatórios → Todas as livrarias → vendas ao balcão), só para
-- quem vê os relatórios. Uma linha por loja e por mês; `store_id` vazio = armazém sem loja ligada.
create or replace function public.vendas_do_kangest(p_ano int, p_canal text default 'balcao')
returns table (store_id text, mes int, total numeric, docs int, actualizado timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_sales_reports() then
    raise exception 'Sem permissão para ver os relatórios de vendas.' using errcode = '42501';
  end if;
  return query
    select v.store_id, v.mes, sum(v.total), sum(v.docs)::int, max(v.actualizado)
    from public.kangest_vendas v
    where v.ano = p_ano and v.canal = coalesce(p_canal, 'balcao')
    group by v.store_id, v.mes
    order by v.store_id, v.mes;
end;
$$;
revoke all on function public.vendas_do_kangest(int, text) from public, anon;
grant execute on function public.vendas_do_kangest(int, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Agendador: a fila e a sincronização de 5 em 5 minutos
-- ---------------------------------------------------------------------------
-- Como o da fila de emails (20261102140000): o endereço e o token vêm do Vault
-- (kangest_cron_url, kangest_cron_token); sem eles não faz nada. Nunca falha o deploy.
create or replace function private.run_kangest()
returns void
language plpgsql
security definer
set search_path = 'net, extensions'
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kangest_cron_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'kangest_cron_token' limit 1;
  if v_url is null or v_token is null then
    raise notice 'KanGest: faltam os segredos kangest_cron_url/kangest_cron_token no Vault.';
    return;
  end if;
  perform http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kangest-token', v_token),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function private.run_kangest() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('kangest') where exists (select 1 from cron.job where jobname = 'kangest');
  perform cron.schedule('kangest', '*/5 * * * *', 'select private.run_kangest()');
exception when others then
  raise notice 'Agendador do KanGest indisponível (%): corre-se pelo painel.', sqlerrm;
end
$$;
