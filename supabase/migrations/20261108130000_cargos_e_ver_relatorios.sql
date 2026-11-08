-- Cargos da equipa e a permissão «Ver relatórios» (decisões do dono, 2026-11-08).
--
-- 1. Permissão nova `view_reports` (Ver relatórios). A facturação — o painel «Vendas por loja»
--    (vendas_anos, painel_vendas_docs), o relatório de caixa e os números do mês no Início —
--    deixa de vir com «Gerir encomendas»: um cargo de atendimento trata encomendas sem ver a
--    facturação. Os gestores que já geriam encomendas recebem-na, para não perderem nada; fica
--    uma linha no registo de segurança, sem aviso, como em 20261107200000_pagamentos_registados.
--    O detalhe dos pagamentos de cada encomenda continua com quem gere encomendas
--    (`private.can_read_payments`): é preciso para tratar a encomenda.
--
-- 2. Cargos (`public.staff_roles`): nome, descrição e permissões (Caixa, Atendimento, Gerente de
--    loja…). Um gestor com cargo tem as permissões do cargo: o gatilho copia-as para
--    `profiles.permissions`, e mudar as permissões do cargo muda logo toda a gente que o tem.
--    `private.has_permission` continua a ler `profiles.permissions`, e por isso nenhuma política
--    RLS muda. Sem cargo («personalizado»), as permissões são as da pessoa, como até aqui.
--    O cargo só se atribui pela função `staff_role_assign` (administradores); uma escrita
--    directa em `profiles.staff_role_id` — mesmo de um administrador — é ignorada.
--
-- Reverter: drop dos gatilhos profiles_staff_role_sync, staff_roles_before_save e
-- staff_roles_propagate; drop das funções staff_role_assign, private.staff_role_*,
-- private.clean_permissions e private.permission_keys; drop da coluna profiles.staff_role_id e
-- da tabela public.staff_roles; voltar as políticas de vendas_anos e painel_vendas_docs a
-- `manage_orders` e users_admin_update à de 20261107200000.

-- ---------------------------------------------------------------------------
-- As chaves das permissões, num só sítio do lado da base (o do site é lib/permissions.js e o da
-- Edge Function é permissions.ts: os três têm a mesma lista).
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs'];
$$;

-- Só as chaves conhecidas, cada uma verdadeiro ou falso (as que faltam ficam falsas).
create or replace function private.clean_permissions(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, coalesce(p ->> k, '') = 'true'), '{}'::jsonb)
  from unnest(private.permission_keys()) k;
$$;

revoke all on function private.permission_keys() from public, anon;
revoke all on function private.clean_permissions(jsonb) from public, anon;
grant execute on function private.permission_keys() to authenticated, service_role;
grant execute on function private.clean_permissions(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Ver relatórios
-- Igual a 20261107200000_pagamentos_registados, com a lista de private.permission_keys().
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
    -- Só as chaves conhecidas, com valores verdadeiro/falso; só os gestores as usam. Um gestor
    -- com cargo fica com as do cargo (gatilho profiles_staff_role_sync).
    v_perms := private.clean_permissions(p_permissions);
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

-- O painel «Vendas por loja» lê-se com «Ver relatórios» (antes «Gerir encomendas»).
drop policy if exists "vendas_anos: encomendas lê" on public.vendas_anos;
drop policy if exists "vendas_anos: relatórios lê" on public.vendas_anos;
create policy "vendas_anos: relatórios lê" on public.vendas_anos for select to authenticated
  using ((select private.has_permission('view_reports')));

drop policy if exists "painel_vendas_docs: encomendas lê" on public.painel_vendas_docs;
drop policy if exists "painel_vendas_docs: relatórios lê" on public.painel_vendas_docs;
create policy "painel_vendas_docs: relatórios lê" on public.painel_vendas_docs for select to authenticated
  using ((select private.has_permission('view_reports')));

-- ---------------------------------------------------------------------------
-- 2. Cargos
create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  permissions jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint staff_roles_name_check check (char_length(btrim(name)) between 2 and 60),
  constraint staff_roles_description_check check (char_length(description) <= 300)
);
create unique index if not exists staff_roles_name_key on public.staff_roles (lower(btrim(name)));
comment on table public.staff_roles is
  'Cargos da equipa: um gestor com cargo tem as permissões do cargo (profiles.staff_role_id). Só administradores criam e editam.';

