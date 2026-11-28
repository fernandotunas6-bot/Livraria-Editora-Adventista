-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- As fichas dos postos do KanGest na base central (pedido do dono a 27/11: «ligar o KanGest totalmente com o banco de
-- dados e enviar todos os dados»; docs/KANGEST-SINCRONIZACAO.md §22). Os documentos (vendas, compras, recibos, guias), o
-- stock, o catálogo, os fechos, a tesouraria e o livro de stock já vinham; agora vêm também as fichas:
-- - `entidade`: os clientes e os fornecedores. Os dados pessoais (o NIF, os telefones, o email, a morada, a pessoa de
--   contacto e as observações) chegam cifrados pela Edge Function (`pessoais_cifrado`, a mesma chave do NIF dos
--   documentos); em claro ficam o nome, o tipo, a localidade e as condições comerciais;
-- - `artigo`: todos os campos do artigo (a família, os custos, os quatro preços, os mínimos, o stock total);
-- - `utilizador`: as contas do KanGest e as permissões (nunca as senhas, os PIN nem os segredos).
--
-- É a cópia de cada posto: o estado de agora, que o posto manda outra vez quando a ficha muda. Só a equipa com «Gerir
-- configurações» a lê; só o servidor (a service role) escreve.

create table if not exists public.kangest_registos (
  posto_id uuid not null references public.kangest_postos(id) on delete cascade,
  tipo text not null check (tipo in ('entidade', 'artigo', 'utilizador')),
  chave bigint not null check (chave > 0),
  dados jsonb not null default '{}'::jsonb,
  pessoais_cifrado text not null default '',
  recebido_em timestamptz not null default now(),
  primary key (posto_id, tipo, chave)
);
comment on table public.kangest_registos is
  'As fichas de cada posto do KanGest (entidades, artigos completos, utilizadores), o estado de agora; os dados pessoais das entidades cifrados.';
create index if not exists kangest_registos_tipo_idx on public.kangest_registos (tipo, posto_id);
alter table public.kangest_registos enable row level security;
revoke all on public.kangest_registos from public, anon;
grant select on public.kangest_registos to authenticated;
drop policy if exists "kangest_registos: gerir configurações" on public.kangest_registos;
create policy "kangest_registos: gerir configurações" on public.kangest_registos for select to authenticated
  using ((select private.has_permission('manage_settings')));

-- As fichas que o posto manda (a Edge Function já as limpou e cifrou: kangestSinc.ts, `prepararRegistos`):
--   [{"registo": "entidade", "chave": 7, "dados": {...}, "pessoais_cifrado": "…"}]
-- A resposta: {recebidos, erros: [{registo, chave, erro}]}. Uma ficha estragada não leva as outras.
create or replace function public.kangest_registos_receber(p_posto uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  i jsonb;
  v_recebidos integer := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  select estado into v_estado from public.kangest_postos where id = p_posto;
  if v_estado is distinct from 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'As fichas têm de ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'No máximo 200 fichas por volta.' using errcode = '22023';
  end if;
  for i in select value from jsonb_array_elements(p_itens) loop
    begin
      if coalesce(i ->> 'registo', '') not in ('entidade', 'artigo', 'utilizador') then
        raise exception 'Ficha de tipo desconhecido.';
      end if;
      if coalesce(i ->> 'chave', '') !~ '^[1-9][0-9]{0,17}$' then
        raise exception 'Ficha sem número.';
      end if;
      if jsonb_typeof(i -> 'dados') is distinct from 'object' then
        raise exception 'Ficha sem dados.';
      end if;
      insert into public.kangest_registos (posto_id, tipo, chave, dados, pessoais_cifrado, recebido_em)
      values (p_posto, i ->> 'registo', (i ->> 'chave')::bigint, i -> 'dados', coalesce(i ->> 'pessoais_cifrado', ''), now())
      on conflict (posto_id, tipo, chave) do update
        set dados = excluded.dados, pessoais_cifrado = excluded.pessoais_cifrado, recebido_em = now();
      v_recebidos := v_recebidos + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'registo', i -> 'registo', 'chave', i -> 'chave', 'erro', left(sqlerrm, 300)));
    end;
  end loop;
  update public.kangest_postos set ultima_sinc = now() where id = p_posto;
  return jsonb_build_object('recebidos', v_recebidos, 'erros', v_erros);
end;
$$;
revoke all on function public.kangest_registos_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_registos_receber(uuid, jsonb) to service_role;
