-- Entrar no KanGest Livraria com a conta do site (parte J do plano; docs/KANGEST.md, «Entrar no KanGest com a conta
-- do site»).
--
-- Quem pode entrar e com que perfil vem das permissões do site, como as do painel (e dos cargos, que as levam):
--   * kangest_gestor → o perfil Gestor do KanGest;
--   * kangest_caixa  → o perfil Caixa (o POS);
--   * o administrador do site entra como Gestor.
-- O perfil Administrador do KanGest nunca vem do site: fica sempre a conta ADMIN local de recurso.
--
-- O KanGest pergunta com a sessão da própria pessoa (public.kangest_eu), e só fica a saber dela: o nome, o email, o
-- perfil, o cargo e as lojas da ficha de funcionário.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. As duas permissões novas
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs',
               'manage_production','manage_staff','manage_finance','edit_reports','manage_store_stock',
               'view_store_dashboard','kangest_caixa','kangest_gestor'];
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Quem sou eu, para o KanGest
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.kangest_eu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil text;
  r record;
begin
  if v_uid is null then
    raise exception 'Entre com a sua conta.' using errcode = '42501';
  end if;
  select p.id, p.role, coalesce(nullif(btrim(p.name), ''), u.email) as nome, u.email, sr.name as cargo
    into r
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.staff_roles sr on sr.id = p.staff_role_id
   where p.id = v_uid;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  -- has_permission exige a sessão com o código (aal2) quando a conta tem MFA: o KanGest pede o código como o painel
  v_perfil := case
    when private.has_permission('kangest_gestor') then 'GESTOR'
    when private.has_permission('kangest_caixa') then 'CAIXA'
  end;
  return jsonb_build_object(
    'id', r.id, 'nome', r.nome, 'email', r.email, 'cargo', r.cargo,
    -- null: a conta existe, mas não tem acesso ao KanGest
    'perfil', v_perfil,
    'lojas', to_jsonb(private.my_store_ids()),
    'mfa', private.mfa_satisfied()
  );
end;
$$;
comment on function public.kangest_eu() is
  'O KanGest Livraria, com a sessão da pessoa: o nome, o email, o perfil (GESTOR, CAIXA ou null), o cargo e as lojas. Nunca ADMIN.';
revoke all on function public.kangest_eu() from public, anon;
grant execute on function public.kangest_eu() to authenticated;
