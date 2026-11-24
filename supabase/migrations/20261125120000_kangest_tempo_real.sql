-- Tempo real para o KanGest Livraria (docs/KANGEST-SINCRONIZACAO.md §9): quando muda uma encomenda da loja de um
-- posto, a base manda um sinal pelo Realtime (Broadcast from Database, como os sinais do painel em
-- 20261108132000_sinais_em_tempo_real) e o KanGest vai logo buscar as novidades pelo canal assinado e cifrado.
--
-- O sinal não leva dados: só «há novidades» (evento `novidades`, carga vazia). Vai num tópico público com um nome
-- secreto ao acaso de cada posto (`kangest:<topico>`), que o posto recebe no emparelhamento e na resposta selada da
-- sincronização; muda a cada emparelhamento e apaga-se ao revogar. Sem o tópico, ninguém sabe quando a loja tem
-- encomendas.
--
-- Sem o serviço de tempo real (CI, PGlite) ou com ele em baixo, o sinal perde-se e a escrita segue
-- (private.realtime_signal); o KanGest continua a perguntar de 2 em 2 minutos.

alter table public.kangest_postos add column if not exists topico text;

-- Emparelhar dá um tópico novo (122 bits ao acaso, do gen_random_uuid)
create or replace function public.kangest_emparelhar(p_codigo_resumo text, p_chave_publica text, p_versao text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    if length(decode(coalesce(p_chave_publica, ''), 'base64')) <> 32 then
      raise exception 'tamanho';
    end if;
  exception when others then
    raise exception 'A chave do posto não é uma chave Ed25519 válida.' using errcode = '22023';
  end;
  update public.kangest_postos
     set estado = 'activo', chave_publica = p_chave_publica, codigo_resumo = null, codigo_expira = null,
         emparelhado_em = now(), versao_programa = left(coalesce(p_versao, ''), 40), ultimo_erro = '',
         topico = replace(gen_random_uuid()::text, '-', '')
   where codigo_resumo = p_codigo_resumo and estado = 'por_emparelhar' and codigo_expira > now()
  returning id, nome, store_id, topico into r;
  if r.id is null then
    raise exception 'Código inválido ou fora de prazo: peça outro no painel.' using errcode = '22023';
  end if;
  return jsonb_build_object('id', r.id, 'nome', r.nome, 'store_id', r.store_id, 'topico', r.topico,
                            'loja', (select s.name from public.physical_stores s where s.id = r.store_id));
end;
$$;

create or replace function public.kangest_posto_novo_codigo(p_id uuid, p_codigo_resumo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kangest_postos
     set estado = 'por_emparelhar', chave_publica = null, codigo_resumo = p_codigo_resumo,
         codigo_expira = now() + interval '10 minutes', revogado_em = null, topico = null
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
end;
$$;

create or replace function public.kangest_posto_revogar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kangest_postos
     set estado = 'revogado', chave_publica = null, codigo_resumo = null, codigo_expira = null, revogado_em = now(), topico = null
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
end;
$$;

-- O sinal: aos postos activos da loja da encomenda (e da loja de antes, se mudou de loja)
create or replace function private.kangest_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  for p in
    select k.topico
      from public.kangest_postos k
     where k.estado = 'activo' and k.topico is not null and k.store_id is not null
       and (k.store_id = new.store_id or (tg_op = 'UPDATE' and k.store_id = old.store_id))
  loop
    perform private.realtime_signal('kangest:' || p.topico, 'novidades', '{}'::jsonb, false);
  end loop;
  return null;
end;
$$;
revoke all on function private.kangest_realtime_signal() from public, anon, authenticated;

drop trigger if exists orders_kangest_realtime_signal on public.orders;
create trigger orders_kangest_realtime_signal
  after insert or update on public.orders
  for each row execute function private.kangest_realtime_signal();
