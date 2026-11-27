-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- A verificação em dois passos passa a opcional também para a equipa (decisão do dono a 27/11: «permita que a
-- autenticação em dois factores seja opcional, no perfil individual»). Cada pessoa activa-a ou retira-a no seu perfil.
-- Quem a activou continua a precisar do código: a sessão só tem os poderes da equipa depois dele (aal2).
--
-- Antes (20261120101000), passado o prazo, uma conta da equipa sem código valia como a de um cliente. Agora a política
-- tem um interruptor, `obrigatoria`:
-- - desligado (o que o dono escolheu): sem prazo, como antes de 20/11. O código só se exige a quem o activou;
-- - ligado: volta a ser obrigatória para a equipa, a partir de `enforce_after`. Liga-se no painel (Utilizadores →
--   «Verificação em dois passos da equipa», só administradores), com um prazo em dias, e fica no registo de segurança.
--
-- Nada muda na Edge Function (supabase/functions/app/mfa.ts): um prazo `infinity` já quer dizer «sem obrigação». O
-- KanGest também não muda: o `kangest_eu` usa as mesmas funções de permissão.

-- 1. O interruptor (sem a linha da política, continua a fechar: `-infinity`).
alter table private.staff_mfa_policy add column if not exists obrigatoria boolean not null default true;
comment on column private.staff_mfa_policy.obrigatoria is
  'Ligado: a equipa precisa dos dois passos a partir de enforce_after. Desligado: só quem os activou (decisão do dono a 27/11).';
update private.staff_mfa_policy set obrigatoria = false, updated = now() where id = 1;

create or replace function private.staff_mfa_enforce_after()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when p.obrigatoria then p.enforce_after else 'infinity'::timestamptz end
       from private.staff_mfa_policy p where p.id = 1),
    '-infinity'::timestamptz);
$$;
revoke all on function private.staff_mfa_enforce_after() from public, anon, authenticated;

-- 2. Para o site: a situação da própria conta, agora com o interruptor (o ecrã que obriga só aparece com ele ligado).
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
    'obrigatoria', coalesce((select p.obrigatoria from private.staff_mfa_policy p where p.id = 1), true),
    'enforce_after', private.staff_mfa_enforce_after(),
    'enforced', now() >= private.staff_mfa_enforce_after()
  );
$$;
revoke all on function public.staff_mfa_status() from public, anon;
grant execute on function public.staff_mfa_status() to authenticated;

-- 3. Para o painel: ligar ou desligar a obrigação para a equipa. Só um administrador (com os poderes da equipa, isto
--    é, com o código se o tiver activado). Ao ligar, a equipa tem `p_dias` dias para activar o código; até lá, o site
--    mostra o aviso com a data. Fica no registo de segurança, com alerta.
create or replace function public.staff_mfa_politica_definir(p_obrigatoria boolean, p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
  v_dias integer := least(greatest(coalesce(p_dias, 7), 0), 90);
begin
  if not private.is_admin() then
    raise exception 'Só um administrador muda a verificação em dois passos da equipa.' using errcode = '42501';
  end if;
  if p_obrigatoria is null then
    raise exception 'Diga se a verificação em dois passos fica obrigatória ou opcional.' using errcode = '22023';
  end if;
  select obrigatoria, enforce_after into v_antes from private.staff_mfa_policy where id = 1;
  insert into private.staff_mfa_policy (id, enforce_after, obrigatoria, updated)
  values (1, now() + make_interval(days => v_dias), p_obrigatoria, now())
  on conflict (id) do update
    set obrigatoria = excluded.obrigatoria,
        -- ao ligar, o prazo conta a partir de agora; ao desligar, fica o que estava (não pesa)
        enforce_after = case when excluded.obrigatoria and not coalesce(v_antes.obrigatoria, false)
                             then excluded.enforce_after else private.staff_mfa_policy.enforce_after end,
        updated = now();
  perform private.audit_write(
    'staff_mfa_policy', '1', 'update',
    case when p_obrigatoria
      then 'Verificação em dois passos obrigatória para a equipa, com ' || v_dias || ' dia(s) de prazo'
      else 'Verificação em dois passos opcional para a equipa' end,
    jsonb_build_object('obrigatoria', jsonb_build_object('antes', v_antes.obrigatoria, 'depois', p_obrigatoria)),
    true);
  return public.staff_mfa_status();
end;
$$;
revoke all on function public.staff_mfa_politica_definir(boolean, integer) from public, anon;
grant execute on function public.staff_mfa_politica_definir(boolean, integer) to authenticated;
