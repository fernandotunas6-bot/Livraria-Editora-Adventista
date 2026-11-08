-- Actualizações instantâneas: sinais em tempo real (Supabase Realtime, «Broadcast from Database»).
--
-- Até aqui tudo era consulta periódica: o painel de 60 em 60 segundos, os alertas da equipa de
-- 20 em 20, o atendimento de 30 em 30, o chat de 15 em 15 e as notificações de minuto a minuto.
-- Agora, quando muda alguma coisa, a base de dados manda um sinal pequeno («mudaram as
-- encomendas») e o site volta a pedir só isso, pelo caminho de sempre — com as mesmas
-- permissões. O sinal não leva dados pessoais: só o tipo do que mudou e um identificador.
--
-- Tópicos (canais privados; quem pode ouvir decide a política em realtime.messages):
--   painel            — a equipa: encomendas, catálogo, alertas e atendimento;
--   conta:<id>        — a própria conta: as suas encomendas, avisos e conversas.
-- E um público:
--   comunidade        — publicações novas (sem dados: só que há novidades).
--
-- Sem o serviço de tempo real (CI, PGlite) ou com ele em baixo, os sinais perdem-se e a escrita
-- segue: o site continua a consultar de tempos a tempos, mais devagar quando está ligado.
--
-- Reverter: drop dos gatilhos *_realtime_signal e das funções private.realtime_*; drop policy
-- "livraria: sinais do painel e da conta" on realtime.messages.

create or replace function private.realtime_signal(p_topic text, p_event text, p_payload jsonb default '{}'::jsonb, p_private boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(coalesce(p_payload, '{}'::jsonb), p_event, p_topic, p_private);
exception when others then
  -- Sem o esquema realtime, ou o serviço em baixo: o sinal perde-se, a escrita não.
  null;
end;
$$;
revoke all on function private.realtime_signal(text, text, jsonb, boolean) from public, anon, authenticated;

-- Encomendas: à equipa e ao cliente da encomenda.
create or replace function private.orders_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'orders', jsonb_build_object('id', new.id));
  if new.customer_id is not null then
    perform private.realtime_signal('conta:' || new.customer_id::text, 'orders', jsonb_build_object('id', new.id));
  end if;
  return null;
end;
$$;
drop trigger if exists orders_realtime_signal on public.orders;
create trigger orders_realtime_signal
  after insert or update on public.orders
  for each row execute function private.orders_realtime_signal();

-- Catálogo: um sinal por instrução (uma edição em massa de 100 produtos é um sinal só).
create or replace function private.catalog_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'catalogo');
  return null;
end;
$$;
drop trigger if exists stock_books_realtime_signal on public.stock_books;
create trigger stock_books_realtime_signal
  after insert or update or delete on public.stock_books
  for each statement execute function private.catalog_realtime_signal();

-- Alertas da equipa (encomendas novas, escaladas, segurança).
create or replace function private.staff_notifications_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('painel', 'alertas');
  return null;
end;
$$;
drop trigger if exists staff_notifications_realtime_signal on public.staff_notifications;
create trigger staff_notifications_realtime_signal
  after insert on public.staff_notifications
  for each statement execute function private.staff_notifications_realtime_signal();

-- Avisos do cliente (o sino do site).
create or replace function private.customer_notifications_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is not null then
    perform private.realtime_signal('conta:' || new.customer_id::text, 'avisos');
  end if;
  return null;
end;
$$;
drop trigger if exists customer_notifications_realtime_signal on public.customer_notifications;
create trigger customer_notifications_realtime_signal
  after insert on public.customer_notifications
  for each row execute function private.customer_notifications_realtime_signal();

-- Atendimento: mensagens novas e mudanças nas conversas (estado, responsável).
create or replace function private.support_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread uuid;
  v_customer uuid;
begin
  if tg_table_name = 'support_messages' then
    v_thread := new.thread_id;
    select t.customer_id into v_customer from public.support_threads t where t.id = v_thread;
  else
    v_thread := new.id;
    v_customer := new.customer_id;
  end if;
  perform private.realtime_signal('painel', 'atendimento', jsonb_build_object('thread', v_thread));
  if v_customer is not null then
    perform private.realtime_signal('conta:' || v_customer::text, 'atendimento', jsonb_build_object('thread', v_thread));
  end if;
  return null;
end;
$$;
drop trigger if exists support_messages_realtime_signal on public.support_messages;
create trigger support_messages_realtime_signal
  after insert on public.support_messages
  for each row execute function private.support_realtime_signal();
drop trigger if exists support_threads_realtime_signal on public.support_threads;
create trigger support_threads_realtime_signal
  after insert or update of status, assigned_to, team_id, priority on public.support_threads
  for each row execute function private.support_realtime_signal();

-- Comunidade: há publicações novas (canal público, sem dados).
create or replace function private.community_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.realtime_signal('comunidade', 'publicacoes', '{}'::jsonb, false);
  return null;
end;
$$;
drop trigger if exists community_posts_realtime_signal on public.community_posts;
create trigger community_posts_realtime_signal
  after insert on public.community_posts
  for each statement execute function private.community_realtime_signal();

revoke all on function private.orders_realtime_signal() from public, anon, authenticated;
revoke all on function private.catalog_realtime_signal() from public, anon, authenticated;
revoke all on function private.staff_notifications_realtime_signal() from public, anon, authenticated;
revoke all on function private.customer_notifications_realtime_signal() from public, anon, authenticated;
revoke all on function private.support_realtime_signal() from public, anon, authenticated;
revoke all on function private.community_realtime_signal() from public, anon, authenticated;

-- Quem ouve os canais privados: a equipa ouve o painel; cada conta ouve só o seu canal.
do $$
begin
  -- Só com o serviço de tempo real (em produção); o Postgres do CI e o PGlite não o têm.
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "livraria: sinais do painel e da conta" on realtime.messages';
    execute $p$
      create policy "livraria: sinais do painel e da conta" on realtime.messages
        for select to authenticated
        using (
          (realtime.topic() = 'painel' and (select private.is_staff()))
          or realtime.topic() = 'conta:' || (select auth.uid())::text
        )
    $p$;
  end if;
end
$$;
