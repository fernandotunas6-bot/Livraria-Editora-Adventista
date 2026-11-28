-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O mesmo perfil no site e no KanGest (pedido do dono a 27/11: «todo o utilizador da livraria, ao fazer login com o
-- Google, deve partilhar as mesmas permissões: se é admin no site, também é admin no KanGest; se for gestor no site,
-- também gestor no KanGest; os mesmos dados»). Vale para todas as entradas com a conta do site (a senha, o Google e a
-- sessão do site), que passam todas por aqui:
-- - **o administrador do site** entra como Administrador (até aqui, Gestor; o ADMIN local de recurso continua);
-- - **o gestor do site** entra como Gestor, mesmo sem as permissões do KanGest (até aqui, sem elas não entrava);
-- - **a opção manual:** quem tem só «KanGest: caixa» entra como Caixa, e só nos postos da loja da ficha;
-- - **um cliente** nunca entra.
-- E os mesmos dados: o nome, o email e agora o telefone do perfil do site.

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
  select p.id, p.role, coalesce(nullif(btrim(p.name), ''), u.email) as nome, u.email, nullif(btrim(coalesce(p.phone, '')), '') as telefone,
         sr.name as cargo
    into r
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.staff_roles sr on sr.id = p.staff_role_id
   where p.id = v_uid;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  -- o mesmo papel do site (pedido do dono a 27/11): o administrador é Administrador; o gestor é Gestor, a não ser que
  -- tenha só «KanGest: caixa» (a opção manual para o limitar à caixa)
  v_perfil := case
    when r.role = 'admin' then 'ADMIN'
    when private.has_permission('kangest_gestor') then 'GESTOR'
    when private.has_permission('kangest_caixa') then 'CAIXA'
    when r.role = 'manager' then 'GESTOR'
  end;
  v_lojas := private.my_store_ids();
  if p_posto is not null then
    select k.store_id into v_loja_do_posto from public.kangest_postos k where k.id = p_posto;
  end if;
  return jsonb_build_object(
    'id', r.id, 'nome', r.nome, 'email', r.email, 'telefone', r.telefone, 'cargo', r.cargo,
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
  'O KanGest Livraria, com a sessão da pessoa: o nome, o email, o telefone, o perfil (o mesmo papel do site: ADMIN, GESTOR, CAIXA com só «KanGest: caixa», ou null), o cargo, as lojas, os dois passos e se o posto é da loja da ficha.';
revoke all on function public.kangest_eu(uuid) from public, anon;
grant execute on function public.kangest_eu(uuid) to authenticated;
