-- Registo da Igreja: campos (União, Missão, Associação), distritos pastorais, igrejas e pastores.
--
-- É a base da colportagem: cada colportor pertence a uma igreja, a igreja a um distrito, o
-- distrito a um campo e a uma província (angola_provinces / angola_municipalities, que já
-- existiam e se reutilizam). Os pastores ficam com o histórico de onde serviram
-- (pastor_assignments), porque mudam de distrito e a recomendação de um colportor tem de
-- continuar a apontar para quem a deu.
--
-- Decisões:
-- · Os nomes de distrito não são únicos: há "Distrito Centro" no Huambo e no Cuito. A chave é
--   campo + nome + província.
-- · Um distrito tem no máximo um pastor titular de cada vez; pode ter associados (licenciados,
--   departamentais destacados).
-- · As avaliações que vinham no pastores.json (assistência, sermões, administração…) não têm
--   lugar aqui: são dados pessoais sensíveis e não servem a colportagem. Decisão do dono.
-- · Contactos dos pastores só para a equipa com "Registo da Igreja" ou "Colportagem". A lista
--   pública de igrejas para o formulário de candidatura (fase 2) sai por uma função própria,
--   sem contactos.
-- · Apagar só funciona sem ligações (FK restrict); o painel oferece "desactivar".
-- · Novas permissões granulares: manage_church_registry e manage_colporteurs.
--
-- Reverter: drop das funções church_*, das tabelas pastor_assignments, churches, pastors,
-- church_districts, church_fields; repor users_admin_update de 20261101212413.

-- 1. Permissões novas no formulário de utilizadores ---------------------------------------
-- Igual a 20261101212413, com as duas chaves novas na lista.
create or replace function public.users_admin_update(
  p_id uuid, p_name text default null, p_phone text default null,
  p_role text default null, p_permissions jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text := private.assert_can_manage_user(p_id);
  v_role text := coalesce(p_role, v_current);
  v_perms jsonb;
begin
  if p_role is not null or p_permissions is not null then
    if not private.is_admin() then
      raise exception 'Só administradores podem alterar papéis e permissões.' using errcode = '42501';
    end if;
    if v_role not in ('member', 'manager', 'admin') then
      raise exception 'Papel inválido.';
    end if;
    if p_id = auth.uid() and v_role <> 'admin' then
      raise exception 'Não pode retirar o seu próprio acesso de administrador.';
    end if;
    if v_current = 'admin' and v_role <> 'admin' and private.active_admin_count(p_id) = 0 then
      raise exception 'Tem de existir pelo menos um administrador activo.';
    end if;
    -- Só as chaves conhecidas, com valores verdadeiro/falso; só os gestores as usam.
    select coalesce(jsonb_object_agg(k, coalesce(p_permissions ->> k, '') = 'true'), '{}'::jsonb) into v_perms
    from unnest(array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
                      'manage_marketing','manage_church_registry','manage_colporteurs']) k;
  end if;

  update public.profiles set
    name = case when p_name is not null then left(btrim(p_name), 120) else name end,
    phone = case when p_phone is not null then left(btrim(p_phone), 40) else phone end,
    role = case when p_role is not null or p_permissions is not null then v_role else role end,
    permissions = case when p_role is not null or p_permissions is not null
                       then (case when v_role = 'manager' then v_perms else null end)
                       else permissions end,
    updated = now()
  where id = p_id;
end;
$$;

-- Ler o registo: quem o gere e quem gere colportores (precisa das igrejas e dos pastores).
create or replace function private.can_read_church_registry()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('manage_church_registry') or private.has_permission('manage_colporteurs');
$$;
revoke all on function private.can_read_church_registry() from public, anon;
grant execute on function private.can_read_church_registry() to authenticated, service_role;

