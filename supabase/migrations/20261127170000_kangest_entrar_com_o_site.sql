-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- «Entrar com o site» no KanGest (pedido do dono a 27/11: «o login deve funcionar para os dois»). Quem já tem a sessão
-- aberta no site entra no KanGest sem escrever a senha:
-- 1. o KanGest gera um verificador PKCE e um estado (só em memória) e abre /kangest/entrar-com-o-site no navegador;
-- 2. a página, com a sessão da pessoa e depois de ela confirmar, pede um código de uso único preso ao desafio do
--    KanGest (`kangest_entrada_criar`, pela Edge Function), e devolve-o pela ligação kangest://auth;
-- 3. o KanGest troca o código com o verificador (`kangest_entrada_usar`): só uma vez, nos dois minutos seguintes, e só
--    se o verificador bater com o desafio. A Edge Function dá então um link de entrada para a conta, que o KanGest
--    troca por uma sessão própria (os dois passos pedem-se no KanGest, como na entrada com a senha).
-- Aqui só fica o resumo SHA-256 do código, nunca o código.

create table if not exists private.kangest_entradas (
  codigo_resumo text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  desafio text not null,
  estado text not null,
  expira timestamptz not null,
  criado timestamptz not null default now()
);
comment on table private.kangest_entradas is
  'Os códigos de uso único de «Entrar com o site» no KanGest (só o resumo SHA-256), presos ao desafio PKCE do KanGest; dois minutos.';
alter table private.kangest_entradas enable row level security;
revoke all on private.kangest_entradas from public, anon, authenticated;

create or replace function public.kangest_entrada_criar(p_user uuid, p_codigo_resumo text, p_desafio text, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or coalesce(p_codigo_resumo, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_desafio, '') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(p_estado, '') !~ '^[A-Za-z0-9_-]{20,64}$' then
    raise exception 'Pedido de entrada inválido.' using errcode = '22023';
  end if;
  -- os antigos (passado o prazo) saem: a tabela nunca cresce
  delete from private.kangest_entradas where expira < now();
  insert into private.kangest_entradas (codigo_resumo, user_id, desafio, estado, expira)
  values (p_codigo_resumo, p_user, p_desafio, p_estado, now() + interval '2 minutes');
end;
$$;
revoke all on function public.kangest_entrada_criar(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.kangest_entrada_criar(uuid, text, text, text) to service_role;

-- Gasta o código: devolve a conta, o desafio e o estado uma vez só, e só dentro do prazo. Um código que não existe ou
-- que passou o prazo dá `null` (sem erro, para o `delete` ficar: o código sai sempre na primeira tentativa).
create or replace function public.kangest_entrada_usar(p_codigo_resumo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  delete from private.kangest_entradas where codigo_resumo = coalesce(p_codigo_resumo, '') returning * into r;
  if r.codigo_resumo is null or r.expira < now() then
    return null;
  end if;
  return jsonb_build_object('user_id', r.user_id, 'desafio', r.desafio, 'estado', r.estado);
end;
$$;
revoke all on function public.kangest_entrada_usar(text) from public, anon, authenticated;
grant execute on function public.kangest_entrada_usar(text) to service_role;