alter table public.staff_roles enable row level security;
drop policy if exists "staff_roles: equipa lê" on public.staff_roles;
create policy "staff_roles: equipa lê" on public.staff_roles for select to authenticated
  using ((select private.is_staff()));
drop policy if exists "staff_roles: admin cria" on public.staff_roles;
create policy "staff_roles: admin cria" on public.staff_roles for insert to authenticated
  with check ((select private.is_admin()));
drop policy if exists "staff_roles: admin edita" on public.staff_roles;
create policy "staff_roles: admin edita" on public.staff_roles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "staff_roles: admin apaga" on public.staff_roles;
create policy "staff_roles: admin apaga" on public.staff_roles for delete to authenticated
  using ((select private.is_admin()));
revoke all on public.staff_roles from anon;

-- Nome e descrição arrumados; permissões só com as chaves conhecidas.
create or replace function private.staff_roles_before_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := left(btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g')), 60);
  new.description := left(btrim(coalesce(new.description, '')), 300);
  new.permissions := private.clean_permissions(new.permissions);
  if tg_op = 'INSERT' then new.created := now(); else new.created := old.created; end if;
  new.updated := now();
  return new;
end;
$$;
drop trigger if exists staff_roles_before_save on public.staff_roles;
create trigger staff_roles_before_save
  before insert or update on public.staff_roles
  for each row execute function private.staff_roles_before_save();

alter table public.profiles
  add column if not exists staff_role_id uuid references public.staff_roles (id) on delete set null;
create index if not exists profiles_staff_role_idx on public.profiles (staff_role_id) where staff_role_id is not null;
comment on column public.profiles.staff_role_id is
  'Cargo do gestor (staff_roles). Com cargo, as permissões são as do cargo. Só muda por staff_role_assign.';

-- As permissões de um cargo, lidas sem depender de quem está a escrever no perfil.
create or replace function private.staff_role_permissions(p_role uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select r.permissions from public.staff_roles r where r.id = p_role;
$$;
-- O gatilho do perfil corre como quem escreve (authenticated, quando um gestor muda o próprio
-- nome), e precisa de a chamar. O esquema private não está na API.
revoke all on function private.staff_role_permissions(uuid) from public, anon;
grant execute on function private.staff_role_permissions(uuid) to authenticated, service_role;

-- Gatilho do perfil (corre depois de profiles_protect_privileges, pela ordem do nome):
-- · o cargo não muda por uma escrita directa (só pela staff_role_assign, que corre como dona);
-- · só os gestores têm cargo;
-- · com cargo, as permissões são as do cargo.
-- Não é `security definer` de propósito: `current_user` tem de ser quem escreve, para distinguir a
-- escrita directa pela API (authenticated/anon) da que vem das funções do servidor.
create or replace function private.profiles_staff_role_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_perms jsonb;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.staff_role_id := null;
    elsif new.staff_role_id is distinct from old.staff_role_id then
      new.staff_role_id := old.staff_role_id;
    end if;
  end if;
  if new.role is distinct from 'manager' then
    new.staff_role_id := null;
  elsif new.staff_role_id is not null then
    v_perms := private.staff_role_permissions(new.staff_role_id);
    if v_perms is not null then
      new.permissions := v_perms;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_staff_role_sync() from public, anon, authenticated;
drop trigger if exists profiles_staff_role_sync on public.profiles;
create trigger profiles_staff_role_sync
  before insert or update on public.profiles
  for each row execute function private.profiles_staff_role_sync();

-- Mudar as permissões de um cargo muda as de toda a gente que o tem (o registo de segurança
-- regista cada mudança, com quem a fez).
create or replace function private.staff_roles_propagate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set permissions = new.permissions, updated = now()
  where staff_role_id = new.id and role = 'manager'
    and permissions is distinct from new.permissions;
  return null;
end;
$$;
revoke all on function private.staff_roles_propagate() from public, anon, authenticated;
drop trigger if exists staff_roles_propagate on public.staff_roles;
create trigger staff_roles_propagate
  after update of permissions on public.staff_roles
  for each row execute function private.staff_roles_propagate();

-- Atribuir (ou tirar, com p_role nulo) o cargo de um gestor. Só administradores. Sem cargo, a
-- pessoa fica com as permissões que tinha, e passa a «personalizado».
create or replace function public.staff_role_assign(p_profile uuid, p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_admin() then
    raise exception 'Só administradores atribuem cargos.' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_profile;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if p_role is not null then
    if v_role <> 'manager' then
      raise exception 'Os cargos são para gestores: mude primeiro o papel para Gestor.';
    end if;
    if not exists (select 1 from public.staff_roles r where r.id = p_role) then
      raise exception 'Cargo não encontrado.';
    end if;
  end if;
  update public.profiles set staff_role_id = p_role, updated = now() where id = p_profile;
end;
$$;
revoke all on function public.staff_role_assign(uuid, uuid) from public, anon;
grant execute on function public.staff_role_assign(uuid, uuid) to authenticated;

-- Cargos de partida, quando ainda não há nenhum. O administrador muda-os, junta e apaga.
insert into public.staff_roles (name, description, permissions, position)
select v.name, v.description, v.permissions::jsonb, v.position
from (values
  ('Gerente de loja', 'Gere a loja: catálogo, encomendas, pagamentos, clientes, campanhas e relatórios.',
   '{"manage_catalog":true,"manage_orders":true,"manage_payments":true,"confirm_payments":true,"view_reports":true,"manage_users":true,"manage_marketing":true}', 10),
  ('Caixa', 'Trata as encomendas ao balcão e confirma os pagamentos recebidos.',
   '{"manage_orders":true,"confirm_payments":true}', 20),
  ('Atendimento', 'Trata as encomendas e fala com os clientes, sem ver a facturação.',
   '{"manage_orders":true}', 30),
  ('Catálogo e stock', 'Produtos, coleções, slider, materiais e a moderação da comunidade.',
   '{"manage_catalog":true}', 40),
  ('Marketing', 'Contactos, campanhas e a faixa de aviso.',
   '{"manage_marketing":true}', 50),
  ('Contabilidade', 'Relatórios, caixa e confirmação de pagamentos.',
   '{"view_reports":true,"confirm_payments":true}', 60),
  ('Colportagem', 'Colportores, relatórios semanais, guias, contas e percentagens.',
   '{"manage_colporteurs":true}', 70),
  ('Registo da Igreja', 'Campos, distritos, igrejas e pastores.',
   '{"manage_church_registry":true}', 80)
) as v(name, description, permissions, position)
where not exists (select 1 from public.staff_roles);

-- ---------------------------------------------------------------------------
-- Quem já gere encomendas continua a ver os relatórios. O gatilho do registo de segurança
-- avisaria os administradores de cada mudança de permissões como se fosse um ataque; fica uma
-- linha no registo, sem aviso, a dizer que foi esta migração.
do $$
declare
  v_audit boolean := exists (
    select 1 from pg_trigger where tgname = 'profiles_audit' and tgrelid = 'public.profiles'::regclass);
  r record;
begin
  if v_audit then
    execute 'alter table public.profiles disable trigger profiles_audit';
  end if;
  for r in
    update public.profiles p
    set permissions = coalesce(p.permissions, '{}'::jsonb) || '{"view_reports": true}'::jsonb
    where p.role = 'manager'
      and (p.permissions -> 'manage_orders') = 'true'::jsonb
      and not (coalesce(p.permissions, '{}'::jsonb) ? 'view_reports')
    returning p.id, p.email
  loop
    if v_audit then
      perform private.audit_write('profiles', r.id::text, 'update',
        'Permissão "Ver relatórios" dada a ' || coalesce(r.email, r.id::text)
          || ', que já gere encomendas (migração cargos_e_ver_relatorios)',
        jsonb_build_object('permissions', jsonb_build_object('de', 'sem view_reports', 'para', 'view_reports: true')),
        false);
    end if;
  end loop;
  if v_audit then
    execute 'alter table public.profiles enable trigger profiles_audit';
  end if;
end
$$;