-- 2. Tabelas ------------------------------------------------------------------------------
create table if not exists public.church_fields (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  short_name text not null default '' check (length(short_name) <= 20),
  kind text not null default 'missao' check (kind in ('uniao', 'associacao', 'missao', 'campo')),
  parent_id uuid references public.church_fields(id) on delete restrict,
  active boolean not null default true,
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create unique index if not exists church_fields_name_key on public.church_fields (lower(btrim(name)));
comment on table public.church_fields is 'Campos da Igreja: União, Associação ou Missão. Um campo pode pertencer a outro (parent_id).';

create table if not exists public.church_districts (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references public.church_fields(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  province_id text references public.angola_provinces(id) on delete set null,
  municipality_id text references public.angola_municipalities(id) on delete set null,
  active boolean not null default true,
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index if not exists church_districts_key on public.church_districts
  (coalesce(field_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)), coalesce(province_id, ''));
create index if not exists church_districts_field_idx on public.church_districts (field_id);
comment on table public.church_districts is 'Distritos pastorais. A chave é campo + nome + província (há nomes repetidos em províncias diferentes).';

create table if not exists public.pastors (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Pr.' check (title in ('', 'Pr.', 'Anc.', 'Dr.', 'Prof.')),
  name text not null check (length(btrim(name)) between 2 and 120),
  role text not null default 'pastor_distrital' check (role in (
    'presidente', 'secretario_executivo', 'tesoureiro', 'pastor_distrital', 'pastor_departamental',
    'pastor_licenciado', 'pastor_jubilado', 'professor', 'auditor', 'director_livraria', 'lider', 'outro')),
  field_id uuid references public.church_fields(id) on delete set null,
  province_id text references public.angola_provinces(id) on delete set null,
  posting text not null default '' check (length(posting) <= 120),
  phone text not null default '' check (phone ~ '^[0-9]{0,15}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  profile_id uuid unique references public.profiles(id) on delete set null,
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists pastors_field_idx on public.pastors (field_id);
comment on table public.pastors is 'Pastores e obreiros. Sem avaliações. posting = local de serviço quando não é um distrito (ex.: ISPAB – Bongo, Livraria).';
comment on column public.pastors.phone is 'Só dígitos (ex.: 923456789). Visível apenas à equipa com Registo da Igreja ou Colportagem.';

create table if not exists public.pastor_assignments (
  id uuid primary key default gen_random_uuid(),
  pastor_id uuid not null references public.pastors(id) on delete cascade,
  district_id uuid not null references public.church_districts(id) on delete cascade,
  kind text not null default 'titular' check (kind in ('titular', 'associado')),
  start_date date not null default current_date,
  end_date date,
  notes text not null default '' check (length(notes) <= 500),
  created timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
-- Um titular de cada vez por distrito; associados sem limite.
create unique index if not exists pastor_assignments_um_titular on public.pastor_assignments (district_id)
  where end_date is null and kind = 'titular';
create unique index if not exists pastor_assignments_sem_repetir on public.pastor_assignments (pastor_id, district_id)
  where end_date is null;
create index if not exists pastor_assignments_pastor_idx on public.pastor_assignments (pastor_id);
comment on table public.pastor_assignments is 'Onde cada pastor serve e serviu. end_date nulo = actual.';

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  cn text check (cn is null or cn ~ '^[0-9A-Za-z-]{1,12}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null default 'igreja' check (kind in ('igreja', 'grupo', 'companhia')),
  district_id uuid references public.church_districts(id) on delete restrict,
  field_id uuid references public.church_fields(id) on delete restrict,
  province_id text references public.angola_provinces(id) on delete set null,
  municipality_id text references public.angola_municipalities(id) on delete set null,
  address text not null default '' check (length(address) <= 300),
  delegate_name text not null default '' check (length(delegate_name) <= 120),
  delegate_pastor_id uuid references public.pastors(id) on delete set null,
  congress_label text not null default '' check (length(congress_label) <= 60),
  active boolean not null default true,
  notes text not null default '' check (length(notes) <= 2000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index if not exists churches_cn_key on public.churches
  (coalesce(field_id, '00000000-0000-0000-0000-000000000000'::uuid), cn) where cn is not null;
create index if not exists churches_district_idx on public.churches (district_id);
comment on table public.churches is 'Igrejas, grupos e companhias. cn = número da igreja no campo. field_id copia o do distrito.';
comment on column public.churches.congress_label is 'Datas do congresso como vieram do ficheiro (ex.: 11-13-SET).';

-- 3. Coerência geográfica ----------------------------------------------------------------
-- O município tem de ser da província; com município e sem província, a província deduz-se.
-- Na igreja, o campo vem sempre do distrito, e a província do distrito quando falta.
create or replace function private.church_geo_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prov text;
begin
  if new.municipality_id is not null then
    select m.province into v_prov from public.angola_municipalities m where m.id = new.municipality_id;
    if new.province_id is null then
      new.province_id := v_prov;
    elsif v_prov is distinct from new.province_id then
      raise exception 'O município escolhido não pertence a essa província.' using errcode = '23514';
    end if;
  end if;
  if tg_table_name = 'churches' then
    if new.district_id is null then
      new.field_id := null;
    else
      select d.field_id, coalesce(new.province_id, d.province_id)
        into new.field_id, new.province_id
        from public.church_districts d where d.id = new.district_id;
    end if;
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;
revoke all on function private.church_geo_coerente() from public, anon, authenticated;

drop trigger if exists church_districts_geo on public.church_districts;
create trigger church_districts_geo before insert or update on public.church_districts
  for each row execute function private.church_geo_coerente();
drop trigger if exists churches_geo on public.churches;
create trigger churches_geo before insert or update on public.churches
  for each row execute function private.church_geo_coerente();

-- Mudar o campo de um distrito leva as igrejas com ele.
create or replace function private.church_district_campo_nas_igrejas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.field_id is distinct from old.field_id then
    update public.churches set field_id = new.field_id where district_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.church_district_campo_nas_igrejas() from public, anon, authenticated;
drop trigger if exists church_districts_campo on public.church_districts;
create trigger church_districts_campo after update of field_id on public.church_districts
  for each row execute function private.church_district_campo_nas_igrejas();

do $$
declare t text;
begin
  foreach t in array array['church_fields', 'church_districts', 'pastors', 'churches'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated()', t || '_set_updated', t);
  end loop;
end $$;

-- 4. RLS ------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['church_fields', 'church_districts', 'pastors', 'pastor_assignments', 'churches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || ': equipa lê', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.can_read_church_registry()))', t || ': equipa lê', t);
    execute format('drop policy if exists %I on public.%I', t || ': registo cria', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_permission(''manage_church_registry'')))', t || ': registo cria', t);
    execute format('drop policy if exists %I on public.%I', t || ': registo edita', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_permission(''manage_church_registry''))) with check ((select private.has_permission(''manage_church_registry'')))', t || ': registo edita', t);
    execute format('drop policy if exists %I on public.%I', t || ': registo apaga', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_permission(''manage_church_registry'')))', t || ': registo apaga', t);
  end loop;
end $$;

-- 5. Operações compostas ----------------------------------------------------------------------
create or replace function private.assert_church_registry()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (auth.role() = 'service_role' or private.has_permission('manage_church_registry')) then
    raise exception 'Sem permissão para gerir o registo da Igreja.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_church_registry() from public, anon;
grant execute on function private.assert_church_registry() to authenticated, service_role;

-- Põe um pastor num distrito: fecha a atribuição em curso do mesmo tipo (titular) e abre outra.
-- p_pastor nulo = deixar o distrito sem titular.
create or replace function public.church_assign_pastor(
  p_district uuid, p_pastor uuid, p_kind text default 'titular', p_start date default current_date, p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_start date := coalesce(p_start, current_date);
begin
  perform private.assert_church_registry();
  if p_kind not in ('titular', 'associado') then raise exception 'Tipo de atribuição inválido.'; end if;
  if not exists (select 1 from public.church_districts where id = p_district) then
    raise exception 'Distrito não encontrado.';
  end if;
  if p_kind = 'titular' then
    update public.pastor_assignments
       set end_date = greatest(start_date, v_start - 1)
     where district_id = p_district and kind = 'titular' and end_date is null
       and pastor_id is distinct from p_pastor;
  end if;
  if p_pastor is null then return null; end if;
  if not exists (select 1 from public.pastors where id = p_pastor) then raise exception 'Pastor não encontrado.'; end if;

  select id into v_id from public.pastor_assignments
   where district_id = p_district and pastor_id = p_pastor and end_date is null;
  if v_id is not null then
    update public.pastor_assignments set kind = p_kind where id = v_id;
    return v_id;
  end if;
  insert into public.pastor_assignments (pastor_id, district_id, kind, start_date, notes)
  values (p_pastor, p_district, p_kind, v_start, left(coalesce(p_notes, ''), 500))
  returning id into v_id;
  return v_id;
end;
$$;

-- Termina uma atribuição (o pastor sai do distrito).
create or replace function public.church_end_assignment(p_assignment uuid, p_end date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_church_registry();
  update public.pastor_assignments
     set end_date = greatest(start_date, coalesce(p_end, current_date))
   where id = p_assignment and end_date is null;
end;
$$;

-- Funde dois distritos (ex.: "Calenga" e "Calenga e Lepi"): igrejas e atribuições passam para o
-- que fica; o outro é apagado. Atribuições em curso repetidas fecham-se.
create or replace function public.church_merge_districts(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_churches integer;
  v_assign integer;
begin
  perform private.assert_church_registry();
  if p_keep = p_remove then raise exception 'Escolha dois distritos diferentes.'; end if;
  if not exists (select 1 from public.church_districts where id = p_keep)
     or not exists (select 1 from public.church_districts where id = p_remove) then
    raise exception 'Distrito não encontrado.';
  end if;
  update public.churches set district_id = p_keep where district_id = p_remove;
  get diagnostics v_churches = row_count;
  -- O titular do que sai passa a associado se o que fica já tem titular.
  update public.pastor_assignments a set kind = 'associado'
   where a.district_id = p_remove and a.end_date is null and a.kind = 'titular'
     and exists (select 1 from public.pastor_assignments k where k.district_id = p_keep and k.end_date is null and k.kind = 'titular');
  -- O mesmo pastor nos dois: fica a atribuição do que fica.
  update public.pastor_assignments a set end_date = greatest(a.start_date, current_date)
   where a.district_id = p_remove and a.end_date is null
     and exists (select 1 from public.pastor_assignments k where k.district_id = p_keep and k.end_date is null and k.pastor_id = a.pastor_id);
  update public.pastor_assignments set district_id = p_keep where district_id = p_remove;
  get diagnostics v_assign = row_count;
  delete from public.church_districts where id = p_remove;
  return jsonb_build_object('churches', v_churches, 'assignments', v_assign);
end;
$$;

-- Funde dois pastores repetidos: atribuições, delegados e ligações passam para o que fica.
create or replace function public.church_merge_pastors(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.pastors;
  v_rem public.pastors;
  v_assign integer;
begin
  perform private.assert_church_registry();
  if p_keep = p_remove then raise exception 'Escolha dois pastores diferentes.'; end if;
  select * into v_keep from public.pastors where id = p_keep;
  select * into v_rem from public.pastors where id = p_remove;
  if v_keep.id is null or v_rem.id is null then raise exception 'Pastor não encontrado.'; end if;
  update public.pastor_assignments a set end_date = greatest(a.start_date, current_date)
   where a.pastor_id = p_remove and a.end_date is null
     and exists (select 1 from public.pastor_assignments k where k.pastor_id = p_keep and k.end_date is null and k.district_id = a.district_id);
  update public.pastor_assignments set pastor_id = p_keep where pastor_id = p_remove;
  get diagnostics v_assign = row_count;
  update public.churches set delegate_pastor_id = p_keep where delegate_pastor_id = p_remove;
  -- Dados que faltem no que fica vêm do outro.
  update public.pastors set
    phone = case when phone = '' then v_rem.phone else phone end,
    email = case when email = '' then v_rem.email else email end,
    field_id = coalesce(field_id, v_rem.field_id),
    province_id = coalesce(province_id, v_rem.province_id),
    posting = case when posting = '' then v_rem.posting else posting end,
    notes = case when v_rem.notes = '' then notes else left(btrim(notes || E'\n' || v_rem.notes), 2000) end
  where id = p_keep;
  -- profile_id é único: liberta-se antes de o passar.
  if v_keep.profile_id is null and v_rem.profile_id is not null then
    update public.pastors set profile_id = null where id = p_remove;
    update public.pastors set profile_id = v_rem.profile_id where id = p_keep;
  end if;
  delete from public.pastors where id = p_remove;
  return jsonb_build_object('assignments', v_assign);
end;
$$;

-- Importação em bloco, numa só transacção. O browser prepara o plano (lib/churchImport.js) e a
-- equipa revê-o; aqui só se grava. Cada item traz uma "key" própria do plano, para as ligações
-- entre itens. O que já existe (mesmo nome de campo; mesmo campo+nome+província de distrito;
-- mesmo nome de pastor; mesmo campo+cn de igreja) não é duplicado nem alterado.
--
-- p_plan = {
--   fields:    [{key, name, short_name, kind}],
--   districts: [{key, field_key, name, province_id, municipality_id}],
--   pastors:   [{key, title, name, role, field_key, province_id, posting, phone, notes}],
--   assignments: [{pastor_key, district_key, kind}],
--   churches:  [{key, cn, name, district_key, municipality_id, province_id, delegate_name, delegate_pastor_key, congress_label}]
-- }
create or replace function public.church_registry_import(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map jsonb := '{}'::jsonb;   -- "f:<key>" | "d:<key>" | "p:<key>" -> uuid
  v_item jsonb;
  v_id uuid;
  v_field uuid;
  v_created jsonb := jsonb_build_object('fields', 0, 'districts', 0, 'pastors', 0, 'assignments', 0, 'churches', 0);
  v_existing jsonb := jsonb_build_object('fields', 0, 'districts', 0, 'pastors', 0, 'assignments', 0, 'churches', 0);
  v_district uuid;
  v_pastor uuid;
  v_kind text;
begin
  perform private.assert_church_registry();
  if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'Plano de importação inválido.'; end if;
  if jsonb_array_length(coalesce(p_plan -> 'churches', '[]')) > 5000
     or jsonb_array_length(coalesce(p_plan -> 'pastors', '[]')) > 5000 then
    raise exception 'Importação demasiado grande (máximo 5000 de cada).';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'fields', '[]')) loop
    select id into v_id from public.church_fields where lower(btrim(name)) = lower(btrim(v_item ->> 'name'));
    if v_id is null then
      insert into public.church_fields (name, short_name, kind)
      values (btrim(v_item ->> 'name'), coalesce(v_item ->> 'short_name', ''), coalesce(nullif(v_item ->> 'kind', ''), 'missao'))
      returning id into v_id;
      v_created := jsonb_set(v_created, '{fields}', to_jsonb((v_created ->> 'fields')::int + 1));
    else
      v_existing := jsonb_set(v_existing, '{fields}', to_jsonb((v_existing ->> 'fields')::int + 1));
    end if;
    v_map := v_map || jsonb_build_object('f:' || (v_item ->> 'key'), v_id);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'districts', '[]')) loop
    v_field := (v_map ->> ('f:' || coalesce(v_item ->> 'field_key', '')))::uuid;
    select id into v_id from public.church_districts
     where coalesce(field_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_field, '00000000-0000-0000-0000-000000000000'::uuid)
       and lower(btrim(name)) = lower(btrim(v_item ->> 'name'))
       and coalesce(province_id, '') = coalesce(v_item ->> 'province_id', '');
    if v_id is null then
      insert into public.church_districts (field_id, name, province_id, municipality_id)
      values (v_field, btrim(v_item ->> 'name'), nullif(v_item ->> 'province_id', ''), nullif(v_item ->> 'municipality_id', ''))
      returning id into v_id;
      v_created := jsonb_set(v_created, '{districts}', to_jsonb((v_created ->> 'districts')::int + 1));
    else
      v_existing := jsonb_set(v_existing, '{districts}', to_jsonb((v_existing ->> 'districts')::int + 1));
    end if;
    v_map := v_map || jsonb_build_object('d:' || (v_item ->> 'key'), v_id);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'pastors', '[]')) loop
    select id into v_id from public.pastors where lower(btrim(name)) = lower(btrim(v_item ->> 'name')) limit 1;
    if v_id is null then
      insert into public.pastors (title, name, role, field_id, province_id, posting, phone, notes)
      values (coalesce(v_item ->> 'title', 'Pr.'), btrim(v_item ->> 'name'), coalesce(nullif(v_item ->> 'role', ''), 'outro'),
              (v_map ->> ('f:' || coalesce(v_item ->> 'field_key', '')))::uuid, nullif(v_item ->> 'province_id', ''),
              left(coalesce(v_item ->> 'posting', ''), 120), regexp_replace(coalesce(v_item ->> 'phone', ''), '\D', '', 'g'),
              left(coalesce(v_item ->> 'notes', ''), 2000))
      returning id into v_id;
      v_created := jsonb_set(v_created, '{pastors}', to_jsonb((v_created ->> 'pastors')::int + 1));
    else
      v_existing := jsonb_set(v_existing, '{pastors}', to_jsonb((v_existing ->> 'pastors')::int + 1));
    end if;
    v_map := v_map || jsonb_build_object('p:' || (v_item ->> 'key'), v_id);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'assignments', '[]')) loop
    v_pastor := (v_map ->> ('p:' || (v_item ->> 'pastor_key')))::uuid;
    v_district := (v_map ->> ('d:' || (v_item ->> 'district_key')))::uuid;
    v_kind := coalesce(nullif(v_item ->> 'kind', ''), 'associado');
    continue when v_pastor is null or v_district is null;
    if exists (select 1 from public.pastor_assignments where pastor_id = v_pastor and district_id = v_district and end_date is null) then
      v_existing := jsonb_set(v_existing, '{assignments}', to_jsonb((v_existing ->> 'assignments')::int + 1));
      continue;
    end if;
    -- Já há titular: entra como associado em vez de o substituir.
    if v_kind = 'titular' and exists (select 1 from public.pastor_assignments where district_id = v_district and kind = 'titular' and end_date is null) then
      v_kind := 'associado';
    end if;
    insert into public.pastor_assignments (pastor_id, district_id, kind) values (v_pastor, v_district, v_kind);
    v_created := jsonb_set(v_created, '{assignments}', to_jsonb((v_created ->> 'assignments')::int + 1));
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'churches', '[]')) loop
    v_district := (v_map ->> ('d:' || coalesce(v_item ->> 'district_key', '')))::uuid;
    select field_id into v_field from public.church_districts where id = v_district;
    select id into v_id from public.churches
     where nullif(v_item ->> 'cn', '') is not null and cn = v_item ->> 'cn'
       and coalesce(field_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_field, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_id is null then
      insert into public.churches (cn, name, district_id, province_id, municipality_id, delegate_name, delegate_pastor_id, congress_label)
      values (nullif(v_item ->> 'cn', ''), btrim(v_item ->> 'name'), v_district, nullif(v_item ->> 'province_id', ''),
              nullif(v_item ->> 'municipality_id', ''), left(coalesce(v_item ->> 'delegate_name', ''), 120),
              (v_map ->> ('p:' || coalesce(v_item ->> 'delegate_pastor_key', '')))::uuid, left(coalesce(v_item ->> 'congress_label', ''), 60));
      v_created := jsonb_set(v_created, '{churches}', to_jsonb((v_created ->> 'churches')::int + 1));
    else
      v_existing := jsonb_set(v_existing, '{churches}', to_jsonb((v_existing ->> 'churches')::int + 1));
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.church_assign_pastor(uuid, uuid, text, date, text)',
    'public.church_end_assignment(uuid, date)',
    'public.church_merge_districts(uuid, uuid)',
    'public.church_merge_pastors(uuid, uuid)',
    'public.church_registry_import(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
