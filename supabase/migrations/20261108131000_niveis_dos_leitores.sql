-- Níveis dos leitores e a Comunidade de Leitores (decisões do dono, 2026-11-08).
--
-- Toda a conta começa como «Conta nova». Ao pagar o primeiro livro passa a «Leitor» e entra na
-- Comunidade de Leitores; depois sobe por livros comprados: «Leitor assíduo» (5) e «Leitor de
-- honra» (15). São distintivos e reconhecimento: não mexem em preços.
--
-- · Conta como livro o que o site trata como tal (lib/productTypes.js, `isBook`): livro,
--   bíblia/hinário e lição/revista, em encomendas pagas e não canceladas, pela quantidade.
--   Itens antigos sem tipo contam como livro (o catálogo começou só com livros).
-- · Quem participa sem comprar também entra: conta com 30 dias e actividade em 5 dias
--   diferentes (os números ficam em `reader_settings` e editam-se no painel). Cada dia em que a
--   pessoa usa o site com a conta fica em `reader_activity_days` (só a data), e apaga-se quando
--   passa a Leitor.
-- · Uma vez Leitor, não se volta a «Conta nova»: um reembolso pode baixar o distintivo (de
--   assíduo para Leitor), nunca tirar a entrada na comunidade.
-- · Criar publicações na comunidade é para os Leitores (e a equipa). Sem compra, a pessoa lê,
--   gosta, responde e conversa com a loja. O que já foi publicado mantém-se.
-- · O nível e os contadores só mudam pelas funções daqui: uma escrita directa no perfil, pela
--   API, é ignorada (gatilho profiles_reader_guard).
--
-- Reverter: drop dos gatilhos orders_reader_level_ins/upd, community_posts_reader_gate e
-- profiles_reader_guard; drop das funções reader_* e community_reader_levels; drop das
-- tabelas reader_activity_days e reader_settings; drop das colunas reader_* de profiles.

-- ---------------------------------------------------------------------------
-- Definições
create table if not exists public.reader_settings (
  id boolean primary key default true,
  engage_enabled boolean not null default true,
  engage_min_days integer not null default 30,
  engage_active_days integer not null default 5,
  tier_assiduo integer not null default 5,
  tier_honra integer not null default 15,
  updated timestamptz not null default now(),
  constraint reader_settings_one_row check (id),
  constraint reader_settings_engage_min_days check (engage_min_days between 1 and 730),
  constraint reader_settings_engage_active_days check (engage_active_days between 1 and 365),
  constraint reader_settings_tier_assiduo check (tier_assiduo between 2 and 1000),
  constraint reader_settings_tier_honra check (tier_honra between 3 and 10000 and tier_honra > tier_assiduo)
);
comment on table public.reader_settings is
  'Regras dos níveis dos leitores (uma linha): a entrada sem compra e os livros de cada distintivo.';
insert into public.reader_settings (id) values (true) on conflict (id) do nothing;

alter table public.reader_settings enable row level security;
drop policy if exists "reader_settings: todos lêem" on public.reader_settings;
create policy "reader_settings: todos lêem" on public.reader_settings for select to anon, authenticated
  using (true);
-- Quem gere a comunidade (Gerir Catálogo) muda as regras.
drop policy if exists "reader_settings: comunidade edita" on public.reader_settings;
create policy "reader_settings: comunidade edita" on public.reader_settings for update to authenticated
  using ((select private.has_permission('manage_catalog')))
  with check ((select private.has_permission('manage_catalog')));
revoke insert, delete on public.reader_settings from anon, authenticated;

create or replace function private.reader_settings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := true;
  new.updated := now();
  return new;
end;
$$;
drop trigger if exists reader_settings_touch on public.reader_settings;
create trigger reader_settings_touch
  before update on public.reader_settings
  for each row execute function private.reader_settings_touch();

