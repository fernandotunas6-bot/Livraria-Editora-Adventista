-- Verificação em dois passos (TOTP) a valer de facto para a equipa.
--
-- Activar um factor no Supabase Auth, por si só, não protege nada: quem souber a
-- palavra-passe obtém uma sessão `aal1` e chama a API REST directamente, sem nunca ver o ecrã
-- do código. Por isso a exigência fica aqui, nas três funções em que todas as políticas RLS,
-- as do Storage e as funções de gestão de utilizadores se apoiam: uma conta com factor
-- verificado só conta como equipa numa sessão `aal2`. A Edge Function aplica a mesma regra
-- (supabase/functions/app/mfa.ts).
--
-- Quem não tem factor verificado não é afectado. A 2026-11-04 nenhuma conta tem factores
-- (auth.mfa_factors vazia), logo esta migração não muda nada até alguém activar o código.
--
-- Recuperação, se um admin perder o telemóvel: outro admin, ou o painel do Supabase
-- (Authentication → Users → o utilizador → remover o factor). Por SQL, com a service role:
--   delete from auth.mfa_factors where user_id = '<id>';
--
-- Reverter: voltar a criar as três funções sem `and private.mfa_satisfied()` e apagar esta.

create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      );
$$;

comment on function private.mfa_satisfied() is
  'Verdadeiro se a sessão é aal2 ou se a conta não tem factor MFA verificado.';

-- Chamada só de dentro das funções abaixo (security definer, dono postgres).
revoke all on function private.mfa_satisfied() from public, anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
     and private.mfa_satisfied();
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('admin', 'manager') from public.profiles where id = auth.uid()), false)
     and private.mfa_satisfied();
$$;

create or replace function private.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'admin' or (p.role = 'manager' and coalesce(p.permissions ->> p_key, '') = 'true')
    from public.profiles p
    where p.id = auth.uid()
  ), false)
     and private.mfa_satisfied();
$$;
