-- Painel de Gestão (gestao.livrariaadventista.ao; docs/PAINEL-GESTAO.md): as vendas de todas as livrarias ao vivo —
-- o balcão pelo KanGest e o site pelas encomendas pagas —, a meta de cada loja e o fecho de cada mês.
--
-- Decisões do dono (2026-11-19):
--   * meta por loja; a da empresa é a soma (ou uma própria, se for definida);
--   * a loja online conta como uma loja (alvo 'online'), com meta própria;
--   * os gerentes de loja vêem só a sua (permissão nova view_store_dashboard + a loja da ficha de funcionário);
--   * avisos à equipa quando uma loja passa a meta ou fica atrasada;
--   * modo TV na sede, com o ecrã dividido entre publicidade (painel_tv_midia) e o painel.
--
-- «Alvo» é a quem pertence uma venda ou uma meta: o id da loja (physical_stores), 'online', 'sem-loja' (um armazém do
-- KanGest que não está ligado a nenhuma loja) ou '' (a empresa, só nas metas e nos fechos). Os valores são com IVA, em Kz. As datas contam na hora de Angola (WAT, UTC+1, sem hora de Verão).

-- ---------------------------------------------------------------------------
-- 0. Hora de Angola
-- ---------------------------------------------------------------------------
create or replace function private.hora_luanda(p timestamptz)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select (p at time zone 'UTC') + interval '1 hour';
$$;

-- O instante (UTC) de uma data e hora de Angola.
create or replace function private.de_luanda(p timestamp)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p - interval '1 hour') at time zone 'UTC';
$$;

