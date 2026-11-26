-- A entrada no KanGest com a conta do site (20261126100000) passa a saber se o posto é da loja da ficha da pessoa
-- (decisão do dono, 2026-11-26): como Caixa, só se entra nos postos da loja da ficha de funcionário; um Gestor entra
-- em qualquer loja, e quem não tem ficha também. O KanGest manda o id do posto dele (sinc_ligacao.posto_id).
--
-- `posto_na_ficha`: null sem posto ou sem ficha com loja; verdadeiro se o posto é de uma das lojas da ficha. O resto
-- igual: o perfil (GESTOR, CAIXA ou null), e `mfa` falso quando faltam os dois passos (o KanGest diz para os activar).

-- uma só versão: com a antiga sem argumentos ao lado, a chamada sem argumentos seria ambígua
drop function if exists public.kangest_eu();

create or replace function public.kangest_eu(p_posto uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil text;
  v_lojas text[];
  v_loja_do_posto text;
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
  v_perfil := case
    when private.has_permission('kangest_gestor') then 'GESTOR'
    when private.has_permission('kangest_caixa') then 'CAIXA'
  end;
  v_lojas := private.my_store_ids();
  if p_posto is not null then
    select k.store_id into v_loja_do_posto from public.kangest_postos k where k.id = p_posto;
  end if;
  return jsonb_build_object(
    'id', r.id, 'nome', r.nome, 'email', r.email, 'cargo', r.cargo,
    'perfil', v_perfil,
    'lojas', to_jsonb(v_lojas),
    'mfa', private.mfa_satisfied(),
    'posto_na_ficha', case
      when p_posto is null or v_loja_do_posto is null or coalesce(array_length(v_lojas, 1), 0) = 0 then null
      else v_loja_do_posto = any (v_lojas)
    end
  );
end;
$$;
comment on function public.kangest_eu(uuid) is
  'O KanGest Livraria, com a sessão da pessoa: o nome, o email, o perfil (GESTOR, CAIXA ou null), o cargo, as lojas, os dois passos e se o posto é da loja da ficha. Nunca ADMIN.';
revoke all on function public.kangest_eu(uuid) from public, anon;
grant execute on function public.kangest_eu(uuid) to authenticated;
