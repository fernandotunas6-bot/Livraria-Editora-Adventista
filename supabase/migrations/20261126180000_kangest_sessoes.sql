-- KANGEST ONE, fase A3: as sessões abertas em cada KanGest, para o painel as ver e terminar.
--
-- O KanGest manda-as em cada volta da sincronização (dentro do envelope assinado e cifrado; sinc/sessoes.rs): quem
-- entrou, com que perfil, em que aparelho e desde quando. **Nunca tokens nem senhas:** cada sessão vem com uma chave
-- de 16 letras tirada do aparelho, da pessoa e da hora de entrada.
--
-- - A entrada com o ADMIN local de recurso (o perfil Administrador sem conta do site) fica no registo de segurança e
--   avisa os administradores (private.audit_write, com alerta).
-- - O painel pede o fim de uma sessão (`kangest_sessao_revogar`, com «Gerir configurações» na Edge Function). A volta
--   seguinte devolve-a ao KanGest em `sessoes_revogar`, e ele termina-a. Quando deixa de vir, fica `revogada`.
-- - Só o servidor lê e escreve (como `kangest_postos`). Um mês de histórico por posto.

create table if not exists public.kangest_sessoes (
  posto_id uuid not null references public.kangest_postos (id) on delete cascade,
  sessao text not null check (sessao ~ '^[0-9a-f]{16}$'),
  nome text not null default '' check (char_length(nome) <= 80),
  login text not null default '' check (char_length(login) <= 120),
  perfil text not null default '' check (char_length(perfil) <= 40),
  conta_site boolean not null default false,
  recurso boolean not null default false,
  aparelho text not null default '' check (char_length(aparelho) <= 80),
  local text not null default '' check (char_length(local) <= 80),
  pela_internet boolean not null default false,
  offline boolean not null default false,
  inicio timestamptz,
  visto_em timestamptz not null default now(),
  fim timestamptz,
  motivo text check (motivo in ('terminou', 'revogada')),
  revogar_em timestamptz,
  revogada_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (posto_id, sessao)
);
comment on table public.kangest_sessoes is
  'Sessões abertas em cada KanGest Livraria (KANGEST ONE, fase A3), sem tokens. Só o servidor lê e escreve; o painel '
  'vê-as e termina-as pela Edge Function (manage_settings).';
create index if not exists kangest_sessoes_abertas_idx on public.kangest_sessoes (posto_id) where fim is null;
create index if not exists kangest_sessoes_revogada_por_idx on public.kangest_sessoes (revogada_por);
alter table public.kangest_sessoes enable row level security;
revoke all on public.kangest_sessoes from public, anon, authenticated;

-- As sessões que o posto mandou nesta volta. Devolve as chaves das que o painel pediu para terminar (a resposta leva-as
-- em `sessoes_revogar`). Um KanGest antigo, que não manda a lista, não mexe em nada (null).
create or replace function public.kangest_sessoes_receber(p_posto uuid, p_sessoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_ids text[] := '{}';
  v_novo boolean;
  v_posto text;
begin
  if p_sessoes is null or jsonb_typeof(p_sessoes) <> 'array' then
    return null;
  end if;
  select k.nome into v_posto from public.kangest_postos k where k.id = p_posto and k.estado = 'activo';
  if v_posto is null then
    raise exception 'Este posto não está ligado.';
  end if;
  for r in
    select x.* from jsonb_to_recordset(p_sessoes) as x(
      id text, nome text, login text, perfil text, conta_site boolean, recurso boolean, aparelho text, local text,
      pela_internet boolean, offline boolean, inicio timestamptz)
    limit 100
  loop
    continue when r.id is null or r.id !~ '^[0-9a-f]{16}$' or r.id = any (v_ids);
    v_ids := v_ids || r.id;
    insert into public.kangest_sessoes as s
      (posto_id, sessao, nome, login, perfil, conta_site, recurso, aparelho, local, pela_internet, offline, inicio)
    values
      (p_posto, r.id, left(coalesce(r.nome, ''), 80), left(coalesce(r.login, ''), 120), left(coalesce(r.perfil, ''), 40),
       coalesce(r.conta_site, false), coalesce(r.recurso, false), left(coalesce(r.aparelho, ''), 80),
       left(coalesce(r.local, ''), 80), coalesce(r.pela_internet, false), coalesce(r.offline, false), r.inicio)
    on conflict (posto_id, sessao) do update
      set visto_em = now(), nome = excluded.nome, login = excluded.login, perfil = excluded.perfil,
          conta_site = excluded.conta_site, recurso = excluded.recurso, aparelho = excluded.aparelho,
          local = excluded.local, pela_internet = excluded.pela_internet, offline = excluded.offline,
          fim = null, motivo = null
    returning (xmax = 0) into v_novo;
    -- cada entrada do ADMIN de recurso: no registo de segurança, com aviso aos administradores
    if v_novo and coalesce(r.recurso, false) then
      perform private.audit_write(
        'kangest_sessoes', p_posto::text || ':' || r.id, 'insert',
        'Entrada com o ADMIN local de recurso no KanGest «' || v_posto || '»'
          || case when coalesce(btrim(r.aparelho), '') <> '' then ' (' || left(btrim(r.aparelho), 80) || ')' else '' end,
        jsonb_build_object('login', left(coalesce(r.login, ''), 120)),
        true);
    end if;
  end loop;
  -- as que deixaram de vir terminaram: a pessoa saiu, o programa fechou ou o painel pediu
  update public.kangest_sessoes s
     set fim = now(), motivo = case when s.revogar_em is not null then 'revogada' else 'terminou' end
   where s.posto_id = p_posto and s.fim is null and not (s.sessao = any (v_ids));
  delete from public.kangest_sessoes s where s.posto_id = p_posto and s.fim < now() - interval '30 days';
  return coalesce(
    (select jsonb_agg(s.sessao order by s.sessao) from public.kangest_sessoes s
      where s.posto_id = p_posto and s.fim is null and s.revogar_em is not null),
    '[]'::jsonb);
end;
$$;
revoke all on function public.kangest_sessoes_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_sessoes_receber(uuid, jsonb) to service_role;

-- O painel pede o fim de uma sessão aberta. Fica no registo de segurança (quem pediu vem no x-actor-id).
create or replace function public.kangest_sessao_revogar(p_posto uuid, p_sessao text, p_por uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.kangest_sessoes;
  v_posto text;
begin
  update public.kangest_sessoes s
     set revogar_em = coalesce(s.revogar_em, now()), revogada_por = coalesce(s.revogada_por, p_por)
   where s.posto_id = p_posto and s.sessao = p_sessao and s.fim is null
  returning s.* into v;
  if v.sessao is null then
    raise exception 'Esta sessão já terminou.';
  end if;
  select k.nome into v_posto from public.kangest_postos k where k.id = p_posto;
  perform private.audit_write(
    'kangest_sessoes', p_posto::text || ':' || p_sessao, 'update',
    'Sessão do KanGest terminada no painel: ' || coalesce(nullif(v.nome, ''), v.login) || ' em «' || coalesce(v_posto, '') || '»',
    jsonb_build_object('login', v.login, 'perfil', v.perfil),
    false);
  return jsonb_build_object('sessao', v.sessao, 'revogar_em', v.revogar_em);
end;
$$;
revoke all on function public.kangest_sessao_revogar(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.kangest_sessao_revogar(uuid, text, uuid) to service_role;
