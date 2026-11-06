-- Colportores: candidatura pública, aprovação, código CPT-, ligação à conta e percentagens.
--
-- Como a Igreja organiza a colportagem (Working Policy, FP 65–75):
-- · categorias: Aspirante (cartão de identificação) → Licenciado → Credenciado (12 meses e os
--   requisitos do campo), mais Estudante (plano de bolsa) e Tempo parcial;
-- · reclassificação anual pelas horas e relatórios; o pastor e a igreja recomendam.
--
-- Decisões:
-- · Não há papel novo em profiles.role: ser colportor é ter uma linha activa aqui com
--   profile_id. Um colportor nunca ganha acesso de equipa, e as ~20 verificações
--   role in ('admin','manager') ficam como estão.
-- · O código CPT-0001 só nasce na aprovação (os recusados não gastam números) e nunca muda.
--   COL- não serve: é o prefixo dos produtos de colportagem.
-- · Candidatura sem conta (decisão do dono: o registo por email ainda não entrega a
--   confirmação). Entra pela Edge Function, com limite por IP; aqui valida-se tudo de novo.
-- · Ligar a conta: a equipa gera um convite de uso único (14 dias por omissão) e envia-o por
--   WhatsApp; o colportor entra (Google) e o convite liga a conta. Guarda-se só o hash.
-- · Percentagens: regras por categoria × tipo de produto × modo de venda, com validade; a
--   excepção de um colportor ganha sempre. Mudar uma regra fecha a antiga e abre outra, para
--   o histórico não mudar. Cada venda (fase 3) guarda a percentagem aplicada.
-- · Estado, categoria, código e conta só mudam pelas funções (que deixam rasto em
--   colporteur_events); o resto da ficha edita-se directamente, com RLS.
--
-- Reverter: drop das funções colporteur_*, das tabelas colporteur_* e colporteurs, e repor
-- formata_codigo / normalize_person_code de 20261106033302.

-- 1. Códigos -------------------------------------------------------------------------------
insert into private.product_code_counters (prefix, last_value) values ('CPT-', 0)
on conflict (prefix) do nothing;