-- ---------------------------------------------------------------------------
-- O nível de cada conta
alter table public.profiles
  add column if not exists reader_level text not null default 'novo',
  add column if not exists reader_books integer not null default 0,
  add column if not exists reader_since timestamptz,
  add column if not exists reader_via text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_reader_level_check') then
    alter table public.profiles add constraint profiles_reader_level_check
      check (reader_level in ('novo', 'leitor', 'assiduo', 'honra'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_reader_via_check') then
    alter table public.profiles add constraint profiles_reader_via_check
      check (reader_via is null or reader_via in ('compra', 'participacao'));
  end if;
end
$$;
comment on column public.profiles.reader_level is
  'Nível do leitor: novo, leitor (1.º livro ou participação), assiduo, honra. Só muda por private.reader_recompute e public.reader_touch.';

-- Uma escrita directa pela API (authenticated/anon) não mexe no nível. Não é `security definer`
-- de propósito: `current_user` tem de ser quem escreve.
create or replace function private.profiles_reader_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.reader_level := 'novo';
      new.reader_books := 0;
      new.reader_since := null;
      new.reader_via := null;
    else
      new.reader_level := old.reader_level;
      new.reader_books := old.reader_books;
      new.reader_since := old.reader_since;
      new.reader_via := old.reader_via;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_reader_guard() from public, anon, authenticated;
drop trigger if exists profiles_reader_guard on public.profiles;
create trigger profiles_reader_guard
  before insert or update on public.profiles
  for each row execute function private.profiles_reader_guard();

-- Os dias em que a conta usou o site, até passar a Leitor (só a data, em Luanda).
create table if not exists public.reader_activity_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
comment on table public.reader_activity_days is
  'Dias em que uma conta nova usou o site, para a entrada na comunidade sem compra. Apagam-se quando passa a Leitor.';
alter table public.reader_activity_days enable row level security;
-- Sem políticas: só as funções do servidor lêem e escrevem.
revoke all on public.reader_activity_days from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo
create or replace function private.reader_level_rank(p_level text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'leitor' then 1 when 'assiduo' then 2 when 'honra' then 3 else 0 end;
$$;

-- Livros pagos de uma conta (pela quantidade).
create or replace function private.reader_books_of(p_profile uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(coalesce(case when (it ->> 'quantity') ~ '^\d{1,6}$' then (it ->> 'quantity')::integer end, 1), 0)), 0)::integer
  from public.orders o
  cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
  where o.customer_id = p_profile
    and o.payment_status = 'paid'
    and coalesce(o.status, '') <> 'cancelled'
    and coalesce(nullif(it ->> 'product_type', ''), 'livro') in ('livro', 'biblia', 'revista');
$$;

-- Aviso na conta (o sino do site) quando sobe de nível.
create or replace function private.reader_notify(p_profile uuid, p_level text, p_books integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_notifications (customer_id, kind, title, body, href)
  values (
    p_profile, 'community',
    case p_level
      when 'leitor' then 'Bem-vindo à Comunidade de Leitores'
      when 'assiduo' then 'Subiu de nível: Leitor assíduo'
      else 'Subiu de nível: Leitor de honra' end,
    case p_level
      when 'leitor' then 'Já pode criar publicações na comunidade: partilhe o que está a ler e entre no clube do livro.'
      else format('Já são %s livros connosco. Obrigado por ler!', p_books) end,
    case p_level when 'leitor' then '/comunidade' else '/profile' end
  );
exception when others then
  -- Sem a tabela de avisos (ou com outra regra nela), o nível muda na mesma.
  raise warning 'nível do leitor: aviso não criado (%)', sqlerrm;
end;
$$;

-- Recalcula o nível de uma conta a partir das encomendas pagas. `p_notify`: avisa quando sobe.
create or replace function private.reader_recompute(p_profile uuid, p_notify boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof public.profiles;
  v_cfg public.reader_settings;
  v_books integer;
  v_level text;
begin
  select * into v_prof from public.profiles where id = p_profile;
  if not found then return null; end if;
  select * into v_cfg from public.reader_settings where id;
  if not found then
    v_cfg.tier_assiduo := 5;
    v_cfg.tier_honra := 15;
  end if;

  v_books := private.reader_books_of(p_profile);
  v_level := case
    when v_books >= v_cfg.tier_honra then 'honra'
    when v_books >= v_cfg.tier_assiduo then 'assiduo'
    when v_books >= 1 or v_prof.reader_since is not null then 'leitor'
    else 'novo' end;

  if v_level is distinct from v_prof.reader_level or v_books is distinct from v_prof.reader_books then
    update public.profiles set
      reader_books = v_books,
      reader_level = v_level,
      reader_since = case when v_level <> 'novo' then coalesce(reader_since, now()) else reader_since end,
      reader_via = case when v_level <> 'novo' then coalesce(reader_via, case when v_books >= 1 then 'compra' else 'participacao' end)
                        else reader_via end
    where id = p_profile;
  end if;

  if v_level <> 'novo' then
    delete from public.reader_activity_days where profile_id = p_profile;
  end if;
  if p_notify and private.reader_level_rank(v_level) > private.reader_level_rank(v_prof.reader_level) then
    perform private.reader_notify(p_profile, v_level, v_books);
  end if;
  return v_level;
end;
$$;

revoke all on function private.reader_level_rank(text) from public, anon;
revoke all on function private.reader_books_of(uuid) from public, anon, authenticated;
revoke all on function private.reader_notify(uuid, text, integer) from public, anon, authenticated;
revoke all on function private.reader_recompute(uuid, boolean) from public, anon, authenticated;
grant execute on function private.reader_level_rank(text) to authenticated, service_role;
grant execute on function private.reader_recompute(uuid, boolean) to service_role;

-- As encomendas: ao ficar paga (ou ao deixar de estar), recalcula. Um erro aqui nunca impede a
-- escrita da encomenda — o nível corrige-se na mudança seguinte.
create or replace function private.orders_reader_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.customer_id is not null then
      perform private.reader_recompute(new.customer_id);
    end if;
    if tg_op = 'UPDATE' and old.customer_id is not null and old.customer_id is distinct from new.customer_id then
      perform private.reader_recompute(old.customer_id);
    end if;
  exception when others then
    raise warning 'nível do leitor: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.orders_reader_level() from public, anon, authenticated;

drop trigger if exists orders_reader_level_ins on public.orders;
create trigger orders_reader_level_ins
  after insert on public.orders
  for each row when (new.payment_status = 'paid' and new.customer_id is not null)
  execute function private.orders_reader_level();
drop trigger if exists orders_reader_level_upd on public.orders;
-- Sem lista de colunas ("after update of …") de propósito: o estado do pagamento muda dentro do
-- gatilho dos pagamentos registados, e um gatilho "of payment_status" só correria quando a coluna
-- vem no SET. A condição compara os valores, seja qual for o caminho.
create trigger orders_reader_level_upd
  after update on public.orders
  for each row when (
    old.payment_status is distinct from new.payment_status
    or old.status is distinct from new.status
    or old.customer_id is distinct from new.customer_id
    or old.items is distinct from new.items
  )
  execute function private.orders_reader_level();

-- ---------------------------------------------------------------------------
-- O estado da própria conta (cartão do perfil, comunidade).
create or replace function public.reader_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles;
  v_cfg public.reader_settings;
  v_days integer := 0;
begin
  if v_uid is null then return null; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found then return null; end if;
  select * into v_cfg from public.reader_settings where id;
  if v_prof.reader_level = 'novo' then
    select count(*) into v_days from public.reader_activity_days where profile_id = v_uid;
  end if;
  return jsonb_build_object(
    'level', v_prof.reader_level,
    'books', v_prof.reader_books,
    'since', v_prof.reader_since,
    'via', v_prof.reader_via,
    'staff', v_prof.role in ('admin', 'manager'),
    'tiers', jsonb_build_object('assiduo', v_cfg.tier_assiduo, 'honra', v_cfg.tier_honra),
    'engage', jsonb_build_object(
      'enabled', coalesce(v_cfg.engage_enabled, false),
      'min_days', v_cfg.engage_min_days,
      'active_days', v_cfg.engage_active_days,
      'account_days', greatest(0, floor(extract(epoch from (now() - v_prof.created)) / 86400))::integer,
      'days_active', v_days
    )
  );
end;
$$;
revoke all on function public.reader_status() from public, anon;
grant execute on function public.reader_status() to authenticated;

-- A conta está a usar o site hoje: conta o dia e, se já cumpre a regra da participação, entra
-- na comunidade. O site chama-a uma vez por dia por conta. Devolve o mesmo que reader_status.
create or replace function public.reader_touch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles;
  v_cfg public.reader_settings;
  v_days integer;
  v_age integer;
begin
  if v_uid is null then return null; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found then return null; end if;

  if v_prof.reader_level = 'novo' then
    insert into public.reader_activity_days (profile_id, day)
    values (v_uid, (now() at time zone 'Africa/Luanda')::date)
    on conflict do nothing;

    select * into v_cfg from public.reader_settings where id;
    if found and v_cfg.engage_enabled then
      select count(*) into v_days from public.reader_activity_days where profile_id = v_uid;
      v_age := floor(extract(epoch from (now() - v_prof.created)) / 86400);
      if v_age >= v_cfg.engage_min_days and v_days >= v_cfg.engage_active_days then
        update public.profiles
        set reader_level = 'leitor', reader_since = now(), reader_via = 'participacao'
        where id = v_uid and reader_level = 'novo';
        delete from public.reader_activity_days where profile_id = v_uid;
        perform private.reader_notify(v_uid, 'leitor', 0);
      end if;
    end if;
  end if;
  return public.reader_status();
end;
$$;
revoke all on function public.reader_touch() from public, anon;
grant execute on function public.reader_touch() to authenticated;

-- O distintivo de cada autor na comunidade, pela chave pública do leitor (nunca pelo id).
-- Só devolve quem já é Leitor; as contas novas não têm distintivo.
create or replace function public.community_reader_levels(p_keys text[])
returns table (reader_key text, level text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.reader_key, p.reader_level
  from public.profiles p
  where p.reader_key = any (coalesce(p_keys[1:200], '{}'::text[]))
    and p.reader_level <> 'novo';
$$;
revoke all on function public.community_reader_levels(text[]) from public;
grant execute on function public.community_reader_levels(text[]) to anon, authenticated;

-- Para a equipa: quantas contas há em cada nível, e por que caminho entraram.
create or replace function public.reader_levels_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Só para a equipa.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'novo', count(*) filter (where reader_level = 'novo'),
      'leitor', count(*) filter (where reader_level = 'leitor'),
      'assiduo', count(*) filter (where reader_level = 'assiduo'),
      'honra', count(*) filter (where reader_level = 'honra'),
      'por_compra', count(*) filter (where reader_via = 'compra'),
      'por_participacao', count(*) filter (where reader_via = 'participacao')
    )
    from public.profiles
    where role = 'member'
  );
end;
$$;
revoke all on function public.reader_levels_summary() from public, anon;
grant execute on function public.reader_levels_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Criar publicações é para os Leitores (e a equipa); responder e gostar, para todos. Corre
-- depois de community_posts_before_save (pela ordem do nome), que já pôs o autor.
create or replace function private.community_posts_reader_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
begin
  if new.parent_id is not null or auth.uid() is null or private.is_staff() then
    return new;
  end if;
  select p.reader_level into v_level from public.profiles p where p.id = auth.uid();
  if coalesce(v_level, 'novo') = 'novo' then
    raise exception 'Criar publicações é para os Leitores da comunidade: entra ao comprar o primeiro livro, ou ao fim de algum tempo a participar. Até lá, pode ler, gostar e responder.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.community_posts_reader_gate() from public, anon, authenticated;
drop trigger if exists community_posts_reader_gate on public.community_posts;
create trigger community_posts_reader_gate
  before insert on public.community_posts
  for each row execute function private.community_posts_reader_gate();

-- ---------------------------------------------------------------------------
-- Quem já comprou entra já, sem aviso (não acabou de comprar).
do $$
declare
  r record;
begin
  for r in
    select distinct o.customer_id
    from public.orders o
    where o.customer_id is not null and o.payment_status = 'paid'
  loop
    perform private.reader_recompute(r.customer_id, false);
  end loop;
end
$$;