-- O mês em que o painel começou: os fechos automáticos começam aqui (as vendas trazidas de antes servem os
-- gráficos, mas não fecham meses que o painel não acompanhou desde o dia 1).
do $$
begin
  execute format(
    'create or replace function private.painel_inicio() returns date language sql immutable set search_path = '''' as $f$ select %L::date $f$',
    date_trunc('month', private.hora_luanda(now()))::date);
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Quem vê o quê
-- ---------------------------------------------------------------------------
-- Permissão nova: «Painel da sua loja» — o Painel de Gestão só das lojas da ficha de funcionário.
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs',
               'manage_production','manage_staff','manage_finance','edit_reports','manage_store_stock',
               'view_store_dashboard'];
$$;

-- Quem vê os relatórios (view_reports / edit_reports) vê todas as lojas e o online.
create or replace function private.painel_ve_tudo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_sales_reports();
$$;

-- As lojas do gerente: as da ficha de funcionário, com a permissão «Painel da sua loja».
create or replace function private.painel_lojas_proprias()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.has_permission('view_store_dashboard') then private.my_store_ids() else '{}'::text[] end;
$$;

create or replace function private.painel_pode_ver(p_alvo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.painel_ve_tudo() or coalesce(p_alvo = any (private.painel_lojas_proprias()), false);
$$;
-- usadas nas regras (RLS): quem pede tem de as poder executar
revoke all on function private.painel_ve_tudo(), private.painel_lojas_proprias(), private.painel_pode_ver(text) from public, anon;
grant execute on function private.painel_ve_tudo(), private.painel_lojas_proprias(), private.painel_pode_ver(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Vendas ao vivo
-- ---------------------------------------------------------------------------
create table if not exists public.vendas_ao_vivo (
  id bigint generated always as identity primary key,
  -- kangest:<ligação>:<id do documento> · site:<id da encomenda>. Único: o mesmo aviso duas vezes não conta duas.
  origem text not null unique,
  quando timestamptz not null,
  alvo text not null check (char_length(alvo) <= 60),
  canal text not null check (canal in ('balcao', 'online')),
  tipo text not null default '',
  numero text not null default '',
  -- com IVA; negativo nas notas de crédito
  total numeric(14, 2) not null,
  -- [{chave, referencia, book_id, titulo, quantidade, total}]
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  anulado boolean not null default false,
  criado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists vendas_ao_vivo_quando_idx on public.vendas_ao_vivo (quando desc);
create index if not exists vendas_ao_vivo_alvo_quando_idx on public.vendas_ao_vivo (alvo, quando desc);
alter table public.vendas_ao_vivo enable row level security;
revoke all on public.vendas_ao_vivo from anon, authenticated;
grant select on public.vendas_ao_vivo to authenticated;
drop policy if exists "vendas_ao_vivo: quem vê o painel" on public.vendas_ao_vivo;
create policy "vendas_ao_vivo: quem vê o painel" on public.vendas_ao_vivo
  for select to authenticated using ((select private.painel_pode_ver(alvo)));
comment on table public.vendas_ao_vivo is
  'Uma linha por venda: balcão (avisos documento.emitido do KanGest, pela Edge Function) e online (encomendas pagas, '
  'pelo gatilho orders_venda_ao_vivo). Lê-se pelo painel_gestao(). docs/PAINEL-GESTAO.md';

-- Os artigos de uma encomenda, no formato das vendas ao vivo (a chave é a referência do KanGest, quando o
-- produto a tem: as vendas do balcão e do site do mesmo livro juntam-se nos mais vendidos).
create or replace function private.itens_da_encomenda(p_items jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', coalesce(nullif(b.kigest_ref, ''), 'site:' || coalesce(it ->> 'book_id', '')),
           'referencia', coalesce(b.kigest_ref, ''),
           'book_id', it ->> 'book_id',
           'titulo', coalesce(nullif(it ->> 'title', ''), b.title, ''),
           'quantidade', greatest(coalesce((it ->> 'quantity')::numeric, 0), 0),
           'total', round(coalesce((it ->> 'price')::numeric, 0) * greatest(coalesce((it ->> 'quantity')::numeric, 0), 0), 2))), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it
  left join public.stock_books b on b.id = it ->> 'book_id';
$$;

-- Encomenda paga → venda online (sem os portes); deixa de estar paga (reembolso) → anulada.
create or replace function private.orders_venda_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.payment_status, '') = 'paid' and coalesce(old.payment_status, '') <> 'paid' then
    insert into public.vendas_ao_vivo (origem, quando, alvo, canal, tipo, numero, total, itens)
    values ('site:' || new.id, coalesce(new.paid_at, now()), 'online', 'online', 'ENC', coalesce(new.order_number, ''),
            greatest(coalesce(new.total, 0) - coalesce(new.shipping_cost, 0), 0), private.itens_da_encomenda(new.items))
    on conflict (origem) do update
      set quando = excluded.quando, total = excluded.total, itens = excluded.itens, anulado = false, actualizado = now();
  elsif coalesce(old.payment_status, '') = 'paid' and coalesce(new.payment_status, '') <> 'paid' then
    update public.vendas_ao_vivo set anulado = true, actualizado = now() where origem = 'site:' || new.id;
  end if;
  return new;
exception when others then
  -- o painel nunca impede um pagamento
  raise warning 'Painel de Gestão: venda online da encomenda % não registada (%).', new.id, sqlerrm;
  return new;
end;
$$;
drop trigger if exists orders_venda_ao_vivo on public.orders;
create trigger orders_venda_ao_vivo
  after update of payment_status on public.orders
  for each row execute function private.orders_venda_ao_vivo();

-- As encomendas pagas dos últimos 70 dias: os gráficos (média do mesmo dia da semana, 30 dias de cada loja)
-- começam com dados.
insert into public.vendas_ao_vivo (origem, quando, alvo, canal, tipo, numero, total, itens)
select 'site:' || o.id, coalesce(o.paid_at, o.created), 'online', 'online', 'ENC', coalesce(o.order_number, ''),
       greatest(coalesce(o.total, 0) - coalesce(o.shipping_cost, 0), 0), private.itens_da_encomenda(o.items)
from public.orders o
where o.payment_status = 'paid' and coalesce(o.paid_at, o.created) >= now() - interval '70 days'
on conflict (origem) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Metas
-- ---------------------------------------------------------------------------
create table if not exists public.metas (
  alvo text not null check (char_length(alvo) <= 60),
  ano int not null check (ano between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  valor numeric(16, 2) not null check (valor >= 0),
  definida_por uuid references public.profiles (id) on delete set null default auth.uid(),
  definida_em timestamptz not null default now(),
  primary key (alvo, ano, mes)
);
create index if not exists metas_definida_por_idx on public.metas (definida_por);
alter table public.metas enable row level security;
revoke all on public.metas from anon, authenticated;
grant select on public.metas to authenticated;
drop policy if exists "metas: quem vê o painel" on public.metas;
create policy "metas: quem vê o painel" on public.metas
  for select to authenticated using ((select private.painel_pode_ver(alvo)));

-- ---------------------------------------------------------------------------
-- 4. Fechos do mês (definitivos)
-- ---------------------------------------------------------------------------
create table if not exists public.fechos (
  alvo text not null check (char_length(alvo) <= 60),
  ano int not null,
  mes int not null check (mes between 1 and 12),
  vendido numeric(16, 2) not null default 0,
  meta numeric(16, 2),
  percentagem numeric(8, 2),
  vendas int not null default 0,
  ticket_medio numeric(14, 2),
  melhor_dia date,
  melhor_dia_total numeric(14, 2),
  top_artigo text not null default '',
  top_quantidade numeric not null default 0,
  balcao numeric(16, 2) not null default 0,
  online numeric(16, 2) not null default 0,
  fechado_em timestamptz not null default now(),
  primary key (alvo, ano, mes)
);
alter table public.fechos enable row level security;
revoke all on public.fechos from anon, authenticated;
grant select on public.fechos to authenticated;
drop policy if exists "fechos: quem vê o painel" on public.fechos;
create policy "fechos: quem vê o painel" on public.fechos
  for select to authenticated using ((select private.painel_pode_ver(alvo)));
comment on table public.fechos is
  'O resultado de cada mês, por loja (e online) e da empresa (alvo vazio): escreve-o private.fechar_mes no dia 1; não se edita.';

-- As metas de um mês: {alvo: valor} — '' é a empresa, 'online' a loja online, o resto ids de physical_stores;
-- null apaga. Só quem edita os relatórios; um mês já fechado não muda.
create or replace function public.definir_metas(p_ano int, p_mes int, p_metas jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  n int := 0;
begin
  if not (private.can_read_sales_reports() and private.has_permission('edit_reports')) then
    raise exception 'Sem permissão para definir metas.' using errcode = '42501';
  end if;
  if p_ano is null or p_ano not between 2000 and 2100 or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'Mês inválido.';
  end if;
  if jsonb_typeof(p_metas) is distinct from 'object' then
    raise exception 'Metas inválidas.';
  end if;
  if exists (select 1 from public.fechos where ano = p_ano and mes = p_mes) then
    raise exception 'O mês %/% já fechou: as metas ficam como estavam.', p_mes, p_ano;
  end if;
  for k, v in select key, value from jsonb_each(p_metas) loop
    if k <> '' and k <> 'online' and not exists (select 1 from public.physical_stores where id = k) then
      raise exception 'Loja desconhecida: %.', k;
    end if;
    if v is null or jsonb_typeof(v) = 'null' then
      delete from public.metas where alvo = k and ano = p_ano and mes = p_mes;
    else
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 then
        raise exception 'Meta inválida para %.', case when k = '' then 'a empresa' else k end;
      end if;
      insert into public.metas (alvo, ano, mes, valor, definida_por, definida_em)
      values (k, p_ano, p_mes, round((v #>> '{}')::numeric, 2), auth.uid(), now())
      on conflict (alvo, ano, mes) do update set valor = excluded.valor, definida_por = excluded.definida_por, definida_em = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.definir_metas(int, int, jsonb) from public, anon;
grant execute on function public.definir_metas(int, int, jsonb) to authenticated;

-- Proposta de meta para um mês, por alvo: a média dos três últimos meses fechados + 5 %, arredondada aos mil Kz.
create or replace function public.metas_proposta(p_ano int, p_mes int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_sales_reports() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(alvo, valor) from (
      select f.alvo, round(avg(f.vendido) * 1.05 / 1000) * 1000 as valor
      from (
        select alvo, vendido, row_number() over (partition by alvo order by ano desc, mes desc) as n
        from public.fechos
        where make_date(ano, mes, 1) < make_date(p_ano, p_mes, 1) and alvo <> ''
      ) f
      where f.n <= 3
      group by f.alvo
    ) x), '{}'::jsonb);
end;
$$;
revoke all on function public.metas_proposta(int, int) from public, anon;
grant execute on function public.metas_proposta(int, int) to authenticated;

-- A meta de um mês para um conjunto de alvos (null = todos) e um canal: a da empresa quando é tudo e foi
-- definida; senão a soma das lojas (balcão = sem o online; online = só o online).
create or replace function private.meta_do_ambito(p_alvos text[], p_canal text, p_ano int, p_mes int)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_alvos is null and p_canal is null and exists (select 1 from public.metas where alvo = '' and ano = p_ano and mes = p_mes)
      then (select valor from public.metas where alvo = '' and ano = p_ano and mes = p_mes)
    else (select sum(valor) from public.metas m
          where m.ano = p_ano and m.mes = p_mes and m.alvo <> ''
            and (p_alvos is null or m.alvo = any (p_alvos))
            and (p_canal is null or (p_canal = 'online') = (m.alvo = 'online')))
  end;
$$;

-- Fecha um mês: uma linha por alvo com vendas ou meta, e a da empresa (alvo vazio). Não volta a fechar.
create or replace function private.fechar_mes(p_ano int, p_mes int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini timestamptz := private.de_luanda(make_timestamp(p_ano, p_mes, 1, 0, 0, 0));
  v_fim timestamptz := private.de_luanda(make_timestamp(p_ano, p_mes, 1, 0, 0, 0) + interval '1 month');
  n int;
begin
  with v as (
    select alvo, canal, total, itens, private.hora_luanda(quando)::date as dia
    from public.vendas_ao_vivo where not anulado and quando >= v_ini and quando < v_fim
  ),
  alvos as (
    select alvo from v where alvo <> ''
    union select alvo from public.metas where ano = p_ano and mes = p_mes and alvo <> ''
  ),
  ambitos as (
    select alvo as chave, array[alvo] as membros from alvos
    union all select '', null::text[]
  ),
  r as (
    select a.chave,
           coalesce(sum(v.total), 0) as vendido,
           count(v.*) filter (where v.total > 0) as vendas,
           coalesce(sum(v.total) filter (where v.canal = 'balcao'), 0) as balcao,
           coalesce(sum(v.total) filter (where v.canal = 'online'), 0) as online
    from ambitos a left join v on (a.membros is null or v.alvo = any (a.membros))
    group by a.chave
  ),
  dias as (
    select a.chave, v.dia, sum(v.total) as total,
           row_number() over (partition by a.chave order by sum(v.total) desc, v.dia) as n
    from ambitos a join v on (a.membros is null or v.alvo = any (a.membros))
    group by a.chave, v.dia
  ),
  artigos as (
    select a.chave, max(i ->> 'titulo') as titulo, sum((i ->> 'quantidade')::numeric) as qtd,
           row_number() over (partition by a.chave order by sum((i ->> 'quantidade')::numeric) desc, max(i ->> 'titulo')) as n
    from ambitos a join v on (a.membros is null or v.alvo = any (a.membros))
    cross join lateral jsonb_array_elements(v.itens) i
    group by a.chave, i ->> 'chave'
  )
  insert into public.fechos (alvo, ano, mes, vendido, meta, percentagem, vendas, ticket_medio, melhor_dia, melhor_dia_total,
                             top_artigo, top_quantidade, balcao, online)
  select r.chave, p_ano, p_mes, r.vendido, m.meta,
         case when m.meta > 0 then round(r.vendido / m.meta * 100, 2) end,
         r.vendas, case when r.vendas > 0 then round(r.vendido / r.vendas, 2) end,
         d.dia, d.total, coalesce(t.titulo, ''), coalesce(t.qtd, 0), r.balcao, r.online
  from r
  cross join lateral (select private.meta_do_ambito(case when r.chave = '' then null else array[r.chave] end, null, p_ano, p_mes) as meta) m
  left join dias d on d.chave = r.chave and d.n = 1
  left join artigos t on t.chave = r.chave and t.n = 1
  on conflict (alvo, ano, mes) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.fechar_mes(int, int) from public, anon, authenticated;

-- Fecha os meses já acabados que ainda não fecharam (desde o início do painel). O agendador corre-a todos os dias.
create or replace function private.fechar_meses_em_falta()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := private.painel_inicio();
  v_mes_actual date := date_trunc('month', private.hora_luanda(now()))::date;
  n int := 0;
begin
  while d < v_mes_actual loop
    if not exists (select 1 from public.fechos where alvo = '' and ano = extract(year from d) and mes = extract(month from d)) then
      n := n + private.fechar_mes(extract(year from d)::int, extract(month from d)::int);
    end if;
    d := (d + interval '1 month')::date;
  end loop;
  return n;
end;
$$;
revoke all on function private.fechar_meses_em_falta() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Avisos: meta atingida (no momento) e loja atrasada (uma vez por semana)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_kinds text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.staff_notifications'::regclass and c.conname = 'staff_notifications_kind_check';
  select coalesce(array_agg(distinct coalesce(m[1], m[2])), array[]::text[]) into v_kinds
  from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''|[{,]([a-z_]+)(?=[,}])', 'g') as m;
  if v_def is not null and cardinality(v_kinds) = 0 then
    raise exception 'staff_notifications_kind_check com um formato inesperado: %', v_def;
  end if;
  if not ('meta_atingida' = any (v_kinds)) then v_kinds := v_kinds || 'meta_atingida'::text; end if;
  if not ('meta_atrasada' = any (v_kinds)) then v_kinds := v_kinds || 'meta_atrasada'::text; end if;
  alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
  execute format('alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind = any (array[%s]))',
    (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_kinds) as k));
end
$$;

-- Avisos já enviados: a meta atingida, uma vez por alvo e por mês; a loja atrasada, no máximo uma vez por semana.
create table if not exists public.painel_avisos (
  alvo text not null,
  ano int not null,
  mes int not null,
  tipo text not null check (tipo in ('meta_atingida', 'meta_atrasada')),
  enviado_em timestamptz not null default now(),
  primary key (alvo, ano, mes, tipo, enviado_em)
);
alter table public.painel_avisos enable row level security;
revoke all on public.painel_avisos from anon, authenticated;

-- Quem recebe os avisos de um alvo: a direcção (view_reports) e, numa loja, os gerentes dela.
create or replace function private.painel_destinatarios(p_alvo text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.role = 'admin' or (p.role = 'manager' and (p.permissions -> 'view_reports') = 'true'::jsonb)
  union
  select p.id from public.profiles p
  join public.staff_members m on m.profile_id = p.id and m.store_id = p_alvo and m.status <> 'saiu'
  where p.role = 'manager' and (p.permissions -> 'view_store_dashboard') = 'true'::jsonb;
$$;

create or replace function private.nome_do_alvo(p_alvo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_alvo when '' then 'A empresa' when 'online' then 'A loja online' when 'sem-loja' then 'Sem loja ligada'
         else coalesce((select name from public.physical_stores where id = p_alvo), 'A loja') end;
$$;

create or replace function private.fmt_kz(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,990'), ',', ' ') || ' Kz';
$$;

-- Depois de cada venda: o alvo dela (e a empresa) passou a meta do mês? Avisa uma vez.
create or replace function private.painel_meta_atingida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamp := private.hora_luanda(now());
  v_ano int := extract(year from v_agora);
  v_mes int := extract(month from v_agora);
  v_ini timestamptz := private.de_luanda(date_trunc('month', v_agora));
  a text;
  v_meta numeric;
  v_vendido numeric;
begin
  if new.anulado or new.total <= 0 or new.quando < v_ini then
    return new;
  end if;
  foreach a in array array[new.alvo, ''] loop
    continue when exists (select 1 from public.painel_avisos where alvo = a and ano = v_ano and mes = v_mes and tipo = 'meta_atingida');
    v_meta := private.meta_do_ambito(case when a = '' then null else array[a] end, null, v_ano, v_mes);
    continue when coalesce(v_meta, 0) <= 0;
    select coalesce(sum(total), 0) into v_vendido from public.vendas_ao_vivo
      where not anulado and quando >= v_ini and (a = '' or alvo = a);
    continue when v_vendido < v_meta;
    insert into public.painel_avisos (alvo, ano, mes, tipo) values (a, v_ano, v_mes, 'meta_atingida');
    insert into public.staff_notifications (staff_id, kind, title, body, severity)
    select d, 'meta_atingida', left(private.nome_do_alvo(a) || ' passou a meta do mês', 120),
           left(private.fmt_kz(v_vendido) || ' vendidos, meta de ' || private.fmt_kz(v_meta) || ' ('
                || round(v_vendido / v_meta * 100) || ' %). Painel de Gestão.', 500), 'high'
    from private.painel_destinatarios(a) d;
  end loop;
  return new;
exception when others then
  raise warning 'Painel de Gestão: aviso da meta não enviado (%).', sqlerrm;
  return new;
end;
$$;

-- Todos os dias (agendador): do dia 7 em diante, um alvo cuja projecção fica abaixo de 95 % da meta recebe um
-- aviso, no máximo um por semana.
create or replace function private.painel_avisos_atraso()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamp := private.hora_luanda(now());
  v_ano int := extract(year from v_agora);
  v_mes int := extract(month from v_agora);
  v_dia int := extract(day from v_agora);
  v_dias int := extract(day from (date_trunc('month', v_agora) + interval '1 month - 1 day'));
  v_ini timestamptz := private.de_luanda(date_trunc('month', v_agora));
  r record;
  n int := 0;
begin
  if v_dia < 7 then
    return 0;
  end if;
  for r in
    select x.alvo, x.meta, coalesce((select sum(total) from public.vendas_ao_vivo v
                                     where not v.anulado and v.quando >= v_ini and (x.alvo = '' or v.alvo = x.alvo)), 0) as vendido
    from (select m.alvo, private.meta_do_ambito(case when m.alvo = '' then null else array[m.alvo] end, null, v_ano, v_mes) as meta
          from (select alvo from public.metas where ano = v_ano and mes = v_mes union select '') m) x
    where coalesce(x.meta, 0) > 0
  loop
    continue when r.vendido / v_dia * v_dias >= r.meta * 0.95;
    continue when exists (select 1 from public.painel_avisos where alvo = r.alvo and tipo = 'meta_atrasada' and enviado_em > now() - interval '6 days 12 hours');
    insert into public.painel_avisos (alvo, ano, mes, tipo) values (r.alvo, v_ano, v_mes, 'meta_atrasada');
    insert into public.staff_notifications (staff_id, kind, title, body, severity)
    select d, 'meta_atrasada', left(private.nome_do_alvo(r.alvo) || ' está atrás da meta', 120),
           left('Ao ritmo actual chega a ' || private.fmt_kz(r.vendido / v_dia * v_dias) || ' (' || round(r.vendido / v_dia * v_dias / r.meta * 100)
                || ' % da meta de ' || private.fmt_kz(r.meta) || '). Faltam ' || private.fmt_kz(greatest(r.meta - r.vendido, 0)) || ' em '
                || (v_dias - v_dia + 1) || ' dias: ' || private.fmt_kz(greatest(r.meta - r.vendido, 0) / (v_dias - v_dia + 1)) || ' por dia.', 500), 'normal'
    from private.painel_destinatarios(r.alvo) d;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.painel_avisos_atraso() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Os números do painel
-- ---------------------------------------------------------------------------
-- As vendas de um âmbito (alvos: null = todos) e canal, desde uma data de Angola.
create or replace function private.painel_vendas(p_alvos text[], p_canal text, p_desde date)
returns table (t timestamp, quando timestamptz, alvo text, canal text, tipo text, numero text, total numeric, itens jsonb, anulado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.hora_luanda(v.quando), v.quando, v.alvo, v.canal, v.tipo, v.numero, v.total, v.itens, v.anulado
  from public.vendas_ao_vivo v
  where v.quando >= private.de_luanda(p_desde::timestamp)
    and (p_alvos is null or v.alvo = any (p_alvos))
    and (p_canal is null or v.canal = p_canal);
$$;
revoke all on function private.painel_vendas(text[], text, date) from public, anon, authenticated;

-- Tudo o que o ecrã mostra, num só pedido (o painel volta a pedi-lo a cada sinal «vendas»).
create or replace function public.painel_gestao(p_alvo text default null, p_canal text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- quem vê os relatórios vê tudo; o gerente de loja, só as lojas da sua ficha de funcionário
  v_tudo boolean := private.can_read_sales_reports();
  v_proprias text[] := case when private.has_permission('view_store_dashboard') then private.my_store_ids() else '{}'::text[] end;
  v_alvos text[];
  v_visiveis text[];
  v_agora timestamp := private.hora_luanda(now());
  v_hoje date := v_agora::date;
  v_ini date := date_trunc('month', v_agora)::date;
  v_dias int := ((date_trunc('month', v_agora) + interval '1 month')::date - date_trunc('month', v_agora)::date);
  v_dia int := extract(day from v_agora)::int;
  v_ano int := extract(year from v_agora)::int;
  v_mes int := extract(month from v_agora)::int;
  v_meta numeric;
  v_resumo jsonb;
  v_mes_total numeric;
begin
  if not v_tudo and cardinality(v_proprias) = 0 then
    raise exception 'Sem permissão para ver o Painel de Gestão.' using errcode = '42501';
  end if;
  if p_canal is not null and p_canal not in ('balcao', 'online') then
    raise exception 'Canal inválido.';
  end if;
  if coalesce(p_alvo, '') <> '' then
    if not (v_tudo or p_alvo = any (v_proprias)) then
      raise exception 'Sem permissão para ver esta loja.' using errcode = '42501';
    end if;
    v_alvos := array[p_alvo];
  elsif not v_tudo then
    v_alvos := v_proprias;
  end if;
  -- as lojas que esta pessoa pode escolher (e o online, para a direcção)
  v_visiveis := case when v_tudo
    then array(select id from public.physical_stores where active order by name) || array['online']
    else v_proprias end;

  select jsonb_build_object(
           'hoje', coalesce(sum(total) filter (where t::date = v_hoje), 0),
           'hoje_vendas', count(*) filter (where t::date = v_hoje and total > 0),
           'ontem', coalesce(sum(total) filter (where t::date = v_hoje - 1), 0),
           'semana_passada', coalesce(sum(total) filter (where t::date = v_hoje - 7 and t::time <= v_agora::time), 0),
           'mes', coalesce(sum(total) filter (where t >= v_ini), 0),
           'mes_vendas', count(*) filter (where t >= v_ini and total > 0)),
         coalesce(sum(total) filter (where t >= v_ini), 0)
    into v_resumo, v_mes_total
  from private.painel_vendas(v_alvos, p_canal, least(v_ini, v_hoje - 7)) where not anulado;

  v_meta := private.meta_do_ambito(v_alvos, p_canal, v_ano, v_mes);
  v_resumo := v_resumo || jsonb_build_object(
    'hoje_itens', coalesce((select sum((i ->> 'quantidade')::numeric) from private.painel_vendas(v_alvos, p_canal, v_hoje) s
                            cross join lateral jsonb_array_elements(s.itens) i where not s.anulado and s.total > 0), 0),
    'meta', v_meta,
    'percentagem', case when v_meta > 0 then round(v_mes_total / v_meta * 100, 1) end,
    'falta', case when v_meta > 0 then greatest(v_meta - v_mes_total, 0) end,
    'ritmo_necessario', case when v_meta > 0 then round(greatest(v_meta - v_mes_total, 0) / greatest(v_dias - v_dia + 1, 1), 2) end,
    'ritmo_ideal', case when v_meta > 0 then round(v_meta * v_dia / v_dias, 2) end,
    'projeccao', round(v_mes_total / greatest(v_dia, 1) * v_dias, 2),
    'ticket_medio', case when (v_resumo ->> 'mes_vendas')::int > 0 then round(v_mes_total / (v_resumo ->> 'mes_vendas')::int, 2) end);

  return jsonb_build_object(
    'agora', to_char(v_agora, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'ano', v_ano, 'mes', v_mes, 'dia', v_dia, 'dias_mes', v_dias,
    've_tudo', v_tudo,
    'alvo', coalesce(p_alvo, ''), 'canal', p_canal,
    'alvos', (select coalesce(jsonb_agg(jsonb_build_object('id', a, 'nome', private.nome_do_alvo(a)) order by ord), '[]'::jsonb)
              from unnest(v_visiveis) with ordinality as x(a, ord)),
    'resumo', v_resumo,
    -- cada dia do mês: vendido e acumulado (os dias que ainda não chegaram vêm vazios)
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'total', x.total, 'vendas', x.vendas, 'acumulado', x.acumulado)
                                       order by x.dia), '[]'::jsonb)
             from (select extract(day from g.d)::int as dia, s.total, coalesce(s.vendas, 0) as vendas,
                          case when g.d::date <= v_hoje then sum(coalesce(s.total, 0)) over (order by g.d) end as acumulado
                   from generate_series(v_ini::timestamp, (v_ini + v_dias - 1)::timestamp, interval '1 day') as g(d)
                   left join (select t::date as dia, sum(total) as total, count(*) filter (where total > 0) as vendas
                              from private.painel_vendas(v_alvos, p_canal, v_ini) where not anulado group by 1) s on s.dia = g.d::date) x),
    -- hoje, hora a hora, e a média do mesmo dia da semana nas 8 semanas anteriores
    'horas', (select jsonb_agg(jsonb_build_object('hora', h, 'hoje', case when h <= extract(hour from v_agora) then coalesce(a.total, 0) end,
                                                  'media', round(coalesce(b.total, 0) / 8, 2)) order by h)
              from generate_series(0, 23) as g(h)
              left join (select extract(hour from t)::int as hora, sum(total) as total
                         from private.painel_vendas(v_alvos, p_canal, v_hoje) where not anulado and t::date = v_hoje group by 1) a on a.hora = h
              left join (select extract(hour from t)::int as hora, sum(total) as total
                         from private.painel_vendas(v_alvos, p_canal, v_hoje - 56)
                         where not anulado and t::date < v_hoje and extract(isodow from t) = extract(isodow from v_hoje) group by 1) b on b.hora = h),
    -- cada loja (e o online): o mês, hoje, a meta e os últimos 30 dias
    'lojas', (select coalesce(jsonb_agg(l order by (l ->> 'ordem')::numeric desc nulls last, l ->> 'nome'), '[]'::jsonb) from (
               select jsonb_build_object(
                        'id', a, 'nome', private.nome_do_alvo(a),
                        'mes', coalesce(sum(s.total) filter (where s.t >= v_ini), 0),
                        'hoje', coalesce(sum(s.total) filter (where s.t::date = v_hoje), 0),
                        'meta', private.meta_do_ambito(array[a], p_canal, v_ano, v_mes),
                        'percentagem', case when private.meta_do_ambito(array[a], p_canal, v_ano, v_mes) > 0
                                            then round(coalesce(sum(s.total) filter (where s.t >= v_ini), 0) / private.meta_do_ambito(array[a], p_canal, v_ano, v_mes) * 100, 1) end,
                        'ordem', case when private.meta_do_ambito(array[a], p_canal, v_ano, v_mes) > 0
                                      then coalesce(sum(s.total) filter (where s.t >= v_ini), 0) / private.meta_do_ambito(array[a], p_canal, v_ano, v_mes) end,
                        'ultimo', (select max(quando) from public.vendas_ao_vivo where alvo = a),
                        'trinta', (select jsonb_agg(coalesce(z.total, 0) order by g2.d)
                                   from generate_series((v_hoje - 29)::timestamp, v_hoje::timestamp, interval '1 day') as g2(d)
                                   left join (select t::date as dia, sum(total) as total from private.painel_vendas(array[a], p_canal, v_hoje - 29)
                                              where not anulado group by 1) z on z.dia = g2.d::date)) as l
               from unnest(v_visiveis) as x(a)
               left join private.painel_vendas(null, p_canal, v_ini) s on s.alvo = x.a and not s.anulado
               where p_canal is null or (p_canal = 'online') = (a = 'online')
               group by a) q),
    -- mais vendidos de hoje (com a posição de ontem) e do mês, por quantidade
    'mais_vendidos_hoje', private.painel_top(v_alvos, p_canal, v_hoje, v_hoje),
    'mais_vendidos_mes', private.painel_top(v_alvos, p_canal, v_ini, v_hoje),
    'ultimas', (select coalesce(jsonb_agg(u order by u ->> 'quando' desc), '[]'::jsonb) from (
                 select jsonb_build_object('quando', to_char(s.t, 'YYYY-MM-DD"T"HH24:MI:SS'), 'alvo', s.alvo, 'loja', private.nome_do_alvo(s.alvo),
                                           'canal', s.canal, 'tipo', s.tipo, 'numero', s.numero, 'total', s.total, 'anulado', s.anulado,
                                           'artigo', s.itens -> 0 ->> 'titulo', 'quantidade', (s.itens -> 0 ->> 'quantidade')::numeric,
                                           'artigos', jsonb_array_length(s.itens)) as u
                 from private.painel_vendas(v_alvos, p_canal, v_hoje - 1) s
                 order by s.quando desc limit 30) x),
    -- os últimos 12 meses fechados e o mês em curso
    'meses', (select coalesce(jsonb_agg(m order by (m ->> 'ano')::int, (m ->> 'mes')::int), '[]'::jsonb) from (
               select jsonb_build_object('ano', f.ano, 'mes', f.mes,
                        'vendido', sum(case p_canal when 'balcao' then f.balcao when 'online' then f.online else f.vendido end),
                        -- a meta do fecho; com um canal escolhido, a desse canal
                        'meta', case when p_canal is null then sum(f.meta) else private.meta_do_ambito(v_alvos, p_canal, f.ano, f.mes) end,
                        'fechado', true) as m
               from public.fechos f
               where (v_alvos is null and f.alvo = '') or (v_alvos is not null and f.alvo = any (v_alvos))
               group by f.ano, f.mes
               order by f.ano desc, f.mes desc limit 12) x)
             || jsonb_build_array(jsonb_build_object('ano', v_ano, 'mes', v_mes, 'vendido', v_mes_total, 'meta', v_meta, 'fechado', false)),
    'ultimo_dado', (select to_char(private.hora_luanda(max(quando)), 'YYYY-MM-DD"T"HH24:MI:SS') from public.vendas_ao_vivo
                    where v_alvos is null or alvo = any (v_alvos))
  );
end;
$$;
revoke all on function public.painel_gestao(text, text) from public, anon;
grant execute on function public.painel_gestao(text, text) to authenticated;

-- Os 10 mais vendidos de um período (por quantidade), com a capa do produto do site e, num só dia, a posição na
-- véspera.
create or replace function private.painel_top(p_alvos text[], p_canal text, p_de date, p_ate date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with itens as (
    select s.t::date as dia, i ->> 'chave' as chave, i ->> 'titulo' as titulo, nullif(i ->> 'book_id', '') as book_id,
           nullif(i ->> 'referencia', '') as referencia, (i ->> 'quantidade')::numeric as qtd, (i ->> 'total')::numeric as total
    from private.painel_vendas(p_alvos, p_canal, p_de - 1) s
    cross join lateral jsonb_array_elements(s.itens) i
    where not s.anulado and s.t::date <= p_ate
  ),
  periodo as (
    select chave, max(titulo) as titulo, max(book_id) as book_id, max(referencia) as referencia, sum(qtd) as quantidade, sum(total) as total,
           row_number() over (order by sum(qtd) desc, sum(total) desc, chave) as posicao
    from itens where dia between p_de and p_ate group by chave
  ),
  vespera as (
    select chave, row_number() over (order by sum(qtd) desc, sum(total) desc, chave) as posicao
    from itens where p_de = p_ate and dia = p_de - 1 group by chave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'posicao', p.posicao, 'chave', p.chave, 'titulo', coalesce(nullif(b.title, ''), p.titulo), 'quantidade', p.quantidade,
           'total', p.total, 'capa', coalesce(nullif(b.cover_image, ''), nullif(b.cover, '')),
           'posicao_ontem', v.posicao) order by p.posicao), '[]'::jsonb)
  from periodo p
  left join vespera v on v.chave = p.chave
  left join lateral (select title, cover_image, cover from public.stock_books
                     where id = p.book_id or (p.book_id is null and p.referencia is not null and kigest_ref = p.referencia)
                     limit 1) b on true
  where p.posicao <= 10 and p.quantidade > 0;
$$;
revoke all on function private.painel_top(text[], text, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Publicidade do modo TV
-- ---------------------------------------------------------------------------
create table if not exists public.painel_tv_midia (
  id bigint generated always as identity primary key,
  ordem int not null default 0,
  tipo text not null check (tipo in ('video', 'imagem', 'youtube')),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  titulo text not null default '' check (char_length(titulo) <= 120),
  -- imagens e vídeos do YouTube: quanto tempo ficam no ecrã; os vídeos passam até ao fim
  duracao_s int not null default 15 check (duracao_s between 3 and 3600),
  activo boolean not null default true,
  criado timestamptz not null default now()
);
alter table public.painel_tv_midia enable row level security;
revoke all on public.painel_tv_midia from anon, authenticated;
grant select, insert, update, delete on public.painel_tv_midia to authenticated;
drop policy if exists "painel_tv_midia: quem vê o painel" on public.painel_tv_midia;
create policy "painel_tv_midia: quem vê o painel" on public.painel_tv_midia
  for select to authenticated
  using ((select private.painel_ve_tudo()) or cardinality((select private.painel_lojas_proprias())) > 0);
drop policy if exists "painel_tv_midia: configurações ou relatórios" on public.painel_tv_midia;
create policy "painel_tv_midia: configurações ou relatórios" on public.painel_tv_midia
  for all to authenticated
  using ((select private.has_permission('manage_settings')) or (select private.has_permission('edit_reports')))
  with check ((select private.has_permission('manage_settings')) or (select private.has_permission('edit_reports')));

-- ---------------------------------------------------------------------------
-- 8. Sinais em tempo real e gatilhos
-- ---------------------------------------------------------------------------
create or replace function private.vendas_ao_vivo_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'vendas', jsonb_build_object('alvo', new.alvo));
  return new;
end;
$$;
drop trigger if exists vendas_ao_vivo_sinal on public.vendas_ao_vivo;
create trigger vendas_ao_vivo_sinal
  after insert or update on public.vendas_ao_vivo
  for each row execute function private.vendas_ao_vivo_sinal();
drop trigger if exists vendas_ao_vivo_meta on public.vendas_ao_vivo;
create trigger vendas_ao_vivo_meta
  after insert on public.vendas_ao_vivo
  for each row execute function private.painel_meta_atingida();

create or replace function private.metas_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'vendas', '{}'::jsonb);
  return null;
end;
$$;
drop trigger if exists metas_sinal on public.metas;
create trigger metas_sinal
  after insert or update or delete on public.metas
  for each statement execute function private.metas_sinal();

-- ---------------------------------------------------------------------------
-- 9. Agendador: fecho do mês e avisos de atraso, todos os dias às 00:15 de Angola (23:15 UTC)
-- ---------------------------------------------------------------------------
create or replace function private.painel_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fechar_meses_em_falta();
  perform private.painel_avisos_atraso();
end;
$$;
revoke all on function private.painel_diario() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('painel-gestao') where exists (select 1 from cron.job where jobname = 'painel-gestao');
  perform cron.schedule('painel-gestao', '15 23 * * *', 'select private.painel_diario()');
exception when others then
  raise notice 'Agendador do Painel de Gestão indisponível (%): os meses fecham ao abrir o painel.', sqlerrm;
end
$$;