create or replace function private.formata_codigo(p_prefix text, p_numero integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefix || lpad(p_numero::text, case p_prefix when 'CLI-' then 6 when 'CPT-' then 4 else 3 end, '0');
$$;
revoke all on function private.formata_codigo(text, integer) from public, anon, authenticated;

-- Aceita "cpt7", "CPT-0007", " cpt 0007 ", como CLI e FUN.
create or replace function public.normalize_person_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when m is null or upper(m[1]) not in ('CLI', 'FUN', 'CPT') then upper(btrim(coalesce(p, '')))
    else upper(m[1]) || '-' || lpad(m[2], case upper(m[1]) when 'CLI' then 6 when 'CPT' then 4 else 3 end, '0')
  end
  from (select regexp_match(coalesce(p, ''), '^\s*([a-zA-Z]{3})[-\s]?0*([0-9]+)\s*$') as m) x;
$$;

-- 2. Definições ------------------------------------------------------------------------------
create table if not exists public.colporteur_settings (
  id smallint primary key default 1 check (id = 1),
  base_pct numeric(5,2) not null default 0 check (base_pct between 0 and 100),
  full_time_weekly_hours integer not null default 35 check (full_time_weekly_hours between 1 and 80),
  licensed_months integer not null default 6 check (licensed_months between 0 and 60),
  licensed_hours integer not null default 600 check (licensed_hours >= 0),
  credentialed_months integer not null default 12 check (credentialed_months between 0 and 120),
  credentialed_hours integer not null default 1200 check (credentialed_hours >= 0),
  default_credit_limit numeric(12,2) not null default 0 check (default_credit_limit >= 0),
  settlement_days integer not null default 30 check (settlement_days between 1 and 365),
  invite_days integer not null default 14 check (invite_days between 1 and 90),
  applications_open boolean not null default true,
  application_note text not null default '' check (length(application_note) <= 1000),
  updated timestamptz not null default now(),
  updated_by uuid
);
insert into public.colporteur_settings (id) values (1) on conflict (id) do nothing;
comment on table public.colporteur_settings is 'Definições da colportagem (uma linha). base_pct = percentagem quando nenhuma regra se aplica; 0 até a equipa a definir.';

-- 3. Colportores -----------------------------------------------------------------------------
create table if not exists public.colporteurs (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code is null or code ~ '^CPT-[0-9]{4,}$'),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  phone text not null check (phone ~ '^9[0-9]{8}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  church_id uuid references public.churches(id) on delete restrict,
  church_other text not null default '' check (length(church_other) <= 120),
  province_id text references public.angola_provinces(id) on delete set null,
  municipality_id text references public.angola_municipalities(id) on delete set null,
  territory text not null default '' check (length(territory) <= 300),
  category text not null default 'aspirante'
    check (category in ('aspirante', 'estudante', 'tempo_parcial', 'licenciado', 'credenciado')),
  requested_category text not null default 'aspirante'
    check (requested_category in ('aspirante', 'estudante', 'tempo_parcial', 'licenciado', 'credenciado')),
  weekly_hours integer check (weekly_hours is null or weekly_hours between 0 and 80),
  is_student boolean not null default false,
  school text not null default '' check (length(school) <= 120),
  recommended_by_pastor_id uuid references public.pastors(id) on delete set null,
  recommended_by_name text not null default '' check (length(recommended_by_name) <= 120),
  recommendation_ok boolean not null default false,
  motivation text not null default '' check (length(motivation) <= 1000),
  status text not null default 'candidatura'
    check (status in ('candidatura', 'em_analise', 'activo', 'suspenso', 'inactivo', 'recusado')),
  status_reason text not null default '' check (length(status_reason) <= 500),
  credit_limit numeric(12,2) check (credit_limit is null or credit_limit >= 0),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  start_date date,
  consent_at timestamptz not null default now(),
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
-- Um telefone não pode ter duas candidaturas ou fichas em aberto.
create unique index if not exists colporteurs_telefone_em_aberto on public.colporteurs (phone)
  where status in ('candidatura', 'em_analise', 'activo', 'suspenso');
create index if not exists colporteurs_church_idx on public.colporteurs (church_id);
create index if not exists colporteurs_status_idx on public.colporteurs (status);
comment on table public.colporteurs is 'Colportores e candidatos. code (CPT-) nasce na aprovação. Ser colportor = linha activa com profile_id.';

create table if not exists public.colporteur_events (
  id bigint generated always as identity primary key,
  colporteur_id uuid not null references public.colporteurs(id) on delete cascade,
  kind text not null check (kind in ('candidatura', 'estado', 'categoria', 'convite', 'conta', 'percentagem', 'nota')),
  detail jsonb not null default '{}'::jsonb,
  actor uuid,
  created timestamptz not null default now()
);
create index if not exists colporteur_events_colporteur_idx on public.colporteur_events (colporteur_id, created desc);
comment on table public.colporteur_events is 'Rasto de cada colportor: candidatura, mudanças de estado e categoria, convites, ligação da conta.';

create table if not exists public.colporteur_invites (
  id uuid primary key default gen_random_uuid(),
  colporteur_id uuid not null references public.colporteurs(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  created_by uuid,
  created timestamptz not null default now()
);

-- 4. Percentagens ------------------------------------------------------------------------------
create table if not exists public.colporteur_commission_rules (
  id uuid primary key default gen_random_uuid(),
  category text check (category is null or category in ('aspirante', 'estudante', 'tempo_parcial', 'licenciado', 'credenciado')),
  product_type text check (product_type is null or length(product_type) between 1 and 40),
  sale_mode text check (sale_mode is null or sale_mode in ('consignacao', 'compra', 'site')),
  pct numeric(5,2) not null check (pct between 0 and 100),
  valid_from date not null default current_date,
  valid_to date,
  notes text not null default '' check (length(notes) <= 300),
  created_by uuid,
  created timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists colporteur_rules_uma_aberta on public.colporteur_commission_rules
  (coalesce(category, '*'), coalesce(product_type, '*'), coalesce(sale_mode, '*')) where valid_to is null;
comment on table public.colporteur_commission_rules is 'Percentagem por categoria × tipo de produto × modo de venda. Nulo = todos. valid_to nulo = em vigor.';

create table if not exists public.colporteur_commission_overrides (
  id uuid primary key default gen_random_uuid(),
  colporteur_id uuid not null references public.colporteurs(id) on delete cascade,
  product_type text check (product_type is null or length(product_type) between 1 and 40),
  sale_mode text check (sale_mode is null or sale_mode in ('consignacao', 'compra', 'site')),
  pct numeric(5,2) not null check (pct between 0 and 100),
  valid_from date not null default current_date,
  valid_to date,
  reason text not null default '' check (length(reason) <= 300),
  created_by uuid,
  created timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists colporteur_overrides_uma_aberta on public.colporteur_commission_overrides
  (colporteur_id, coalesce(product_type, '*'), coalesce(sale_mode, '*')) where valid_to is null;

-- 5. Guardas e rasto ------------------------------------------------------------------------------
create or replace function private.can_manage_colporteurs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role' or private.has_permission('manage_colporteurs');
$$;
revoke all on function private.can_manage_colporteurs() from public, anon;
grant execute on function private.can_manage_colporteurs() to authenticated, service_role;

create or replace function private.assert_colporteurs()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_colporteurs() then
    raise exception 'Sem permissão para gerir colportores.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_colporteurs() from public, anon;
grant execute on function private.assert_colporteurs() to authenticated, service_role;

-- Estado, categoria, código, conta e aprovação só mudam pelas funções (que marcam a sessão).
create or replace function private.colporteurs_guarda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.colporteur_rpc', true), '') <> '1' and auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.code := null; new.profile_id := null; new.status := 'candidatura'; new.category := 'aspirante';
      new.approved_by := null; new.approved_at := null;
    elsif new.code is distinct from old.code or new.profile_id is distinct from old.profile_id
       or new.status is distinct from old.status or new.category is distinct from old.category
       or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
      raise exception 'Estado, categoria, código e conta mudam-se pelos botões próprios (ficam no histórico).' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.code is not null and new.code is distinct from old.code then
    raise exception 'O código do colportor não muda.' using errcode = '42501';
  end if;
  -- O código nasce na primeira activação.
  if new.status = 'activo' and new.code is null then
    new.code := private.formata_codigo('CPT-', private.codigo_seguinte('CPT-'));
  end if;
  -- Igreja → província e município por omissão.
  if new.church_id is not null and (new.province_id is null) then
    select c.province_id, coalesce(new.municipality_id, c.municipality_id) into new.province_id, new.municipality_id
      from public.churches c where c.id = new.church_id;
  end if;
  new.full_name := btrim(new.full_name);
  new.email := lower(btrim(new.email));
  return new;
end;
$$;
revoke all on function private.colporteurs_guarda() from public, anon, authenticated;
drop trigger if exists colporteurs_a_guarda on public.colporteurs;
create trigger colporteurs_a_guarda before insert or update on public.colporteurs
  for each row execute function private.colporteurs_guarda();
drop trigger if exists colporteur_settings_set_updated on public.colporteur_settings;
create trigger colporteur_settings_set_updated before update on public.colporteur_settings
  for each row execute function public.set_updated();
drop trigger if exists colporteurs_set_updated on public.colporteurs;
create trigger colporteurs_set_updated before update on public.colporteurs
  for each row execute function public.set_updated();

create or replace function private.colporteur_log(p_colporteur uuid, p_kind text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.colporteur_events (colporteur_id, kind, detail, actor) values (p_colporteur, p_kind, coalesce(p_detail, '{}'), auth.uid());
$$;
revoke all on function private.colporteur_log(uuid, text, jsonb) from public, anon, authenticated;

-- 6. RLS ----------------------------------------------------------------------------------------
alter table public.colporteur_settings enable row level security;
alter table public.colporteurs enable row level security;
alter table public.colporteur_events enable row level security;
alter table public.colporteur_invites enable row level security;
alter table public.colporteur_commission_rules enable row level security;
alter table public.colporteur_commission_overrides enable row level security;

revoke all on public.colporteur_settings, public.colporteurs, public.colporteur_events, public.colporteur_invites,
  public.colporteur_commission_rules, public.colporteur_commission_overrides from public, anon, authenticated;
grant all on public.colporteur_settings, public.colporteurs, public.colporteur_events, public.colporteur_invites,
  public.colporteur_commission_rules, public.colporteur_commission_overrides to service_role;
grant select, update on public.colporteur_settings to authenticated;
grant select, insert, update, delete on public.colporteurs to authenticated;
grant select on public.colporteur_events, public.colporteur_commission_rules, public.colporteur_commission_overrides to authenticated;
-- Os convites não se lêem pela API: só as funções.

drop policy if exists "colporteur_settings: equipa lê" on public.colporteur_settings;
create policy "colporteur_settings: equipa lê" on public.colporteur_settings for select to authenticated
  using ((select private.can_manage_colporteurs()));
drop policy if exists "colporteur_settings: equipa edita" on public.colporteur_settings;
create policy "colporteur_settings: equipa edita" on public.colporteur_settings for update to authenticated
  using ((select private.can_manage_colporteurs())) with check ((select private.can_manage_colporteurs()));

drop policy if exists "colporteurs: equipa ou o próprio lê" on public.colporteurs;
create policy "colporteurs: equipa ou o próprio lê" on public.colporteurs for select to authenticated
  using ((select private.can_manage_colporteurs()) or profile_id = (select auth.uid()));
drop policy if exists "colporteurs: equipa cria" on public.colporteurs;
create policy "colporteurs: equipa cria" on public.colporteurs for insert to authenticated
  with check ((select private.can_manage_colporteurs()));
drop policy if exists "colporteurs: equipa edita" on public.colporteurs;
create policy "colporteurs: equipa edita" on public.colporteurs for update to authenticated
  using ((select private.can_manage_colporteurs())) with check ((select private.can_manage_colporteurs()));
drop policy if exists "colporteurs: equipa apaga candidaturas" on public.colporteurs;
create policy "colporteurs: equipa apaga candidaturas" on public.colporteurs for delete to authenticated
  using ((select private.can_manage_colporteurs()) and code is null);

drop policy if exists "colporteur_events: equipa ou o próprio lê" on public.colporteur_events;
create policy "colporteur_events: equipa ou o próprio lê" on public.colporteur_events for select to authenticated
  using ((select private.can_manage_colporteurs())
         or exists (select 1 from public.colporteurs c where c.id = colporteur_id and c.profile_id = (select auth.uid())));

drop policy if exists "colporteur_rules: equipa lê" on public.colporteur_commission_rules;
create policy "colporteur_rules: equipa lê" on public.colporteur_commission_rules for select to authenticated
  using ((select private.can_manage_colporteurs()));
drop policy if exists "colporteur_overrides: equipa ou o próprio lê" on public.colporteur_commission_overrides;
create policy "colporteur_overrides: equipa ou o próprio lê" on public.colporteur_commission_overrides for select to authenticated
  using ((select private.can_manage_colporteurs())
         or exists (select 1 from public.colporteurs c where c.id = colporteur_id and c.profile_id = (select auth.uid())));

-- 7. Percentagem aplicável -------------------------------------------------------------------------
-- A mesma regra está em app/web/src/lib/colporteurCommission.js (para a simulação no painel):
-- excepção do colportor (mais específica primeiro) > regra mais específica (categoria vale 4,
-- tipo de produto 2, modo 1) > percentagem base. Empate: a mais recente.
create or replace function private.colporteur_pct(p_colporteur uuid, p_product_type text, p_sale_mode text, p_on date default current_date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select category from public.colporteurs where id = p_colporteur),
  o as (
    select pct from public.colporteur_commission_overrides
     where colporteur_id = p_colporteur
       and (product_type is null or product_type = p_product_type)
       and (sale_mode is null or sale_mode = p_sale_mode)
       and valid_from <= p_on and (valid_to is null or valid_to >= p_on)
     order by (product_type is not null)::int * 2 + (sale_mode is not null)::int desc, valid_from desc
     limit 1
  ),
  r as (
    select pct from public.colporteur_commission_rules, c
     where (colporteur_commission_rules.category is null or colporteur_commission_rules.category = c.category)
       and (product_type is null or product_type = p_product_type)
       and (sale_mode is null or sale_mode = p_sale_mode)
       and valid_from <= p_on and (valid_to is null or valid_to >= p_on)
     order by (colporteur_commission_rules.category is not null)::int * 4 + (product_type is not null)::int * 2 + (sale_mode is not null)::int desc, valid_from desc
     limit 1
  )
  select coalesce((select pct from o), (select pct from r), (select base_pct from public.colporteur_settings where id = 1), 0);
$$;
revoke all on function private.colporteur_pct(uuid, text, text, date) from public, anon, authenticated;
grant execute on function private.colporteur_pct(uuid, text, text, date) to service_role;

-- Para a simulação do painel: a percentagem que a base de dados aplicaria.
create or replace function public.colporteur_pct_preview(p_colporteur uuid, p_product_type text, p_sale_mode text, p_on date default current_date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_colporteurs();
  return private.colporteur_pct(p_colporteur, nullif(p_product_type, ''), nullif(p_sale_mode, ''), coalesce(p_on, current_date));
end;
$$;

-- Muda uma regra (ou a apaga, com p_pct nulo): fecha a que está em vigor e abre outra.
create or replace function public.colporteur_set_rule(
  p_category text, p_product_type text, p_sale_mode text, p_pct numeric, p_from date default current_date, p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, current_date);
  v_id uuid;
begin
  perform private.assert_colporteurs();
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then raise exception 'A percentagem tem de estar entre 0 e 100.'; end if;
  -- Uma regra que começa no mesmo dia é corrigida em vez de fechada.
  delete from public.colporteur_commission_rules
   where coalesce(category, '*') = coalesce(nullif(p_category, ''), '*') and coalesce(product_type, '*') = coalesce(nullif(p_product_type, ''), '*')
     and coalesce(sale_mode, '*') = coalesce(nullif(p_sale_mode, ''), '*') and valid_to is null and valid_from >= v_from;
  update public.colporteur_commission_rules set valid_to = v_from - 1
   where coalesce(category, '*') = coalesce(nullif(p_category, ''), '*') and coalesce(product_type, '*') = coalesce(nullif(p_product_type, ''), '*')
     and coalesce(sale_mode, '*') = coalesce(nullif(p_sale_mode, ''), '*') and valid_to is null;
  if p_pct is null then return null; end if;
  insert into public.colporteur_commission_rules (category, product_type, sale_mode, pct, valid_from, notes, created_by)
  values (nullif(p_category, ''), nullif(p_product_type, ''), nullif(p_sale_mode, ''), p_pct, v_from, left(coalesce(p_notes, ''), 300), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.colporteur_set_override(
  p_colporteur uuid, p_product_type text, p_sale_mode text, p_pct numeric, p_from date default current_date, p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, current_date);
  v_id uuid;
begin
  perform private.assert_colporteurs();
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then raise exception 'A percentagem tem de estar entre 0 e 100.'; end if;
  if not exists (select 1 from public.colporteurs where id = p_colporteur) then raise exception 'Colportor não encontrado.'; end if;
  delete from public.colporteur_commission_overrides
   where colporteur_id = p_colporteur and coalesce(product_type, '*') = coalesce(nullif(p_product_type, ''), '*')
     and coalesce(sale_mode, '*') = coalesce(nullif(p_sale_mode, ''), '*') and valid_to is null and valid_from >= v_from;
  update public.colporteur_commission_overrides set valid_to = v_from - 1
   where colporteur_id = p_colporteur and coalesce(product_type, '*') = coalesce(nullif(p_product_type, ''), '*')
     and coalesce(sale_mode, '*') = coalesce(nullif(p_sale_mode, ''), '*') and valid_to is null;
  perform private.colporteur_log(p_colporteur, 'percentagem', jsonb_build_object('product_type', nullif(p_product_type, ''), 'sale_mode', nullif(p_sale_mode, ''), 'pct', p_pct, 'from', v_from, 'reason', p_reason));
  if p_pct is null then return null; end if;
  insert into public.colporteur_commission_overrides (colporteur_id, product_type, sale_mode, pct, valid_from, reason, created_by)
  values (p_colporteur, nullif(p_product_type, ''), nullif(p_sale_mode, ''), p_pct, v_from, left(coalesce(p_reason, ''), 300), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 8. Candidatura (chamada pela Edge Function, com a service role) -----------------------------------
create or replace function public.colporteur_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_id uuid;
  v_church uuid := nullif(p ->> 'church_id', '')::uuid;
  v_pastor uuid := nullif(p ->> 'pastor_id', '')::uuid;
  v_cat text := coalesce(nullif(p ->> 'requested_category', ''), 'aspirante');
begin
  if auth.role() <> 'service_role' then
    raise exception 'A candidatura entra pelo formulário público.' using errcode = '42501';
  end if;
  if not coalesce((select applications_open from public.colporteur_settings where id = 1), true) then
    raise exception 'As candidaturas estão fechadas de momento.';
  end if;
  if v_phone ~ '^2449[0-9]{8}$' then v_phone := substr(v_phone, 4); end if;
  if v_phone !~ '^9[0-9]{8}$' then raise exception 'Telefone inválido: 9 algarismos, a começar por 9.'; end if;
  if length(btrim(coalesce(p ->> 'full_name', ''))) < 3 then raise exception 'Indique o nome completo.'; end if;
  if v_church is null and length(btrim(coalesce(p ->> 'church_other', ''))) < 2 then raise exception 'Escolha a sua igreja.'; end if;
  if v_church is not null and not exists (select 1 from public.churches where id = v_church and active) then raise exception 'Igreja desconhecida.'; end if;
  if v_pastor is not null and not exists (select 1 from public.pastors where id = v_pastor and status = 'activo') then v_pastor := null; end if;
  if v_cat not in ('aspirante', 'estudante', 'tempo_parcial', 'licenciado', 'credenciado') then v_cat := 'aspirante'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'É preciso aceitar o tratamento dos dados.'; end if;
  if exists (select 1 from public.colporteurs where phone = v_phone and status in ('candidatura', 'em_analise', 'activo', 'suspenso')) then
    raise exception 'Já existe uma candidatura ou ficha com este telefone. Fale com a Livraria se precisar de corrigir algo.' using errcode = '23505';
  end if;

  insert into public.colporteurs (
    full_name, phone, email, church_id, church_other, province_id, municipality_id, requested_category,
    weekly_hours, is_student, school, recommended_by_pastor_id, recommended_by_name, motivation, consent_at
  ) values (
    left(btrim(p ->> 'full_name'), 120), v_phone, left(lower(btrim(coalesce(p ->> 'email', ''))), 160), v_church,
    left(btrim(coalesce(p ->> 'church_other', '')), 120),
    nullif(p ->> 'province_id', ''), nullif(p ->> 'municipality_id', ''), v_cat,
    least(greatest(nullif(p ->> 'weekly_hours', '')::int, 0), 80), coalesce((p ->> 'is_student')::boolean, false),
    left(btrim(coalesce(p ->> 'school', '')), 120), v_pastor, left(btrim(coalesce(p ->> 'pastor_name', '')), 120),
    left(btrim(coalesce(p ->> 'motivation', '')), 1000), now()
  ) returning id into v_id;
  perform private.colporteur_log(v_id, 'candidatura', jsonb_build_object('requested_category', v_cat));
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.colporteur_apply(jsonb) from public, anon, authenticated;
grant execute on function public.colporteur_apply(jsonb) to service_role;

-- Lista pública para o formulário: igrejas activas, com distrito e os nomes dos pastores do
-- distrito (para "quem recomenda"). Sem telefones nem emails.
create or replace function public.church_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'churches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'cn', c.cn, 'name', c.name, 'district_id', c.district_id, 'district', d.name,
        'province_id', c.province_id, 'municipality_id', c.municipality_id) order by c.name)
      from public.churches c left join public.church_districts d on d.id = c.district_id
      where c.active), '[]'::jsonb),
    'pastors', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', btrim(p.title || ' ' || p.name), 'district_id', a.district_id) order by p.name)
      from public.pastor_assignments a join public.pastors p on p.id = a.pastor_id
      where a.end_date is null and p.status = 'activo'), '[]'::jsonb),
    'open', coalesce((select applications_open from public.colporteur_settings where id = 1), true),
    'note', coalesce((select application_note from public.colporteur_settings where id = 1), '')
  );
$$;
revoke all on function public.church_directory() from public;
grant execute on function public.church_directory() to anon, authenticated, service_role;

-- 9. Estado e categoria ------------------------------------------------------------------------------
create or replace function public.colporteur_set_status(p_id uuid, p_status text, p_reason text default '', p_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.colporteurs;
  v_ok boolean;
begin
  perform private.assert_colporteurs();
  select * into v from public.colporteurs where id = p_id for update;
  if v.id is null then raise exception 'Colportor não encontrado.'; end if;
  if p_status = v.status then return jsonb_build_object('code', v.code, 'status', v.status); end if;
  v_ok := case v.status
    when 'candidatura' then p_status in ('em_analise', 'activo', 'recusado')
    when 'em_analise' then p_status in ('candidatura', 'activo', 'recusado')
    when 'activo' then p_status in ('suspenso', 'inactivo')
    when 'suspenso' then p_status in ('activo', 'inactivo')
    when 'inactivo' then p_status in ('activo')
    when 'recusado' then p_status in ('candidatura', 'em_analise')
    else false end;
  if not v_ok then raise exception 'Não se passa de "%" para "%".', v.status, p_status; end if;
  if p_status in ('recusado', 'suspenso', 'inactivo') and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique o motivo.';
  end if;
  perform set_config('app.colporteur_rpc', '1', true);
  update public.colporteurs set
    status = p_status,
    status_reason = left(coalesce(p_reason, ''), 500),
    approved_by = case when p_status = 'activo' and v.approved_at is null then auth.uid() else approved_by end,
    approved_at = case when p_status = 'activo' and v.approved_at is null then now() else approved_at end,
    start_date = case when p_status = 'activo' and v.start_date is null then coalesce(p_start, current_date) else start_date end,
    -- Na primeira aprovação fica com a categoria pedida (a equipa pode mudá-la depois).
    category = case when p_status = 'activo' and v.approved_at is null then v.requested_category else category end
  where id = p_id
  returning * into v;
  perform set_config('app.colporteur_rpc', '', true);
  perform private.colporteur_log(p_id, 'estado', jsonb_build_object('to', p_status, 'reason', p_reason));
  return jsonb_build_object('code', v.code, 'status', v.status);
end;
$$;

create or replace function public.colporteur_set_category(p_id uuid, p_category text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.assert_colporteurs();
  if p_category not in ('aspirante', 'estudante', 'tempo_parcial', 'licenciado', 'credenciado') then raise exception 'Categoria inválida.'; end if;
  select category into v_old from public.colporteurs where id = p_id for update;
  if v_old is null then raise exception 'Colportor não encontrado.'; end if;
  if v_old = p_category then return; end if;
  perform set_config('app.colporteur_rpc', '1', true);
  update public.colporteurs set category = p_category where id = p_id;
  perform set_config('app.colporteur_rpc', '', true);
  perform private.colporteur_log(p_id, 'categoria', jsonb_build_object('from', v_old, 'to', p_category, 'reason', p_reason));
end;
$$;

-- Desliga a conta (ex.: ligada por engano). O colportor pode voltar a ligar com novo convite.
create or replace function public.colporteur_unlink_account(p_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_colporteurs();
  perform set_config('app.colporteur_rpc', '1', true);
  update public.colporteurs set profile_id = null where id = p_id;
  perform set_config('app.colporteur_rpc', '', true);
  perform private.colporteur_log(p_id, 'conta', jsonb_build_object('unlinked', true, 'reason', p_reason));
end;
$$;

-- 10. Convite para ligar a conta --------------------------------------------------------------------------
create or replace function public.colporteur_create_invite(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_days integer := coalesce((select invite_days from public.colporteur_settings where id = 1), 14);
  v_expires timestamptz := now() + make_interval(days => v_days);
begin
  perform private.assert_colporteurs();
  select status into v_status from public.colporteurs where id = p_id;
  if v_status is null then raise exception 'Colportor não encontrado.'; end if;
  if v_status <> 'activo' then raise exception 'Só um colportor activo recebe convite.'; end if;
  -- Um convite em aberto de cada vez.
  update public.colporteur_invites set expires_at = least(expires_at, now()) where colporteur_id = p_id and used_at is null;
  insert into public.colporteur_invites (colporteur_id, token_hash, expires_at, created_by)
  values (p_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires, auth.uid());
  perform private.colporteur_log(p_id, 'convite', jsonb_build_object('expires_at', v_expires));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

-- O colportor, já com sessão, usa o convite: a conta fica ligada à ficha.
create or replace function public.colporteur_claim_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.colporteur_invites;
  v public.colporteurs;
begin
  if v_uid is null then raise exception 'Entre na sua conta primeiro.' using errcode = '42501'; end if;
  select * into v_inv from public.colporteur_invites
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if v_inv.id is null then raise exception 'Convite inválido.'; end if;
  select * into v from public.colporteurs where id = v_inv.colporteur_id for update;
  if v_inv.used_at is not null then
    if v.profile_id = v_uid then return jsonb_build_object('code', v.code, 'already', true); end if;
    raise exception 'Este convite já foi usado.';
  end if;
  if v_inv.expires_at < now() then raise exception 'O convite expirou. Peça um novo à Livraria.'; end if;
  if v.status <> 'activo' then raise exception 'A sua ficha de colportor não está activa.'; end if;
  if v.profile_id is not null and v.profile_id <> v_uid then raise exception 'Esta ficha já está ligada a outra conta.'; end if;
  if exists (select 1 from public.colporteurs where profile_id = v_uid and id <> v.id) then
    raise exception 'A sua conta já está ligada a outra ficha de colportor.';
  end if;
  perform set_config('app.colporteur_rpc', '1', true);
  update public.colporteurs set profile_id = v_uid where id = v.id;
  perform set_config('app.colporteur_rpc', '', true);
  update public.colporteur_invites set used_at = now(), used_by = v_uid where id = v_inv.id;
  perform private.colporteur_log(v.id, 'conta', jsonb_build_object('linked', true));
  return jsonb_build_object('code', v.code, 'already', false);
end;
$$;

-- 11. O próprio colportor ------------------------------------------------------------------------------------
-- Ficha, igreja, percentagens em vigor para si por modo de venda, e o histórico. Nulo se a conta
-- não é de um colportor.
create or replace function public.colporteur_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.colporteurs;
begin
  select * into v from public.colporteurs where profile_id = auth.uid();
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'code', v.code, 'full_name', v.full_name, 'phone', v.phone, 'email', v.email,
    'category', v.category, 'status', v.status, 'start_date', v.start_date, 'territory', v.territory,
    'church', (select jsonb_build_object('name', c.name, 'cn', c.cn, 'district', d.name)
                 from public.churches c left join public.church_districts d on d.id = c.district_id where c.id = v.church_id),
    'province', (select name from public.angola_provinces where id = v.province_id),
    'municipality', (select name from public.angola_municipalities where id = v.municipality_id),
    'pct', jsonb_build_object(
      'consignacao', private.colporteur_pct(v.id, null, 'consignacao'),
      'compra', private.colporteur_pct(v.id, null, 'compra'),
      'site', private.colporteur_pct(v.id, null, 'site')),
    'pct_by_type', coalesce((
      select jsonb_object_agg(t, jsonb_build_object(
        'consignacao', private.colporteur_pct(v.id, t, 'consignacao'),
        'compra', private.colporteur_pct(v.id, t, 'compra'),
        'site', private.colporteur_pct(v.id, t, 'site')))
      from (select distinct product_type t from public.colporteur_commission_rules where product_type is not null and valid_to is null
            union select distinct product_type from public.colporteur_commission_overrides where colporteur_id = v.id and product_type is not null and valid_to is null) x), '{}'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'detail', e.detail, 'created', e.created) order by e.created desc)
                          from (select * from public.colporteur_events where colporteur_id = v.id order by created desc limit 30) e), '[]'::jsonb)
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.colporteur_pct_preview(uuid, text, text, date)',
    'public.colporteur_set_rule(text, text, text, numeric, date, text)',
    'public.colporteur_set_override(uuid, text, text, numeric, date, text)',
    'public.colporteur_set_status(uuid, text, text, date)',
    'public.colporteur_set_category(uuid, text, text)',
    'public.colporteur_unlink_account(uuid, text)',
    'public.colporteur_create_invite(uuid)',
    'public.colporteur_claim_invite(text)',
    'public.colporteur_me()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
