-- Verificação em dois passos obrigatória para a equipa, com prazo de adaptação.
--
-- Achado principal da análise crítica de 2026-11-20: o código da aplicação autenticadora só era
-- exigido a quem o tivesse activado (migração verificacao_dois_passos_equipa). Em produção, a
-- 2026-11-14, nenhuma das 4 contas de administrador o tinha — uma palavra-passe roubada abria o
-- painel e deixava trocar o IBAN, as permissões e os segredos.
--
-- Agora, passado o prazo, uma conta da equipa (admin ou gestor) sem factor verificado conta como a
-- de um cliente: as funções de permissão (is_admin, is_staff, has_permission) e a Edge Function
-- (supabase/functions/app/mfa.ts) deixam de lhe reconhecer a equipa até activar o código. O site
-- mostra a quem está nessa situação um ecrã para o activar (components/StaffMfaGate.jsx), e até ao
-- prazo um aviso com a data.
--
-- Prazo: 7 dias depois de esta migração ser aplicada, em private.staff_mfa_policy. Para o mudar
-- (com a service role, no SQL Editor):
--   update private.staff_mfa_policy set enforce_after = '2026-12-01 08:00+01', updated = now();
-- Clientes e colportores não são afectados: o código continua opcional para eles.
--
-- Recuperação, se alguém da equipa perder o telemóvel: um administrador repõe a verificação em
-- Utilizadores → a conta → «Repor a verificação em dois passos» (rota /admin/users/mfa-reset), ou
-- no painel do Supabase (Authentication → Users → remover o factor). A pessoa activa-a de novo ao
-- entrar.
--
-- Reverter: repor private.mfa_satisfied de 20261104093000 e apagar private.staff_mfa_policy,
-- private.staff_mfa_enforce_after, public.staff_mfa_status e public.staff_mfa_deadline.

create table if not exists private.staff_mfa_policy (
  id smallint primary key default 1 check (id = 1),
  enforce_after timestamptz not null,
  updated timestamptz not null default now()
);
comment on table private.staff_mfa_policy is
  'A partir de enforce_after, a equipa (admin e gestor) só tem os poderes da equipa com a verificação em dois passos.';
alter table private.staff_mfa_policy enable row level security;
revoke all on private.staff_mfa_policy from public, anon, authenticated;
insert into private.staff_mfa_policy (id, enforce_after) values (1, now() + interval '7 days')
on conflict (id) do nothing;

-- Sem a linha (apagada à mão), o código passa a ser exigido já: a falta de configuração fecha.
create or replace function private.staff_mfa_enforce_after()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.enforce_after from private.staff_mfa_policy p where p.id = 1), '-infinity'::timestamptz);
$$;
revoke all on function private.staff_mfa_enforce_after() from public, anon, authenticated;

-- A sessão passou pelo código (aal2), ou a conta não tem factor e o prazo ainda não acabou.
-- Só pesa junto com o papel: is_admin, is_staff e has_permission exigem também admin ou gestor,
-- por isso um cliente sem código continua igual.
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or (
        not exists (
          select 1
          from auth.mfa_factors f
          where f.user_id = (select auth.uid())
            and f.status = 'verified'
        )
        and now() < private.staff_mfa_enforce_after()
      );
$$;
comment on function private.mfa_satisfied() is
  'Verdadeiro se a sessão é aal2, ou se a conta não tem factor verificado e o prazo de private.staff_mfa_policy ainda não passou.';
revoke all on function private.mfa_satisfied() from public, anon, authenticated;

-- Para o site: a situação da própria conta (o ecrã de activação e o aviso com a data).
create or replace function public.staff_mfa_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'staff', coalesce((select p.role in ('admin', 'manager') from public.profiles p where p.id = (select auth.uid())), false),
    'has_factor', exists (
      select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'
    ),
    'aal', coalesce((select auth.jwt() ->> 'aal'), 'aal1'),
    'enforce_after', private.staff_mfa_enforce_after(),
    'enforced', now() >= private.staff_mfa_enforce_after()
  );
$$;
revoke all on function public.staff_mfa_status() from public, anon;
grant execute on function public.staff_mfa_status() to authenticated;

-- Para a Edge Function (service role): a data a partir da qual a equipa precisa do código.
create or replace function public.staff_mfa_deadline()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_mfa_enforce_after();
$$;
revoke all on function public.staff_mfa_deadline() from public, anon, authenticated;
grant execute on function public.staff_mfa_deadline() to service_role;
